/* =====================================================================
   errors.js  ―  予期しない不具合が起きたとき（仕様書 29）
   ---------------------------------------------------------------------
   何が起きても、画面を真っ白にしないためのものです。

   真っ白になると、遊んでいる人には「壊れた」ことしか分からず、
   こちらには何も情報が届きません。そこで、
     ・落ちたことを画面に出す
     ・制作者へ送れる情報をひとまとめにする
     ・モード選択へ戻れるようにする
   の3つだけを、確実にやります。

   ここ自体が失敗すると元も子もないので、
   中の処理はすべて try で囲み、外の状態にはできるだけ触りません。
   ===================================================================== */

'use strict';

const Errors = {

  shown: false,       // 同じ不具合で何度も画面を出さない
  lastAction: '',     // 直前に何をしていたか（手がかり）
  count: 0,

  /** 起動時に1回だけ呼ぶ */
  setup: function () {
    const self = this;

    window.addEventListener('error', function (e) {
      self.report(e && e.error ? e.error : new Error(e && e.message), '画面の処理');
    });
    window.addEventListener('unhandledrejection', function (e) {
      self.report(e && e.reason, '待ち処理');
    });

    const copyBtn = document.getElementById('error-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        self.copy(copyBtn);
      });
    }
    const backBtn = document.getElementById('error-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () { self.backToMenu(); });
    }
  },

  /** 「いま何をしていたか」を控える（手がかりとして残します） */
  note: function (text) {
    this.lastAction = text || '';
  },

  /* =============================================================
     不具合を受け取って画面に出す
     ============================================================= */
  report: function (err, where) {
    this.count += 1;
    try {
      // CPUが動き続けないように止める
      if (typeof CpuDriver !== 'undefined') CpuDriver.stop();
    } catch (e) { /* ここで失敗しても進みます */ }

    if (this.shown) return;      // すでに出ている
    this.shown = true;

    let text = '';
    try { text = this.detail(err, where); } catch (e) { text = String(err); }

    try {
      const box = document.getElementById('error-screen');
      if (!box) return;
      const body = box.querySelector('.error__detail');
      if (body) body.textContent = text;
      const fb = box.querySelector('.error__fallback');
      if (fb) { fb.value = text; fb.classList.remove('is-on'); }
      box.classList.add('is-on');
    } catch (e) { /* 出せなくても、これ以上は何もしません */ }
  },

  /* =============================================================
     送ってもらう情報を組み立てる（仕様書 29）
     ============================================================= */
  detail: function (err, where) {
    const lines = [];
    let head = '『マヨイビト』DCG';
    try { head = APP_TITLE + ' ' + APP_VERSION_LABEL; } catch (e) { /* 無視 */ }
    lines.push(head + '　不具合の記録');
    lines.push('エラーID：' + this.makeId());
    lines.push('場所：' + (where || '不明'));

    try {
      lines.push('モード：' + ((typeof match !== 'undefined' && match.mode) || '不明'));
    } catch (e) { /* 無視 */ }

    try {
      const st = (typeof Game !== 'undefined') ? Game.state : null;
      if (st) {
        lines.push('ターン：' + st.turnCount);
        lines.push('フェイズ：' + st.phase);
        lines.push('手番：' + (st.currentSide || '-'));
        lines.push('シード：' + st.seed);
        if (st.decks) lines.push('デッキ：' + st.decks.village + ' / ' + st.decks.mansion);
      } else {
        lines.push('対戦：開始前');
      }
    } catch (e) { /* 無視 */ }

    if (this.lastAction) lines.push('直前の行動：' + this.lastAction);

    try {
      if (typeof Result !== 'undefined') lines.push('端末：' + Result.envText());
    } catch (e) { /* 無視 */ }

    lines.push('');
    lines.push('内容：' + ((err && err.message) || String(err)));
    if (err && err.stack) {
      // スタックは長くなるので先頭だけ
      lines.push(String(err.stack).split('\n').slice(0, 6).join('\n'));
    }

    try {
      const st = (typeof Game !== 'undefined') ? Game.state : null;
      if (st && st.log && st.log.length) {
        lines.push('');
        lines.push('直前のログ：');
        st.log.slice(-8).forEach(function (l) { lines.push('  ' + l); });
      }
    } catch (e) { /* 無視 */ }

    return lines.join('\n');
  },

  /** 見分けるための短い符号（日時から作ります） */
  makeId: function () {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return 'E' + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
           p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  },

  /* =============================================================
     操作
     ============================================================= */
  copy: function (btn) {
    const box = document.getElementById('error-screen');
    const fb = box.querySelector('.error__fallback');
    const text = fb.value;
    const label = btn.textContent;

    const ok = function () {
      btn.textContent = 'コピーしました';
      setTimeout(function () { btn.textContent = label; }, 1800);
    };
    const fail = function () {
      fb.classList.add('is-on');
      fb.focus();
      fb.select();
      btn.textContent = '下の文章をコピーしてください';
      setTimeout(function () { btn.textContent = label; }, 2600);
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, fail);
        return;
      }
    } catch (e) { /* 下へ */ }
    fail();
  },

  backToMenu: function () {
    try {
      const box = document.getElementById('error-screen');
      if (box) box.classList.remove('is-on');
      this.shown = false;
      if (typeof backToSetupScreen === 'function') backToSetupScreen(null);
    } catch (e) {
      // それでも駄目なら読み込み直す（最後の手段）
      try { window.location.reload(); } catch (e2) { /* 諦めます */ }
    }
  },
};
