/* =====================================================================
   tutorial-actions.js  ―― 操作を通すか断るか（仕様書 23.2／24）
   ---------------------------------------------------------------------
   通常のゲーム処理が動く手前に立って、
   「いま、その操作をしてよいか」を確かめます。

   【断るときに何もしないことが大切です】（仕様書 22.5）
   断ったら、盤面を一切変えません。
     ・カードは元の位置へ戻る
     ・気力は減らない
     ・ログに残らない
   そのうえで、一言だけヒントを出します。
   「間違えても失敗にならない」と最初に約束したので、
   ここが守られないとチュートリアルの信頼が崩れます。

   【なぜ薄い層に分けたか】
   preview.js（対戦画面）は4000行を超えます。
   そこへチュートリアルの判断を直接書き足すと、
   通常の対戦の動きまで読みにくくなります。
   そこで、preview.js からは1行呼ぶだけにして、
   判断はすべてこのファイルに集めました。

   読み込み順： … → tutorial-controller → tutorial-ui → tutorial-actions
   ===================================================================== */

const TutorialActions = {

  /** チュートリアルが動いているか。通常対戦では常に false */
  isActive: function () {
    return typeof TutorialController !== 'undefined' && TutorialController.active;
  },

  /* =============================================================
     ★これを通すか？（preview.js から呼ばれる入口）
     -------------------------------------------------------------
       kind    … 'playCard' 'selectPursuit' 'confirmPursuit'
                 'endMain' 'endTurn' 'mulliganSelect' 'mulliganConfirm'
                 'pickCard' 'pickConfirm' 'useField' 'skipField'

       ★'endMain' は v0.9 で足しました。
         v0.8 で追跡が独立したフェイズになり、
         「メイン終了 → 追跡フェイズ → 追跡を確定」の順になったためです。
       payload … { cardId, targetId } など

     通してよければ true。
     断るときは、ここでヒントまで出して false を返します。
     ============================================================= */
  allow: function (kind, payload) {
    if (!this.isActive()) return true;      // 通常対戦は素通し

    if (TutorialController.allows(kind, payload)) return true;

    TutorialController.reject();            // 一言だけ出す（重複は向こうで防ぐ）
    return false;
  },

  /**
   * ★どれか1つでも許されていれば通します（v0.9）。
   *
   * 同じボタンが、場面によって違う意味になることがあります。
   * 「メイン終了」は、追跡できる怪異がいればメインを終えるだけですが、
   * いなければそのままターンが終わります。
   * ★片方の名前だけで判定すると、もう片方の場面で押せなくなります。
   *
   * ★断るときのヒントは1回だけ出します。
   *   allow を続けて呼ぶと、同じ注意が2回出ます。
   */
  allowAny: function (kinds, payload) {
    if (!this.isActive()) return true;
    for (let i = 0; i < kinds.length; i++) {
      if (TutorialController.allows(kinds[i], payload)) return true;
    }
    TutorialController.reject();
    return false;
  },

  /* =============================================================
     ★何かが完了した（preview.js から呼ばれる）
     -------------------------------------------------------------
     台本の完了条件と一致すれば、次のステップへ進みます。
     一致しなければ何も起きません。
     ============================================================= */
  notify: function (signal, payload) {
    if (!this.isActive()) return false;
    return TutorialController.notify(signal, payload);
  },

  /* =============================================================
     通常警告を出すか（仕様書 24）
     -------------------------------------------------------------
     抑制の対象は3つです。
       ・まだ使用できるカードがあります
       ・追跡できる怪異がいます
       ・追跡を選択していません

     これらは通常の対戦では親切ですが、チュートリアル中は
     台本どおりに進めようとする手を止めてしまいます。
     ============================================================= */
  showsWarning: function (name) {
    if (!this.isActive()) return true;
    return TutorialController.showsWarning(name);
  },

  /* =============================================================
     フィールド効果を自動で決めるか（仕様書 24 末尾）
     -------------------------------------------------------------
     基本編では「使う」「使わない」を1回ずつ自分で体験します。
     なので基本編では自動化しません（null を返す）。
     実践編では自動で「使わない」にする予定です。
     ============================================================= */
  autoFieldChoice: function () {
    if (!this.isActive()) return null;
    const s = TutorialController.step();
    if (!s) return null;
    if (s.autoField === 'use') return true;
    if (s.autoField === 'skip') return false;
    return null;                             // 自分で決めてもらう
  },

  /* =============================================================
     説明を読み終えるまで、盤面の進行を待たせる
     -------------------------------------------------------------
     襲撃は、説明を読み終えてから始めないと、
     説明ウィンドウの裏で終わってしまい、何も見えません。
     ============================================================= */
  whenExplained: function (cb) {
    if (!this.isActive()) { cb(); return; }
    TutorialController.whenExplained(cb);
  },

  /* =============================================================
     盤面を描き直したあと、光らせ直す
     -------------------------------------------------------------
     カードの要素は描き直しのたびに作り直されるので、
     付けた発光も一緒に消えます。描画のあとに呼んでください。
     ============================================================= */
  refresh: function () {
    if (!this.isActive()) return;
    if (TutorialController.phase !== 'action') return;
    const s = TutorialController.step();
    if (!s || !s.highlight) return;
    if (typeof TutorialUI !== 'undefined') TutorialUI.refreshHighlight(s.highlight);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialActions: TutorialActions };
}
