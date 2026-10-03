/* =====================================================================
   cpu-worker-main.js ― CPU の Worker の本体（v0.10）
   ---------------------------------------------------------------------
   ★このファイルは Worker の中で動く（画面では読まない）。
     tools/build-cpu-worker.js が、乱数・歩の表・局面の写し・AI の束と一緒に
     js/cpu-worker.js（1つの関数）にまとめる。画面はその関数を Blob にして Worker を作る
     （別ファイルを読み込まないので、スマホでファイルを直接開いても動く）。

   やり取り（画面 → Worker）
     init   { mode, seed, cpuSides, customDecks }   AI を作る（対局ごとに1回）
     main   { side, snap, turnStart }                メインの手 → { sig, budget }
     pursuit{ side, snap }                           追跡 → { sig, budget }
     mulligan{ side, snap }                          マリガン → { uids }
     step   { snap, op, answers }                    歩の中の判断 → { answers, stopped }
               ★AI の席の判断は AI がその場で答える。人の席の判断が来たら、そこで止めて返す
   ===================================================================== */
'use strict';

const W = { env: null, ai: null, agents: {}, cpuSides: [], key: null };

function sigMain(a) {
  if (!a) return { kind: 'PASS' };
  return { kind: a.kind, uid: a.inst ? a.inst.uid : null, face: a.face || 0, target: a.target ? (a.target.uid !== undefined ? a.target.uid : null) : null, ability: a.ability || null };
}
function sigPursuit(p) {
  if (!p || p.kind !== 'PURSUE') return { kind: 'NO_PURSUE' };
  return { kind: 'PURSUE', youkai: p.youkai.uid, humans: (p.humans || [p.human]).map(function (h) { return h.uid; }) };
}

function init(m) {
  W.env = GD1CpuAI.createRulesEnv({ createRng: createRng, GameEvents: null, GAME_EVENT: {} });
  W.env.Game.__v10AiCore = W.env.AiCore;
  W.env.Game.__v10Effects = W.env.Effects;
  (m.customDecks || []).forEach(function (d) { W.env.RuntimeDecks.set(d.id, d); });
  W.ai = GD1CpuAI.createAiFactory(W.env, m.mode || 'strong');
  W.cpuSides = m.cpuSides.slice();
  W.agents = {};
  W.cpuSides.forEach(function (s) { W.agents[s] = W.ai.create(s, String(m.seed || '') + ':' + s); });
  return { label: W.ai.label, id: W.ai.id };
}

function load(snap) {
  W.env.Game.state = V10Snap.unpack(snap, W.env.CARD_MASTER, createRng);
  return W.env.Game.state;
}

function decideMain(m) {
  const st = load(m.snap), ag = W.agents[m.side];
  if (m.turnStart && ag.onTurnStart) ag.onTurnStart();
  const legal = W.env.AiCore.legalMainActions(m.side);
  const act = ag.chooseMainAction(legal);
  return { sig: sigMain(act), budget: st.__r28budget || null, think: act && act.think ? act.think : null };
}
function decidePursuit(m) {
  const st = load(m.snap), ag = W.agents[m.side];
  const p = ag.choosePursuit(W.env.AiCore.legalPursuits(m.side));
  return { sig: sigPursuit(p), budget: st.__r28budget || null };
}
function decideMulligan(m) {
  load(m.snap);
  const u = W.agents[m.side].chooseMulligan();
  return { uids: (u || []).slice() };
}

/* 歩の中の判断：記録の答えを前から使い、AI の席は AI が答え、人の席に来たら止まる */
function runStep(m) {
  const G = W.env.Game;
  const st = load(m.snap);
  const given = m.answers || [];
  const out = [];
  let pos = 0;
  const STOP = { __stop: true };
  function opsFor(side, item) {
    const agent = W.agents[side];
    const aiOps = agent ? W.env.AiUiOps.create(agent, item) : null;
    function one(name) {
      const type = V10Ser.TYPE[name];
      return function (a, b, c) {
        /* confirmYesNo(title, message, cb) と、ほか (options, cb) の2つの形 */
        const options = (name === 'confirmYesNo') ? {} : a;
        const cb = (name === 'confirmYesNo') ? c : b;
        /* ★画面（V10Step.ops）と同じく、候補が空なら記録せずに null を返す（記録の位置がずれないように） */
        if (name === 'pickBoardTarget' && !(options.candidates || []).length) { cb(null); return; }
        if (name === 'pickOption' && !(options.options || []).length) { cb(null); return; }
        if (pos < given.length) {
          const g = given[pos++];
          if (g.type !== type || g.side !== side) throw new Error('Worker：進行の食い違い（記録 ' + g.side + '/' + g.type + ' ⇔ ' + side + '/' + type + '）');
          out.push(g);
          cb(V10Ser.des(type, options, g.v));
          return;
        }
        if (!aiOps) throw STOP;                       // 人の席：ここで止めて画面に聞いてもらう
        pos++;
        const call = function (raw) { out.push({ type: type, side: side, v: V10Ser.ser(type, options, raw) }); cb(raw); };
        if (name === 'confirmYesNo') aiOps.confirmYesNo(a, b, call);
        else if (aiOps[name]) aiOps[name](options, call);
        else throw new Error('Worker：AI に ' + name + ' が無い');
      };
    }
    return {
      showCards: function (cards, next) { next(); },
      confirmYesNo: one('confirmYesNo'), pickCards: one('pickCards'), pickBoardTarget: one('pickBoardTarget'),
      pickOption: one('pickOption'), pickOrder: one('pickOrder'),
    };
  }
  ['village', 'mansion'].forEach(function (s) { G.setDecisionProvider(s, function (item) { return opsFor(s, item); }); });
  try {
    V10Ops.exec(G, m.op, st.__v10carry, opsFor);
  } catch (e) {
    if (e === STOP) return { answers: out, stopped: true, budget: G.state.__r28budget || null };
    throw e;
  }
  return { answers: out, stopped: false, budget: G.state.__r28budget || null };
}

self.onmessage = function (e) {
  const m = e.data, t0 = Date.now();
  let result;
  try {
    if (m.type === 'init') result = init(m);
    else if (m.type === 'main') result = decideMain(m);
    else if (m.type === 'pursuit') result = decidePursuit(m);
    else if (m.type === 'mulligan') result = decideMulligan(m);
    else if (m.type === 'step') result = runStep(m);
    else throw new Error('Worker：知らない頼み ' + m.type);
    self.postMessage({ id: m.id, ok: true, result: result, ms: Date.now() - t0 });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err && err.stack || err), ms: Date.now() - t0 });
  }
};
