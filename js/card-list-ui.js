/* =====================================================================
   card-list-ui.js  ―  カード一覧（v0.4 仕様書 16・30.3）
   ---------------------------------------------------------------------
   所持しているカードを6列で並べます。
   同じカードは1枚だけ出して、右下に「×4」と所持枚数を書きます。

   軽さのための決めごと:
     ・並べる画像はサムネイル（元画像の1/3）。拡大詳細だけ元画像を使う
     ・枠は最初に1回だけ作り、絞り込みのときは中身を差し替える
     ・カード種類は27しかないので、仮想スクロールは使わない
   ===================================================================== */

'use strict';

const CardListUI = {

  /* いまの絞り込み条件 */
  conditions: { text: '', trait: '', types: [], costs: [] },
  sortMode: 'default',

  built: false,

  /* =============================================================
     組み立て（起動時に1回）
     ============================================================= */
  build: function () {
    if (this.built) return;
    this.built = true;

    const self = this;

    /* ★カード名の欄だけは、打つたびにその場で効きます。
       ここは「探す」操作なので、結果がすぐ動いたほうが分かります。 */
    const search = document.getElementById('cardlist-search');
    if (search) {
      search.addEventListener('input', function () {
        self.conditions.text = search.value;
        self.render();
      });
    }

    /* ★絞り込みの板は共通部品です（js/ui-filter-sheet.js）。
       デッキ編集でも同じものを使います。
       ★写して2つに増やすと、片方だけ直して必ず食い違います。 */
    this.sheet = UiFilterSheet.create({
      scope: '#screen-card-list',
      ids: {
        panel: 'cardlist-filter-panel', scrim: 'cardlist-filter-scrim',
        toggle: 'cardlist-filter-toggle', badge: 'cardlist-filter-badge',
        reset: 'cardlist-clear', apply: 'cardlist-apply', trait: 'cardlist-trait',
      },
      get: function () { return { conditions: self.conditions, sortMode: self.sortMode }; },
      set: function (conditions, sortMode) { self.sortMode = sortMode; },
      onApply: function () { self.render(); },
    });
  },

  /* =============================================================
     描き直す
     ============================================================= */
  render: function () {
    const grid = document.getElementById('cardlist-grid');
    const fieldGrid = document.getElementById('cardlist-fields');
    if (!grid) return;

    const owned = Collection.list();     // フィールドと0コスト人間も含む（仕様書 16.2）
    const shown = CardFilter.apply(owned, this.conditions, this.sortMode);

    /* フィールドは横向きなので、縦向きのカードと同じ列には並べません。
       混ぜると1枚だけ形が違って列が崩れ、見た目が落ち着かないためです。
       区切りを入れて、後ろに4列で並べます。 */
    const portrait = shown.filter(function (id) { return CARD_MASTER[id].type !== 'field'; });
    const fields   = shown.filter(function (id) { return CARD_MASTER[id].type === 'field'; });

    const self = this;
    grid.innerHTML = '';
    portrait.forEach(function (cardId) { grid.appendChild(self.makeCell(cardId, false)); });

    if (fieldGrid) {
      fieldGrid.innerHTML = '';
      fields.forEach(function (cardId) { fieldGrid.appendChild(self.makeCell(cardId, true)); });
    }
    const sep = document.getElementById('cardlist-sep');
    if (sep) sep.classList.toggle('is-on', fields.length > 0);

    // 見つからなかったときの案内
    const empty = document.getElementById('cardlist-empty');
    if (empty) empty.classList.toggle('is-on', shown.length === 0);

    // 選ばれている絞り込みの見た目
    /* ★印を塗るのは板の部品にまかせます。
       ここでも塗ると、板を開いているあいだに
       「効いている条件」で上書きされてしまいます。 */
    if (this.sheet) this.sheet.paint();

    const count = document.getElementById('cardlist-count');
    if (count) count.textContent = shown.length + ' / ' + owned.length + ' 種類';
  },

  /** 1枚ぶんの枠。isField なら横向きの形にする */
  makeCell: function (cardId, isField) {
    const m = CARD_MASTER[cardId];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'clcard' + (isField ? ' clcard--field' : '');
    cell.dataset.cardId = cardId;

    const img = document.createElement('img');
    img.className = 'clcard__img';
    img.loading = 'lazy';                 // 画面外は後回しにする
    img.decoding = 'async';
    img.alt = m.name;
    const path = getCardThumbPath(cardId, m.faction);
    if (path) img.src = path;
    // 画像が読めなくても名前で分かるようにする（仕様書 30 の代替表示）
    img.addEventListener('error', function () {
      cell.classList.add('is-noimage');
      const alt = document.createElement('span');
      alt.className = 'clcard__alt';
      alt.textContent = m.name;
      cell.appendChild(alt);
    });
    cell.appendChild(img);

    const n = Collection.countOf(cardId);
    const badge = document.createElement('span');
    badge.className = 'clcard__count';
    badge.textContent = '×' + n;
    cell.appendChild(badge);

    const self = this;
    cell.addEventListener('click', function () {
      Se.play('button');
      self.openDetail(cardId);
    });
    return cell;
  },

  /* =============================================================
     拡大詳細（仕様書 16.3）
     -------------------------------------------------------------
     ここではデッキへの追加・削除ボタンを出しません。
     カード一覧は「持っているものを見る」場所で、
     編成はデッキ編成画面の仕事だからです。
     ============================================================= */
  openDetail: function (cardId) {
    const m = CARD_MASTER[cardId];
    const box = document.getElementById('card-detail');
    if (!box) return;

    const img = box.querySelector('.cdetail__img');
    const path = getCardImagePath(cardId, m.faction);   // ここだけ元画像
    img.src = path || '';
    img.alt = m.name;

    box.querySelector('.cdetail__name').textContent = m.name;

    const rows = [];
    rows.push(['種類', TYPE_LABEL[m.type] || m.type]);
    if (m.cost != null) rows.push(['コスト', String(m.cost)]);
    if (m.type === 'goods') {
      const b = m.equipBonus || {};
      const sp = b.speed ? (b.speed > 0 ? '+' + b.speed : String(b.speed)) : '+0';
      const hp = b.hp ? (b.hp > 0 ? '+' + b.hp : String(b.hp)) : '+0';
      rows.push(['補正', 'スピード' + sp + '／体力' + hp]);
      if (m.equipTo) rows.push(['装備の条件', m.equipTo]);
    } else if (m.speed != null) {
      rows.push(['スピード', String(m.speed)]);
      rows.push(['体力', String(m.hp)]);
    }
    if (m.traits && m.traits.length) {
      rows.push(['特徴', m.traits.map(function (t) { return '〔' + t + '〕'; }).join('')]);
    }
    rows.push(['所持枚数', Collection.countOf(cardId) + '枚']);

    const info = box.querySelector('.cdetail__info');
    info.innerHTML = '';
    rows.forEach(function (r) {
      const k = document.createElement('div');
      k.className = 'cdetail__key';
      k.textContent = r[0];
      const v = document.createElement('div');
      v.className = 'cdetail__val';
      v.textContent = r[1];
      info.appendChild(k);
      info.appendChild(v);
    });

    const fx = box.querySelector('.cdetail__effect');
    fx.textContent = (m.effect && m.effect !== '効果なし') ? m.effect : '';
    fx.classList.toggle('is-on', !!fx.textContent);

    box.classList.add('is-open');
  },

  closeDetail: function () {
    const box = document.getElementById('card-detail');
    if (box) box.classList.remove('is-open');
  },
};
