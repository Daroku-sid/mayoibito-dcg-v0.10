/* =====================================================================
   match-view.js ― 対戦の状態を読むところ（v0.9 Phase 5-1）
   ---------------------------------------------------------------------
   ★これは「読む」だけの入口です。ここでは何も変えません。

   これまで preview.js（旧画面のファイル）の中にありました。
   ★preview.js には「旧画面の描き方」と「ゲームの進行」が
     同居しています。旧画面を消すには、先に進行のほうを
     外へ出しておく必要があります。

   ここはその1つ目です。読むだけなので、いちばん安全に動かせます。

   ---------------------------------------------------------------------
   ★なぜ preview.js の中の値を直に見ないのか
   ---------------------------------------------------------------------
   play / match / view は preview.js の中だけのもので、
   外からは触れません。読むための窓（window.__matchRead）だけを
   通しています。

   ★旧画面を消し終えたら、状態もこちら側へ移し、
     窓は要らなくなります。
   ===================================================================== */

'use strict';

/** 読むための窓。まだ preview.js が持っています */
function __mv() {
  return (typeof window !== 'undefined' && window.__matchRead) ? window.__matchRead : null;
}

/* =====================================================================
   いまどの段か
   ===================================================================== */
window.__v8Phase = function () {
  const r = __mv();
  if (!r) return null;
  return (r.play().active && Game.state) ? Game.state.phase : null;
};

/* =====================================================================
   いま操作を受け付けてよいか（演出中・効果解決中は false）
   ===================================================================== */
window.__v8CanOperate = function () {
  const r = __mv();
  if (!r) return false;
  return !!(r.play().active && !r.view().locked && r.play().mode === 'main');
};

/* =====================================================================
   まだ使えるカードがあるか（ターン終了の確認に使う）
   ===================================================================== */
window.__v8HasPlayableCard = function () {
  const r = __mv();
  if (!r || !r.play().active || !Game.state) return false;
  return !!Game.hasMeaningfulPlay(r.turnSide());
};

/* =====================================================================
   それぞれの領域の枚数
   ---------------------------------------------------------------------
   ★ここは Game.state だけを見ています。窓は要りません。
     このあと状態を移すときも、そのまま動きます。
   ===================================================================== */
window.__v8ZoneCounts = function () {
  if (!Game.state) return null;
  const st = Game.state;
  const out = {};
  ['village', 'mansion'].forEach(function (side) {
    const p = st.players[side];
    if (!p) return;
    out[side] = {
      hand: (p.hand || []).length,
      deck: (p.deck || []).length,
      trash: (p.trash || []).length,
      lost: (p.lost || []).length,
    };
  });
  return out;
};

/* =====================================================================
   いま解いている効果（対戦中の案内に出す）
   ===================================================================== */
window.__v8CurrentEffect = function () {
  const r = __mv();
  if (!r) return null;
  const uid = r.activatingUid();
  if (!r.play().active || !Game.state || !uid) return null;

  const st = Game.state;
  let inst = null;
  ['village', 'mansion'].forEach(function (side) {
    const p = st.players[side];
    if (!p) return;
    ['humans', 'youkai', 'trash', 'lost', 'hand'].forEach(function (zone) {
      (p[zone] || []).forEach(function (c) {
        if (!inst && String(c.uid) === String(uid)) inst = c;
      });
    });
    if (!inst && p.field && String(p.field.uid) === String(uid)) inst = p.field;
  });
  if (!inst) return null;
  return { uid: inst.uid, name: inst.master.name, effect: inst.master.effect || '' };
};

/* =====================================================================
   新しい対戦画面を出してよい場面か
   ---------------------------------------------------------------------
   ★同時マリガンのあいだも、ずっとこの盤面を出します。

   ★以前は「マリガンの画面が立っているときだけ」でした。これだと
     ・盤面を出す（sync）→ そのあとマリガンを立てる
     という順で呼ばれたときに、出す判断の時点ではまだ立っておらず、
     盤面が出ないまま案内だけが裏で開いた状態になっていました。
     引き受ける対戦かどうかだけで決めます。
   ===================================================================== */
window.__v8Active = function () {
  const r = __mv();
  if (!r) return false;
  const play = r.play();
  if (!play.active) return false;
  if (play.mode === 'main') return true;
  if (play.mode === 'mulligan' && typeof window !== 'undefined' &&
      window.__v8MulliganTakeover && window.__v8MulliganTakeover()) {
    return true;
  }
  return false;
};

/* =====================================================================
   追跡できる場面か（自分に怪異、相手に人間がいるか）
   ===================================================================== */
window.__v8CanTrack = function () {
  const r = __mv();
  if (!r || !r.play().active || !Game.state) return false;
  const st = Game.state;
  const side = r.turnSide();
  const other = (side === 'village') ? 'mansion' : 'village';
  return st.players[side].youkai.length > 0 &&
    st.players[other].humans.length > 0;
};

/* =====================================================================
   手札の1枚を、画面用の形にして返す
   ===================================================================== */
window.__v8HandSpec = function (uid) {
  const r = __mv();
  if (!r || !r.play().active || !Game.state) return null;
  const hand = r.view().hand;
  for (let i = 0; i < hand.length; i++) {
    const s = r.handSpecAt(i);
    if (s.uid === uid) return s;
  }
  return null;
};

/* =====================================================================
   これから解く効果の並び
   ---------------------------------------------------------------------
   ★手番のほうを先に、そのあと順番どおりに並べます。
     ルール側の解く順と同じ並びにしておかないと、
     画面に出る順と実際に起きる順が食い違います。
   ===================================================================== */
window.__v8PendingEffects = function () {
  const r = __mv();
  if (!r || !r.play().active || !Game.state) return [];
  const st = Game.state;
  return st.pendingEffects.slice().sort(function (a, b) {
    const at = (a.side === st.currentSide) ? 0 : 1;
    const bt = (b.side === st.currentSide) ? 0 : 1;
    if (at !== bt) return at - bt;
    /* ★v0.10：ルール側の解く順（L12：ゲームの決まり＝仕様書 18.2）と同じ。
       場所の順（誘発した時点の pos）→ 同じなら誘発した順（seq） */
    const ap = (a.pos == null ? 600 : a.pos), bp = (b.pos == null ? 600 : b.pos);
    if (ap !== bp) return ap - bp;
    return a.seq - b.seq;
  }).map(function (it) {
    return { uid: it.source.uid, name: it.source.master.name };
  });
};

/* =====================================================================
   いまの設定
   ---------------------------------------------------------------------
   ★対戦中の設定パネルと、ホームの設定は、ここを共通の入口にします。
     2つ作ると必ず食い違います。
   ===================================================================== */
window.__v8SettingsGet = function () {
  const r = __mv();
  const st = (typeof Screens !== 'undefined' && Screens.settings) ? Screens.settings : {};
  const mode = r ? r.match().mode : '';
  return {
    /* 保存が無ければ既定値（見落とし警告は ON） */
    warnUnplayedCards: (st.warnUnplayedCards !== false),
    reduceMotion: !!st.reduceMotion,

    cpuActionSpeed: (typeof CpuDriver !== 'undefined') ? CpuDriver.speed : 'normal',
    animationSpeed: st.animationSpeed,
    seEnabled: st.seEnabled,
    mirrorLanes: st.mirrorLanes,
    showCpuSpeed: (mode !== 'solo'),
    isWatch: (mode === 'watch'),
  };
};

/* =====================================================================
   マリガンで、いま選んでいる席の手札
   ---------------------------------------------------------------------
   ★「いま選んでいる席」の手札です。
     ひとり回しでは2人ぶん順に出すので、
     「自分」で決め打つと2人目の手札が出せません。
   ===================================================================== */
window.__v8MulliganHand = function () {
  /* ★「いま選んでいる席」の手札です。
     match.humanSide だと、ひとり回しで2人目の手札が出せません。 */
  const r = __mv();
  if (!r) return [];
  const me = r.play().mulliganSide || r.match().humanSide;
  return Game.state.players[me].hand.slice().map(function (c) {
    return { uid: c.uid, cardId: c.cardId, side: c.owner, name: c.master.name };
  });
};

window.__v8MulliganSeatLabel = function () {
  const r = __mv();
  if (!r) return '';
  const play = r.play();
  /* ★人が1人しかいないときは名前を付けません。
     付けても意味がなく、文字が長くなるだけです。 */
  if (!play.mullSeats || play.mullSeats.length < 2) return '';
  return r.sideLabelOf(play.mulliganSide);
};

window.__v8ResultData = function () {
  const r = __mv();
  if (!r || !Game.state || !Game.state.gameOver) return null;
  const st = Game.state;
  const over = st.gameOver;
  const me = r.bottomSide();
  const match = r.match();
  const lost = over.losers.map(function (l) { return l.side; });
  const iLost = lost.indexOf(me) !== -1;

  /* 決着の理由は「自分から見た言い方」にします（18.2 の文例） */
  const MAP = {
    'ロスト上限到達': 'のロストが上限に達しました',
    '場の人間が0体': 'の場から人間がいなくなりました',
    '山札が0枚': 'の山札がなくなりました',
  };
  let reason = '';
  if (over.draw) {
    reason = '引き分け条件が成立しました';
  } else {
    const loser = over.losers[0];
    const who = (loser && loser.side === me) ? '自分' : '相手';
    const raw = (loser && loser.reasons && loser.reasons[0]) || '';
    let tail = '';
    Object.keys(MAP).forEach(function (k) { if (!tail && raw.indexOf(k) >= 0) tail = MAP[k]; });
    reason = tail ? (who + tail) : (who + 'の敗北：' + raw);
  }

  const DIFF = { weak: '弱', normal: '中', strong: '強', expert: 'エキスパート', unfair: '理不尽' };
  const MODE = { cpu: 'CPU対戦', solo: 'ひとりまわし', watch: 'CPU観戦' };
  let rawDiff = match.difficulty || match.diff || '';
  if (!rawDiff && typeof Screens !== 'undefined' && Screens.cpu) rawDiff = Screens.cpu.difficulty;
  const diff = (match.mode === 'cpu' && rawDiff) ? (DIFF[rawDiff] || rawDiff) : '';

  return {
    draw: !!over.draw,
    win: !over.draw && !iLost,
    reason: reason,
    turnCount: over.turnCount,
    mode: MODE[match.mode] || match.mode || '',
    difficulty: diff,
    meSide: me,
    /* 背景は、自分の使ったデッキの0コスト人間（＝ホームの一枚絵と同じ絵） */
    art: (me === 'mansion')
      ? 'assets/home-art/elise_01.webp' : 'assets/home-art/sumire_01.webp',
  };
};
/* =====================================================================
   配っている途中の手札
   ---------------------------------------------------------------------
   ★光が着いてから手札が増えるように見せるための控えです。
     これがないと、光が飛ぶより先に5枚そろって見えます。
   ===================================================================== */
/**
 * ★ドロー演出の最中に映しておく「増える前の手札」（Stage 6-4）。
 * ---------------------------------------------------------------------
 * 光が着いてから手札が増えるように見せるため、既存の盤面は
 * play.handSnapshot を映しています。新しい盤面は Game.state を
 * 直に読んでいたので、光が飛ぶより先に手札が増えていました。
 *
 * 控えが無いとき（ふだん）は null を返すので、新しい盤面は
 * これまでどおり Game.state をそのまま映します。
 *
 * @return {Array|null} その席で映すべき手札。無ければ null
 */
window.__v8HandSnapshot = function (side) {
  const r = __mv();
  if (!r) return null;
  const play = r.play();
  if (!play.active || !Game.state) return null;

  /* ★マリガンの配り演出のあいだは、配り終えた枚数までを映します。
     これがないと、光が飛ぶより先に5枚そろって見えます。 */
  if (play.dealCount && play.dealCount[side] != null) {
    return Game.state.players[side].hand.slice(0, play.dealCount[side]);
  }

  /* まだ配っていないあいだは、手札を映しません（v0.6.7 と同じ扱い）。
     ★既存と同じく、画面の下に出ている席にだけ効かせます。
       相手側まで空にすると、裏面の枚数が合わなくなります。 */
  if (side === r.bottomSide() && play.dealt && !play.dealt[side]) return [];
  if (!play.handSnapshot) return null;
  /* その控えが、どの席のものか。null は「下に出ている席」の意味です */
  const owner = (play.handSnapshotSide == null) ? r.bottomSide() : play.handSnapshotSide;
  if (owner !== side) return null;
  return play.handSnapshot.slice();
};