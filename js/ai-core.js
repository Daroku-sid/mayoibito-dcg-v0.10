/* =====================================================================
   ai-core.js  ―― CPU対戦の土台（Stage 2）
   ---------------------------------------------------------------------
   このファイルは「調べるだけ」で、盤面を変えることは一切しません。
   ゲームの状態を読んで、

     ・いま選べる行動をすべて並べる（合法手の列挙）
     ・追跡と襲撃の結果がどうなるかを予測する

   の2つを提供します。どれを選ぶかの判断は ai-heuristic.js が持ちます。

   ここで作る関数は、CPU専用ではなく画面側からも使えます。
   たとえばv0.2の「まだ有効に使えるカードがあります」という警告は、
   canLegallyPlayCard() をそのまま使えます。

   読み込み順： cards → decks → random → effects → game → ai-core → ui
   （Game と Effects を使うので、game.js より後ろに置いてください）
   ===================================================================== */

const AiCore = {

  /* =============================================================
     1. 襲撃の結果を予測する
     -------------------------------------------------------------
     「この怪異でこの人間を襲ったらどうなるか」を、実際に襲撃せずに
     計算します。盤面は一切変えません。

     襲撃は同時ダメージなので、人間側からも反撃が返ってきます。
     軽減（小さな鍵など）はGame._calcReductionをそのまま使うので、
     本番の襲撃と必ず同じ数字になります。

     返り値：
       toHuman      人間へ与える最終ダメージ
       toYoukai     怪異が受ける反撃の最終ダメージ
       killsHuman   この襲撃で人間が倒れるか
       killsYoukai  反撃で怪異が倒れるか（相打ち判定に使う）
       mutual       両方倒れるか（相打ち）
     ============================================================= */
  forecast: function (youkaiInst, humanInst, defenseMargin) {
    const aStats = Game.getStats(youkaiInst);
    const dStats = Game.getStats(humanInst);
    if (!aStats.hasStats || !dStats.hasStats) return null;

    // 軽減はGameの計算をそのまま借りる（本番とズレないようにするため）
    const redHuman = Game._calcReduction(humanInst).total;
    const redYoukai = Game._calcReduction(youkaiInst).total;

    // defenseMargin は「相手がこの1ターンの猶予で防御札を使ってくる」想定分。
    // 強いAIが『守られても倒せるか』を見るときに使う（省略時は0）。
    const margin = defenseMargin || 0;
    const toHuman = Math.max(0, Math.max(0, aStats.curSpeed - redHuman) - margin);
    const toYoukai = Math.max(0, dStats.curSpeed - redYoukai);

    // 蓄積ダメージ ＋ 今回のダメージ が最大体力に届いたら倒れる
    const killsHuman = (humanInst.accumulatedDamage + toHuman) >= dStats.maxHp;
    const killsYoukai = (youkaiInst.accumulatedDamage + toYoukai) >= aStats.maxHp;

    return {
      youkai: youkaiInst,
      human: humanInst,
      toHuman: toHuman,
      toYoukai: toYoukai,
      killsHuman: killsHuman,
      killsYoukai: killsYoukai,
      mutual: killsHuman && killsYoukai,
    };
  },

  /* =============================================================
     2. いま自分が受けている追跡を調べる
     -------------------------------------------------------------
     相手の怪異が自分の人間を追跡していると、次の相手ターンの開始時に
     襲撃されます。この「1ターンの猶予」の間に守るのがこのゲームの肝
     なので、AIは常にこれを見る必要があります。

     返り値：{ youkai:相手の怪異, human:自分の人間, forecast:予測 } または null
     ============================================================= */
  incomingPursuit: function (side) {
    const st = Game.state;
    const other = (side === 'village') ? 'mansion' : 'village';
    const pair = st.tracking[other];
    if (!pair || !pair.youkai || !pair.human) return null;
    return {
      youkai: pair.youkai,
      human: pair.human,
      forecast: this.forecast(pair.youkai, pair.human),
    };
  },

  /** 自分が仕掛けている追跡（相手を襲撃する予約）を調べる */
  outgoingPursuit: function (side) {
    const pair = Game.state.tracking[side];
    if (!pair || !pair.youkai || !pair.human) return null;
    return {
      youkai: pair.youkai,
      human: pair.human,
      forecast: this.forecast(pair.youkai, pair.human),
    };
  },

  /* =============================================================
     3. そのカードがいま出せる（使える）か
     -------------------------------------------------------------
     Game.canPlay をそのまま使う薄い包み。
     画面側の「まだ使えるカードがある」警告と、CPUの合法手列挙で、
     必ず同じ判定を使うためにここに置いています。
     ============================================================= */
  canLegallyPlayCard: function (side, inst) {
    return Game.canPlay(side, inst).ok === true;
  },

  /** 手札の中に、いま出せるカードが1枚でもあるか */
  hasAnyPlayableCard: function (side) {
    const p = Game.state.players[side];
    const self = this;
    return p.hand.some(function (c) { return self.canLegallyPlayCard(side, c); });
  },

  /* =============================================================
     4. メインステップでできることを全部並べる
     -------------------------------------------------------------
     返すのは次の形の配列です。最後に必ず「何もしない（PASS）」が入ります。

       { kind:'PLAY_HUMAN',  inst:手札のカード }
       { kind:'PLAY_YOUKAI', inst:手札のカード }
       { kind:'EQUIP_GOODS', inst:手札のグッズ, target:装備先 }
       { kind:'PLAY_EVENT',  inst:手札のカード }
       { kind:'PASS' }

     グッズは装備先ごとに別の行動として並べます（どこに付けるかも判断
     の対象なので）。
     ============================================================= */
  legalMainActions: function (side) {
    const p = Game.state.players[side];
    const acts = [];
    const self = this;

    p.hand.forEach(function (inst) {
      if (!self.canLegallyPlayCard(side, inst)) return;
      const type = inst.master.type;

      if (type === 'human') {
        acts.push({ kind: 'PLAY_HUMAN', inst: inst });
      } else if (type === 'youkai') {
        acts.push({ kind: 'PLAY_YOUKAI', inst: inst });
      } else if (type === 'goods') {
        Game.getGoodsTargets(side, inst).forEach(function (t) {
          acts.push({ kind: 'EQUIP_GOODS', inst: inst, target: t });
        });
      } else if (type === 'event') {
        acts.push({ kind: 'PLAY_EVENT', inst: inst });
      }
    });

    acts.push({ kind: 'PASS' });
    return acts;
  },

  /* =============================================================
     5. 追跡の選び方を全部並べる
     -------------------------------------------------------------
     「どの怪異で、どの相手の人間を追跡するか」の組み合わせすべてと、
     「追跡しない」の選択肢を返します。

       { kind:'PURSUE', youkai:自分の怪異, human:相手の人間, forecast:予測 }
       { kind:'NO_PURSUE' }

     すでに追跡している怪異は、重ねて追跡できないので除きます。
     ============================================================= */
  legalPursuits: function (side) {
    const st = Game.state;
    const other = (side === 'village') ? 'mansion' : 'village';
    const me = st.players[side];
    const you = st.players[other];
    const opts = [];
    const self = this;

    // すでにこの陣営が追跡を設定しているなら、新たな追跡はできない
    const already = st.tracking[side];
    if (!already) {
      me.youkai.forEach(function (yk) {
        if (yk.tracking) return;          // 念のため
        you.humans.forEach(function (hm) {
          opts.push({
            kind: 'PURSUE',
            youkai: yk,
            human: hm,
            forecast: self.forecast(yk, hm),
          });
        });
      });
    }

    opts.push({ kind: 'NO_PURSUE' });
    return opts;
  },

  /* =============================================================
     6. 盤面を読むための小さな道具
     -------------------------------------------------------------
     Stage 3の評価関数で何度も使うものを、ここにまとめておきます。
     ============================================================= */

  /** 敗北まであと何枚ロストできるか（0になったら負け） */
  lostRoom: function (side) {
    const p = Game.state.players[side];
    const limit = p.field.master.lostLimit;
    return Math.max(0, limit - p.lost.length);
  },

  /** その陣営が「次の1体を失うと負ける」状態か */
  isOnTheBrink: function (side) {
    const p = Game.state.players[side];
    return this.lostRoom(side) <= 1 || p.humans.length <= 1;
  },

  /** トラッシュ／ロストにある、指定した特徴を持つカードの枚数 */
  countTrait: function (side, zone, trait) {
    const p = Game.state.players[side];
    const list = (zone === 'lost') ? p.lost : p.trash;
    return list.filter(function (c) {
      const t = c.master.traits || [];
      return t.indexOf(trait) !== -1;
    }).length;
  },

  /** 自分の場（人間＋怪異）に、指定したカードIDのものがいるか */
  hasCardOnField: function (side, cardId) {
    const p = Game.state.players[side];
    return p.humans.concat(p.youkai).some(function (c) {
      return c.cardId === cardId;
    });
  },

  /** 手札に指定したカードIDが何枚あるか */
  countInHand: function (side, cardId) {
    const p = Game.state.players[side];
    return p.hand.filter(function (c) { return c.cardId === cardId; }).length;
  },
};

/* Node.jsでのヘッドレステスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AiCore;
}
