/* =====================================================================
   v08-board.js ― v0.8 盤面の配置（ラフ実測版）
   ---------------------------------------------------------------------
   基準：『マヨイビトDCG 対戦画面UI配置仕様書 v0.1』＋『盤面ラフ.png』
   基準解像度 1080 × 1920（9:16）。座標原点は画面左上。

   ★このファイルが持つのは「どこに、どの大きさで置くか」だけです。
     ゲーム状態は読みも書きもしません。

   ★大きさの決め方（配置仕様書 7 と、ダロクの指示「列ごとに統一」）
     ラフの実測値は 1〜3px の誤差を含み、段によって縦横比が
     わずかに違っています。配置仕様書 7 の「カード画像を個別に
     異なる縦横比へ変形させない」に従い、次のようにしました。

       ・段ごとの推奨共通幅（166 / 253 / 293 / 224）を採る
       ・高さは元カードの比率 63:88 から出す
       ・実測した枠の中心へ合わせる（左上ではなく中心を合わせる）

     こうすると、同じ段のカードは必ず同じ大きさになり、
     ラフの見た目の重心もずれません。
   ===================================================================== */

'use strict';

const V8Board = {

  /** カードの縦横比（63:88）。高さ ÷ 幅 */
  CARD_RATIO: 88 / 63,

  /** 基準解像度 */
  DESIGN_W: 1080,
  DESIGN_H: 1920,

  /* =============================================================
     段ごとの共通の幅（配置仕様書 7「推奨共通サイズ」）
     ============================================================= */
  TIER_W: {
    oppBack: 166,    // 相手上段（いちばん奥）
    oppFront: 253,   // 相手下段
    selfBack: 293,   // 自分上段中央（盤面でいちばん大きい）
    selfFront: 224,  // 自分下段（いちばん手前）
  },

  /* =============================================================
     置き場所（ラフ実測値）
     -------------------------------------------------------------
     x / y / w / h は配置仕様書 5・6 の実測値そのまま。
     実際に使うのは「中心座標」と「段」です。

     相手：上段2枚＋下段中央1枚の逆三角形
     自分：上段中央1枚＋下段2枚の三角形
     ============================================================= */
  SLOTS: {
    'opp-youkai': [
      { id: 'O-M-01', x: 150, y: 214, w: 167, h: 229, tier: 'oppBack' },
      { id: 'O-M-02', x: 354, y: 214, w: 164, h: 229, tier: 'oppBack' },
      /* ★20px下げたあと、20px戻した。結果として実測値どおりの 464 */
      { id: 'O-M-03', x: 265, y: 464, w: 253, h: 361, tier: 'oppFront' },
    ],
    'opp-human': [
      { id: 'O-H-01', x: 559, y: 214, w: 164, h: 229, tier: 'oppBack' },
      { id: 'O-H-02', x: 759, y: 214, w: 168, h: 229, tier: 'oppBack' },
      /* ★20px下げたあと、20px戻した。結果として実測値どおりの 464 */
      { id: 'O-H-03', x: 564, y: 464, w: 253, h: 361, tier: 'oppFront' },
    ],
    'self-human': [
      { id: 'P-H-01', x: 225, y: 893, w: 293, h: 431, tier: 'selfBack' },
      { id: 'P-H-02', x: 25, y: 1358, w: 228, h: 339, tier: 'selfFront' },
      { id: 'P-H-03', x: 295, y: 1358, w: 221, h: 339, tier: 'selfFront' },
    ],
    'self-youkai': [
      { id: 'P-M-01', x: 564, y: 893, w: 292, h: 431, tier: 'selfBack' },
      { id: 'P-M-02', x: 565, y: 1358, w: 220, h: 337, tier: 'selfFront' },
      { id: 'P-M-03', x: 828, y: 1358, w: 227, h: 337, tier: 'selfFront' },
    ],
  },

  /* =============================================================
     ★どの枠に何を置くか
     -------------------------------------------------------------
     ラフの盤面は、v0.2 の盤面と同じ4段の構成をそのまま残しています。

       相手の通常  … 相手側の上段（小さい枠2つ）
       相手の追跡  … 相手側の下段中央（大きい枠1つ）
       自分の追跡  … 自分側の上段中央（大きい枠1つ）
       自分の通常  … 自分側の下段（小さい枠2つ）

     ★中央の大きい枠は「追跡の定位置」です。
       中央どうしが向かい合っているのは、そこを追跡の矢印が
       通るからです。ここを通常のカードで埋めてしまうと、
       出したばかりの怪異が追跡中に見えてしまいます。

     場の上限は3体で、追跡中のカードもその3体に含まれます。
     したがって
       追跡あり … 追跡1体 ＋ 通常2体 → 中央1枠 ＋ 外側2枠
       追跡なし … 通常3体まで        → 外側2枠 ＋ 中央1枠
     となり、枠が足りなくなることはありません。
     通常のカードは必ず外側から埋め、中央は追跡が無いときの
     3体目としてだけ使います。
     ============================================================= */

  /** 追跡中のカードを置く枠（SLOTS の何番目か） */
  TRACK_SLOT: {
    'opp-youkai': 2,   // O-M-03（相手側の下段中央）
    'opp-human': 2,    // O-H-03
    'self-human': 0,   // P-H-01（自分側の上段中央）
    'self-youkai': 0,  // P-M-01
  },

  /* =============================================================
     ★通常のカードが並ぶ「列」
     -------------------------------------------------------------
     中央の大きい枠は追跡の定位置なので、通常のカードは使いません。
     3体目も中央へは行かず、通常の列に3枚が収まるよう
     大きさと間隔を詰めます（ダロクの指示）。

     列の範囲は、実測した2つの枠の左端〜右端です。
     ============================================================= */
  NORMAL_ROW: {
    /* 相手は上段。左端 O-M-01.x 〜 右端 O-M-02.x+w */
    'opp-youkai': { x0: 150, x1: 518, cy: 214 + 229 / 2, tier: 'oppBack' },
    'opp-human': { x0: 559, x1: 927, cy: 214 + 229 / 2, tier: 'oppBack' },
    /* 自分は下段 */
    'self-human': { x0: 25, x1: 516, cy: 1358 + 339 / 2, tier: 'selfFront' },
    'self-youkai': { x0: 565, x1: 1055, cy: 1358 + 337 / 2, tier: 'selfFront' },
  },

  /** 3枚並べるときの間隔（1080基準） */
  ROW_GAP_3: 12,

  /* =============================================================
     ★1体だけのときに置く位置
     -------------------------------------------------------------
     新しく出したカードが列の端に飛ぶと落ち着きません。
     追跡の枠（中央）に近いほうから埋めます。
     ============================================================= */
  NEAR_SLOT: {
    'opp-youkai': 1,    // O-M-02（中央 O-M-03 に近いほう）
    'opp-human': 0,     // O-H-01
    'self-human': 2,    // P-H-03（中央 P-H-01 に近いほう）
    'self-youkai': 1,   // P-M-02
  },

  /**
   * 通常のカード n 枚を、通常の列へ並べたときの位置と大きさ。
   * @return {Array<{left,top,w,h}>} 1080基準。左から順
   */
  normalBoxes: function (areaKey, n) {
    const list = this.SLOTS[areaKey] || [];
    const row = this.NORMAL_ROW[areaKey];
    if (!row || !n || n <= 0) return [];

    /* 1枚・2枚は実測した枠をそのまま使う */
    if (n === 1) return [this.boxOf(list[this.NEAR_SLOT[areaKey]])];
    if (n === 2) {
      const idx = [0, 1, 2].filter(function (i) { return i !== 2; });
      /* 自分側は下段の2つ（1,2）、相手側は上段の2つ（0,1） */
      const two = (areaKey.indexOf('self') === 0) ? [1, 2] : [0, 1];
      return two.map(function (i) { return this.boxOf(list[i]); }, this);
    }

    /* 3枚は列いっぱいに詰める。大きさは3枚とも同じ */
    const gap = this.ROW_GAP_3;
    const span = row.x1 - row.x0;
    const w = (span - gap * (n - 1)) / n;
    const h = w * this.CARD_RATIO;
    const out = [];
    for (let i = 0; i < n; i++) {
      const left = row.x0 + i * (w + gap);
      out.push({ left: left, top: row.cy - h / 2, w: w, h: h,
        cx: left + w / 2, cy: row.cy });
    }
    return out;
  },

  /**
   * 通常のカードと追跡中のカードを、それぞれの枠へ割り当てる。
   * @return {Array<{slot:object, card:object}>}
   */
  /** レーンの左右の中心（1080基準） */
  laneCenter: function (areaKey) {
    const row = this.NORMAL_ROW[areaKey];
    return row ? (row.x0 + row.x1) / 2 : 540;
  },

  /* =============================================================
     ★真上視点（追跡フェイズ）の並べ方（2026-08-01）
     -------------------------------------------------------------
     ここは「追跡する組を指でつなぐ」ための場面です。
     つなぎやすさがすべてなので、ふだんの盤面とは別に決めます。

     ★左右の中心を、自分と相手でそろえます。
       ふだんの盤面の中心をそのまま使うと、
         自分の怪異 810 ／ 相手の人間 743
       のように 60〜70 ずれていて、つなぐ線が斜めになります。
       ★向かい合う2枚は、必ず真上と真下に来るようにします。

     ★カードも大きくします。
       ふだんの盤面でいちばん小さい枠に合わせていたので、
       3体並ぶと 1枚 115 まで縮み、指では狙えませんでした。
     ============================================================= */

  /* 画面の左半分／右半分の中心。左右反転しても、置き場所の名前
     （areaKey）がどちら側かを表すので、そのまま使えます。 */
  TOP_LANE_CX: {
    'opp-youkai': 270, 'self-human': 270,    // 画面の左
    'opp-human': 810, 'self-youkai': 810,    // 画面の右
  },
  /* 1レーンに使ってよい幅と、1枚の上限・すき間 */
  TOP_LANE_W: 520,
  /* ★上限は、上下の段がぶつからない大きさです。
     220 → 高さ 307。相手側の2段の間隔は 316 なので収まります。 */
  TOP_MAX_W: 220,
  TOP_GAP: 10,

  topLaneCenter: function (areaKey) {
    const cx = this.TOP_LANE_CX[areaKey];
    return (cx === undefined) ? this.laneCenter(areaKey) : cx;
  },

  /** 真上視点で、n枚並べるときの1枚の幅 */
  topCardW: function (n) {
    if (!n || n < 1) return this.TOP_MAX_W;
    return Math.min(this.TOP_MAX_W, (this.TOP_LANE_W - this.TOP_GAP * (n - 1)) / n);
  },

  /**
   * @param {boolean} topView 真上視点か。
   *   ★真上から見ている場面では、三角形の配置が斜めから見た形に見えます。
   *     真上視点のときは、各レーンの中心をそろえた素直な並びにします
   *     （追跡は中心、通常は中心から左右に等間隔）。
   */
  assign: function (areaKey, normals, tracks, topView) {
    const list = this.SLOTS[areaKey] || [];
    const out = [];
    const t = (tracks || [])[0];
    const ti = this.TRACK_SLOT[areaKey];
    const ns = (normals || []).slice(0, 3);
    const boxes = this.normalBoxes(areaKey, ns.length);

    if (!topView) {
      if (t && list[ti]) out.push({ box: this.boxOf(list[ti]), card: t, role: 'track' });
      ns.forEach(function (c, i) {
        if (boxes[i]) out.push({ box: boxes[i], card: c, role: 'normal' });
      });
      return out;
    }

    /* --- 真上視点：左右の中心を自分と相手でそろえ、カードも大きくする --- */
    const cx = this.topLaneCenter(areaKey);
    const ratio = this.CARD_RATIO;

    if (t && list[ti]) {
      /* 追跡中の1枚は、その段に1枚だけなので目いっぱい大きく */
      const cy = this.boxOf(list[ti]).cy;
      const w = this.topCardW(1);
      const h = w * ratio;
      out.push({
        box: { left: cx - w / 2, top: cy - h / 2, w: w, h: h, cx: cx, cy: cy },
        card: t, role: 'track',
      });
    }

    if (ns.length && boxes.length) {
      const cy = boxes[0].cy;
      const w = this.topCardW(ns.length);
      const h = w * ratio;
      const gap = this.TOP_GAP;
      const total = w * ns.length + gap * (ns.length - 1);
      const left0 = cx - total / 2;
      ns.forEach(function (c, i) {
        const left = left0 + i * (w + gap);
        out.push({
          box: { left: left, top: cy - h / 2, w: w, h: h, cx: left + w / 2, cy: cy },
          card: c, role: 'normal',
        });
      });
    }
    return out;
  },

  /* =============================================================
     置き場所の実際の見た目（中心を合わせ、比率は元カードのまま）
     @return {{left:number, top:number, w:number, h:number}} 1080基準
     ============================================================= */
  boxOf: function (slot) {
    const w = this.TIER_W[slot.tier];
    const h = w * this.CARD_RATIO;
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h / 2;
    return { left: cx - w / 2, top: cy - h / 2, w: w, h: h, cx: cx, cy: cy };
  },

  /** CSS の値へ。1080基準の値を --u 倍する */
  u: function (n) { return 'calc(' + (Math.round(n * 100) / 100) + ' * var(--u))'; },

  /* =============================================================
     ★山札の見た目の段階（残り枚数に応じて束が薄くなる）
     -------------------------------------------------------------
     総合仕様書 4.5 の「3〜5枚の簡略的な重なり」を、
     残り枚数で切り替えます。減っていくのが目で分かるようにするためです。

     区切りは仮の値です。実際に遊んでみて変えてよい場所です。
       28枚以上 → 5枚重ね（開始直後）
       20〜27   → 4枚
       12〜19   → 3枚
        5〜11   → 2枚
        1〜4    → 1枚
        0       → 束を出さない
     ============================================================= */
  DECK_STEPS: [
    { min: 28, level: 5 },
    { min: 20, level: 4 },
    { min: 12, level: 3 },
    { min: 5, level: 2 },
    { min: 1, level: 1 },
  ],

  deckLevel: function (count) {
    const n = Number(count) || 0;
    for (let i = 0; i < this.DECK_STEPS.length; i++) {
      if (n >= this.DECK_STEPS[i].min) return this.DECK_STEPS[i].level;
    }
    return 0;
  },

  /* =============================================================
     相手手札の裏面の並び（総合仕様書 4.4）
       ・枚数と同じ数を横一列
       ・少ないときは間隔を広く、増えるほど重なりを深く
       ・2段にはしない
     ============================================================= */
  HAND_SLOT_W: 427,   // 手札スロット枠の幅（UI-O-03 / UI-P-06）
  HAND_SLOT_H: 126,   // 同じく高さ
  HAND_BACK_W: 90,    // 裏面1枚の幅（枠の高さ126に収まる大きさ）

  handBackPositions: function (n, areaW, cardW) {
    if (!n || n <= 0) return [];
    if (n === 1) return [(areaW - cardW) / 2];
    const roomy = cardW * 1.08;                 // 重ならずに置ける上限
    const fit = (areaW - cardW) / (n - 1);      // 全部を枠へ収める間隔
    const step = Math.min(roomy, fit);
    const total = cardW + step * (n - 1);
    const left = (areaW - total) / 2;
    const out = [];
    for (let i = 0; i < n; i++) out.push(left + step * i);
    return out;
  },

  /* =============================================================
     カード1枚を作る（総合仕様書 4.3）
     画像・名前・コスト・現在スピード・現在体力を優先する。
     ============================================================= */
  makeCard: function (doc, c) {
    const el = doc.createElement('button');
    el.type = 'button';
    el.className = 'v8-card';
    /* ★チュートリアルがこの目印でカードを探します。変えないこと。 */
    el.setAttribute('data-card-id', c.cardId || '');
    el.setAttribute('aria-label', c.name || '');

    const path = (typeof getCardImagePath === 'function') ? getCardImagePath(c.cardId, c.side) : '';
    /* ★読めていなければ絵の部分だけ空白。枠・名前・数値は出す（19.4） */
    if (typeof V8Images !== 'undefined') V8Images.apply(el, path);
    else if (path) el.style.backgroundImage = 'url("' + path + '")';

    if (c.cost !== undefined && c.cost !== null) {
      const cost = doc.createElement('span');
      cost.className = 'v8-card__cost';
      cost.textContent = String(c.cost);
      el.appendChild(cost);
    }

    /* =========================================================
       ★数値は左下にひとかたまりで重ねます（2026-08-01）。
       v0.7 以前と同じ置き方に戻したものです。

       以前は下いっぱいの帯に「速 2」「体 4」を左右へ振り分けて
       いました。★手札のように何枚も重なる場面では、
       右端の体力が隣の札に隠れて読めません。
       左下にまとめておけば、少し見えていれば両方読めます。

       絵に印刷された数字のちょうど上に重なるので、
       「今いくつか」がそのまま置き換わって見えます。

       ★数値を持たないカード（グッズ・イベント・フィールド）には
         出しません（仕様書 12.1）。
       ========================================================= */
    if (c.speed !== undefined && c.speed !== null) {
      const stats = doc.createElement('span');
      stats.className = 'v8-card__stats';

      const sp = doc.createElement('span');
      sp.className = 'v8-card__stat' + this._diffClass(c.speed, c.baseSpeed);
      sp.textContent = this._num(c.speed);
      stats.appendChild(sp);

      const hp = doc.createElement('span');
      /* ★体力の数字には目印を付けます。襲撃の演出が「ここが減る」と
         赤くするために探すためです（Stage 6-5）。 */
      hp.className = 'v8-card__stat v8-card__stat--hp' + this._diffClass(c.hp, c.baseHp);
      hp.textContent = this._num(c.hp);
      stats.appendChild(hp);

      el.appendChild(stats);
    }
    return el;
  },

  /**
   * ★カードの幅を入れる（2026-08-01）。
   * 文字の大きさも同じ値にします。
   * 左下の数値は「カード幅に対する割合」で決まるので、
   * ここをそろえておかないと、小さいカードで数字だけ大きく残ります
   * （v0.7 以前も同じやり方でした）。
   */
  setCardWidth: function (el, cssWidth) {
    if (!el) return;
    el.style.width = cssWidth;
    el.style.fontSize = cssWidth;
  },

  _diffClass: function (now, base) {
    if (now === undefined || base === undefined || now === null || base === null) return '';
    if (now > base) return ' v8-card__stat--up';
    if (now < base) return ' v8-card__stat--down';
    return '';
  },

  _num: function (v) {
    if (v === undefined || v === null) return '-';
    return String(Math.max(0, v));   // 能力値の表示は0が下限
  },

  /* =============================================================
     ひとつのエリア（人間3枠 or 怪異3枠）を並べる
     ============================================================= */
  fillArea: function (doc, areaEl, areaKey, normals, tracks, forceW, topView) {
    if (!areaEl) return;
    areaEl.innerHTML = '';
    const self = this;

    this.assign(areaKey, normals, tracks, topView).forEach(function (pair) {
      const c = pair.card;
      const el = self.makeCard(doc, c);
      let box = pair.box;
      /* ★追跡フェイズでは全部のカードを同じ大きさにします（真上視点なので
         遠近の差が残っていると不自然です）。中心は動かしません。 */
      if (forceW) {
        const h = forceW * self.CARD_RATIO;
        box = { left: box.cx - forceW / 2, top: box.cy - h / 2, w: forceW, h: h };
      }
      el.style.left = self.u(box.left);
      el.style.top = self.u(box.top);
      self.setCardWidth(el, self.u(box.w));
      el.setAttribute('data-role', pair.role);
      if (c.uid) el.setAttribute('data-uid', c.uid);
      /* ★以前はここへ data-drop="equip" を付けて、グッズを
         カードへ直接落とせるようにしていました。
         2026-08-01 の仕様変更でグッズも紫の枠へ落とす形になり、
         装備先は落としたあとに選ぶようになったので外しました。 */
      areaEl.appendChild(el);
    });
  },

  /* =============================================================
     手札の裏面を並べる
     ============================================================= */
  fillHandBacks: function (doc, areaEl, count) {
    if (!areaEl) return;
    areaEl.innerHTML = '';
    const pos = this.handBackPositions(count || 0, this.HAND_SLOT_W, this.HAND_BACK_W);
    const self = this;
    pos.forEach(function (x) {
      const b = doc.createElement('span');
      b.className = 'v8-hand__back';
      b.style.left = self.u(x);
      b.style.width = self.u(self.HAND_BACK_W);
      areaEl.appendChild(b);
    });
  },
};

/* =====================================================================
   アイコン（総合仕様書 4.5「最終的にはアイコン＋数字へ置換できる構造」）
   ---------------------------------------------------------------------
   山札とトラッシュの枚数表示を、文字からアイコンへ置き換えます。
   線だけの簡素な形にして、小さくても形が分かるようにしています。
   currentColor を使うので、まわりの文字色をそのまま継ぎます。
   ===================================================================== */
const V8Icons = {
  /** 山札：カードが3枚重なった形 */
  deck:
    '<svg class="v8-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<rect x="3" y="7" width="12" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<path d="M6.5 4.5h9a2 2 0 0 1 2 2v12" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.72"/>' +
    '<path d="M10 2h8a2 2 0 0 1 2 2v12" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.45"/>' +
    '</svg>',

  /** トラッシュ：ふた付きのごみ箱 */
  trash:
    '<svg class="v8-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M4 6.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M9.5 6.5V4.6a1.1 1.1 0 0 1 1.1-1.1h2.8a1.1 1.1 0 0 1 1.1 1.1v1.9" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M6.2 6.5 7.3 20a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5L17.8 6.5" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<path d="M10.4 10.5v7M13.6 10.5v7" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.7"/>' +
    '</svg>',
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Board: V8Board, V8Icons: V8Icons };
}
