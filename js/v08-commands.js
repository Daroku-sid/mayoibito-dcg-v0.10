/* =====================================================================
   v08-commands.js ― コマンド層（総合仕様書 22.2）
   ---------------------------------------------------------------------
   「UI はゲーム状態を直接書き換えず、コマンドを通す」ための層です。
   新しい対戦画面からの操作は、必ずここを通ります。

   ★中で何をしているか
     Stage 0 の調査で、効果の解決・演出・ログ・チュートリアルの許可判定は
     preview.js の中で完成していることが分かりました。
     そこを作り直すと 0.1「v0.7 で正常動作しているものを壊さない」に反します。

     なので、このコマンド層は preview.js が用意した入口へ渡します。
       window.__v8PlayCard / __v8EndTurn / __v8CanOperate
     preview.js 側は既存の関数を呼ぶだけで、新しい状態変更を持ちません。

     Stage 4 で効果の表示を新しい画面へ移したあと、この層の中身を
     Game への直接呼び出しへ差し替えます。★呼ぶ側は変わりません。

   ★このファイル自身は Game.state を書き換えません（読むだけ）。
   ===================================================================== */

'use strict';

const V8Cmd = {

  /** いま操作を受け付けてよいか（演出中・効果解決中は false） */
  canOperate: function () {
    if (typeof window === 'undefined' || !window.__v8CanOperate) return false;
    return !!window.__v8CanOperate();
  },

  /* =============================================================
     置けるかどうか（読むだけ）
     -------------------------------------------------------------
     @param {object} card  手札のカード（V8State.cardOf の形）
     @param {string} dest  'unit' / 'event' / 'equip'
     @param {string} targetUid  equip のとき、付ける相手
     @return {{ok:boolean, reason:string}}
     ============================================================= */
  canPlay: function (card, dest, targetUid) {
    if (!card) return { ok: false, reason: '' };
    if (typeof Game === 'undefined' || !Game.state) return { ok: false, reason: '' };
    if (!this.canOperate()) return { ok: false, reason: 'いまは操作できません。' };
    /* ★追跡フェイズへ入ったらメインへは戻れません（6.11）。
       手札の確認はできますが、カードは使えません。 */
    if (typeof window !== 'undefined' && window.__v8Phase &&
      window.__v8Phase() !== 'main') {
      return { ok: false, reason: '追跡フェイズではカードを使えません。' };
    }

    const inst = this._instOf(card.uid);
    if (!inst) return { ok: false, reason: '' };

    const side = Game.state.currentSide;
    const master = inst.master || (typeof CARD_MASTER !== 'undefined' ? CARD_MASTER[card.cardId] : null);
    if (!master) return { ok: false, reason: '' };

    /* 置き先とカードの種類が合っているか */
    const kind = this.destOf(master);
    if (kind !== dest) return { ok: false, reason: 'ここにはカードを置けません' };

    /* 本物の判定を使う（読むだけ） */
    const res = Game.canPlay ? Game.canPlay(side, inst) : null;
    if (res && res.ok === false) {
      return { ok: false, reason: (res.reasons && res.reasons[0]) || 'このカードは現在使用できません' };
    }

    /* グッズは装備先を見る。
       ★targetUid が無いときは「付けられる相手が1人でもいるか」を見ます。
         手札に並べた時点では、まだ誰に付けるか決まっていないためです。
         ここを「uid が一致するか」で見ていたので、グッズが常に
         「出せないカード」になっていました。 */
    if (dest === 'equip') {
      const targets = (Game.getGoodsTargets ? Game.getGoodsTargets(side, inst) : []) || [];
      if (targetUid !== null && targetUid !== undefined && targetUid !== '') {
        /* ★uid は数値です。要素の data-uid から読むと文字列になるので、
           そのまま === で比べると必ず外れます。文字列にそろえて比べます。 */
        const key = String(targetUid);
        const hit = targets.some(function (t) { return String(t.uid) === key; });
        if (!hit) return { ok: false, reason: 'ここにはカードを置けません' };
      } else if (targets.length === 0) {
        return { ok: false, reason: 'このカードを付けられる相手がいません。' };
      }
    }
    return { ok: true, reason: '' };
  },

  /** カードの種類から、置き先の名前を出す */
  destOf: function (master) {
    if (!master) return null;
    if (master.type === 'goods') return 'equip';
    if (master.type === 'event') return 'event';
    return 'unit';   // human / youkai
  },

  /* =============================================================
     ★グッズを付けられる相手（読むだけ）
     -------------------------------------------------------------
     誰に付けられるかを決めるのは既存の Game.getGoodsTargets です。
     ここではそれを呼んで返すだけで、条件を作り直していません。
     ============================================================= */
  goodsTargets: function (card) {
    if (!card) return [];
    if (typeof Game === 'undefined' || !Game.state || !Game.getGoodsTargets) return [];
    const inst = this._instOf(card.uid);
    if (!inst) return [];
    return Game.getGoodsTargets(Game.state.currentSide, inst) || [];
  },

  /* =============================================================
     カードを出す（総合仕様書 5.4：成功したらその時点で使用が確定）
     ============================================================= */
  requestPlayCard: function (card, dest, targetUid) {
    const judge = this.canPlay(card, dest, targetUid);
    if (!judge.ok) return judge;
    if (typeof window === 'undefined' || !window.__v8PlayCard) {
      return { ok: false, reason: '' };
    }
    const done = window.__v8PlayCard(card.uid, dest, targetUid);
    return { ok: !!done, reason: done ? '' : '' };
  },

  /** ターンを終える（メイン終了／ターン終了） */
  requestEndTurn: function () {
    if (!this.canOperate()) return { ok: false, reason: 'いまは操作できません。' };
    if (typeof window === 'undefined' || !window.__v8EndTurn) return { ok: false, reason: '' };
    return { ok: !!window.__v8EndTurn(), reason: '' };
  },

  /* =============================================================
     ★Stage 3 以降で中身を入れるもの（入口だけ先に置く）
     呼ぶ側を先に固めておくと、あとで差し替えても影響が出ません。
     ============================================================= */
  requestSetProvisionalTracking: function () { return { ok: false, reason: '' }; },
  requestConfirmTracking: function () { return { ok: false, reason: '' }; },
  requestEndTurnWithoutTracking: function () { return { ok: false, reason: '' }; },
  requestSelectTarget: function () { return { ok: false, reason: '' }; },
  requestConfirmTargets: function () { return { ok: false, reason: '' }; },

  /** uid から場・手札のインスタンスを探す（読むだけ） */
  _instOf: function (uid) {
    if (typeof Game === 'undefined' || !Game.state) return null;
    const st = Game.state;
    let found = null;
    ['village', 'mansion'].forEach(function (sd) {
      const p = st.players[sd];
      if (!p) return;
      ['hand', 'humans', 'youkai'].forEach(function (zone) {
        (p[zone] || []).forEach(function (c) { if (c.uid === uid) found = c; });
      });
    });
    return found;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Cmd: V8Cmd };
}
