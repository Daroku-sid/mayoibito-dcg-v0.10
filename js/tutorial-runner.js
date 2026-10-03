/* =====================================================================
   tutorial-runner.js  ―― チュートリアルの起動と後片づけ（v0.5）
   ---------------------------------------------------------------------
   ばらばらの部品を、実際に遊べる形へつなぎます。

     選択画面のボタン → 対戦を始める → 台本を動かす
     → クリアを保存する → メニューへ戻す

   【なぜ preview.js に書かないか】
   preview.js は4000行を超える対戦画面の本体です。
   チュートリアル固有の事情をそこへ足していくと、
   通常の対戦の流れが読み取りにくくなります。
   起動と後片づけだけを、ここにまとめました。

   読み込み順： … → tutorial-cpu-driver → preview.js → tutorial-runner
                 （preview.js の関数を使うので、そのあとに読みます）
   ===================================================================== */

const TutorialRunner = {

  /* =============================================================
     基本編を始める
     ============================================================= */
  startBasic: function () {
    const data = (typeof TutorialBasicData !== 'undefined') ? TutorialBasicData : null;
    return this._start(data);
  },

  /* =============================================================
     実践編を始める（v0.6・仕様書 21）
     -------------------------------------------------------------
     基本編と同じ道を通ります。違うのは台本だけです。
     盤面の組み立て（仕様書 21.2）は、
     preview.js の startGame が openingSnapshot を見て行います。
     ============================================================= */
  startAdvanced: function () {
    if (!this.isBasicCleared()) return false;   // 基本編クリアで解放（仕様書 19.2）
    const data = (typeof TutorialAdvancedData !== 'undefined') ? TutorialAdvancedData : null;
    return this._start(data);
  },

  /** 基本編と実践編で共通の始め方 */
  _start: function (data) {
    if (!data) return false;

    TutorialController.begin(data, TutorialUI);

    /* 固定条件で対戦を始めます（仕様書 19.3）。
       CPU側の難易度表示は「弱」ですが、実際の行動は台本が決めます。
       通常のAIは動かしません（仕様書 19.1）。 */
    const f = data.fixed;
    if (typeof window.startTutorialGame !== 'function') return false;

    /* 席の名札は、通常のCPU対戦と同じ「あなた／CPU」にそろえます。
       ここを省くと対戦画面の名前欄が空になります。 */
    /* ★通常の対戦と同じ下ごしらえを通します。
       ここで RuntimeDecks が片づき、前の対戦で使った自作デッキの
       中身が残ったままになるのを防げます。
       チュートリアルは公式デッキ固定なので、
       戻り値はそのまま公式のキーになります。 */
    const decks = (typeof DeckManager !== 'undefined')
      ? DeckManager.prepareForBattle({ village: f.playerDeck, mansion: f.cpuDeck })
      : { village: f.playerDeck, mansion: f.cpuDeck };

    window.startTutorialGame({
      firstSide: f.firstSide,
      seed: f.seed,
      decks: decks,
      labels: { village: 'あなた', mansion: 'CPU' },
      // mode を添えるのは通常のCPU対戦と同じ扱いにするためです（仕様書 19.3）
      cpu: { side: f.cpuSide, difficulty: 'weak', mode: 'cpu' },
    });
    return true;
  },

  /* =============================================================
     やめる（途中でも、クリア後でも）
     -------------------------------------------------------------
     途中の進み具合は保存しません（仕様書 19.2）。
     ============================================================= */
  quit: function () {
    if (typeof TutorialCpuDriver !== 'undefined') TutorialCpuDriver.stop();
    TutorialController.quit();

    /* ★対戦の後片づけを通します（v0.5.3）。
       ここを省くと対戦が動いたままメニューが開き、
       設定ボタンなどが二重に反応します。 */
    if (typeof window.exitTutorialToMenu === 'function') {
      window.exitTutorialToMenu();
    } else if (typeof Screens !== 'undefined') {
      Screens.go('tutorial-select');
    }
    this.refreshSelectScreen();
  },

  /* =============================================================
     クリアを保存する（仕様書 20.6・25章）
     ============================================================= */
  /* ★SaveManager.get / set は「設定」の欄だけを読み書きします（v0.5.3）。
     チュートリアルの記録は data.tutorial という別の枠にあるので、
     get('tutorial') では取れませんでした。
     そのため v0.5.2 ではクリアが保存されず、
     実践編がいつまでも解放されませんでした。 */
  slot: function () {
    if (typeof SaveManager === 'undefined') return null;
    if (!SaveManager.data) SaveManager.load();
    return SaveManager.data ? SaveManager.data.tutorial : null;
  },

  saveBasicCleared: function () {
    const t = this.slot();
    if (!t) return false;
    t.basicCompleted = true;
    SaveManager.save();
    return true;
  },

  saveAdvancedCleared: function () {
    const t = this.slot();
    if (!t) return false;
    t.advancedCompleted = true;
    SaveManager.save();
    return true;
  },

  /** どちらの編をクリアしたかで、保存先を分けます（仕様書 21.8） */
  saveCleared: function (which) {
    return (which === 'advanced')
      ? this.saveAdvancedCleared()
      : this.saveBasicCleared();
  },

  isBasicCleared: function () {
    const t = this.slot();
    return !!(t && t.basicCompleted);
  },

  isAdvancedCleared: function () {
    const t = this.slot();
    return !!(t && t.advancedCompleted);
  },

  /* =============================================================
     選択画面の見た目を、保存内容に合わせる（仕様書 19.2）
     -------------------------------------------------------------
     ・基本編は最初から選べる
     ・実践編は基本編クリア後に解放（v0.6で中身を入れます）
     ・クリア済み表示を付ける
     ============================================================= */
  refreshSelectScreen: function () {
    const basicCleared = this.isBasicCleared();
    const advCleared = this.isAdvancedCleared();

    const badge = document.querySelector('#tut-pick-basic .menu__tag--clear');
    if (badge) badge.classList.toggle('is-hidden', !basicCleared);

    /* 実践編は基本編クリアで解放します（仕様書 19.2）。
       v0.6 で中身ができたので、解放されたら本当に押せます。 */
    const adv = document.getElementById('tut-pick-advanced');
    if (adv) {
      adv.disabled = !basicCleared;
      adv.classList.toggle('menu__card--soon', !basicCleared);
      const tag = adv.querySelector('.menu__tag');
      if (tag) {
        tag.textContent = advCleared ? 'クリア済み'
          : (basicCleared ? '挑戦できます' : '基本編クリアで解放');
        tag.classList.toggle('menu__tag--clear', advCleared);
      }
    }
  },

  /* =============================================================
     画面の配線（読み込み時に一度だけ）
     ============================================================= */
  setup: function () {
    const self = this;

    const basic = document.getElementById('tut-pick-basic');
    if (basic) {
      basic.addEventListener('click', function () { self.startBasic(); });
    }

    /* 説明パネルの「次へ」「戻る」。
       クリア画面まで来ていたら、保存してメニューへ戻します。 */
    const advBtn = document.getElementById('tut-pick-advanced');
    if (advBtn) {
      advBtn.addEventListener('click', function () {
        if (advBtn.disabled) return;
        self.startAdvanced();
      });
    }

    const next = document.getElementById('tut-next');
    if (next) {
      next.addEventListener('click', function () {
        if (!TutorialController.active) return;

        if (TutorialController.phase === 'done') {
          /* どちらの編を終えたかで保存先を分けます（v0.6）。
             台本自身が id を持っているので、それで見分けます。 */
          const which = (TutorialController.data && TutorialController.data.id) || 'basic';
          self.saveCleared(which);

          /* 実践編を終えたら、弱いCPUとの対戦をすすめます（仕様書 21.8）。
             ここで「次に何をすればいいか」を示さないと、
             クリアしたあと手が止まります。 */
          if (which === 'advanced' && typeof TutorialFinish !== 'undefined') {
            self.quit();
            TutorialFinish.open();
            return;
          }
          self.quit();
          return;
        }
        if (TutorialController.phase === 'result') {
          TutorialController.finishStep();
          return;
        }
        TutorialController.nextPage();
      });
    }

    const back = document.getElementById('tut-back');
    if (back) {
      back.addEventListener('click', function () {
        if (!TutorialController.active) return;
        TutorialController.prevPage();
      });
    }

    /* ★選択画面を開くたびに、保存の内容を見て表示を作り直します（v0.5.3）。
       ここが無いと、クリアしても画面を開き直すまで
       「クリア済み」や解放の表示が変わりません。 */
    const screen = document.getElementById('screen-tutorial-select');
    if (screen && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(function () {
        if (screen.classList.contains('is-open')) self.refreshSelectScreen();
      });
      obs.observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    this.refreshSelectScreen();
  },
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    TutorialRunner.setup();
    // クリア後の案内も、同じ時機に配線します（v0.6・仕様書 21.8）
    if (typeof TutorialFinish !== 'undefined') TutorialFinish.setup();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialRunner: TutorialRunner };
}
