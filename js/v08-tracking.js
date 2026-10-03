/* =====================================================================
   v08-tracking.js ― 追跡フェイズ（Stage 3-1）
   ---------------------------------------------------------------------
   仕様書 第6部。

   流れ:
     メインフェイズ
       主操作ボタン … 有効な追跡組が1組以上 → 「メイン終了」
                      0組                  → 「ターン終了」
       押す → 使えるカードが残っていれば警告（5.6）
            → 追跡できるなら追跡フェイズへ／できないならターン終了

     追跡フェイズ（真上視点）
       追跡できる自分の怪異だけ明るい（6.3）
       怪異を相手の人間へドラッグ → 仮追跡（6.4）
         ・元のカードはその場に残す。指へは細い線だけ伸ばす
         ・同じ怪異を別の人間へ／別の怪異で、上書きできる（6.5）
         ・盤面の空き部分をタップすると解除。UI上のタップは空白扱いしない
         ・無効な場所で離しても、いまの仮追跡は残す
       主操作ボタン … 仮追跡なし → 「追跡せずに終了」
                      仮追跡あり → 「追跡を確定」
       どちらも確認パネルを出す（6.9・6.10）。背景タップは効かない。

   ★ゲーム状態は触りません。確定・終了は preview.js の入口へ渡します。
   ===================================================================== */

'use strict';

const V8Track = {

  /** 追跡フェイズに入っているか */
  active: false,

  /** 仮追跡 { youkaiUid, humanUid }。まだ確定していない */
  temp: null,

  /** ドラッグ中 { uid, el, cx, cy, x, y } */
  _drag: null,

  _root: null,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;

    /* 盤面の空き部分をタップすると仮追跡を解除（6.5）。
       山札・トラッシュ・手札・設定・ログなど、押せるものの上は空白ではない。 */
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', function (e) {
        if (!self.active || !self.temp) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest(V8Hand.INTERACTIVE)) return;   // UI の上は空白扱いしない
        if (t.closest('.v8-confirm')) return;
        self.clearTemp();
      }, true);
    }
    return this;
  },

  /* =============================================================
     主操作ボタンの文字（4.6）
     ============================================================= */
  mainLabel: function () {
    if (this.active) return this.temp ? '追跡を確定' : '追跡せずに終了';
    const canTrack = (typeof window !== 'undefined' && window.__v8CanTrack)
      ? window.__v8CanTrack() : false;
    return canTrack ? 'メイン終了' : 'ターン終了';
  },

  /* =============================================================
     主操作ボタンが押された
     ============================================================= */
  onMainButton: function () {
    if (this.active) {
      this.temp ? this._askConfirm() : this._askSkip();
      return;
    }
    this._endMain();
  },

  /** メインを終える。使えるカードが残っていれば先に確認（5.6） */
  _endMain: function () {
    const self = this;
    const warn = (typeof window !== 'undefined' && window.__v8HasPlayableCard)
      ? window.__v8HasPlayableCard() : false;

    const go = function () { self._doEndMain(); };

    if (warn && this._warnEnabled()) {
      this._dialog({
        message: 'まだ使用できるカードがあります。\nメインフェイズを終了しますか？',
        okLabel: '終了する',
        onOk: go,
      });
      return;
    }
    go();
  },

  /** 見落とし警告の設定（21.1・初期値 ON） */
  _warnEnabled: function () {
    try {
      if (typeof SaveManager !== 'undefined' && SaveManager.get) {
        const v = SaveManager.get('warnUnplayedCards');
        if (v === false) return false;
      }
    } catch (e) { /* 保存が使えなくても警告は出す */ }
    return true;
  },

  _doEndMain: function () {
    const phase = (typeof window !== 'undefined' && window.__v8EndMain)
      ? window.__v8EndMain() : null;
    if (phase === 'tracking') { this.enter(); return; }
    if (phase === 'end' && window.__v8SkipTracking) window.__v8SkipTracking();
  },

  /* =============================================================
     追跡フェイズの出入り
     ============================================================= */
  enter: function () {
    this.active = true;
    this.temp = null;
    this._apply();

    /* ★追跡フェイズでは手札カードを使えません（6.11）。
       拡大したままだと画面下半分を手札が占めて怪異を掴みにくいので、
       入るときに一度たたみます。もう一度開いて中身を見ることはできます。 */
    if (typeof V8Hand !== 'undefined' && V8Hand.expanded) V8Hand.collapse();
    /* ★視点が変わったことがすぐ分かるように、短い演出を入れます（6.1）。
       ・盤面がいったん少し引いてから戻る（カメラが移動した感じ）
       ・紫の光が上から下へ一度だけ流れる
       0.5秒で終わり、「動きを減らす」設定では止まります。 */
    if (this._root) {
      const root = this._root;
      root.classList.remove('v8-track-enter');
      void root.offsetWidth;            // いったん外してから付け直して再生させる
      root.classList.add('v8-track-enter');
      setTimeout(function () { root.classList.remove('v8-track-enter'); }, 700);
    }

    /* 視点が真上へ移り終えてから、フェイズ名を短く出す（4.7・6.1） */
    if (typeof V8Battle !== 'undefined' && V8Battle.showPhase) {
      setTimeout(function () { V8Battle.showPhase('追跡フェイズ'); }, 420);
    }
  },

  leave: function () {
    this.active = false;
    this.temp = null;
    this._drag = null;
    this._apply();
    /* ★矢印を必ず消します。refresh() は追跡フェイズでないと何もしないので、
       ここで消しておかないと、確定・解除のあとも線が残り続けます。 */
    this._hideArrow();
  },

  _hideArrow: function () {
    if (!this._root) return;
    const svg = this._root.querySelector('#v8-track-arrow');
    if (svg) svg.style.display = 'none';
  },

  /** 対戦の状況から、入っているべきかどうかを合わせる */
  sync: function () {
    const phase = (typeof window !== 'undefined' && window.__v8Phase)
      ? window.__v8Phase() : null;
    if (phase !== 'tracking' && this.active) this.leave();
  },

  _apply: function () {
    if (!this._root) return;
    this._root.classList.toggle('v8-tracking', this.active);
    this._root.classList.toggle('v8-has-temp', !!this.temp);
  },

  clearTemp: function () {
    if (!this.temp) return;
    this.temp = null;
    this._apply();
    this._hideArrow();
    this.refresh();
    if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
  },

  /* =============================================================
     明暗と、いま掴めるカード（6.3）
     -------------------------------------------------------------
     ・開始直後 … 追跡できる自分の怪異だけ明るい
     ・ドラッグ中 … その怪異と、狙える相手の人間だけ明るい
     ・仮追跡あり … 仮追跡の2枚が最も強く、他の怪異も明るい
     ============================================================= */
  refresh: function () {
    if (!this._root) return;
    if (!this.active) { this._hideArrow(); return; }
    const cards = this._root.querySelectorAll('.v8-card[data-uid]');
    const dragging = !!this._drag;
    const self = this;

    Array.prototype.forEach.call(cards, function (el) {
      const uid = el.getAttribute('data-uid');
      const role = el.getAttribute('data-track-role');   // 'youkai' / 'human' / null
      el.classList.remove('v8-card--bright', 'v8-card--dim', 'v8-card--strong');

      if (role === 'youkai') {
        if (dragging) {
          if (uid === self._drag.uid) el.classList.add('v8-card--strong');
          else el.classList.add('v8-card--dim');
        } else if (self.temp && uid === self.temp.youkaiUid) {
          el.classList.add('v8-card--strong');
        } else {
          el.classList.add('v8-card--bright');
        }
        return;
      }

      if (role === 'human') {
        if (dragging) el.classList.add('v8-card--bright');
        else if (self.temp && uid === self.temp.humanUid) el.classList.add('v8-card--strong');
        else if (self.temp && uid === self.temp.humanUid2) el.classList.add('v8-card--strong');   // ★v0.10：【二重追跡】の2人目
        else el.classList.add('v8-card--dim');
        return;
      }

      el.classList.add('v8-card--dim');
    });

    this._drawArrow();
    this._updateGuide();
  },

  /* 仮追跡がないときだけ案内を出す（6.8） */
  _updateGuide: function () {
    const g = this._root.querySelector('#v8-track-guide');
    if (!g) return;
    g.style.display = (this.active && !this.temp && !this._drag) ? 'block' : 'none';
  },

  /* =============================================================
     怪異1枚ぶんの入力（6.4・6.7）
     ============================================================= */
  bindYoukai: function (el, uid) {
    const self = this;
    V8Input.attach(el, {
      onTap: function () { /* 短いタップはカード閲覧。2-3 で中身を作ります */ },
      onLongPress: function () { /* 固定式カード詳細は 2-3 */ },
      onDragStart: function (e) { self._start(el, uid, e); },
      onDragMove: function (e) { self._move(e); },
      onDragEnd: function (e, cancelled) { self._end(e, cancelled); },
    });
  },

  _start: function (el, uid, e) {
    const r = el.getBoundingClientRect();
    this._drag = {
      uid: uid, el: el,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      x: e.clientX, y: e.clientY,
    };
    /* ★元のカードはその場に残し、指へは追従させません（6.4）。
       伸びるのは細い線だけです。 */
    if (this._root) this._root.classList.add('v8-track-dragging');
    this.refresh();
  },

  _move: function (e) {
    if (!this._drag) return;
    this._drag.x = e.clientX;
    this._drag.y = e.clientY;
    this._drawArrow();
  },

  _end: function (e, cancelled) {
    const d = this._drag;
    if (!d) return;

    /* ★片づける前に、離した先を調べます（Stage 2-2 で踏んだ順番の間違い） */
    const humanUid = cancelled ? null : this._humanAt(e.clientX, e.clientY);

    this._drag = null;
    if (this._root) this._root.classList.remove('v8-track-dragging');

    if (cancelled) { this.refresh(); return; }

    if (!humanUid) {
      /* ★無効な場所で離しても、いまの仮追跡は残します（6.5） */
      if (typeof V7Toast !== 'undefined') {
        V7Toast.push('追跡できる相手ではありません', { dedupe: true });
      }
      this.refresh();
      return;
    }

    /* ★チュートリアル中は、台本が指した組み合わせだけを認めます（v0.9）。
       ★伝えないと、つないでも台本が進まず、先へ行けなくなります。
         チュートリアル以外では、いつでも true が返ります。 */
    if (typeof window !== 'undefined' && window.__v8TrackPicked &&
        !window.__v8TrackPicked(d.uid, humanUid)) {
      this.refresh();
      return;
    }

    /* ★v0.10：【二重追跡】（ホテル）。同じ怪異から別の人間へもう一度引っぱると、2人目として足す。
       2人を追跡できるかどうかは、ルール処理（Game.pursuitBlockReason）に聞きます */
    const two = this._doubleOk(d.uid, this.temp && this.temp.youkaiUid === d.uid ? this.temp.humanUid : null, humanUid);
    if (two) {
      this.temp = { youkaiUid: d.uid, humanUid: this.temp.humanUid, humanUid2: humanUid };
      if (typeof V7Toast !== 'undefined') V7Toast.push('【二重追跡】2人を追跡します', { dedupe: true });
    } else {
      this.temp = { youkaiUid: d.uid, humanUid: humanUid };
      if (this._doubleOk(d.uid, humanUid, null) && typeof V7Toast !== 'undefined') {
        V7Toast.push('【二重追跡】もう1人の人間へも引っぱると、2人を追跡できます', { dedupe: true });
      }
    }
    this._apply();
    this.refresh();
    if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
  },

  /**
   * ★v0.10：【二重追跡】で2人目を足せるか。h2Uid が null なら「誰か2人目を足せるか」。
   * ★この画面からはゲームを直接呼ばない決まり（v0.8）なので、進行側の窓口に聞く
   */
  _doubleOk: function (yUid, h1Uid, h2Uid) {
    return !!(typeof window !== 'undefined' && window.__v10DoubleOk && window.__v10DoubleOk(yUid, h1Uid, h2Uid));
  },

  /** その座標にある「狙える相手の人間」を返す */
  _humanAt: function (x, y) {
    if (!this._root) return null;
    const list = this._root.querySelectorAll('.v8-card[data-track-role="human"]');
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      /* 隣同士が近いので、少しだけ広げて押しやすくする（6.7）。
         広げる量は左右で分け合うので、隣と重なりません。 */
      const pad = Math.min(r.width, r.height) * 0.12;
      if (x >= r.left - pad && x <= r.right + pad &&
        y >= r.top - pad && y <= r.bottom + pad) {
        return list[i].getAttribute('data-uid');
      }
    }
    return null;
  },

  /* =============================================================
     線と矢印（6.6）
       ドラッグ中 … 元カードから指まで細い線
       仮追跡     … 細い選択状態の矢印
     ============================================================= */
  _drawArrow: function () {
    if (!this._root) return;
    const svg = this._root.querySelector('#v8-track-arrow');
    if (!svg) return;

    const box = this._root.getBoundingClientRect();
    const line = svg.querySelector('#v8-track-line');
    const head = svg.querySelector('#v8-track-head');
    if (!line || !head) return;

    let from = null, to = null, kind = '';

    if (this._drag) {
      from = { x: this._drag.cx, y: this._drag.cy };
      to = { x: this._drag.x, y: this._drag.y };
      kind = 'drag';
    } else if (this.temp) {
      from = this._centerOf(this.temp.youkaiUid);
      to = this._centerOf(this.temp.humanUid);
      kind = 'temp';
    }

    if (!from || !to) { svg.style.display = 'none'; return; }

    svg.style.display = 'block';
    svg.setAttribute('data-kind', kind);
    const x1 = from.x - box.left, y1 = from.y - box.top;
    const x2 = to.x - box.left, y2 = to.y - box.top;
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);

    /* 矢じり。仮追跡のときだけ出す */
    if (kind === 'temp') {
      const a = Math.atan2(y2 - y1, x2 - x1);
      const s = 12;
      head.setAttribute('points', [
        (x2) + ',' + (y2),
        (x2 - s * Math.cos(a - 0.4)) + ',' + (y2 - s * Math.sin(a - 0.4)),
        (x2 - s * Math.cos(a + 0.4)) + ',' + (y2 - s * Math.sin(a + 0.4)),
      ].join(' '));
      head.style.display = 'block';
    } else {
      head.style.display = 'none';
    }
  },

  _centerOf: function (uid) {
    if (!this._root) return null;
    const el = this._root.querySelector('.v8-card[data-uid="' + uid + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },

  /* =============================================================
     確認パネル（6.9・6.10）
     背景を暗くし、背景タップは効かない。ボタンか端末戻るだけ。
     ============================================================= */
  _askConfirm: function () {
    const self = this;
    this._dialog({
      message: '追跡を確定しますか？',
      okLabel: '確定',
      onOk: function () {
        const t = self.temp;
        if (!t) return;
        self.leave();
        if (typeof window !== 'undefined' && window.__v8ConfirmTracking) {
          window.__v8ConfirmTracking(t.youkaiUid, t.humanUid, t.humanUid2 /* ★v0.10：【二重追跡】の2人目（無ければ undefined） */);
        }
      },
    });
  },

  _askSkip: function () {
    const self = this;
    this._dialog({
      message: '追跡せずにターンを終了しますか？',
      okLabel: '終了',
      onOk: function () {
        self.leave();
        if (typeof window !== 'undefined' && window.__v8SkipTracking) {
          window.__v8SkipTracking();
        }
      },
    });
  },

  /* 確認パネルは V8Battle と同じものを使います（見た目と作りを1つに） */
  _dialog: function (opt) {
    if (typeof V8Battle === 'undefined' ||
      !V8Battle.dialog({
        message: opt.message,
        buttons: [
          { label: '戻る' },
          { label: opt.okLabel || '確定', primary: true, onClick: opt.onOk },
        ],
      })) {
      if (opt.onOk) opt.onOk();   // パネルが出せないときは進める
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Track: V8Track };
}
