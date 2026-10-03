/* =====================================================================
   tutorial-deck.js  ―― チュートリアル用に、手札と山札を仕込む
   ---------------------------------------------------------------------
   チュートリアルは「毎回まったく同じ展開」でなければ成り立ちません。
   説明文が「市松人形を出しましょう」と言っているのに、
   手札に市松人形が無ければ、その時点で行き詰まります。

   【なぜルール処理を書き換えないのか】
   game.js は対戦の心臓部です。ここに「チュートリアルのときだけ」の
   分岐を入れると、通常の対戦にも影響が出ないと言い切れなくなります。
   これまで積み上げた回帰の保証（40試合が1手も変わらないこと）も
   崩れてしまいます。

   そこで、対戦が始まったあとの盤面を外から並べ替えます。
   game.js は一行も変わりません。

   【守っているルール】
   ここは ai-deckstack.js（エキスパートのイカサマ）と同じ考え方です。

     1. カードを増やさない・作らない。手札と山札の1対1の交換だけ。
        → 40枚の内訳が最後まで正しいので、山札切れやトラッシュ枚数を
          数える効果（ヌシ様・リン）が壊れません。
     2. 手札の枚数は変えない。
     3. 触るのは、指示された瞬間だけ。効果の解決中には触らない。

   読み込み順： … → game.js → tutorial-deck.js → tutorial-controller.js
   ===================================================================== */

const TutorialDeck = {

  /* =============================================================
     手札を、指定した中身にそろえる。
     -------------------------------------------------------------
       side    … 'village' / 'mansion'
       wanted  … 揃えたいカードIDの一覧（同じIDを2枚書けば2枚)

     手札に足りないカードは山札から持ってきて、
     かわりに要らない手札を山札へ返します。1対1なので枚数は変わりません。

     戻り値：全部そろえられたら true
     ============================================================= */
  /* wanted に挙げたカードを手札に用意します。
     ★exact が true なら「手札をちょうどこれだけにする」、
     false（既定）なら「これらが手札にあることを保証する」です。

     基本編の openingPlan は、CPU側に2枚しか挙げていません。
     残りの3枚はそのままでよいので、既定は「保証する」です。
     実践編の盤面（仕様書 21.2）は5枚ちょうどと決まっているので exact を使います。 */
  setHand: function (side, wanted, exact) {
    const p = Game.state.players[side];
    if (!p) return false;

    // いま手札にあるものは、そのまま残す。足りないぶんだけ探す
    const keep = [];
    const need = wanted.slice();

    p.hand.forEach(function (card) {
      const i = need.indexOf(card.cardId);
      if (i !== -1) { need.splice(i, 1); keep.push(card); }
    });

    // 残った手札（要らないもの）は、山札へ返す候補
    const spare = p.hand.filter(function (card) {
      return keep.indexOf(card) === -1;
    });

    let ok = true;
    const brought = [];

    need.forEach(function (cardId) {
      const i = p.deck.findIndex(function (c) { return c.cardId === cardId; });
      if (i === -1) { ok = false; return; }        // 山札にも無い＝デッキに入っていない
      brought.push(p.deck.splice(i, 1)[0]);
    });

    if (exact) {
      // 挙げたものだけの手札にします。余りは全部山札へ
      p.deck = p.deck.concat(spare);
      p.hand = keep.concat(brought);
    } else {
      // 持ってきたのと同じ枚数だけ、要らない手札を山札へ返す（枚数は変わりません）
      const back = spare.splice(0, brought.length);
      p.deck = p.deck.concat(back);
      p.hand = keep.concat(spare).concat(brought);
    }
    return ok;
  },

  /* =============================================================
     山札の上を、指定した順に並べる。
     -------------------------------------------------------------
       order … 上から順のカードIDの一覧

     指定したカードを山札の中から探して、上へ移すだけです。
     枚数も内訳も変わりません。
     ============================================================= */
  stackTop: function (side, order) {
    const p = Game.state.players[side];
    if (!p) return false;

    const picked = [];
    let ok = true;

    order.forEach(function (cardId) {
      const i = p.deck.findIndex(function (c) { return c.cardId === cardId; });
      if (i === -1) { ok = false; return; }
      picked.push(p.deck.splice(i, 1)[0]);
    });

    p.deck = picked.concat(p.deck);
    return ok;
  },

  /* =============================================================
     手札と山札をまとめて仕込む。
     -------------------------------------------------------------
       plan … { hand: [...], top: [...] }

     手札を先にそろえてから山札を並べます。
     順番が逆だと、手札をそろえる過程で山札の並びが崩れます。
     ============================================================= */
  apply: function (side, plan) {
    if (!plan) return true;
    let ok = true;
    if (plan.hand) ok = this.setHand(side, plan.hand) && ok;
    if (plan.top) ok = this.stackTop(side, plan.top) && ok;
    return ok;
  },

  /* =============================================================
     仕込みが正しくできたかを確かめる（点検用）。
     -------------------------------------------------------------
     40枚の内訳が変わっていないことも見ます。
     ここが崩れると、山札切れやトラッシュを数える効果が狂います。
     ============================================================= */
  verify: function (side, plan) {
    const p = Game.state.players[side];
    const problems = [];

    if (plan && plan.hand) {
      const got = p.hand.map(function (c) { return c.cardId; }).sort();
      const want = plan.hand.slice().sort();
      if (got.join(',') !== want.join(',')) {
        problems.push('手札が違う：' + got.join('、') + ' ≠ ' + want.join('、'));
      }
    }
    if (plan && plan.top) {
      plan.top.forEach(function (cardId, i) {
        const c = p.deck[i];
        if (!c || c.cardId !== cardId) {
          problems.push('山札' + (i + 1) + '枚目が違う：' +
            (c ? c.cardId : 'なし') + ' ≠ ' + cardId);
        }
      });
    }
    return problems;
  },

  /** その席のカードの内訳（枚数の表）を数える。増減の確認に使う */
  census: function (side) {
    const p = Game.state.players[side];
    const count = {};
    const add = function (list) {
      (list || []).forEach(function (c) {
        count[c.cardId] = (count[c.cardId] || 0) + 1;
      });
    };
    add(p.hand); add(p.deck); add(p.trash); add(p.lost);
    add(p.youkai); add(p.humans);

    /* ★装備中のグッズは、どのゾーンにも入っていません。
       カードに直接くっついているためです。
       ここで数えないと、装備するたび1枚減ったように見えます。 */
    p.youkai.concat(p.humans).forEach(function (c) {
      if (c.equippedGoods) {
        const id = c.equippedGoods.cardId;
        count[id] = (count[id] || 0) + 1;
      }
    });
    return count;
  },

  /* =============================================================
     ★対戦の途中の盤面を、外から組み立てる（v0.6・仕様書 21.2）
     -------------------------------------------------------------
     実践編は、対戦のはじめからではなく途中から始まります。

       あなた … 場にハルカ、気力2、決まった手札5枚
       相手   … 場にシルヴィ・エマ・キメラ、キメラがハルカを追跡中

     この盤面を作るために、いったん普通に対戦を始めてから、
     カードを山札や手札から場へ移します。

     【ここでも守っているルール】
       ・カードは増やさない。40枚の内訳を変えない
       ・場へ出したぶん、山札から抜く（どこかから湧かせない）
       ・触るのは指示された瞬間だけ

     snap の形：
       {
         humans: [カードID…],      場に出す人間
         youkai: [カードID…],      場に出す怪異
         hand:   [カードID…],      手札の中身
         energy: 2,                気力
         equip:  [{goods, on}…],   グッズを付ける
       }
     ============================================================= */
  placeUnits: function (side, cardIds, zone) {
    const p = Game.state.players[side];
    if (!p) return false;
    let ok = true;
    const want = (cardIds || []).slice();

    /* ★指定に無いカードは、場から山札へ戻します。
       対戦を始めると 0コストの主人公（スミレ／エリーゼ）が
       自動で場に出ますが、実践編の盤面には登場しません（仕様書 21.2）。
       ここで戻さないと、余分な人間が居座ります。 */
    for (let i = p[zone].length - 1; i >= 0; i--) {
      const c = p[zone][i];
      if (want.indexOf(c.cardId) === -1) {
        p[zone].splice(i, 1);
        c.tracking = false;
        p.deck.push(c);
      }
    }

    want.forEach(function (cardId) {
      // すでに場にいるなら、そのまま
      if (p[zone].some(function (c) { return c.cardId === cardId; })) return;

      // 手札 → 山札 の順に探して、場へ移します
      let inst = null;
      let i = p.hand.findIndex(function (c) { return c.cardId === cardId; });
      if (i !== -1) { inst = p.hand.splice(i, 1)[0]; }
      else {
        i = p.deck.findIndex(function (c) { return c.cardId === cardId; });
        if (i !== -1) inst = p.deck.splice(i, 1)[0];
      }

      if (!inst) { ok = false; return; }
      p[zone].push(inst);
    });
    return ok;
  },

  /** 場のカードにグッズを付ける（手札か山札から持ってきます） */
  equipGoods: function (side, goodsId, targetCardId) {
    const p = Game.state.players[side];
    const target = p.humans.concat(p.youkai).find(function (c) {
      return c.cardId === targetCardId;
    });
    if (!target) return false;

    let inst = null;
    let i = p.hand.findIndex(function (c) { return c.cardId === goodsId; });
    if (i !== -1) { inst = p.hand.splice(i, 1)[0]; }
    else {
      i = p.deck.findIndex(function (c) { return c.cardId === goodsId; });
      if (i !== -1) inst = p.deck.splice(i, 1)[0];
    }
    if (!inst) return false;

    target.equippedGoods = inst;
    inst.equippedTo = target;
    return true;
  },

  /** 追跡の関係を作る（game.js の setTracking と同じ形にします） */
  setTracking: function (side, youkaiCardId, targetSide, humanCardId) {
    const me = Game.state.players[side];
    const opp = Game.state.players[targetSide];
    const youkai = me.youkai.find(function (c) { return c.cardId === youkaiCardId; });
    const human = opp.humans.find(function (c) { return c.cardId === humanCardId; });
    if (!youkai || !human) return false;

    Game.state.tracking[side] = { youkai: youkai, human: human };
    youkai.tracking = true;
    human.tracking = true;
    return true;
  },

  /** 盤面をまとめて組み立てる */
  applySnapshot: function (side, snap) {
    if (!snap) return true;
    let ok = true;

    /* 順番が大切です。
       先に場へ出してから手札をそろえないと、
       場へ出したいカードを手札の入れ替えで山札へ返してしまいます。 */
    if (snap.humans) ok = this.placeUnits(side, snap.humans, 'humans') && ok;
    if (snap.youkai) ok = this.placeUnits(side, snap.youkai, 'youkai') && ok;
    // 盤面の手札は「ちょうどこれだけ」です（仕様書 21.2）
    if (snap.hand) ok = this.setHand(side, snap.hand, true) && ok;
    if (snap.top) ok = this.stackTop(side, snap.top) && ok;

    (snap.equip || []).forEach(function (e) {
      ok = TutorialDeck.equipGoods(side, e.goods, e.on) && ok;
    });

    if (typeof snap.energy === 'number') {
      Game.state.players[side].energy = snap.energy;
    }
    return ok;
  },

  /** 組み立てた盤面が指示どおりか確かめる（点検用） */
  verifySnapshot: function (side, snap) {
    const p = Game.state.players[side];
    const problems = [];
    const namesOf = function (list) {
      return list.map(function (c) { return c.cardId; }).sort().join('、') || '（なし）';
    };
    // 「何も置かない」指定も、同じ書き方でくらべられるようにします
    const wantOf = function (ids) {
      return ids.slice().sort().join('、') || '（なし）';
    };

    if (snap.humans) {
      const want = wantOf(snap.humans);
      if (namesOf(p.humans) !== want) {
        problems.push('人間が違う：' + namesOf(p.humans) + ' ≠ ' + want);
      }
    }
    if (snap.youkai) {
      const want = wantOf(snap.youkai);
      if (namesOf(p.youkai) !== want) {
        problems.push('怪異が違う：' + namesOf(p.youkai) + ' ≠ ' + want);
      }
    }
    if (snap.hand) {
      const want = wantOf(snap.hand);
      if (namesOf(p.hand) !== want) {
        problems.push('手札が違う：' + namesOf(p.hand) + ' ≠ ' + want);
      }
    }
    if (typeof snap.energy === 'number' && p.energy !== snap.energy) {
      problems.push('気力が違う：' + p.energy + ' ≠ ' + snap.energy);
    }
    (snap.equip || []).forEach(function (e) {
      const t = p.humans.concat(p.youkai).find(function (c) { return c.cardId === e.on; });
      if (!t || !t.equippedGoods || t.equippedGoods.cardId !== e.goods) {
        problems.push('グッズが付いていない：' + e.goods + ' → ' + e.on);
      }
    });
    return problems;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialDeck: TutorialDeck };
}
