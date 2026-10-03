/* =====================================================================
   v08-images.js ― 対戦用画像の読み込み（Stage 2-4）
   ---------------------------------------------------------------------
   仕様書 第19部。

   ★考え方
     ・カード1種につき1サイズ。盤面も詳細も同じファイルを使う（19.2）
     ・対戦開始前に読むのは「最初に見えるもの」だけ（19.3）
     ・残りは対戦が始まってから、裏でゆっくり読む
     ・読めていない絵は「絵の部分だけ空白」にして、
       枠・名前・数値は出す。ゲームは待たせない（19.4）
     ・読み終わったら、フェードせずその場で差し替える（19.4）
     ・失敗したら少し待って1回だけ再試行。2回目も失敗ならその対戦中は空白（19.5）
     ・対戦が終わったら持っている参照を手放す（19.6）

   ★外部通信はしません。読むのは同じフォルダの画像だけです。
   ===================================================================== */

'use strict';

const V8Images = {

  /* 付録C：実機で調整する値 */
  MAX_PARALLEL: 3,     // 同時に読む数（端末の負荷を抑える）
  RETRY_MS: 1200,      // 失敗してから再試行するまで

  /* ★開発中だけ手がかりを出す（19.5）。既定では何も出しません。
     調べたいときは、コンソールで V8Images.DEBUG = true にしてください。 */
  DEBUG: false,
  _note: function (msg, path) {
    if (!this.DEBUG || typeof console === 'undefined' || !console.info) return;
    console.info('[v0.8] ' + msg, path);
  },

  /** パスごとの状態 'loading' / 'ok' / 'ng' */
  _state: {},
  /** 失敗した回数。2回でその対戦中はあきらめる（19.5） */
  _tries: {},
  /** これから読むパス（先読みの待ち行列） */
  _queue: [],
  /** いま読んでいる数 */
  _busy: 0,
  /** 参照を握っておく Image。対戦が終わったら手放す */
  _keep: [],
  /** 読み終わったときに呼ぶ */
  _onLoaded: null,

  /** 読み終わっているか */
  isReady: function (path) { return this._state[path] === 'ok'; },

  /** もう試さない（2回失敗した）か */
  isDead: function (path) { return (this._tries[path] || 0) >= 2; },

  setOnLoaded: function (fn) { this._onLoaded = fn; },

  /* =============================================================
     すぐ要るものを先に読む（19.3）
     -------------------------------------------------------------
     待ち行列の先頭へ入れます。すでに読んでいるものは何もしません。
     ============================================================= */
  need: function (path) {
    if (!path || this._state[path] === 'ok' || this._state[path] === 'loading') return;
    if (this.isDead(path)) return;
    const at = this._queue.indexOf(path);
    if (at >= 0) this._queue.splice(at, 1);
    this._queue.unshift(path);      // 先頭へ＝優先順位を上げる
    this._pump();
  },

  /** あとで要るものを裏で読む（19.3） */
  prefetch: function (paths) {
    const self = this;
    (paths || []).forEach(function (p) {
      if (!p || self._state[p] || self._queue.indexOf(p) >= 0) return;
      self._queue.push(p);          // ★同じ画像を二重に読まない
    });
    this._pump();
  },

  /* =============================================================
     待ち行列を進める。同時に読む数を抑える（19.3）
     ============================================================= */
  _pump: function () {
    while (this._busy < this.MAX_PARALLEL && this._queue.length > 0) {
      this._load(this._queue.shift());
    }
  },

  _load: function (path) {
    if (!path || this._state[path] === 'ok' || this._state[path] === 'loading') return;
    if (typeof Image === 'undefined') return;

    const self = this;
    this._state[path] = 'loading';
    this._busy++;

    const img = new Image();
    img.onload = function () {
      self._busy--;
      self._state[path] = 'ok';
      self._keep.push(img);
      /* ★読み終わったらその場で差し替える。フェードはしない（19.4） */
      if (self._onLoaded) { try { self._onLoaded(path); } catch (e) { /* 表示の都合で止めない */ } }
      self._pump();
    };
    img.onerror = function () {
      self._busy--;
      self._state[path] = 'ng';
      self._tries[path] = (self._tries[path] || 0) + 1;
      /* ★少し待って1回だけ再試行。無限には繰り返さない（19.5） */
      if (self._tries[path] < 2) {
        if (typeof setTimeout === 'function') {
          setTimeout(function () {
            if (self._state[path] === 'ng') { self._state[path] = null; self.need(path); }
          }, self.RETRY_MS);
        }
      } else {
        /* 対戦ログには残しません（19.5） */
        self._note('カード画像を読めませんでした', path);
      }
      self._pump();
    };
    img.src = path;
  },

  /* =============================================================
     要素へ絵を当てる
     -------------------------------------------------------------
     読めていなければ何も当てません。枠・名前・数値はそのまま出るので、
     絵の部分だけが空白になります（19.4）。
     専用の「読み込み中」画像は作りません。
     ============================================================= */
  apply: function (el, path) {
    if (!el || !path) return;
    el.setAttribute('data-img', path);
    if (this.isReady(path)) {
      el.style.backgroundImage = 'url("' + path + '")';
      return;
    }
    el.style.backgroundImage = '';
    this.need(path);              // 見えているものは優先順位を上げる（19.3）
  },

  /** 読み終わったパスを、画面に出ている要素へ当て直す */
  applyAll: function (rootEl, path) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    const sel = path ? ('[data-img="' + path + '"]') : '[data-img]';
    const list = rootEl.querySelectorAll(sel);
    const self = this;
    Array.prototype.forEach.call(list, function (el) {
      const p = el.getAttribute('data-img');
      if (p && self.isReady(p) && !el.style.backgroundImage) {
        el.style.backgroundImage = 'url("' + p + '")';
      }
    });
  },

  /* =============================================================
     対戦の始めと終わり
     ============================================================= */

  /**
   * 対戦の開始時に呼ぶ。
   * @param {string[]} first 最初に見えるもの（フィールド・初期の場・初期手札）
   * @param {string[]} rest  そのほか。裏でゆっくり読む
   */
  begin: function (first, rest) {
    const self = this;
    (first || []).slice().reverse().forEach(function (p) { self.need(p); });
    this.prefetch(rest || []);
  },

  /** 対戦が終わったら参照を手放す（19.6）。ブラウザのキャッシュはそのまま使う */
  release: function () {
    this._queue = [];
    this._keep = [];
    this._state = {};
    this._tries = {};
    this._busy = 0;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Images: V8Images };
}
