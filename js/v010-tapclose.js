/* =====================================================================
   v010-tapclose.js ― 「外をタップで戻る」を一操作にする（v0.10.2）
   ---------------------------------------------------------------------
   ★ボスの指摘（2026-10-03）：ログ画面やトラッシュ一覧から戻るとき、
     画面の端をタップして戻るが、判定がシビアで、背面のボタンが押されてしまうことがある。
   ★原因
     ・閉じるのが「触れた瞬間（pointerdown）」だった。閉じたあとに指を離すと、
       その「離した」と「クリック」が、閉じて現れた後ろのボタンへ届いていた
     ・ログ画面は、閉じられる場所が暗い幕の細い縁だけだった
   ★直し
     1. 閉じるのは「触れて、動かさずに離した（タップ）」ときだけ。スクロールの指では閉じない
     2. 操作できる所（カード名・カード・ボタン）以外なら、パネルの上でもどこでも閉じる
     3. 閉じた直後の 0.4秒 は、後ろへ届くタップをすべて捨てる
   ===================================================================== */
'use strict';

const V10TapClose = {
  SLOP: 12,         // これ以上動いたら「タップ」ではない（スクロールなど）
  MAX_MS: 700,      // これより長く押したら「タップ」ではない（長押し）
  GUARD_MS: 400,    // 閉じた直後に後ろへ届く入力を捨てる時間

  /**
   * @param {Element} wrapEl 画面全体を覆う入れ物（幕＋パネル）
   * @param {object} o  isOpen() / canClose() / exclude（閉じない所のセレクタ）/ onClose()
   */
  attach: function (wrapEl, o) {
    if (!wrapEl || wrapEl.__v10tap) return;
    wrapEl.__v10tap = true;
    const self = this;
    let start = null;
    const excluded = function (t) { return !!(o.exclude && t && t.closest && t.closest(o.exclude)); };
    wrapEl.addEventListener('pointerdown', function (e) {
      start = null;
      if (!o.isOpen()) return;
      if (excluded(e.target)) return;
      start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    }, true);
    wrapEl.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) return;
      if (Math.abs(e.clientX - start.x) > self.SLOP || Math.abs(e.clientY - start.y) > self.SLOP) start = null;
    }, true);
    wrapEl.addEventListener('pointercancel', function () { start = null; }, true);
    wrapEl.addEventListener('pointerup', function (e) {
      const s = start; start = null;
      if (!s || e.pointerId !== s.id || !o.isOpen()) return;
      if (Math.abs(e.clientX - s.x) > self.SLOP || Math.abs(e.clientY - s.y) > self.SLOP) return;
      if (Date.now() - s.t > self.MAX_MS) return;
      if (o.canClose && !o.canClose()) return;
      if (excluded(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      self.guard();
      o.onClose();
    }, true);
  },

  /** 閉じた直後の入力を捨てる（後ろのボタンが押されないように） */
  guard: function () {
    const until = Date.now() + this.GUARD_MS;
    const types = ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'];
    const swallow = function (e) {
      if (Date.now() < until) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
    };
    types.forEach(function (t) { document.addEventListener(t, swallow, { capture: true, passive: false }); });
    setTimeout(function () {
      types.forEach(function (t) { document.removeEventListener(t, swallow, { capture: true, passive: false }); });
    }, this.GUARD_MS + 30);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { V10TapClose: V10TapClose };
