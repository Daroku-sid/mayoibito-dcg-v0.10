/* =====================================================================
   se.js  ―  効果音（仕様書 23）
   ---------------------------------------------------------------------
   音の素材ファイルは使わず、その場で短い音を合成しています。
   ・素材が無くても鳴る（配布物が軽い）
   ・あとから本物の素材へ差し替えられる（play() の中だけ直せば済みます）

   守っていること（仕様書 23）:
     ・音は短く
     ・同じ音が重なりすぎないようにする（CPU高速時の対策）
     ・鳴らせなくてもゲームを止めない（すべて try で囲っています）
     ・最初のタップより前に鳴らさない
       （ブラウザは操作前の自動再生を止めるため。
         最初の操作があってから音の準備をします）
   ===================================================================== */

'use strict';

const Se = {

  enabled: true,
  volume: 0.6,        // 0〜1
  ctx: null,
  ready: false,       // 最初の操作が済んだか
  _last: {},          // 同じ音を鳴らした時刻

  /* --- 音の種類（仕様書 23 の「最低限推奨」6つ＋ボタン） -------------
     type … 波の形。freq … 高さ（Hz）。dur … 長さ（秒）
     to   … 指定すると、その高さへ滑らせます
     ------------------------------------------------------------------ */
  SOUNDS: {
    button:  { type: 'triangle', freq: 520,  dur: 0.06, gain: 0.35 },
    play:    { type: 'triangle', freq: 440,  to: 660, dur: 0.11, gain: 0.5 },
    pursuit: { type: 'sine',     freq: 300,  to: 520, dur: 0.16, gain: 0.5 },
    attack:  { type: 'sawtooth', freq: 220,  to: 110, dur: 0.20, gain: 0.5 },
    damage:  { type: 'square',   freq: 160,  to: 90,  dur: 0.13, gain: 0.42 },
    win:     { type: 'triangle', freq: 523,  to: 880, dur: 0.42, gain: 0.5 },
    lose:    { type: 'sine',     freq: 330,  to: 130, dur: 0.52, gain: 0.5 },
  },

  /* 同じ音を続けて鳴らすときの最短の間隔（ミリ秒）。
     観戦の超高速でも音が団子にならないようにするためです。 */
  MIN_GAP: 70,

  /* =============================================================
     最初のタップで音の準備をする
     -------------------------------------------------------------
     ブラウザは「利用者が操作する前に音を鳴らす」ことを止めるので、
     最初の1回だけ、操作をきっかけに用意します。
     ============================================================= */
  unlock: function () {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;                 // 使えない環境。無音のまま進みます
      this.ctx = new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.ready = true;
    } catch (e) {
      this.ready = false;              // 用意できなくてもゲームは続きます
    }
  },

  /** 起動時に1回だけ呼ぶ。最初の操作を待って unlock します */
  setup: function () {
    const self = this;
    const once = function () {
      self.unlock();
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('keydown', once);
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('keydown', once);
  },

  /* =============================================================
     鳴らす
     ============================================================= */
  play: function (name) {
    if (!this.enabled) return;
    if (this.volume <= 0) return;

    const spec = this.SOUNDS[name];
    if (!spec) return;

    // 同じ音が重なりすぎないようにする
    const now = Date.now();
    if (this._last[name] && now - this._last[name] < this.MIN_GAP) return;
    this._last[name] = now;

    if (!this.ready) this.unlock();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();

      osc.type = spec.type;
      osc.frequency.setValueAtTime(spec.freq, t);
      if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, t + spec.dur);

      // 立ち上がりと減衰。ぷつっと切れないようにしています
      const peak = (spec.gain || 0.5) * this.volume;
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);

      osc.connect(amp);
      amp.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + spec.dur + 0.02);
    } catch (e) {
      /* 鳴らせなくても進む（仕様書 33-12） */
    }
  },

  /** 音量を変えたときの試聴（仕様書 22.4） */
  preview: function () {
    this._last.button = 0;    // 続けて押しても鳴るように
    this.play('button');
  },
};
