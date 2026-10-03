/* =====================================================================
   v07-shell.js ― v0.7 の器の土台（Stage 1）
   ---------------------------------------------------------------------
   仕様書 第4部（ローディング）・第15/16部（暗転/ダイアログ/通知）・
   第18部（アプリシェル/横向き）・第26部（タイマー一元管理）。

   ここは「器」だけを作ります。メインハブ本体・5タブ・共通一枚絵などの
   中身は Stage 2 以降。既存の Screens / preview.js には触れません。

   一元管理するタイマー（第26部 26.3）:
     ・ローディング最低1秒
     ・ローディングタイムアウト10秒
     ・通知4秒
   一枚絵10秒・バナー5秒は Stage 2 で同じ Timers に足します。
   ===================================================================== */

'use strict';

/* =====================================================================
   タイマーの一元管理（第26部 26.3）
   同じ名前のタイマーを二重に作らないよう、開始前に必ず解除します。
   ===================================================================== */
const V7Timers = {
  _t: {},
  set: function (name, fn, ms) {
    this.clear(name);
    this._t[name] = setTimeout(function () {
      delete V7Timers._t[name];
      fn();
    }, ms);
  },
  clear: function (name) {
    if (this._t[name]) {
      clearTimeout(this._t[name]);
      delete this._t[name];
    }
  },
  clearAll: function () {
    Object.keys(this._t).forEach(function (n) { V7Timers.clear(n); });
  },
  has: function (name) { return !!this._t[name]; },
};

/* =====================================================================
   短時間通知（第16部 16.3）
   1件ずつ順番に表示。表示中の新規は待機列へ。約4秒で自動消去。
   ===================================================================== */
const V7Toast = {
  _queue: [],
  _showing: false,
  _area: null,

  init: function (area) { this._area = area; },

  /** text を通知に積む。opts.dedupe=true なら直前と同じ内容はまとめる */
  push: function (text, opts) {
    opts = opts || {};
    if (opts.dedupe) {
      const last = this._queue[this._queue.length - 1];
      if (last === text) return;
    }
    this._queue.push(text);
    this._pump();
  },

  _pump: function () {
    if (this._showing) return;
    if (!this._queue.length) return;
    if (!this._area) return;
    this._showing = true;

    const text = this._queue.shift();
    const el = document.createElement('div');
    el.className = 'v7-toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    this._area.appendChild(el);
    // 表示アニメーション
    void el.offsetWidth;
    el.classList.add('v7-in');

    V7Timers.set('toast', function () {
      el.classList.remove('v7-in');
      V7Timers.set('toast-remove', function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        V7Toast._showing = false;
        V7Toast._pump();               // 次の1件へ
      }, 220);
    }, 4000);
  },
};

/* =====================================================================
   暗転レイヤー（第15部 15.2）
   0.2秒で黒 → 切替 → 0.2秒で戻す。進む・戻るで同じ演出。
   ===================================================================== */
const V7Wipe = {
  _el: null,
  init: function (el) { this._el = el; },

  /** midway() を暗転の頂点で1回だけ呼び、その後あける。 */
  run: function (midway, done) {
    const el = this._el;
    if (!el) { if (midway) midway(); if (done) done(); return; }
    el.classList.add('v7-on');
    V7Timers.set('wipe-mid', function () {
      if (midway) midway();
      V7Timers.set('wipe-open', function () {
        el.classList.remove('v7-on');
        if (done) done();
      }, 200);
    }, 200);
  },
};

/* =====================================================================
   ダイアログ（第16部 16.1/16.2）
   ---------------------------------------------------------------------
   準備中ダイアログ（1ボタン・暗幕タップで閉じる）と、
   重要確認ダイアログ（2ボタン・暗幕タップでは閉じない）の土台。
   Stage 1 では汎用の open() だけ用意し、文言や用途は後段で足します。
   ===================================================================== */
const V7Dialog = {
  _scrim: null,
  _box: null,
  _titleEl: null,
  _bodyEl: null,
  _btnWrap: null,
  _current: null,               // 開いているダイアログの設定
  _onScrimTap: null,

  init: function (scrim, box, titleEl, bodyEl, btnWrap) {
    this._scrim = scrim;
    this._box = box;
    this._titleEl = titleEl;
    this._bodyEl = bodyEl;
    this._btnWrap = btnWrap;

    const self = this;
    // 暗幕タップ：dismissable なら閉じる（16.1）。確認ダイアログは無視（16.2）
    scrim.addEventListener('pointerdown', function (e) {
      if (e.target !== scrim) return;          // 本体の上は無視
      if (!self._current) return;
      if (self._current.dismissable) self.close();
    });
  },

  isOpen: function () { return !!this._current; },

  /* opts = {
       title, body,
       buttons: [{ label, kind:'primary'|'danger'|'', onClick }],
       dismissable: bool          // 暗幕タップ・戻るで閉じられるか
     } */
  open: function (opts) {
    opts = opts || {};
    this._current = opts;
    this._titleEl.textContent = opts.title || '';
    this._bodyEl.textContent = opts.body || '';

    // ボタンを組み直す
    const wrap = this._btnWrap;
    wrap.innerHTML = '';
    const buttons = opts.buttons && opts.buttons.length
      ? opts.buttons
      : [{ label: '閉じる', kind: 'primary' }];
    wrap.classList.toggle('v7-single', buttons.length === 1);

    const self = this;
    buttons.forEach(function (b) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v7-dialog__btn'
        + (b.kind === 'primary' ? ' v7-primary' : '')
        + (b.kind === 'danger' ? ' v7-danger' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        const fn = b.onClick;
        self.close();
        if (fn) fn();
      });
      wrap.appendChild(btn);
    });

    this._scrim.classList.add('v7-on');
  },

  /** 便利メソッド：準備中ダイアログ（1ボタン・閉じられる：第2部/16.1） */
  comingSoon: function (title, body) {
    this.open({
      title: title || '準備中',
      body: body || 'この機能は準備中です。',
      buttons: [{ label: '閉じる', kind: 'primary' }],
      dismissable: true,
    });
  },

  /** 便利メソッド：確認（2ボタン・暗幕では閉じない：16.2） */
  confirm: function (opts) {
    opts = opts || {};
    this.open({
      title: opts.title || '確認',
      body: opts.body || '',
      buttons: [
        { label: opts.cancelLabel || 'キャンセル', kind: '', onClick: opts.onCancel },
        {
          label: opts.confirmLabel || '実行',
          kind: opts.danger ? 'danger' : 'primary',
          onClick: opts.onConfirm,
        },
      ],
      dismissable: false,
    });
  },

  /** 戻る操作でのキャンセル（17.3）。閉じられるものだけ閉じる。 */
  handleBack: function () {
    if (!this._current) return false;
    if (this._current.dismissable) {
      this.close();
      return true;
    }
    // 確認ダイアログ：戻るはキャンセル扱い（17.3）
    const c = this._current;
    this.close();
    if (c.buttons) {
      // キャンセル（左ボタン）の onClick を呼ぶ
      const cancel = c.buttons[0];
      if (cancel && cancel.onClick) cancel.onClick();
    }
    return true;
  },

  close: function () {
    this._current = null;
    this._scrim.classList.remove('v7-on');
  },
};

/* =====================================================================
   V7Shell ― 器全体の制御と起動
   ===================================================================== */
const V7Shell = {

  _els: {},
  _bootDone: false,

  /* -------------------------------------------------------------
     起動（第4部）
     ------------------------------------------------------------- */
  boot: function () {
    this._cacheEls();
    this._catchFatal();

    // 部品を初期化
    V7Toast.init(this._els.toastArea);
    V7Wipe.init(this._els.wipe);
    V7Dialog.init(
      this._els.scrim, this._els.dialog,
      this._els.dialogTitle, this._els.dialogBody, this._els.dialogButtons
    );

    // 個別画面レイヤー（Stage 3）を shell 内に用意する
    if (typeof V7Screen !== 'undefined' && this._els.shell) {
      V7Screen.init(this._els.shell);
    }

    // 既存機能への橋渡し（Stage 4）を初期化する
    if (typeof V7Bridge !== 'undefined') {
      V7Bridge.init();
    }

    // ★v0.8 Stage 1：新しい対戦画面のレイヤーを器の中へ足す。
    //   通常の導線からは開かない（Stage 2 でつなぐ）。
    if (typeof V8Battle !== 'undefined' && this._els.shell) {
      V8Battle.init(this._els.shell);
    }

    // ローディング文字を1文字ずつ span で包む（ウェーブ用）
    this._buildLoadingText();

    // セーブを読み込む（無ければ初期データ＋ローカルID生成：第20部）
    V7Save.load();

    // ブラウザーの表示/非表示でタイマーを止める土台（第5部 5.7 の考え方）
    this._setupVisibility();

    // ★v0.8：まずタイトル画面を出す。タップされてから読み込みへ進む。
    //   タイトル → タップ → 読み込み中 → メインハブ
    this._showTitle();
  },

  /* =============================================================
     ★思いがけない失敗を受け止める（v0.9・仕様書 12.3）
     -------------------------------------------------------------
     ★ブラウザ標準のエラー表示は使いません。
       英語の専門用語がそのまま出て、遊ぶ人には何も分かりません。
       しかも「次に何ができるか」が示されません。

     ここでは短い見出し・やさしい説明・やり直す道を出します。
     ★開発者向けの中身は、そのままは見せません。
       「詳しく」を押したときだけ出します。
     ============================================================= */
  _fatalShown: false,

  _catchFatal: function () {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const self = this;
    window.addEventListener('error', function (e) {
      self.showFatal(e && e.message, e && e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', function (e) {
      const r = e && e.reason;
      self.showFatal(r && (r.message || String(r)), r && r.stack);
    });
  },

  /**
   * @param {string} [detail] 開発者向けの中身。そのままは見せません
   * @param {string} [stack]
   */
  showFatal: function (detail, stack) {
    /* ★同じ失敗で何度も出さないこと。
       1つの不具合で通知が積み重なると、かえって何も分かりません。 */
    if (this._fatalShown) return;
    this._fatalShown = true;

    const body = '画面の表示中に問題が起きました。\n' +
      'もう一度読み込むと直ることがあります。\n\n' +
      '直らないときは、設定の「データ管理」から\n' +
      'データを書き出しておくと安心です。';

    const buttons = [
      {
        label: 'もう一度読み込む', kind: 'primary',
        onClick: function () {
          if (typeof location !== 'undefined' && location.reload) location.reload();
        },
      },
      { label: '閉じる' },
    ];

    /* ★中身は、押したときだけ出します（仕様書 12.3） */
    const text = [detail, stack].filter(Boolean).join('\n');
    if (text) {
      buttons.push({
        label: '詳しく',
        onClick: function () {
          if (typeof V7Dialog !== 'undefined') {
            V7Dialog.open({ title: '詳しい内容', body: text, buttons: [{ label: '閉じる' }] });
          }
        },
      });
    }

    if (typeof V7Dialog !== 'undefined' && V7Dialog.open) {
      V7Dialog.open({ title: '問題が起きました', body: body, buttons: buttons });
      /* ★閉じたら、また出せるようにします。
         1回きりにすると、次の失敗に気づけません。 */
      const self = this;
      V7Timers.set('fatal-reset', function () { self._fatalShown = false; }, 4000);
    }
  },

  /* -------------------------------------------------------------
     ★v0.8：タイトル画面（起動の入口）
     -------------------------------------------------------------
     ・毎回表示する（作者指定）
     ・版は version.js から入れる。ここにベタ書きすると取り残される
     ・タイトルが無い環境（テストの簡易DOMなど）では、そのまま読み込みへ
     ------------------------------------------------------------- */
  _titleDone: false,

  _showTitle: function () {
    const self = this;
    const el = this._els.title;

    if (this._els.titleVersion && typeof APP_VERSION_LABEL !== 'undefined') {
      this._els.titleVersion.textContent = APP_VERSION_LABEL;
    }

    if (!el) { this._startLoading(); return; }

    el.onclick = function () { self._leaveTitle(); };

    /* ★PC では Enter でも始められるようにします（仕様書 12.1）。
       ★画面全体がボタンなので、キーボードだけの人には
         「どこを押せばいいか」が分かりません。 */
    this._titleKey = function (e) {
      if (self._titleDone) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        self._leaveTitle();
      }
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('keydown', this._titleKey);
    }
  },

  /** タイトルから読み込みへ進む。二度押しは無視する。 */
  _leaveTitle: function () {
    if (this._titleDone) return;
    this._titleDone = true;
    if (this._titleKey && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('keydown', this._titleKey);
      this._titleKey = null;
    }

    const el = this._els.title;
    if (el) {
      el.classList.add('v8-title--fade');
      V7Timers.set('title-hide', function () {
        el.style.display = 'none';
      }, 480);
    }

    // ここから読み込み開始。最低1秒（4.1）はタップした時点から数える。
    this._startLoading();
  },

  _cacheEls: function () {
    const g = function (id) { return document.getElementById(id); };
    this._els = {
      root: g('v7-root'),
      loading: g('v7-loading'),
      title: g('v8-title'),
      titleVersion: g('v8-title-version'),
      loadingText: g('v7-loading-text'),
      loadingRetry: g('v7-loading-retry'),
      wipe: g('v7-wipe'),
      scrim: g('v7-scrim'),
      dialog: g('v7-dialog'),
      dialogTitle: g('v7-dialog-title'),
      dialogBody: g('v7-dialog-body'),
      dialogButtons: g('v7-dialog-buttons'),
      toastArea: g('v7-toast-area'),
      home: g('v7-home-placeholder'),
      shell: g('v7-shell'),
    };
  },

  _buildLoadingText: function () {
    const el = this._els.loadingText;
    if (!el) return;
    const text = '読み込み中...';
    el.innerHTML = '';
    for (let i = 0; i < text.length; i++) {
      const s = document.createElement('span');
      s.textContent = text[i];
      s.style.animationDelay = (i * 0.08) + 's';
      el.appendChild(s);
    }
  },

  /* -------------------------------------------------------------
     ローディング（第4部 4.1）
       ・最低1秒表示
       ・10秒でタイムアウト → 失敗表示＋再読み込み
     Stage 1 では「必須データ」を器の準備完了とみなします。
     （既存ゲーム本体の読み込みは Stage 4 の接続時に組み込みます）
     ------------------------------------------------------------- */
  _loadingStartAt: 0,
  _essentialReady: false,

  _startLoading: function () {
    const self = this;
    this._loadingStartAt = Date.now();
    this._essentialReady = false;

    // 失敗表示の再読み込みボタン（連打防止）
    if (this._els.loadingRetry) {
      this._els.loadingRetry.onclick = function () {
        if (self._els.loadingRetry.disabled) return;
        self._els.loadingRetry.disabled = true;
        self._retryLoading();
      };
    }

    // 最低1秒（4.1）
    V7Timers.set('load-min', function () {
      self._tryFinishLoading();
    }, 1000);

    // タイムアウト10秒（4.1）
    V7Timers.set('load-timeout', function () {
      if (!self._essentialReady) self._showLoadingFail();
    }, 10000);

    // 必須データの準備（Stage 1 は器のみ。ほぼ即完了）
    this._prepareEssential(function () {
      self._essentialReady = true;
      self._tryFinishLoading();
    });
  },

  /** 必須データの準備（第4部 4.2）。Stage 1 では器の設定のみ。 */
  _prepareEssential: function (done) {
    // ここで必須データ（本体スクリプト・CSS・カードデータ・保存初期化・
    // ハブ最低限の設定）がそろっていることを確認する。
    // Stage 1 時点では、これらはスクリプト読み込み時点でそろっているため、
    // 次フレームで完了として扱う。
    V7Timers.set('load-essential', function () { done(); }, 0);
  },

  _tryFinishLoading: function () {
    // 最低1秒経過 かつ 必須データ準備完了、の両方で先へ進む
    if (V7Timers.has('load-min')) return;      // まだ1秒経っていない
    if (!this._essentialReady) return;         // まだ準備できていない
    this._finishLoading();
  },

  _finishLoading: function () {
    V7Timers.clear('load-timeout');
    this._bootDone = true;

    const loading = this._els.loading;
    const home = this._els.home;

    // 起動後はメインハブを表示し、初期化する（Stage 2）。
    // ローディング画面がまだ手前を覆っているので、この描き込みは見えない。
    if (home) home.classList.add('v7-on');
    if (typeof V7Hub !== 'undefined') V7Hub.init();

    /* ★v0.8 Stage 2-2：対戦が始まったら、新しい盤面が自動で出ます。
       確認用の切り替えボタンと #v08board の入口は廃止しました。
       出し入れは V8Battle.sync() が判断します（preview.js の renderAll から
       知らせが来ます）。ここでは念のため1回だけ様子を見ます。 */
    if (typeof V8Battle !== 'undefined') V8Battle.sync();

    if (!loading) return;

    // ローディング画面（黒）を、通常の暗転より少しゆっくり（0.7秒）
    // フェードアウトさせて、下のホームを見せる（要望の演出）。
    // トランジションを確実に発火させるため、現在の状態（opacity:1）を
    // 1フレーム描画させてから、次フレームで晴れクラスを付ける。
    const raf = (typeof window !== 'undefined' && window.requestAnimationFrame)
      ? window.requestAnimationFrame.bind(window)
      : function (fn) { return V7Timers.set('raf-fallback', fn, 16); };

    raf(function () {
      raf(function () {
        loading.classList.add('v7-loading--fade');   // 0.7秒かけて opacity:0 へ
        // 晴れ切ったら表示から外す（トランジション後）
        V7Timers.set('load-hide', function () {
          loading.style.display = 'none';
        }, 760);
      });
    });
  },

  _showLoadingFail: function () {
    const loading = this._els.loading;
    if (loading) loading.classList.add('v7-failed');
  },

  _retryLoading: function () {
    // ブラウザー全体を更新せずに、読み込みを最初からやり直す（4.1）
    const self = this;
    const loading = this._els.loading;
    if (loading) {
      loading.classList.remove('v7-failed');
      loading.classList.remove('v7-loading--fade');
      loading.style.opacity = '1';
      loading.style.display = 'flex';
    }
    V7Timers.clearAll();
    // ボタンを戻す
    if (this._els.loadingRetry) this._els.loadingRetry.disabled = false;
    this._startLoading();
  },

  /* -------------------------------------------------------------
     ブラウザー表示/非表示でタイマーを止める土台（第5部 5.7）
     Stage 1 では通知の連続表示に絞って安全側に。
     一枚絵10秒・バナー5秒の停止/再開は Stage 2 で足します。
     ------------------------------------------------------------- */
  _setupVisibility: function () {
    document.addEventListener('visibilitychange', function () {
      // Stage 2 でハブのタイマー停止/再開をここへ足す。
      // Stage 1 では特に止めるハブタイマーが無いので何もしない。
    });
  },
};

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    V7Timers: V7Timers,
    V7Toast: V7Toast,
    V7Wipe: V7Wipe,
    V7Dialog: V7Dialog,
    V7Shell: V7Shell,
  };
}
