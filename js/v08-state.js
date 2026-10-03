/* =====================================================================
   v08-state.js ― ゲーム状態を「見せるための形」へ写す（Stage 2）
   ---------------------------------------------------------------------
   仕様書 22.3：ゲーム状態と表示状態を分ける。

   ★このファイルはゲーム状態を読むだけです。書き換えは一切しません。
     操作（カードを使う・追跡を決めるなど）は、Stage 2 の後半で作る
     コマンド層（v08-commands.js）が受け持ちます。

   Stage 0 の調査で分かったとおり、既存の UI も Game.state へ
   一度も代入していません。その形をそのまま引き継ぎます。

   読むもの:
     Game.state.players[side] … deck / hand / trash / lost / humans /
                                youkai / field / energy
     Game.state.tracking[side] … { youkai, human }
     Game.getStats(inst)       … 現在値と印刷値
   ===================================================================== */

'use strict';

const V8State = {

  /** 対戦が動いているか（Game が読み込まれ、状態がある） */
  isLive: function () {
    return (typeof Game !== 'undefined') && !!Game.state && !!Game.state.players;
  },

  /* =============================================================
     画面の下に置く陣営
     -------------------------------------------------------------
     既存 preview.js の bottomSide() と同じ考え方にそろえます。
       ・CPU対戦では自分の陣営を常に下に固定する（v0.3 の決定）
       ・それ以外はいま手番の側を下にする（1台で交互に操作するため）

     ★方針②（ターン交代の暗転）はここに直結します。
       CPU対戦は盤面が上下に入れ替わらないので暗転が要りません。
       ひとりまわしは入れ替わるので、端末を渡すあいだ隠す必要があります。
     ============================================================= */
  bottomSide: function () {
    if (!this.isLive()) return 'village';
    const st = Game.state;
    if (typeof match !== 'undefined' && match && match.mode === 'cpu' && match.humanSide) {
      return match.humanSide;
    }
    return st.currentSide || st.firstSide || 'village';
  },

  topSide: function () {
    return (this.bottomSide() === 'village') ? 'mansion' : 'village';
  },

  /** 1台の端末で人が交互に操作しているか（＝ターン交代で隠す必要がある） */
  isPassAndPlay: function () {
    if (typeof match === 'undefined' || !match) return false;
    return match.mode !== 'cpu';
  },

  /* =============================================================
     カード1枚を表示用の形へ
     ============================================================= */
  cardOf: function (inst) {
    if (!inst) return null;
    const master = (typeof CARD_MASTER !== 'undefined') ? CARD_MASTER[inst.cardId] : null;

    const out = {
      cardId: inst.cardId,
      uid: inst.uid,
      side: inst.owner,
      name: master ? master.name : '',
      cost: master ? master.cost : null,
    };

    /* 現在値と印刷値。両方あると「補正で上下している」ことを色で示せる（4.3） */
    if (typeof Game !== 'undefined' && Game.getStats) {
      const s = Game.getStats(inst);
      if (s && s.hasStats) {
        out.speed = Math.max(0, s.curSpeed);
        out.hp = Math.max(0, s.curHp);
        out.baseSpeed = s.baseSpeed;
        out.baseHp = s.baseHp;
      }
    }

    /* 装備しているグッズ（表示に添える。Stage 2 後半で見せ方を作る） */
    if (inst.equippedGoods) {
      out.goods = {
        cardId: inst.equippedGoods.cardId,
        uid: inst.equippedGoods.uid,
        name: (typeof CARD_MASTER !== 'undefined' && CARD_MASTER[inst.equippedGoods.cardId])
          ? CARD_MASTER[inst.equippedGoods.cardId].name : '',
      };
    }
    return out;
  },

  /* =============================================================
     片側ぶんのビューモデル
     ============================================================= */
  playerOf: function (side, tracks) {
    const st = Game.state;
    const p = st.players[side];
    if (!p) return null;
    const self = this;

    /* 自分の怪異 → 相手の人間 の組 */
    const myTrack = tracks[side];
    /* 相手の怪異 → 自分の人間 の組（自分の人間がここに入る） */
    const otherSide = (side === 'village') ? 'mansion' : 'village';
    const theirTrack = tracks[otherSide];

    /* 通常列には追跡に関わっているカードを含めない（10.1） */
    /* ★v0.10：【二重追跡】では追跡されている人間が2人いる。ex は1枚でも配列でもよい */
    const pickVisible = function (list, ex) {
      const exs = Array.isArray(ex) ? ex : [ex];
      return (list || []).filter(function (c) { return exs.indexOf(c) === -1; }).map(function (c) {
        return self.cardOf(c);
      });
    };
    const trackedHumans = (theirTrack && (theirTrack.humans || (theirTrack.human ? [theirTrack.human] : []))) || [];

    const lostMax = (p.field && p.field.master && p.field.master.lostLimit !== undefined)
      ? p.field.master.lostLimit : '-';

    /* ★ドロー演出の最中は「増える前の手札」を映します（Stage 6-4）。
       そうしないと、光が飛んでくるより先に手札が増えてしまい、
       「着いてから増える」という見え方になりません。
       控えが無いふだんは null が返るので、そのまま Game.state を映します。 */
    let handList = p.hand || [];
    if (typeof window !== 'undefined' && window.__v8HandSnapshot) {
      const snap = window.__v8HandSnapshot(side);
      if (snap) handList = snap;
    }

    return {
      side: side,
      fieldId: p.field ? p.field.cardId : null,
      deck: p.deck ? p.deck.length : 0,
      trash: p.trash ? p.trash.length : 0,
      lost: p.lost ? p.lost.length : 0,
      lostMax: lostMax,
      vigor: p.energy,
      hand: handList.length,
      handCards: handList.map(function (c) { return self.cardOf(c); }),

      normalHuman: pickVisible(p.humans, trackedHumans),
      normalYoukai: pickVisible(p.youkai, myTrack && myTrack.youkai),

      /* 追跡している自分の怪異と、追跡されている自分の人間 */
      trackYoukai: (myTrack && myTrack.youkai) ? [self.cardOf(myTrack.youkai)] : [],
      trackHuman: trackedHumans.map(function (h) { return self.cardOf(h); }),

      /* ★v0.10：除外ゾーンの枚数と、物音（彫刻公園）。物音は今の量と累計 */
      exile: p.exile ? p.exile.length : 0,
      noise: p.noise ? p.noise.current : 0,
      noiseTotal: p.noise ? p.noise.gained : 0,
      noiseOn: !!(p.noise && (p.noise.gained > 0 || (p.field && p.field.cardId === 'FIELD-CHOKOKU'))),
    };
  },

  /* =============================================================
     いまの状態を丸ごとビューモデルへ
     -------------------------------------------------------------
     @return {object|null} { self, opp, meta } 。対戦していなければ null
     ============================================================= */
  build: function () {
    if (!this.isLive()) return null;
    const st = Game.state;
    const tracks = st.tracking || {};
    const me = this.bottomSide();
    const op = this.topSide();

    return {
      self: this.playerOf(me, tracks),
      opp: this.playerOf(op, tracks),
      meta: {
        turnCount: st.turnCount,
        currentSide: st.currentSide,
        phase: st.phase,
        gameOver: !!st.gameOver,
        meSide: me,
        /* いま手番なのが画面下の人か（表示の出し分けに使う） */
        myTurn: st.currentSide === me,
        passAndPlay: this.isPassAndPlay(),
      },
    };
  },

  /* =============================================================
     変わったかどうかの目印
     -------------------------------------------------------------
     画面を描き直す必要があるかを安く判定するための短い文字列。
     ゲーム状態は触らずに、枚数と uid の並びだけを見ます。
     ============================================================= */
  signature: function (view) {
    if (!view) return '';
    const one = function (p) {
      if (!p) return '-';
      const ids = function (list) {
        return (list || []).map(function (c) {
          return c.uid + ':' + c.speed + '/' + c.hp;
        }).join(',');
      };
      return [p.deck, p.trash, p.lost, p.vigor, p.hand,
        ids(p.normalHuman), ids(p.normalYoukai),
        ids(p.trackHuman), ids(p.trackYoukai)].join('|');
    };
    return one(view.self) + '#' + one(view.opp) + '#' +
      (view.meta ? (view.meta.turnCount + '/' + view.meta.phase + '/' + view.meta.meSide) : '');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8State: V8State };
}
