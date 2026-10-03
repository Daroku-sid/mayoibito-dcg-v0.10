/* =====================================================================
   v010-step.js ― 「1歩」ずつ進めて、人間の判断が要れば巻き戻して聞く（v0.10）
   ---------------------------------------------------------------------
   ★なぜ要るか
     ルール処理（gd1）は「判断をその場で返してもらう」作りの所があります。
       ・山札の下に置く順番（持ち主が並べる札）
       ・商店街の置換（装備していたグッズを手札へ戻すか）
       ・同時に起きた効果の解決順
       ・カードの効果で下がった手札上限
     これらはエンジンの奥で起き、画面の答えを待てません。
     （無作為の対局360局で、順番103回・置換14回・解決順151回）

   ★やり方（gd1 の match.js と同じ考え方）
     1. 歩の始めに局面を丸ごと写しておく
     2. そのまま進める。人間の判断が要る所に来たら、その場で止めて画面に聞く
        （止めた時点の盤面は、そのまま画面に見えている）
     3. 答えが来たら、写しておいた局面に戻して、歩を頭からやり直す。
        それまでに出た答えは記録から返すので、同じ道をたどって先へ進む
     ★エンジンは決定的（乱数も局面の中）なので、やり直しは必ず同じ道をたどります。
       gd1 は「人間が答える」「AI同士」「記録だけで再生」が同じ対局になることを確認済み。

   ★効果の中の選択（カードを選ぶ・対象を選ぶ・はい/いいえ）も、すべてここを通します。
     1つの効果の途中で「選ぶ → 山札の下の順番」のように両方が起きても、同じ仕組みで扱えます。

   ★やり直しで、できごと通知（GameEvents）が同じ順にもう一度出ます。
     画面の演出が2回動かないよう、「この歩でもう渡した数」までは通知しません。
   ===================================================================== */
'use strict';

const V10Step = {
  /** いま進めている歩（無ければ null） */
  active: null,

  /** 人間に聞く窓口。preview.js が置く： asker(req, answerRaw) */
  asker: null,

  /** 歩の外で判断が求められたときの数（0 のはず。検査が見る） */
  strayDecisions: 0,
  /** そのときの呼び出し元（開発用の控え） */
  strayLog: [],

  /* =============================================================
     局面の丸ごと複製（gd1 match.js の cloneState と同じ作り）
     参照のつながりごと写す。カードの master は共有。乱数は位置ごと写す。
     ============================================================= */
  cloneState: function (original) {
    const seen = new Map();
    function copy(v) {
      if (v === null || typeof v !== 'object') return v;
      if (v === original.rng) return (v.clone ? v.clone() : v);
      if (seen.has(v)) return seen.get(v);
      if (Array.isArray(v)) {
        const a = []; seen.set(v, a);
        for (let i = 0; i < v.length; i++) a.push(copy(v[i]));
        return a;
      }
      const out = {}; seen.set(v, out);
      Object.keys(v).forEach(function (k) {
        out[k] = (k === 'master' && v.master) ? v.master : copy(v[k]);
      });
      return out;
    }
    return copy(original);
  },

  /* =============================================================
     1歩を進める
     -------------------------------------------------------------
     fn(carry)  … エンジンを呼ぶ処理。★同期で終わること（画面を待たない）。
                  歩をまたいで持ち越す物（効果の項目・襲撃の情報など）は opts.carry に渡すと、
                  やり直しのときも「戻した局面の中の同じ物」を受け取れます。
     done(result, info) … 歩が終わったら呼ぶ。info.asked＝途中で人間に聞いたか
     opts.name  … 記録用の名前
     ============================================================= */
  run: function (fn, done, opts) {
    const o = Object.assign({}, opts || {});
    const self = this;
    /* ★v0.10（CPU）：歩は「名前と引数」でも渡せる（{ op: 'play', args: {...} }）。
       名前で渡した歩は、CPU の Worker が同じ歩を自分の中で進められる（V10Ops を共有している） */
    if (fn && typeof fn === 'object' && fn.op) {
      const desc = { op: fn.op, args: fn.args || {} };
      o.op = desc;
      if (!o.name) o.name = desc.op;
      fn = function (carry) { return V10Ops.exec(Game, desc, carry, function (side, item) { return self.ops(side, item); }); };
    }
    if (this.active) throw new Error('V10Step：歩の中で別の歩を始めた（' + (o.name || '') + ' / ' + (this.active.name || '') + '）');
    if (o.carry !== undefined) Game.state.__v10carry = o.carry;
    const ctx = {
      name: o.name || '',
      op: o.op || null,
      snap: this.cloneState(Game.state),
      answers: [],          // この歩でもう出た答え（やり直しで前から使う）
      pos: 0,
      evSeen: 0,            // この試行で出たできごとの数
      evDelivered: 0,       // 画面へもう渡したできごとの数（試行をまたいで持つ）
      shows: [],            // 「札を見せる」効果。歩が終わってから見せる
      showsPlayed: 0,
      asked: false,
    };

    const attempt = function () {
      ctx.pos = 0; ctx.evSeen = 0; ctx.shows = [];
      self.active = ctx;
      let result;
      try {
        result = fn(Game.state.__v10carry);
      } catch (e) {
        self.active = null;
        if (e && e.__v10need) {
          ctx.asked = true;
          self._ask(ctx, e.req, function (ans) {
            ctx.answers.push(ans);
            Game.state = self.cloneState(ctx.snap);
            attempt();
          }, function (list) {
            /* ★Worker は「この歩のはじめからの答え」をまとめて返す（記録にある分も含む） */
            ctx.answers = list.slice();
            Game.state = self.cloneState(ctx.snap);
            attempt();
          });
          return;
        }
        if (Game.state) delete Game.state.__v10carry;
        throw e;
      }
      self.active = null;
      if (Game.state) delete Game.state.__v10carry;
      const rest = ctx.shows.slice(ctx.showsPlayed);
      self._playShows(rest, function () { done(result, { asked: ctx.asked }); });
    };
    attempt();
  },

  /** 人間に聞く。先に、ここまでに見せるはずだった札を見せる */
  _ask: function (ctx, req, cb, cbMany) {
    const self = this;
    const pending = ctx.shows.slice(ctx.showsPlayed);
    ctx.showsPlayed = ctx.shows.length;
    this._playShows(pending, function () {
      if (!self.asker) throw new Error('V10Step：人間に聞く窓口がありません');
      const info = {
        snap: ctx.snap, op: ctx.op, answers: ctx.answers.slice(),
        /* CPU の Worker が、この歩の中の判断をまとめて答えたとき（すでに記録の形） */
        multi: function (list) { cbMany(list); },
      };
      self.asker(req, function (raw) { cb(req.ser(raw)); }, info);
    });
  },

  _playShows: function (list, next) {
    const shower = this.shower;
    if (!list.length || !shower) { next(); return; }
    let i = 0;
    const one = function () {
      if (i >= list.length) { next(); return; }
      const cards = list[i++];
      shower(cards, one);
    };
    one();
  },
  /** 札を見せる窓口（preview.js の uiOps.showCards） */
  shower: null,

  /* =============================================================
     判断を1つ得る
     -------------------------------------------------------------
     記録に答えがあればそれを返す。無ければ人間に聞くために止まる。
       ser(raw) … 画面の答え（カードの実物など）を記録の形へ（uid・番号）
       des(v)   … 記録の形から、いまの局面の実物へ
     ============================================================= */
  _decide: function (side, type, spec) {
    const c = this.active;
    if (!c) {
      /* 歩の外で判断が来た。進行の作りの抜け。止めずに既定の答えで進め、数だけ数える */
      this.strayDecisions++;
      /* ★配布物にはコンソール出力を残さない決まり（仕様書 33）。どこで起きたかは控えに残し、
         検査（v010-step-tests・画面の一括確認）が数と場所を見る */
      this.strayLog.push(type + ' ' + String(new Error().stack).split('\n').slice(2, 6).join(' / '));
      return spec.fallback();
    }
    if (c.pos < c.answers.length) {
      const a = c.answers[c.pos++];
      if (a.type !== type || a.side !== side) {
        throw new Error('V10Step：進行の食い違い（記録 ' + a.side + '/' + a.type + ' ⇔ いま ' + side + '/' + type + '）');
      }
      return spec.des(a.v);
    }
    const req = Object.assign({ type: type, side: side }, spec.req());
    req.ser = function (raw) { return { type: type, side: side, v: spec.ser(raw) }; };
    const e = new Error('V10_NEED_HUMAN'); e.__v10need = true; e.req = req;
    throw e;
  },

  /* =============================================================
     エンジンへ渡す受け答え（効果の中・エンジンの奥の両方）
     ============================================================= */
  ops: function (side, item) {
    const self = this;
    const uidsOf = function (list) { return (list || []).map(function (c) { return c && c.uid; }); };
    const byUids = function (pool, uids) {
      return (uids || []).map(function (u) {
        for (let i = 0; i < pool.length; i++) if (pool[i] && pool[i].uid === u) return pool[i];
        return null;
      }).filter(Boolean);
    };
    const source = item && item.source ? item.source : null;
    return {
      showCards: function (cards, next) {
        if (self.active) self.active.shows.push((cards || []).slice());
        next();
      },
      confirmYesNo: function (title, message, cb) {
        cb(self._decide(side, 'confirm', {
          ser: function (v) { return !!v; }, des: function (v) { return !!v; },
          fallback: function () { return true; },
          req: function () { return { title: title, message: message, source: source }; },
        }));
      },
      pickCards: function (options, cb) {
        const all = (options.cards || []).slice();
        cb(self._decide(side, 'pickCards', {
          ser: uidsOf, des: function (u) { return byUids(all, u); },
          fallback: function () { return []; },
          req: function () { return { options: options, source: source }; },
        }));
      },
      pickBoardTarget: function (options, cb) {
        const list = (options.candidates || []).slice();
        if (!list.length) { cb(null); return; }
        cb(self._decide(side, 'pickTarget', {
          ser: function (v) { return v ? v.uid : null; },
          des: function (u) { for (let i = 0; i < list.length; i++) if (list[i].uid === u) return list[i]; return null; },
          fallback: function () { return list[0]; },
          req: function () { return { options: options, source: source }; },
        }));
      },
      pickOption: function (options, cb) {
        const list = options.options || [];
        if (!list.length) { cb(null); return; }
        cb(self._decide(side, 'pickOption', {
          ser: function (v) { return list.indexOf(v); }, des: function (i) { return list[i]; },
          fallback: function () { return list[0]; },
          req: function () { return { options: options, source: source }; },
        }));
      },
      pickOrder: function (options, cb) {
        const items = (options.items || []).slice();
        cb(self._decide(side, 'pickOrder', {
          ser: function (v) { return (v || []).map(function (x) { return items.indexOf(x); }); },
          des: function (idx) { return idx.map(function (i) { return items[i]; }); },
          fallback: function () { return items; },
          req: function () { return { options: options, source: source }; },
        }));
      },
    };
  },

  /** 同時に起きた効果の解決順（Game.takeNextPending に渡す） */
  chooser: function (side, cands) {
    return V10Step._decide(side, 'effectOrder', {
      ser: function (v) { return cands.indexOf(v); }, des: function (i) { return cands[i]; },
      fallback: function () { return cands[0]; },
      req: function () { return { items: cands.slice() }; },
    }) || cands[0];
  },

  /** 対戦の始めに呼ぶ。両方の席の判断をここで受ける */
  install: function () {
    const self = this;
    ['village', 'mansion'].forEach(function (s) {
      Game.setDecisionProvider(s, function (item) { return self.ops(s, item); });
    });
    this.active = null;
  },
};

/* できごと通知は、やり直しのあいだ同じものをもう一度渡さない */
(function () {
  if (typeof GameEvents === 'undefined' || !GameEvents.emit) return;
  const raw = GameEvents.emit;
  GameEvents.emit = function (name, data) {
    const c = V10Step.active;
    if (c) {
      c.evSeen++;
      if (c.evSeen <= c.evDelivered) return undefined;
      c.evDelivered = c.evSeen;
    }
    return raw.apply(GameEvents, arguments);
  };
})();


/* =====================================================================
   V10Ops ― 名前で呼べる歩の中身（画面と CPU の Worker で同じものを使う）
   ---------------------------------------------------------------------
   exec(G, desc, carry, opsFor)
     G      … Game（画面の Game か、Worker の中の Game）
     desc   … { op, args }（送れる形）
     carry  … 歩をまたいで持ち越す物（効果の項目・襲撃の情報・出す札など）。局面の写しに入っている
     opsFor … (side, item) → 受け答え。画面は V10Step.ops、Worker は AI ＋ 記録の答え
   ★ここを変えたら、画面と Worker の両方の動きが変わる（同じファイルを読んでいる）
   ===================================================================== */
const V10Ops = {
  exec: function (G, desc, carry, opsFor) {
    const f = this.table[desc.op];
    if (!f) throw new Error('V10Ops：知らない歩 ' + desc.op);
    return f(G, carry, desc.args || {}, opsFor);
  },
  table: {
    takePending: function (G) { return G.takeNextPending(); },
    runEffect: function (G, it, a, opsFor) {
      let fin = false;
      G.runEffect(it, opsFor(it.side, it), function () { fin = true; });
      if (!fin) throw new Error('効果が途中で止まった：' + it.master.id + '（' + it.kind + '）');
      return it;
    },
    play: function (G, c, a) {
      if (a.kind === 'unit') return G.playUnit(a.side, c.inst, c.face ? { face: c.face } : undefined);
      if (a.kind === 'equip') return G.playGoods(a.side, c.inst, c.target);
      if (a.kind === 'event') return G.playEvent(a.side, c.inst);
      return null;
    },
    /* CPU のメインの手（AiCore の合法手そのもの。出す・装備・使う・起動のどれでも） */
    mainAction: function (G, act, a) { return G.__v10AiCore.applyMainAction(a.side, act); },
    setTracking: function (G, c, a) { return G.setTracking(a.side, c.youkai, c.humans); },
    ability: function (G, c, a) {
      const ab = G.__v10Effects.abilitiesOf(a.side, c.inst, G.state).find(function (x) { return x.key === c.key; });
      if (!ab || ab.candidates(a.side, c.inst, G.state).indexOf(c.target) === -1) return { ok: false };
      return { ok: !!ab.run(a.side, c.inst, c.target, G.state) };
    },
    beginTurn: function (G, c, a) { G.beginTurn(a.side); },
    prepareAttack: function (G, c, a) { return G.prepareAttack(a.side); },
    applyAttackDamage: function (G, info) { G.applyAttackDamage(info); return info; },
    finishAttack: function (G, info) { G.finishAttack(info); return info; },
    queueStartTurnEffects: function (G, c, a) { G.queueStartTurnEffects(a.side); },
    turnStartResources: function (G, c, a) { G.turnStartResources(a.side); },
    endTurn: function (G) { return G.endTurn(); },
  },
};

/* 受け答えの「記録の形」（画面と Worker で同じ） */
const V10Ser = {
  /** ops の名前 → 記録の種類 */
  TYPE: { confirmYesNo: 'confirm', pickCards: 'pickCards', pickBoardTarget: 'pickTarget', pickOption: 'pickOption', pickOrder: 'pickOrder' },
  ser: function (type, options, raw) {
    if (type === 'confirm') return !!raw;
    if (type === 'pickCards') return (raw || []).map(function (c) { return c && c.uid; });
    if (type === 'pickTarget') return raw ? raw.uid : null;
    if (type === 'pickOption') return (options.options || []).indexOf(raw);
    if (type === 'pickOrder') return (raw || []).map(function (x) { return (options.items || []).indexOf(x); });
    throw new Error('V10Ser：知らない種類 ' + type);
  },
  des: function (type, options, v) {
    if (type === 'confirm') return !!v;
    if (type === 'pickCards') {
      const pool = options.cards || [];
      return (v || []).map(function (u) { for (let i = 0; i < pool.length; i++) if (pool[i] && pool[i].uid === u) return pool[i]; return null; }).filter(Boolean);
    }
    if (type === 'pickTarget') { const l = options.candidates || []; for (let i = 0; i < l.length; i++) if (l[i].uid === v) return l[i]; return null; }
    if (type === 'pickOption') return (options.options || [])[v];
    if (type === 'pickOrder') return (v || []).map(function (i) { return (options.items || [])[i]; });
    throw new Error('V10Ser：知らない種類 ' + type);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { V10Step: V10Step, V10Ops: V10Ops, V10Ser: V10Ser };
