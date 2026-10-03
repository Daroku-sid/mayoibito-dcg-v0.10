/* =====================================================================
   tutorial-controller.js  ―― チュートリアルの進行を受け持つ（仕様書 23.2）
   ---------------------------------------------------------------------
   このファイルが持つのは「いま台本のどこにいるか」だけです。

     ・いまのステップ
     ・いまの説明ページ
     ・その場で許可されている操作
     ・次へ進む合図

   見た目は tutorial-ui.js、操作の受付は tutorial-actions.js、
   相手の動きは tutorial-cpu-driver.js が受け持ちます。

   【画面に直接触らない理由】
   このファイルは画面を一行も操作しません。
   代わりに ui という差し込み口へ「こう見せてください」と伝えます。
   こうしておくと、画面を作らずに進行だけを正確に点検できます。
   実際 tutorial-controller-tests.js は、記録用の偽の ui を差し込んで
   台本を最後まで進めています。

   読み込み順： … → tutorial-deck → tutorial-basic-data →
                 tutorial-controller → tutorial-ui → tutorial-actions
   ===================================================================== */

const TutorialController = {

  /* いま動いているか。false のときは通常の対戦と何も変わりません */
  active: false,

  data: null,        // 台本（TutorialBasicData）
  stepIndex: 0,      // いま何ステップめか
  pageIndex: 0,      // 説明の何ページめか
  phase: 'idle',     // 'pages'（説明中） / 'action'（操作待ち） / 'result' / 'done'
  cpuIndex: 0,       // CPU台本の何手めか
  finished: false,

  /** 見た目を差し込む口。既定では tutorial-ui.js が入ります */
  ui: null,

  /* =============================================================
     開始する
     ============================================================= */
  begin: function (data, ui) {
    this.data = data;
    this.ui = ui || (typeof TutorialUI !== 'undefined' ? TutorialUI : null);
    this.active = true;
    this.stepIndex = 0;
    this.pageIndex = 0;
    this.cpuIndex = 0;
    this.finished = false;
    this.phase = 'idle';
    this._lastHint = 0;
    this._waiters = [];
    this.enterStep();
    return true;
  },

  /** 途中でやめる。通常の状態へ戻します */
  quit: function () {
    this.active = false;
    this.phase = 'idle';
    this.flushWaiters();      // 待たせたまま消えると、盤面が止まります
    if (this.ui && this.ui.clear) this.ui.clear();
  },

  /* =============================================================
     いまのステップ／章／進み具合
     ============================================================= */
  step: function () {
    if (!this.data) return null;
    return this.data.steps[this.stepIndex] || null;
  },

  /** 進捗表示に出す章の番号（1から数える）。内部のステップ数は見せません */
  chapterNumber: function () {
    const s = this.step();
    if (!s || !this.data) return 0;
    return this.data.chapters.indexOf(s.chapter) + 1;
  },

  chapterTotal: function () {
    return this.data ? this.data.chapters.length : 0;
  },

  /* =============================================================
     ステップに入る
     -------------------------------------------------------------
     説明ページがあれば、まず説明から。
     無ければ、いきなり操作待ちになります。
     ============================================================= */
  enterStep: function () {
    const s = this.step();
    if (!s) { this.complete(); return; }

    this.pageIndex = 0;
    this.cpuIndex = 0;

    /* ★このステップに入るときの仕込み（v0.6.2）。
       いまは「山札の上に決まった札を積む」だけです。
       仕込まないと、台本が「引き戻す力を使いましょう」と言っても
       手札に無い、ということが起きます（仕様書 21.5）。 */
    this.runSetup(s.setup);

    if (s.pages && s.pages.length > 0) {
      this.phase = 'pages';
      this.showPage();
    } else {
      this.toAction();
    }
  },

  /* =============================================================
     ステップに入るときの仕込み
     -------------------------------------------------------------
     setup: {
       stackTop:   { village: [カードID…] },   山札の上に積む
       ensureHand: { mansion: [カードID…] },   手札に用意する
     }

     ensureHand は「これらが手札にあることを保証する」意味です。
     ★相手が台本どおりのカードを出すために要ります。
     手札に無ければ山札から持ってきて、そのぶん要らない札を山札へ返します。
     枚数は変わりません。
     ============================================================= */
  runSetup: function (setup) {
    if (!setup) return;
    if (typeof TutorialDeck === 'undefined') return;

    const note = function (msg) {
      if (typeof Errors !== 'undefined' && Errors.note) Errors.note(msg);
    };

    /* 手札の用意を先にします。
       山札を積んでから手札をいじると、積んだ札が動いてしまうためです。 */
    if (setup.ensureHand) {
      Object.keys(setup.ensureHand).forEach(function (side) {
        const ok = TutorialDeck.setHand(side, setup.ensureHand[side]);
        if (!ok) note('チュートリアル：手札を用意できませんでした（' + side + '）');
      });
    }

    if (setup.stackTop) {
      Object.keys(setup.stackTop).forEach(function (side) {
        const ok = TutorialDeck.stackTop(side, setup.stackTop[side]);
        if (!ok) note('チュートリアル：山札を仕込めませんでした（' + side + '）');
      });
    }
  },

  showPage: function () {
    const s = this.step();
    const page = s.pages[this.pageIndex];
    if (this.ui && this.ui.showPage) {
      this.ui.showPage({
        title: page.title,
        text: page.text,
        pageIndex: this.pageIndex,
        pageCount: s.pages.length,
        chapter: s.chapter,
        chapterNumber: this.chapterNumber(),
        chapterTotal: this.chapterTotal(),
        canBack: this.pageIndex > 0,
      });
    }
  },

  /** 説明の「次へ」。最後のページまで来たら操作待ちへ移ります */
  nextPage: function () {
    if (this.phase !== 'pages') return false;
    const s = this.step();
    if (this.pageIndex < s.pages.length - 1) {
      this.pageIndex += 1;
      this.showPage();
      return true;
    }
    this.toAction();
    return true;
  },

  /** 説明の「戻る」。盤面は巻き戻しません（仕様書 22.2） */
  prevPage: function () {
    if (this.phase !== 'pages' || this.pageIndex === 0) return false;
    this.pageIndex -= 1;
    this.showPage();
    return true;
  },

  /* =============================================================
     操作待ちへ移る
     ============================================================= */
  toAction: function () {
    const s = this.step();

    /* ★まず、説明を読み終えるのを待っていた進行を動かします。
       ここより下で次のステップへ移ることがあるので、
       先に解放しないと待ちっぱなしになります（v0.5.2）。 */
    this.flushWaiters();

    // 説明だけで終わるステップは、そのまま次へ
    if (s.done === 'pages') { this.finishStep(); return; }
    if (s.done === 'complete') { this.complete(); return; }

    /* ここから先は、何かが起きるのを待ちます。
       操作を求める場合もあれば（カードを出す）、
       盤面の出来事を待つ場合もあります（襲撃の完了）。 */
    this.phase = 'action';
    if (this.ui && this.ui.showAction) {
      this.ui.showAction({
        guide: s.guide || '',
        highlight: s.highlight || null,
        chapter: s.chapter,
        chapterNumber: this.chapterNumber(),
        chapterTotal: this.chapterTotal(),
      });
    }

  },

  /* =============================================================
     説明を読み終えるまで、盤面の進行を待たせる
     -------------------------------------------------------------
     preview.js の runTurnStart から呼ばれます。
     説明中でなければ、その場で先へ進みます。
     ============================================================= */
  whenExplained: function (cb) {
    /* 説明中（pages）と結果説明中（result）は待たせます。
       どちらもチュートリアルの表示が画面を覆っているので、
       その裏でダイアログが出ると押せず、押せたとしても
       何に答えたのか分かりません（v0.5.5）。 */
    if (!this.active) { cb(); return; }
    if (this.phase !== 'pages' && this.phase !== 'result') { cb(); return; }
    if (!this._waiters) this._waiters = [];
    this._waiters.push(cb);
  },

  flushWaiters: function () {
    const list = this._waiters || [];
    this._waiters = [];
    list.forEach(function (fn) { fn(); });
  },

  /** 襲撃などのあとに出す結果説明（仕様書 22.1） */
  showResult: function () {
    const s = this.step();
    this.phase = 'result';
    if (this.ui && this.ui.showResult) {
      this.ui.showResult({
        title: s.result.title,
        text: s.result.text,
        chapter: s.chapter,
        chapterNumber: this.chapterNumber(),
        chapterTotal: this.chapterTotal(),
      });
    }
  },

  /* =============================================================
     ★操作が許されているか（tutorial-actions.js から呼ばれる）
     -------------------------------------------------------------
       kind    … 'playCard' 'selectPursuit' 'mulliganSelect' など
       payload … { cardId, targetId } など

     台本に書かれていない操作は、すべて断ります。
     断っても盤面は一切変えません（仕様書 22.5）。
     ============================================================= */
  allows: function (kind, payload) {
    if (!this.active) return true;      // 通常対戦のときは何も邪魔しない
    const s = this.step();
    if (!s) return false;

    // 説明中はゲーム操作を止める（仕様書 22.2）
    if (this.phase === 'pages' || this.phase === 'result') {
      return kind === 'next' || kind === 'back';
    }
    if (this.phase !== 'action') return false;

    const allow = s.allow || [];
    if (allow.indexOf(kind) === -1) return false;

    const p = payload || {};

    // 使ってよいカードが決まっていれば、それ以外は断る
    if (s.allowCards && p.cardId && s.allowCards.indexOf(p.cardId) === -1) return false;

    // 狙ってよい相手が決まっていれば、それ以外は断る
    if (s.allowTargets && p.targetId && s.allowTargets.indexOf(p.targetId) === -1) return false;

    /* ★カードを選ぶ場面で、台本が選ぶ札を決めているなら、
       0枚のままの確定は断ります（v0.6.3）。
       選ばずに進むと、そのあとの場面へ行けなくなります。 */
    if (kind === 'pickConfirm' && s.allowCards && s.allowCards.length > 0 &&
        p.count === 0) {
      return false;
    }

    return true;
  },

  /** 断ったときに一言だけ出す。続けて出しすぎないようにします（仕様書 22.5） */
  reject: function () {
    const s = this.step();
    if (!s || !s.hint) return;
    const now = Date.now();
    if (now - (this._lastHint || 0) < 1800) return;   // 重複表示しない
    this._lastHint = now;
    if (this.ui && this.ui.showHint) this.ui.showHint(s.hint);
  },

  /* =============================================================
     ★合図が来た（tutorial-actions.js や画面から呼ばれる）
     -------------------------------------------------------------
     いまのステップの done と一致すれば、次へ進みます。
     ============================================================= */
  notify: function (signal, payload) {
    if (!this.active) return false;
    const s = this.step();
    if (!s) return false;

    /* done は1つでも、複数でも書けます。
       複数書けるのは、どちらを選んでも先へ進めるようにするためです。
       たとえばフィールド効果は「発動する」「発動しない」の
       どちらを押しても、そこで止まってはいけません（v0.5.5）。 */
    const wanted = Array.isArray(s.done) ? s.done : [s.done];
    if (wanted.indexOf(signal) === -1) return false;

    const p = payload || {};

    // 指定のカードでの完了だけを認める
    if (s.doneCards) {
      const got = p.cardIds || (p.cardId ? [p.cardId] : []);
      const want = s.doneCards;
      const allThere = want.every(function (id) { return got.indexOf(id) !== -1; });
      if (!allThere || got.length !== want.length) return false;
    }

    // 襲撃や説明のあとに結果説明があるなら、先にそれを見せる
    if (s.result && this.phase !== 'result') { this.showResult(); return true; }

    this.finishStep();
    return true;
  },

  /* =============================================================
     いまのステップを終えて、次へ
     ============================================================= */
  finishStep: function () {
    if (this.stepIndex >= this.data.steps.length - 1) { this.complete(); return; }
    this.stepIndex += 1;
    this.enterStep();
  },

  complete: function () {
    this.phase = 'done';
    this.finished = true;
    this.flushWaiters();
    if (this.ui && this.ui.showComplete) {
      this.ui.showComplete({ title: this.data.title });
    }
  },

  /* =============================================================
     通常警告を出すかどうか（仕様書 24）
     -------------------------------------------------------------
       name … 'playableCardWarning' / 'noPursuitWarning'

     台本で 'show' と書かれていなければ、抑制します。
     台本の流れを警告が邪魔しないようにするためです。
     ============================================================= */
  showsWarning: function (name) {
    if (!this.active) return true;
    const s = this.step();
    if (!s || !s.warnings) return false;   // 既定は抑制（24章）
    return s.warnings[name] === 'show';
  },

  /* =============================================================
     CPU台本（仕様書 20.4）
     -------------------------------------------------------------
     1手ずつ取り出します。一括では実行しません。
     ============================================================= */
  cpuScript: function () {
    const s = this.step();
    return (s && s.cpuScript) ? s.cpuScript : null;
  },

  nextCpuAction: function () {
    const script = this.cpuScript();
    if (!script) return null;
    if (this.cpuIndex >= script.length) return null;
    return script[this.cpuIndex++];
  },

  cpuDone: function () {
    const script = this.cpuScript();
    return !script || this.cpuIndex >= script.length;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialController: TutorialController };
}
