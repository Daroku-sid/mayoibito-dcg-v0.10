/* =====================================================================
   v08-hand.js ― 手札と入力（Stage 2-2）
   ---------------------------------------------------------------------
   仕様書 第5部。

   V8Input … タップ／長押し／ドラッグの判定
   V8Hand  … 縮小手札と拡大手札、ドラッグして出す操作

   ★「なぞって選ぶ」は入れません（ダロクの指示で廃止）。
     v0.2 で試しに入れた機能でしたが使われず、操作が分かりにくくなる
     だけでした。おかげで判定は「動かなければタップ／閾値を超えたら
     ドラッグ」の一本道になり、仕様書 5.3 の3つ（短いタップ・長押し・
     ドラッグ）とぴったり一致します。

   ★ゲーム状態は触りません。操作は必ず V8Cmd（コマンド層）を通します。
   ===================================================================== */

'use strict';

/* =====================================================================
   入力の判定
   ===================================================================== */
const V8Input = {

  /* 付録C の実機調整項目。埋め込まず定数にしておく */
  LONG_PRESS_MS: 500,    // 長押しと判定するまでの時間
  DRAG_THRESHOLD: 10,    // ドラッグ開始とみなす移動距離（画面px）

  /**
   * 要素に入力をつなぐ。
   * @param {Element} el
   * @param {{onTap:Function, onLongPress:Function,
   *          onDragStart:Function, onDragMove:Function, onDragEnd:Function}} h
   */
  attach: function (el, h) {
    if (!el) return;
    const self = this;
    let start = null;      // { x, y, id }
    let mode = '';         // '' / 'drag' / 'long'
    let timer = null;

    const clearTimer = function () {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    };

    const finish = function (e, cancelled) {
      if (mode === 'drag' && h.onDragEnd) h.onDragEnd(e, cancelled);
      else if (mode === '' && !cancelled && h.onTap) h.onTap(e);
      clearTimer();
      start = null;
      mode = '';
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    };

    el.addEventListener('pointerdown', function (e) {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      mode = '';
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      clearTimer();
      timer = setTimeout(function () {
        if (mode !== '') return;
        mode = 'long';
        if (h.onLongPress) h.onLongPress(e);
      }, self.LONG_PRESS_MS);
      /* 画像のドラッグや文字選択、長押しメニューを止める（23.3） */
      e.preventDefault();
    });

    el.addEventListener('pointermove', function (e) {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (mode === '') {
        if (Math.hypot(dx, dy) < self.DRAG_THRESHOLD) return;
        /* ★ここで横なぞりとの分岐はしません（なぞって選ぶは廃止）。
           閾値を超えたら、向きに関わらずドラッグです。 */
        clearTimer();
        mode = 'drag';
        if (h.onDragStart) h.onDragStart(e);
      }
      if (mode === 'drag' && h.onDragMove) h.onDragMove(e, dx, dy);
    });

    el.addEventListener('pointerup', function (e) { if (start) finish(e, false); });
    el.addEventListener('pointercancel', function (e) {
      /* 指が外れたら仮のドラッグは解除する（23.3） */
      if (start) finish(e, true);
    });
  },
};

/* =====================================================================
   手札
   ===================================================================== */
const V8Hand = {

  /** 拡大しているか。★プレイヤーが自分で閉じるまで保つ（5.5） */
  expanded: false,

  /** いまドラッグしているカード */
  _drag: null,

  /** 直近に描いた手札（V8State.cardOf の配列） */
  _cards: [],

  _root: null,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;

    /* 縮小手札の帯をタップすると拡大へ（5.1） */
    const mini = rootEl.querySelector('#v8-self-hand');
    if (mini) {
      mini.addEventListener('click', function () { self.toggle(); });
    }
    /* ★余白タップで閉じる仕組みは、画面を覆う板では作りません。
       板で覆うと、その板が盤面カードのタップを奪ってしまいます。
       代わりに、画面全体の入力を「見るだけ」で受けて、
       触れた先が何かによって振り分けます。

         手札のカード      → 手札の操作（閉じない）
         盤面カードやボタン → そのまま通す（閉じない）
         それ以外の余白    → 閉じる

       何も覆っていないので、拡大手札を開いたまま盤面カードを
       タップできます。 */
    return this;
  },

  /**
   * ★開いたままに固定するか（2026-08-01）。
   * マリガンの配りから交換までのあいだ、手札を大きいままにします。
   * 出入りする札を見せるための場面なので、閉じられると困ります。
   */
  pinned: false,

  toggle: function () {
    if (this.pinned) return;
    this.expanded ? this.collapse() : this.expand();
  },

  expand: function () {
    this.expanded = true;
    this._apply();
    this._watchOutside(true);
  },

  collapse: function () {
    if (this.pinned) return;      // 固定中は閉じません
    this.expanded = false;
    this._apply();
    this._watchOutside(false);
  },

  /** 固定を解いて閉じる（マリガンが終わったとき） */
  unpin: function () {
    this.pinned = false;
    this.collapse();
  },

  /* =============================================================
     ★開いているあいだ、画面全体の入力を「見るだけ」で受ける
     -------------------------------------------------------------
     板で覆わないので、盤面カードのタップは今までどおり通ります。
     余白（押せるものが何も無い場所）を触ったときだけ閉じます。
     ============================================================= */
  INTERACTIVE: '.v8-card, .v8-btn, .v8-hand__slots, .v8-counts, .v8-field,' +
    ' .v8-deck, .v8-vigor, button, a, input, select, textarea',

  /* ★上に重なる画面（2026-08-01）。
     ログ・一覧・詳細・設定・確認・マリガン・リザルトです。

     これらは自分で「外を触ったら閉じる」を持っています。
     ★暗転の幕（ただの div）はボタンでも盤面カードでもないので、
       ここに書いておかないと「余白」と見なされ、
       ログを閉じただけなのに手札まで畳まれていました。 */
  OVERLAYS: '.v8-log-wrap, .v8-zone-wrap, .v8-detail, .v8-confirm,' +
    ' .v8-mull, .v8-result, .v8-quick, .v8-set, .v8-sheet',

  _outside: null,

  _watchOutside: function (on) {
    if (typeof document === 'undefined') return;
    const self = this;

    if (on) {
      if (this._outside) return;
      this._outside = function (e) {
        if (!self.expanded) return;
        /* ★クイック表示が開いているときは、そちらが最初の入力を
           受け取って閉じます（8.3）。ここでは何もしません。 */
        if (typeof V8Quick !== 'undefined' && V8Quick.isOpen()) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('.v8-hand__card')) return;   // 手札の操作
        /* ★上に重なる画面の中は、そちらに任せます。
           ここで一緒に閉じると、ログを閉じただけで手札も畳まれます。 */
        if (t.closest(self.OVERLAYS)) return;
        if (t.closest(self.INTERACTIVE)) return;   // 盤面カード・ボタン → そのまま通す
        self.collapse();                            // 余白 → 閉じる
      };
      /* capture で受けるのは「盤面カードより先に判断する」ためだけで、
         止めも書き換えもしません（そのまま先へ流します）。 */
      document.addEventListener('pointerdown', this._outside, true);
      return;
    }

    if (this._outside) {
      document.removeEventListener('pointerdown', this._outside, true);
      this._outside = null;
    }
  },

  _apply: function () {
    if (!this._root) return;
    this._root.classList.toggle('v8-hand-open', this.expanded);
  },

  /* =============================================================
     手札を描く
     -------------------------------------------------------------
     @param {Array} cards  自分の手札（V8State.cardOf の形）
     ============================================================= */
  render: function (doc, cards) {
    if (!this._root) return;
    this._cards = cards || [];

    /* --- 縮小手札：小さな札を並べる（枚数と存在を示す・5.1） --- */
    const mini = this._root.querySelector('#v8-self-hand');
    if (mini) {
      mini.innerHTML = '';
      const pos = V8Board.handBackPositions(
        this._cards.length, V8Board.HAND_SLOT_W, V8Board.HAND_BACK_W);
      const self = this;
      pos.forEach(function (x, i) {
        const c = self._cards[i];
        const el = doc.createElement('span');
        el.className = 'v8-hand__mini';
        el.style.left = V8Board.u(x);
        el.style.width = V8Board.u(V8Board.HAND_BACK_W);
        const path = (typeof getCardImagePath === 'function' && c)
          ? getCardImagePath(c.cardId, c.side) : '';
        if (typeof V8Images !== 'undefined') V8Images.apply(el, path);
        else if (path) el.style.backgroundImage = 'url("' + path + '")';
        mini.appendChild(el);
      });
    }

    /* --- 拡大手札：大きく並べる（5.2） --- */
    const big = this._root.querySelector('#v8-hand-big');
    if (!big) return;
    big.innerHTML = '';

    const n = this._cards.length;
    if (n === 0) return;

    const lay = this.bigLayout(n);

    const self = this;
    this._cards.forEach(function (c, i) {
      const el = V8Board.makeCard(doc, c);
      el.classList.add('v8-hand__card');
      el.style.left = V8Board.u(lay.left0 + lay.step * i);
      el.style.top = V8Board.u(lay.top);
      V8Board.setCardWidth(el, V8Board.u(lay.cw));
      el.style.zIndex = String(10 + i);
      el.setAttribute('data-uid', c.uid || '');
      el.setAttribute('data-base-z', String(10 + i));

      /* ★いま出せるカードだけフチを光らせる（3.5：有効対象は明るく）。
         出せないカードを暗くするのはやめました（見づらいだけでした）。 */
      const judge = (typeof V8Cmd !== 'undefined')
        ? V8Cmd.canPlay(c, V8Cmd.destOf(self._masterOf(c)), null) : { ok: false };
      if (judge.ok) el.classList.add('v8-card--playable');

      self._bind(el, c);
      big.appendChild(el);
    });

    /* ★描き直すとカードは作り直されるので、選んでいる札の
       見せ方（持ち上げ・手前・押しのけ）をあて直します。 */
    this._applySelection();
  },

  _masterOf: function (c) {
    return (typeof CARD_MASTER !== 'undefined' && c) ? CARD_MASTER[c.cardId] : null;
  },

  /* =============================================================
     1枚ぶんの入力
     ============================================================= */
  _bind: function (el, card) {
    const self = this;
    V8Input.attach(el, {
      onTap: function () {
        /* 短いタップはカードの確認だけ。★使用は始めない（5.3） */
        self._select(card);
      },
      onLongPress: function () {
        /* 固定式カード詳細は 2-3 で作ります */
        if (typeof V8Battle !== 'undefined' && V8Battle.onCardLongPress) {
          V8Battle.onCardLongPress(card);
        }
      },
      onDragStart: function () { self._dragStart(el, card); },
      onDragMove: function (e) { self._dragMove(e); },
      onDragEnd: function (e, cancelled) { self._dragEnd(e, cancelled); },
    });
  },

  /* =============================================================
     ★選んだ札を見やすくする（5.3）
     -------------------------------------------------------------
     選んだ1枚を持ち上げ、フチを光らせ、いちばん手前へ出します。
     ★もう一度押せば選択を解きます。
     ★両どなりの札は、左右へ押しのけます。

     押しのけるのは、見た目のためだけではありません。
     選んだ札はいちばん手前に出るので、そのままだと
     ★両どなりの札が完全に隠れて、押せなくなります
       （幅230・間隔106のとき、右どなりは1ドットも見えません）。

     ★uid は文字と数のどちらでも来ます。
       そのまま比べると（'12' と 12）いつも別物になり、
       選んでも何も起きません。文字にそろえてから比べます。

     ★手前へ出すのは JS でやります。並べるときに z を
       じかに入れているので、CSS の指定では勝てません。
     ============================================================= */

  /** いま選んでいる札の uid（文字）。選んでいなければ null */
  _selected: null,

  /* ★両どなりに残したい「押せる幅」。
     1080基準で100 ＝ およそ35px です。
     ★はじめは 125（44px）にしていましたが、押しのけが強すぎたので
       下げました（作者の指摘）。押せる幅は確保しつつ、
       手札全体が大きく動かない量にしています。 */
  NEIGHBOR_TAP: 100,
  /* ★間隔が狭いとき、外側だけを余分に動かす量の上限 */
  PUSH_EXTRA_MAX: 24,
  /* ★押しのけた札が出てよい範囲（1080基準）。
     ここを外すと、端の札が画面の外へ出てしまいます。

     ★手札上限は10枚です（game.js の HAND_LIMIT）。
       それ以上は増えないので、10枚のときに両どなりが
       押せる幅を確保できるところまで広げてあります。
       押しのけているあいだ、いちばん外の札は大きく欠けますが、
       もう一度押せば選択は解けるので、すぐ元に戻せます。 */
  PUSH_LIMIT_L: -140,
  PUSH_LIMIT_R: 1320,

  _select: function (card) {
    if (!this._root || !card) return;
    const key = String(card.uid);
    /* ★同じ札をもう一度押したら、選択を解きます */
    this._selected = (this._selected === key) ? null : key;
    this._applySelection();

    /* ★選んだ札の内容も一緒に出します（2026-08-01）。
       持ち上げても、重なっていれば下の方は隠れたままです。
       盤面のカードを短く押したときと同じ出し方にそろえます。 */
    if (typeof V8Quick !== 'undefined') {
      if (this._selected) V8Quick.open(card.uid);
      else V8Quick.close();
    }
  },

  /** 選択を解く（描き直しや、対戦が進んだとき） */
  clearSelection: function () {
    this._selected = null;
    this._applySelection();
  },

  /**
   * 選んでいる札の見せ方を、いまの並びへあてる。
   * ★描き直すとカードが作り直されるので、描いたあとに必ず呼びます。
   */
  _applySelection: function () {
    if (!this._root) return;
    const list = this._root.querySelectorAll('.v8-hand__card');
    const n = list.length;
    if (!n) return;

    const key = this._selected;
    let at = -1;
    Array.prototype.forEach.call(list, function (el, i) {
      if (key !== null && String(el.getAttribute('data-uid')) === key) at = i;
    });
    /* 手札から出ていった札は、もう選べません */
    if (at === -1) this._selected = null;

    const lay = this.bigLayout(n);

    /* =========================================================
       ★押しのける量
       ---------------------------------------------------------
       両どなりが見えている幅は、
         「選んだ札の右端」から「その外の札の左端」まで
       です。外側をまとめて P だけ動かすと、

         見える幅 ＝ 2×間隔 ＋ P − カード幅

       になります。ここから、欲しい幅にするための P を出します。

       ★「選んだ札から完全に離す」ところまでは動かしません。
         必要なのは押せる幅であって、離すことではないからです。
         離しきろうとすると、端の札が画面の外へ大きく出ます。
       ========================================================= */
    let push = 0;
    let extra = 0;
    if (at !== -1 && lay.step > 0) {
      push = Math.max(0, this.NEIGHBOR_TAP + lay.cw - 2 * lay.step);

      /* ★選んだ札から完全に離れたら、そこで頭打ちです。
         それ以上動かしても、外の札に隠れる分は変わりません
         （見える幅は間隔どまりになります）。無駄に広がるだけです。 */
      push = Math.min(push, Math.max(0, lay.cw - lay.step));

      /* ★間隔そのものが狭いときは、外側だけをさらに動かします。
         両どなりが見えている幅は、その外の札に隠れる分で決まるからです。
         ★上限あり。外し過ぎると端の札が画面から出ます。 */
      extra = Math.min(this.PUSH_EXTRA_MAX,
        Math.max(0, this.NEIGHBOR_TAP - lay.step));

      /* ★出てよい範囲に収まるところまでで止めます。
         左右で同じだけ動かすので、狭いほうに合わせます。 */
      const baseR = lay.left0 + lay.cw + lay.step * (n - 1);
      const room = Math.max(0,
        Math.min(lay.left0 - this.PUSH_LIMIT_L, this.PUSH_LIMIT_R - baseR));
      if (push + extra > room) {
        push = Math.min(push, room);
        extra = Math.max(0, room - push);
      }
    }

    const moveOf = function (i) {
      if (at === -1 || i === at) return 0;
      const far = (Math.abs(i - at) >= 2) ? extra : 0;
      return (i < at) ? -(push + far) : (push + far);
    };

    /* ★選んだ札そのものは、必ず全部が画面に入るようにします。
       端の札を選んだとき、そこが欠けていては選んだ意味がありません。 */
    let shift = 0;
    if (at !== -1) {
      const selL = lay.left0 + lay.step * at;
      if (selL < 0) shift = -selL;
      else if (selL + lay.cw > 1080) shift = 1080 - (selL + lay.cw);
    }

    Array.prototype.forEach.call(list, function (el, i) {
      const on = (i === at);
      el.classList.toggle('v8-card--selected', on);
      el.style.zIndex = on ? '120' : (el.getAttribute('data-base-z') || '10');
      el.style.setProperty('--v8-push', V8Board.u(moveOf(i) + shift));
    });
  },

  /* =============================================================
     ドラッグして出す（5.4）
     ============================================================= */
  _dragStart: function (el, card) {
    /* ★対象を選んでいる最中は、別のカードを運び始めません。
       運べてしまうと、選んでいる途中の状態が置き去りになります。 */
    if (typeof V8Target !== 'undefined' && V8Target.active) return;

    const master = this._masterOf(card);
    const dest = (typeof V8Cmd !== 'undefined') ? V8Cmd.destOf(master) : null;

    /* ★動かす前の中心を1回だけ控える。
       ここを毎回 getBoundingClientRect で測り直すと、
       「動かした後の位置」を基準にまた動かすことになり、
       指の下でカードが細かく震えます（実機で発生）。 */
    const r = el.getBoundingClientRect();
    this._drag = {
      el: el, card: card, dest: dest,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
    el.classList.add('v8-hand__card--dragging');

    /* 置ける場所を明るくする（5.4） */
    if (this._root) {
      this._root.classList.add('v8-dragging');
      this._root.setAttribute('data-drag-dest', dest || '');
    }
  },

  _dragMove: function (e) {
    const d = this._drag;
    if (!d) return;
    /* 控えておいた「動かす前の中心」から、指までの差だけを当てる。
       毎回この式なので、当てる値は常に絶対量になり、揺れません。 */
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    d.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)';
  },

  _dragEnd: function (e, cancelled) {
    const d = this._drag;
    if (!d) { this._endDragVisuals(null); return; }

    /* ★★ 置き先を「片づける前」に調べます。
       ここが今回いちばんの原因でした。

       以前はこの関数の先頭で
         this._drag = null;
         this._root.classList.remove('v8-dragging');
       をしてから置き先を探していました。その瞬間に
         ・置き先の枠は display:none へ戻る（＝四角が 0×0 になる）
         ・どの種類を運んでいたかの情報も消える
       ので、何を運んでも必ず「置き先が見つからない」になり、
       カードは黙って手札へ戻っていました。
       人間・怪異・グッズのすべてが出せなかったのはこのためです。 */
    const drop = cancelled ? null : this._dropAt(e.clientX, e.clientY);
    const wasDragging = !!(this._root && this._root.classList.contains('v8-dragging'));

    /* ここまで来てから片づける */
    this._endDragVisuals(d);

    if (cancelled) return;

    if (!drop) {
      /* 置き先の枠は出ていたのに外した、という場合だけ短く知らせます。 */
      if (wasDragging && typeof V7Toast !== 'undefined') {
        V7Toast.push('ここにはカードを置けません', { dedupe: true });
      }
      return;
    }

    /* =========================================================
       ★グッズは、ここでは使いません（仕様変更 2026-08-01）。
       他のカードと同じように紫の枠へ落とし、そのあとで
       「装備する対象を選択」へ入ります。使用が確定するのは
       対象を確定したときです。
       ========================================================= */
    if (d.dest === 'equip') {
      this._beginEquip(d.card);
      return;
    }

    const res = (typeof V8Cmd !== 'undefined')
      ? V8Cmd.requestPlayCard(d.card, d.dest, drop.uid) : { ok: false, reason: '' };

    if (!res.ok) {
      /* 無効なら手札へ戻し、短く知らせる（5.4）。
         気力・手札・ゲーム状態は変わりません。 */
      if (res.reason && typeof V7Toast !== 'undefined') V7Toast.push(res.reason);
      return;
    }
    /* 成功したら、この時点で使用が確定。描き直しは preview.js の
       renderAll から知らせが来るので、ここでは何もしません（5.4）。 */
  },

  /** ドラッグの見た目と状態を片づける */
  _endDragVisuals: function (d) {
    this._drag = null;
    if (this._root) {
      this._root.classList.remove('v8-dragging');
      this._root.removeAttribute('data-drag-dest');
    }
    if (d && d.el) {
      d.el.classList.remove('v8-hand__card--dragging');
      d.el.style.transform = '';
    }
  },

  /* =============================================================
     ★グッズ：装備する対象を選ぶ（仕様変更 2026-08-01）
     -------------------------------------------------------------
     以前は「盤面のカードそのものへ直接落とす」形でした。
     カードによって落とし方が変わるので覚えることが増え、
     小さな画面では狙いにくくもありました。

     いまは他のカードと同じで、紫の枠まで運べば使えます。
     落としたあとに装備先を選び、確定して初めて使用されます。

     ★確定するまでゲーム状態は何も変わりません。
       途中でやめれば、カードは手札に残ったままです。
     ============================================================= */
  _beginEquip: function (card) {
    if (typeof V8Cmd === 'undefined' || typeof V8Target === 'undefined') return;

    /* ★先に「そもそも使えるか」を見ます（気力が足りない等）。
       選ばせたあとで断ると、選んだ手間が無駄になります。 */
    const judge = V8Cmd.canPlay(card, 'equip', null);
    if (!judge.ok) {
      if (judge.reason && typeof V7Toast !== 'undefined') V7Toast.push(judge.reason);
      return;
    }

    const targets = V8Cmd.goodsTargets(card);
    if (!targets.length) {
      if (typeof V7Toast !== 'undefined') {
        V7Toast.push('このカードを付けられる相手がいません。', { dedupe: true });
      }
      return;
    }

    /* 拡大手札が開いたままだと、選ぶカードが札の裏に隠れます。 */
    this.collapse();

    V8Target.open({
      candidates: targets,
      title: '装備する対象を選択',
      count: 1,
      optional: false,
      cancellable: true,
      /* ★何のための選択かを伝えます（v0.9）。
         チュートリアル中に、台本のどの許可で見るかが変わります。 */
      purpose: 'equip',
      sourceCardId: card.cardId,
    }, function (inst) {
      if (!inst) return;
      const res = V8Cmd.requestPlayCard(card, 'equip', inst.uid);
      if (!res.ok && res.reason && typeof V7Toast !== 'undefined') {
        V7Toast.push(res.reason);
      }
    });
  },

  /* =============================================================
     ★置き先の探し方
     -------------------------------------------------------------
     以前は elementFromPoint で「指の下にある要素」を調べていました。
     しかしこの方法は、重なり順・入力の素通し設定・3Dの傾きなどの
     影響を受けて、置き先が見つからないことがあります。
     実際、紫の枠まで運んでも何も起きない状態になっていました。

     いまは「置き先そのものの四角と、指の位置が重なっているか」を
     直接調べます。重なり順に一切左右されません。
     ============================================================= */
  _dropAt: function (x, y) {
    if (!this._root || typeof document === 'undefined') return null;

    const hit = function (el) {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;   // 出ていないものは対象外
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const dest = this._drag ? this._drag.dest : null;
    if (!dest) return null;

    /* ★置き先は1つだけです（2026-08-01）。人間・怪異・イベント・グッズの
       どれを運んでも同じ枠へ落とします。何をしたことになるかは、
       運んでいるカードの種類（dest）で決まります。 */
    const zone = this._root.querySelector('#v8-drop');
    if (hit(zone)) return { kind: dest, uid: null };
    return null;
  },

  /* 拡大手札の置き場所（1080基準） */
  BIG_AREA_X: 40,
  BIG_AREA_W: 1000,
  BIG_CARD_W: 300,
  /* ★カードの下端を画面の下端（1920）にそろえる。
     高さは幅から 63:88 で出すので、カードの大きさを変えても
     下端に付いたままになります。
     下部の情報が一部隠れますが、仕様書 5.2 で認められています。 */
  BIG_BOTTOM: 1920,
  get BIG_TOP() {
    return this.BIG_BOTTOM - this.BIG_CARD_W * (88 / 63);
  },

  /* =============================================================
     ★手札が多いときの並べ方（2026-08-01）
     -------------------------------------------------------------
     以前は 1000 幅に必ず収めていたので、枚数が増えるほど
     重なりが深くなり、10枚では1枚あたり26%しか見えませんでした。
     何のカードがあるのか読み取れません。

     2つ変えました。

       ★画面の端から少しはみ出してよいことにする
       ★収まらないときは、カードそのものを小さくする

     どちらも上限を決めてあります。はみ出しすぎると端の札が
     読めなくなり、小さくしすぎると数字が読めなくなります。
     ============================================================= */

  /* ★並べてよい範囲（1080基準・v0.9）。
     ★画面の中に必ず収めます。両端に 20 ずつだけ余白を残します。

     以前は画面より広い範囲（-50〜1130）に並べ、はみ出したぶんを
     右へ寄せていました。★右へ 100 はみ出し、右端の札が
     画面の外へ出ていました（作者の指摘）。 */
  SPAN_X: 20,
  SPAN_W: 1040,
  /* カードの幅の下限。これより小さくすると数字が読めません */
  MIN_CARD_W: 190,
  /* ★1枚あたり、最低これだけは見せます（幅に対する割合） */
  MIN_VISIBLE: 0.46,

  /**
   * n枚を並べるときの、カードの幅・間隔・左端・上端を出す。
   * ★マリガンの画面も同じものを使います。並びが違うと、
   *   交換で帰る札の位置がずれて見えます。
   */
  bigLayout: function (n) {
    const ratio = 88 / 63;
    if (!n || n < 1) {
      return { cw: this.BIG_CARD_W, step: 0, left0: this.BIG_AREA_X, top: this.BIG_TOP };
    }

    /* ★1枚のときは、そのままの大きさで真ん中に置きます */
    if (n === 1) {
      return {
        cw: this.BIG_CARD_W,
        step: 0,
        left0: this.SPAN_X + (this.SPAN_W - this.BIG_CARD_W) / 2,
        top: this.BIG_BOTTOM - this.BIG_CARD_W * ratio,
      };
    }

    /* ★1. 「1枚あたり、最低これだけは見せる」を守れる、
          いちばん大きい幅を出します。

       ★枚数が増えるほどカードは小さくなります。
         はみ出させて大きさを保つより、こちらを選びました。
         画面の外へ出た札は、そもそも見えないからです。 */
    let cw = Math.min(this.BIG_CARD_W,
      this.SPAN_W / (1 + this.MIN_VISIBLE * (n - 1)));
    cw = Math.max(cw, this.MIN_CARD_W);

    /* ★2. 間隔は、余りを均等に分けます。
          ★1枚ぶんを超えて離すと、間が空いて見えます。 */
    const step = Math.min(cw * 1.02, (this.SPAN_W - cw) / (n - 1));

    /* ★3. 左右は均等です。
          以前は右へ寄せていましたが、いまは画面の中に収まるので
          寄せる必要がありません。 */
    const total = cw + step * (n - 1);

    return {
      cw: cw,
      step: step,
      left0: this.SPAN_X + (this.SPAN_W - total) / 2,
      /* ★下端はいつも画面の下端。小さくしても下に付いたままです */
      top: this.BIG_BOTTOM - cw * ratio,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Input: V8Input, V8Hand: V8Hand };
}
