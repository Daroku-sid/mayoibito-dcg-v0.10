/* =====================================================================
   v08-mulligan.js ― 両者同時マリガン（Stage 5-1）
   ---------------------------------------------------------------------
   仕様書 第15部。

   流れ:
     初期手札5枚を拡大手札で見せる（手札以外は暗くする）
       ↓ 短いタップで選択／解除（番号は付けない・クイック表示は出さない）
       ↓ 長押しで固定式カード詳細
     「交換を確定」→ 0枚なら確認
       ↓ 自分の交換をすぐ実行し、交換後の手札を見せる
       ↓「相手のマリガンを待っています」
     両者そろったら「相手は2枚交換しました」を約1秒
       ↓ 暗転を解除して第1ターンへ

   ★中で解く順番は「先攻 → 後攻」のまま固定です（方針③）。
     見た目だけが同時で、同じ種なら同じ結果になります。
   ★ルール（交換のしかた・再シャッフル）は既存のままです。
   ===================================================================== */

'use strict';

const V8Mulligan = {

  /** マリガン中か */
  active: false,

  /** 交換するカードの uid */
  chosen: [],

  /** 自分の確定が済んだか（15.4） */
  waiting: false,

  _root: null,
  _cards: [],

  /* 相手を待っているように見せる最短の時間（CPUは即答なので） */
  WAIT_MS: 700,
  /* 相手の交換枚数を見せる時間（15.5：約1秒） */
  REVEAL_MS: 1100,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;
    const btn = rootEl.querySelector('#v8-mull-confirm');
    if (btn) btn.onclick = function () { self.onConfirm(); };
    return this;
  },

  /* =============================================================
     始める
     ============================================================= */
  /**
   * @param {string} [label] 席の呼び名。人が2人いるとき（ひとり回し）だけ渡します。
   *   ★誰の番かを出さないと、1台で交代するときに取り違えます。
   */
  start: function (label) {
    if (!this._root) return;
    this.active = true;
    this.waiting = false;
    this.chosen = [];
    this._cards = (typeof window !== 'undefined' && window.__v8MulliganHand)
      ? window.__v8MulliganHand() : [];
    this._root.classList.add('v8-mull-on');
    this._say(label ? (label + '：入れ替える手札を選んでください')
      : '入れ替える手札を選んでください');
    this.render();
  },

  finish: function () {
    this.active = false;
    this.waiting = false;
    this.chosen = [];
    if (this._root) this._root.classList.remove('v8-mull-on');
  },

  /* =============================================================
     手札を並べる
     -------------------------------------------------------------
     ★通常の拡大手札と同じ見せ方を使います（15.2）。
       置き場所の決め方も V8Hand と同じにして、見た目をそろえます。
     ============================================================= */
  render: function () {
    if (!this._root || !this.active) return;
    const area = this._root.querySelector('#v8-mull-hand');
    if (!area) return;
    area.innerHTML = '';

    const doc = document;
    const self = this;
    const n = this._cards.length;
    if (!n) return;

    /* ★並べ方は拡大手札とまったく同じものを使います（2026-08-01）。
       別々に計算していると、交換で札が帰るときに位置がずれて見えます。 */
    const lay = V8Hand.bigLayout(n);

    this._cards.forEach(function (c, i) {
      const el = V8Board.makeCard(doc, c);
      el.classList.add('v8-mull__card');
      el.style.left = V8Board.u(lay.left0 + lay.step * i);
      el.style.top = V8Board.u(lay.top);
      V8Board.setCardWidth(el, V8Board.u(lay.cw));
      el.style.zIndex = String(10 + i);
      el.setAttribute('data-uid', String(c.uid));

      /* 選んでいるカードは枠で示す。★番号は付けません（15.1） */
      if (self.chosen.indexOf(String(c.uid)) >= 0) el.classList.add('v8-card--picked');

      if (!self.waiting && typeof V8Input !== 'undefined') {
        V8Input.attach(el, {
          /* ★短いタップは選択／解除だけ。クイック表示は出しません（15.1） */
          onTap: function () { self.toggle(c.uid); },
          onLongPress: function () {
            if (typeof V8Detail !== 'undefined') V8Detail.open(c.uid);
          },
        });
      }
      area.appendChild(el);
    });
    this._syncButton();
  },

  toggle: function (uid) {
    if (this.waiting) return;      // 確定後は選び直せない（15.1）

    /* ★チュートリアル中は、台本が指した札だけを選べます（v0.9）。
       チュートリアル以外では、いつでも true が返ります。 */
    if (typeof window !== 'undefined' && window.__v8MulliganAllowSelect &&
        !window.__v8MulliganAllowSelect(uid)) return;

    const key = String(uid);
    const at = this.chosen.indexOf(key);
    if (at >= 0) this.chosen.splice(at, 1);
    else this.chosen.push(key);
    this.render();

    /* ★いま選んでいる札を台本へ伝えます。
       ★伝えないと、指定の2枚をそろえても台本が進まず、
         同じ指示が出続けて先へ行けなくなります。 */
    if (typeof window !== 'undefined' && window.__v8MulliganNotifySelected) {
      window.__v8MulliganNotifySelected(this.chosen.slice());
    }
  },

  _syncButton: function () {
    if (!this._root) return;
    const btn = this._root.querySelector('#v8-mull-confirm');
    if (!btn) return;
    btn.style.display = this.waiting ? 'none' : 'block';
    btn.textContent = this.chosen.length
      ? ('交換を確定　' + this.chosen.length + '枚') : '交換しない';
  },

  _say: function (text) {
    const el = this._root && this._root.querySelector('#v8-mull-say');
    if (el) el.textContent = text;
  },

  /* =============================================================
     確定する
     ============================================================= */
  onConfirm: function () {
    if (!this.active || this.waiting) return;

    /* ★チュートリアル中は、台本がそこまで進んでいるときだけ押せます */
    if (typeof window !== 'undefined' && window.__v8MulliganAllowConfirm &&
        !window.__v8MulliganAllowConfirm()) return;

    /* ★0枚のときは確認します（15.1） */
    if (this.chosen.length === 0) {
      const self = this;
      const ok = (typeof V8Battle !== 'undefined') && V8Battle.dialog({
        message: '交換するカードが選ばれていません。\n0枚のままマリガンを終了しますか？',
        buttons: [
          { label: '戻る' },
          { label: '終了する', primary: true, onClick: function () { self._apply(); } },
        ],
      });
      if (!ok) this._apply();
      return;
    }
    this._apply();
  },

  _apply: function () {
    if (this.waiting) return;
    this.waiting = true;
    const self = this;

    /* ★自分の交換はすぐ実行し、交換後の手札を見せます（15.4） */
    if (typeof window === 'undefined' || !window.__v8MulliganApply) { this.finish(); return; }

    window.__v8MulliganApply(this.chosen.slice(), function (res) {
      /* ★まだ選んでいない人がいるときは、そのまま次の人へ渡します。
         ここで待ちの案内を出すと、1台で交代しているのに
         「相手を待っています」と出てしまいます。 */
      if (res && res.next) {
        self.start(res.nextLabel);
        return;
      }
      const mine = res.mine;
      const theirs = res.theirs;
      const theirsLabel = (res.theirsLabel || '相手');
      void mine;
      /* ★選んだ札に印を付けたまま、もう選び直せない状態にします。
         交換後の手札は、この画面ではなく対戦画面で見せます
         （2026-08-01：選んだ札が山へ帰る演出を出すため）。 */
      self.render();
      self._say(theirsLabel + 'のマリガンを待っています');

      /* 相手（CPU）は即答なので、少しだけ待つ形にします（15.4） */
      setTimeout(function () {
        /* ★両者そろってから、相手の枚数を公開します（15.5） */
        self._say(theirs > 0
          ? (theirsLabel + 'は' + theirs + '枚交換しました')
          : (theirsLabel + 'は交換しませんでした'));

        setTimeout(function () {
          /* ★ここでマリガンの画面を閉じ、対戦画面へ戻します。
             そのうえで、選んだ札が山へ帰り、新しい札が右から
             加わるところを見せます。 */
          self.finish();
          if (window.__v8MulliganExchange) {
            window.__v8MulliganExchange(function () {
              if (window.__v8MulliganFinish) window.__v8MulliganFinish();
            });
          } else if (window.__v8MulliganFinish) {
            window.__v8MulliganFinish();
          }
        }, self.REVEAL_MS);
      }, self.WAIT_MS);
    });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Mulligan: V8Mulligan };
}
