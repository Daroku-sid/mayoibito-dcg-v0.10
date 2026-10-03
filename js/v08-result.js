/* =====================================================================
   v08-result.js ― リザルト画面（Stage 6-1）
   ---------------------------------------------------------------------
   仕様書 第18部。

   ★背景は、使ったデッキの0コスト人間（＝ホーム画面の一枚絵と同じ絵）。
   ★「勝利」「敗北」と日本語で出します（VICTORY／DEFEAT は使いません）。
   ★決着した盤面へ戻る仕掛けは作りません（18.5）。

   決着の判定・再戦・戻り先は、すべて既存の処理をそのまま使います。
   ===================================================================== */

'use strict';

const V8Result = {

  open_: false,
  _root: null,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;
    const bind = function (id, fn) {
      const el = rootEl.querySelector('#' + id);
      if (el) el.onclick = fn;
    };
    /* 対戦ログ。閉じるとリザルトへ戻ります（14.1・18.4） */
    bind('v8-result-log', function () {
      if (typeof V8Log !== 'undefined') V8Log.open();
    });
    bind('v8-result-again', function () {
      self.close();
      if (typeof window !== 'undefined' && window.__v8ResultRestart) window.__v8ResultRestart();
    });
    bind('v8-result-next', function () {
      self.close();
      if (typeof window !== 'undefined' && window.__v8ResultForward) window.__v8ResultForward();
    });
    return this;
  },

  isOpen: function () { return this.open_; },

  /* =============================================================
     出しかたの間（ダロクの指定）
     -------------------------------------------------------------
       決着 →（少し待つ）→ 1秒の暗転 → 一枚絵だけ現れる
            → そのあと 文字・情報・ボタンが順に現れる
     間の長さは CSS の遅れと合わせてあります。
     ============================================================= */
  WAIT_MS: 600,     // 決着のあと、暗転が始まるまで

  /** @return {boolean} 引き受けたか */
  open: function () {
    if (!this._root) return false;
    const d = (typeof window !== 'undefined' && window.__v8ResultData)
      ? window.__v8ResultData() : null;
    if (!d) return false;

    /* ★引き受けたことは先に返し、実際に出すのは少し待ってからです。
       すぐ出すと、決着の余韻がないまま切り替わります。 */
    this.open_ = true;
    const self = this;
    if (typeof setTimeout === 'function') {
      setTimeout(function () { self._show(d); }, this.WAIT_MS);
    } else {
      this._show(d);
    }
    return true;
  },

  _show: function (d) {
    if (!this._root || !this.open_) return;
    this._root.classList.add('v8-result-on');
    /* 勝ち・負け・引き分けで飾りを変えます */
    this._root.classList.toggle('v8-result--win', !!d.win && !d.draw);
    this._root.classList.toggle('v8-result--lose', !d.win && !d.draw);
    this._root.classList.toggle('v8-result--draw', !!d.draw);

    const set = function (root, id, text) {
      const el = root.querySelector('#' + id);
      if (el) el.textContent = text;
    };

    /* 背景（18.1）。ホーム画面の一枚絵をそのまま使います */
    const art = this._root.querySelector('#v8-result-art');
    if (art && typeof V8Images !== 'undefined') V8Images.apply(art, d.art);

    /* 結果（18.2）。中央へ大きく、その下に決着の理由 */
    set(this._root, 'v8-result-title', d.draw ? '引き分け' : (d.win ? '勝利' : '敗北'));
    set(this._root, 'v8-result-reason', d.reason);

    /* 表示する内容（18.3） */
    const rows = this._root.querySelector('#v8-result-info');
    if (rows) {
      rows.innerHTML = '';
      const doc = document;
      const row = function (label, value) {
        if (value === '' || value === null || value === undefined) return;
        const r = doc.createElement('div');
        r.className = 'v8-result__row';
        const a = doc.createElement('span'); a.textContent = label;
        const b = doc.createElement('span'); b.className = 'v8-result__val';
        b.textContent = String(value);
        r.appendChild(a); r.appendChild(b);
        rows.appendChild(r);
      };
      /* ★経験値の仕組みはまだありません。枠だけ作り、数は作りません（18.3） */
      row('プレイヤーレベル', '未実装');
      row('取得経験値', '未実装');
      row('モード', d.mode + (d.difficulty ? ('　' + d.difficulty) : ''));
      row('終了ターン', d.turnCount + 'ターン目');
    }
  },

  close: function () {
    this.open_ = false;
    if (!this._root) return;
    ['v8-result-on', 'v8-result--win', 'v8-result--lose', 'v8-result--draw']
      .forEach(function (c) { this._root.classList.remove(c); }, this);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Result: V8Result };
}
