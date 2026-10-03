/* =====================================================================
   deck-editor-ui.js  ―  デッキ編成（v0.4 仕様書 15・30.5）
   ---------------------------------------------------------------------
   40枠へカードを出し入れする画面です。

   ★軽く動かすための3つの決めごと
     1. 並べる画像はサムネイル（元画像の1/3）
        → 展開後のメモリが9分の1になります

     2. 40枠は最初に1回だけ作り、あとは中身だけ差し替える
        並び順が決まっているので1枚足すと後ろがずれますが、
        「変わった枠だけ」を書き換えます。
        枠そのものを作り直すと、毎回40個のDOMが捨てられて
        カクつきの原因になります。

     3. ドラッグ中は盤面に触らない
        指で動かすのは半透明の影1枚だけ。transform で動かすので
        レイアウトの計算が起きません。離した瞬間に初めて枠を更新します。

   デッキ編集は「1枚差し替える」を何十回も繰り返す画面なので、
   1回の操作の重さがそのまま体験の重さになります。
   ===================================================================== */

'use strict';

const DeckEditorUI = {

  /* 編集中のデッキ（保存するまで元データには触りません） */
  deck: null,
  isNew: false,

  /* 40枠のDOM。最初に1回だけ作って使い回します */
  slots: [],
  slotIds: [],        // いま各枠に入っているカードID（差分を取るために持つ）

  /* 下の帯の絞り込み */
  conditions: { text: '', trait: '', types: [], costs: [] },
  sortMode: 'default',

  /* ドラッグ中の状態 */
  drag: null,

  built: false,

  /* =============================================================
     組み立て（起動時に1回）
     ============================================================= */
  build: function () {
    if (this.built) return;
    this.built = true;
    const self = this;

    // 40枠を先に作る
    const grid = document.getElementById('deckedit-grid');
    if (grid) {
      grid.innerHTML = '';
      for (let i = 0; i < DeckValidator.MAIN_DECK_SIZE; i++) {
        const slot = this.makeSlot(i);
        this.slots.push(slot);
        this.slotIds.push(null);
        grid.appendChild(slot);
      }
    }

    const name = document.getElementById('deckedit-name');
    if (name) {
      name.addEventListener('input', function () {
        if (self.deck) self.deck.name = name.value;
      });
    }

    const save = document.getElementById('deckedit-save');
    if (save) save.addEventListener('click', function () { Se.play('button'); self.save(); });

    const back = document.getElementById('deckedit-back');
    if (back) back.addEventListener('click', function () { self.tryLeave(); });

    const field = document.getElementById('deckedit-field');
    if (field) {
      field.addEventListener('click', function () {
        Se.play('button');
        FieldPickerUI.open();
      });
    }

    /* ★カード名の欄だけは、打つたびにその場で効きます。
       ここは「探す」操作なので、結果がすぐ動いたほうが分かります。 */
    const search = document.getElementById('deckedit-search');
    if (search) {
      search.addEventListener('input', function () {
        self.conditions.text = search.value;
        self.renderBand();
      });
    }

    /* ★絞り込みの板は、カード一覧とまったく同じ部品です
       （js/ui-filter-sheet.js）。
       ★写して2つに増やすと、片方だけ直して必ず食い違います。 */
    this.sheet = UiFilterSheet.create({
      scope: '#screen-deck-edit',
      ids: {
        panel: 'deckedit-filter-panel', scrim: 'deckedit-filter-scrim',
        toggle: 'deckedit-filter-toggle', badge: 'deckedit-filter-badge',
        reset: 'deckedit-clear', apply: 'deckedit-apply', trait: 'deckedit-trait',
      },
      get: function () { return { conditions: self.conditions, sortMode: self.sortMode }; },
      set: function (conditions, sortMode) { self.sortMode = sortMode; },
      onApply: function () { self.renderBand(); },
    });

    // 詳細画面からの追加・削除（仕様書 15.4）
    const addBtn = document.getElementById('dedetail-add');
    if (addBtn) addBtn.addEventListener('click', function () {
      Se.play('button');
      self.addCard(self.detailCardId);
      self.openDetail(self.detailCardId);
    });
    const delBtn = document.getElementById('dedetail-remove');
    if (delBtn) delBtn.addEventListener('click', function () {
      Se.play('button');
      self.removeCard(self.detailCardId);
      self.openDetail(self.detailCardId);
    });
    const closeBtn = document.getElementById('dedetail-close');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      Se.play('button');
      self.closeDetail();
    });
  },

  /* =============================================================
     編集を始める
     ============================================================= */
  open: function (deckId, isNew) {
    const src = DeckManager.byId(deckId);
    if (!src) return;
    // 編集中は写しを触ります。保存するまで元は変えません
    this.deck = JSON.parse(JSON.stringify(src));
    this.isNew = !!isNew;
    this.closeDetail();
    Screens.go('deck-edit');
  },

  /* =============================================================
     画面を描く
     ============================================================= */
  render: function () {
    if (!this.deck) return;

    const name = document.getElementById('deckedit-name');
    if (name && name.value !== this.deck.name) name.value = this.deck.name;

    const save = document.getElementById('deckedit-save');
    if (save) save.textContent = this.isNew ? '登録' : '保存';

    this.renderField();
    this.renderSlots();
    this.renderCounts();
    this.renderBand();
  },

  renderField: function () {
    const box = document.getElementById('deckedit-field');
    if (!box) return;
    box.innerHTML = '';
    const id = this.deck.fieldId;
    if (id && CARD_MASTER[id]) {
      const img = document.createElement('img');
      img.src = getCardThumbPath(id, CARD_MASTER[id].faction) || '';
      img.alt = CARD_MASTER[id].name;
      box.appendChild(img);
      box.classList.remove('is-empty');
    } else {
      box.classList.add('is-empty');
      const t = document.createElement('span');
      t.className = 'dedit__fieldhint';
      t.textContent = 'タップしてフィールドを選ぶ';
      box.appendChild(t);
    }
  },

  /* -------------------------------------------------------------
     40枠。変わったところだけ書き換える（軽さの対策2）
     ------------------------------------------------------------- */
  renderSlots: function () {
    const ids = DeckManager.expand(this.deck);
    const ace = this.deck.aceCardId;
    const hero = DeckValidator.heroOf(this.deck.fieldId);

    for (let i = 0; i < this.slots.length; i++) {
      const want = (i < ids.length) ? ids[i] : null;
      const slot = this.slots[i];

      // 中身が同じ枠は触らない
      if (this.slotIds[i] === want) {
        slot.classList.toggle('is-ace', !!want && want === ace);
        continue;
      }
      this.slotIds[i] = want;
      slot.dataset.cardId = want || '';
      slot.innerHTML = '';

      if (!want) {
        slot.className = 'dslot is-blank';
        continue;
      }
      const m = CARD_MASTER[want];
      slot.className = 'dslot' +
        (want === ace ? ' is-ace' : '') +
        (want === hero ? ' is-hero' : '');

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = m.name;
      img.src = getCardThumbPath(want, m.faction) || '';
      slot.appendChild(img);

      if (want === hero) {
        /* 主人公は外せないカードです。
           以前は「主」という文字を出していましたが、
           錠前のマークに変えました（v0.5.7）。
           形そのものが「外せない」を表すので、字を読まずに伝わります。

           絵文字は端末ごとに見た目が変わるので、CSSで描いています。
           読み上げ用に、文字での説明だけ持たせておきます。 */
        const lock = document.createElement('span');
        lock.className = 'dslot__lock';
        lock.setAttribute('aria-label', '主人公（デッキから外せません）');
        lock.title = '主人公（デッキから外せません）';
        slot.appendChild(lock);
      }
    }
  },

  renderCounts: function () {
    const r = DeckValidator.check(this.deck);
    const box = document.getElementById('deckedit-counts');
    if (box) {
      const c = r.counts;
      box.innerHTML = '';
      [['人間', c.human], ['怪異', c.youkai], ['グッズ', c.goods],
       ['イベント', c.event], ['合計', r.total + '/40']].forEach(function (p) {
        const el = document.createElement('div');
        el.className = 'dedit__count' + (p[0] === '合計' ? ' dedit__count--total' : '');
        const key = document.createElement('span');
        key.textContent = p[0];
        const val = document.createElement('span');
        val.textContent = String(p[1]);
        el.appendChild(key);
        el.appendChild(val);
        box.appendChild(el);
      });
    }
    const state = document.getElementById('deckedit-state');
    if (state) {
      state.textContent = r.usable ? '対戦で使えます' : DeckValidator.shortReason(r);
      state.classList.toggle('is-ng', !r.usable);
    }
  },

  /* -------------------------------------------------------------
     下の所持カード帯
     ------------------------------------------------------------- */
  renderBand: function () {
    const band = document.getElementById('deckedit-band');
    if (!band) return;

    // 0コスト人間とフィールドは候補に出しません（制作者の判断）。
    // フィールドを選ぶと主人公が自動で入り、外せないためです。
    const owned = Collection.listForDeckEditor();
    const shown = CardFilter.apply(owned, this.conditions, this.sortMode);

    band.innerHTML = '';
    const self = this;
    shown.forEach(function (cardId) {
      band.appendChild(self.makeBandCard(cardId));
    });

    /* ★印を塗るのは板の部品にまかせます。
       ここでも塗ると、板を開いているあいだに
       「効いている条件」で上書きされてしまいます。 */
    if (this.sheet) this.sheet.paint();
  },

  makeBandCard: function (cardId) {
    const m = CARD_MASTER[cardId];
    const el = document.createElement('div');
    el.className = 'dband__card';
    el.dataset.cardId = cardId;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = m.name;
    img.src = getCardThumbPath(cardId, m.faction) || '';
    el.appendChild(img);

    const n = document.createElement('span');
    n.className = 'dband__num';
    el.appendChild(n);
    this.updateBandNum(el, cardId);

    const self = this;
    attachPointer(el, {
      onTap: function () { Se.play('button'); self.openDetail(cardId); },
      onDragStart: function (e) { self.startDrag(e, cardId, 'band'); },
      onDragMove: function (e) { self.moveDrag(e); },
      onDragEnd: function (e) { self.endDrag(e); },
      // 横になぞったときは帯のスクロールに任せる（仕様書 15.4）
      onScrubMove: function () {},
    });
    return el;
  },

  updateBandNum: function (el, cardId) {
    const n = el.querySelector('.dband__num');
    if (!n) return;
    const inDeck = this.countInDeck(cardId);
    const max = Collection.maxInDeck(cardId);
    n.textContent = inDeck + '/' + max;
    el.classList.toggle('is-full', inDeck >= max);
  },

  refreshBandNums: function () {
    const self = this;
    document.querySelectorAll('#deckedit-band .dband__card').forEach(function (el) {
      self.updateBandNum(el, el.dataset.cardId);
    });
  },

  /* -------------------------------------------------------------
     40枠1つぶん
     ------------------------------------------------------------- */
  makeSlot: function (index) {
    const slot = document.createElement('div');
    slot.className = 'dslot is-blank';
    slot.dataset.index = String(index);

    const self = this;
    attachPointer(slot, {
      onTap: function () {
        const id = slot.dataset.cardId;
        if (!id) return;
        Se.play('button');
        self.openDetail(id);
      },
      onLongPress: function () {
        const id = slot.dataset.cardId;
        if (!id) return;
        self.setAce(id);
      },
      onDragStart: function (e) {
        const id = slot.dataset.cardId;
        if (!id) return;
        self.startDrag(e, id, 'slot');
      },
      onDragMove: function (e) { self.moveDrag(e); },
      onDragEnd: function (e) { self.endDrag(e); },
    });
    return slot;
  },

  /* =============================================================
     ドラッグ（軽さの対策3）
     -------------------------------------------------------------
     動かすのは影1枚だけ。40枠には触りません。
     ============================================================= */
  startDrag: function (e, cardId, from) {
    const m = CARD_MASTER[cardId];
    if (!m) return;

    const ghost = document.createElement('div');
    ghost.className = 'dghost';
    const img = document.createElement('img');
    img.src = getCardThumbPath(cardId, m.faction) || '';
    ghost.appendChild(img);
    document.getElementById('stage').appendChild(ghost);

    this.drag = { cardId: cardId, from: from, ghost: ghost };
    document.body.classList.add('is-deckdrag');
    this.moveDrag(e);
  },

  moveDrag: function (e) {
    if (!this.drag) return;
    const stage = document.getElementById('stage');
    const rect = stage.getBoundingClientRect();
    const scale = rect.width / STAGE_W;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    // transform だけを変える。レイアウトの計算は起きません
    this.drag.ghost.style.transform =
      'translate(' + (x - 62) + 'px,' + (y - 86) + 'px)';

    // 落とし先を光らせる
    const overDeck = this.isOverDeck(e);
    const grid = document.getElementById('deckedit-grid');
    const band = document.getElementById('deckedit-band');
    if (grid) grid.classList.toggle('is-target', this.drag.from === 'band' && overDeck);
    if (band) band.classList.toggle('is-target', this.drag.from === 'slot' && !overDeck);
  },

  endDrag: function (e) {
    if (!this.drag) return;
    const d = this.drag;
    d.ghost.remove();
    this.drag = null;
    document.body.classList.remove('is-deckdrag');
    const grid = document.getElementById('deckedit-grid');
    const band = document.getElementById('deckedit-band');
    if (grid) grid.classList.remove('is-target');
    if (band) band.classList.remove('is-target');

    const overDeck = this.isOverDeck(e);
    if (d.from === 'band' && overDeck) this.addCard(d.cardId);
    else if (d.from === 'slot' && !overDeck) this.removeCard(d.cardId);
  },

  isOverDeck: function (e) {
    const grid = document.getElementById('deckedit-grid');
    if (!grid || !e) return false;
    const r = grid.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right &&
           e.clientY >= r.top && e.clientY <= r.bottom;
  },

  /* =============================================================
     出し入れ（仕様書 15.5）
     ============================================================= */
  countInDeck: function (cardId) {
    if (!this.deck) return 0;
    const e = this.deck.mainDeck.filter(function (x) { return x.cardId === cardId; })[0];
    return e ? e.count : 0;
  },

  totalInDeck: function () {
    if (!this.deck) return 0;
    return this.deck.mainDeck.reduce(function (a, e) { return a + e.count; }, 0);
  },

  /** 追加できるか。できないなら理由を返す */
  canAdd: function (cardId) {
    if (!CARD_MASTER[cardId]) return '不明なカードです。';
    if (Collection.isZeroCostHuman(cardId)) {
      return 'コスト0の人間は、フィールドを選ぶと自動で入ります。';
    }
    if (this.totalInDeck() >= DeckValidator.MAIN_DECK_SIZE) {
      // 40枚で止めます（仕様書 15.5）。超過を保存できるようにすると
      // 「気づかないまま使えないデッキになる」事故が起きるためです
      return 'メインデッキは40枚までです。';
    }
    const max = Collection.maxInDeck(cardId);
    if (this.countInDeck(cardId) >= max) {
      const owned = Collection.countOf(cardId);
      return (max < Collection.MAX_SAME_CARD && max === owned)
        ? '所持しているのは' + owned + '枚です。'
        : '同じカードは' + max + '枚までです。';
    }
    return null;
  },

  addCard: function (cardId) {
    const ng = this.canAdd(cardId);
    if (ng) { showToast(ng); return false; }

    const e = this.deck.mainDeck.filter(function (x) { return x.cardId === cardId; })[0];
    if (e) e.count += 1;
    else this.deck.mainDeck.push({ cardId: cardId, count: 1 });

    Se.play('card');
    this.afterChange();
    return true;
  },

  removeCard: function (cardId) {
    // 対応する主人公は外せません（仕様書 15.6）
    if (cardId === DeckValidator.heroOf(this.deck.fieldId)) {
      showToast('対応する主人公はデッキから外せません。');
      return false;
    }
    const e = this.deck.mainDeck.filter(function (x) { return x.cardId === cardId; })[0];
    if (!e || e.count <= 0) return false;

    e.count -= 1;
    if (e.count === 0) {
      this.deck.mainDeck = this.deck.mainDeck.filter(function (x) { return x.cardId !== cardId; });
      // エースがデッキから消えたら設定を外す（仕様書 15.7）
      if (this.deck.aceCardId === cardId) {
        this.deck.aceCardId = null;
        showToast('エースカードがデッキから外れたため、設定を解除しました。');
      }
    }
    Se.play('card');
    this.afterChange();
    return true;
  },

  /** 中身が変わったあとの描き直し。枠は差分だけ触ります */
  afterChange: function () {
    this.renderSlots();
    this.renderCounts();
    this.refreshBandNums();
  },

  /* =============================================================
     フィールドの変更（仕様書 10.3）
     ============================================================= */
  setField: function (fieldId) {
    if (!this.deck) return;
    const oldHero = DeckValidator.heroOf(this.deck.fieldId);
    const newHero = DeckValidator.heroOf(fieldId);

    // 前の主人公を外す
    if (oldHero) {
      this.deck.mainDeck = this.deck.mainDeck.filter(function (e) {
        return e.cardId !== oldHero;
      });
    }
    this.deck.fieldId = fieldId;

    // 新しい主人公を1枚だけ自動で入れる
    if (newHero) {
      const e = this.deck.mainDeck.filter(function (x) { return x.cardId === newHero; })[0];
      if (e) e.count = 1;
      else this.deck.mainDeck.push({ cardId: newHero, count: 1 });
    }
    if (this.deck.aceCardId === oldHero) this.deck.aceCardId = null;

    this.renderField();
    this.afterChange();
  },

  /* =============================================================
     エースカード（仕様書 15.7）
     ============================================================= */
  setAce: function (cardId) {
    if (!this.deck) return;
    if (this.deck.aceCardId === cardId) {
      this.deck.aceCardId = null;
      showToast('エースカードの設定を解除しました。');
    } else {
      this.deck.aceCardId = cardId;
      showToast('「' + CARD_MASTER[cardId].name + '」をエースカードにしました。');
    }
    Se.play('button');
    this.renderSlots();
  },

  /* =============================================================
     拡大詳細（仕様書 15.4）
     ============================================================= */
  detailCardId: null,

  openDetail: function (cardId) {
    const m = CARD_MASTER[cardId];
    const box = document.getElementById('deck-edit-detail');
    if (!m || !box) return;
    this.detailCardId = cardId;

    box.querySelector('.dedetail__img').src = getCardImagePath(cardId, m.faction) || '';
    box.querySelector('.dedetail__name').textContent = m.name;

    /* ★数値を文字で並べるのはやめました（作者の指摘）。
       カードの絵に、種類もコストもスピードも体力も特徴も効果も
       すべて印刷されています。同じことを下に書き写すと、
       同じ情報が2回並ぶだけで、そのぶん絵が小さくなります。
       ★かわりに、絵の文字が読める大きさまで拡げています（CSS）。 */

    const inDeck = this.countInDeck(cardId);
    const max = Collection.maxInDeck(cardId);
    box.querySelector('.dedetail__nums').textContent =
      '所持枚数：' + Collection.countOf(cardId) + '枚　' +
      'デッキ内：' + inDeck + '枚　投入上限：' + max + '枚';

    const fx = box.querySelector('.dedetail__effect');
    fx.textContent = (m.effect && m.effect !== '効果なし') ? m.effect : '';
    fx.classList.toggle('is-on', !!fx.textContent);

    // 押せないボタンは止めて、理由を出す（仕様書 15.4）
    const addBtn = document.getElementById('dedetail-add');
    const delBtn = document.getElementById('dedetail-remove');
    const why = box.querySelector('.dedetail__why');
    const ng = this.canAdd(cardId);
    if (addBtn) { addBtn.disabled = !!ng; addBtn.classList.toggle('is-off', !!ng); }

    const isHero = (cardId === DeckValidator.heroOf(this.deck.fieldId));
    const canRemove = inDeck > 0 && !isHero;
    if (delBtn) { delBtn.disabled = !canRemove; delBtn.classList.toggle('is-off', !canRemove); }

    why.textContent = ng || (isHero ? '対応する主人公はデッキから外せません。' : '');
    why.classList.toggle('is-on', !!why.textContent);

    box.classList.add('is-open');
  },

  closeDetail: function () {
    const box = document.getElementById('deck-edit-detail');
    if (box) box.classList.remove('is-open');
  },

  /* =============================================================
     保存（仕様書 15.3）
     ============================================================= */
  save: function () {
    if (!this.deck) return;
    const r = DeckManager.update(this.deck);
    if (!r.ok) { showToast(r.reason); return; }

    // 保存は「いまの編成を記録する」操作で、完成の判定とは分けます
    const v = DeckValidator.check(this.deck);
    this.isNew = false;
    const save = document.getElementById('deckedit-save');
    if (save) save.textContent = '保存';

    showDialog({
      title: 'デッキを保存しました。',
      message: v.usable
        ? 'このデッキは対戦で使用できます。'
        : '現在は編成途中のため、対戦では使用できません。',
      buttons: [{ label: 'とじる', primary: true }],
    });
  },

  /** 保存せずに戻ろうとしたとき */
  tryLeave: function () {
    const src = DeckManager.byId(this.deck ? this.deck.id : '');
    const changed = src && JSON.stringify({
      name: src.name, fieldId: src.fieldId, mainDeck: src.mainDeck, aceCardId: src.aceCardId,
    }) !== JSON.stringify({
      name: this.deck.name, fieldId: this.deck.fieldId,
      mainDeck: this.deck.mainDeck, aceCardId: this.deck.aceCardId,
    });

    if (!changed) { Screens.back(); return; }
    const self = this;
    showDialog({
      title: '保存せずに戻りますか？',
      message: '編集した内容は失われます。',
      buttons: [
        { label: 'やめる' },
        { label: '保存して戻る', onClick: function () { self.save(); } },
        { label: '戻る', primary: true, onClick: function () { Screens.back(); } },
      ],
    });
  },
};

/* =====================================================================
   FieldPickerUI ―― フィールドの選択（仕様書 10.3）
   制作者の判断で、フィールドカードをタップして選ぶ形にしています。
   ===================================================================== */
const FieldPickerUI = {

  open: function () {
    this.render();
    Screens.go('field-select');
  },

  render: function () {
    const box = document.getElementById('fieldpick-grid');
    if (!box) return;
    box.innerHTML = '';

    const current = DeckEditorUI.deck ? DeckEditorUI.deck.fieldId : null;
    Collection.listFields().forEach(function (fieldId) {
      const m = CARD_MASTER[fieldId];
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'fpick' + (fieldId === current ? ' is-on' : '');

      const img = document.createElement('img');
      img.src = getCardThumbPath(fieldId, m.faction) || '';
      img.alt = m.name;
      cell.appendChild(img);

      const label = document.createElement('div');
      label.className = 'fpick__name';
      const hero = DeckValidator.heroOf(fieldId);
      label.textContent = m.name +
        (hero ? '（主人公：' + CARD_MASTER[hero].name + '）' : '');
      cell.appendChild(label);

      cell.addEventListener('click', function () {
        Se.play('button');
        DeckEditorUI.setField(fieldId);
        Screens.back();
      });
      box.appendChild(cell);
    });
  },
};
