/* =====================================================================
   v08-target.js ― 効果の対象選択（Stage 3-2）
   ---------------------------------------------------------------------
   仕様書 第7部。

   既存の対象選択は、盤面のカードから1枚選ぶ形です
   （preview.js の openBoardPick。候補の一覧と、選ばれた1枚を返す）。
   ここではその見た目と操作だけを新しい盤面へ移します。
   何を候補にするか・選んだあと何が起きるかは既存のままです。

   ★ゲーム状態は触りません。選ばれたカードを既存の処理へ返すだけです。
   ===================================================================== */

'use strict';

const V8Target = {

  /** 選んでいる最中か */
  active: false,

  /** 候補の uid（文字列） */
  candidates: [],

  /** 仮選択。選んだ順に並ぶ（7.4：番号を付けるため） */
  chosen: [],

  /** 何枚選ぶか。1 なら単一 */
  count: 1,

  /** 選ばなくても解決できるか（7.3・7.6） */
  optional: false,

  /**
   * ★途中でやめられるか（グッズの装備先を選ぶときだけ true）。
   * 効果の対象選択は、効果がすでに解決に入っているのでやめられません。
   * グッズは「まだ使っていない」段階なので、やめれば手札に残ります。
   */
  cancellable: false,

  _cb: null,
  _onCancel: null,
  _root: null,
  _title: '',

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;

    /* 盤面の空き部分をタップすると仮選択を解除（7.2）。
       山札・手札・ボタンなど、押せるものの上は空白ではありません。 */
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', function (e) {
        if (!self.active || !self.chosen.length) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest(V8Hand.INTERACTIVE)) return;
        if (t.closest('#v8-detail') || t.closest('#v8-quick')) return;
        self.clear();
      }, true);
    }
    return this;
  },

  /* =============================================================
     既存から呼ばれる入口
     -------------------------------------------------------------
     @param {object} options { candidates:[inst], title, message, count, optional }
     @param {Function} cb    選んだ結果を返す
     @return {boolean} 引き受けたかどうか（false なら既存の画面が出る）
     ============================================================= */
  open: function (options, cb) {
    if (!this._root || !options || !options.candidates) return false;

    const uids = options.candidates.map(function (c) {
      return String((c && c.uid !== undefined) ? c.uid : c);
    });
    if (!uids.length) return false;      // 候補0件は既存側に任せる（7.5）

    /* ★実際に選ぶ数は、候補の数を超えません（7.5） */
    const want = options.count || 1;
    this.count = Math.min(want, uids.length);
    this.optional = !!options.optional;
    this.cancellable = !!options.cancellable;
    this.candidates = uids;
    this.chosen = [];
    this._cb = cb;
    this._onCancel = options.onCancel || null;
    /* ★何のための選択か（v0.9）。
       チュートリアル中に、台本のどの許可で見るかが変わります。
         'equip'  … グッズを付ける相手      → playCard
         それ以外 … 効果の対象・一覧から選ぶ → pickCard
       ★ここを取り違えると、台本が「選んでよい」と言っていても
         押せなくなります（実際にグッズの装備で起きました）。 */
    this.purpose = options.purpose || '';
    this.sourceCardId = options.sourceCardId || '';
    this._title = [options.title, options.message].filter(Boolean).join('：');
    this.active = true;
    this._apply();

    /* 候補が足りないときは、そのことを伝える（7.5） */
    if (want > uids.length && typeof V7Toast !== 'undefined') {
      V7Toast.push('選択可能な対象は' + uids.length + '枚のみです', { dedupe: true });
    }
    this.refresh();
    if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
    return true;
  },

  close: function () {
    this.active = false;
    this.candidates = [];
    this.chosen = [];
    this._cb = null;
    this._onCancel = null;
    this.cancellable = false;
    this._apply();
    this._clearMarks();
    if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
  },

  /**
   * ★選ぶのをやめる（グッズの装備先だけ）。
   * まだ何も使っていないので、カードは手札に残ったままです。
   */
  cancel: function () {
    if (!this.active || !this.cancellable) return false;
    const back = this._onCancel;
    this.close();
    if (back) back();
    return true;
  },

  /**
   * ★明暗と番号を消す。
   * close() で `v8-picking` を外しても、カードに付けた
   * v8-card--dim などの印は要素に残ります。次に描き直されるまで
   * 盤面が暗いままになるので、ここで外しておきます。
   */
  _clearMarks: function () {
    if (!this._root) return;
    const cards = this._root.querySelectorAll('.v8-card[data-uid], .v8-zone__card[data-uid]');
    Array.prototype.forEach.call(cards, function (el) {
      el.classList.remove('v8-card--bright', 'v8-card--dim',
        'v8-card--strong', 'v8-card--picked');
      const badge = el.querySelector('.v8-card__no');
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    });
  },

  _apply: function () {
    if (!this._root) return;
    this._root.classList.toggle('v8-picking', this.active);
    const bar = this._root.querySelector('#v8-pick-hint');
    if (bar) {
      bar.textContent = this._title;
      bar.style.display = this.active ? 'block' : 'none';
    }
  },

  /* =============================================================
     主操作ボタン（7.2・7.3・7.6）
     ============================================================= */
  mainLabel: function () {
    if (!this.active) return '';
    if (this.chosen.length > 0) return '対象を確定';
    return this.optional ? '対象を選ばずに解決' : '対象を確定';
  },
  /** 選択が足りていて押せるか */
  canConfirm: function () {
    if (!this.active) return false;
    if (this.chosen.length > 0) return true;
    return this.optional;
  },

  /** 進捗（7.4：複数選択のときだけ「1 / 2」） */
  progress: function () {
    if (!this.active || this.count <= 1) return '';
    return this.chosen.length + ' / ' + this.count;
  },

  onMainButton: function () {
    if (!this.active) return;
    if (!this.canConfirm()) {
      if (typeof V7Toast !== 'undefined') {
        V7Toast.push('対象を選んでください', { dedupe: true });
      }
      return;
    }
    /* ★追加の最終確認は出しません（7.2） */
    const picked = this.chosen.slice();
    const cb = this._cb;
    this.close();
    if (cb) cb(this._instOf(picked));
  },

  /** 既存が受け取る形へ戻す。1枚ならそのカード、複数なら配列 */
  _instOf: function (uids) {
    const find = function (uid) {
      const f = (typeof V8Info !== 'undefined') ? V8Info.find(uid) : null;
      return f ? f.inst : null;
    };
    if (this.count <= 1) return uids.length ? find(uids[0]) : null;
    return uids.map(find).filter(Boolean);
  },

  /* =============================================================
     カードをタップしたとき（7.2・7.4）
     ============================================================= */
  tap: function (uid) {
    if (!this.active) return;
    const key = String(uid);
    if (this.candidates.indexOf(key) < 0) return;   // 無効対象は反応しない

    const at = this.chosen.indexOf(key);

    /* ★チュートリアル中は、台本が指した相手だけを選べます（v0.9）。
       ★外すのはいつでも通します。やり直せないと詰みます。
       チュートリアル以外では、いつでも true が返ります。 */
    if (at < 0 && typeof window !== 'undefined') {
      const info = (typeof V8Info !== 'undefined') ? V8Info.find(key) : null;
      const inst = info ? info.inst : null;
      if (inst) {
        if (this.purpose === 'equip') {
          /* グッズを付ける相手は、台本では「そのカードを出す」操作です */
          if (window.__v8EquipAllow &&
              !window.__v8EquipAllow(this.sourceCardId, inst)) return;
        } else if (window.__v8PickAllow && !window.__v8PickAllow(inst)) return;
      }
    }

    /* 選んでいるカードをもう一度タップすると解除（7.4） */
    if (at >= 0) {
      this.chosen.splice(at, 1);   // ★残りは前へ詰まり、番号も付け直される
      this.refresh();
      if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
      return;
    }

    /* 単一のときは置き換える（7.2） */
    if (this.count <= 1) {
      this.chosen = [key];
      this.refresh();
      if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
      return;
    }

    /* ★上限に達していたら、勝手に入れ替えません（7.4） */
    if (this.chosen.length >= this.count) {
      if (typeof V7Toast !== 'undefined') {
        V7Toast.push('選択上限は' + this.count + '枚です', { dedupe: true });
      }
      return;
    }

    /* 解除して選び直したカードは、いちばん最後の番号になります（7.4） */
    this.chosen.push(key);
    this.refresh();
    if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
  },

  clear: function () {
    if (!this.chosen.length) return;
    this.chosen = [];
    this.refresh();
    if (typeof V8Battle !== 'undefined') V8Battle.updateMainButton();
  },

  /* =============================================================
     明暗と選択番号（7.1・7.4）
     ============================================================= */
  refresh: function () {
    if (!this._root || !this.active) return;
    /* 盤面のカードと、公開領域の一覧のカードの両方に効かせます */
    const cards = this._root.querySelectorAll('.v8-card[data-uid], .v8-zone__card[data-uid]');
    const self = this;

    Array.prototype.forEach.call(cards, function (el) {
      const uid = String(el.getAttribute('data-uid'));
      const ok = self.candidates.indexOf(uid) >= 0;
      const at = self.chosen.indexOf(uid);

      el.classList.remove('v8-card--bright', 'v8-card--dim', 'v8-card--strong');
      el.classList.toggle('v8-card--picked', at >= 0);
      if (at >= 0) el.classList.add('v8-card--strong');
      else if (ok) el.classList.add('v8-card--bright');
      else el.classList.add('v8-card--dim');   // 無効対象は暗く（7.1）

      /* 選んだ順の番号。効果の上で順番に意味が無くても付けます（7.4） */
      let badge = el.querySelector('.v8-card__no');
      if (at >= 0 && self.count > 1) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'v8-card__no';
          el.appendChild(badge);
        }
        badge.textContent = '①②③④⑤⑥⑦⑧⑨'.charAt(at) || String(at + 1);
      } else if (badge) {
        badge.parentNode.removeChild(badge);
      }
    });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Target: V8Target };
}
