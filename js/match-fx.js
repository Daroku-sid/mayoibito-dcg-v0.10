/* =====================================================================
   match-fx.js ― 演出の段取り（v0.9 Phase 5-2）
   ---------------------------------------------------------------------
   ★「いつ・何を見せるか」を決めるところです。
     「どう描くか」は新しい画面（v08-fx.js）が受け持ちます。

   これまで preview.js（旧画面のファイル）の中にありました。
   ★preview.js を消すと、決めている側まで消えてしまうので、
     先にこちらへ出しておきます。

   ---------------------------------------------------------------------
   ★まだ残っている縁
   ---------------------------------------------------------------------
   飛ばす光の「間隔・長さ・着いたと見なす割合」を数える処理
   （flyCardSequence）は、まだ preview.js にあります。
   ★ここは旧画面の描画とも絡んでいるので、
     旧画面を消すときに中身ごと移します。
     いまは呼ぶ側だけを外へ出しています。

   ★この縁が切れるまで、preview.js は消せません。
   ===================================================================== */

'use strict';

/** 読むための窓 */
function __fx_read() {
  return (typeof window !== 'undefined' && window.__matchRead) ? window.__matchRead : null;
}
/** 進めるための口（演出の段取りもここを通します） */
function __fx_call() {
  return (typeof window !== 'undefined' && window.__matchCall) ? window.__matchCall : null;
}

/**
 * ★交換の演出（2026-08-01）。マリガンの画面を閉じたあと、
 * 対戦画面の上で見せます。
 *
 *   選んだカードが「左から順に」山札へ帰る → 新しいカードが右から加わる
 *
 * ルール処理（Game.confirmMulligan）はもう終わっています。
 * ここは見せ方だけで、手札の中身は変わりません。
 */
window.__v8MulliganExchange = function (done) {
  const r = __fx_read(); const c = __fx_call();
  if (!r || !c) { if (done) done(); return; }
  const play = c.state();

  const fin = function () {
    play.handSnapshot = null;
    play.handSnapshotSide = null;
    play.mullBefore = null;
    play.mullPicked = null;
    c.renderAll();
    if (done) done();
  };
  if (!play.active || !Game.state || !play.mullBefore) { fin(); return; }

  /* ★席ごとに、順に見せます（v0.9）。
     ひとり回しでは2人ぶんあります。まとめて見せると、
     どちらの札が帰ったのか分かりません。 */
  const seats = (play.mullSeats || []).slice();

  const runOne = function (side, next) {
    const before = play.mullBefore[side] || [];
    const picked = play.mullPicked[side] || [];
    const after = Game.state.players[side].hand.slice();

    const isPicked = function (inst) { return picked.indexOf(String(inst.uid)) !== -1; };
    /* ★「左から順に」なので、交換前の並びのまま拾います */
    const returning = before.filter(isPicked);
    const kept = before.filter(function (c) { return !isPicked(c); });
    /* ★v0.10：同じ札かは通し番号（uid）で見る（局面を作り直しても札の番号は変わらない） */
    const keptUids = kept.map(function (c) { return String(c.uid); });
    const drawn = after.filter(function (c) { return keptUids.indexOf(String(c.uid)) === -1; });

    if (!returning.length && !drawn.length) { next(); return; }

    /* ★その席を画面の下へ出してから見せます。
       上に出したまま動かすと、誰の手札が動いたのか分かりません。 */
    play.mulliganSide = side;
    play.handSnapshot = before.slice();
    play.handSnapshotSide = side;
    c.renderAll();

    const backItems = returning.map(function (inst) {
      return {
        from: function () { return c.handCardPoint(side, inst); },
        to: c.deckElFor(side),
        kind: 'handTrash',
        side: side,
        v8from: { zone: 'handCard', side: side, uid: inst.uid },
        v8to: { zone: 'deck', side: side },
        onDepart: function () {
          if (!play.handSnapshot) return;
          let i = -1;
          play.handSnapshot.forEach(function (x, k) { if (i === -1 && String(x.uid) === String(inst.uid)) i = k; });
          if (i !== -1) { play.handSnapshot.splice(i, 1); c.refreshHandOnly(); }
        },
      };
    });

    const drawItems = drawn.map(function (inst) {
      return {
        from: c.deckElFor(side),
        to: function () { return c.handRightPointFor(side); },
        kind: 'toHand',
        side: side,
        v8from: { zone: 'deck', side: side },
        v8to: { zone: 'hand', side: side },
        onArrive: function () {
          if (!play.handSnapshot) return;
          play.handSnapshot.push(inst);   // ★右端に加わります
          c.refreshHandOnly();
          c.flashNewHandCard(inst);
        },
      };
    });

    /* ★帰しきってから引きます。混ぜると、何枚戻して何枚引いたのか
       分からなくなります。 */
    c.flyCardSequence(backItems, function () {
      c.flyCardSequence(drawItems, function () {
        setTimeout(next, c.ms(c.mulliganEndPause()));
      });
    });
  };

  const step = function (i) {
    if (i >= seats.length) { fin(); return; }
    runOne(seats[i], function () { step(i + 1); });
  };
  step(0);
};
/* =====================================================================
   ★飛ばす光の間合いを数えるところ（v0.9 Phase 5-2）
   ---------------------------------------------------------------------
   ★「いつ出して、いつ着いたことにするか」を決めます。
     どこに描くかは、新しい画面（v08-fx.js）が受け持ちます。

   ★ここが preview.js にあるかぎり、旧画面は消せませんでした。
     間合いを決めている側が、旧画面と同居していたためです。

   ★間合いは変えていません。
     間隔・長さ・着いたと見なす割合は、これまでと同じ値を使います。
     ここを変えると、Game を呼ぶ順まで動きます。
   ===================================================================== */
window.__matchFly = function (items, done, opts) {
  const c = __fx_call();
  if (!c) { if (done) done(); return; }

  const finish = c.sessionGuard(done || function () {});
  if (!items || !items.length) { finish(); return; }

  const o = opts || {};
  const gap = (o.gap !== undefined) ? o.gap : c.flyGap();
  const dur = (o.duration !== undefined) ? o.duration : c.flyDuration();

  let finished = 0;

  items.forEach(function (item, index) {
    setTimeout(function () {
      let arrived = false;
      function complete() {
        if (arrived) return;
        arrived = true;
        if (item.onArrive) item.onArrive();
        finished++;
        if (finished >= items.length) finish();
      }

      /* =========================================================
         ★新しい画面の道を先に見ます（v0.9 Phase 5-4）。

         ★以前は、先に旧画面の座標を測っていました。
           旧画面の要素が無くなると座標が取れず、
           ★光が飛ぶ前に「着いた」ことにされてしまいます。
           見た目には、演出が丸ごと消えたように見えます。

         新しい画面は「場所の言葉」で受け取るので、
         旧画面の要素を測る必要がありません。
         ========================================================= */

      /* =========================================================
         ★新しい盤面が出ているときは、そちらの座標で飛ばします。

         時間の刻みと onDepart / onArrive はここのまま使うので、
         演出の間合いも Game の呼び順も変わりません。
         変わるのは「どこに光が描かれるか」だけです。
         ========================================================= */
      if (typeof window !== 'undefined' && window.__v8Fly && item.v8to) {
        const took = window.__v8Fly({
          kind: item.kind, from: item.v8from, to: item.v8to,
          card: item.v8card || null,
          duration: c.ms(dur),
          speed: c.speedScale(),
        });
        if (took) {
          if (item.onDepart) item.onDepart();   // 出発と同時に元の場所から消す
          /* ★中央でカードを見せる動きは、ふつうより長くかかります。
             かかる時間が返ってくるので、そのぶん待ちます。
             ★ここを待たないと、まだ光が飛んでいる途中で次へ進みます。 */
          const at = (typeof took === 'number')
            ? took : c.ms(Math.round(dur * c.arriveRatio()));
          setTimeout(complete, at);
          return;
        }
      }

      /* ここから下は、新しい画面が引き受けなかったときの道です。
         ★旧画面の座標は、ここではじめて測ります。 */
      function resolvePoint(v) {
        if (typeof v === 'function') return v();          // 飛ぶ直前に計算する
        return (v && v.nodeType) ? c.centerOfEl(v) : v;
      }
      const start = resolvePoint(item.from);
      const goal = resolvePoint(item.to);

      if (item.onDepart) item.onDepart();   // 出発と同時に元の場所から消す

      if (!start || !goal) { complete(); return; }

      /* 新しい盤面が出ていないときだけ、旧画面の上に描きます */
      c.drawLegacyFly(item, start, goal, dur);

      /* 光が着くのと同時に手札へ反映する
         （終わりを待つと、わずかに遅れて見えるため） */
      setTimeout(complete, c.ms(Math.round(dur * c.arriveRatio())));
    }, index * c.ms(gap));
  });
};
