/* =====================================================================
   match-flow.js ― 対戦を進めるところ（v0.9 Phase 5-1）
   ---------------------------------------------------------------------
   ★ここは「進める」入口です。読むだけの match-view.js とは分けています。

   これまで preview.js（旧画面のファイル）の中にありました。
   ★preview.js には「旧画面の描き方」と「ゲームの進行」が
     同居しています。旧画面を消すには、先に進行のほうを
     外へ出しておく必要があります。

   ---------------------------------------------------------------------
   ★いまは「呼ぶ側」だけを移しています
   ---------------------------------------------------------------------
   進行の中身（ターンの終わり方、描き直し）は、まだ preview.js に
   あります。呼ぶための口（window.__matchCall）を通しています。

   ★中身ごと一度に動かすと、実行順が変わって
     同じ種でも結果が変わることがあります。
     まず呼ぶ側を移し、そのあとで中身を移します。
   ===================================================================== */

'use strict';

/** 読むための窓 */
function __mf_read() {
  return (typeof window !== 'undefined' && window.__matchRead) ? window.__matchRead : null;
}
/** 進めるための口 */
function __mf_call() {
  return (typeof window !== 'undefined' && window.__matchCall) ? window.__matchCall : null;
}

/* =====================================================================
   ターンを終える
   ===================================================================== */
window.__v8EndTurn = function () {
  const r = __mf_read(); const c = __mf_call();
  if (!r || !c || !r.play().active) return false;
  c.endTurnFlow();
  return true;
};

/* =====================================================================
   追跡せずにターンを終える
   ---------------------------------------------------------------------
   ★既存の「ターン終了」の流れをそのまま通します。
   ★ここでターンを直に終わらせていたため、
     ・「まだ使えるカードがあります」の確認が出ない
     ・台本への合図も出ない
     という形になり、気力を貯める場面で進めなくなっていました。
   ===================================================================== */
window.__v8SkipTracking = function () {
  const r = __mf_read(); const c = __mf_call();
  if (!r || !c || !r.play().active || !Game.state) return false;
  c.endTurnFlow();
  return true;
};

/* =====================================================================
   メインフェイズを終える
   ---------------------------------------------------------------------
   ★メインを終えるのは、ターンを終えるのとは別の操作です。
     v0.8 で追跡が独立したので
     「メイン終了 → 追跡フェイズ → 追跡を確定」の順になりました。

   ★同じボタンが、場面によって違う意味になります。
     追跡できる怪異がいればメインを終えるだけ、
     いなければそのままターンが終わります。
     ★片方の名前だけで判定すると、もう片方の場面で押せなくなります。
   ===================================================================== */
window.__v8EndMain = function () {
  const r = __mf_read(); const c = __mf_call();
  if (!r || !c || !r.play().active || !Game.state) return null;
  if (!TutorialActions.allowAny(['endMain', 'endTurn'], {})) return null;
  if (Game.state.phase === 'main') {
    /* ★v0.10（ボス決定 2026-10-02）：メイン → 追跡選択 → ターン終了時効果。
       gd1 は endMain のあと「終了時効果」の段（endEffects）に入るので、
       ここでそのまま追跡の段へ進めます（追跡できる組が無ければ 'end'）。
       ★終了時効果は追跡を決めたあと（goToEndPhase）で解きます。 */
    Game.endMain();
    Game.toTrackingPhase();
    c.renderAll();
    TutorialActions.notify('mainEnded', {});
  }
  return Game.state.phase;
};

/* =====================================================================
   同じ設定でもう一度
   ===================================================================== */
window.__v8RestartMatch = function () {
  if (typeof Screens !== 'undefined' && Screens.restartLast) Screens.restartLast();
};

/* =====================================================================
   設定を変える
   ---------------------------------------------------------------------
   ★対戦中の設定パネルと、ホームの設定は、ここを共通の入口にします。
     2つ作ると必ず食い違います。
   ===================================================================== */
window.__v8SettingsSet = function (key, value) {
  const r = __mf_read(); const c = __mf_call();
  const mode = r ? r.match().mode : '';

  if (key === 'cpuActionSpeed') {
    if (typeof CpuDriver !== 'undefined') CpuDriver.speed = value;
    /* 観戦の速さは、その場かぎりです（保存しません） */
    if (mode === 'watch') { if (c) c.updateWatchBar(); return; }
  }

  Screens.settings[key] = value;
  Screens._applySettings();

  if (key === 'seEnabled' && value === 'on') Se.preview();
  if (key === 'mirrorLanes' && c) c.renderAll();
  /* ★「動きを減らす」は新しい盤面へすぐ反映します（21.2） */
  if (key === 'reduceMotion' && typeof V8Battle !== 'undefined') {
    V8Battle.applyReduceMotion(!!value);
  }
};

/* =====================================================================
   ★チュートリアルの台本と、新しい画面をつなぐ
   ---------------------------------------------------------------------
   台本は「◯◯した」という合図で次へ進みます。
   ★合図を出さないと、操作しても台本が進まず、
     同じ指示が出続けて先へ行けなくなります
     （マリガン・追跡・選択画面で、実際に起きました）。

   ★許すかどうかも、ここで見ます。
     選ぶところで断らないと、確定してから断られることになります。
   ===================================================================== */
/** 選択画面で1枚を選んでよいか（台本が指した札だけ） */
window.__v8PickAllow = function (inst) {
  if (!inst) return true;
  return TutorialActions.allow('pickCard', { cardId: inst.cardId });
};

/**
 * ★グッズを付ける相手を選んでよいか（v0.9）。
 * 台本では「そのカードを出す」操作として書かれています。
 * ★選ぶところで断らないと、確定してから断られることになります。
 */
window.__v8EquipAllow = function (sourceCardId, inst) {
  if (!inst) return true;
  return TutorialActions.allow('playCard', {
    cardId: sourceCardId, targetId: inst.cardId,
  });
};

/** 確定を押してよいか */
window.__v8PickConfirmAllow = function (n) {
  return TutorialActions.allow('pickConfirm', { count: n });
};

/** 札を選んだ／外した（新しい画面から呼ばれます） */
window.__v8MulliganAllowSelect = function (uid) {
  const r = __mf_read();
  if (!r) return true;
  const side = r.play().mulliganSide;
  const inst = (Game.state.players[side].hand || []).find(function (h) {
    return String(h.uid) === String(uid);
  });
  if (!inst) return true;
  /* ★台本が指したカードだけを選べます（チュートリアル以外は素通り） */
  return TutorialActions.allow('mulliganSelect', { cardId: inst.cardId });
};

/** 確定を押してよいか（台本がそこまで進んでいるか） */
window.__v8MulliganAllowConfirm = function () {
  return TutorialActions.allow('mulliganConfirm', {});
};

/** 全員ぶんのマリガンが済んだ */
window.__v8MulliganNotifyDone = function () {
  TutorialActions.notify('mulliganDone', {});
};

/** いま選んでいる札を台本へ伝える */
window.__v8MulliganNotifySelected = function (uids) {
  const r = __mf_read();
  if (!r) return;
  const side = r.play().mulliganSide;
  const hand = Game.state.players[side].hand || [];
  const chosen = (uids || []).map(function (uid) {
    const c = hand.find(function (h) { return String(h.uid) === String(uid); });
    return c ? c.cardId : null;
  }).filter(Boolean);
  TutorialActions.refresh();
  TutorialActions.notify('mulliganSelected', { cardIds: chosen });
};

/**
 * ★仮の追跡を決めたことを、台本へ伝えます（v0.9）。
 * ---------------------------------------------------------------------
 * ★追跡フェイズは v0.8 で新しくなり、指でつなぐ形になりました。
 *   旧画面の setCandidate が出していた合図が、こちらからは
 *   出ていませんでした。★そのため、つないでも台本が進まず、
 *   市松人形の場面で先へ行けなくなっていました。
 *
 * @return {boolean} 台本が認めた組み合わせか。false ならつなげません。
 */
window.__v8TrackPicked = function (youkaiUid, humanUid) {
  const r = __mf_read();
  if (!r || !r.play().active || !Game.state) return true;
  const st = Game.state;
  const side = r.turnSide();
  const otherSide = function (x) { return (x === 'village') ? 'mansion' : 'village'; };
  const ky = String(youkaiUid), kh = String(humanUid);
  let y = null, h = null;
  (st.players[side].youkai || []).forEach(function (c) { if (String(c.uid) === ky) y = c; });
  (st.players[otherSide(side)].humans || []).forEach(function (c) { if (String(c.uid) === kh) h = c; });
  if (!y || !h) return true;

  /* ★台本が指した組み合わせだけを認めます（チュートリアル以外は素通り） */
  if (!TutorialActions.allow('selectPursuit', {
    cardId: y.cardId, targetId: h.cardId,
  })) return false;

  TutorialActions.refresh();
  TutorialActions.notify('pursuitSelected', {
    cardId: y.cardId, targetId: h.cardId,
  });
  return true;
};
/* =====================================================================
   カードの絵の先読み
   ---------------------------------------------------------------------
   ★いま見えるものを先に、残りをあとから読みます。
     全部まとめて読むと、対戦が始まるまで待たされます。
   ===================================================================== */
window.__v8BeginImages = function () {
  const r = __mf_read(); const c = __mf_call();
  if (!r || !c) return;
  if (typeof V8Images === 'undefined' || !Game.state) return;
  const st = Game.state;
  const first = [];
  const rest = [];
  const add = function (list, cardId, owner) {
    const p = c.cardImagePath(cardId, owner);
    if (p && list.indexOf(p) < 0) list.push(p);
  };

  ['village', 'mansion'].forEach(function (side) {
    const p = st.players[side];
    if (!p) return;
    if (p.field) add(first, p.field.cardId, side);                       // フィールド
    (p.humans || []).forEach(function (c) { add(first, c.cardId, side); }); // 初期の場
    (p.youkai || []).forEach(function (c) { add(first, c.cardId, side); });
  });
  /* 自分の手札は拡大するとすぐ見えるので、先に読む */
  const me = st.players[r.bottomSide()];
  if (me) (me.hand || []).forEach(function (c) { add(first, c.cardId, me === st.players.village ? 'village' : 'mansion'); });

  /* 残り（山札・トラッシュにあるもの）は裏で読む */
  ['village', 'mansion'].forEach(function (side) {
    const p = st.players[side];
    if (!p) return;
    ['deck', 'hand', 'trash', 'lost'].forEach(function (zone) {
      (p[zone] || []).forEach(function (c) { add(rest, c.cardId, side); });
    });
  });

  V8Images.begin(first, rest.filter(function (p) { return first.indexOf(p) < 0; }));
};

window.__v8ReleaseImages = function () {
  if (typeof V8Images !== 'undefined') V8Images.release();
};
/* =====================================================================
   マリガンの入口・リザルトの行き先・別画面を開く
   ===================================================================== */

/* =====================================================================
   マリガンの入口・リザルトの行き先・別の画面を開く
   ===================================================================== */
/** 新しい盤面が同時マリガンを引き受けられるか */
window.__v8MulliganTakeover = function () {
  /* ★v0.9：全モードで新しい画面を使います。
     ひとり回しは「両者の手札を常に表向き」と決まったので、
     隠すために旧画面へ逃げる必要がなくなりました。
     観戦は人が選ばないので、配る演出だけを見せます。 */
  if (typeof V8Mulligan === 'undefined' || typeof V8Battle === 'undefined') return false;
  return true;
};

/** マリガンを終えて第1ターンへ */
window.__v8MulliganFinish = function () {
  const c = __mf_call();
  if (!c) return;
  c.state().mulliganSelected = [];
  /* ★台本へ「マリガンが済んだ」と伝えます（v0.9）。
     ★伝えないと、確定しても台本がマリガンの章から進みません。 */
  if (window.__v8MulliganNotifyDone) window.__v8MulliganNotifyDone();
  c.finishMulligan();
};

/** 同じ設定で再戦する（新しい種で最初から） */
window.__v8ResultRestart = function () {
  const c = __mf_call();
  if (!c) return false;
  c.closeResultScreen();
  if (typeof Screens !== 'undefined' && Screens.restartLast) Screens.restartLast();
  return true;
};

/** プレイしたモードの入口へ戻る */
window.__v8ResultForward = function () {
  const r = __mf_read(); const c = __mf_call();
  if (!r || !c) return false;
  c.closeResultScreen();
  /* 観戦は「対戦の設定」へ戻る先がないので、観戦をやめます */
  if (r.match().mode === 'watch') { c.quitWatching(); return true; }
  c.backToSetupScreen(Screens.lastSetup);
  return true;
};

/** 設定を開く（新しい盤面の設定ボタンから呼ばれます） */
window.__v8OpenSettings = function () {
  const c = __mf_call();
  if (c) c.openSettings();
};

/** 遊び方（既存の画面を一時的に前へ出し、閉じたら戻します） */
window.__v8OpenHowto = function () {
  const root = document.getElementById('v7-root');
  if (root) root.classList.add('v7-hidden');
  window.__v8HowtoBack = true;
  const c = __mf_call();
  if (c) c.openHowtoSheet();
};
/* =====================================================================
   カードを出す・選ぶ・追跡を確定する
   ===================================================================== */
/**
 * 新しい画面からカードを出す。
 * @param {string} uid       手札のカードの uid
 * @param {string} kind      'unit' / 'event' / 'equip'
 * @param {string} targetUid kind==='equip' のとき、付ける相手の uid
 * @return {boolean} 呼べたかどうか（置けるかどうかは既存処理が判断する）
 */
window.__v8PlayCard = function (uid, kind, targetUid) {
  const spec = window.__v8HandSpec(uid);
  if (!spec) return false;

  const target = { kind: kind };

  /* グッズは「誰に付けるか」まで既存処理へ伝える必要があります。
     既存は要素の _spec からインスタンスを読むので、同じ形を作ります。 */
  if (kind === 'equip' && targetUid) {
    const st = Game.state;
    let found = null;
    /* ★uid は数値。要素から読むと文字列なので、そろえて比べます。 */
    const key = String(targetUid);
    ['village', 'mansion'].forEach(function (sd) {
      (st.players[sd].humans || []).forEach(function (c) { if (String(c.uid) === key) found = c; });
      (st.players[sd].youkai || []).forEach(function (c) { if (String(c.uid) === key) found = c; });
    });
    if (!found) return false;
    target.el = { _spec: { inst: found } };
  }

  const c = __mf_call();
  if (!c) return false;
  c.playCardInGame(spec, target);
  return true;
};

/** 新しい盤面がカード選択（トラッシュ回収・山札からN枚など）を引き受けるか */
window.__v8CardPick = function (options, cb) {
  if (typeof V8Battle === 'undefined' || !V8Battle.isOpen()) return false;
  if (typeof V8Zones === 'undefined') return false;

  /* ★台本への合図を挟みます（v0.9）。
     旧画面の選択画面は allow / notify を出していました。
     ★出さないと、選んで確定しても台本が進みません
       （マリガンと追跡で同じ穴に落ちました）。 */
  return V8Zones.openPick(options, function (chosen) {
    TutorialActions.notify('cardsPicked', {
      cardIds: (chosen || []).map(function (c) { return c.cardId; }),
    });
    if (cb) cb(chosen);
  });
};

/** 新しい盤面が対象選択を引き受けるかどうか（引き受けたら true） */
window.__v8BoardPick = function (options, cb) {
  if (typeof V8Battle === 'undefined' || !V8Battle.isOpen()) return false;
  if (typeof V8Target === 'undefined') return false;
  return V8Target.open(options, cb);
};

/* =====================================================================
   ★v0.10：【二重追跡】で2人目を足せるか（追跡画面から聞かれる）
   ---------------------------------------------------------------------
   2人を追跡できるかは、ルール処理（Game.pursuitBlockReason）が決めます。
   h2Uid が null なら「この組に、誰か2人目を足せるか」を答えます。
   ===================================================================== */
window.__v10DoubleOk = function (yUid, h1Uid, h2Uid) {
  if (!Game.state || !Game.pursuitBlockReason) return false;
  if (!h1Uid || (h2Uid && String(h1Uid) === String(h2Uid))) return false;
  const st = Game.state, side = st.currentSide, opp = Game.otherSide(side);
  const find = function (list, uid) { return list.find(function (c) { return String(c.uid) === String(uid); }); };
  const y = find(st.players[side].youkai, yUid), h1 = find(st.players[opp].humans, h1Uid);
  if (!y || !h1) return false;
  const others = h2Uid ? [find(st.players[opp].humans, h2Uid)] : st.players[opp].humans.filter(function (h) { return h !== h1; });
  return others.some(function (h2) { return h2 && !Game.pursuitBlockReason(side, y, [h1, h2]); });
};

/** 追跡を確定する（既存の演出とターン終了へつなぐ） */
window.__v8ConfirmTracking = function (youkaiUid, humanUid, humanUid2) {
  const r = __mf_read(); const c = __mf_call();
  if (!r || !c || !r.play().active || !Game.state) return false;
  if (!TutorialActions.allow('confirmPursuit', {})) return false;

  const st = Game.state;
  const side = r.turnSide();
  const other = (side === 'village') ? 'mansion' : 'village';
  const ky = String(youkaiUid), kh = String(humanUid);
  let y = null, h = null;
  (st.players[side].youkai || []).forEach(function (x) { if (String(x.uid) === ky) y = x; });
  (st.players[other].humans || []).forEach(function (x) { if (String(x.uid) === kh) h = x; });
  if (!y || !h) return false;
  /* ★v0.10：【二重追跡】の2人目 */
  let h2 = null;
  if (humanUid2 !== undefined && humanUid2 !== null) {
    const k2 = String(humanUid2);
    (st.players[other].humans || []).forEach(function (x) { if (String(x.uid) === k2) h2 = x; });
  }

  /* 既存の確定処理は view.candidate を見ます。同じ形にして渡します。 */
  c.setCandidatePair(y, h, h2);
  c.confirmTrackingInGame();
  return true;
};
/* =====================================================================
   ★マリガン（同時マリガンの進行）
   ---------------------------------------------------------------------
   ★ここは、演出の間合いと解く順が編み込まれているところです。
     ・人が選ぶ席を、先攻から順に並べる
     ・全員が選び終えてから、まとめて解く
     ・★解く順番は必ず先攻→後攻。入れ替えると同じ種でも結果が変わる

   交換を見せる処理（__v8MulliganExchange）は、ここにはありません。
   ★あれは進行ではなく、旧画面の描画です。Phase 5-2 で扱います。
   ===================================================================== */
window.__v8MulliganStart = function () {
  const c = __mf_call();
  if (!c) return;
  const play = c.state();
  const st = Game.state;
  /* ★人が選ぶ席を、先攻から順に並べます（v0.9）。
     ★解く順番は必ず先攻→後攻です。ここを入れ替えると
       同じ種でも結果が変わります。 */
  play.mullSeats = [st.firstSide, st.secondSide].filter(function (side) {
    return !c.isCpuSide(side);
  });
  play.mullIndex = 0;
  play.mullChoice = {};

  /* ★観戦のように人がいないときは、選ぶ画面を出さずにそのまま解きます。
     ★ここで解いたきり何もしないと、対戦が始まりません。
       解いたあと、片づけて対戦へ進むところまで通します。 */
  if (!play.mullSeats.length) {
    window.__v8MulliganResolve(function () {
      const go = function () {
        if (window.__v8MulliganFinish) window.__v8MulliganFinish();
      };
      if (window.__v8MulliganExchange) window.__v8MulliganExchange(go);
      else go();
    });
    return;
  }

  play.mulliganSide = play.mullSeats[0];
  /* ★先にマリガンを立ててから盤面を出します。
     逆にすると、出す判断の時点ではまだマリガンが始まっておらず、
     盤面が出ないまま案内だけが裏で開いた状態になります。 */
  V8Mulligan.start(window.__v8MulliganSeatLabel());
  V8Battle.sync();
};

/**
 * ★選び終えたときに呼ばれます（v0.9）。
 *
 * 人が2人いるとき（ひとり回し）は、まだ解きません。
 * ★先に解いてしまうと、2人目が選ぶ前に山札が混ぜ直されます。
 *   全員が選び終えてから、先攻→後攻の順にまとめて解きます。
 *
 * @param {Array} uids  いま選んでいる席が選んだカード
 * @param {Function} done  次に進むときに呼ぶ。
 *        { next: true, nextLabel } … 次の人へ
 *        { mine, theirs, theirsLabel } … 全員ぶん解き終えた
 */
window.__v8MulliganApply = function (uids, done) {
  const c = __mf_call();
  if (!c) return;
  const play = c.state();
  const side = play.mulliganSide;
  play.mullChoice[side] = (uids || []).map(String);

  play.mullIndex += 1;
  if (play.mullIndex < play.mullSeats.length) {
    /* まだ選んでいない人がいます。手番を渡します */
    play.mulliganSide = play.mullSeats[play.mullIndex];
    c.renderAll();
    done({ next: true, nextLabel: window.__v8MulliganSeatLabel() });
    return;
  }

  window.__v8MulliganResolve(done);
};

/**
 * ★全員ぶんを、先攻→後攻の順に解きます。
 * ★ここを入れ替えると、同じ種でも結果が変わります。
 */
window.__v8MulliganResolve = function (done) {
  const r = __mf_read(); const c = __mf_call();
  if (!r || !c) return;
  const play = c.state();
  const st = Game.state;

  /* ★交換する前の手札の並びを、席ごとに控えます。
     交換の演出は画面を閉じたあとに見せるので、そのときには
     もう新しい手札に変わっています。並び順もここでしか取れません。 */
  play.mullBefore = {};
  play.mullPicked = {};
  (play.mullSeats || []).forEach(function (side) {
    play.mullBefore[side] = st.players[side].hand.slice();
    play.mullPicked[side] = play.mullChoice[side] || [];
  });

  const runSeat = function (side, next) {
    if (c.isCpuSide(side)) { c.cpuMulligan(side, next); return; }
    /* ★新しい盤面は uid を「文字」で持っています（要素の目印から
       読むため）。ルール側の uid は「数」です。
       そのまま渡すと照合が1枚も当たらず、
       ★演出だけ動いて、実際には1枚も交換されないことになります。 */
    const picked = play.mullPicked[side] || [];
    const realUids = st.players[side].hand
      .filter(function (c) { return picked.indexOf(String(c.uid)) !== -1; })
      .map(function (c) { return c.uid; });
    next(Game.confirmMulligan(side, realUids));
  };

  runSeat(st.firstSide, function (n1) {
    runSeat(st.secondSide, function (n2) {
      /* ★観戦のように人がいないときは「自分」がありません。
         そのときは先攻を基準にして数えます（誰も見ないので、
         どちらでも構いませんが、undefined を触らないためです）。 */
      const me = play.mulliganSide || st.firstSide;
      const mine = (st.firstSide === me) ? n1 : n2;
      const theirs = (st.firstSide === me) ? n2 : n1;
      const other = (me === 'village') ? 'mansion' : 'village';
      done({ mine: mine, theirs: theirs, theirsLabel: r.sideLabelOf(other) });
    });
  });
};
/* =====================================================================
   ログが増えた瞬間を知る
   ---------------------------------------------------------------------
   ★ログの中身も進行も変えません。増えたことを知らせるだけです。
     知らせで対戦が止まらないよう、例外は握りつぶします。
   ===================================================================== */
window.__v8WatchLog = function () {
  if (!Game.state || !Game.state.log) return;
  const log = Game.state.log;
  if (log.__v8watched) return;
  log.__v8watched = true;

  const orig = log.push;
  log.push = function () {
    const r = orig.apply(this, arguments);
    if (typeof window !== 'undefined' && window.__v8OnLogPush) {
      try { window.__v8OnLogPush(this.length); } catch (e) { /* 表示の都合で止めない */ }
    }
    return r;
  };
};