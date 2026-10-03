/* =====================================================================
   deck-picker-ui.js  ―  対戦で使うデッキを選ぶ（v0.4 仕様書 17）
   ---------------------------------------------------------------------
   対戦前の画面では、デッキを文字だけの選択肢ではなく
   デッキ一覧と同じカード型で選びます（仕様書 17.5）。
   自作デッキが増えると、名前だけでは中身を思い出せないためです。

   選べる範囲:
     ・自分（CPU対戦）／両方（ひとり回し）… 公式2つ＋使える自作デッキ
     ・CPU側 … 公式2つ＋ランダム（自作は使わせない：仕様書 17.1）
     ・CPU観戦 … 公式のみ（仕様書 17.3）

   使えないデッキは暗くして押せなくします。
   選択肢から消してしまうと「作ったのに出てこない」と迷うので、
   出したうえで理由を見せます。
   ===================================================================== */

'use strict';

const DeckPickerUI = {

  /* いま選んでいる場所。'cpu.playerDeck' のような形 */
  target: null,

  /* 選び終わったあとに呼ぶ */
  onPicked: null,

  built: false,

  build: function () {
    if (this.built) return;
    this.built = true;
    const self = this;

    document.querySelectorAll('[data-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Se.play('button');
        self.open(btn.dataset.pick);
      });
    });
  },

  /* =============================================================
     どの場所に、どんな候補を出すか
     ============================================================= */
  optionsFor: function (target) {
    // CPU側は自作を使わせない（仕様書 17.1）
    if (target === 'cpu.cpuDeck') {
      return {
        title: 'CPUのデッキ',
        note: 'CPUは公式デッキだけを使います。',
        decks: DeckManager.officialDecks(),
        extra: [{ id: 'random', name: 'ランダム', desc: '対戦ごとにどちらかを選びます。' }],
      };
    }
    return {
      title: (target === 'cpu.playerDeck') ? '自分のデッキ' : 'デッキを選ぶ',
      note: '対戦に使えるのは、40枚そろったデッキだけです。',
      decks: DeckManager.allDecks(),
      extra: [],
    };
  },

  open: function (target) {
    this.target = target;
    this.render();
    Screens.go('deck-pick');
  },

  render: function () {
    const box = document.getElementById('deckpick-grid');
    if (!box || !this.target) return;

    const opt = this.optionsFor(this.target);
    const title = document.getElementById('deckpick-title');
    if (title) title.textContent = opt.title;
    const note = document.getElementById('deckpick-note');
    if (note) note.textContent = opt.note;

    box.innerHTML = '';
    const self = this;
    const current = this.currentValue();

    opt.extra.forEach(function (e) {
      box.appendChild(self.makeSimpleCard(e, e.id === current));
    });
    opt.decks.forEach(function (deck) {
      box.appendChild(self.makeDeckCard(deck, self.valueOf(deck) === current));
    });
  },

  /** ランダムなど、カードの絵が無い選択肢 */
  makeSimpleCard: function (e, selected) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dcard dcard--simple' + (selected ? ' is-picked' : '');

    const head = document.createElement('div');
    head.className = 'dcard__head';
    const name = document.createElement('span');
    name.className = 'dcard__name';
    name.textContent = e.name;
    head.appendChild(name);
    card.appendChild(head);

    const desc = document.createElement('div');
    desc.className = 'dcard__state';
    desc.textContent = e.desc || '';
    card.appendChild(desc);

    const self = this;
    card.addEventListener('click', function () {
      Se.play('button');
      self.pick(e.id);
    });
    return card;
  },

  makeDeckCard: function (deck, selected) {
    const result = DeckValidator.check(deck);
    const card = DeckListUI.makeDeckCard.call(DeckListUI, deck);

    // デッキ一覧の見た目を使い回しつつ、押したときの動きだけ差し替えます
    const clone = card.cloneNode(true);
    clone.classList.toggle('is-picked', selected);
    if (!result.usable) clone.classList.add('is-locked');

    const self = this;
    clone.addEventListener('click', function () {
      if (!result.usable) {
        showToast(DeckValidator.shortReason(result));
        return;
      }
      Se.play('button');
      self.pick(self.valueOf(deck));
    });
    return clone;
  },

  /** 対戦設定に記録する値 */
  valueOf: function (deck) {
    return deck.official ? deck.officialKey : deck.id;
  },

  currentValue: function () {
    if (!this.target) return null;
    const parts = this.target.split('.');
    const store = Screens[parts[0]];
    return store ? store[parts[1]] : null;
  },

  pick: function (value) {
    const parts = this.target.split('.');
    if (Screens[parts[0]]) {
      Screens[parts[0]][parts[1]] = value;
    }
    Screens.back();
    this.refreshLabels();
    if (Screens._renderCpu) Screens._renderCpu();
    if (Screens._renderSolo) Screens._renderSolo();
  },

  /* =============================================================
     入口のボタンに、いま選んでいるデッキを出す
     ============================================================= */
  refreshLabels: function () {
    const self = this;
    document.querySelectorAll('[data-pick]').forEach(function (btn) {
      const parts = btn.dataset.pick.split('.');
      const store = Screens[parts[0]];
      const value = store ? store[parts[1]] : null;
      self.fillLabel(btn, value);
    });
  },

  fillLabel: function (btn, value) {
    btn.innerHTML = '';

    if (value === 'random') {
      const n = document.createElement('span');
      n.className = 'dpick__name';
      n.textContent = 'ランダム';
      btn.appendChild(n);
      const t = document.createElement('span');
      t.className = 'dpick__sub';
      t.textContent = '対戦ごとに決まります';
      btn.appendChild(t);
      return;
    }

    const deck = this.findByValue(value);
    if (!deck) {
      const n = document.createElement('span');
      n.className = 'dpick__name';
      n.textContent = 'デッキを選ぶ';
      btn.appendChild(n);
      return;
    }

    const face = DeckManager.faceCardOf(deck);
    if (face && CARD_MASTER[face]) {
      const img = document.createElement('img');
      img.className = 'dpick__img';
      img.src = getCardThumbPath(face, CARD_MASTER[face].faction) || '';
      img.alt = '';
      btn.appendChild(img);
    }
    const box = document.createElement('span');
    box.className = 'dpick__body';
    const n = document.createElement('span');
    n.className = 'dpick__name';
    n.textContent = deck.name;
    box.appendChild(n);
    const t = document.createElement('span');
    t.className = 'dpick__sub';
    t.textContent = (deck.official ? (deck.tactics || '公式') : '自作') +
      '　' + DeckValidator.check(deck).total + '/40枚';
    box.appendChild(t);
    btn.appendChild(box);
  },

  /** 設定に入っている値から、デッキを探す */
  findByValue: function (value) {
    if (!value) return null;
    const all = DeckManager.allDecks();
    for (let i = 0; i < all.length; i++) {
      if (this.valueOf(all[i]) === value) return all[i];
    }
    return null;
  },

  /**
   * 対戦を始める直前に、選ばれているデッキが使えるか確かめる。
   * 使えなければ公式デッキへ戻します（消えたデッキを選んだままの事故を防ぐ）。
   */
  ensureUsable: function (value, fallback) {
    if (value === 'random') return value;
    const deck = this.findByValue(value);
    if (deck && DeckValidator.check(deck).usable) return value;
    return fallback;
  },
};
