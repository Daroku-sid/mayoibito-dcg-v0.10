/* =====================================================================
   deck-manager.js  ―  デッキの出し入れ（v0.4 仕様書 11・12・25.4）
   ---------------------------------------------------------------------
   公式デッキと自作デッキを、同じ形で扱えるようにします。

   公式デッキは decks.js の中身をそのまま使います（仕様書 27.2）。
   保存データ側に写しを持たないのは、カードの調整でデッキが変わったときに、
   古い写しが残って食い違うのを避けるためです。

   自作デッキは SaveManager の customDecks に入ります。
   ===================================================================== */

'use strict';

const DeckManager = {

  MAX_CUSTOM: 10,          // 自作デッキの上限（仕様書 11.3）
  NAME_MAX: 16,            // デッキ名の長さ（仕様書 15.2）

  /* 公式デッキだけに付ける戦術ラベル（仕様書 11.4） */
  /* ★v0.10：公式デッキは gd1 の18本（R28最終13本＋ギミック版5本）。
     一言の説明は、デッキの組（R28最終／ギミック版）を出します。作者が文を決めたら差し替え */
  TACTICS: {},

  /* =============================================================
     取り出す
     ============================================================= */

  /** 公式デッキを、自作デッキと同じ形にして返す */
  officialDecks: function () {
    const self = this;
    return DECK_ORDER.map(function (key) {   // ★v0.10：R28最終13本 → ギミック版5本の順
      const d = DECKS[key];
      return {
        id: 'official_' + key,
        official: true,
        officialKey: key,               // 対戦で使うときの座席デッキ名
        name: deckDisplayName(key),
        tactics: self.TACTICS[key] || d.set || '',
        fieldId: d.fieldId,
        mainDeck: d.mainDeck.map(function (e) {
          return { cardId: e.id, count: e.count };
        }),
        aceCardId: self.defaultAceOf(key),
      };
    });
  },

  /** 公式デッキの代表カード（一覧で見せる顔） */
  defaultAceOf: function (key) {
    /* ★v0.10：代表カードは初期配置の人間（どのデッキにも必ず1枚ある）。作者が決めたら差し替え */
    const d = DECKS[key];
    return d ? (d.initialHuman || null) : null;
  },

  /** 自作デッキ */
  customDecks: function () {
    const save = SaveManager.data;
    if (!save) return [];
    return save.customDecks.map(function (d) {
      const copy = JSON.parse(JSON.stringify(d));
      copy.official = false;
      return copy;
    });
  },

  /** 公式2つ＋自作。一覧に出す順（仕様書 11.1） */
  allDecks: function () {
    return this.officialDecks().concat(this.customDecks());
  },

  byId: function (id) {
    return this.allDecks().filter(function (d) { return d.id === id; })[0] || null;
  },

  /* =============================================================
     作る・写す・消す
     ============================================================= */

  canAddMore: function () {
    return this.customDecks().length < this.MAX_CUSTOM;
  },

  newId: function () {
    // 時刻だけだと同じ秒に2個作ったときにぶつかるので、連番も足す
    const used = {};
    this.customDecks().forEach(function (d) { used[d.id] = true; });
    let n = 1;
    let id;
    do {
      id = 'deck_custom_' + String(n).padStart(3, '0');
      n += 1;
    } while (used[id]);
    return id;
  },

  /** 名前を整える（前後の空白を除き、長さを切る：仕様書 15.2） */
  cleanName: function (name) {
    const t = String(name == null ? '' : name).trim().slice(0, this.NAME_MAX);
    return t === '' ? '新しいデッキ' : t;
  },

  nowText: function () {
    return new Date().toISOString();
  },

  /**
   * 新しい自作デッキを作る。
   * @param base 元にするデッキ（コピー元）。省略すると空のデッキ
   */
  create: function (base, name) {
    if (!this.canAddMore()) {
      return { ok: false, reason: '自作デッキの保存数が上限に達しています。' };
    }
    const now = this.nowText();
    const deck = {
      id: this.newId(),
      name: this.cleanName(name || (base ? base.name + 'のコピー' : '新しいデッキ')),
      fieldId: base ? base.fieldId : null,
      mainDeck: base ? JSON.parse(JSON.stringify(base.mainDeck)) : [],
      aceCardId: base ? base.aceCardId : null,
      createdAt: now,
      updatedAt: now,
    };
    SaveManager.data.customDecks.push(deck);
    const r = SaveManager.save();
    if (!r.ok) {
      SaveManager.data.customDecks.pop();     // 保存できなければ元へ戻す
      return { ok: false, reason: '端末へ保存できませんでした。' };
    }
    return { ok: true, deck: deck };
  },

  /** 公式・自作どちらからでも写せる（仕様書 12.2） */
  copy: function (deck) {
    return this.create(deck, deck.name + 'のコピー');
  },

  /** 上書き保存 */
  update: function (deck) {
    const list = SaveManager.data.customDecks;
    const i = list.findIndex(function (d) { return d.id === deck.id; });
    if (i === -1) return { ok: false, reason: 'このデッキは保存されていません。' };

    const before = list[i];
    deck.name = this.cleanName(deck.name);
    deck.updatedAt = this.nowText();
    deck.createdAt = before.createdAt || deck.updatedAt;
    delete deck.official;
    list[i] = deck;

    const r = SaveManager.save();
    if (!r.ok) {
      list[i] = before;
      return { ok: false, reason: '端末へ保存できませんでした。' };
    }
    return { ok: true, deck: deck };
  },

  remove: function (id) {
    const list = SaveManager.data.customDecks;
    const i = list.findIndex(function (d) { return d.id === id; });
    if (i === -1) return { ok: false, reason: 'このデッキは保存されていません。' };
    const removed = list.splice(i, 1)[0];
    const r = SaveManager.save();
    if (!r.ok) {
      list.splice(i, 0, removed);
      return { ok: false, reason: '端末へ保存できませんでした。' };
    }
    return { ok: true };
  },

  /** 公式デッキは編集・削除・改名できない（仕様書 12.1） */
  isEditable: function (deck) {
    return !!deck && !deck.official;
  },

  /* =============================================================
     表示のための計算
     ============================================================= */

  /**
   * 最終更新日時を読みやすい形にする。
   * 公式デッキは更新という考えがないので空文字を返します。
   */
  updatedText: function (deck) {
    if (!deck || deck.official) return '';
    const raw = deck.updatedAt || deck.createdAt;
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },

  /** 一覧に出す代表画像（仕様書 15.7 の優先順位） */
  faceCardOf: function (deck) {
    if (!deck) return null;
    if (deck.aceCardId && CARD_MASTER[deck.aceCardId]) return deck.aceCardId;
    const hero = DeckValidator.heroOf(deck.fieldId);
    if (hero) return hero;
    return deck.fieldId || null;
  },

  /* =============================================================
     対戦へ渡す（v0.4 仕様書 17）
     -------------------------------------------------------------
     デッキ編成で作った形（mainDeck の cardId / count）を、
     対戦側が読む形（decks.js と同じ id / count）へ変えます。
     ============================================================= */

  /** 対戦で使える形に変換する。使えないデッキは null を返します */
  toBattleDef: function (deck) {
    if (!deck) return null;
    if (!DeckValidator.check(deck).usable) return null;
    return {
      side: deck.id,   // ★v0.10：席の名前とは関係ない（gd1 は使わない）。デッキの名前を入れておく
      label: deck.name,
      shortLabel: deck.name.slice(0, 4),
      fieldId: deck.fieldId,
      initialHuman: DeckValidator.heroOf(deck.fieldId),
      mainDeck: deck.mainDeck.map(function (e) {
        return { id: e.cardId, count: e.count };
      }),
    };
  },

  /**
   * 対戦を始める前に、自作デッキを対戦側へ預ける。
   * @param picks { village: デッキID, mansion: デッキID }
   * @returns 対戦へ渡す decks（席 → デッキID）
   */
  prepareForBattle: function (picks) {
    RuntimeDecks.clear();
    const out = {};
    const self = this;

    ['village', 'mansion'].forEach(function (seat) {
      const id = picks[seat];

      /* ★公式デッキは 'village' / 'mansion' という名前でも渡ってきます。
         対戦設定の画面が、この名前で選択を持っているためです。
         いっぽう byId が見る id は 'official_village' の形なので、
         そのままでは見つかりません。

         見つからないときに席の名前へ落としていたので、
         「CPUにヨマモリ村を選んだのに、mansion 席だから黒薔薇の館になる」
         という取り違えが起きていました（v0.5.8 で修正）。 */
      if (typeof DECKS !== 'undefined' && DECKS[modernDeckKey(id)]) { out[seat] = modernDeckKey(id); return; }

      const deck = self.byId(id);
      if (!deck) { out[seat] = DEFAULT_DECK; return; }  // それでも見つからなければ既定へ（★v0.10：席の名前はもうデッキではない）

      if (deck.official) {
        out[seat] = deck.officialKey;                    // 公式は decks.js をそのまま
        return;
      }
      const def = self.toBattleDef(deck);
      if (!def) { out[seat] = DEFAULT_DECK; return; }    // 使えないデッキは既定へ
      RuntimeDecks.set(deck.id, def);
      out[seat] = deck.id;
    });
    return out;
  },

  /** 対戦で選べるデッキ（使えるものだけ：仕様書 17.1） */
  usableDecks: function () {
    return this.allDecks().filter(function (d) {
      return DeckValidator.check(d).usable;
    });
  },

  /** CPUが使えるデッキ。自作は使わせない（仕様書 17.1） */
  cpuDecks: function () {
    return this.officialDecks();
  },

  /**
   * デッキの40枚を、並べる順に1枚ずつ展開する（仕様書 13.2）。
   * 同名カードも枚数ぶん個別に並びます。
   */
  expand: function (deck) {
    if (!deck || !Array.isArray(deck.mainDeck)) return [];
    const ids = [];
    deck.mainDeck.forEach(function (e) {
      if (!CARD_MASTER[e.cardId]) return;
      for (let i = 0; i < e.count; i++) ids.push(e.cardId);
    });
    return CardFilter.sort(ids, 'default');
  },
};

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeckManager;
}
