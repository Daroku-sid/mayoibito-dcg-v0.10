/* =====================================================================
   assets.js  ―  対戦前の読み込み（仕様書 30）
   ---------------------------------------------------------------------
   カード画像を先に読み込んでおきます。

   なぜ先に読むのか:
     対戦中に初めて読み込むと、カードが出た瞬間だけ枠が空白になります。
     とくに回線の細いスマホで目立つので、始まる前にまとめて読みます。

   読めなかった画像があっても対戦は始めます。
   画像が無いときの代わりの見た目は v0.2 から用意されています。
   ===================================================================== */

'use strict';

const Assets = {

  loaded: {},        // すでに読んだ画像のパス
  failed: [],        // 読めなかったもの（不具合の手がかり）

  /**
   * 2つのデッキで使う画像をすべて読む。
   * @param {string[]} deckIds - 使うデッキ（公式は 'gd1-mura' など。旧名 'village' / 'mansion' も読み替える）
   * @param {function} onProgress - (読んだ数, 全体) を受け取る
   * @param {function} onDone - 読み終わったら呼ぶ
   */
  preloadDecks: function (deckIds, onProgress, onDone) {
    const paths = this.pathsFor(deckIds);
    this.preload(paths, onProgress, onDone);
  },

  /** そのデッキで出てくるカード画像のパスを集める */
  pathsFor: function (deckIds) {
    const seen = {};
    const paths = [];
    const self = this;

    (deckIds || []).forEach(function (id) {
      /* ★v0.10：旧デッキ名（'village' / 'mansion'）は新しい名前へ読み替える */
      if (typeof modernDeckKey === 'function') id = modernDeckKey(id);
      // 自作デッキも先読みの対象にします（v0.4 Stage F）
      const def = (typeof deckDefOf === 'function') ? deckDefOf(id) : DECKS[id];
      if (!def) return;

      const cardIds = [def.fieldId];
      def.mainDeck.forEach(function (e) { cardIds.push(e.id); });

      cardIds.forEach(function (cardId) {
        // 陣営ごとに絵柄が違うカードは、そのデッキの陣営で選びます
        const path = self.pathOf(cardId, def.side || id);
        if (path && !seen[path]) { seen[path] = true; paths.push(path); }
      });
    });
    return paths;
  },

  pathOf: function (cardId, owner) {
    try {
      return (typeof getCardImagePath === 'function') ? getCardImagePath(cardId, owner) : null;
    } catch (e) {
      return null;
    }
  },

  /* =============================================================
     まとめて読む
     -------------------------------------------------------------
     1枚ごとに成否を数え、全部の返事が来たら終わりにします。
     読めなくても数には入れる（＝止まらない）のが大事です。
     ============================================================= */
  preload: function (paths, onProgress, onDone) {
    const list = (paths || []).filter(function (p) { return !!p; });
    const total = list.length;
    const self = this;
    let done = 0;

    if (total === 0) { onDone(0, 0); return; }

    // 万一 onload も onerror も来ない画像があっても、必ず先へ進む
    let finished = false;
    const finish = function () {
      if (finished) return;
      finished = true;
      onDone(done, total);
    };
    const guard = setTimeout(finish, 12000);

    const step = function () {
      done += 1;
      if (onProgress) onProgress(done, total);
      if (done >= total) { clearTimeout(guard); finish(); }
    };

    list.forEach(function (path) {
      if (self.loaded[path]) { step(); return; }

      const img = new Image();
      img.onload = function () { self.loaded[path] = true; step(); };
      img.onerror = function () { self.failed.push(path); step(); };
      img.src = path;
    });
  },
};
