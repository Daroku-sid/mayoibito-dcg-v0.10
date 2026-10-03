/* =====================================================================
   ai-heuristic.js  ―― 対戦AIの「考え方」（Stage 3・強モードの中身）
   ---------------------------------------------------------------------
   シミュレーター（Python版）で作り込んだ評価関数を、そのまま移植した
   ものです。制作者の実戦知見がここに詰まっています。

   仕組みはとても単純で、

     ・いまできる行動それぞれに点数をつける
     ・いちばん点数の高い行動を選ぶ

   これだけです。「点数のつけ方」に、勝つための考え方が入っています。

   判断の優先順位（Python版と同じ）:
     1. 即座の勝敗（勝てる／負けを避ける）が最優先
     2. 追跡の結果を予測する（相手には1ターンの防御猶予がある）
     3. 人間は「効果が強いから」ではなく「負けを避けるのに要るか」で出す
     4. 怪異は相打ちや削りも、有利な取引として評価する
     5. グッズは「結果が変わるか」で判断（無駄打ちしない）
     6. 気力の計画（切り札の着地を遅らせない）
     7. 山札切れの管理

   【見てよい情報のルール】
   このAIが見るのは公開情報だけです。
   相手の手札の中身と、山札の並び順は絶対に見ません。
   （見ているのは：両者の場・フィールド・トラッシュ・ロスト・山札の残り
     枚数・相手の手札の枚数・気力・追跡の状況・蓄積ダメージ・自分の手札）

   読み込み順： cards → decks → random → effects → game → ai-core →
                ai-heuristic → ui
   ===================================================================== */

/* カードIDをまとめて名前で呼べるようにする（打ち間違い防止） */
const AI_CARD = {
  ISABELLA: 'mansion_isabella',
  ELISE: 'mansion_elise',
  SYLVIE: 'mansion_sylvie',
  CLAUDE: 'mansion_claude',
  ANNETTE: 'mansion_annette',
  KEY: 'mansion_key',
  SAKURYAKU: 'mansion_sakuryaku',
  NUSHI: 'village_nushi',
  KAKASHI: 'village_kakashi',
  KOHAKU: 'village_kohaku',
  LUNA: 'village_luna',
  KAEDE: 'village_kaede',
  RIN: 'village_rin',
  KYOUKAISEN: 'event_kyoukaisen',
  SASHINOBERU: 'village_sashinoberu',
  FIELD_VILLAGE: 'field_village',
  FIELD_MANSION: 'field_mansion',
};

/* 数ターン先の気力計画で守るべき切り札 */
const AI_KEY_CARDS = [AI_CARD.ISABELLA, AI_CARD.NUSHI];


/* シミュレーターでの測定にもとづく調整値
   （数字を変えるとAIの好みが変わります。根拠はコメントに書いてあります） */
const AI_TUNE = {
  // 効果が空振りするコハクを出し渋る強さ。
  // 実測: 相手怪異0体でのコハクが全体の43%もあり、登場時1点が無駄になっていた。
  // この減点で空振り率18%まで下がり、村の勝率が61%→67%に上がった。
  kohakuHold: 28,
  // 安い怪異で高い人間を倒す価値。
  // 倒された枠を埋め直すために、相手は高い気力を払わされる（横並べの強要）。
  // 実測: 洋館の勝率が+3ポイント。
  killTempo: 12,
  // 攻撃役が0体の状態を解消する価値。
  // 1ターンに1組しか追跡できないので、0体と1体の差だけが決定的。
  firstAttacker: 16,
  // 2体目以降を「保険」として用意する価値。
  // 相手が除去を持っている確率を掛けて使うので、実際の加点はこれより小さい。
  reserveW: 40,
  // すでに相打ち覚悟で追跡しているときの、控えの追加価値
  reserveTrade: 6,
  // 効果を持たない怪異を、意味なく2体目として並べることへの減点。
  // 1ターンに1組しか追跡できないので、そのターンは完全に無駄になる。
  redundant: 18,
  // マリガンで手札に残す同名カードの上限
  mullSameMax: 2,
  // マリガンで戻す「重いカード」のコスト
  mullHeavyCost: 4,
  // クロードの「離れた時に気力+1」を、実質の値引きとして見込む分
  claudeRefund: 5,
  // シルヴィが「イザベラを探せる」ことの価値
  sylvieIsa: 7,
  // シルヴィが「〔洋館〕グッズ/イベントも一緒に拾える」ことの価値
  sylvieUtil: 3,
  // 3枚目のロストを通してイザベラのバフを働かせる判断を使うか
  wantThirdLost: 1,
  // ヌシ様の効果が働くトラッシュ〔村〕の枚数（カードの記載は10枚）
  nushiTrash: 10,
};

/* 難易度の既定値。強モードは知見をすべて使う */
const AI_PROF_FULL = { deckPlan: true };


const AiHeuristic = {

  /* =============================================================
     道具（盤面を読むための小さな関数）
     ============================================================= */

  _other: function (side) {
    return (side === 'village') ? 'mansion' : 'village';
  },

  /** 場のカード全部（人間＋怪異） */
  _units: function (side) {
    const p = Game.state.players[side];
    return p.humans.concat(p.youkai);
  },

  /** トラッシュにある、指定した特徴を持つカードの枚数 */
  _trashTraitCount: function (side, trait) {
    return AiCore.countTrait(side, 'trash', trait);
  },

  /** ロストにある、指定した特徴を持つカードの枚数 */
  _lostTraitCount: function (side, trait) {
    return AiCore.countTrait(side, 'lost', trait);
  },

  /* -------------------------------------------------------------
     相手が「まだ持っているか」を、公開情報だけから見積もる
     -------------------------------------------------------------
     デッキの中身は固定なので、相手のデッキに各カードが何枚入っているかは
     お互いに分かっています。そこから、すでに見えた枚数（トラッシュ・
     ロスト・場）を引けば、相手の手札か山札に何枚残っているかが分かります。

     例: コハクは4枚。3枚がトラッシュに見えていれば、残りは1枚だけ。
     覗き見ではなく、人間なら当然やっている数え上げです。
     ------------------------------------------------------------- */

  /** そのデッキに、そのカードが元々何枚入っているか */
  _deckTotal: function (side, cardId) {
    // v0.3：席が使っているデッキを見る（ミラー対戦に対応するため）
    const def = Game.deckOf(side);
    if (!def) return 0;
    let n = 0;
    def.mainDeck.forEach(function (e) {
      if (e.id === cardId) n += e.count;
    });
    return n;
  },

  /** 相手の手札か山札に、そのカードがまだ何枚眠っているか */
  _oppUnseenCopies: function (side, cardId) {
    const other = this._other(side);
    const o = Game.state.players[other];
    let seen = 0;
    const count = function (list) {
      list.forEach(function (c) { if (c.cardId === cardId) seen++; });
    };
    count(o.trash); count(o.lost); count(o.humans); count(o.youkai);
    o.humans.concat(o.youkai).forEach(function (u) {
      if (u.equippedGoods && u.equippedGoods.cardId === cardId) seen++;
    });
    return Math.max(0, this._deckTotal(other, cardId) - seen);
  },

  /** 相手が今それを手札に持っている確率のおおよその値 */
  _oppHoldsProb: function (side, cardId) {
    const o = Game.state.players[this._other(side)];
    const unseen = this._oppUnseenCopies(side, cardId);
    if (unseen <= 0) return 0;
    const hidden = o.hand.length + o.deck.length;
    if (hidden <= 0) return 0;
    const miss = 1 - (o.hand.length / hidden);
    return 1 - Math.pow(miss, unseen);
  },

  /** 相手がこの人間を守るために足せる体力の見込み
      村の防御札は《懐中電灯》で体力+1・コスト0。持っていれば必ず使えるが、
      増えるのは体力1だけ。すでにグッズを着けた人間には重ねられない。
      → 残り体力1の人間は、懐中電灯では守り切れない。 */
  _oppDefenseHp: function (side, dfn) {
    if (dfn.equippedGoods) return 0;          // 1体にグッズは1枚まで
    const o = Game.state.players[this._other(side)];
    if (o.field.cardId !== AI_CARD.FIELD_VILLAGE) return 0;
    return this._oppHoldsProb(side, 'village_flashlight');
  },

  /* -------------------------------------------------------------
     控えの怪異を用意しておく価値（保険）
     -------------------------------------------------------------
     1ターンに1組しか追跡できないので、2体目の怪異はそのターン何もしません。
     価値があるのは「今の攻撃役が落とされたときに、攻撃が途切れないこと」だけ。
     したがって、

       ・相手が除去（コハク1点・リン2点）を持っていそうか
       ・今いる怪異が、その除去や反撃で実際に落ちる状態か

     の両方が満たされるときだけ加点します。
     相手の残り枚数は、トラッシュ・ロスト・場に見えた数から見積もります
     （公開情報だけを使うので、覗き見にはあたりません）。
     ------------------------------------------------------------- */
  _reserveValue: function (side) {
    const p = Game.state.players[side];
    if (!p.youkai.length) return 0;

    // いま場にいる怪異のうち、いちばん落ちにくいものの「残り体力」
    let toughest = 0;
    p.youkai.forEach(function (u) {
      const stt = Game.getStats(u);
      const remain = stt.maxHp - u.accumulatedDamage;
      if (remain > toughest) toughest = remain;
    });

    // 相手がその残り体力を削り切れる確率
    const risk = this._oppFinishProb(side, toughest);
    if (risk <= 0) return 0;

    // 自分が追跡を仕掛けていて相打ちになるなら、次のターン攻撃役が消える
    const out = this._outgoing(side);
    const willTrade = (out && out.forecast && out.forecast.killsYoukai) ? 1 : 0;

    return AI_TUNE.reserveW * risk + (willTrade ? AI_TUNE.reserveTrade : 0);
  },

  /* その怪異が「攻撃役を増やす」以外の仕事をするか。
     制作者の整理: ヌシ様のような制圧、コハクのような除去、
     案山子のようなリソース回しがあるなら、横並べは肯定される。 */
  _deployHasOwnValue: function (side, c) {
    const id = c.cardId;
    const o = Game.state.players[this._other(side)];
    if (id === AI_CARD.NUSHI) return true;      // 常在で相手全体のスピード-1
    if (id === AI_CARD.KAKASHI) return true;    // 墓地を肥やしつつ回収
    if (id === AI_CARD.KOHAKU) {
      // 自分のフィールドが〔村〕でなければ登場時効果は不発になる
      return o.youkai.length > 0 && this._fieldHasTrait(side, '村');
    }
    return false;
  },

  /** 自分のフィールドが指定の特徴を持つか（効果の条件によく使う） */
  _fieldHasTrait: function (side, trait) {
    const f = Game.state.players[side].field;
    return ((f.master.traits || []).indexOf(trait) !== -1);
  },

  /** 自分が仕掛けている追跡 */
  _outgoing: function (side) {
    return AiCore.outgoingPursuit(side);
  },

  /** 残り体力 remain の自分の怪異を、相手が登場時効果で仕留められる確率 */
  _oppFinishProb: function (side, remain) {
    if (remain <= 0) return 1;
    const o = Game.state.players[this._other(side)];
    if (o.field.cardId !== AI_CARD.FIELD_VILLAGE) return 0;
    let best = 0;
    // コハク（2コスト・登場時1点）。怪異の枠と気力が要る
    if (remain <= 1 && o.youkai.length < MAX_YOUKAI && o.energy + 2 >= 2) {
      best = Math.max(best, this._oppHoldsProb(side, AI_CARD.KOHAKU));
    }
    // リン（2コスト・登場時2点）。トラッシュ〔村〕5枚以上という公開条件つき
    if (remain <= 2 && o.humans.length < MAX_HUMANS && o.energy + 2 >= 2 &&
        this._trashTraitCount(this._other(side), '村') >= 5) {
      best = Math.max(best, this._oppHoldsProb(side, AI_CARD.RIN));
    }
    return best;
  },

  /* -------------------------------------------------------------
     その人間は「倒された方が得」か
     -------------------------------------------------------------
     黒薔薇の館は、ロストに3枚目が置かれた時に気力が1回復します。
     イザベラの常在も、ロストの〔洋館〕が3枚以上で初めて働きます。
     つまりロスト2枚の状態で3枚目が入ることは、洋館にとって前進です。

     ここを守ってしまうと、自分でイザベラのバフを止めることになります。
     （制作者の指摘: 3枚目のロストに行くはずの人間に鍵をつけるのは悪手。
       大人しくイザベラの効果を使わせるべき）

     ただし次の場合は当然守ります。
       ・そのロストで敗北する
       ・最後の人間で、倒れると人間0体の敗北になる
     ------------------------------------------------------------- */
  _deathIsWanted: function (side, human) {
    if (!AI_TUNE.wantThirdLost) return false;
    const p = Game.state.players[side];
    // 負けにつながるなら、当然そのまま守る
    if ((p.lost.length + 1) >= p.field.master.lostLimit) return false;
    if (p.humans.length <= 1) return false;
    // 〔洋館〕でなければロストが〔洋館〕で揃わず、館の気力回復も起きない
    if ((human.master.traits || []).indexOf('洋館') === -1) return false;
    // ちょうど3枚目になるときだけ
    if (this._lostTraitCount(side, '洋館') !== 2) return false;
    // イザベラが場にいるか手札にあるなら、バフが働き始める価値が大きい
    const isaOnField = this._units(side).some(function (x) {
      return x.cardId === AI_CARD.ISABELLA;
    });
    const isaInHand = p.hand.some(function (x) {
      return x.cardId === AI_CARD.ISABELLA;
    });
    return isaOnField || isaInHand;
  },

  /** 襲撃の予測（AiCoreのものをそのまま使う） */
  _forecast: function (youkai, human, defenseMargin) {
    return AiCore.forecast(youkai, human, defenseMargin);
  },

  /** 自分に向いている追跡（相手が予約している襲撃） */
  _incoming: function (side) {
    return AiCore.incomingPursuit(side);
  },

  /* -------------------------------------------------------------
     あと何ターンで気力がneedに届くか
     -------------------------------------------------------------
     黒薔薇の館の「ロスト3枚目で気力+1」も見込みに入れます。
     イザベラを何ターン後に出せるかを数えるのに使います。
     ------------------------------------------------------------- */
  _turnsToAfford: function (side, energy, need) {
    if (energy >= need) return 0;
    const p = Game.state.players[side];
    let bonus = 0;

    if (p.field.cardId === AI_CARD.FIELD_MANSION && p.lost.length === 2) {
      const allMansion = p.lost.every(function (c) {
        return (c.master.traits || []).indexOf('洋館') !== -1;
      });
      if (allMansion) {
        const inc = this._incoming(side);
        if (inc && inc.forecast && inc.forecast.killsHuman &&
            (inc.human.master.traits || []).indexOf('洋館') !== -1) {
          bonus = 1;   // 次の襲撃で3枚目のロスト → 館の効果で気力+1が見込める
        }
      }
    }

    let t = 0;
    let e = energy;
    while (e < need && t < 10) {
      t += 1;
      e += 2 + ((t === 1) ? bonus : 0);
    }
    return t;
  },

  /* -------------------------------------------------------------
     このカードを今使うと、切り札の着地が何ターン遅れるか
     -------------------------------------------------------------
     手札にイザベラやヌシ様を抱えているとき、安いカードに気力を使って
     着地が遅れるなら、その分を減点します。
     ------------------------------------------------------------- */
  _delayPenalty: function (side, inst) {
    const p = Game.state.players[side];
    let pen = 0;
    const self = this;
    p.hand.forEach(function (k) {
      if (k === inst) return;
      if (AI_KEY_CARDS.indexOf(k.cardId) === -1) return;
      // 切り札のために早くから気力を貯めるのは、実測では大きな損だった。
      // ・イザベラ … ロスト〔洋館〕が2枚になるまでは気にしない
      // ・ヌシ様   … 4コストは自然に届くので、そもそも貯める必要がない
      if (k.cardId === AI_CARD.ISABELLA) {
        if (self._lostTraitCount(side, '洋館') < 2) return;
      } else if (k.cardId === AI_CARD.NUSHI) {
        return;
      }
      const need = k.master.cost || 0;
      const cost = inst.master.cost || 0;
      const now = self._turnsToAfford(side, p.energy, need);
      const after = self._turnsToAfford(side, p.energy - cost, need);
      pen += (after - now) * 12;
    });
    return pen;
  },

  /* =============================================================
     メインステップの行動に点数をつける
     -------------------------------------------------------------
     legalMainActions() が返した行動ひとつを受け取り、点数を返します。
     ============================================================= */
  scoreMain: function (side, a, prof) {
    // prof.deckPlan が false のときは「デッキ固有の知見」を使わない。
    // ゲームの基本（勝敗の読み・襲撃の予測）は残るので、中モードは
    // 「セオリーは知らないが、盤面はきちんと読める人」になる。
    prof = prof || AI_PROF_FULL;
    const st = Game.state;
    const other = this._other(side);
    const p = st.players[side];
    const o = st.players[other];
    const self = this;

    if (a.kind === 'PASS') return 0;

    const c = a.inst;
    const id = c.cardId;
    const cost = c.master.cost || 0;
    let s = 0;

    /* ---------- 怪異を出す ---------- */
    if (a.kind === 'PLAY_YOUKAI') {
      s = 6 + (c.master.speed * 1.5) + (c.master.hp * 0.5);

      // 盤面プレッシャー：
      // このゲームは1ターンに1組しか追跡できません。
      // なので「攻撃役が0体」と「1体以上」の差だけが決定的で、
      // 効果を持たない怪異を2体目として並べても、そのターンは何もしません。
      // 先にコストを払って自分の選択肢を狭めるだけの悪手になります。
      //
      // 例外は「保険」が要るとき。相手のコハク・リン・ヌシ様で今の攻撃役が
      // 落とされそうなら、控えを用意しておく価値があります。
      // 効果を持つ怪異（コハク・案山子・ヌシ様など）の価値は、
      // このあとの「カードごとの上乗せ」で別に評価します。
      if (id !== AI_CARD.ISABELLA && o.humans.length > 0 &&
          this._delayPenalty(side, c) === 0) {
        if (p.youkai.length === 0) {
          s += AI_TUNE.firstAttacker;      // 攻撃が途切れている状態を解消する
        } else if (this._deployHasOwnValue(side, c)) {
          // 効果そのものが仕事をする怪異は、2体目でも出す価値がある。
          // 効果ぶんの点数は、このあとの「カードごとの上乗せ」で加える。
        } else {
          // 効果を持たない怪異の2体目。そのターンは何もできないので、
          // 保険が要らないなら先にコストを払うだけ損になる。
          s += this._reserveValue(side) - AI_TUNE.redundant;
        }
      }

      // イザベラを手札に抱えているときの気力の守り方：
      // 理想は「ロスト3枚・最後の人間が倒される直前・気力2」を作ること。
      // ビートダウンは続けたいので、着地が目前のときだけ強く抑える。
      if (prof.deckPlan && id !== AI_CARD.ISABELLA) {
        const holdsIsa = p.hand.some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        // 制作者の指摘(実測で確認): イザベラを引いた瞬間から気力を守ると、
        // 殴るべき序盤に殴れず、着地しても点が取れていない状態になる。
        // ロストが2枚(=3枚目が目前)になってから初めて守り始めるのが最も強い。
        if (holdsIsa && this._lostTraitCount(side, '洋館') >= 2) {
          if (p.energy - cost < 3) s -= 22;
        }
      }

      /* --- カードごとの上乗せ --- */
      if (id === AI_CARD.ISABELLA && prof.deckPlan) {
        s = 4;   // バフ条件を満たさない早出しは基本待つ
        const lostMansion = this._lostTraitCount(side, '洋館');
        const eliseInLost = p.lost.some(function (x) {
          return x.cardId === AI_CARD.ELISE;
        });
        const reviveUsed = Game.isEffectUsed(
          Game.gameUseKey(side, AI_CARD.ISABELLA));
        const willRevive = eliseInLost && !reviveUsed &&
                           p.humans.length < MAX_HUMANS;
        const lostAfter = lostMansion - (willRevive ? 1 : 0);

        if (lostAfter >= 3) {
          // 着地後もバフが有効。場の〔洋館〕怪異が多いほど効果が大きい
          const mansionYoukai = p.youkai.filter(function (u) {
            return (u.master.traits || []).indexOf('洋館') !== -1;
          }).length;
          s += 24 + 4 * mansionYoukai;
        }
        if (willRevive) {
          // 制作者の指摘: 脅威が無いのに蘇生目当てで出すのは悪手。
          // エリーゼを戻すとロストが3枚→2枚に減り、イザベラ自身のバフ条件
          // （ロスト3枚以上）が外れる。素の3/5のイザベラと、バフの乗らない
          // エリーゼを晒すだけになり、デッキの強みを自分から捨てることになる。
          // したがって蘇生の価値は「それで負けを避けられるとき」にだけ数える。
          if (lostAfter < 3 && lostMansion >= 3) {
            s -= 20;   // 自分からバフを消す着地は避ける
          }
          // 制作者想定の最強ムーブ：
          // 次の襲撃で負けが確定する場面を、蘇生でロストを減らして回避する
          const inc = this._incoming(side);
          const limit = p.field.master.lostLimit;
          if (inc && (p.lost.length + 1) >= limit &&
              inc.forecast && inc.forecast.killsHuman) {
            s += 2000;   // 敗北回避は最優先
          }
          if ((p.lost.length + 1) >= limit) {
            s += 30;     // 敗北ライン際でのロスト回復は常に高価値
          }
        }
      } else if (id === AI_CARD.NUSHI && prof.deckPlan) {
        // カードの条件は「トラッシュに〔村〕が10枚以上」。
        // 満たすと相手の人間・怪異すべてのスピードが-1される制圧札になる。
        // 目前（8枚以上）なら、次のターンには働き始める見込みで少し加点。
        const nushiTrash = this._trashTraitCount(side, '村');
        s += 4 + (nushiTrash >= AI_TUNE.nushiTrash ? 10 :
                  (nushiTrash >= AI_TUNE.nushiTrash - 2 ? 4 : 0));
      } else if (id === AI_CARD.CLAUDE && prof.deckPlan) {
        // 【離れた時】自分のフィールドが〔洋館〕なら気力が1回復する。
        // 倒されても気力が戻るので、実質のコストが下がる＝安く殴りに行ける。
        if (this._fieldHasTrait(side, '洋館')) s += AI_TUNE.claudeRefund;
      } else if (id === AI_CARD.KAKASHI && prof.deckPlan) {
        s += 6;   // 墓地を肥やしつつ回収もできるエンジン役
      } else if (id === AI_CARD.KOHAKU && prof.deckPlan &&
                 this._fieldHasTrait(side, '村')) {
        // コハクは登場時に相手怪異へ1点。傷んだ怪異を落とせると非常に強い。
        // 特にカエデ等で削れた甲冑を倒す動きが強力。
        const canFinish = o.youkai.some(function (u) {
          const stt = Game.getStats(u);
          return (u.accumulatedDamage + 1) >= stt.maxHp;
        });
        if (canFinish) {
          s += 16;
          // その怪異が自分の人間を追跡中なら、予約された襲撃ごと消せる
          const inc = this._incoming(side);
          if (inc) {
            const stt = Game.getStats(inc.youkai);
            if ((inc.youkai.accumulatedDamage + 1) >= stt.maxHp) s += 12;
          }
        } else if (o.youkai.length > 0) {
          s += 4;   // 削っておく価値（次のコハク／カエデにつながる）
        } else {
          // 相手の怪異が0体なら、登場時の1点は完全に無駄になる。
          // コハクは攻撃役でもあるので出す価値自体はあるが、
          // 待てば効果を活かせるぶんは割り引く。
          s -= AI_TUNE.kohakuHold;
        }
      }
      if (prof.deckPlan) s -= this._delayPenalty(side, c);

    /* ---------- 人間を出す ---------- */
    } else if (a.kind === 'PLAY_HUMAN') {
      // 人間は「効果が強いから」ではなく「負けを避けるのに要るか」で出す。
      // 効果はあくまで必要性が立った上でのおまけ。
      s = -4;
      const inc = this._incoming(side);
      const lostDefeatNext =
        (p.lost.length + 1) >= p.field.master.lostLimit;
      let need = 0;

      if (p.humans.length === 1) {
        const lone = p.humans[0];
        let threatKill = false;
        if (inc && inc.human === lone && inc.forecast) {
          threatKill = inc.forecast.killsHuman;
        }
        const oneShot = o.youkai.some(function (m) {
          const f = self._forecast(m, lone);
          return f && f.killsHuman;
        });
        if (threatKill) need = 40;        // 次の襲撃で人間0体の負け
        else if (oneShot) need = 18;      // 一撃で落ちる圏内の唯一の人間
        if (need > 0 && lostDefeatNext) {
          need = 2;   // 横に並べてもロスト敗北は防げない
        }
      }
      s += need;

      /* --- 登場時効果のおまけ --- */
      let bonus = 1;
      if (!prof.deckPlan) {
        bonus = 1;   // 知見なしなら効果の中身までは踏み込まない
      } else if (id === AI_CARD.LUNA) {
        bonus = (p.deck.length > 10) ? 5 : 1;
      } else if (id === AI_CARD.KAEDE) {
        bonus = 4;   // 体力4で2ターン残りやすい
      } else if (id === AI_CARD.SYLVIE) {
        // 現在の能力: 山札の上5枚を見て、〔洋館〕グッズ/イベント1枚と
        // 「イザベラ」1枚の、合計2枚まで手札に加えられる。
        // （旧能力はどれか1枚だけだったので、当時の評価値では低すぎる）
        const holdsIsa = p.hand.some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        bonus = 6;
        // 山札に残っている枚数を数える（並び順は見ない＝公開情報の範囲）
        const isaLeft = p.deck.filter(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        }).length;
        const utilLeft = p.deck.filter(function (x) {
          const t = x.master.type;
          return (t === 'goods' || t === 'event') &&
                 (x.master.traits || []).indexOf('洋館') !== -1;
        }).length;
        // イザベラをまだ持っていなくて山札に残っているなら、探せる価値が高い
        if (!holdsIsa && isaLeft > 0) bonus += AI_TUNE.sylvieIsa;
        if (utilLeft > 0) bonus += AI_TUNE.sylvieUtil;  // 鍵・指輪・策略も拾える
        // シルヴィは体力4で相手怪異2ターン分の時間を稼ぎ、
        // 登場時に鍵／策略／イザベラを探せる洋館の要。
        // 負けを避ける必要がない平時でも、盤面にいなければ出す価値がある。
        const onBoard = p.humans.some(function (u) {
          return u.cardId === AI_CARD.SYLVIE;
        });
        if (p.field.cardId === AI_CARD.FIELD_MANSION && !onBoard &&
            p.humans.length < MAX_HUMANS) {
          const haveDefense = p.hand.some(function (x) {
            return x.cardId === AI_CARD.KEY || x.cardId === AI_CARD.SAKURYAKU;
          });
          need = Math.max(need, haveDefense ? 8 : 14);
        }
      } else if (id === AI_CARD.ANNETTE) {
        bonus = 3;
      } else if (id === AI_CARD.RIN) {
        bonus = 1;
        if (this._trashTraitCount(side, '村') >= 5 && o.youkai.length > 0) {
          const canRemove = o.youkai.some(function (u) {
            return (u.accumulatedDamage + 2) >= Game.getStats(u).maxHp;
          });
          if (canRemove) {
            bonus += 12;   // 2点で除去が取れる
          } else if (inc) {
            // 追跡中の怪異に2点入れると、襲撃が相打ちに変わるか
            const before = this._forecast(inc.youkai, inc.human);
            inc.youkai.accumulatedDamage += 2;
            const after = this._forecast(inc.youkai, inc.human);
            inc.youkai.accumulatedDamage -= 2;
            if (after && before && after.killsYoukai && !before.killsYoukai) {
              bonus += 10;   // 予定された襲撃を相打ちに変える
            }
          }
        }
      }
      s += (need > 2) ? bonus : (bonus - 8);
      if (prof.deckPlan) s -= this._delayPenalty(side, c);

    /* ---------- グッズを装備する ---------- */
    } else if (a.kind === 'EQUIP_GOODS') {
      // 結果が変わらない装備はしない
      const u = a.target;
      s = -5;
      const inc = this._incoming(side);
      let savesLife = false;

      if (inc && inc.human === u) {
        const before = this._forecast(inc.youkai, inc.human);
        const keep = u.equippedGoods;
        u.equippedGoods = c;                       // 装備した場合を試算
        const after = this._forecast(inc.youkai, inc.human);
        u.equippedGoods = keep;                    // 元に戻す
        if (before && after && before.killsHuman && !after.killsHuman) {
          if (this._deathIsWanted(side, u)) {
            // 3枚目のロストはむしろ通したい。ここで守ると自分でバフを止める
            s = -30;
          } else {
            s = 45;           // 使えば生き残る防御グッズ
            savesLife = true;
          }
        }
      }

      // 鍵の使い方（制作者の運用）：
      // イザベラが場に出るまでは基本的に温存する。
      // 着地後はエリーゼに貼って超耐久にする。
      // 着地前に使うのは「このままだと負ける」事故のときだけ。
      if (id === AI_CARD.KEY && prof.deckPlan) {
        const isaOnField = this._units(side).some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        const isElise = (u.cardId === AI_CARD.ELISE);
        if (isaOnField) {
          if (isElise) {
            s = Math.max(s, 30);           // エリーゼ最優先
            if (savesLife) s = 60;         // 追跡中のエリーゼを守るのは最重要
          } else if (savesLife) {
            s = Math.max(s, 20);
          } else {
            s = -5;                        // 平時の無駄貼りはしない
          }
        } else {
          const emergency = savesLife && (
            p.humans.length === 1 ||
            (p.lost.length + 1) >= p.field.master.lostLimit);
          s = emergency ? 40 : -25;        // 温存を強く優先
        }
      }

      // 攻撃用グッズ：装備すると倒せるようになる相手がいるか
      if (u.master.type === 'youkai' && o.humans.length > 0) {
        o.humans.forEach(function (d) {
          const before = self._forecast(u, d);
          const keep = u.equippedGoods;
          u.equippedGoods = c;
          const after = self._forecast(u, d);
          u.equippedGoods = keep;
          if (after && before && after.killsHuman && !before.killsHuman) {
            s = Math.max(s, 28);
          }
        });
      }
      if (prof.deckPlan) s -= this._delayPenalty(side, c);

    /* ---------- イベントを使う ---------- */
    } else if (a.kind === 'PLAY_EVENT') {
      if (id === AI_CARD.KYOUKAISEN) {
        s = (p.hand.length >= 4) ? 3 : -3;
        const others = p.hand.filter(function (x) { return x !== c; });
        if (others.length) {
          const minKeep = Math.min.apply(null, others.map(function (x) {
            return self._cardKeepValue(side, x);
          }));
          if (minKeep > 15) s -= 10;   // 捨てられるのが命綱の人間だけ
        }
        if (p.deck.length <= 4) s = -20;  // 山札切れの管理

      } else if (id === AI_CARD.SASHINOBERU) {
        const cands = p.trash.filter(function (x) {
          const t = x.master.traits || [];
          return t.indexOf('村') !== -1 &&
                 ['human', 'youkai', 'goods'].indexOf(x.master.type) !== -1;
        });
        if (!cands.length) {
          s = -8;
        } else {
          const best = Math.max.apply(null, cands.map(function (x) {
            return x.master.cost || 0;
          }));
          s = 2 + best * 2;
        }

      } else if (id === AI_CARD.SAKURYAKU) {
        s = -5;
        const isaOnField = this._units(side).some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        if (isaOnField && !prof.deckPlan) {
          s = (o.youkai.length > 0) ? 15 : -5;   // 撃てるなら撃つだけ
        } else if (isaOnField) {
          const inc = this._incoming(side);
          // いちばん大切な考え方：いかにエリーゼを長生きさせるか。
          // エリーゼを追跡している怪異への対処を最優先する。
          let elisePursuer = null;
          if (inc && inc.human.cardId === AI_CARD.ELISE) {
            elisePursuer = inc.youkai;
          }
          o.youkai.forEach(function (u) {
            const stt = Game.getStats(u);
            const canKill = (u.accumulatedDamage + 2) >= stt.maxHp;
            if (canKill) {
              s = Math.max(s, 24);                       // 除去が取れる
              if (inc && inc.youkai === u) s = Math.max(s, 40);
              if (u === elisePursuer) s = Math.max(s, 55);
            } else if (u === elisePursuer) {
              // 倒しきれなくても、エリーゼの反撃で落とせる圏内まで削れるなら強い
              const eliseSpeed = Game.getStats(inc.human).curSpeed;
              if ((u.accumulatedDamage + 2 + eliseSpeed) >= stt.maxHp) {
                s = Math.max(s, 45);   // 策略2点＋反撃で撃破
              } else {
                s = Math.max(s, 20);
              }
            } else if (inc && inc.youkai === u) {
              s = Math.max(s, 8);
            }
          });
          // 効果が働いているヌシ様は最大の脅威
          if (o.youkai.some(function (u) { return u.cardId === AI_CARD.NUSHI; })) {
            s = Math.max(s, 18);
          }
        }
      }
    }

    /* ---------- 人間0体で負けないための保険 ----------
       最後の人間が実際に狙われているときだけ、補充用の気力を残します。
       危険がないときまで温存すると、怪異を出せず点が取れなくなるためです。 */
    if ((a.kind === 'PLAY_YOUKAI' || a.kind === 'EQUIP_GOODS' ||
         a.kind === 'PLAY_EVENT') && p.humans.length <= 1) {
      const handHumans = p.hand.filter(function (x) {
        return x.master.type === 'human' && x !== c;
      });
      if (handHumans.length) {
        const cheapest = Math.min.apply(null, handHumans.map(function (x) {
          return x.master.cost || 0;
        }));
        if (p.energy - cost < cheapest) {
          let threatened = false;
          if (p.humans.length === 1) {
            const lone = p.humans[0];
            const inc = this._incoming(side);
            if (inc && inc.human === lone) {
              threatened = true;
            } else if (o.youkai.some(function (m) {
              const f = self._forecast(m, lone);
              return f && f.killsHuman;
            })) {
              threatened = true;
            }
          } else {
            threatened = true;   // すでに人間0体
          }
          if (threatened) s -= 15;
        }
      }
    }

    return s;
  },

  /* =============================================================
     追跡の候補に点数をつける
     -------------------------------------------------------------
     「攻めない」を0点の基準にして、それを上回る攻撃だけを行います。
     ============================================================= */
  pursuitScore: function (side, opt, prof) {
    prof = prof || AI_PROF_FULL;
    if (!opt || opt.kind === 'NO_PURSUE') return 0;

    const st = Game.state;
    const other = this._other(side);
    const p = st.players[side];
    const o = st.players[other];

    const atk = opt.youkai;
    const dfn = opt.human;
    const f = this._forecast(atk, dfn);
    if (!f) return 0;
    // 「相手が1ターンの猶予で守ってきても倒せるか」を、
    // 決め打ちではなく相手の残り札から見積もって判定する。
    const dStatsNow = Game.getStats(dfn);
    const killsEvenIfDefended =
      (dfn.accumulatedDamage + f.toHuman) >=
      (dStatsNow.maxHp + this._oppDefenseHp(side, dfn));
    const atkCost = atk.master.cost || 0;
    const dfnCost = dfn.master.cost || 0;
    let s = 0;

    if (f.killsHuman) {
      s += 40 + 8 * o.lost.length;
      if ((o.lost.length + 1) >= o.field.master.lostLimit) {
        s += 1000;      // ロスト規定枚数に達して勝ち
      }
      if (o.humans.length === 1) {
        s += 1000;      // 人間0体にして勝ち
      }
      if (!killsEvenIfDefended) {
        s -= 12;        // 守られて生き残る見込みがあるぶんを割り引く
      }
      // 安い怪異で高い人間を倒すと、相手は倒された枠を埋め直すために
      // 高い気力を払わされる（横並べの強要）。実質0コストのクロードなら特に得。
      s += AI_TUNE.killTempo * Math.max(0, dfnCost - atkCost);
    } else {
      // 倒せなくても、攻撃を与え続けることで相手に人間の維持を強要できる。
      // 蓄積ダメージは次の撃破につながる資産なので、常に「攻めない」より高く見る。
      s += 5 + 3 * f.toHuman;
      s += 2 * Math.max(0, dfnCost - atkCost);   // 安い怪異で高い人間を削る
      const dStats = Game.getStats(dfn);
      if ((dfn.accumulatedDamage + f.toHuman) >= (dStats.maxHp - 2)) {
        s += 6;   // 次の襲撃で倒せる圏内まで削れる
      }
    }

    if (f.killsYoukai) {
      // 相打ちの代償。ただし安い怪異なら軽い（相打ちは失敗とは限らない）
      s -= 2 + 1.5 * atkCost;
      if (f.killsHuman) {
        s += 8 + 4 * dfnCost;   // 倒せる相打ちは有利な取引になりうる
      } else if (atkCost <= 1) {
        s += 3;                 // 1コスト怪異の相打ちは十分な交換
      }
    }

    // イザベラはバフの源。倒れると自軍の〔洋館〕怪異とエリーゼの強化が
    // 一斉に消えるので、体力を無駄に減らさない。
    // 反撃を受ける攻撃は「勝ちに直結する」か「反撃で死なない」ときだけ。
    if (atk.cardId === AI_CARD.ISABELLA && prof.deckPlan) {
      const aStats = Game.getStats(atk);
      const lethal = f.killsHuman &&
        ((o.lost.length + 1) >= o.field.master.lostLimit ||
         o.humans.length === 1);
      // 制作者の意図は「イザベラで攻撃しすぎない」＝他の怪異を先に使うこと。
      // したがって遠慮は「代わりに殴れる怪異がいるとき」だけにする。
      // イザベラしか攻撃役がいない場面で遠慮すると、
      // 誰も攻撃しないターンになり、相手に何も要求できなくなる。
      const hasOtherAttacker = p.youkai.some(function (u) {
        return u !== atk && !u.tracking;
      });
      if (!lethal) {
        const counter = f.toYoukai;
        if ((atk.accumulatedDamage + counter) >= aStats.maxHp) {
          s -= 300;     // この攻撃でイザベラが落ちる：ほぼ禁止（常に有効）
        } else if (counter > 0 && hasOtherAttacker) {
          s -= 15 + counter * 8;   // 他の怪異での攻撃を優先させる
        }
        if (hasOtherAttacker &&
            this._lostTraitCount(side, '洋館') >= 3 && counter > 0) {
          s -= 12;      // バフが働いている間はさらに慎重に
        }
      }
    }

    return s;
  },

  /* =============================================================
     カードを手札に残す価値（捨てるカードを選ぶときに使う）
     ============================================================= */
  _cardKeepValue: function (side, c) {
    const p = Game.state.players[side];
    const id = c.cardId;
    if (AI_KEY_CARDS.indexOf(id) !== -1) return 100;
    // 鍵と策略はイザベラ着地後の生命線。基本的にキープする。
    if (id === AI_CARD.KEY || id === AI_CARD.SAKURYAKU) return 40;

    let v = (c.master.cost || 0) * 3 + 4;
    if (c.master.type === 'goods') v -= 3;
    if (c.master.type === 'human') {
      const handHumans = p.hand.filter(function (x) {
        return x.master.type === 'human';
      }).length;
      if (p.humans.length <= 1 && handHumans <= 2) {
        v += 25;   // 場が薄いとき、手札の人間は命綱
      } else if (handHumans <= 1) {
        v += 10;
      }
    }
    const sameName = p.hand.filter(function (x) {
      return x.cardId === id;
    }).length;
    if (sameName >= 2) v -= 4;   // ダブっているものから捨てる
    return v;
  },

  /** サーチ・回収で手札に加える価値 */
  _pickValue: function (c) {
    const id = c.cardId;
    if (AI_KEY_CARDS.indexOf(id) !== -1) return 30;
    if (id === AI_CARD.KAKASHI) return 10;
    if (id === AI_CARD.SAKURYAKU) return 8;
    if (id === AI_CARD.KEY) return 6;
    return 2 + (c.master.cost || 0);
  },

  /* =============================================================
     いちばん良い行動を選ぶ（強モードの入り口）
     ============================================================= */

  /** メインステップ：点数がいちばん高い行動。全部0点以下なら何もしない */
  chooseMainAction: function (side, prof) {
    const acts = AiCore.legalMainActions(side);
    const self = this;
    let best = null;
    let bestScore = -Infinity;
    acts.forEach(function (a) {
      const sc = self.scoreMain(side, a, prof);
      if (sc > bestScore) { bestScore = sc; best = a; }
    });
    if (bestScore > 0) return best;
    return acts[acts.length - 1];   // PASS（列挙の最後に必ず入っている）
  },

  /** 追跡：点数がいちばん高い候補 */
  choosePursuit: function (side, prof) {
    const opts = AiCore.legalPursuits(side);
    const self = this;
    let best = null;
    let bestScore = -Infinity;
    opts.forEach(function (o) {
      const sc = self.pursuitScore(side, o, prof);
      if (sc > bestScore) { bestScore = sc; best = o; }
    });
    return best;
  },

  /** 手札を1枚捨てる：残す価値がいちばん低いもの */
  chooseDiscard: function (side, options) {
    const self = this;
    let best = options[0];
    let low = Infinity;
    options.forEach(function (c) {
      const v = self._cardKeepValue(side, c);
      if (v < low) { low = v; best = c; }
    });
    return best;
  },

  /** 回収・サーチ：加える価値がいちばん高いもの（低すぎるなら見送る） */
  choosePick: function (side, options, canSkip) {
    const self = this;
    let best = null;
    let high = -Infinity;
    options.forEach(function (c) {
      if (!c) return;
      const v = self._pickValue(c);
      if (v > high) { high = v; best = c; }
    });
    if (!best) return null;
    if (canSkip && high < 3) return null;
    return best;
  },

  /** 効果ダメージの対象：倒せる／脅威の怪異を優先 */
  chooseDamageTarget: function (side, options, amount) {
    const self = this;
    const dmg = amount || 1;
    const inc = this._incoming(side);
    let best = options[0];
    let bestRank = Infinity;
    options.forEach(function (u) {
      const stt = Game.getStats(u);
      const remain = stt.maxHp - u.accumulatedDamage;
      const kills = (remain <= dmg) ? 1 : 0;
      const threat = (inc && inc.youkai === u) ? 1 : 0;
      // 小さいほど優先。倒せる＞脅威＞スピードが高い＞残り体力が少ない
      const rank = -(kills * 100) - (threat * 30) - stt.curSpeed + remain * 0.1;
      if (rank < bestRank) { bestRank = rank; best = u; }
    });
    return best;
  },

  /** マリガンするか：軽いカード（コスト2以下の人間・怪異）が2枚未満なら引き直す */
  shouldMulligan: function (side) {
    const p = Game.state.players[side];
    const early = p.hand.filter(function (c) {
      return (c.master.type === 'human' || c.master.type === 'youkai') &&
             (c.master.cost || 0) <= 2;
    }).length;
    return early < 2;
  },

  /* =============================================================
     マリガン：1枚ずつ「戻すかどうか」を決める
     -------------------------------------------------------------
     このゲームのマリガンは、選んだカードだけを山札に戻して、
     シャッフルしてから同じ枚数を引き直す方式です。
     つまり1枚ごとに独立して判断できます。

     考え方はかんたんで、
       「そのカードは序盤に仕事をするか」
     だけを見ます。戻すと代わりに山札から1枚引けるので、
     デッキの平均より働かない札は、戻したほうが得になります。

     戻すのは主に次の3種類です。
       ・重いカード（序盤の数ターン何もできない）
       ・同じカードの3枚目以降（手札で腐る）
       ・出す相手がいない状況カード
     ============================================================= */
  chooseMulligan: function (side) {
    const p = Game.state.players[side];
    const back = [];
    const kept = [];

    p.hand.forEach(function (c) {
      if (AiHeuristic._mulliganKeep(side, c, kept)) kept.push(c);
      else back.push(c);
    });

    // 全部戻すと引き直しても同じ枚数の博打になるだけなので、
    // 1枚も残らない場合はいちばんましな1枚を残す。
    if (!kept.length && back.length) {
      let best = back[0], bv = -Infinity;
      back.forEach(function (c) {
        const v = AiHeuristic._openingValue(c);
        if (v > bv) { bv = v; best = c; }
      });
      back.splice(back.indexOf(best), 1);
    }
    return back.map(function (c) { return c.uid; });
  },

  /** その1枚を手札に残すか */
  _mulliganKeep: function (side, c, kept) {
    const cost = c.master.cost || 0;
    const type = c.master.type;

    // 同じカードを抱えすぎない（3枚目以降は手札で腐る）
    const same = kept.filter(function (x) { return x.cardId === c.cardId; }).length;
    if (same >= AI_TUNE.mullSameMax) return false;

    // 重いカードは序盤に何もしない。引き直したほうが動ける札に化けやすい
    if (cost >= AI_TUNE.mullHeavyCost) return false;

    // 序盤に出せる人間・怪異は残す
    if ((type === 'human' || type === 'youkai') && cost <= 2) return true;

    // 0コストのグッズ・イベントは軽いので1枚までは残す
    if (cost === 0) {
      const cheapUtil = kept.filter(function (x) {
        return (x.master.cost || 0) === 0 &&
               (x.master.type === 'goods' || x.master.type === 'event');
      }).length;
      return cheapUtil < 1;
    }

    return true;   // それ以外（1〜2コストのグッズ・イベント）は残す
  },

  /** 序盤の働きやすさ（残す1枚を選ぶときの目安） */
  _openingValue: function (c) {
    const cost = c.master.cost || 0;
    const type = c.master.type;
    let v = 10 - cost * 2;
    if (type === 'human' || type === 'youkai') v += 6;
    return v;
  },

  /** 任意効果を使うか */
  shouldUseOptional: function (side, cardId) {
    const p = Game.state.players[side];
    if (cardId === AI_CARD.FIELD_VILLAGE) return p.deck.length > 8;  // 墓地肥やし
    if (cardId === AI_CARD.KAEDE) return p.deck.length > 6;          // 2引き2捨て
    return true;
  },
};

/* Node.jsでのヘッドレステスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AiHeuristic;
}
