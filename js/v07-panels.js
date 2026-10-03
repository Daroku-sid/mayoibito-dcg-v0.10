/* =====================================================================
   v07-panels.js ― 各タブの下部パネル（Stage 2）
   ---------------------------------------------------------------------
   仕様書 第7〜11部。ホームは中身が多いので V7Home へ委譲します。
   ここでは カード／対戦／ショップ／その他 の4タブを組みます。

   Stage 2 の約束（第27部 Stage2「行わない」）:
     ・個別画面の中身は作らない
     ・既存機能の本接続はしない（Stage 4）
     ・入口は仮ダイアログ or 準備中で受ける
   ===================================================================== */

'use strict';

const V7Panels = {

  build: function (tabId, root) {
    switch (tabId) {
      case 'home':  V7Home.build(root); break;
      case 'card':  this._buildCard(root); break;
      case 'battle': this._buildBattle(root); break;
      case 'shop':  this._buildShop(root); break;
      case 'other': this._buildOther(root); break;
    }
  },

  onShown: function (tabId) {
    if (tabId === 'home') V7Home.onShown();
  },

  /* 共通：大きなパネルボタンを作る */
  _panelBtn: function (label, opts) {
    opts = opts || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v7-card-panel'
      + (opts.big ? ' v7-card-panel--big' : '')
      + (opts.soon ? ' v7-card-panel--soon' : '');
    let inner = '<span class="v7-card-panel__label">' + label + '</span>';
    if (opts.arrow) inner += '<span class="v7-card-panel__arrow">▶</span>';
    if (opts.soon) inner += '<span class="v7-card-panel__badge">準備中</span>';
    btn.innerHTML = inner;
    if (opts.onClick) btn.addEventListener('click', opts.onClick);
    return btn;
  },

  /* =============================================================
     カードタブ（第8部）：左右1:1「デッキ一覧」「カード一覧」
     本接続は Stage 4。ここでは仮ダイアログ。
     ============================================================= */
  _buildCard: function (root) {
    root.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'v7-grid v7-grid--2';
    grid.appendChild(this._panelBtn('デッキ一覧', {
      big: true, arrow: true,
      onClick: function () {
        if (typeof V7Bridge !== 'undefined') {
          V7Bridge.openLegacy({ screen: 'deck-list', entryTab: 'card' });
        }
      },
    }));
    grid.appendChild(this._panelBtn('カード一覧', {
      big: true, arrow: true,
      onClick: function () {
        if (typeof V7Bridge !== 'undefined') {
          V7Bridge.openLegacy({ screen: 'card-list', entryTab: 'card' });
        }
      },
    }));
    root.appendChild(grid);
  },

  /* =============================================================
     対戦タブ（第9部）：左大ソロプレイ／右上オンライン／右下その他対戦
     選択画面（ソロ・オンライン・その他対戦）は Stage 3。
     ここでは仮ダイアログで内容を示す。
     ============================================================= */
  _buildBattle: function (root) {
    root.innerHTML = '';
    const layout = document.createElement('div');
    layout.className = 'v7-lr';   // 左大 + 右2段

    const left = this._panelBtn('ソロプレイ', {
      big: true,
      onClick: function () {
        if (typeof V7Screen !== 'undefined') V7Screen.open('solo');
      },
    });
    left.classList.add('v7-lr__main');

    const right = document.createElement('div');
    right.className = 'v7-lr__side';
    right.appendChild(this._panelBtn('オンライン', {
      onClick: function () {
        if (typeof V7Screen !== 'undefined') V7Screen.open('online');
      },
    }));
    right.appendChild(this._panelBtn('その他対戦', {
      onClick: function () {
        if (typeof V7Screen !== 'undefined') V7Screen.open('otherBattle');
      },
    }));

    layout.appendChild(left);
    layout.appendChild(right);
    root.appendChild(layout);
  },

  /* =============================================================
     ショップタブ（第10部）：左大カード購入／右上アイテム／右下プレミアム
     専用画面は作らず、各パネルで紹介付き準備中（10.2）。
     ============================================================= */
  _buildShop: function (root) {
    root.innerHTML = '';
    const layout = document.createElement('div');
    layout.className = 'v7-lr';

    const left = this._panelBtn('カード購入', {
      big: true, soon: true,
      onClick: function () {
        V7Dialog.comingSoon('カード購入', V7_COMING_SOON.shopCard);
      },
    });
    left.classList.add('v7-lr__main');

    const right = document.createElement('div');
    right.className = 'v7-lr__side';
    right.appendChild(this._panelBtn('アイテム・サプライ', {
      soon: true,
      onClick: function () {
        V7Dialog.comingSoon('アイテム・サプライ', V7_COMING_SOON.shopItem);
      },
    }));
    right.appendChild(this._panelBtn('プレミアムストア', {
      soon: true,
      onClick: function () {
        V7Dialog.comingSoon('プレミアムストア', V7_COMING_SOON.shopPremium);
      },
    }));

    layout.appendChild(left);
    layout.appendChild(right);
    root.appendChild(layout);
  },

  /* =============================================================
     その他タブ（第11部）：左右1:1「設定」「コレクション」
     設定ハブは Stage 3。コレクションは準備中（11.3）。
     ============================================================= */
  _buildOther: function (root) {
    root.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'v7-grid v7-grid--2';
    grid.appendChild(this._panelBtn('設定', {
      big: true, arrow: true,
      onClick: function () {
        if (typeof V7Screen !== 'undefined') V7Screen.open('settings');
      },
    }));
    grid.appendChild(this._panelBtn('コレクション', {
      big: true, soon: true,
      onClick: function () {
        V7Dialog.comingSoon('コレクション', V7_COMING_SOON.collection);
      },
    }));
    root.appendChild(grid);
  },
};

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V7Panels: V7Panels };
}
