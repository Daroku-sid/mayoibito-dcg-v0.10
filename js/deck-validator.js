/* =====================================================================
   deck-validator.js  ―  デッキが対戦で使えるかを調べる（v0.4 仕様書 10・11.5）
   ---------------------------------------------------------------------
   「使えるかどうか」は保存された値ではなく、
   読み込むたびにここで計算します（仕様書 25.4）。

   なぜ保存しないか:
     所持カードやカードの内容があとから変わることがあります。
     「保存したときは使えた」を信じると、
     いまは使えないデッキで対戦を始めてしまいます。

   問題は見つけしだい止めず、すべて集めて返します。
   1つ直すたびに次の問題が出てくるより、まとめて分かるほうが直しやすいためです。
   ===================================================================== */

'use strict';

const DeckValidator = {

  MAIN_DECK_SIZE: 40,

  /**
   * 調べる。
   * @returns {
   *   usable:   対戦で使えるか
   *   problems: 直すべきことの一覧（画面にそのまま出せる文章）
   *   total:    メインデッキの合計枚数
   *   counts:   { human, youkai, goods, event } の枚数配分
   *   byCost:   コスト別の枚数
   * }
   */
  check: function (deck) {
    const problems = [];

    if (!deck || typeof deck !== 'object') {
      return { usable: false, problems: ['デッキのデータが読み取れません。'],
               total: 0, counts: this.emptyCounts(), byCost: {} };
    }

    /* --- フィールド --- */
    const field = deck.fieldId ? CARD_MASTER[deck.fieldId] : null;
    if (!deck.fieldId) {
      problems.push('フィールドが設定されていません。');
    } else if (!field || field.type !== 'field') {
      problems.push('フィールドのカードが見つかりません。');
    }

    /* --- メインデッキ --- */
    const entries = Array.isArray(deck.mainDeck) ? deck.mainDeck : [];
    let total = 0;
    const counts = this.emptyCounts();
    const byCost = {};
    const seen = {};

    entries.forEach(function (e) {
      const m = CARD_MASTER[e.cardId];
      const n = e.count;

      if (!m) {
        problems.push('不明なカードが入っています：' + e.cardId);
        return;
      }
      if (m.type === 'field') {
        problems.push('フィールドはメインデッキに入れられません：' + m.name);
        return;
      }
      if (seen[e.cardId]) {
        problems.push('同じカードが二重に登録されています：' + m.name);
        return;
      }
      seen[e.cardId] = true;

      total += n;
      if (counts[m.type] != null) counts[m.type] += n;
      const c = (m.cost == null) ? 0 : m.cost;
      byCost[c] = (byCost[c] || 0) + n;

      /* 同名の上限（仕様書 10.2）
         ルール上の上限と所持枚数は別の理由なので、分けて伝えます。
         v0.4 では両方4枚で一致していますが、
         「4枚までしか入れられない」が本来の理由なので先に見ます。
         所持枚数の理由を先に出すと、カードを集めれば5枚入ると
         誤解されてしまいます。 */
      const ruleMax = Collection.isZeroCostHuman(e.cardId) ? 1 : Collection.MAX_SAME_CARD;
      const owned = Collection.countOf(e.cardId);
      if (n > ruleMax) {
        problems.push(m.name + ' は' + ruleMax + '枚までしか入れられません（現在' + n + '枚）。');
      } else if (n > owned) {
        problems.push(m.name + ' が所持枚数を超えています（' + n + '枚／所持' + owned + '枚）。');
      }
    });

    /* --- 枚数（仕様書 10.2） --- */
    if (total < this.MAIN_DECK_SIZE) {
      problems.push('カードが' + (this.MAIN_DECK_SIZE - total) + '枚不足しています。');
    } else if (total > this.MAIN_DECK_SIZE) {
      problems.push('カードが' + (total - this.MAIN_DECK_SIZE) + '枚多すぎます。');
    }

    /* --- 対応する0コスト人間（仕様書 10.1） --- */
    if (field) {
      const heroId = this.heroOf(deck.fieldId);
      if (!heroId) {
        problems.push('このフィールドに対応する主人公が見つかりません。');
      } else {
        const entry = entries.filter(function (e) { return e.cardId === heroId; })[0];
        const heroName = CARD_MASTER[heroId] ? CARD_MASTER[heroId].name : heroId;
        if (!entry) {
          problems.push('対応する主人公「' + heroName + '」が入っていません。');
        } else if (entry.count !== 1) {
          problems.push('対応する主人公「' + heroName + '」は1枚だけ入ります（現在' + entry.count + '枚）。');
        }
      }

      // フィールドに対応しない0コスト人間が混ざっていないか
      entries.forEach(function (e) {
        if (e.cardId === DeckValidator.heroOf(deck.fieldId)) return;
        if (Collection.isZeroCostHuman(e.cardId)) {
          problems.push('コスト0の人間は、フィールドに対応する1枚だけです：' +
            CARD_MASTER[e.cardId].name);
        }
      });
    }

    return {
      usable: problems.length === 0,
      problems: problems,
      total: total,
      counts: counts,
      byCost: byCost,
    };
  },

  emptyCounts: function () {
    return { human: 0, youkai: 0, goods: 0, event: 0 };
  },

  /** そのフィールドに対応する0コスト人間（＝主人公）のカードID */
  heroOf: function (fieldId) {
    for (const key in DECKS) {
      if (DECKS[key].fieldId === fieldId) return DECKS[key].initialHuman;
    }
    return null;
  },

  /** 一覧に出す短い説明（仕様書 11.5） */
  shortReason: function (result) {
    if (!result || result.usable) return '';
    return result.problems[0];
  },
};

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeckValidator;
}
