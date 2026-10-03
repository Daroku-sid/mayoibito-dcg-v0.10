/* =====================================================================
   v08-conditions.js ― 効果の条件と、その達成度（2026-08-01）
   ---------------------------------------------------------------------
   《頼れる委員長 リン》のように、
     「自分のトラッシュに〔村〕が5枚以上あるなら」
   という条件を持つカードがあります。

   ★これまでは効果の文章を読むだけで、いま何枚あるのかは
     自分でトラッシュを開いて数えるしかありませんでした。
     出すかどうかを決めるのに要る情報なのに、手間がかかりすぎます。

   ここでは「いくつ／いくつ必要か」を出します。

     トラッシュの〔村〕　3 / 5枚

   ★これは表示だけです。判定そのものはルール処理（rules-gd1.js）のままで、
     ここでは何も決めません。同じ数え方をなぞっているだけです。

   ---------------------------------------------------------------------
   ★新しいカードを足すとき
   ---------------------------------------------------------------------
   LIST に1行足すだけです。効果の中身には触りません。

     'MURA-005': [{ kind: 'traitCount', zone: 'trash', trait: '村', need: 10 }],

   条件の種類:
     traitCount … その領域にある、特徴◯◯のカードの枚数
     zoneCount  … その領域にあるカードの枚数（特徴を問わない）
     fieldTrait … 自分のフィールドが特徴◯◯を持つか
     named      … 自分の場に、その名前のカードがあるか
   ===================================================================== */

'use strict';

const V8Cond = {

  /* =============================================================
     カードごとの条件
     ★効果の文章と食い違わないよう、文章もそのまま添えています。
     ============================================================= */
  LIST: {
    /* ★v0.10：カードIDを gd1 の形へ。条件は新しい効果文（R28最終）に合わせて見直した。
       ・リン：5枚 → 10枚
       ・コハク：「フィールドが〔村〕」→「トラッシュに〔村〕5枚以上でスピード+1」
       ★ほかのデッキの条件つきの札は、まだ載せていない（表示だけの機能なので、無くても遊べる） */

    /* 自分のトラッシュに〔村〕が10枚以上あるなら（登場時・ターンに1回） */
    'MURA-005': [{ kind: 'traitCount', zone: 'trash', trait: '村', need: 10 }],
    /* 自分のトラッシュに〔村〕が10枚以上あるなら */
    'MURA-009': [{ kind: 'traitCount', zone: 'trash', trait: '村', need: 10 }],
    /* 自分のトラッシュにカードが10枚以上あるなら */
    'MURA-011': [{ kind: 'zoneCount', zone: 'trash', need: 10 }],
    /* 自分のトラッシュに〔村〕が5枚以上あるなら、スピード+1 */
    'MURA-007': [{ kind: 'traitCount', zone: 'trash', trait: '村', need: 5 }],

    /* 自分のロストに〔洋館〕が3枚以上あるなら */
    'YAKATA-009': [{ kind: 'traitCount', zone: 'lost', trait: '洋館', need: 3 }],
    /* 自分のロストにカードが3枚以上あるなら */
    'YAKATA-011': [{ kind: 'zoneCount', zone: 'lost', need: 3 }],
    /* 自分のフィールドが〔洋館〕を持つなら */
    'YAKATA-006': [{ kind: 'fieldTrait', trait: '洋館' }],
    /* 自分の場に「企む貴婦人 イザベラ」があるなら */
    'YAKATA-010': [{ kind: 'named', name: '企む貴婦人 イザベラ' }],
    'YAKATA-012': [{ kind: 'named', name: '企む貴婦人 イザベラ' }],
    /* ★v0.10：村・洋館の新しい札 */
    /* 自分のトラッシュにカードが10枚以上あるなら、スピード+1（村甲） */
    'MURA-026': [{ kind: 'zoneCount', zone: 'trash', need: 10 }],
    /* 自分のフィールドが〔洋館〕を持つなら（館1・館I） */
    'YAKATA-013': [{ kind: 'fieldTrait', trait: '洋館' }],
    'YAKATA-024': [{ kind: 'fieldTrait', trait: '洋館' }],
    /* 自分のロストに〔洋館〕が3枚以上あるなら（館A・館F） */
    'YAKATA-018': [{ kind: 'traitCount', zone: 'lost', trait: '洋館', need: 3 }],
    'YAKATA-021': [{ kind: 'traitCount', zone: 'lost', trait: '洋館', need: 3 }],
    /* 自分のロストに〔洋館〕が2枚以上あるなら、コスト-3（館D） */
    'YAKATA-020': [{ kind: 'traitCount', zone: 'lost', trait: '洋館', need: 2 }],

    /* ★ロストに〔洋館〕が3枚以上あるなら（2026-08-01・作者の指示）。
       〔洋館〕以外のカードがロストにあっても構いません。 */
    'FIELD-YAKATA': [{ kind: 'traitCount', zone: 'lost', trait: '洋館', need: 3 }],
  },

  ZONE_LABEL: {
    trash: 'トラッシュ', lost: 'ロスト', hand: '手札', deck: '山札',
  },

  /* =============================================================
     数え方（effects.js と同じ）
     ============================================================= */
  _traits: function (inst) {
    if (!inst) return [];
    const m = inst.master ||
      (typeof CARD_MASTER !== 'undefined' ? CARD_MASTER[inst.cardId] : null);
    return (m && m.traits) ? m.traits : [];
  },

  _has: function (inst, trait) {
    return this._traits(inst).indexOf(trait) !== -1;
  },

  _count: function (list, trait) {
    const self = this;
    return (list || []).filter(function (c) { return self._has(c, trait); }).length;
  },

  /* =============================================================
     1枚ぶんの達成度
     -------------------------------------------------------------
     @param {string} cardId
     @param {string} side そのカードの持ち主
     @return {Array<{label:string, value:string, ok:boolean}>}
       条件を持たないカード、対戦中でないときは空の配列
     ============================================================= */
  linesFor: function (cardId, side) {
    const defs = this.LIST[cardId];
    if (!defs || !defs.length) return [];
    if (typeof Game === 'undefined' || !Game.state) return [];
    const p = Game.state.players[side];
    if (!p) return [];

    const self = this;
    const out = [];

    defs.forEach(function (d) {
      const line = self._lineOf(d, p);
      if (line) out.push(line);
    });
    return out;
  },

  _lineOf: function (d, p) {
    if (d.kind === 'traitCount') {
      const n = this._count(p[d.zone], d.trait);
      /* ★言い回しは作者の指定の形（2026-08-01）：
           ロストの〔洋館〕　2 / 3枚 */
      return {
        label: (this.ZONE_LABEL[d.zone] || d.zone) + 'の〔' + d.trait + '〕',
        value: n + ' / ' + d.need + '枚',
        ok: n >= d.need,
      };
    }

    if (d.kind === 'zoneCount') {
      const n = (p[d.zone] || []).length;
      return {
        label: this.ZONE_LABEL[d.zone] || d.zone,
        value: n + ' / ' + d.need + '枚',
        ok: n >= d.need,
      };
    }

    if (d.kind === 'fieldTrait') {
      const ok = this._has(p.field, d.trait);
      return {
        label: 'フィールドの〔' + d.trait + '〕',
        value: ok ? 'あり' : 'なし',
        ok: ok,
      };
    }

    if (d.kind === 'named') {
      const self = this;
      const found = (p.humans || []).concat(p.youkai || []).some(function (c) {
        const m = c.master ||
          (typeof CARD_MASTER !== 'undefined' ? CARD_MASTER[c.cardId] : null);
        void self;
        return !!m && m.name === d.name;
      });
      return {
        label: '自分の場の「' + d.name + '」',
        value: found ? 'あり' : 'なし',
        ok: found,
      };
    }

    return null;
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { V8Cond: V8Cond };
