/* =====================================================================
   ai-deckstack.js  ―― 難易度エキスパート・理不尽の内部操作
   ---------------------------------------------------------------------
   相手（プレイヤー）から見ると、CPUの手札と山札は区別のつかない
   「ひとつの隠れた山」です。その中身を並べ替えても、外からは分かりません。
   これを使って、強AIの上に2段階の難易度を作ります。

     エキスパート … たまに手札が噛み合う（何割かのターンだけ操作する）
     理不尽       … 毎ターン必ず噛み合う

   【守っているルール】
     1. カードを増やさない・作らない。手札と山札の1対1の交換だけ。
        → 40枚の内訳が最後まで正しいので、山札切れ敗北や、
          トラッシュの枚数を数える効果（ヌシ様・リン）が壊れません。
     2. 手札の枚数は必ず保つ。枚数は画面に出ている公開情報なので、
        変わるとすぐ分かってしまいます。
     3. 操作するのは自分のターン開始時の一度だけ。
        効果の解決中に触ると、処理中のカードが消えて不具合になります。
     4. 見るのは公開情報だけ。プレイヤーの手札は覗きません。

   【どのカードを欲しがるか】
   「欲しさ」を別の基準で決めると、AI本体の判断とズレて、かえって弱く
   なることが実測で分かりました。そこでこのファイルでは、
   AI本体の評価関数（AiHeuristic.scoreMain）にそのまま聞いています。
   つまり「今いちばん高く評価する手が打てるカード」を持ってきます。

   読み込み順： … → ai-core → ai-heuristic → ai-deckstack → ai-player
   ===================================================================== */

const AiDeckStack = {

  /* =============================================================
     ターン開始時に呼ぶ。手札1枚を、山札の中のより良いカードと交換する。
     -------------------------------------------------------------
       side    … 'village' / 'mansion'
       profile … AI_PROFILES の難易度設定（swapProb を見る）
       rng     … 0〜1 の乱数を返す関数（再現性のため外から渡す）
     ============================================================= */
  arrange: function (side, profile, rng) {
    if (!profile || !profile.swapProb) return false;
    // 毎ターン必ず操作すると隙が無くなりすぎるので、確率で加減する。
    // これがエキスパート（たまに噛み合う）と理不尽（常に噛み合う）の差。
    if (rng() >= profile.swapProb) return false;

    const p = Game.state.players[side];
    if (!p.hand.length || !p.deck.length) return false;

    // いちばん要らない手札を探す
    let worst = null, worstVal = Infinity;
    p.hand.forEach(function (c) {
      const rest = p.hand.filter(function (x) { return x !== c; });
      const v = AiDeckStack._slotValue(side, c, rest);
      if (v < worstVal) { worstVal = v; worst = c; }
    });
    if (!worst) return false;

    // 山札の中でいちばん欲しいカードを探す
    const rest = p.hand.filter(function (x) { return x !== worst; });
    let best = null, bestVal = -Infinity;
    p.deck.forEach(function (c) {
      const v = AiDeckStack._slotValue(side, c, rest);
      if (v > bestVal) { bestVal = v; best = c; }
    });
    if (!best) return false;

    // 得になるときだけ交換する
    if (bestVal <= worstVal) return false;

    p.hand.splice(p.hand.indexOf(worst), 1);
    p.deck.splice(p.deck.indexOf(best), 1);
    p.hand.push(best);
    p.deck.push(worst);          // 枚数は完全に元どおり
    return true;
  },

  /* =============================================================
     そのカードが手札の1枠としてどれだけ嬉しいか
     -------------------------------------------------------------
     今すぐ出せるカードは、AI本体の評価をそのまま使います。
     今は出せないカードは、将来の値打ちで測ります。
     ============================================================= */
  _slotValue: function (side, card, otherHand) {
    const p = Game.state.players[side];
    let v;

    const pv = this._playValue(side, card);
    if (pv !== null) {
      v = pv + 10;                 // 今すぐ動けるカードは価値が高い
    } else {
      v = this._futureValue(side, card);
    }

    // 同じカードが手札にダブると価値が下がる
    const same = otherHand.filter(function (x) {
      return x.cardId === card.cardId;
    }).length;
    v -= same * 20;

    // 重いカードばかりで手札が固まらないようにする
    const heavy = otherHand.filter(function (x) {
      return (x.master.cost || 0) >= 4;
    }).length;
    if ((card.master.cost || 0) >= 4 && heavy >= 1) v -= 30;

    return v;
  },

  /** 今このカードを出したら、AI本体は何点をつけるか（出せないなら null） */
  _playValue: function (side, card) {
    const p = Game.state.players[side];
    if ((card.master.cost || 0) > p.energy) return null;

    p.hand.push(card);                 // 一時的に手札へ入れて評価する
    let best = null;
    try {
      const acts = AiCore.legalMainActions(side).filter(function (a) {
        return a.inst === card;
      });
      acts.forEach(function (a) {
        const v = AiHeuristic.scoreMain(side, a, AI_PROF_FULL);
        if (best === null || v > best) best = v;
      });
    } finally {
      p.hand.pop();                    // 必ず元に戻す
    }
    return best;
  },

  /** まだ出せないカードの、将来の値打ち */
  _futureValue: function (side, card) {
    const p = Game.state.players[side];
    const id = card.cardId;

    // 切り札は「出せる状況が近いとき」だけ欲しい。
    // 常に最優先にすると序盤から抱えてしまい、盤面を作れなくなる。
    if (id === AI_CARD.ISABELLA) {
      const lost = AiHeuristic._lostTraitCount(side, '洋館');
      if (lost >= 2) return (p.energy >= 3) ? 45 : 32;
      return (lost === 1) ? 14 : 4;
    }
    if (id === AI_CARD.NUSHI) {
      return (AiHeuristic._trashTraitCount(side, '村') >= 6) ? 25 : 8;
    }
    // 防御札はイザベラ着地後の生命線
    if (id === AI_CARD.KEY || id === AI_CARD.SAKURYAKU) {
      const isaOnField = AiHeuristic._units(side).some(function (x) {
        return x.cardId === AI_CARD.ISABELLA;
      });
      return isaOnField ? 22 : 8;
    }
    return 4 + (card.master.cost || 0);
  },
};

/* Node.jsでのヘッドレステスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AiDeckStack;
}
