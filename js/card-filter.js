/* =====================================================================
   card-filter.js  ―  カードの絞り込み・並び替え（v0.4 仕様書 13.3・15.9・16）
   ---------------------------------------------------------------------
   カード一覧とデッキ編成の両方で使います。

   なぜ画面から切り離すか:
     絞り込みと並び替えは、条件の組み合わせが多く間違いが起きやすい部分です。
     画面を作らずに動かせる形にしておけば、
     「コスト2の村の人間だけ」といった条件を機械的に確かめられます。
     デッキ編成（Stage E）でも同じものを使い回します。
   ===================================================================== */

'use strict';

const CardFilter = {

  /* ★これ以上のコストは、いちばん上のボタンにまとめます（v0.9）。
     絞り込みのボタンは 0〜8 と「9〜」の10個です。
     ★こことボタンの数は必ずそろえてください。検査でも見張っています。 */
  COST_MAX: 9,


  /* -------------------------------------------------------------
     並び順（仕様書 13.3）
     -------------------------------------------------------------
     タイプ → コスト昇順 → 名前の五十音順。

     フィールドは仕様書 13.3 の並びに出てきません（デッキの40枚に
     入らないため）。カード一覧では横向きで別枠に並べるので、
     いちばん後ろに置きます。
     ------------------------------------------------------------- */
  TYPE_ORDER: { human: 0, youkai: 1, goods: 2, event: 3, field: 4 },

  /** 名前の五十音順。日本語のロケールを指定して比べます（仕様書 13.3） */
  compareName: function (a, b) {
    return String(a).localeCompare(String(b), 'ja', {
      sensitivity: 'base',
      numeric: true,
    });
  },

  /** 既定の並び：タイプ → コスト → 名前 */
  compareDefault: function (idA, idB) {
    const a = CARD_MASTER[idA], b = CARD_MASTER[idB];
    const ta = this.TYPE_ORDER[a.type], tb = this.TYPE_ORDER[b.type];
    if (ta !== tb) return ta - tb;

    const ca = (a.cost == null) ? -1 : a.cost;
    const cb = (b.cost == null) ? -1 : b.cost;
    if (ca !== cb) return ca - cb;

    return this.compareName(a.name, b.name);
  },

  /**
   * 並べ替える。
   * @param mode 'default'（タイプ→コスト→名前）／'costAsc'／'costDesc'／'name'
   */
  sort: function (ids, mode) {
    const self = this;
    const list = ids.slice();

    if (mode === 'name') {
      list.sort(function (x, y) {
        return self.compareName(CARD_MASTER[x].name, CARD_MASTER[y].name);
      });
      return list;
    }

    if (mode === 'costAsc' || mode === 'costDesc') {
      const dir = (mode === 'costAsc') ? 1 : -1;
      list.sort(function (x, y) {
        const cx = (CARD_MASTER[x].cost == null) ? -1 : CARD_MASTER[x].cost;
        const cy = (CARD_MASTER[y].cost == null) ? -1 : CARD_MASTER[y].cost;
        if (cx !== cy) return (cx - cy) * dir;
        // コストが同じなら、いつも同じ順になるよう名前で決める
        return self.compareName(CARD_MASTER[x].name, CARD_MASTER[y].name);
      });
      return list;
    }

    list.sort(function (x, y) { return self.compareDefault(x, y); });
    return list;
  },

  /* -------------------------------------------------------------
     絞り込み（仕様書 15.9）
     -------------------------------------------------------------
     conditions = {
       text:   'リン'            カード名の部分一致
       trait:  '制服'            特徴の部分一致（〔〕は付けても付けなくてもよい）
       types:  ['human', ...]    空なら絞らない
       costs:  [0, 1, 2, ...]    空なら絞らない
     }
     同じ種類の条件は「どれか（or）」、種類どうしは「すべて（and）」。

     陣営（村／洋館／共通）での絞り込みは v0.4 で外しました。
     デッキは陣営をまたいで自由に組めるので（仕様書 10.2）、
     陣営よりも特徴で探せたほうが役に立つためです。
     ------------------------------------------------------------- */
  match: function (cardId, conditions) {
    const m = CARD_MASTER[cardId];
    if (!m) return false;
    const c = conditions || {};

    if (c.text) {
      const q = this.normalize(c.text);
      if (q && this.normalize(m.name).indexOf(q) === -1) return false;
    }
    if (c.trait) {
      // 〔村〕と入力されても、村 と入力されても同じように探せるようにする
      const q = this.normalize(String(c.trait).replace(/[〔〕\[\]（）()]/g, ''));
      if (q) {
        const traits = m.traits || [];
        const hit = traits.some(function (t) {
          return CardFilter.normalize(t).indexOf(q) !== -1;
        });
        if (!hit) return false;
      }
    }
    if (c.types && c.types.length &&
        c.types.indexOf(m.type) === -1) return false;
    if (c.costs && c.costs.length) {
      const cost = (m.cost == null) ? -1 : m.cost;
      /* ★「9」は9以上をまとめて指します（v0.9）。
         ★以前は「5」が5以上でした。ボタンが5個しか置けなかったためです。
           絞り込みを板にして場所ができたので、0〜8 をそのまま出し、
           まとめるのはいちばん上だけにしました。
         ★ここは表示ではなく判定なので、ボタンの数を変えたら
           ここも合わせないと「5を選ぶと6も出る」ままになります。 */
      const hit = c.costs.some(function (v) {
        return (v >= CardFilter.COST_MAX) ? (cost >= CardFilter.COST_MAX) : (cost === v);
      });
      if (!hit) return false;
    }
    return true;
  },

  filter: function (ids, conditions) {
    const self = this;
    return ids.filter(function (id) { return self.match(id, conditions); });
  },

  /**
   * 名前を比べやすい形へそろえる。
   * ひらがなとカタカナを完全に相互変換することは v0.4 では必須にしません
   * （仕様書 15.9）が、カタカナはひらがなへ寄せておくと
   * 「るな」で《ルナ》を見つけられます。
   */
  normalize: function (text) {
    return String(text || '')
      .trim()
      .replace(/[\u30a1-\u30f6]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0x60);
      })
      .replace(/\s+/g, '')
      .toLowerCase();
  },

  /** そのカードたちが持つ特徴を、重複なく集める */
  allTraits: function (ids) {
    const set = {};
    (ids || Object.keys(CARD_MASTER)).forEach(function (id) {
      (CARD_MASTER[id].traits || []).forEach(function (t) { set[t] = true; });
    });
    return Object.keys(set);
  },

  /** 絞り込みと並び替えをまとめて行う */
  apply: function (ids, conditions, sortMode) {
    return this.sort(this.filter(ids, conditions), sortMode);
  },
};

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CardFilter;
}
