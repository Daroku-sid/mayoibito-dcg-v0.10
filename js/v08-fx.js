/* =====================================================================
   v08-fx.js ― v0.8 対戦中の演出（Stage 6-4／土台）
   ---------------------------------------------------------------------
   v0.7 以前の対戦には、カードの移動を光で見せる演出がありました。
   その演出は #stage の中の #fly-layer に描かれています。
   v0.8 の新しい盤面は #stage を丸ごと覆うので、光は一枚も見えません。

   ★ここで作るのは「見た目」だけです。
     いつ・何枚・どの順で飛ぶかは preview.js が決めたままにします。
     この置き換えで、時間の刻みも Game の呼び順も変わりません。

   preview.js からは、飛ばす1枚ごとに次の形で渡ってきます。

     window.__v8Fly({
       kind: 'toHand' / 'deckTrash' / 'handTrash' / 'dropToTrash',
       from: 場所の指定, to: 場所の指定,
       duration: ミリ秒,
     })

   場所の指定は、座標ではなく「どこ」を表す言葉です。

     { zone: 'deck',       side: 'village' }  … 山札
     { zone: 'trash',      side: 'village' }  … トラッシュ
     { zone: 'trashAbove', side: 'village' }  … トラッシュの少し上
     { zone: 'hand',       side: 'village' }  … 手札（新しく加わるあたり）
     { zone: 'handCard',   side: 'village', uid: 12 } … 手札の中の1枚

   座標で受け取らないのは、既存の盤面と新しい盤面で座標系が違うためです。
   言葉で受け取り、こちら側の要素を測って座標に直します。
   ===================================================================== */

'use strict';

const V8Fx = {

  _root: null,
  _low: null,      // 手札より奥を通る光
  _top: null,      // 手札より手前を通る光
  _flying: [],

  /* ★preview.js の FLY_DURATION / ARRIVE_RATIO と同じ値。
     片方だけ変えると演出がずれるので、検査で突き合わせています。 */
  DUR: 360,
  ARRIVE: 0.62,

  /* 弧のふくらみ（1080基準の設計px）。preview.js の arcControlPoint と同じ。 */
  ARC: {
    /* ★手札に加わる動きは、まっすぐ伸びます（2026-08-01）。
       以前は手札の下へ回り込む弧でした（既存の盤面はいまもそうです）。
       弧を描くと、山札から来たことが読み取りにくくなっていました。
       ここに載せていない種類は、まっすぐ進みます。 */
    deckTrash: { dx: 0, dy: 80 },
    handTrash: { dx: 0, dy: -190 }, // 手札の上を、少し持ち上がるように
    /* ★中央でカードを見せる動き（2026-08-01）。
       山札からは真横なので、ここには載せません（＝まっすぐ進みます）。 */
    handCenter: { dx: 0, dy: -120 },
  },

  /* 光の大きさ（1080基準の設計px）。既存の .fly-light と同じ見え方にします。 */
  W: 88,
  W_SMALL: 54,

  /* =============================================================
     組み立て
     ============================================================= */
  init: function (root) {
    if (!root) return;
    const doc = (typeof document !== 'undefined') ? document : null;
    if (!doc) return;

    this._root = root;
    this._low = root.querySelector('#v8-fx-low');
    this._top = root.querySelector('#v8-fx-top');

    if (typeof window !== 'undefined') {
      const self = this;
      window.__v8Fly = function (spec) { return self.fly(spec); };
      window.__v8FlashHand = function (uid) { return self.flashHand(uid); };
      window.__v8FxClear = function () { self.clear(); };
      window.__v8Attack = function (spec) { return self.attack(spec); };
      window.__v8ArrowAttack = function (side) { self.setAttackSide(side); };
    }
  },

  /** この画面がいま使える状態か */
  ready: function () {
    if (!this._root || !this._low || !this._top) return false;
    if (typeof window === 'undefined') return false;
    /* 新しい盤面が出ていないときは、既存の演出にそのまま任せます。 */
    if (!window.__v8Active || !window.__v8Active()) return false;
    return this._root.offsetWidth > 0;
  },

  /** 「1080基準の1px」が、いま実際に何pxか */
  unit: function () {
    if (!this._root) return 1;
    const w = this._root.offsetWidth || 0;
    return w > 0 ? (w / 1080) : 1;
  },

  /* =============================================================
     場所の指定 → 座標（この画面の左上を原点とする実px）
     ============================================================= */
  _who: function (side) {
    if (typeof V8State === 'undefined') return 'self';
    return (side === V8State.bottomSide()) ? 'self' : 'opp';
  },

  /** 要素の中心を、この画面の中の座標で返す */
  centerOf: function (el) {
    if (!el || !this._root || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const base = this._root.getBoundingClientRect();
    return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
  },

  point: function (desc) {
    if (!desc || !this._root) return null;
    const who = this._who(desc.side);
    const q = function (sel) { return this._root.querySelector(sel); }.bind(this);

    if (desc.zone === 'deck') return this.centerOf(q('#v8-' + who + '-deckpile'));

    if (desc.zone === 'trash') return this.centerOf(q('#v8-' + who + '-trashbtn'));

    if (desc.zone === 'trashAbove') {
      const p = this.centerOf(q('#v8-' + who + '-trashbtn'));
      if (!p) return null;
      return { x: p.x, y: p.y - 150 * this.unit() };
    }

    /* ★カードを見せる場所（2026-08-01）。
       山札からトラッシュへ置かれるカードと、手札から捨てたカードは、
       いったんここで止まって「何のカードだったか」を見せます。

       横は画面の中央、縦はその陣営の山札の高さです。
       こうすると、山札からは真横へまっすぐ伸びる動きになります。
       自分側では、ここがちょうど盤面の中央にもあたります。 */
    if (desc.zone === 'center') {
      const deck = this.centerOf(q('#v8-' + who + '-deckpile'));
      const w = this._root.offsetWidth || 0;
      if (!deck) return { x: w / 2, y: (this._root.offsetHeight || 0) / 2 };
      return { x: w / 2, y: deck.y };
    }

    if (desc.zone === 'handCard') {
      /* 拡大手札が出ていれば、その1枚から飛ばします。
         出ていなければ手札全体の位置で代用します。 */
      if (who === 'self' && desc.uid != null) {
        const el = q('.v8-hand__card[data-uid="' + desc.uid + '"]');
        const p = this.centerOf(el);
        if (p) return p;
      }
      return this.point({ zone: 'hand', side: desc.side });
    }

    if (desc.zone === 'hand') {
      /* 拡大手札が出ていれば、いちばん右のカード（新しく加わるあたり）。
         ★大きさがゼロの要素は、隠れている印なので使いません。
           そのまま測ると画面の左上へ飛んでいきます（v0.4の教訓）。 */
      if (who === 'self') {
        const cards = this._root.querySelectorAll('.v8-hand__card');
        if (cards.length) {
          const p = this.centerOf(cards[cards.length - 1]);
          if (p) return p;
        }
      }
      const slots = this.centerOf(q('#v8-' + who + '-hand'));
      if (slots) return slots;
      /* 手札が1枚も無いときの控え */
      const u = this.unit();
      return { x: 540 * u, y: (who === 'self' ? 1640 : 180) * u };
    }

    return null;
  },

  /* =============================================================
     光を1つ飛ばす
     -------------------------------------------------------------
     @return {boolean} 引き受けたかどうか。false のときは既存が出します。
     ============================================================= */
  fly: function (spec) {
    if (!spec || !this.ready()) return false;

    /* ★山札→トラッシュ と 手札→トラッシュ は、いったん中央で
       「何のカードだったか」を見せてから落とします（2026-08-01）。
       ★動きを減らす設定のときは、これまでどおり一直線で飛ばします
         （見せるための間があると、待たされるだけになるため）。 */
    if (this.VIA_CENTER[spec.kind] && spec.card && !this.reduced()) {
      const via = this._flyViaCenter(spec);
      if (via) return via;
    }

    const start = this.point(spec.from);
    const goal = this.point(spec.to);
    if (!start || !goal) return false;

    const doc = document;
    const u = this.unit();
    const kind = spec.kind || 'toHand';

    const el = doc.createElement('div');
    let cls = 'v8-fx__light';
    if (kind !== 'toHand') cls += ' v8-fx__light--warm';
    if (kind === 'dropToTrash') cls += ' v8-fx__light--small';
    el.className = cls;
    el.style.width = ((kind === 'dropToTrash' ? this.W_SMALL : this.W) * u) + 'px';
    el.style.left = start.x + 'px';
    el.style.top = start.y + 'px';

    /* 手札から出ていく動きだけ、手札より手前の層を通します。 */
    const layer = (kind === 'handTrash') ? this._top : this._low;
    layer.appendChild(el);

    const dur = Math.max(1, spec.duration || this.DUR);
    const entry = {
      el: el, kind: kind, goal: goal, to: spec.to,
      endAt: this._now() + dur, anim: null,
    };
    this._flying.push(entry);

    this._animate(entry, start, goal, dur, 'cubic-bezier(0.35, 0, 0.3, 1)');

    /* 念のための保険。動かせない環境でも必ず消えるようにします。 */
    const self = this;
    setTimeout(function () {
      el.remove();
      self._flying = self._flying.filter(function (f) { return f !== entry; });
    }, dur + 500);

    return true;
  },

  _now: function () {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  },

  _animate: function (entry, start, goal, dur, easing) {
    const el = entry.el;
    if (!el.animate) { setTimeout(function () { el.remove(); }, dur); return; }
    const ctrl = this.arcControl(entry.kind, start, goal);
    entry.anim = el.animate(this.arcFrames(start, ctrl, goal),
      { duration: dur, easing: easing || 'ease-out' });
    entry.anim.onfinish = function () { el.remove(); };
  },

  /** 弧の「ふくらみ」を決める点（既存の arcControlPoint と同じ形） */
  arcControl: function (kind, start, goal) {
    const mid = { x: (start.x + goal.x) / 2, y: (start.y + goal.y) / 2 };
    const u = this.unit();
    const a = this.ARC[kind];
    /* ★載っていない種類は、まっすぐ進みます。
       dropToTrash（真上から落とす）・deckCenter（真横へ伸びる）と、
       ★toHand（山札から手札へまっすぐ）です。 */
    if (!a) return mid;
    if (kind === 'deckTrash') return { x: start.x, y: goal.y + a.dy * u };
    return { x: mid.x, y: mid.y + a.dy * u }; // handTrash / handCenter
  },

  /** 弧に沿った動きを、細かい区切りの並びに直す（既存と同じ計算） */
  arcFrames: function (start, ctrl, goal) {
    const frames = [];
    const STEPS = 20;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const v = 1 - t;
      const x = v * v * start.x + 2 * v * t * ctrl.x + t * t * goal.x;
      const y = v * v * start.y + 2 * v * t * ctrl.y + t * t * goal.y;

      const scale = 0.62 + 0.46 * Math.sin(Math.PI * t);
      let opacity = 1;
      if (t < 0.12) opacity = t / 0.12;
      else if (t > 0.86) opacity = (1 - t) / 0.14;

      frames.push({
        transform: 'translate(calc(-50% + ' + (x - start.x) + 'px), ' +
                   'calc(-50% + ' + (y - start.y) + 'px)) scale(' + scale.toFixed(3) + ')',
        opacity: opacity,
      });
    }
    return frames;
  },

  /* =============================================================
     行き先を向け直す
     -------------------------------------------------------------
     手札を拡大したりたたんだりすると、着地するべき場所が動きます。
     出発したときの位置のまま飛ばすと、何も無いところへ着きます。
     いま見えている位置から、残り時間で飛び直させます（既存と同じ考え方）。
     ============================================================= */
  reaim: function () {
    if (!this._flying.length || !this._root) return;
    const now = this._now();
    const self = this;

    this._flying.forEach(function (f) {
      if (!f.el || !f.el.isConnected) return;
      const goal = self.point(f.to);
      if (!goal) return;
      if (Math.abs(goal.x - f.goal.x) < 2 && Math.abs(goal.y - f.goal.y) < 2) return;

      const left = Math.max(60, f.endAt - now);
      const here = self.centerOf(f.el);
      if (!here) return;

      if (f.anim) { try { f.anim.cancel(); } catch (e) { /* 無視 */ } }
      f.el.style.left = here.x + 'px';
      f.el.style.top = here.y + 'px';
      self._animate(f, here, goal, left, 'ease-out');
      f.goal = goal;
    });
  },

  /** 飛んでいる途中の光を、すべて片づける（対戦をやめたときなど） */
  clear: function () {
    this._flying.forEach(function (f) {
      if (f.anim) { try { f.anim.cancel(); } catch (e) { /* 無視 */ } }
      if (f.el) f.el.remove();
    });
    this._flying = [];
    this._hp = {};
    this._clearStacks();
    if (this._low) this._low.innerHTML = '';
    if (this._top) this._top.innerHTML = '';
  },

  /* =============================================================
     ★襲撃の演出（Stage 6-5・総合仕様書 21.4）
     -------------------------------------------------------------
     怪異が持ち上がって人間へぶつかり、ぶつかった所で光が弾け、
     体力の数字が赤くなってから減る、という流れです。

     数字が減るのを「ぶつかったあと」にずらしているのは、
     何がいくつ減ったのかを目で追えるようにするためです。
     一瞬で変わると、気づいたときには終わっています。

     ★時間の刻みは preview.js が決めて渡します。
       ここで決めると、既存の演出と少しずつずれていきます。
     ============================================================= */

  /* いま赤くしておく体力（uid → いつまで）。
     描き直すとカードが作り直されるので、そのたびに付け直します。 */
  _hp: {},

  /** 盤面にある、そのカードの要素 */
  cardEl: function (uid) {
    if (!this._root || uid == null) return null;
    return this._root.querySelector('.v8-board .v8-card[data-uid="' + uid + '"]');
  },

  /** 「動きを減らす」が入っているか */
  reduced: function () {
    return !!(this._root && this._root.classList &&
      this._root.classList.contains('v8-reduce'));
  },

  attack: function (spec) {
    if (!spec || !this.ready()) return false;
    const a = this.cardEl(spec.attacker);
    const d = this.cardEl(spec.defender);
    if (!a || !d) return false;

    const dur = Math.max(1, spec.duration || 760);
    const hitAt = Math.max(0, spec.hitAt || Math.round(dur * 0.62));
    /* 数字を赤くしておく時間。ぶつかってから、減ったあと少し残します。 */
    const until = this._now() + (dur - hitAt) + Math.max(0, spec.holdHp || 520);

    this._lunge(a, d, dur);

    const self = this;
    setTimeout(function () {
      if (!self._root) return;
      self.burst(spec.defender);
      self.burst(spec.attacker);   // 反撃を受けるので、こちらも揺れる
      self._hp[spec.defender] = until;
      self._hp[spec.attacker] = until;
      self.applyHpHit();
    }, hitAt);

    return true;
  },

  /**
   * 怪異が人間へぶつかりに行く動き。
   * 相手の手前で止めます。重なりきると、どちらが殴ったのか分かりません。
   */
  _lunge: function (attackerEl, defenderEl, dur) {
    if (!attackerEl.animate || this.reduced()) return;

    const a = attackerEl.getBoundingClientRect();
    const d = defenderEl.getBoundingClientRect();
    const dx = (d.left + d.width / 2) - (a.left + a.width / 2);
    const dy = (d.top + d.height / 2) - (a.top + a.height / 2);
    const reach = 0.62;

    /* ★カードは陣地ごとの入れ物（.v8-area）に入っています。
       カードだけ前に出しても入れ物どうしの前後は変わらないので、
       相手の怪異が自分の人間の下へ潜り込んで見えます。
       入れ物ごと前に出します（v0.4.4 と同じ対策）。 */
    const area = attackerEl.parentElement;
    const areaZ = area ? area.style.zIndex : '';
    if (area) area.style.zIndex = '30';
    const cardZ = attackerEl.style.zIndex;
    attackerEl.style.zIndex = '5';

    /* ★カードは盤面の遠近の中で寝ています（rotateX）。
       その傾きを書き足さずに動かすと、殴るあいだだけ
       まっすぐ立ち上がってしまいます。傾きも一緒に指定します。 */
    const tilt = this._tilt();
    const T = function (x, y, s) {
      return 'translate(' + x + 'px,' + y + 'px) scale(' + s + ') rotateX(' + tilt + ')';
    };

    const anim = attackerEl.animate([
      { transform: T(0, 0, 1) },
      { transform: T(-dx * 0.12, -dy * 0.12, 1.06), offset: 0.28 },
      { transform: T(dx * reach, dy * reach, 1.12), offset: 0.62 },
      { transform: T(dx * reach * 0.9, dy * reach * 0.9, 1.08), offset: 0.72 },
      { transform: T(0, 0, 1) },
    ], { duration: dur, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' });

    anim.onfinish = function () {
      attackerEl.style.zIndex = cardZ;
      if (area) area.style.zIndex = areaZ;
    };
  },

  /** 盤面のカードが寝ている角度（追跡フェイズでは 0deg） */
  _tilt: function () {
    if (typeof getComputedStyle !== 'function' || !this._root) return '0deg';
    const v = getComputedStyle(this._root).getPropertyValue('--v8-card-tilt');
    return (v && v.trim()) ? v.trim() : '0deg';
  },

  /** ぶつかった所で光を弾けさせる */
  burst: function (uid) {
    const el = this.cardEl(uid);
    if (!el || !this._top || this.reduced()) return false;

    const p = this.centerOf(el);
    if (!p) return false;

    const fx = document.createElement('div');
    fx.className = 'v8-fx__burst';
    const size = 260 * this.unit();
    fx.style.width = size + 'px';
    fx.style.height = size + 'px';
    fx.style.left = p.x + 'px';
    fx.style.top = p.y + 'px';
    this._top.appendChild(fx);
    setTimeout(function () { fx.remove(); }, 700);

    if (el.animate) {
      const tilt = this._tilt();
      const T = function (x, y) {
        return 'translate(' + x + 'px,' + y + 'px) rotateX(' + tilt + ')';
      };
      el.animate([
        { filter: 'brightness(2.4)', transform: T(0, 0) },
        { filter: 'brightness(1.2)', transform: T(-7, 3), offset: 0.3 },
        { filter: 'brightness(1.4)', transform: T(6, -2), offset: 0.6 },
        { filter: 'brightness(1)', transform: T(0, 0) },
      ], { duration: 420, easing: 'ease-out' });
    }
    return true;
  },

  /**
   * 赤くしておく体力を、いまの盤面へ付け直す。
   * 描き直すとカードの要素が作り直されるので、描いたあとに毎回呼びます。
   */
  applyHpHit: function () {
    if (!this._root) return;
    const now = this._now();
    const self = this;
    Object.keys(this._hp).forEach(function (uid) {
      if (self._hp[uid] <= now) { delete self._hp[uid]; return; }
      const el = self.cardEl(uid);
      const hp = el && el.querySelector('.v8-card__stat--hp');
      if (hp) hp.classList.add('v8-hp-hit');
    });
  },


  /* =============================================================
     ★中央でカードを見せてから落とす（2026-08-01）
     -------------------------------------------------------------
       山札 → 中央（真横へまっすぐ）→ カードを見せる → トラッシュへ落ちる
       手札 → 中央（同じ場所）      → カードを見せる → トラッシュへ落ちる

     何が置かれたのか分からないまま光が消えていたのを、
     一度止めて見せる形にしたものです。

     ★複数枚まとめて置かれるときは、中央に重ねて並べます。
       1枚ずつ順に着いて重なっていき、最後の1枚が着いてから
       見せる時間をとり、まとめて落ちます。
     ============================================================= */

  /* この動きを使う種類 */
  VIA_CENTER: { deckTrash: true, handTrash: true },

  REVEAL_HOLD: 500,     // 中央でカードを見せる時間
  REVEAL_DROP: 300,     // 中央 → トラッシュ
  REVEAL_SHIFT: 36,     // 重ねるときの1枚ぶんのずれ（1080基準）

  /* ★見せるカードの大きさ（1080基準）。
     相手がカードを使ったときの表示（.v8-cpu__card）と同じ幅にそろえます。
     読ませるための表示なので、小さいと意味がありません。 */
  REVEAL_W: 300,

  /* ★中央へ伸びる光の速さ（2026-08-01）。
     ふつうの光の 62% の時間で伸び切ります。
     ★さらに、伸び切る前にカードが出ます（TRAVEL の 70% の時点）。
       光が消えてからカードが出ると、待たされたように感じます。 */
  CENTER_TRAVEL: 0.62,
  REVEAL_AT: 0.7,

  /* 中央で見せている束（陣営ごと） */
  _stacks: {},

  /**
   * @return {number|false} 落ち終わるまでのミリ秒。引き受けられなければ false
   */
  _flyViaCenter: function (spec) {
    const start = this.point(spec.from);
    const mid = this.point({ zone: 'center', side: spec.from && spec.from.side });
    const goal = this.point(spec.to);
    if (!start || !mid || !goal) return false;

    const u = this.unit();
    const base = Math.max(1, spec.duration || this.DUR);
    /* 光が伸び切るまで／カードが出るまで */
    const travel = Math.max(1, Math.round(base * this.CENTER_TRAVEL));
    const showAt = Math.max(1, Math.round(travel * this.REVEAL_AT));
    const hold = Math.round(this.REVEAL_HOLD * (spec.speed || 1));
    const d2 = Math.round(this.REVEAL_DROP * (spec.speed || 1));

    /* 1. 光が中央まで伸びる。
          ★山札からは真横なので、ふくらませません（arcControl に
            登録が無い種類は、まっすぐ進みます）。
            手札からは、札の上を通るように少し持ち上げます。 */
    const straight = (spec.kind === 'deckTrash');
    const kind1 = straight ? 'deckCenter' : 'handCenter';

    const el = document.createElement('div');
    el.className = 'v8-fx__light v8-fx__light--warm';
    el.style.width = (this.W * u) + 'px';
    el.style.left = start.x + 'px';
    el.style.top = start.y + 'px';
    /* 手札から出ていく光だけ、拡大手札より手前を通します */
    (straight ? this._low : this._top).appendChild(el);

    const entry = { el: el, kind: kind1, goal: mid, to: null,
      endAt: this._now() + travel, anim: null };
    this._flying.push(entry);
    this._animate(entry, start, mid, travel, 'ease-out');

    const self = this;
    const side = (spec.from && spec.from.side) || null;

    /* 2. ★光が伸び切る前に、もうカードが出ています。
          光が消えてからカードが出ると、間があいて待たされたように
          感じます。重ねてしまうほうが速く見えます。 */
    setTimeout(function () {
      self._pushToStack(side, spec.card, mid, goal, hold, d2);
    }, showAt);

    /* 3. 光は、伸び切ったところで消えます（カードの後ろで消えます） */
    setTimeout(function () {
      el.remove();
      self._flying = self._flying.filter(function (f) { return f !== entry; });
    }, travel);

    /* ★見せる時間は「カードが出てから」数えます */
    return showAt + hold + d2;
  },

  /** 中央の束へ1枚加える。最後の1枚が着いてから、まとめて落とす */
  _pushToStack: function (side, card, mid, goal, hold, d2) {
    if (!this._root || !this._top) return;
    const key = String(side);
    let st = this._stacks[key];

    if (!st) {
      const wrap = document.createElement('div');
      wrap.className = 'v8-fx__reveal';
      this._top.appendChild(wrap);
      st = this._stacks[key] = { wrap: wrap, cards: [], timer: null, goal: goal, d2: d2 };
    }
    st.goal = goal;
    st.d2 = d2;

    const u = this.unit();
    const el = (typeof V8Board !== 'undefined')
      ? V8Board.makeCard(document, card) : document.createElement('div');
    el.className = (el.className || '') + ' v8-fx__reveal-card';
    el.disabled = true;

    /* ★重ねて並べます。少しずつずらすので、枚数が目で分かります。 */
    const i = st.cards.length;
    const shift = this.REVEAL_SHIFT * u;
    if (typeof V8Board !== 'undefined') V8Board.setCardWidth(el, (this.REVEAL_W * u) + 'px');
    else el.style.width = (this.REVEAL_W * u) + 'px';
    el.style.left = (mid.x + shift * i) + 'px';
    el.style.top = (mid.y + shift * i) + 'px';
    el.style.zIndex = String(10 + i);
    st.wrap.appendChild(el);
    st.cards.push(el);

    /* 後から着いた1枚があれば、そのぶん見せる時間を延ばします */
    if (st.timer) clearTimeout(st.timer);
    const self = this;
    st.timer = setTimeout(function () { self._dropStack(key); }, hold);
  },

  /** 中央の束を、まとめてトラッシュへ落とす */
  _dropStack: function (key) {
    const st = this._stacks[key];
    if (!st) return;
    delete this._stacks[key];
    if (st.timer) clearTimeout(st.timer);

    const self = this;
    const u = this.unit();

    st.cards.forEach(function (card) {
      const here = self.centerOf(card);
      card.remove();
      if (!here || !st.goal) return;

      const light = document.createElement('div');
      light.className = 'v8-fx__light v8-fx__light--warm';
      light.style.width = (self.W * u) + 'px';
      light.style.left = here.x + 'px';
      light.style.top = here.y + 'px';
      self._low.appendChild(light);

      const e = { el: light, kind: 'dropToTrash', goal: st.goal, to: null,
        endAt: self._now() + st.d2, anim: null };
      self._flying.push(e);
      self._animate(e, here, st.goal, st.d2, 'ease-in');
      setTimeout(function () {
        light.remove();
        self._flying = self._flying.filter(function (f) { return f !== e; });
      }, st.d2 + 400);
    });

    if (st.wrap) st.wrap.remove();
  },

  /** 中央で見せている束を、すべて片づける */
  _clearStacks: function () {
    const self = this;
    Object.keys(this._stacks).forEach(function (key) {
      const st = self._stacks[key];
      if (st.timer) clearTimeout(st.timer);
      if (st.wrap) st.wrap.remove();
      delete self._stacks[key];
    });
  },

  /* =============================================================
     ★暗転（2026-08-01）
     -------------------------------------------------------------
     対戦開始を押してから盤面が出るまで、いったん黒く落とします。

     ★この幕は画面そのものに掛けます（対戦の盤面の中ではありません）。
       準備画面から盤面へ入れ替わるところを覆うのが役目なので、
       盤面の中に置くと、まだ出ていない時に掛けられません。
     ============================================================= */

  FADE_DOWN: 420,   // 黒くなるまで
  FADE_UP: 620,     // 黒が晴れるまで

  _curtain: null,

  _makeCurtain: function () {
    if (this._curtain && this._curtain.isConnected) return this._curtain;
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'v8-curtain';
    document.body.appendChild(el);
    this._curtain = el;
    return el;
  },

  /** 黒く落とす。落ちきってから done を呼びます */
  curtainDown: function (done) {
    const el = this._makeCurtain();
    const go = done || function () {};
    if (!el) { go(); return; }
    el.style.opacity = '1';
    if (!el.animate) { setTimeout(go, 10); return; }
    const a = el.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: this.FADE_DOWN, easing: 'ease-in' });
    let called = false;
    const once = function () { if (called) return; called = true; go(); };
    a.onfinish = once;
    setTimeout(once, this.FADE_DOWN + 200);   // 動かせない環境の保険
  },

  /** 黒を晴らす。晴れきってから done を呼びます */
  curtainUp: function (done) {
    const el = this._curtain;
    const go = done || function () {};
    const self = this;
    if (!el || !el.isConnected) { go(); return; }
    const drop = function () {
      el.remove();
      if (self._curtain === el) self._curtain = null;
    };
    if (!el.animate) { drop(); go(); return; }
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: this.FADE_UP, easing: 'ease-out' });
    let called = false;
    const once = function () { if (called) return; called = true; drop(); go(); };
    a.onfinish = once;
    setTimeout(once, this.FADE_UP + 200);
  },

  /* =============================================================
     ★盤面のカードが動くところを見せる（2026-08-01）
     -------------------------------------------------------------
     追跡フェイズに入ると、追跡する2枚が前へ出ます。
     ★これまでは、その瞬間にぱっと入れ替わっていました。
       どのカードが前に出たのか、見ていて分かりません。

     カードは描き直すたびに作り直されるので、CSS の
     「位置が動くときの滑らかさ」は効きません。
     そこで、描く前の位置を控えておき、描いたあとに
     「元の位置から今の位置へ」動かし直します。

     追跡フェイズだけの仕掛けにはしていません。
     盤面のカードが動く場面はどれも同じように滑らかになります。
     ============================================================= */

  MOVE_MS: 320,
  _prev: null,

  /** 描く前に、盤面のカードがどこにあったかを控える */
  captureBoard: function () {
    this._prev = null;
    if (!this._root || this.reduced()) return;
    const base = this._root.getBoundingClientRect();
    const cards = this._root.querySelectorAll('.v8-board .v8-card[data-uid]');
    if (!cards.length) return;
    const prev = {};
    Array.prototype.forEach.call(cards, function (el) {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      prev[el.getAttribute('data-uid')] = {
        cx: r.left - base.left + r.width / 2,
        cy: r.top - base.top + r.height / 2,
        w: r.width,
      };
    });
    this._prev = prev;
  },

  /**
   * 描いたあとに、元の位置から動かし直す。
   * @return {boolean} 1枚でも動かしたか
   */
  flipBoard: function () {
    const prev = this._prev;
    this._prev = null;
    if (!prev || !this._root) return false;

    const base = this._root.getBoundingClientRect();
    const cards = this._root.querySelectorAll('.v8-board .v8-card[data-uid]');
    const tilt = this._tilt();
    const dur = this.MOVE_MS;
    let moved = false;

    Array.prototype.forEach.call(cards, function (el) {
      const p = prev[el.getAttribute('data-uid')];
      if (!p || !el.animate) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;

      const dx = p.cx - (r.left - base.left + r.width / 2);
      const dy = p.cy - (r.top - base.top + r.height / 2);
      const sc = p.w / r.width;
      /* ほとんど動いていないなら、何もしません（毎回揺れて見えます） */
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(sc - 1) < 0.02) return;

      moved = true;
      el.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc.toFixed(3) +
                     ') rotateX(' + tilt + ')' },
        { transform: 'translate(0px,0px) scale(1) rotateX(' + tilt + ')' },
      ], { duration: dur, easing: 'cubic-bezier(0.25, 0.85, 0.3, 1)' });
    });

    /* ★動かし終わってから、追跡の矢印を引き直します。
       動いているあいだに引くと、動く前の場所に引かれます。 */
    if (moved) {
      const self = this;
      if (this._arrowTimer) clearTimeout(this._arrowTimer);
      this._arrowTimer = setTimeout(function () {
        self._arrowTimer = null;
        self.renderArrows();
      }, dur + 20);
    }
    return moved;
  },

  /** 動かしているあいだ、矢印は出しません（ずれた場所に出るため） */
  hideArrows: function () {
    if (!this._root) return;
    const svg = this._root.querySelector('#v8-fx-arrows');
    if (svg) svg.innerHTML = '';
    this._arrowAnims = [null, null];
  },

  _arrowTimer: null,

  /* =============================================================
     ★確定した追跡の矢印（Stage 6-6・総合仕様書 21.1〜21.2）
     -------------------------------------------------------------
     怪異から人間へ、山形の模様がゆっくり流れ続けます。
     カードより後ろに置くので、操作の邪魔にはなりません。

     ★Stage 3-1 の積み残しでした。あのときは仮追跡の細い矢印だけを
       作り、確定したあとの「従来のコンベア式」がありませんでした。

     ★描き直しても流れが途切れないよう、進み具合を控えて引き継ぎます。
       ここを忘れると、盤面が変わるたびに山形が飛んで見えます。
     ============================================================= */

  SVG_NS: 'http://www.w3.org/2000/svg',
  CONVEYOR_MS: 2200,         // 山形1つぶん流れるのにかかる時間
  CONVEYOR_ATTACK_MS: 380,   // 襲撃中の速さ

  /* 山形の形（1080基準の設計px）。既存と同じ値です。 */
  CHEV: { halfW: 20, depth: 16, step: 44 },

  _arrowAnims: [null, null],
  _arrowPhase: [0, 0],
  _attackSide: null,

  /** 襲撃中の陣営を知らせる（描き直さずに速さと太さだけ変える） */
  setAttackSide: function (side) {
    this._attackSide = (side === undefined) ? null : side;
    this.applyArrowAttack();
  },

  /** 追跡している2組ぶんの矢印を描く（21.5） */
  renderArrows: function () {
    if (!this._root) return;
    const svg = this._root.querySelector('#v8-fx-arrows');
    if (!svg) return;

    /* 描き直す前に、いまの進み具合を控えておく */
    const self = this;
    this._arrowAnims.forEach(function (anim, i) {
      if (anim && typeof anim.currentTime === 'number') self._arrowPhase[i] = anim.currentTime;
    });
    this._arrowAnims = [null, null];
    svg.innerHTML = '';

    const bottom = (typeof V8State !== 'undefined') ? V8State.bottomSide() : 'village';
    const top = (typeof V8State !== 'undefined') ? V8State.topSide() : 'mansion';

    const pairs = [
      /* 自分の怪異 → 相手の人間 */
      { from: '#v8-area-self-youkai .v8-card[data-role="track"]',
        to: '#v8-area-opp-human .v8-card[data-role="track"]', side: bottom },
      /* 相手の怪異 → 自分の人間 */
      { from: '#v8-area-opp-youkai .v8-card[data-role="track"]',
        to: '#v8-area-self-human .v8-card[data-role="track"]', side: top },
    ];

    pairs.forEach(function (pair, i) {
      const a = self._root.querySelector(pair.from);
      const b = self._root.querySelector(pair.to);
      if (a && b) self._drawConveyor(svg, a, b, i, pair.side);
    });

    this.applyArrowAttack();
  },

  _drawConveyor: function (svg, fromEl, toEl, index, side) {
    const a = this.centerOf(fromEl);
    const b = this.centerOf(toEl);
    if (!a || !b) return;

    const ra = fromEl.getBoundingClientRect();
    const rb = toEl.getBoundingClientRect();
    const u = this.unit();
    const halfW = this.CHEV.halfW * u;
    const depth = this.CHEV.depth * u;
    const STEP = this.CHEV.step * u;

    /* 2枚の中心を結ぶ縦線として描きます（既存と同じ考え方） */
    const x = Math.round((a.x + b.x) / 2);
    const goingUp = b.y < a.y;
    const y1 = goingUp ? (a.y - ra.height / 2) : (a.y + ra.height / 2);
    const y2 = goingUp ? (b.y + rb.height / 2) : (b.y - rb.height / 2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    if (bottom - top < 20 * u) return;

    const NS = this.SVG_NS;
    const clipId = 'v8-arrow-clip-' + index;

    const defs = document.createElementNS(NS, 'defs');
    const clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const rect = document.createElementNS(NS, 'rect');
    /* 襲撃中は山形が横へ広がるので、切り抜き枠にも余白を見込みます */
    rect.setAttribute('x', x - halfW - 26 * u);
    rect.setAttribute('y', top);
    rect.setAttribute('width', (halfW + 26 * u) * 2);
    rect.setAttribute('height', bottom - top);
    clip.appendChild(rect);
    defs.appendChild(clip);
    svg.appendChild(defs);

    const clipped = document.createElementNS(NS, 'g');
    clipped.setAttribute('clip-path', 'url(#' + clipId + ')');
    clipped.setAttribute('data-side', side || '');

    const flow = document.createElementNS(NS, 'g');
    flow.setAttribute('class', 'v8-conveyor');

    /* 上下に1つぶん多く描いておくと、繰り返しの継ぎ目が見えません */
    for (let y = top - STEP; y <= bottom + STEP; y += STEP) {
      const path = document.createElementNS(NS, 'path');
      const dy = goingUp ? depth : -depth;
      path.setAttribute('d',
        'M ' + (x - halfW) + ' ' + (y + dy) + ' L ' + x + ' ' + y +
        ' L ' + (x + halfW) + ' ' + (y + dy));
      /* ★太さは CSS が --u で決めます。ここで属性に入れると、
         襲撃中に太くする指定（CSS）が効かなくなります。 */
      path.setAttribute('class', 'v8-chevron');
      flow.appendChild(path);
    }

    clipped.appendChild(flow);
    svg.appendChild(clipped);

    /* 流れる動き。進み具合を引き継ぐので、描き直しても継ぎ目が見えません。
       ★「動きを減らす」ときは、止まった山形だけを見せます
         （誰が誰を追跡しているかは、動かなくても分かる情報なので消しません）。 */
    if (flow.animate && !this.reduced()) {
      const shift = goingUp ? -STEP : STEP;
      const anim = flow.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(' + shift + 'px)' }],
        { duration: this.CONVEYOR_MS, iterations: Infinity, easing: 'linear' }
      );
      anim.currentTime = this._arrowPhase[index] || 0;
      this._arrowAnims[index] = anim;
    }
  },

  /**
   * 襲撃の見た目を、描き直さずに切り替える（21.4）。
   * 山形は CSS の transition で広がり、流れは再生速度だけを変えるので、
   * 位置が飛んだりカクついたりしません。
   */
  applyArrowAttack: function () {
    if (!this._root) return;
    const svg = this._root.querySelector('#v8-fx-arrows');
    if (!svg) return;
    const self = this;

    const sides = (typeof V8State !== 'undefined')
      ? [V8State.bottomSide(), V8State.topSide()] : ['village', 'mansion'];

    sides.forEach(function (side, i) {
      const anim = self._arrowAnims[i];
      if (!anim) return;
      anim.playbackRate = (self._attackSide !== null && self._attackSide === side)
        ? (self.CONVEYOR_MS / self.CONVEYOR_ATTACK_MS) : 1;
    });

    /* 矢印が1本だけのこともあるので、要素に持たせた陣営で判断します */
    const groups = svg.querySelectorAll('g[data-side]');
    Array.prototype.forEach.call(groups, function (g) {
      const on = (self._attackSide !== null && self._attackSide === g.getAttribute('data-side'));
      const paths = g.querySelectorAll('.v8-chevron');
      Array.prototype.forEach.call(paths, function (p) {
        p.classList.toggle('v8-chevron--attack', on);
      });
    });
  },

  /* =============================================================
     新しく手札に加わったカードを、光とともに浮かび上がらせる
     -------------------------------------------------------------
     ★光が着く瞬間には、もう見えている状態から始めます。
       透明から始めると、光が消えたあとに手札が現れて見えます（v0.6.9）。
     ============================================================= */
  flashHand: function (uid) {
    if (!this._root || uid == null) return false;
    const el = this._root.querySelector('.v8-hand__card[data-uid="' + uid + '"]');
    if (!el || !el.animate) return false;
    el.animate([
      { opacity: 0.55, filter: 'brightness(2.4) drop-shadow(0 0 26px rgba(190, 230, 255, 0.95))' },
      { opacity: 1, filter: 'brightness(1.5) drop-shadow(0 0 16px rgba(190, 230, 255, 0.7))', offset: 0.35 },
      { opacity: 1, filter: 'brightness(1) drop-shadow(0 0 0 rgba(0, 0, 0, 0))' },
    ], { duration: 180, easing: 'ease-out' });
    return true;
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = V8Fx;
