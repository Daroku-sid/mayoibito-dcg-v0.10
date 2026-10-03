/* =====================================================================
   tutorial-ui.js  ―― チュートリアルの見た目（仕様書 22）
   ---------------------------------------------------------------------
   tutorial-controller.js から「こう見せてください」と言われた通りに
   画面へ出すだけのファイルです。判断は一切しません。

   仕様書 22.1 の4つを受け持ちます。
     1. 中央ルール説明   … #tut-panel
     2. 操作案内バー     … #tut-guide
     3. 結果説明         … #tut-panel の使い回し
     4. 誤操作ヒント     … #tut-hint

   【暗転の濃さを変える理由】（仕様書 22.2／22.3）
   説明中は文章に集中してほしいので濃く沈めます。
   操作中に濃いままだと盤面が読めず、何をすべきか分かりません。
   そこで操作中は薄くします。

   読み込み順： … → tutorial-controller → tutorial-ui → tutorial-actions
   ===================================================================== */

const TutorialUI = {

  _hintTimer: null,
  _highlighted: [],

  el: function (id) { return document.getElementById(id); },

  /* =============================================================
     中央のルール説明（仕様書 22.1／22.2）
     ============================================================= */
  showPage: function (o) {
    this.clearHighlight();
    this.hideGuide();
    this.setDim('explain');

    const panel = this.el('tut-panel');
    if (!panel) return;

    panel.querySelector('.tut__chapter').textContent = o.chapter || '';
    panel.querySelector('.tut__steps').textContent =
      o.chapterNumber + ' / ' + o.chapterTotal;
    panel.querySelector('.tut__title').textContent = o.title || '';
    panel.querySelector('.tut__text').textContent = o.text || '';

    // 1ページめには「戻る」を出しません。押しても何も起きないボタンは
    // 迷いのもとになるためです。
    const back = this.el('tut-back');
    if (back) back.classList.toggle('is-hidden', !o.canBack);

    const next = this.el('tut-next');
    if (next) next.textContent = (o.pageIndex >= o.pageCount - 1) ? 'はじめる' : '次へ';

    this.replay(panel.querySelector('.tut__box'));
    panel.classList.remove('is-hidden');
  },

  /* =============================================================
     襲撃などのあとに出す結果説明（仕様書 22.1）
     ============================================================= */
  showResult: function (o) {
    this.clearHighlight();
    this.hideGuide();
    this.setDim('explain');

    const panel = this.el('tut-panel');
    if (!panel) return;

    panel.querySelector('.tut__chapter').textContent = o.chapter || '';
    panel.querySelector('.tut__steps').textContent =
      o.chapterNumber + ' / ' + o.chapterTotal;
    panel.querySelector('.tut__title').textContent = o.title || '';
    panel.querySelector('.tut__text').textContent = o.text || '';

    const back = this.el('tut-back');
    if (back) back.classList.add('is-hidden');
    const next = this.el('tut-next');
    if (next) next.textContent = '次へ';

    this.replay(panel.querySelector('.tut__box'));
    panel.classList.remove('is-hidden');
  },

  /* =============================================================
     操作待ち（仕様書 22.3）
     -------------------------------------------------------------
     説明を閉じ、暗転を弱め、案内バーを出し、
     触ってほしい場所を光らせます。
     ============================================================= */
  showAction: function (o) {
    this.hidePanel();
    this.setDim('action');

    const bar = this.el('tut-guide');
    if (bar && o.guide) {
      const text = bar.querySelector('.tut-guide__text');
      text.textContent = o.guide;
      this.replay(text);
      bar.classList.remove('is-hidden');
    } else if (bar) {
      bar.classList.add('is-hidden');
    }

    this.applyHighlight(o.highlight);
  },

  /* =============================================================
     誤操作のヒント（仕様書 22.5）
     -------------------------------------------------------------
     1.8秒で消えます。重複して出さないための時間の管理は
     tutorial-controller.js が持っているので、ここでは
     「出す・消す」だけを受け持ちます。
     ============================================================= */
  showHint: function (text) {
    const box = this.el('tut-hint');
    if (!box) return;

    const span = box.querySelector('span');
    span.textContent = text;
    this.replay(span);
    box.classList.remove('is-hidden');

    if (this._hintTimer) clearTimeout(this._hintTimer);
    const self = this;
    this._hintTimer = setTimeout(function () {
      box.classList.add('is-hidden');
      self._hintTimer = null;
    }, 1800);
  },

  /* =============================================================
     クリア（仕様書 20.6）
     ============================================================= */
  showComplete: function (o) {
    this.clearHighlight();
    this.hideGuide();
    this.setDim('explain');

    const panel = this.el('tut-panel');
    if (!panel) return;
    panel.querySelector('.tut__chapter').textContent = 'クリア';
    panel.querySelector('.tut__steps').textContent = '';
    panel.querySelector('.tut__title').textContent = (o && o.title) || 'クリア';
    panel.querySelector('.tut__text').textContent = '';

    const back = this.el('tut-back');
    if (back) back.classList.add('is-hidden');
    const next = this.el('tut-next');
    if (next) next.textContent = '終わる';

    panel.classList.remove('is-hidden');
  },

  /* =============================================================
     暗転（仕様書 22.2／22.3）
       'explain' … 説明中。濃く沈める
       'action'  … 操作中。盤面が読める程度まで弱める
       null      … 消す
     ============================================================= */
  setDim: function (mode) {
    const dim = this.el('tut-dim');
    if (!dim) return;
    if (!mode) { dim.classList.add('is-hidden'); return; }
    dim.classList.toggle('is-action', mode === 'action');
    dim.classList.remove('is-hidden');
  },

  hidePanel: function () {
    const panel = this.el('tut-panel');
    if (panel) panel.classList.add('is-hidden');
  },

  hideGuide: function () {
    const bar = this.el('tut-guide');
    if (bar) bar.classList.add('is-hidden');
  },

  /* =============================================================
     触ってほしい場所を光らせる（仕様書 22.3）
     -------------------------------------------------------------
       highlight = {
         hand:   [カードID…]   手札のカード
         board:  [カードID…]   盤面のカード
         zone:   'self-normal-youkai'  置き先のエリア
         button: 'btn-main'            ボタン
       }
     ============================================================= */
  applyHighlight: function (spec) {
    this.clearHighlight();
    if (!spec) return;

    const self = this;
    const mark = function (el) {
      if (!el) return;
      el.classList.add('is-tut-target');
      self._highlighted.push(el);
    };

    // 手札・盤面のカードは data-card-id を目印に探します
    const byCard = function (ids) {
      (ids || []).forEach(function (id) {
        const list = document.querySelectorAll('[data-card-id="' + id + '"]');
        Array.prototype.forEach.call(list, mark);
      });
    };
    byCard(spec.hand);
    byCard(spec.board);

    if (spec.zone) mark(document.getElementById(self.zoneIdOf(spec.zone)));

    /* ★ボタンは、いま出ている画面のものを指します（v0.9）。
       台本は旧画面の名前（btn-main など）で書かれていますが、
       マリガンは新しい画面になったので、そちらの確定ボタンへ読み替えます。
       ★読み替えないと、光る場所が画面の裏に隠れたままになり、
         どこを押せばいいのか分かりません。 */
    if (spec.button) mark(document.getElementById(self.buttonIdOf(spec.button)));

    /* 確認ダイアログのボタンは、その場で作られるので id がありません。
       「左（発動しない）」「右（発動する）」で指します。 */
    if (spec.dialog) {
      /* ★v0.9：確認パネルは新しい盤面のものになりました。
         ★台本は「左（発動しない）／右（発動する）」でしか指せないので、
           いま出ているパネルの側でボタンを探します。
         出ていないほうを探しても見つからないだけなので、両方見ます。 */
      const v8 = document.getElementById('v8-confirm');
      if (v8 && v8.classList.contains('v8-on')) {
        const sel8 = (spec.dialog === 'primary')
          ? '.v8-confirm__btn--ok'
          : '.v8-confirm__btn:not(.v8-confirm__btn--ok)';
        mark(v8.querySelector(sel8));
      }

      const box = document.getElementById('dialog');
      if (box && box.classList.contains('is-open')) {
        const sel = (spec.dialog === 'primary')
          ? '.dlg__btn--primary'
          : '.dlg__btn:not(.dlg__btn--primary)';
        mark(box.querySelector(sel));
      }
    }
  },

  /**
   * 台本のボタン名 → いま出ている画面のボタン。
   * ★台本は書き換えません（仕様書 5.4：台本は維持）。
   *   読み替えだけをここで受け持ちます。
   */
  /**
   * 台本の置き場所の名前 → いま出ている画面の置き場所。
   * ---------------------------------------------------------------------
   * ★台本は旧画面の名前で「人間の枠」「怪異の枠」「イベントの枠」を
   *   指しています。新しい盤面では★置き場所は紫の枠1つにまとまりました。
   *   読み替えないと、光る場所が画面の裏に隠れたままになります。
   */
  zoneIdOf: function (name) {
    const battle = document.getElementById('v8-battle');
    if (battle && battle.classList.contains('v7-on')) return 'v8-drop';
    return name;
  },

  buttonIdOf: function (name) {
    if (name === 'btn-main') {
      /* ★印は対戦画面（#v8-battle）に付きます */
      const battle = document.getElementById('v8-battle');
      if (battle && battle.classList.contains('v8-mull-on')) return 'v8-mull-confirm';
      const root = document.getElementById('v7-root');
      if (root && root.classList.contains('v7-on') &&
          battle && battle.classList.contains('v7-on')) return 'v8-btn-main';
    }
    return name;
  },

  clearHighlight: function () {
    this._highlighted.forEach(function (el) {
      el.classList.remove('is-tut-target');
    });
    this._highlighted = [];
  },

  /* 光った場所は毎回描き直されるので、盤面の更新後に光らせ直します */
  refreshHighlight: function (spec) {
    this.applyHighlight(spec);
  },

  /* =============================================================
     全部片づける（チュートリアルをやめたとき）
     ============================================================= */
  clear: function () {
    this.clearHighlight();
    this.hidePanel();
    this.hideGuide();
    this.setDim(null);
    const hint = this.el('tut-hint');
    if (hint) hint.classList.add('is-hidden');
    const say = this.el('tut-say');
    if (say) say.classList.add('is-hidden');
    if (this._hintTimer) { clearTimeout(this._hintTimer); this._hintTimer = null; }
  },

  /* =============================================================
     一時的に引っこめる／戻す（v0.5.5）
     -------------------------------------------------------------
     対戦中メニュー（設定）は重ね順が 174 で、
     チュートリアルの表示（186〜189）より下にあります。
     そのまま開くと、メニューが案内や暗転の裏に隠れて
     「押したのに何も起きない」ように見えます。

     重ね順そのものを動かすと、確認ダイアログや拡大表示など
     他の重なりまで崩れます。そこで、メニューを開いているあいだ
     チュートリアルの表示だけを引っこめます。
     ============================================================= */
  suspend: function () {
    if (this._suspended) return;
    const ids = ['tut-panel', 'tut-guide', 'tut-hint', 'tut-dim', 'tut-say'];
    const self = this;
    this._suspended = [];
    ids.forEach(function (id) {
      const el = self.el(id);
      if (el && !el.classList.contains('is-hidden')) {
        el.classList.add('is-hidden');
        self._suspended.push(id);
      }
    });
    this._suspendedHighlight = this._highlighted.slice();
    this.clearHighlight();
  },

  resume: function () {
    if (!this._suspended) return;
    const self = this;
    this._suspended.forEach(function (id) {
      const el = self.el(id);
      if (el) el.classList.remove('is-hidden');
    });
    this._suspended = null;
    (this._suspendedHighlight || []).forEach(function (el) {
      el.classList.add('is-tut-target');
      self._highlighted.push(el);
    });
    this._suspendedHighlight = null;
  },

  /* =============================================================
     ★見張り：出ているべきでない表示が残っていないか
     -------------------------------------------------------------
     チュートリアルが止まっているのに案内が出ていたら、片づけます。

     本来は片づけを呼ぶ側が正しく呼べばよいのですが、
     出口は今後も増えます（結果画面、エラー、通信切れ…）。
     そのたびに書き忘れが起きるので、
     盤面を描き直すたびに一度だけ確かめる形にしました。

     ここは「最後の砦」です。ここが働いたということは
     どこかで片づけ漏れがあるので、開発中は記録に残します。
     ============================================================= */
  audit: function () {
    if (this._suspended) return false;      // 引っこめている最中は見ない
    const active = (typeof TutorialController !== 'undefined') &&
                   TutorialController.active;
    if (active) return false;

    const ids = ['tut-panel', 'tut-guide', 'tut-hint', 'tut-dim', 'tut-say'];
    const leftover = ids.filter(function (id) {
      const el = document.getElementById(id);
      return el && !el.classList.contains('is-hidden');
    });
    if (leftover.length === 0 && this._highlighted.length === 0) return false;

    if (typeof Errors !== 'undefined' && Errors.note) {
      Errors.note('チュートリアルの表示が残っていました：' + leftover.join('、'));
    }
    this.clear();
    return true;
  },

  /* =============================================================
     出るときの動きをもう一度再生する
     -------------------------------------------------------------
     同じ要素を使い回すと、2回目以降は animation が動きません。
     いったん外して、1コマ置いてから付け直します。
     ============================================================= */
  replay: function (el) {
    if (!el) return;
    const anim = el.style.animation;
    el.style.animation = 'none';
    void el.offsetWidth;      // ここで一度だけ再計算させる
    el.style.animation = anim || '';
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialUI: TutorialUI };
}
