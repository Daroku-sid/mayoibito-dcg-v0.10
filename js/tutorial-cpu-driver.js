/* =====================================================================
   tutorial-cpu-driver.js  ―― 相手を台本どおりに動かす（仕様書 20.4／23.2）
   ---------------------------------------------------------------------
   通常のAI（ai-player.js）は使いません。
   チュートリアルでは相手の動きも決め打ちにする必要があるためです。
   画面の難易度表示は「弱」ですが、実際には台本で動いています（仕様書 19.1）。

   【一括で実行しない理由】（仕様書 20.4）
   相手が4手を一気に済ませてしまうと、
   何が起きたのか分からないまま盤面だけが変わります。
   そこで1手ごとに止めて、説明を読んでもらってから次へ進みます。

   読み込み順： … → tutorial-actions → tutorial-cpu-driver
   ===================================================================== */

const TutorialCpuDriver = {

  running: false,
  _timer: null,

  /* 1手を見せてから次へ進むまでの間。
     短いと読む前に流れ、長いと待たされます。 */
  STEP_WAIT_MS: 900,

  /* =============================================================
     台本を動かしはじめる
     -------------------------------------------------------------
       ops … 画面側から渡してもらう道具一式
         ops.play(side, cardId)         カードを出す
         ops.pursue(side, cardId, targetId)  追跡を指定する
         ops.confirm(side)              追跡を確定してターンを終える
         ops.say(text, next)            説明を出し、読み終わったら next()
         ops.render()                   盤面を描き直す
     ============================================================= */
  start: function (ops, onDone) {
    this.stop();
    this.running = true;
    this._ops = ops || {};
    this._onDone = onDone || function () {};
    this.next();
  },

  stop: function () {
    this.running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  },

  /* =============================================================
     次の1手
     ============================================================= */
  next: function () {
    if (!this.running) return;

    const action = TutorialController.nextCpuAction();
    if (!action) { this.finish(); return; }

    this.perform(action);
  },

  /* =============================================================
     1手を実行して、説明を出す
     -------------------------------------------------------------
     順番が大切です。
     「動かしてから説明する」ので、盤面を見ながら読めます。
     説明を先に出すと、何もない盤面の話をすることになります。
     ============================================================= */
  perform: function (action) {
    const ops = this._ops;
    const side = TutorialController.data.fixed.cpuSide;
    const self = this;

    /* ★演出が終わってから説明を出します（v0.5.4）。
       以前は動かした直後に説明を出していたので、
       カードが出てくる様子が説明ウィンドウに隠れて見えませんでした。
       done(ok) は、登場や追跡の演出が一通り終わってから呼ばれます。 */
    const done = function (ok) {
      if (!self.running) return;

      /* 台本どおりに動かせなかったときは、黙って先へ進めません。
         ここで止まらないと、説明と盤面が食い違ったまま進みます。 */
      if (ok === false) {
        if (ops.onError) ops.onError(action);
        self.stop();
        return;
      }

      if (action.say && ops.say) {
        ops.say(action.say, function () { self.next(); });
      } else {
        self._timer = setTimeout(function () { self.next(); }, self.STEP_WAIT_MS);
      }
    };

    if (action.action === 'play' && ops.play) {
      ops.play(side, action.cardId, action.zone, done);
    } else if (action.action === 'pursue' && ops.pursue) {
      ops.pursue(side, action.cardId, action.targetId, done);
    } else if (action.action === 'confirm' && ops.confirm) {
      ops.confirm(side, done);
    } else {
      done(false);
    }
  },

  finish: function () {
    this.running = false;
    const done = this._onDone;
    this._onDone = null;
    if (done) done();
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialCpuDriver: TutorialCpuDriver };
}
