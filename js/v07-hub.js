/* =====================================================================
   v07-hub.js ― メインハブ本体（Stage 2）
   ---------------------------------------------------------------------
   仕様書 第5部（一枚絵）・第6部（ハブ共通）・第7〜11部（各タブ）。

   Stage 2 の範囲:
     ・共通一枚絵（ランダム開始・10秒自動・中央タップ・0.5秒クロスフェード）
     ・上部プレイヤー情報／通貨2枠
     ・メインナビ5タブ（仮SVG・発光・0.3秒スライド）
     ・各タブの下部パネル
     ・ホームのバナー4枚／インジケーター／お知らせ・プレゼント／ミッション
   Stage 2 でやらないこと:
     ・個別画面の中身／既存機能の本接続／設定・プロフィールの完成
       → 入口は仮ダイアログ or 準備中で受ける。

   タイマーはすべて V7Timers（第26部 26.3：二重生成しない）で管理。
   ===================================================================== */

'use strict';

const V7Hub = {

  TABS: [
    { id: 'home',  label: 'ホーム' },
    { id: 'card',  label: 'カード' },
    { id: 'battle', label: '対戦' },
    { id: 'shop',  label: 'ショップ' },
    { id: 'other', label: 'その他' },
  ],

  _current: 'home',
  _switching: false,
  _inited: false,

  init: function () {
    if (this._inited) { this.onHubShown(); return; }
    this._inited = true;

    this._renderProfile();
    this._renderNav();
    this._buildPanels();
    this._setupCurrency();
    V7Art.init();

    // 起動時は必ずホーム（第6部 6.6）
    this._current = 'home';
    this._showTab('home', null);   // 初回はスライドなし
    this.onHubShown();
  },

  /* -------------------------------------------------------------
     上部プレイヤー情報（第6部 6.2）
     ------------------------------------------------------------- */
  _renderProfile: function () {
    this.refreshProfile();
    const btn = document.getElementById('v7-profile');
    if (btn) btn.onclick = function () {
      // プレイヤー情報パネル全体をタップでプロフィールへ（第12部 12.1）
      if (typeof V7Screen !== 'undefined') V7Screen.open('profile');
    };
  },

  /** 上部プレイヤー情報を最新のセーブ内容で描き直す（初期化・読込後に使う） */
  refreshProfile: function () {
    const name = document.getElementById('v7-profile-name');
    const level = document.getElementById('v7-profile-level');
    const title = document.getElementById('v7-profile-title');
    const p = (typeof V7Save !== 'undefined' && V7Save.data) ? V7Save.data.profile : null;
    if (name) name.textContent = (p && p.playerName) || 'プレイヤー';
    if (title) title.textContent = (p && p.title) || 'はじめての一歩';
    // レベルは仕様書6.2で将来追加の余地。v0.7 では Lv.1 固定表示。
    if (level) level.textContent = 'Lv.1';
  },

  /* -------------------------------------------------------------
     通貨2枠（第6部 6.3）。数値0固定・タップで準備中。
     ------------------------------------------------------------- */
  _setupCurrency: function () {
    const soft = document.getElementById('v7-cur-soft');
    const prem = document.getElementById('v7-cur-premium');
    if (soft) soft.onclick = function () {
      V7Dialog.comingSoon('無償通貨', V7_COMING_SOON.currencySoft);
    };
    if (prem) prem.onclick = function () {
      V7Dialog.comingSoon('有償通貨', V7_COMING_SOON.currencyPremium);
    };
  },

  /* -------------------------------------------------------------
     メインナビ（第6部 6.5）。仮SVG＋文字。
     ------------------------------------------------------------- */
  _renderNav: function () {
    const nav = document.getElementById('v7-nav');
    if (!nav) return;
    nav.innerHTML = '';
    const self = this;
    this.TABS.forEach(function (t) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v7-nav__item';
      btn.dataset.tab = t.id;
      btn.innerHTML =
        '<span class="v7-nav__icon">' + V7Icons[t.id] + '</span>' +
        '<span class="v7-nav__label">' + t.label + '</span>';
      btn.addEventListener('click', function () { self.switchTab(t.id); });
      nav.appendChild(btn);
    });
    this._markNav('home');
  },

  _markNav: function (tabId) {
    const nav = document.getElementById('v7-nav');
    if (!nav) return;
    Array.prototype.forEach.call(nav.children, function (btn) {
      btn.classList.toggle('is-on', btn.dataset.tab === tabId);
    });
  },

  /* -------------------------------------------------------------
     タブ固有パネルを組み立てる（第6部 6.4）
     各タブぶんの .v7-tabpanel をスライダーへ入れておく。
     ------------------------------------------------------------- */
  _buildPanels: function () {
    const slider = document.getElementById('v7-panel-slider');
    if (!slider) return;
    slider.innerHTML = '';
    const self = this;
    this.TABS.forEach(function (t) {
      const panel = document.createElement('div');
      panel.className = 'v7-tabpanel';
      panel.dataset.tab = t.id;
      panel.style.display = 'none';
      V7Panels.build(t.id, panel);
      slider.appendChild(panel);
    });
  },

  /* -------------------------------------------------------------
     タブ切り替え（第6部 6.4：0.3秒の1回スライド・方向つき）
     ------------------------------------------------------------- */
  switchTab: function (tabId) {
    if (this._switching) return;               // 切替中は受け付けない
    if (tabId === this._current) return;
    const order = this.TABS.map(function (t) { return t.id; });
    const from = order.indexOf(this._current);
    const to = order.indexOf(tabId);
    if (to < 0) return;
    const dir = (to > from) ? 'right' : 'left';   // 右のタブへ or 左のタブへ
    this._showTab(tabId, dir);
  },

  _showTab: function (tabId, dir) {
    const slider = document.getElementById('v7-panel-slider');
    if (!slider) return;
    const self = this;
    const prevId = this._current;
    this._current = tabId;
    this._markNav(tabId);

    const panels = slider.querySelectorAll('.v7-tabpanel');
    const show = slider.querySelector('.v7-tabpanel[data-tab="' + tabId + '"]');
    const hide = slider.querySelector('.v7-tabpanel[data-tab="' + prevId + '"]');

    // 初回（dir=null）はスライドなしで即表示
    if (!dir || !hide || hide === show) {
      panels.forEach(function (p) { p.style.display = 'none'; p.className = 'v7-tabpanel'; });
      show.style.display = '';
      V7Panels.onShown(tabId);
      return;
    }

    this._switching = true;

    // 入る向き・出る向きのクラスを付ける（第6部 6.4）
    // 右のタブへ：現在が左へ抜け、新規が右から入る
    const outCls = (dir === 'right') ? 'v7-slide-out-left' : 'v7-slide-out-right';
    const inFrom = (dir === 'right') ? 'v7-slide-in-right' : 'v7-slide-in-left';

    show.style.display = '';
    show.className = 'v7-tabpanel ' + inFrom;
    hide.className = 'v7-tabpanel';

    // 次フレームでアニメ開始
    V7Timers.set('tab-anim-start', function () {
      hide.className = 'v7-tabpanel ' + outCls;
      show.className = 'v7-tabpanel v7-slide-center';
    }, 16);

    // 0.3秒後に片づける
    V7Timers.set('tab-anim-end', function () {
      panels.forEach(function (p) {
        if (p !== show) { p.style.display = 'none'; p.className = 'v7-tabpanel'; }
      });
      show.className = 'v7-tabpanel';
      self._switching = false;
      V7Panels.onShown(tabId);
    }, 320);
  },

  /* -------------------------------------------------------------
     ハブが見えている状態になったとき（第5部 5.7 / 第7部 タイマー）
     ------------------------------------------------------------- */
  onHubShown: function () {
    V7Art.resume();
    if (this._current === 'home') V7Home.resumeBanner();
  },

  /** 個別画面へ入るなど、ハブが隠れるとき */
  onHubHidden: function () {
    V7Art.pause();
    V7Home.pauseBanner();
  },

  current: function () { return this._current; },
  isSwitching: function () { return this._switching; },

  /* 初期化後などに、暗転なしでタブを直接切り替える（復帰用） */
  jumpTab: function (tabId) {
    if (tabId === this._current) { this.onHubShown(); return; }
    this._current = tabId;
    this._showTab(tabId, null);   // スライドなしで即表示
    this.onHubShown();
  },

  /* 保留タブ（個別画面を閉じてハブへ戻ったとき切り替える先） */
  _pendingTab: null,

  /* メインハブ上での端末戻る（第17部 17.4）
     ・ホーム以外のタブ → ホームへ
     ・ホーム → ブラウザー標準（false を返して既定に委ねる） */
  handleHubBack: function () {
    if (this._current !== 'home') {
      this.jumpTab('home');
      // ホームへ戻したので、端末戻るを1段ぶん相殺しておく
      try { window.history.pushState({ v7hub: 'home' }, ''); } catch (e) {}
      return true;
    }
    return false;   // ホームでの戻るはブラウザー標準
  },
};

/* =====================================================================
   仮アイコン（第6部 6.5：シンプルな線画インラインSVG）
   絵文字・外部ライブラリに依存しない。後で正式SVGへ差し替え可能。
   ===================================================================== */
const V7Icons = {
  home:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7"/>' +
    '<path d="M6 10v9h12v-9"/></svg>',
  card:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/>' +
    '<path d="M9 8h6M9 12h6"/></svg>',
  battle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-9 9-6-6z"/>' +
    '<path d="M4 20l3-3"/></svg>',
  shop:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16l-1 12H5z"/>' +
    '<path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  other:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/>' +
    '<circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
};

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V7Hub: V7Hub, V7Icons: V7Icons };
}
