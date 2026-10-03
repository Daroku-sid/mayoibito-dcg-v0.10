/* =====================================================================
   v010-snap.js ― 局面を「送れる形」に写す・戻す（v0.10）
   ---------------------------------------------------------------------
   ★CPU の席は、AI（gd1 v1.2 の通常・最強）が Web Worker の中で考えます。
     画面の固まりを防ぐためです（最強は重い局面で1手数秒）。
     Worker へは局面を丸ごと送ります。そのための写し方です。

   ★局面（Game.state）の中身
     ・同じ札が何か所からも指されている（場・追跡の組・待機中の効果の source など）
       → 指し先を番号で残し、戻すときに同じ1つの物へつなぎ直す
     ・カードの master（カード表の行）→ カードIDだけ送り、受け側のカード表から引き直す
     ・乱数（state.rng）→ 今の位置（数）だけ送り、受け側で同じ位置の乱数を作る
     ・関数は入っていない（6局を回して確かめた。入っていたら写すときに止める）

   使い方
     const packed = V10Snap.pack(Game.state);            // JSON にできる形
     const st = V10Snap.unpack(packed, CARD_MASTER, createRng);
   ===================================================================== */
'use strict';

const V10Snap = {
  pack: function (state) {
    const ids = new Map();
    const nodes = [];
    const rng = state.rng;
    function enc(v, path) {
      if (v === null || v === undefined) return v === undefined ? { $u: 1 } : null;
      const t = typeof v;
      if (t === 'number' || t === 'string' || t === 'boolean') return v;
      if (t === 'function') throw new Error('V10Snap：局面に関数が入っている（' + path + '）');
      if (v === rng) return { $rng: (rng.getState ? rng.getState() : 0) };
      if (ids.has(v)) return { $r: ids.get(v) };
      const id = nodes.length;
      ids.set(v, id);
      nodes.push(null);
      let body;
      if (Array.isArray(v)) {
        body = { $a: v.map(function (x, i) { return enc(x, path + '[' + i + ']'); }) };
      } else {
        const o = {};
        Object.keys(v).forEach(function (k) {
          if (k === 'master' && v.master && v.master.id) { o.master = { $m: v.master.id }; return; }
          o[k] = enc(v[k], path + '.' + k);
        });
        body = { $o: o };
      }
      nodes[id] = body;
      return { $r: id };
    }
    const root = enc(state, 'state');
    return { v: 1, root: root, nodes: nodes };
  },

  unpack: function (packed, CARD_MASTER, createRng) {
    if (!packed || packed.v !== 1) throw new Error('V10Snap：知らない形');
    const made = new Array(packed.nodes.length);
    const self = this;
    function dec(x) {
      if (x === null) return null;
      if (typeof x !== 'object') return x;
      if (x.$u) return undefined;
      if (x.$rng !== undefined) { const r = createRng('v010-snap'); if (r.setState) r.setState(x.$rng); return r; }
      if (x.$m !== undefined) {
        const m = CARD_MASTER[x.$m];
        if (!m) throw new Error('V10Snap：カード表に無い ' + x.$m);
        return m;
      }
      if (x.$r !== undefined) return build(x.$r);
      throw new Error('V10Snap：読めない値');
    }
    function build(id) {
      if (made[id] !== undefined) return made[id];
      const n = packed.nodes[id];
      if (n.$a) {
        const a = []; made[id] = a;
        n.$a.forEach(function (x) { a.push(dec(x)); });
        return a;
      }
      const o = {}; made[id] = o;
      Object.keys(n.$o).forEach(function (k) {
        const val = dec(n.$o[k]);
        if (val !== undefined || (n.$o[k] && n.$o[k].$u)) o[k] = val;
      });
      return o;
    }
    return dec(packed.root);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { V10Snap: V10Snap };
