/* =====================================================================
   v08-tune.js ― Stage 7：実機で数値を詰めるための調整パネル
   ---------------------------------------------------------------------
   付録Cの調整項目は、いまコードのあちこちに散らばっています。

     見え方        css/v08-battle.css の変数
     入力の閾値    V8Input
     手札の並べ方  V8Hand
     追跡の大きさ  V8Board
     演出の間合い  V8Fx と preview.js

   ★実機で1つ動かすたびに、コードを直して、詰め直して、
     端末へ送り直す——では、いくら時間があっても足りません。

   このパネルは、その値を**端末の上で直に動かせる**ようにします。
   決まったら「いまの値を書き出す」で一覧を出し、それをコードへ焼きます。

   ---------------------------------------------------------------------
   ★出し方（2つあります）
   ---------------------------------------------------------------------
   ① URL のうしろに ?tune=1 を付けて開く

   ② ★画面の左上のすみを、3秒のうちに5回たたく

   ★②を用意したのは、端末によっては URL を書き換えるのが
     面倒だからです（ファイルから直に開くと、住所の欄が
     出てこないことがあります）。

   どちらでも、画面の左はしに小さな「調整」ボタンが出ます。

   ★パネルは対戦画面の外（画面そのもの）に置きます。
     盤面の上に重ねると、確かめたいところがパネルで隠れて、
     何を直しているのか分からなくなるためです。
     画面が広ければ、盤面の横の余白に収まります。
     「⇄」で左右を入れ替えられます。

   何もしなければ何も出ません。

   ★遊ぶ人には見えません。焼き込みが済んだら、このファイルごと
     読み込みを外せます（本体はこれが無くても動きます）。

   ---------------------------------------------------------------------
   ★覚えておくこと
   ---------------------------------------------------------------------
   動かした値は端末に控えます（読み直しても消えません）。
   ★対戦の保存データとは別の場所に置くので、混ざりません。
   「はじめの値へ戻す」で、いつでも元へ戻せます。
   ===================================================================== */

'use strict';

const V8Tune = {

  KEY: 'mayoibito.v08.tune',

  /* =============================================================
     動かせる値の一覧
     -------------------------------------------------------------
     kind:
       'css'   … css/v08-battle.css の変数（単位つき）
       'obj'   … どこかの入れ物の持ち物（V8Input.LONG_PRESS_MS など）
       'time'  … preview.js が持つ間合い
     ============================================================= */
  SPECS: [
    { group: '盤面の見え方', items: [
      { id: 'card-tilt', label: 'カードの傾き', kind: 'css',
        prop: '--v8-card-tilt', unit: 'deg', min: 0, max: 30, step: 1, def: 16,
        note: '真上から見るほど0に近づきます' },
      { id: 'persp', label: '遠近の強さ', kind: 'css',
        prop: '--v8-persp', unitU: true, min: 600, max: 3000, step: 50, def: 1500,
        note: '小さいほど強くゆがみます' },
      { id: 'persp-y', label: '視点の高さ', kind: 'css',
        prop: '--v8-persp-y', unit: '%', min: 20, max: 80, step: 1, def: 44 },
      { id: 'deck-tilt', label: '山札の傾き', kind: 'css',
        prop: '--v8-deck-tilt', unit: 'deg', min: 0, max: 10, step: 1, def: 3 },
      { id: 'radius', label: 'カードの角の丸み', kind: 'css',
        prop: '--v8-radius', unitU: true, min: 0, max: 30, step: 1, def: 14 },
    ] },

    { group: '指の操作', items: [
      { id: 'long', label: '長押しと判定するまで', kind: 'obj',
        obj: 'V8Input', key: 'LONG_PRESS_MS', min: 200, max: 900, step: 20, def: 500,
        unitText: 'ms', note: '短いと、押しただけで詳細が開きます' },
      { id: 'drag', label: 'ドラッグを始める距離', kind: 'obj',
        obj: 'V8Input', key: 'DRAG_THRESHOLD', min: 4, max: 24, step: 1, def: 10,
        unitText: 'px', note: '小さいと、タップのつもりで運んでしまいます' },
    ] },

    { group: '手札', items: [
      { id: 'hand-w', label: 'カードの幅（多くないとき）', kind: 'obj',
        obj: 'V8Hand', key: 'BIG_CARD_W', min: 200, max: 380, step: 10, def: 300, redraw: true },
      { id: 'hand-vis', label: '1枚あたり見せる割合', kind: 'obj',
        obj: 'V8Hand', key: 'MIN_VISIBLE', min: 0.30, max: 0.70, step: 0.02, def: 0.46,
        redraw: true, note: '大きいほどカードが小さくなります' },
      { id: 'hand-push', label: '選んだとき、となりに空ける幅', kind: 'obj',
        obj: 'V8Hand', key: 'NEIGHBOR_TAP', min: 60, max: 180, step: 5, def: 100, redraw: true },
    ] },

    { group: '追跡フェイズ', items: [
      { id: 'top-w', label: 'カードの大きさ', kind: 'obj',
        obj: 'V8Board', key: 'TOP_MAX_W', min: 140, max: 280, step: 5, def: 220, redraw: true },
      { id: 'top-lane', label: '1列に使う幅', kind: 'obj',
        obj: 'V8Board', key: 'TOP_LANE_W', min: 400, max: 640, step: 10, def: 520, redraw: true },
      { id: 'conveyor', label: '矢印が流れる速さ', kind: 'obj',
        obj: 'V8Fx', key: 'CONVEYOR_MS', min: 800, max: 4000, step: 100, def: 2200,
        unitText: 'ms', note: '大きいほどゆっくり' },
    ] },

    { group: '対戦が始まるまで', items: [
      { id: 'fade-down', label: '黒くなるまで', kind: 'obj',
        obj: 'V8Fx', key: 'FADE_DOWN', min: 0, max: 1200, step: 20, def: 420, unitText: 'ms' },
      { id: 'fade-up', label: '黒が晴れるまで', kind: 'obj',
        obj: 'V8Fx', key: 'FADE_UP', min: 0, max: 1600, step: 20, def: 620, unitText: 'ms' },
      { id: 'deal-lead', label: '晴れてから配り始めるまで', kind: 'time',
        key: 'DEAL_LEAD', min: 0, max: 2000, step: 50, def: 700, unitText: 'ms' },
      { id: 'deal-gap', label: '1枚ごとの間隔', kind: 'time',
        key: 'DEAL_GAP', min: 30, max: 300, step: 5, def: 85, unitText: 'ms' },
      { id: 'deal-dur', label: '1枚が飛ぶ時間', kind: 'time',
        key: 'DEAL_DURATION', min: 120, max: 600, step: 10, def: 250, unitText: 'ms' },
      { id: 'deal-pause', label: '配り終えてから交換の画面まで', kind: 'time',
        key: 'DEAL_PAUSE', min: 0, max: 1500, step: 50, def: 420, unitText: 'ms' },
      { id: 'mull-end', label: '交換のあと、対戦開始まで', kind: 'time',
        key: 'MULLIGAN_END_PAUSE', min: 0, max: 2500, step: 50, def: 800, unitText: 'ms' },

      /* ★v0.9 Phase 6：カードが動くときの間合い。
         ★ドロー・トラッシュ・交換・襲撃、すべてがこの3つを通ります。
           速すぎる／遅すぎると感じたら、まずここを触ります。 */
      { id: 'fly-gap', label: '★光の間隔（すべての移動）', kind: 'time',
        key: 'FLY_GAP', min: 40, max: 400, step: 10, def: 150, unitText: 'ms' },
      { id: 'fly-dur', label: '★光が飛ぶ時間（すべての移動）', kind: 'time',
        key: 'FLY_DURATION', min: 120, max: 900, step: 20, def: 360, unitText: 'ms' },
      { id: 'fly-arrive', label: '★着いたと見なす割合', kind: 'time',
        key: 'ARRIVE_RATIO', min: 0.3, max: 1, step: 0.02, def: 0.62, unitText: '' },
    ] },

    { group: '対戦中の演出', items: [
      { id: 'rev-hold', label: '中央でカードを見せる時間', kind: 'obj',
        obj: 'V8Fx', key: 'REVEAL_HOLD', min: 0, max: 1500, step: 50, def: 500, unitText: 'ms' },
      { id: 'rev-travel', label: '中央へ伸びる速さ', kind: 'obj',
        obj: 'V8Fx', key: 'CENTER_TRAVEL', min: 0.2, max: 1.2, step: 0.02, def: 0.62,
        note: '小さいほど速い' },
      { id: 'rev-at', label: 'カードが出るのは伸びの何割か', kind: 'obj',
        obj: 'V8Fx', key: 'REVEAL_AT', min: 0.3, max: 1, step: 0.05, def: 0.7 },
      { id: 'rev-w', label: '中央のカードの大きさ', kind: 'obj',
        obj: 'V8Fx', key: 'REVEAL_W', min: 180, max: 420, step: 10, def: 300 },
      { id: 'rev-drop', label: '中央からトラッシュへ落ちる時間', kind: 'obj',
        obj: 'V8Fx', key: 'REVEAL_DROP', min: 100, max: 800, step: 20, def: 300, unitText: 'ms' },
      { id: 'move', label: '盤面のカードが動く時間', kind: 'obj',
        obj: 'V8Fx', key: 'MOVE_MS', min: 100, max: 800, step: 20, def: 320, unitText: 'ms' },
    ] },
  ],

  _root: null,      // 対戦画面（css の変数を当てる先）
  _panel: null,     // パネルそのもの（画面の外に置く）
  _values: {},
  _open: false,
  _side: 'left',

  /** URL に ?tune=1 が付いているか */
  wanted: function () {
    if (typeof location === 'undefined') return false;
    return /[?&]tune=1(&|$)/.test(location.search || '');
  },

  /* ★左上のすみを続けてたたいたら出す（URLを書き換えなくてよい道） */
  /* ★★配布版では、この1行を false にしてください（仕様書AIの確定・v0.9）。
     ---------------------------------------------------------------
     「画面の左上を3秒で5回たたく」で調整パネルが出ます。
     ★遊んでいる人が偶然やってしまうことがあります。
       とくに戻るボタンのあたりを素早く操作しているときです。
       開いてスライダーを動かすと、その値は端末に残り、
       ★「なんだか演出が変になった」と思っても原因に気づけません。

     ★開発中は true のままで構いません。
       ?tune=1 は、配布版でも残します（作者が開けるように）。
     --------------------------------------------------------------- */
  CORNER_TAP_ENABLED: true,

  CORNER: 120,        // すみと見なす大きさ（実px）
  TAPS: 5,            // 何回で出すか
  TAP_WINDOW: 3000,   // 何ミリ秒のうちに

  _taps: [],

  init: function (rootEl) {
    if (!rootEl) return this;
    this._root = rootEl;
    if (this.wanted()) { this.enable(); return this; }
    /* ★配布版では、たたいて出す道を閉じます（上の CORNER_TAP_ENABLED） */
    if (this.CORNER_TAP_ENABLED) this._watchCorner();
    return this;
  },

  /** パネルを組み立てて出す。二度呼んでも増えません */
  enable: function () {
    if (!this._root || this._built) return;
    this._built = true;
    this._load();
    this._build();
    this.applyAll();
  },

  _built: false,

  _watchCorner: function () {
    if (typeof document === 'undefined') return;
    const self = this;
    document.addEventListener('pointerdown', function (e) {
      if (self._built) return;
      /* ★左上のすみ以外は数えません。ふつうの操作で出ては困ります。
         ここでは止めも書き換えもしないので、下の操作はそのまま通ります。 */
      if (e.clientX > self.CORNER || e.clientY > self.CORNER) { self._taps = []; return; }
      const now = Date.now();
      self._taps = self._taps.filter(function (t) { return now - t < self.TAP_WINDOW; });
      self._taps.push(now);
      if (self._taps.length >= self.TAPS) {
        self._taps = [];
        self.enable();
        self.toggle();
      }
    }, true);
  },

  /* =============================================================
     値の出し入れ
     ============================================================= */
  _specOf: function (id) {
    let hit = null;
    this.SPECS.forEach(function (g) {
      g.items.forEach(function (it) { if (it.id === id) hit = it; });
    });
    return hit;
  },

  valueOf: function (it) {
    return (this._values[it.id] !== undefined) ? this._values[it.id] : it.def;
  },

  /**
   * 名前から入れ物を探す。
   * ★window から引いてはいけません。これらは const で作られていて、
   *   ブラウザでも window には乗りません（undefined になります）。
   *   まだ読み込まれていない場面もあるので、typeof で見ます。
   */
  _holderOf: function (name) {
    if (name === 'V8Input') return (typeof V8Input !== 'undefined') ? V8Input : null;
    if (name === 'V8Hand') return (typeof V8Hand !== 'undefined') ? V8Hand : null;
    if (name === 'V8Board') return (typeof V8Board !== 'undefined') ? V8Board : null;
    if (name === 'V8Fx') return (typeof V8Fx !== 'undefined') ? V8Fx : null;
    return null;
  },

  /** 1つ当てる */
  apply: function (it, v) {
    this._values[it.id] = v;

    if (it.kind === 'css' && this._root) {
      const text = it.unitU ? ('calc(' + v + ' * var(--u))')
        : (v + (it.unit || ''));
      this._root.style.setProperty(it.prop, text);
      return;
    }

    if (it.kind === 'obj') {
      const target = this._holderOf(it.obj);
      if (target) target[it.key] = v;
      return;
    }

    if (it.kind === 'time' && typeof window !== 'undefined' && window.__v8Timing) {
      window.__v8Timing.set(it.key, v);
    }
  },

  applyAll: function () {
    const self = this;
    this.SPECS.forEach(function (g) {
      g.items.forEach(function (it) { self.apply(it, self.valueOf(it)); });
    });
    this._redraw();
  },

  /** 並べ直しが要るものを動かしたら、描き直す */
  _redraw: function () {
    if (typeof V8Battle !== 'undefined' && V8Battle.isOpen()) {
      V8Battle.renderIfChanged(true);
    }
    if (typeof V8Hand !== 'undefined' && V8Hand.expanded && V8Hand._cards) {
      V8Hand.render(V8Hand._cards);
    }
  },

  /* =============================================================
     端末に控える（対戦の保存データとは別の場所）
     ============================================================= */
  _load: function () {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) this._values = JSON.parse(raw) || {};
      if (this._values.__side === 'right') this._side = 'right';
    } catch (e) { this._values = {}; }
  },

  _save: function () {
    try { localStorage.setItem(this.KEY, JSON.stringify(this._values)); }
    catch (e) { /* 控えられなくても調整そのものは続けられます */ }
  },

  reset: function () {
    const side = this._side;
    this._values = {};
    if (side === 'right') this._values.__side = side;
    try { localStorage.removeItem(this.KEY); } catch (e) { /* 無視 */ }
    this.applyAll();
    this._syncInputs();
  },

  /* =============================================================
     書き出す
     -------------------------------------------------------------
     ★はじめの値と違うものだけを出します。
       全部出すと、どこを動かしたのか分からなくなります。
     ============================================================= */
  dump: function () {
    const self = this;
    const lines = [];
    this.SPECS.forEach(function (g) {
      const rows = [];
      g.items.forEach(function (it) {
        const v = self.valueOf(it);
        if (Math.abs(v - it.def) < 1e-9) return;
        rows.push('  ' + it.label + '：' + it.def + ' → ' + v +
          '   [' + self._where(it) + ']');
      });
      if (rows.length) lines.push('■ ' + g.group, rows.join('\n'));
    });
    return lines.length ? lines.join('\n') : '（はじめの値のまま。動かしたものはありません）';
  },

  _where: function (it) {
    if (it.kind === 'css') return 'css/v08-battle.css ' + it.prop;
    if (it.kind === 'obj') return it.obj + '.' + it.key;
    return 'preview.js ' + it.key;
  },

  /* =============================================================
     画面
     ============================================================= */
  _build: function () {
    const doc = document;
    const self = this;

    const wrap = doc.createElement('div');
    wrap.className = 'v8-tune';
    wrap.id = 'v8-tune';

    const bar = doc.createElement('div');
    bar.className = 'v8-tune__bar';

    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'v8-tune__toggle';
    btn.textContent = '調整';
    btn.onclick = function () { self.toggle(); };
    bar.appendChild(btn);

    /* ★左右を入れ替える。盤面の位置は端末で変わるので、
       じゃまにならない側へ逃がせるようにしておきます。 */
    const swap = doc.createElement('button');
    swap.type = 'button';
    swap.className = 'v8-tune__toggle v8-tune__swap';
    swap.textContent = '⇄';
    swap.title = '左右を入れ替える';
    swap.onclick = function () { self.swapSide(); };
    bar.appendChild(swap);

    wrap.appendChild(bar);

    const box = doc.createElement('div');
    box.className = 'v8-tune__box';
    box.id = 'v8-tune-box';

    const head = doc.createElement('div');
    head.className = 'v8-tune__head';
    head.textContent = 'Stage 7 調整（この画面は遊ぶ人には出ません）';
    box.appendChild(head);

    const body = doc.createElement('div');
    body.className = 'v8-tune__body';

    this.SPECS.forEach(function (g) {
      const h = doc.createElement('div');
      h.className = 'v8-tune__group';
      h.textContent = g.group;
      body.appendChild(h);

      g.items.forEach(function (it) {
        const row = doc.createElement('label');
        row.className = 'v8-tune__row';

        const name = doc.createElement('span');
        name.className = 'v8-tune__name';
        name.textContent = it.label;
        row.appendChild(name);

        const input = doc.createElement('input');
        input.type = 'range';
        input.className = 'v8-tune__range';
        input.min = String(it.min);
        input.max = String(it.max);
        input.step = String(it.step);
        input.value = String(self.valueOf(it));
        input.setAttribute('data-tune', it.id);

        const out = doc.createElement('span');
        out.className = 'v8-tune__val';
        out.textContent = self._fmt(it, self.valueOf(it));

        input.oninput = function () {
          const v = Number(input.value);
          out.textContent = self._fmt(it, v);
          self.apply(it, v);
          if (it.redraw) self._redraw();
          self._save();
        };

        row.appendChild(input);
        row.appendChild(out);
        body.appendChild(row);

        if (it.note) {
          const n = doc.createElement('div');
          n.className = 'v8-tune__note';
          n.textContent = it.note;
          body.appendChild(n);
        }
      });
    });

    box.appendChild(body);

    const foot = doc.createElement('div');
    foot.className = 'v8-tune__foot';

    const dump = doc.createElement('button');
    dump.type = 'button';
    dump.className = 'v8-tune__btn';
    dump.textContent = 'いまの値を書き出す';
    dump.onclick = function () { self._showDump(); };
    foot.appendChild(dump);

    const reset = doc.createElement('button');
    reset.type = 'button';
    reset.className = 'v8-tune__btn';
    reset.textContent = 'はじめの値へ戻す';
    reset.onclick = function () { self.reset(); };
    foot.appendChild(reset);

    box.appendChild(foot);

    const outBox = doc.createElement('textarea');
    outBox.className = 'v8-tune__out';
    outBox.id = 'v8-tune-out';
    outBox.readOnly = true;
    box.appendChild(outBox);

    wrap.appendChild(box);

    /* ★対戦画面の中ではなく、画面そのものへ足します。
       中に入れると盤面の上に重なり、確かめたいところが隠れます。 */
    this._panel = wrap;
    (doc.body || this._root).appendChild(wrap);
    this._applySide();
  },

  /** 左右を入れ替える */
  swapSide: function () {
    this._side = (this._side === 'left') ? 'right' : 'left';
    this._values.__side = this._side;
    this._save();
    this._applySide();
  },

  _applySide: function () {
    if (!this._panel) return;
    this._panel.classList.toggle('v8-tune--right', this._side === 'right');
  },

  _fmt: function (it, v) {
    const n = (it.step < 1) ? v.toFixed(2) : String(v);
    return n + (it.unit || it.unitText || '');
  },

  _syncInputs: function () {
    if (!this._panel) return;
    const self = this;
    const list = this._panel.querySelectorAll('[data-tune]');
    Array.prototype.forEach.call(list, function (input) {
      const it = self._specOf(input.getAttribute('data-tune'));
      if (!it) return;
      input.value = String(self.valueOf(it));
      const out = input.parentNode.querySelector('.v8-tune__val');
      if (out) out.textContent = self._fmt(it, self.valueOf(it));
    });
  },

  _showDump: function () {
    const el = this._panel && this._panel.querySelector('#v8-tune-out');
    if (!el) return;
    el.value = this.dump();
    el.style.display = 'block';
    el.select();
  },

  toggle: function () {
    this._open = !this._open;
    if (this._panel) this._panel.classList.toggle('v8-tune-open', this._open);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { V8Tune: V8Tune };
