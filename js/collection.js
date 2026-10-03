/* =====================================================================
   collection.js  ―  所持カード（v0.4 仕様書 9）
   ---------------------------------------------------------------------
   v0.4ではカードを手に入れる仕組み（報酬・パック・ショップ）を
   作らないので、初回起動時に現行カードをすべて配ります。

     ・通常カード：各4枚
     ・フィールド：各1枚
     ・0コスト人間：各1枚

   ただし「配ったかどうか」を保存しておき、起動のたびに増えないようにします。

   デッキは所持カードを減らしません（仕様書 9.2）。
   同じカードを何個のデッキへ入れてもかまいませんが、
   1つのデッキの中では所持枚数を超えられません。
   将来カードを集める仕組みを足しても、この形のまま使えます。
   ===================================================================== */

'use strict';

const Collection = {

  /* 配る枚数 */
  GRANT_NORMAL: 4,
  GRANT_FIELD: 1,
  GRANT_ZERO_COST_HUMAN: 1,

  /* =============================================================
     初回配布（仕様書 9.1）
     ============================================================= */
  grantInitialIfNeeded: function () {
    const save = SaveManager.data;
    if (!save) return { granted: false };
    /* ★v0.10：カードが gd1 の表（新しいID）に入れ替わりました。
       v0.9 までの保存データは「配り終えた」印が付いているので、印だけを見ると
       新しいカードが1枚も配られません。そこで「まだ枚数を持っていないカード」だけを配ります。
       すでに持っているカードは増やさないので、起動のたびに増えることはありません。 */
    const c = save.collection;
    let kinds = 0;
    const self = this;
    Object.keys(CARD_MASTER).forEach(function (cardId) {
      const n = self.grantCountOf(cardId);
      if (n <= 0) return;
      if (typeof c[cardId] === 'number') return;   // 読み込んだデータを尊重する
      c[cardId] = n;
      kinds += 1;
    });
    const first = !save.initialGrantCompleted;
    save.initialGrantCompleted = true;
    if (kinds === 0 && !first) return { granted: false };
    SaveManager.save();
    return { granted: true, kinds: kinds };
  },

  /** そのカードを初回に何枚配るか */
  grantCountOf: function (cardId) {
    const m = CARD_MASTER[cardId];
    if (!m) return 0;
    /* ★v0.10：削除札・裏面・未実装は配らない（rules-boot.js の isPlayableCard） */
    if (typeof isPlayableCard === 'function' && !isPlayableCard(cardId)) return 0;
    if (m.type === 'field') return this.GRANT_FIELD;
    if (this.isZeroCostHuman(cardId)) return this.GRANT_ZERO_COST_HUMAN;
    return this.GRANT_NORMAL;
  },

  /**
   * 0コストの人間か（＝フィールドに対応する主人公）。
   * デッキには1枚までしか入らず、フィールドを選ぶと自動で登録されます。
   */
  isZeroCostHuman: function (cardId) {
    const m = CARD_MASTER[cardId];
    return !!m && m.type === 'human' && m.cost === 0;
  },

  /* =============================================================
     取り出し
     ============================================================= */

  /** 所持枚数 */
  countOf: function (cardId) {
    const save = SaveManager.data;
    if (!save) return 0;
    const n = save.collection[cardId];
    return (typeof n === 'number' && n > 0) ? n : 0;
  },

  /** 1枚でも持っているか */
  owns: function (cardId) {
    return this.countOf(cardId) > 0;
  },

  /**
   * 所持しているカードの一覧。
   * @param opts.includeZeroCostHuman - 0コスト人間を含めるか（既定は含める）
   * @param opts.includeField - フィールドを含めるか（既定は含める）
   */
  list: function (opts) {
    const o = opts || {};
    const withZero = (o.includeZeroCostHuman !== false);
    const withField = (o.includeField !== false);
    const self = this;

    return Object.keys(CARD_MASTER).filter(function (cardId) {
      if (!self.owns(cardId)) return false;
      /* ★v0.10：削除札・裏面・未実装は、持っていても並べない（念のため） */
      if (typeof isPlayableCard === 'function' && !isPlayableCard(cardId)) return false;
      const m = CARD_MASTER[cardId];
      if (m.type === 'field' && !withField) return false;
      if (self.isZeroCostHuman(cardId) && !withZero) return false;
      return true;
    });
  },

  /**
   * デッキ編成の下部に並べるカード（仕様書 15.1）。
   * ---------------------------------------------------------------
   * 0コスト人間とフィールドは、ここには出しません。
   *   ・0コスト人間はフィールドを選ぶと自動で入り、外せない（仕様書 15.6）
   *   ・フィールドは上段の専用枠で選ぶ（仕様書 10.3）
   * 候補に並べてしまうと「入れられるのに入らない」カードができて、
   * 触った人が理由を探すことになります。最初から出しません。
   */
  listForDeckEditor: function () {
    return this.list({ includeZeroCostHuman: false, includeField: false });
  },

  /** 所持しているフィールドの一覧（フィールド選択画面用） */
  listFields: function () {
    const self = this;
    return Object.keys(CARD_MASTER).filter(function (cardId) {
      return CARD_MASTER[cardId].type === 'field' && self.owns(cardId);
    });
  },

  /* =============================================================
     デッキへ入れられる上限（仕様書 10.2）
     -------------------------------------------------------------
     同名4枚まで。ただし所持枚数を超えない。
     0コスト人間は1枚まで。
     ============================================================= */
  MAX_SAME_CARD: 4,

  maxInDeck: function (cardId) {
    if (this.isZeroCostHuman(cardId)) return Math.min(1, this.countOf(cardId));
    return Math.min(this.MAX_SAME_CARD, this.countOf(cardId));
  },
};

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Collection;
}
