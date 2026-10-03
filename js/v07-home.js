/* =====================================================================
   v07-home.js ― ホームタブ（Stage 2・第7部）
   ---------------------------------------------------------------------
   ・横スライドバナー4枚（5秒自動・スワイプ・吸着・0.4秒）
   ・バナーインジケーター（紫カプセル／淡色ドット）
   ・お知らせ／プレゼントボタン（バナーの右に2つ：作者確定）
   ・ミッションパネル（デイリー／ウィークリー／総合・4状態・枠内スクロール）
   ホーム全体は縦スクロールしない（7.1）。
   ===================================================================== */

'use strict';

const V7Home = {

  BANNER_MS: 5000,     // 5秒（7.2）
  BANNER_ANIM: 650,    // 0.65秒（作者指示で 0.4→少しゆっくりに）

  _bannerIdx: 0,
  _banners: [],
  _built: false,
  _dragging: false,
  _bannerPaused: false,
  _missionTab: 'daily',

  build: function (root) {
    this._built = true;
    root.innerHTML = '';
    root.className = 'v7-tabpanel v7-home';

    // 上段：バナー＋（お知らせ・プレゼント）
    const top = document.createElement('div');
    top.className = 'v7-home__top';
    top.appendChild(this._buildBanner());
    top.appendChild(this._buildSideButtons());
    root.appendChild(top);

    // 下段：ミッションパネル
    root.appendChild(this._buildMissions());
  },

  /* -------------------------------------------------------------
     バナー（第7部 7.2 / 7.3）
     ------------------------------------------------------------- */
  _buildBanner: function () {
    const self = this;
    this._banners = (typeof V7_BANNERS !== 'undefined') ? V7_BANNERS.slice() : [];

    const wrap = document.createElement('div');
    wrap.className = 'v7-banner';

    const track = document.createElement('div');
    track.className = 'v7-banner__track';
    track.id = 'v7-banner-track';
    this._banners.forEach(function (b) {
      const slide = document.createElement('button');
      slide.type = 'button';
      slide.className = 'v7-banner__slide';
      slide.dataset.action = b.action;
      slide.innerHTML = '<span class="v7-banner__label">' + b.label + '</span>';
      slide.addEventListener('click', function () {
        if (self._movedByDrag) return;      // スワイプ直後の誤タップ抑止
        self._onBannerTap(b);
      });
      track.appendChild(slide);
    });
    wrap.appendChild(track);

    // インジケーター（7.3）
    const ind = document.createElement('div');
    ind.className = 'v7-banner__dots';
    ind.id = 'v7-banner-dots';
    this._banners.forEach(function () {
      const d = document.createElement('span');
      d.className = 'v7-banner__dot';
      ind.appendChild(d);
    });
    wrap.appendChild(ind);

    this._attachSwipe(track);
    // 初期位置
    V7Timers.set('banner-init', function () { self._applyBanner(false); }, 0);
    return wrap;
  },

  _applyBanner: function (animate) {
    const track = document.getElementById('v7-banner-track');
    const dots = document.getElementById('v7-banner-dots');
    if (!dots) return;
    if (!track) return;
    track.style.transition = animate ? ('transform ' + this.BANNER_ANIM + 'ms ease') : 'none';
    track.style.transform = 'translateX(' + (-this._bannerIdx * 100) + '%)';
    if (dots) {
      Array.prototype.forEach.call(dots.children, function (d, i) {
        d.classList.toggle('is-on', i === V7Home._bannerIdx);
      });
    }
  },

  _onBannerTap: function (b) {
    // Stage 2：本接続は Stage 4。ここでは仮ダイアログ／仮遷移。
    if (b.action === 'coming-soon') {
      V7Dialog.comingSoon(b.label, V7_COMING_SOON.event);
      return;
    }
    const map = {
      solo: ['ソロプレイ', 'ソロプレイの選択画面へつなぎます。接続は次の段階で行います。'],
      tutorial: ['チュートリアル', '既存のチュートリアル選択画面へつなぎます。接続は次の段階で行います。'],
      training: ['トレーニングモード', 'トレーニングモードの選択画面へつなぎます。接続は次の段階で行います。'],
    };
    const m = map[b.action];
    if (m) V7Dialog.comingSoon(m[0], m[1]);
  },

  /* 横スワイプ（7.2）。指を離したら最も近いバナーへ吸着。 */
  _attachSwipe: function (track) {
    const self = this;
    let startX = 0, dx = 0, w = 1;
    this._movedByDrag = false;

    const down = function (e) {
      if (self._switchingBanner) return;
      self._dragging = true;
      self._movedByDrag = false;
      startX = self._pointX(e);
      w = track.parentNode ? track.parentNode.offsetWidth || 1 : 1;
      self.pauseBanner();                 // 触れている間は自動停止（7.2）
      track.style.transition = 'none';
    };
    const move = function (e) {
      if (!self._dragging) return;
      dx = self._pointX(e) - startX;
      if (Math.abs(dx) > 6) self._movedByDrag = true;
      const base = -self._bannerIdx * w;
      track.style.transform = 'translateX(' + (base + dx) + 'px)';
    };
    const up = function () {
      if (!self._dragging) return;
      self._dragging = false;
      const last = self._banners.length - 1;
      const threshold = w * 0.2;
      let wrapped = false;          // 端をまたいで反対端へ折り返したか

      if (dx <= -threshold) {
        // 左スワイプ（次へ）。末尾より先なら先頭へ折り返す。
        if (self._bannerIdx >= last) { self._bannerIdx = 0; wrapped = true; }
        else self._bannerIdx += 1;
      } else if (dx >= threshold) {
        // 右スワイプ（前へ）。先頭より前なら末尾へ折り返す。
        if (self._bannerIdx <= 0) { self._bannerIdx = last; wrapped = true; }
        else self._bannerIdx -= 1;
      }
      dx = 0;

      if (wrapped) {
        // 折り返しは全スライドぶんの逆流を見せたくないので瞬間移動で整える。
        self._applyBanner(false);         // アニメなしで反対端へ
        self.resumeBanner();              // 5秒タイマー再開（リセット）
        V7Timers.set('banner-tapguard', function () { self._movedByDrag = false; }, 60);
        return;
      }

      // 通常の吸着：px 指定でアニメさせ、完了後に % 指定へ整え直す
      track.style.transition = 'transform ' + self.BANNER_ANIM + 'ms ease';
      track.style.transform = 'translateX(' + (-self._bannerIdx * w) + 'px)';
      V7Timers.set('banner-snap', function () {
        self._applyBanner(false);         // %指定へ整え直す
        self.resumeBanner();              // 5秒タイマー再開（リセット）
      }, self.BANNER_ANIM);
      // タップ誤爆抑止フラグは少し遅れて解除
      V7Timers.set('banner-tapguard', function () { self._movedByDrag = false; }, 60);
    };

    track.addEventListener('pointerdown', down);
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
    track.addEventListener('pointerleave', up);
  },

  _pointX: function (e) {
    return (e.clientX !== undefined) ? e.clientX
      : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
  },

  /* 5秒自動送り（7.2）。最後から最初へループ。 */
  resumeBanner: function () {
    this._bannerPaused = false;
    this._scheduleBanner();
  },
  pauseBanner: function () {
    this._bannerPaused = true;
    V7Timers.clear('banner-auto');
  },
  _scheduleBanner: function () {
    V7Timers.clear('banner-auto');            // 二重生成しない
    if (this._bannerPaused) return;
    if (this._banners.length < 2) return;
    const self = this;
    V7Timers.set('banner-auto', function () { self._bannerAuto(); }, this.BANNER_MS);
  },
  _bannerAuto: function () {
    this._bannerIdx = (this._bannerIdx + 1) % this._banners.length;
    this._applyBanner(true);
    this._scheduleBanner();
  },

  /* -------------------------------------------------------------
     お知らせ／プレゼント（バナーの右：作者確定）（7.4/7.5）
     ------------------------------------------------------------- */
  _buildSideButtons: function () {
    const wrap = document.createElement('div');
    wrap.className = 'v7-home__side';

    const news = document.createElement('button');
    news.type = 'button';
    news.className = 'v7-home__sidebtn';
    news.textContent = 'お知らせ';
    /* ★v0.9 Phase 6：文字が枠に入りきらないので絵にします。
       ★意味は消しません。読み上げと、指を置いたときの表示に残ります。 */
    if (typeof UiIcons !== 'undefined') UiIcons.apply(news, 'news', 'お知らせ');
    news.addEventListener('click', function () {
      // お知らせ一覧画面は Stage 3。ここでは仮の一覧をダイアログで見せる。
      const lines = (typeof V7_NEWS !== 'undefined' ? V7_NEWS : [])
        .map(function (n) { return '【' + n.category + '】' + n.title; })
        .join('\n');
      V7Dialog.open({
        title: 'お知らせ',
        body: (lines || '現在お知らせはありません。')
          + '\n\n※お知らせ一覧の画面は次の段階で作ります。',
        buttons: [{ label: '閉じる', kind: 'primary' }],
        dismissable: true,
      });
    });

    const present = document.createElement('button');
    present.type = 'button';
    present.className = 'v7-home__sidebtn';
    present.textContent = 'プレゼント';
    if (typeof UiIcons !== 'undefined') UiIcons.apply(present, 'present', 'プレゼント');
    present.addEventListener('click', function () {
      V7Dialog.comingSoon('プレゼント', V7_COMING_SOON.present);
    });

    wrap.appendChild(news);
    wrap.appendChild(present);
    return wrap;
  },

  /* -------------------------------------------------------------
     ミッションパネル（第7部 7.6）
     ------------------------------------------------------------- */
  _buildMissions: function () {
    const self = this;
    const panel = document.createElement('div');
    panel.className = 'v7-mission';

    // タブ
    const tabs = document.createElement('div');
    tabs.className = 'v7-mission__tabs';
    (typeof V7_MISSION_TABS !== 'undefined' ? V7_MISSION_TABS : []).forEach(function (t) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'v7-mission__tab';
      b.dataset.mtab = t.id;
      b.textContent = t.label;
      b.addEventListener('click', function () { self._selectMissionTab(t.id); });
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    // 一覧（枠内だけ縦スクロール：7.6）
    const list = document.createElement('div');
    list.className = 'v7-mission__list';
    list.id = 'v7-mission-list';
    panel.appendChild(list);

    return panel;
  },

  _selectMissionTab: function (tabId) {
    this._missionTab = tabId;
    const tabs = document.querySelectorAll('.v7-mission__tab');
    Array.prototype.forEach.call(tabs, function (b) {
      b.classList.toggle('is-on', b.dataset.mtab === tabId);
    });
    this._renderMissionList(tabId);
    // タブ切り替え時は先頭へ戻す（7.6）
    const list = document.getElementById('v7-mission-list');
    if (list) list.scrollTop = 0;
  },

  _renderMissionList: function (tabId) {
    const list = document.getElementById('v7-mission-list');
    if (!list) return;
    list.innerHTML = '';
    const items = (typeof V7_MISSIONS !== 'undefined' && V7_MISSIONS[tabId]) ? V7_MISSIONS[tabId] : [];
    items.forEach(function (m) {
      const row = document.createElement('div');
      row.className = 'v7-mission__row';
      const label = '<span class="v7-mission__text">' + m.text + '</span>';
      let right = '';
      if (m.state === 'progress') {
        right = '<span class="v7-mission__prog">' + (m.progress || '') + '</span>';
      } else if (m.state === 'claim') {
        right = '<button type="button" class="v7-mission__claim">受取</button>';
      } else if (m.state === 'done') {
        right = '<span class="v7-mission__done">受取済み</span>';
      } else {
        right = '<span class="v7-mission__prog">' + (m.progress || '') + '</span>';
      }
      row.innerHTML = label + '<span class="v7-mission__right">' + right + '</span>';
      row.dataset.state = m.state;
      const claim = row.querySelector('.v7-mission__claim');
      if (claim) claim.addEventListener('click', function () {
        V7Dialog.comingSoon('ミッション', V7_COMING_SOON.mission);
      });
      list.appendChild(row);
    });
  },

  /* ホームが表示されたとき */
  onShown: function () {
    // 初回だけミッションのデフォルトタブを描く
    this._selectMissionTab(this._missionTab || 'daily');
    this._applyBanner(false);
    this.resumeBanner();
  },
};

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V7Home: V7Home };
}
