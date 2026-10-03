/* =====================================================================
   cpu-driver.js  ―  CPUのターンを進める（v0.3 Stage C）
   ---------------------------------------------------------------------
   AIは「何をするか」を決めるだけで、画面のことは知りません。
   このファイルが、決まった行動を1つずつ順番に見せていきます（仕様書 4.2）。

       AIが行動を決める
       ↓
       行動キューに積む
       ↓
       1つ取り出す
       ↓
       直前にもう一度「本当に出せるか」を確かめる
       ↓
       使うカードを一時公開して知らせる
       ↓
       ゲームへ適用（人間とまったく同じ関数を通します）
       ↓
       効果を解決して、次の行動へ

   計算が終わった瞬間に盤面を最終結果へ飛ばすことはしません。

   ＊ゲームのルールはここに1行もありません。
     人間が押すのと同じ Game.playUnit / playGoods / playEvent /
     setTracking / skipTracking を呼んでいるだけです（仕様書 4.1）。
   ===================================================================== */

'use strict';

const CpuDriver = {

  /* --- CPU行動速度（仕様書 16） --------------------------------------
     think   … 「CPU思考中…」を出しておく時間
     reveal  … 使うカードを見せている時間
     between … 次の行動へ移るまでの間
     ------------------------------------------------------------------ */
  speed: 'normal',
  SPEEDS: {
    normal:   { think: 700, reveal: 1000, between: 520 },
    fast:     { think: 250, reveal: 450,  between: 200 },
    veryfast: { think: 60,  reveal: 120,  between: 50 },   // 観戦専用（仕様書 20.7）
  },

  /* 進行が二重に走らないようにする鍵（仕様書 28） */
  busy: false,

  /* --- 一時停止（仕様書 20.5） ---------------------------------------
     止めるのは「行動と行動のあいだ」だけです。
     演出の途中では止めないので、カードが宙に浮いたまま固まったり、
     効果が半分だけ解決された状態になったりしません。
     ------------------------------------------------------------------ */
  paused: false,
  _resumeFn: null,

  /* 止めている理由。ひとつでも残っていれば動きません。
       'user'  … 観戦バーの一時停止ボタン
       'modal' … 設定・ログ・確認ダイアログなどを開いているあいだ（仕様書 28）
     理由ごとに持つのは、設定を閉じたときに
     「利用者が止めていたのに勝手に動き出す」ことを防ぐためです。 */
  _holds: {},

  /** 一時停止中なら続きを預かって true を返す（呼び出し側はそこで return） */
  _gate: function (next) {
    if (!this.paused) return false;
    this._resumeFn = next;
    return true;
  },

  /** 理由をつけて止める */
  hold: function (reason) {
    this._holds[reason || 'user'] = true;
    this.paused = true;
  },

  /** その理由を取り下げる。理由がすべて無くなったら動き出す */
  release: function (reason) {
    delete this._holds[reason || 'user'];
    if (Object.keys(this._holds).length > 0) return;
    if (!this.paused) return;
    this.paused = false;
    const fn = this._resumeFn;
    this._resumeFn = null;      // 連打しても二重に動かないよう、先に消す
    if (fn) fn();
  },

  /** 観戦バーの一時停止・再開 */
  pause: function () { this.hold('user'); },
  resume: function () { this.release('user'); },

  /** 利用者が自分で止めているか（設定を開いているだけの状態と区別する） */
  isUserPaused: function () { return !!this._holds.user; },

  /** 観戦をやめるときの後始末 */
  stop: function () {
    this._holds = {};
    this.paused = false;
    this._resumeFn = null;
    this.busy = false;
    this.showThinking(false);
  },

  gap: function (key) {
    const set = this.SPEEDS[this.speed] || this.SPEEDS.normal;
    return ms(set[key]);
  },

  /* =============================================================
     1ターンぶんを進める
     -------------------------------------------------------------
     ターン開始の襲撃・開始時効果・気力・ドローは preview.js の
     runTurnStart が済ませています。ここはメイン以降です。
     ============================================================= */
  runTurn: function (side) {
    if (this.busy) return;          // 二重起動よけ
    this.busy = true;
    this._turnStart = true;         // ★v0.10：そのターン最初の判断で AI の「ターン開始」の処理を呼ぶ

    const self = this;
    // ターンの入口は安全な区切り
    if (this._gate(function () { self.busy = false; self.runTurn(side); })) return;

    view.locked = true;
    view.handSelected = -1;
    setCandidate(null, null);
    closeQuickDetail();
    renderAll();

    this.showThinking(true);

    setTimeout(function () {
      self.showThinking(false);
      self._mainStep(side);
    }, self.gap('think'));
  },

  /* =============================================================
     メイン：出せる手がなくなるまで1つずつ
     ============================================================= */
  _mainStep: function (side) {
    const self = this;
    const st = Game.state;

    // 1手ごとの区切りで止める
    if (this._gate(function () { self._mainStep(side); })) return;

    if (!st || st.gameOver) { this._finish(); return; }
    if (st.currentSide !== side) { this._finish(); return; }   // 念のため

    /* ★v0.10：手は Worker の中の AI（gd1 v1.2 最強）が決める。返ってくるのは、画面の合法手の中の同じ手 */
    const turnStart = !!this._turnStart;
    this._turnStart = false;
    V10Cpu.decideMain(side, turnStart, sessionGuard(function (act) {
      if (!Game.state || Game.state.gameOver) { self._finish(); return; }
      // 「もう何もしない」なら追跡へ
      if (!act || act.kind === 'PASS') { self._toPursuit(side); return; }

      // --- 使うカードを一時公開してから適用する（仕様書 14.3） ---
      self.reveal(act.inst, function () {
        self.notify(self._actionText(act));
        V10Step.run({ op: 'mainAction', args: { side: side } }, sessionGuard(function (r) {
          if (!r || r.ok === false) {
            Game.state.log.push('CPU：処理できなかったため取りやめました');
            self._toPursuit(side);
            return;
          }
          renderAll();
          runPendingEffects(function () {
            renderAll();
            if (Game.state.gameOver) { self._finish(); return; }
            setTimeout(function () { self._mainStep(side); }, self.gap('between'));
          });
        }), { carry: act, name: 'cpu ' + act.kind });
      });
    }));
  },

  /* =============================================================
     追跡（仕様書 19）
     ★v0.10：ボスの順（メイン → 追跡選択 → 終了時効果）。終了時効果は goToEndPhase が解く
     ============================================================= */
  _toPursuit: function (side) {
    const self = this;
    const st = Game.state;

    if (this._gate(function () { self._toPursuit(side); })) return;

    if (!st || st.gameOver) { this._finish(); return; }

    if (st.phase === 'main') Game.endMain();
    if (st.phase === 'endEffects') Game.toTrackingPhase();

    if (st.phase !== 'tracking') {
      this.notify(this.who() + 'は追跡しませんでした。');
      renderAll();
      setTimeout(function () { self._endTurn(); }, self.gap('between'));
      return;
    }

    V10Cpu.decidePursuit(side, sessionGuard(function (opt) {
      if (!Game.state || Game.state.gameOver) { self._finish(); return; }
      if (!opt || opt.kind !== 'PURSUE') {
        Game.skipTracking(side);
        self.notify(self.who() + 'は追跡しませんでした。');
        renderAll();
        setTimeout(function () { self._endTurn(); }, self.gap('between'));
        return;
      }
      const humans = opt.humans || [opt.human];
      self.notify(self.who() + 'が' + humans.map(function (h) { return '《' + h.master.name + '》'; }).join('と') + 'を追跡します。');
      V10Step.run({ op: 'setTracking', args: { side: side } }, sessionGuard(function (r) {
        if (r && r.ok === false) { Game.skipTracking(side); renderAll(); setTimeout(function () { self._endTurn(); }, self.gap('between')); return; }
        showBanner('追跡開始');
        setTimeout(function () { renderAll(); }, 60);
        setTimeout(function () { hideBanner(); self._endTurn(); }, self.gap('reveal'));
      }), { carry: { youkai: opt.youkai, humans: humans }, name: 'cpu setTracking' });
    }));
  },

  /* =============================================================
     追跡の誘発 → 終了時効果 → ターン終了（preview.js の流れに戻す）
     ============================================================= */
  _endTurn: function () {
    const self = this;
    if (this._gate(function () { self._endTurn(); })) return;

    this.busy = false;      // 以降は preview.js の流れに戻す
    goToEndPhase();
  },

  _finish: function () {
    this.busy = false;
    if (Game.state && Game.state.gameOver) finishWithResult();
  },

  /* =============================================================
     見せ方
     ============================================================= */

  /** CPUの呼び名（ログと通知に使う） */
  who: function () {
    const st = Game.state;
    const side = st ? st.currentSide : null;
    return (side && Game.labelOf(side)) || 'CPU';
  },

  /** 「CPU思考中…」の出し入れ */
  showThinking: function (on) {
    const el = document.getElementById('cpu-thinking');
    if (el) el.classList.toggle('is-on', !!on);
    /* ★v0.8：新しい盤面へも同じことを知らせます。
       既存の表示は盤面の裏に隠れるためです。 */
    if (typeof window !== 'undefined' && window.__v8CpuThinking) {
      try { window.__v8CpuThinking(!!on); } catch (e) { /* 表示の都合で止めない */ }
    }
  },

  /**
   * 使うカードを画面中央に一時公開する（仕様書 14.3）。
   * CPUの手札の中身が、使う前に見えてしまわないようにするための場所です。
   */
  reveal: function (inst, next) {
    const el = document.getElementById('cpu-reveal');
    if (!el || !inst) { next(); return; }

    const img = el.querySelector('.cpu-reveal__card');
    const name = el.querySelector('.cpu-reveal__name');
    const path = getCardImagePath(inst.cardId, inst.owner);

    img.style.backgroundImage = path ? 'url("' + path + '")' : '';
    name.textContent = inst.master.name;
    if (typeof window !== 'undefined' && window.__v8CpuReveal) {
      try { window.__v8CpuReveal(inst.cardId, inst.owner, inst.master.name); } catch (e) { /* 同上 */ }
    }
    el.classList.add('is-on');
    Se.play('play');

    const hold = this.gap('reveal');
    setTimeout(function () {
      el.classList.remove('is-on');
      if (typeof window !== 'undefined' && window.__v8CpuReveal) {
        try { window.__v8CpuReveal(null); } catch (e) { /* 同上 */ }
      }
      setTimeout(next, ms(180));
    }, hold);
  },

  /** 短い通知とログの両方へ残す（仕様書 15.2） */
  notify: function (text) {
    if (!text) return;
    showToast(text);
    if (Game.state) Game.state.log.push(text);
  },

  /** 行動を日本語の1行にする */
  _actionText: function (act) {
    const who = this.who();
    const n = act.inst ? '《' + act.inst.master.name + '》' : '';
    if (act.kind === 'PLAY_HUMAN')  return who + 'が' + n + 'を登場させました。';
    if (act.kind === 'PLAY_YOUKAI') return who + 'が' + n + 'を登場させました。';
    if (act.kind === 'PLAY_EVENT')  return who + 'が' + n + 'を使用しました。';
    if (act.kind === 'EQUIP_GOODS') {
      const t = act.target ? '《' + act.target.master.name + '》に' : '';
      return who + 'が' + t + n + 'を装備しました。';
    }
    if (act.kind === 'ACTIVATE') return who + 'が' + n + 'の能力を使いました。';   // ★v0.10：起動型の能力
    return '';
  },

  /* =============================================================
     マリガン（CPUは自動。手札は見せません）
     ============================================================= */
  runMulligan: function (side, done) {
    /* ★v0.10：マリガンも Worker の AI が決める（戻す札の uid） */
    V10Cpu.decideMulligan(side, function (uids) {
      const count = Game.confirmMulligan(side, uids);
      setTimeout(function () { done(count); }, ms(400));
    });
  },
};
