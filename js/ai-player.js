/* =====================================================================
   ai-player.js  ―― CPUの難易度（弱・中・強）
   ---------------------------------------------------------------------
   3つのAIを別々に作るのではなく、
   「同じ評価エンジンから、機能を外していく」という作りにしています。
   こうすると、強を改良したときに中も一緒に良くなり、
   難易度の差が「別人の動き」ではなく「上手さの差」になります。

   ┌──────┬──────────┬──────────┬────────────────┬──────────────┐
   │      │ 襲撃の先読み │  敗北回避  │ デッキ固有の知見 │ 最善手を選ぶ率 │
   ├──────┼──────────┼──────────┼────────────────┼──────────────┤
   │  弱  │    ✗     │ 最後の1体のみ │       ✗        │     70%      │
   │  中  │    ○     │    ○     │       ✗        │     90%      │
   │  強  │    ○     │    ○     │       ○        │    100%      │
   └──────┴──────────┴──────────┴────────────────┴──────────────┘

   「デッキ固有の知見」とは、制作者が実戦で見つけた戦い方のことです。
   （鍵をイザベラ着地まで温存する／イザベラの気力の道を守る／
     カエデで削ってコハクで落とす／イザベラを消耗させない など）
   強だけがこれを知っています。

   弱は「ランダム」ではありません。ランダムだと意味不明な動きになって
   対戦していて気持ちよくないので、
   「目先の盤面だけを見て、気力を毎ターン使い切り、とにかく殴りにいく
     初心者」として作ってあります。

   読み込み順： … → game → ai-core → ai-heuristic → ai-player → ui
   ===================================================================== */

const AI_PROFILES = {
  weak: {
    label: '弱',
    simple: true,        // 目先だけを見る簡単な評価を使う
    deckPlan: false,     // デッキ固有の知見を使わない
    bestRate: 0.70,      // 10回に3回は最善でない手を選ぶ
  },
  normal: {
    label: '中',
    simple: false,       // 盤面はきちんと読める
    deckPlan: false,     // ただしデッキのセオリーは知らない
    bestRate: 0.90,
  },
  strong: {
    label: '強',
    simple: false,
    deckPlan: true,      // 制作者の知見をすべて使う
    bestRate: 1.00,
  },
  // --- ここから下は「ズル」をします ---------------------------------
  // 中身は強AIと同じで、ターン開始時に手札を1枚だけ、山札のより良い
  // カードと交換します（枚数は変えないので外からは分かりません）。
  // 詳しい仕組みと守っているルールは ai-deckstack.js を見てください。
  expert: {
    label: 'エキスパート',
    simple: false,
    deckPlan: true,
    bestRate: 1.00,
    swapProb: 0.40,      // 4割のターンだけ手札が噛み合う
  },
  unfair: {
    label: '理不尽',
    simple: false,
    deckPlan: true,
    bestRate: 1.00,
    swapProb: 1.00,      // 毎ターン必ず噛み合う
  },
};


const AiPlayer = {

  /* =============================================================
     CPUを1体つくる
     -------------------------------------------------------------
       side       … 'village' か 'mansion'
       difficulty … 'weak' / 'normal' / 'strong'
       seed       … 迷ったときの選び方を再現できるようにする数
     ============================================================= */
  create: function (side, difficulty, seed) {
    const prof = AI_PROFILES[difficulty] || AI_PROFILES.strong;
    const rng = this._makeRng(seed || 1);
    const self = this;

    return {
      side: side,
      difficulty: difficulty,
      profile: prof,

      /* ターン開始時に呼ぶ（ドローより前）。
         エキスパート・理不尽だけが、ここで手札を1枚入れ替えます。
         強以下では何も起きません。 */
      onTurnStart: function () {
        if (typeof AiDeckStack === 'undefined') return false;
        return AiDeckStack.arrange(side, prof, rng);
      },

      /** メインステップで何をするか */
      chooseMainAction: function () {
        const acts = AiCore.legalMainActions(side);
        const scored = acts.map(function (a) {
          return {
            act: a,
            score: prof.simple ? self._scoreMainWeak(side, a)
                               : AiHeuristic.scoreMain(side, a, prof),
          };
        });
        return self._pickByScore(scored, prof, rng, acts).act;
      },

      /** 追跡をどうするか */
      choosePursuit: function () {
        const opts = AiCore.legalPursuits(side);
        const scored = opts.map(function (o) {
          return {
            act: o,
            score: prof.simple ? self._scorePursuitWeak(side, o)
                               : AiHeuristic.pursuitScore(side, o, prof),
          };
        });
        return self._pickByScore(scored, prof, rng, opts).act;
      },

      /* 細かい選択は難易度で大きく変える必要がないため、
         弱でも同じ判断を使います（ここで差をつけると理不尽な動きに見えるため） */
      chooseDiscard: function (options) {
        return AiHeuristic.chooseDiscard(side, options);
      },
      choosePick: function (options, canSkip) {
        return AiHeuristic.choosePick(side, options, canSkip);
      },
      chooseDamageTarget: function (options, amount) {
        return AiHeuristic.chooseDamageTarget(side, options, amount);
      },
      shouldMulligan: function () {
        return AiHeuristic.shouldMulligan(side);
      },
      /* マリガンで山札へ戻すカードのuid一覧。
         このゲームは1枚ずつ選べるので、丸ごと引き直すのではなく
         「序盤に働かない札」だけを戻します。 */
      chooseMulligan: function () {
        return AiHeuristic.chooseMulligan(side);
      },
      shouldUseOptional: function (cardId) {
        return AiHeuristic.shouldUseOptional(side, cardId);
      },
    };
  },

  /* =============================================================
     点数から実際に1つ選ぶ
     -------------------------------------------------------------
     いちばん高い手を選ぶのが基本ですが、難易度に応じて
     「たまに2番目以降を選ぶ」ことで弱さを表現します。
     ============================================================= */
  _pickByScore: function (scored, prof, rng, fallback) {
    // 点数の高い順に並べる
    const sorted = scored.slice().sort(function (a, b) {
      return b.score - a.score;
    });

    // 最善を選ぶかどうかの抽選
    if (rng() < prof.bestRate || sorted.length === 1) {
      const best = sorted[0];
      // 強・中は「何もしない方がまし（0点以下）」なら見送る
      if (!prof.simple && best.score <= 0) {
        const pass = scored.find(function (x) {
          return x.act.kind === 'PASS' || x.act.kind === 'NO_PURSUE';
        });
        if (pass) return pass;
      }
      return best;
    }

    // 最善を外す場合：2番目以降からひとつ選ぶ
    // （まったくの的外れにならないよう、上位の中から選びます）
    const pool = sorted.slice(1, Math.max(2, Math.min(4, sorted.length)));
    return pool[Math.floor(rng() * pool.length)] || sorted[0];
  },

  /* =============================================================
     弱モードの評価：目先の盤面だけを見る
     -------------------------------------------------------------
     ・襲撃の結果を計算しない（誰が倒れるか読まない）
     ・気力を貯めない（出せるカードはとにかく出す）
     ・人間は「もう最後の1体」になってから慌てて出す
     初心者がやりがちな動きを、そのまま点数にしています。
     ============================================================= */
  _scoreMainWeak: function (side, a) {
    if (a.kind === 'PASS') return 0;

    const p = Game.state.players[side];
    const c = a.inst;
    const cost = c.master.cost || 0;

    // 気力を使い切りたいので、重いカードほど高く見る
    let s = 4 + cost * 3;

    if (a.kind === 'PLAY_YOUKAI') {
      // 攻撃役が好き。スピードが高いほど嬉しい
      s += 6 + (c.master.speed || 0) * 2;
    } else if (a.kind === 'PLAY_HUMAN') {
      // 人間は「もう後がない」と気づいてから出す
      s += (p.humans.length <= 1) ? 12 : 1;
    } else if (a.kind === 'EQUIP_GOODS') {
      s += 3;
    } else if (a.kind === 'PLAY_EVENT') {
      s += 2;
    }
    return s;
  },

  /* -------------------------------------------------------------
     弱モードの追跡：とにかく殴る
     -------------------------------------------------------------
     倒せるかどうかも、反撃で死ぬかどうかも計算しません。
     「スピードが高い怪異で、体力が少なそうな人間を狙う」だけです。
     ------------------------------------------------------------- */
  _scorePursuitWeak: function (side, opt) {
    if (!opt || opt.kind === 'NO_PURSUE') return 0.5;   // 攻めないは最低限の点

    const aStats = Game.getStats(opt.youkai);
    const dStats = Game.getStats(opt.human);
    const remain = dStats.maxHp - opt.human.accumulatedDamage;

    // 見た目の強さ（スピード）と、相手の残り体力の少なさだけで決める
    return 10 + aStats.curSpeed * 2 - remain;
  },

  /* =============================================================
     再現できる乱数（同じseedなら毎回同じ手を選ぶ）
     ============================================================= */
  _makeRng: function (seed) {
    // seedをよく混ぜてから使う。
    // xorshift32は1や2のような小さい種のままだと、最初の何回かが
    // 極端に小さい値になり「4割の確率」のような判定が狂います。
    let x = (seed >>> 0) || 1;
    x = Math.imul(x, 2654435761) >>> 0;   // 種を散らす
    if (x === 0) x = 0x9E3779B9;
    const next = function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;  x >>>= 0;
      return x / 4294967296;
    };
    for (let i = 0; i < 12; i++) next();  // 助走させて偏りを消す
    return next;
  },
};

/* Node.jsでのヘッドレステスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AiPlayer: AiPlayer, AI_PROFILES: AI_PROFILES };
}
