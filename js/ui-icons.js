/* =====================================================================
   ui-icons.js ― 共通の絵（v0.9 Phase 6）
   ---------------------------------------------------------------------
   ★文字が枠に入りきらないボタンを、絵に置き換えます。

   320px 幅の端末では、ボタンの幅が 40〜60px しかありません。
   「プレゼント」や「メイン終了」は、そこへ入りません。
   ★入らない文字は、削るか、絵にするかのどちらかです。

   ---------------------------------------------------------------------
   ★絵だけにはしません
   ---------------------------------------------------------------------
   絵だけだと、何のボタンか分からない人がいます。
   ★読み上げに伝わるよう aria-label を必ず付けます。
   ★指を置いたままにすると、文字でも出ます（title）。

   ---------------------------------------------------------------------
   ★絵は線だけで描きます
   ---------------------------------------------------------------------
   色は currentColor に任せます。こうしておけば、
   押せないときの薄さも、選ばれているときの色も、
   ★ボタン側の指定がそのまま絵にも効きます。
   絵ごとに色を持たせると、そのたびに合わせ直すことになります。
   ===================================================================== */

'use strict';

const UiIcons = {

  /* 線の太さは、小さくしても潰れない太さです */
  _svg: function (body) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' +
      'fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  },

  /**
   * 設定（歯車）
   * ---------------------------------------------------------------
   * ★中心の丸のまわりに、歯を8つ付けた形にします。
   *   ★線を放射状に伸ばすだけだと、太陽や星のように見えます
   *     （作者の指摘）。歯車と分かるのは「外周の歯」です。
   */
  settings: function () {
    /* 中心から角度ごとに、台形の歯を1つずつ置きます */
    let teeth = '';
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const cos = Math.cos(a), sin = Math.sin(a);
      /* 歯の付け根（半径7.4）と先（半径9.6）、幅は角度で ±0.16 */
      const p = [];
      [[7.4, -0.19], [9.6, -0.13], [9.6, 0.13], [7.4, 0.19]].forEach(function (q) {
        const r = q[0], d = q[1];
        const x = 12 + r * Math.cos(a + d);
        const y = 12 + r * Math.sin(a + d);
        p.push(x.toFixed(1) + ' ' + y.toFixed(1));
      });
      void cos; void sin;
      teeth += '<path d="M' + p[0] + 'L' + p[1] + 'L' + p[2] + 'L' + p[3] + 'Z"/>';
    }
    return this._svg(
      '<circle cx="12" cy="12" r="7.4"/>' +
      '<circle cx="12" cy="12" r="3.1"/>' +
      teeth);
  },

  /** 対戦ログ（重なった紙） */
  log: function () {
    return this._svg(
      '<rect x="4" y="3.5" width="12" height="15" rx="1.6"/>' +
      '<path d="M7.5 7.5h5M7.5 11h5M7.5 14.5h3"/>' +
      '<path d="M18 6.5h1.2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8.2a1 1 0 0 1-1-1V19"/>');
  },

  /** お知らせ（ベル） */
  news: function () {
    return this._svg(
      '<path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z"/>' +
      '<path d="M10.3 19a2 2 0 0 0 3.4 0"/>');
  },

  /** プレゼント（箱とリボン） */
  present: function () {
    return this._svg(
      '<rect x="3.5" y="9.5" width="17" height="11" rx="1.4"/>' +
      '<path d="M2.5 9.5h19M12 9.5v11"/>' +
      '<path d="M12 9.5S10.6 3.5 8 3.5a2.2 2.2 0 0 0 0 4.4h4z"/>' +
      '<path d="M12 9.5s1.4-6 4-6a2.2 2.2 0 0 1 0 4.4h-4z"/>');
  },

  /**
   * ボタンを絵に置き換える。
   * ---------------------------------------------------------------
   * ★文字は消しますが、意味は消しません。
   *   読み上げ（aria-label）と、指を置いたときの表示（title）に残します。
   *
   * @param {Element} btn  置き換えるボタン
   * @param {string} name  UiIcons の絵の名前
   * @param {string} label もとの文字（読み上げに使う）
   */
  apply: function (btn, name, label) {
    if (!btn || typeof this[name] !== 'function') return;
    const text = label || btn.textContent || '';
    btn.innerHTML = this[name]();
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
    btn.classList.add('ui-icon');
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { UiIcons: UiIcons };
