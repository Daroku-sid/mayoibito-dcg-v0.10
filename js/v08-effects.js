/* =====================================================================
   v08-effects.js ― 効果処理パネル（Stage 4-2）
   ---------------------------------------------------------------------
   仕様書 第10部。

   画面右上に「いま解決している効果」と「これから解決する効果」を出します。

     いま解決中 … カード名 ＋ 効果全文
     待機中     … カード名だけ。上から下へ解決順。番号は付けない
     解決済み   … 履歴として残さない。上へ流れて消える

   ★効果のルール（順番・中身・間）は既存のままです。
     ここは「何が起きているか」を見せるだけです。
   ★左上のクイック表示と同時に出せます（10.4）。
   ===================================================================== */

'use strict';

const V8Effects = {

  _root: null,

  /** 直前に出していた「いま解決中」の uid。変わったときだけ流す演出をする */
  _lastUid: null,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;
    /* 既存の効果解決から知らせが来る */
    if (typeof window !== 'undefined') {
      window.__v8OnEffect = function () { self.refresh(); };
    }
    return this;
  },

  /** いま何か解決しているか */
  isBusy: function () {
    return !!(typeof window !== 'undefined' && window.__v8CurrentEffect &&
      window.__v8CurrentEffect());
  },

  /* =============================================================
     描き直す
     ============================================================= */
  refresh: function () {
    if (!this._root) return;
    const box = this._root.querySelector('#v8-effects');
    if (!box) return;

    const cur = (typeof window !== 'undefined' && window.__v8CurrentEffect)
      ? window.__v8CurrentEffect() : null;
    const queue = (typeof window !== 'undefined' && window.__v8PendingEffects)
      ? window.__v8PendingEffects() : [];

    /* 何も無ければパネルごと引っ込める */
    if (!cur && !queue.length) {
      this._root.classList.remove('v8-effects-on');
      this._lastUid = null;
      this._mark(null);
      return;
    }
    this._root.classList.add('v8-effects-on');

    const nameEl = box.querySelector('#v8-effects-name');
    const textEl = box.querySelector('#v8-effects-text');
    const listEl = box.querySelector('#v8-effects-queue');
    const curBox = box.querySelector('#v8-effects-current');

    /* --- いま解決している効果：カード名と効果全文（10.4） --- */
    if (cur) {
      if (curBox) curBox.style.display = 'block';
      if (nameEl) nameEl.textContent = cur.name;
      if (textEl) textEl.textContent = cur.effect;

      /* 解決するものが入れ替わったら、上へ流れて次が上がってくる見せ方（10.4） */
      if (curBox && String(this._lastUid) !== String(cur.uid)) {
        curBox.classList.remove('v8-effects--rise');
        void curBox.offsetWidth;
        curBox.classList.add('v8-effects--rise');
      }
      this._lastUid = cur.uid;
    } else {
      if (curBox) curBox.style.display = 'none';
      this._lastUid = null;
    }

    /* --- 待機している効果：カード名だけ。番号は付けない（10.4） --- */
    if (listEl) {
      listEl.innerHTML = '';
      const doc = document;
      queue.forEach(function (it) {
        const li = doc.createElement('div');
        li.className = 'v8-effects__wait';
        li.textContent = it.name;
        /* ★タップしても開きません（10.4） */
        listEl.appendChild(li);
      });
    }

    /* --- 発生源のカードを強調する（10.3） --- */
    this._mark(cur ? cur.uid : null);
  },

  /** 発生源のカードだけを強調する */
  _mark: function (uid) {
    if (!this._root) return;
    const cards = this._root.querySelectorAll('.v8-card[data-uid]');
    Array.prototype.forEach.call(cards, function (el) {
      const on = uid !== null && String(el.getAttribute('data-uid')) === String(uid);
      el.classList.toggle('v8-card--acting', on);
    });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Effects: V8Effects };
}
