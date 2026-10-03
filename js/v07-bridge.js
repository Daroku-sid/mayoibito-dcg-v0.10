/* =====================================================================
   v07-bridge.js ― v0.7 ハブと既存機能の橋渡し（Stage 4）
   ---------------------------------------------------------------------
   仕様書 第27部 Stage4・第17部（戻る統合）。

   役割:
     v0.7 の新しい導線（ハブ／個別画面）から、既存の対戦・カード・
     デッキ・チュートリアル・遊び方・開発者用モードへ安全につなぐ。

   設計の要:
     ・既存機能は独自の画面システム（Screens）と #start-screen レイヤー
       （z-index:180）で表示される。これは v0.7 の全レイヤーより前面。
       → 既存機能を開くと自動的に v0.7 ハブを覆い隠す。
     ・v0.7 から入るときは Screens を目的画面へ reset/goNow して開く。
     ・既存機能の最初の画面で「戻る」を押したら、v0.7 ハブの入口タブへ
       返す。既存 Screens.back() は壊さず、v0.7 が capture フェーズで
       先に判定して横取りする。
     ・対戦から抜ける唯一の出口 backToSetupScreen（preview.js）末尾に、
       v0.7 復帰フックを差してある（存在すれば v0.7 ハブへ返す）。

   重点保護（第27部）に触れないため:
     ・対戦ロジック／チュートリアル判定／デッキ保存／ドラッグ／CPU AI
       には一切手を入れない。呼び出しと戻り先の決定だけを担う。
   ===================================================================== */

'use strict';

const V7Bridge = {

  /* v0.7 から既存機能へ入っているか。入口の情報を持つ。 */
  _active: null,     // { screen, entryTab, guard } / 非アクティブ時は null

  _inited: false,
  _xfade: null,      // 行き来のときの暗転幕（body 直下）

  init: function () {
    if (this._inited) return;
    this._inited = true;
    this._makeXfade();
    this._bindBackCapture();
  },

  /* 暗転幕を1枚だけ作る（body 直下・両レイヤーより前面） */
  _makeXfade: function () {
    if (this._xfade) return;
    if (typeof document === 'undefined' || !document.body) return;
    const el = document.createElement('div');
    el.className = 'v7-xfade';
    el.id = 'v7-xfade';
    document.body.appendChild(el);
    this._xfade = el;
  },

  /* 0.4秒の暗転（0.2秒で黒→入れ替え→0.2秒で明ける）。
     v0.7 の画面遷移（V7Wipe）と同じ間合いに合わせる。 */
  _fade: function (midway, done) {
    const el = this._xfade;
    if (!el) { if (midway) midway(); if (done) done(); return; }
    const wait = function (key, fn, ms) {
      if (typeof V7Timers !== 'undefined' && V7Timers.set) V7Timers.set(key, fn, ms);
      else setTimeout(fn, ms);
    };
    el.classList.add('v7-on');
    wait('bridge-fade-mid', function () {
      if (midway) midway();
      wait('bridge-fade-out', function () {
        el.classList.remove('v7-on');
        if (done) done();
      }, 200);
    }, 200);
  },

  /** いま v0.7 経由で既存機能を開いているか */
  isActive: function () {
    return !!this._active;
  },

  /* =============================================================
     既存機能を開く（v0.7 の入口から呼ぶ）
     -------------------------------------------------------------
     opts = {
       screen:  既存の目的画面名（'cpu-setup' など）
       path:    そこへ到達するまでに積む画面の配列（省略時は [screen]）
       entryTab: 戻り先の v0.7 メインタブ（'card' / 'battle' / 'other'）
       guard:   'battle' | 'deck-edit' | null（戻る時の終了確認の種類）
     }
     ============================================================= */
  openLegacy: function (opts) {
    opts = opts || {};

    /* ★v0.8 Stage 5-2：CPU対戦の準備は新しい画面で出します（第16部）。
       設定の中身と対戦の始め方は既存のままです。 */
    if (opts.screen === 'cpu-setup' && typeof V8Prep !== 'undefined' &&
      typeof Screens !== 'undefined' && Screens.cpu && V8Prep.open()) {
      return true;
    }

    if (typeof Screens === 'undefined') {
      // 既存システムが無い環境（テスト等）では何もしない
      return false;
    }
    const entryTab = opts.entryTab
      || (typeof V7Hub !== 'undefined' ? V7Hub.current() : 'home');

    this._active = {
      screen: opts.screen,
      entryTab: entryTab,
      guard: opts.guard || null,
    };

    const self = this;
    const path = (opts.path && opts.path.length) ? opts.path : [opts.screen];

    /* ★v0.7 の個別画面スタックは畳まない。
       畳んでしまうと、既存機能から戻ったときに「一つ前の v0.7 画面」
       （例：CPU対戦設定 → トレーニングモード選択）が消えていて、
       メインハブまで戻りすぎてしまうため。器を隠すだけにする。 */
    this._fade(function () {
      // 既存スタックを組み立てて表示する
      Screens.reset(path[0]);
      for (let i = 1; i < path.length; i++) {
        Screens.goNow(path[i]);
      }

      // v0.7 の器（#v7-root）を隠して、既存 UI に画面を明け渡す。
      // 既存 UI は body 直下の #viewport 側にあり、#v7-root はその兄弟。
      self._hideV7Root(true);

      // 既存 UI は #stage を transform:scale で縮小表示している。
      // 画面サイズが変わっている場合に備えて倍率を計算し直す。
      try {
        if (typeof fitStage === 'function') fitStage();
      } catch (e) {}

      if (typeof Screens.riseIn === 'function') Screens.riseIn();
    });
    return true;
  },

  /** v0.7 の器（#v7-root）ごと隠す・戻す。
      既存 UI は body 直下の #viewport 側（#v7-root の兄弟）にあるため、
      v0.7 の器（position:fixed / z-index:1000）を隠すと既存画面が現れる。 */
  _hideV7Root: function (hide) {
    const root = document.getElementById('v7-root');
    if (root) root.classList.toggle('v7-hidden', !!hide);
  },

  /* =============================================================
     既存機能から v0.7 ハブへ戻る
     -------------------------------------------------------------
     既存メニューレイヤー（#start-screen）を閉じ、v0.7 ハブの
     入口タブを表示する。対戦の後片づけは呼び出し側（既存）が
     済ませている前提。
     ============================================================= */
  returnToHub: function () {
    if (!this._active) return false;
    const entryTab = this._active.entryTab || 'home';
    this._active = null;
    const self = this;

    this._fade(function () {
      // 既存メニューレイヤーを閉じる（#start-screen の is-open を外す）
      const startLayer = document.getElementById('start-screen');
      if (startLayer) {
        startLayer.classList.remove('is-open');
        // 中の各メニューの is-open も畳んでおく（次回のちらつき防止）
        const menus = startLayer.querySelectorAll('.menu');
        Array.prototype.forEach.call(menus, function (m) { m.classList.remove('is-open'); });
      }
      // カード詳細が開いていれば閉じる
      if (typeof CardListUI !== 'undefined' && CardListUI.closeDetail) {
        CardListUI.closeDetail();
      }

      // v0.7 の器を再表示する
      self._hideV7Root(false);

      /* ★v0.7 の個別画面が残っていれば、そのまま「一つ前の画面」へ戻る。
         （CPU対戦設定 → トレーニングモード選択 のように、
           入ってきた画面へ1段だけ戻る）
         個別画面を開かずにハブから直接入った場合（デッキ一覧など）は、
         入口タブのハブへ戻す。 */
      if (typeof V7Screen !== 'undefined' && V7Screen.isOpen()) {
        if (typeof V7Hub !== 'undefined' && V7Hub.onHubHidden) V7Hub.onHubHidden();
      } else if (typeof V7Hub !== 'undefined') {
        V7Hub.jumpTab(entryTab);
      }
    });
    return true;
  },

  /* =============================================================
     戻るの横取り（capture フェーズ）
     -------------------------------------------------------------
     既存メニューの「戻る」ボタン（data-back）が押されたとき、
     v0.7 経由で入っていて、かつ既存スタックが入口の1枚だけなら、
     既存の Screens.back() を走らせずに v0.7 ハブへ返す。
     ============================================================= */
  _bindBackCapture: function () {
    const self = this;
    document.addEventListener('click', function (ev) {
      if (!self._active) return;
      const btn = self._closestBack(ev.target);
      if (!btn) return;

      // 既存スタックが1枚（入口画面）なら、戻る＝v0.7 ハブへ
      if (typeof Screens !== 'undefined' && Screens.stack && Screens.stack.length <= 1) {
        // 終了確認が要る画面（対戦中・未保存デッキ編集）は
        // それぞれの画面側の確認に委ねるため、ここでは横取りしない。
        // （通常のメニュー画面のみ横取りする）
        ev.preventDefault();
        ev.stopPropagation();
        self.returnToHub();
      }
    }, true);   // ★capture フェーズ：既存リスナーより先に判定
  },

  /** クリック対象から data-back ボタンを遡って探す */
  _closestBack: function (el) {
    while (el && el !== document) {
      if (el.dataset && (el.dataset.back !== undefined)) return el;
      el = el.parentNode;
    }
    return null;
  },

  /* =============================================================
     既存機能中のブラウザー戻る（V7Screen._onPop から委譲される）
     -------------------------------------------------------------
     ・対戦盤面が進行中 → 既存のリタイア確認に委ねる（何もしない）
     ・デッキ編集で未保存 → 既存の未保存確認（tryLeave）に委ねる
     ・既存スタックが入口の1枚だけ → v0.7 ハブへ戻る
     ・複数枚 → 既存の1つ前の画面へ（Screens.back 相当）
     ============================================================= */
  handleBrowserBack: function () {
    /* ★v0.8 Stage 6-3：新しい対戦画面で何か開いていれば、
       手前のものから1つずつ閉じます（第20部）。
       閉じるものが無いときだけ、これまでどおりの動きになります。 */
    if (typeof V8Battle !== 'undefined' && V8Battle.onBack && V8Battle.onBack()) return;

    if (!this._active) return;
    if (typeof Screens === 'undefined') { this.returnToHub(); return; }

    // 対戦盤面が動いている最中は、既存のリタイア確認に任せる。
    // 盤面はメニューではないので、ここで勝手に抜けさせない（重点保護）。
    if (this._isBattleActive()) return;

    const cur = (Screens.current && Screens.current()) || null;

    // デッキ編集は未保存確認（tryLeave）へ委ねる
    if (cur === 'deck-edit' && typeof DeckEditorUI !== 'undefined' && DeckEditorUI.tryLeave) {
      DeckEditorUI.tryLeave();
      return;
    }

    // 入口の1枚だけなら v0.7 ハブへ、そうでなければ既存を1つ戻す
    if (Screens.stack && Screens.stack.length <= 1) {
      this.returnToHub();
    } else if (Screens.back) {
      Screens.back();
    }
  },

  /** 対戦盤面が進行中か（判定だけ・状態は触らない：重点保護） */
  _isBattleActive: function () {
    try {
      return (typeof play !== 'undefined' && play && play.active === true);
    } catch (e) {
      return false;
    }
  },
};

/* 既存の対戦出口 backToSetupScreen から呼ばれるフック。
   v0.7 経由なら true を返し、既存のメニュー復帰を肩代わりする。 */
if (typeof window !== 'undefined') {
  window.__v7ReturnFromLegacy = function () {
    if (V7Bridge.isActive()) {
      V7Bridge.returnToHub();
      return true;
    }
    return false;
  };
}

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V7Bridge: V7Bridge };
}
