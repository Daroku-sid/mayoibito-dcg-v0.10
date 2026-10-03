/* =====================================================================
   ai-uiops.js  ―  効果の中の選択に、CPUが答えるための受け答え
   ---------------------------------------------------------------------
   カードの効果は、解決の途中で人に質問することがあります。

     confirmYesNo   … 「この任意効果を使いますか？」
     pickCards      … 「手札から2枚捨ててください」「トラッシュから1枚選んで」
     pickBoardTarget… 「ダメージを与える怪異を1体選んで」

   人間のときは preview.js が画面を出して答えを待ちますが、
   CPUのときは AI に聞いてその場で答えます。
   game.js の runEffect(item, uiOps, done) は、この3つを外から受け取る
   作りになっているので、渡すものを差し替えるだけで済みます。

   ＊このファイルはゲームのルールに一切触れません。
     「質問の形」を「AIへの問い合わせ」に翻訳しているだけです。
   ===================================================================== */

'use strict';

const AiUiOps = {

  /**
   * CPU用の受け答えを作る。
   * @param {object} ai   - AiPlayer.create() が返したもの
   * @param {object} item - いま解決している効果（source.cardId を使います）
   * @returns {object} runEffect に渡す uiOps
   */
  create: function (ai, item) {
    const self = this;
    const cardId = (item && item.source) ? item.source.cardId : null;

    return {

      /* CPUの手番でも、拾ったカードは画面に見せます（v0.6.8）。
         ここでは何もせず、画面側（preview.js）が受け持ちます。
         観戦やひとり回しでは、そちらの showCards が使われます。 */
      showCards: null,

      /* --- 任意効果を使うか --- */
      confirmYesNo: function (title, message, cb) {
        cb(ai.shouldUseOptional(cardId));
      },

      /* --- カードを選ぶ --- */
      pickCards: function (options, cb) {
        cb(self._pick(ai, options));
      },

      /* --- 盤面のカードを1体選ぶ --- */
      pickBoardTarget: function (options, cb) {
        const list = (options.candidates || []).slice();
        if (list.length === 0) { cb(null); return; }
        cb(ai.chooseDamageTarget(list, options.amount || 1) || list[0]);
      },
    };
  },

  /* =============================================================
     カード選択の中身
     -------------------------------------------------------------
     mode:'exact' … ちょうど count 枚（0枚では決定できない）
     mode:'max'   … 最大 count 枚（0枚でもよい）

     「捨てる」のか「加える」のかは、選ぶ対象が自分の手札かどうかで
     見分けます（手札から選ばせる効果＝捨てる、それ以外＝加える）。
     ============================================================= */
  _pick: function (ai, options) {
    const all = (options.cards || []).slice();
    const selectable = options.selectable ? options.selectable.slice() : all;
    const count = options.count || 1;
    const canSkip = (options.mode || 'max') !== 'exact';

    // 選べるものだけに絞る
    let pool = all.filter(function (c) { return selectable.indexOf(c) !== -1; });
    if (pool.length === 0) return [];

    // 手札から選ぶ＝捨てる／それ以外＝加える
    const hand = Game.state.players[ai.side].hand;
    const isDiscard = pool.every(function (c) { return hand.indexOf(c) !== -1; });

    const chosen = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const one = isDiscard
        ? ai.chooseDiscard(pool)
        : ai.choosePick(pool, canSkip && chosen.length === 0);

      if (!one) break;                    // 「選ばない」を選んだ
      chosen.push(one);
      pool = pool.filter(function (c) { return c !== one; });
    }

    // ちょうど count 枚が必要なのに足りないときは、残りから機械的に足す
    if (!canSkip) {
      while (chosen.length < count && pool.length > 0) {
        chosen.push(pool.shift());
      }
    }
    return chosen;
  },
};

/* Node.jsでのヘッドレステスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AiUiOps;
}
