/* =====================================================================
   v010-cpu.js ― CPU の席（画面側）。AI は Web Worker の中で考える（v0.10）
   ---------------------------------------------------------------------
   AI：gd1 v1.2 の「最強」（今回の検証は最強で行う：ボス決定 2026-10-02）。
       ゲームと同じルール処理（gd1 v1.2 ＋ L14）の上で先読みする。
   ★画面が固まらないよう、AI は Worker で動かす（js/cpu-worker.js を Blob にして作る）。
   ★Worker が作れない環境では、画面の中で考える（そのあいだ画面は止まる）。

   頼み方（すべて「その時点の局面の写し」を一緒に送る：js/v010-snap.js）
     decideMain(side, turnStart, cb)   メインの手 → cb(合法手)（画面の合法手の中の同じ手）
     decidePursuit(side, cb)           追跡 → cb(合法な追跡 / NO_PURSUE)
     decideMulligan(side, cb)          マリガン → cb(uid の並び)
     answerStep(req, info)             歩の中の判断（v010-step.js の asker から）
   ===================================================================== */
'use strict';

const V10Cpu = {
  MODE: 'strong',
  worker: null,
  inline: null,          // Worker が使えないときの、画面の中の Worker（同じ中身）
  seq: 0,
  wait: {},
  cpuSides: [],
  thinkSince: 0,
  _timer: null,
  lastMs: 0,

  /** 対局の始めに呼ぶ */
  start: function (cpuSides, seed) {
    this.stop();
    this.cpuSides = cpuSides.slice();
    this._ensureWorker();
    const customDecks = [];
    try {
      ['village', 'mansion'].forEach(function (s) {
        const id = Game.state.decks && Game.state.decks[s];
        if (id && !DECKS[id] && typeof deckDefOf === 'function' && deckDefOf(id)) customDecks.push(JSON.parse(JSON.stringify(deckDefOf(id))));
      });
    } catch (e) { /* 自作デッキが無ければ空のまま */ }
    this._send({ type: 'init', mode: this.MODE, seed: String(Game.state.seed || ''), cpuSides: this.cpuSides, customDecks: customDecks }, function () {});
  },

  stop: function () {
    this.wait = {};
    this._thinking(false);
  },

  /* ---------------- Worker の用意 ---------------- */
  _ensureWorker: function () {
    if (this.worker || this.inline) return;
    const self = this;
    try {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof __v10CpuWorkerSource !== 'function') throw new Error('no worker');
      const src = '(' + __v10CpuWorkerSource.toString() + ')();';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      this.worker.onmessage = function (e) { self._done(e.data); };
      this.worker.onerror = function (e) { self._fail('Worker のエラー：' + (e && e.message)); };
    } catch (e) {
      /* ★Worker が使えない：同じ中身を画面の中で動かす（考えているあいだ画面は止まる） */
      this.worker = null;
      this.inline = this._makeInline();
    }
  },

  _makeInline: function () {
    const self = this;
    const fake = { postMessage: function (m) { setTimeout(function () { self._done(m); }, 0); } };
    const box = { self: fake, onmessage: null };
    /* Worker の中身を、self を差し替えた関数として動かす */
    const run = new Function('self', '(' + __v10CpuWorkerSource.toString() + ')();');
    run(box);
    return { post: function (m) { setTimeout(function () { box.onmessage({ data: m }); }, 30); } };
  },

  _send: function (msg, cb) {
    const id = ++this.seq;
    msg.id = id;
    this.wait[id] = cb;
    if (this.worker) this.worker.postMessage(msg);
    else this.inline.post(msg);
  },

  _done: function (r) {
    const cb = this.wait[r.id];
    delete this.wait[r.id];
    if (!cb) return;
    this.lastMs = r.ms || 0;
    if (!r.ok) { this._fail(r.error); return; }
    cb(r.result);
  },

  _fail: function (msg) {
    this._thinking(false);
    if (typeof Game !== 'undefined' && Game.state) Game.state.log.push('CPU：考える処理でエラーが起きました（' + String(msg).split('\n')[0] + '）');
    if (typeof showToast === 'function') showToast('CPU の処理でエラーが起きました。ログを確認してください');
    if (typeof V10Cpu.onError === 'function') V10Cpu.onError(msg);
  },

  /* ---------------- 考え中・○秒 ---------------- */
  _thinking: function (on) {
    const self = this;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    const el = (typeof document !== 'undefined') ? document.querySelector('#v8-cpu-think') : null;
    if (!on) {
      if (el) { el.classList.remove('v8-on'); const s0 = el.querySelector('.v10-think-sec'); if (s0) s0.textContent = ''; }
      return;
    }
    this.thinkSince = Date.now();
    if (!el) return;
    el.classList.add('v8-on');
    let sec = el.querySelector('.v10-think-sec');
    if (!sec) { sec = document.createElement('span'); sec.className = 'v10-think-sec'; el.appendChild(sec); }
    const tick = function () { sec.textContent = ' ' + Math.floor((Date.now() - self.thinkSince) / 1000) + '秒'; };
    tick();
    this._timer = setInterval(tick, 500);
  },

  _ask: function (msg, cb) {
    const self = this;
    this._thinking(true);
    this._send(msg, function (res) {
      self._thinking(false);
      if (res && res.budget !== undefined && Game.state) {
        /* ★AI の「気力を貯める計画」は局面に書き込まれる。Worker から戻ってきた値を画面の局面へ写す */
        if (res.budget) Game.state.__r28budget = res.budget; else delete Game.state.__r28budget;
      }
      cb(res);
    });
  },

  /* ---------------- メイン・追跡・マリガン ---------------- */
  decideMain: function (side, turnStart, cb) {
    this._ask({ type: 'main', side: side, snap: V10Snap.pack(Game.state), turnStart: !!turnStart }, function (res) {
      const sig = res.sig || { kind: 'PASS' };
      if (sig.kind === 'PASS') { cb({ kind: 'PASS' }); return; }
      const legal = RULES_ENV.AiCore.legalMainActions(side);
      const hit = legal.find(function (a) {
        return a.kind === sig.kind && (a.inst ? a.inst.uid : null) === sig.uid && (a.face || 0) === (sig.face || 0) &&
          (a.ability || null) === (sig.ability || null) &&
          ((a.target && a.target.uid !== undefined) ? a.target.uid : null) === sig.target;
      });
      if (!hit) Game.state.log.push('CPU：選んだ手がこの場面では打てませんでした（' + sig.kind + '）→ メインを終えます');
      cb(hit || { kind: 'PASS' });
    });
  },

  decidePursuit: function (side, cb) {
    this._ask({ type: 'pursuit', side: side, snap: V10Snap.pack(Game.state) }, function (res) {
      const sig = res.sig || { kind: 'NO_PURSUE' };
      if (sig.kind !== 'PURSUE') { cb({ kind: 'NO_PURSUE' }); return; }
      const legal = RULES_ENV.AiCore.legalPursuits(side);
      const hit = legal.find(function (p) {
        return p.kind === 'PURSUE' && p.youkai.uid === sig.youkai &&
          JSON.stringify((p.humans || [p.human]).map(function (h) { return h.uid; })) === JSON.stringify(sig.humans);
      });
      cb(hit || { kind: 'NO_PURSUE' });
    });
  },

  decideMulligan: function (side, cb) {
    this._ask({ type: 'mulligan', side: side, snap: V10Snap.pack(Game.state) }, function (res) { cb(res.uids || []); });
  },

  /** 歩の中で CPU の席の判断が来た（v010-step.js の asker から）。Worker が同じ歩を進めて答える */
  answerStep: function (req, info) {
    const given = info.answers.length;
    this._ask({ type: 'step', snap: V10Snap.pack(info.snap), op: info.op, answers: info.answers }, function (res) {
      const list = res.answers || [];
      if (list.length <= given) {
        V10Cpu._fail('Worker が答えを出せなかった（' + req.side + '/' + req.type + '）');
        return;
      }
      info.multi(list);
    });
  },

  isCpu: function (side) { return this.cpuSides.indexOf(side) !== -1; },
};
