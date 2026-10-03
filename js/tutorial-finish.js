/* =====================================================================
   tutorial-finish.js  ―― 実践編クリア後の案内（仕様書 21.8）
   ---------------------------------------------------------------------
   学び終えた直後は、いちばん手が止まりやすい場面です。
   「次は弱いCPUと戦ってみましょう」と道を示し、
   そのまま始められるようにします。

   設定は仕様書 21.8 のとおり、決め打ちです。
     使用デッキ  … 公式ヨマモリ村
     相手デッキ  … 公式黒薔薇の館
     難易度      … 弱
     先攻・後攻  … ランダム
     シード      … ランダム

   ボタンは3つ。
     対戦開始        … この設定ですぐ始める
     設定を変更する  … 通常のCPU対戦の設定画面へ
     戻る            … チュートリアル選択へ
   ===================================================================== */
const TutorialFinish = {

  /** 仕様書 21.8 の推奨設定 */
  RECOMMENDED: {
    playerDeck: 'village',
    cpuDeck: 'mansion',
    difficulty: 'weak',
    firstPlayer: 'random',
    seedMode: 'random',
  },

  /** 案内を開く（実践編をクリアした直後に呼ばれます） */
  open: function () {
    if (typeof Screens === 'undefined') return false;
    Screens.reset('mode');
    Screens.goNow('tutorial-finish');
    Screens.riseIn();
    return true;
  },

  /* =============================================================
     画面の配線（読み込み時に一度だけ）
     ============================================================= */
  setup: function () {
    const self = this;

    const start = document.getElementById('tfin-start');
    if (start) {
      start.addEventListener('click', function () {
        if (start.disabled) return;
        start.disabled = true;
        const ok = self.startRecommended();
        if (!ok) start.disabled = false;
      });
    }

    const config = document.getElementById('tfin-config');
    if (config) {
      config.addEventListener('click', function () {
        /* 通常のCPU対戦の設定画面へ送ります。
           推奨の設定を入れた状態で開くので、
           変えたいところだけ直せます。 */
        self.applyRecommended();
        if (typeof Screens === 'undefined') return;
        Screens.reset('mode');
        Screens.goNow('battle-mode');
        Screens.goNow('cpu-setup');
        Screens.riseIn();
      });
    }

    const back = document.getElementById('tfin-back');
    if (back) {
      back.addEventListener('click', function () {
        if (typeof Screens === 'undefined') return;
        Screens.reset('mode');
        Screens.goNow('tutorial-select');
        Screens.riseIn();
        if (typeof TutorialRunner !== 'undefined') TutorialRunner.refreshSelectScreen();
      });
    }
  },

  /** 推奨設定を、CPU対戦の設定へ書き込む */
  applyRecommended: function () {
    if (typeof Screens === 'undefined' || !Screens.cpu) return false;
    const r = this.RECOMMENDED;
    Screens.cpu.playerDeck = r.playerDeck;
    Screens.cpu.cpuDeck = r.cpuDeck;
    Screens.cpu.difficulty = r.difficulty;
    Screens.cpu.firstPlayer = r.firstPlayer;
    Screens.cpu.seedMode = r.seedMode;
    if (Screens._renderCpu) Screens._renderCpu();
    return true;
  },

  /** 推奨設定のまま対戦を始める */
  startRecommended: function () {
    if (!this.applyRecommended()) return false;

    /* ★通常のCPU対戦とまったく同じ道を通します。
       ここで独自に startGame を呼ぶと、
       画像の先読みやデッキの下ごしらえが抜けます（v0.5.1の教訓）。 */
    if (typeof Screens._startCpuMatch !== 'function') return false;
    return Screens._startCpuMatch();
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialFinish: TutorialFinish };
}
