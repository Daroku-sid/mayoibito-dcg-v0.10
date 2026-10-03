/* =====================================================================
   v08-battle.js ― v0.8 対戦画面の器（Stage 1）
   ---------------------------------------------------------------------
   仕様書 第4部・第24部 Stage 1。

   V8Battle が行うこと:
     ・v0.7 の器（.v7-shell）の中へ、対戦画面のレイヤーを1枚足す
     ・上帯／下帯／左右の補助UI／盤面の4つの帯を組む
     ・見本のビューモデルを流し込んで静的表示する
     ・「動きを減らす」の土台を持つ

   ★ゲーム状態には触りません（Stage 1 の範囲外）。
     既存の対戦（preview.js）とは完全に独立していて、
     開いても閉じても既存の動きに影響しません。

   ★開き方（Stage 1 の確認用）
     アドレスの末尾に #v08board を付けて開くと、この画面が出ます。
       例）index.html#v08board
     Stage 2 で通常の導線につなぎます。それまでは確認専用の入口です。
   ===================================================================== */

'use strict';

const V8Battle = {

  _root: null,
  _built: false,

  /* =============================================================
     見本のビューモデル（Stage 1 の静的表示用）
     -------------------------------------------------------------
     実際の対戦とは無関係の、見た目を確かめるためだけの値です。
     行ごとの自動拡縮を確かめられるよう、枚数をわざとばらけさせています。
       相手：通常人間2枚／通常怪異3枚／追跡は人間1枚・怪異1枚
       自分：通常人間3枚／通常怪異1枚／追跡は怪異1枚・人間1枚
     ============================================================= */
  DEMO: {
    opp: {
      side: 'mansion',
      fieldId: 'field_mansion',
      deck: 24, trash: 9, lost: 1, lostMax: 4, vigor: 3, hand: 5,
      normalHuman: [
        { cardId: 'mansion_elise', name: '屋敷の令嬢 エリーゼ', cost: 0, speed: 2, hp: 3, baseSpeed: 2, baseHp: 3 },
        { cardId: 'mansion_lily', name: '招かれた令嬢 リリィ', cost: 1, speed: 1, hp: 2, baseSpeed: 1, baseHp: 2 },
      ],
      normalYoukai: [
        { cardId: 'mansion_chimera', name: '地下室に棲むキメラ', cost: 4, speed: 4, hp: 4, baseSpeed: 4, baseHp: 4 },
        { cardId: 'mansion_armor', name: '彷徨う亡霊甲冑', cost: 2, speed: 3, hp: 2, baseSpeed: 3, baseHp: 2 },
      ],
      trackHuman: [
        { cardId: 'mansion_annette', name: '不憫な客人 アネット', cost: 1, speed: 1, hp: 3, baseSpeed: 1, baseHp: 3 },
      ],
      trackYoukai: [
        { cardId: 'mansion_isabella', name: '企む貴婦人 イザベラ', cost: 3, speed: 3, hp: 3, baseSpeed: 3, baseHp: 3 },
      ],
    },
    self: {
      side: 'village',
      fieldId: 'field_village',
      deck: 21, trash: 12, lost: 2, lostMax: 5, vigor: 2, hand: 4,
      normalHuman: [
        { cardId: 'village_luna', name: '泣き虫転校生 ルナ', cost: 1, speed: 1, hp: 2, baseSpeed: 1, baseHp: 2 },
        { cardId: 'village_rin', name: '頼れる委員長 リン', cost: 2, speed: 2, hp: 1, baseSpeed: 2, baseHp: 4 },
      ],
      normalYoukai: [
        { cardId: 'village_nushi', name: '山を守るヌシ様', cost: 4, speed: 1, hp: 6, baseSpeed: 1, baseHp: 6 },
      ],
      trackYoukai: [
        { cardId: 'village_kakashi', name: '朽ちゆく嗤い案山子', cost: 2, speed: 4, hp: 3, baseSpeed: 3, baseHp: 3 },
      ],
      trackHuman: [
        { cardId: 'village_kaede', name: '負けず嫌い カエデ', cost: 1, speed: 2, hp: 2, baseSpeed: 2, baseHp: 2 },
      ],
    },
  },

  /* =============================================================
     組み立て
     ============================================================= */
  init: function (shellEl) {
    if (this._built) return this._root;
    const doc = (typeof document !== 'undefined') ? document : null;
    if (!doc || !shellEl) return null;

    const root = doc.createElement('div');
    root.id = 'v8-battle';
    root.className = 'v7-layer v8-battle';
    root.innerHTML = this._html();
    shellEl.appendChild(root);

    this._root = root;
    this._built = true;

    /* 「動きを減らす」（21.2）。設定が入るのは Stage 6。
       いまは土台として、保存に値があれば読む。 */
    this.applyReduceMotion(this._savedReduceMotion());

    /* ★画像（Stage 2-4）。読み終わったらフェードせずその場で差し替える（19.4） */
    if (typeof V8Images !== 'undefined') {
      V8Images.setOnLoaded(function (path) { V8Images.applyAll(root, path); });
    }

    /* ★手札（Stage 2-2） */
    if (typeof V8Hand !== 'undefined') V8Hand.init(root);
    /* ★追跡フェイズ（Stage 3-1） */
    if (typeof V8Track !== 'undefined') V8Track.init(root);
    /* ★クイック表示と固定式詳細（Stage 2-3） */
    if (typeof V8Quick !== 'undefined') V8Quick.init(root);
    if (typeof V8Detail !== 'undefined') V8Detail.init(root);
    /* ★効果の対象選択（Stage 3-2） */
    if (typeof V8Target !== 'undefined') V8Target.init(root);
    /* ★公開領域の画面（Stage 4-1） */
    if (typeof V8Zones !== 'undefined') V8Zones.init(root);
    /* ★効果処理パネル（Stage 4-2） */
    if (typeof V8Effects !== 'undefined') V8Effects.init(root);
    /* ★両者同時マリガン（Stage 5-1） */
    if (typeof V8Mulligan !== 'undefined') V8Mulligan.init(root);
    /* ★対戦準備画面（Stage 5-2） */
    if (typeof V8Prep !== 'undefined') V8Prep.init(root);
    /* ★リザルト画面（Stage 6-1） */
    if (typeof V8Result !== 'undefined') V8Result.init(root);
    /* ★対戦中の設定（Stage 6-2） */
    if (typeof V8Settings !== 'undefined') V8Settings.init(root);
    /* ★対戦中の演出（Stage 6-4） */
    if (typeof V8Fx !== 'undefined') V8Fx.init(root);
    /* ★Stage 7 の調整パネル。?tune=1 が付いているときだけ出ます */
    if (typeof V8Tune !== 'undefined') V8Tune.init(root);

    /* ★CPUの様子を新しい盤面にも出す（Stage 6-3）。
       既存の表示は盤面の裏に隠れるので、同じことをこちらでも見せます。 */
    if (typeof window !== 'undefined') {
      const self5 = this;
      window.__v8CpuThinking = function (on) { self5.showCpuThinking(on); };
      window.__v8CpuReveal = function (cardId, owner, name) {
        self5.showCpuReveal(cardId, owner, name);
      };
    }

    /* ★対戦ログ（Stage 4-3） */
    if (typeof V8Log !== 'undefined') {
      V8Log.init(root);
      /* ログが1行増えた瞬間の枚数を控える（枚数の変化を出すため） */
      if (typeof window !== 'undefined') {
        window.__v8OnLogPush = function (len) {
          if (window.__v8ZoneCounts) V8Log.noteCounts(len, window.__v8ZoneCounts());
        };
      }
    }

    /* ★v0.9 Phase 6：文字が枠に入りきらないので絵にします。
       ★意味は消しません。読み上げと、指を置いたときの表示に残ります。
       ★主操作ボタン（メイン終了／追跡を確定／対象を確定）は文字のままです。
         押すたびに意味が変わるので、1つの絵では表せません。 */
    if (typeof UiIcons !== 'undefined') {
      UiIcons.apply(root.querySelector('#v8-btn-settings'), 'settings', '設定');
      UiIcons.apply(root.querySelector('#v8-btn-log'), 'log', '対戦ログ');
    }

    const logBtn = root.querySelector('#v8-btn-log');
    if (logBtn) logBtn.onclick = function () { if (typeof V8Log !== 'undefined') V8Log.open(); };

    /* ★設定ボタン。Stage 1 で置いたまま、つなぎ忘れていました。 */
    const setBtn = root.querySelector('#v8-btn-settings');
    if (setBtn) {
      setBtn.onclick = function () {
        if (typeof window !== 'undefined' && window.__v8OpenSettings) window.__v8OpenSettings();
        else if (typeof V8Settings !== 'undefined') V8Settings.open();
      };
    }

    /* ★既存の確認ダイアログと大きな文字を、この画面へ写す */
    if (typeof window !== 'undefined') {
      const self3 = this;
      window.__v8Dialog = function (opts, onClosed) { return self3.dialog(opts, onClosed); };
      window.__v8Banner = function (text, attack) { self3.banner(text, attack); };
      window.__v8BannerHide = function () { self3.hidePhase(); };
    }

    /* トラッシュとロストの入口（4.5） */
    ['opp', 'self'].forEach(function (who) {
      const sideOf = function () {
        if (typeof V8State === 'undefined') return 'village';
        return (who === 'self') ? V8State.bottomSide() : V8State.topSide();
      };
      const t = root.querySelector('#v8-' + who + '-trashbtn');
      if (t) t.onclick = function () { if (typeof V8Zones !== 'undefined') V8Zones.openTrash(sideOf()); };
      const c = root.querySelector('#v8-' + who + '-counts');
      if (c) c.onclick = function () { if (typeof V8Zones !== 'undefined') V8Zones.openTrash(sideOf()); };
      const ex = root.querySelector('#v8-' + who + '-exilebox');
      if (ex) ex.onclick = function (e) { e.stopPropagation(); if (typeof V8Zones !== 'undefined') V8Zones.openExile(sideOf()); };
      const f = root.querySelector('#v8-' + who + '-field');
      if (f) f.onclick = function () { if (typeof V8Zones !== 'undefined') V8Zones.openLost(sideOf()); };
    });

    this.startWatch();

    /* ★描き直しの知らせを受け取る。定期的に見に行く必要はありません。 */
    if (typeof window !== 'undefined') {
      const self2 = this;
      window.__v8OnRender = function () { self2.sync(); };
    }

    /* 閉じる（Stage 1 の確認用の帯にある×） */
    /* 主操作ボタン（4.6）。いまはターン終了だけ。追跡は Stage 3。 */
    const main = root.querySelector('#v8-btn-main');
    if (main) {
      main.onclick = function () {
        /* 対象選択中は、そちらが主操作ボタンを使います（7.1） */
        if (typeof V8Target !== 'undefined' && V8Target.active) {
          V8Target.onMainButton();
          return;
        }
        if (typeof V8Track !== 'undefined') V8Track.onMainButton();
      };
    }

    return root;
  },

  _html: function () {
    const P = function (who) {   /* who = 'opp' / 'self' */
      return '' +
        '<div class="v8-hud v8-hud--' + who + '"></div>' +
        '<div class="v8-hand-panel v8-hand-panel--' + who + '"></div>' +
        '<div class="v8-hand__slots v8-hand__slots--' + who + '" id="v8-' + who + '-hand"></div>' +
        /* ★枚数表示は文字ではなくアイコン＋数字（総合仕様書 4.5） */
        '<div class="v8-counts v8-counts--' + who + '" id="v8-' + who + '-counts">' +
          '<span class="v8-counts__item" role="img" aria-label="山札の残り枚数">' +
            V8Icons.deck +
            '<span class="v8-counts__num" id="v8-' + who + '-deck">-</span>' +
          '</span>' +
          '<span class="v8-counts__item" role="img" aria-label="トラッシュの枚数">' +
            V8Icons.trash +
            '<span class="v8-counts__num" id="v8-' + who + '-trash">-</span>' +
          '</span>' +
          /* ★v0.10：除外ゾーン（1枚以上あるときだけ）と物音（彫刻公園）。押すと除外の一覧 */
          '<span class="v8-counts__item v8-counts__item--exile" id="v8-' + who + '-exilebox" aria-label="除外ゾーンの枚数" hidden>' +
            '<span class="v8-counts__tag">除外</span>' +
            '<span class="v8-counts__num" id="v8-' + who + '-exile">0</span>' +
          '</span>' +
          '<span class="v8-counts__item v8-counts__item--noise" id="v8-' + who + '-noisebox" aria-label="物音" hidden>' +
            '<span class="v8-counts__tag">物音</span>' +
            '<span class="v8-counts__num" id="v8-' + who + '-noise">0</span>' +
          '</span>' +
        '</div>' +
        '<button type="button" class="v8-btn v8-hit v8-trash v8-trash--' + who + '" ' +
          'id="v8-' + who + '-trashbtn">トラッシュ</button>' +
        '<button type="button" class="v8-field v8-hit v8-field--' + who + '" id="v8-' + who + '-field">' +
          '<span class="v8-field__lost"><b id="v8-' + who + '-lost">-</b>' +
          '<span> / </span><span id="v8-' + who + '-lostmax">-</span></span>' +
        '</button>' +
        /* 板は5枚。残り枚数に応じて見せる数を変える（data-level） */
        '<div class="v8-deck v8-deck--' + who + '" id="v8-' + who + '-deckpile" data-level="5">' +
          '<span class="v8-deck__sheet"></span><span class="v8-deck__sheet"></span>' +
          '<span class="v8-deck__sheet"></span><span class="v8-deck__sheet"></span>' +
          '<span class="v8-deck__sheet"></span>' +
          '<span class="v8-deck__num" id="v8-' + who + '-decknum">-</span>' +
        '</div>' +
        '<div class="v8-vigor v8-vigor--' + who + '">' +
          '<span class="v8-vigor__label">気力</span>' +
          '<span class="v8-vigor__num" id="v8-' + who + '-vigor">-</span>' +
        '</div>';
    };

    return '' +
      P('opp') +

      /* 盤面。カードの位置は v08-board.js が実測値から計算して置く */
      '<div class="v8-board">' +
        '<div class="v8-area" id="v8-area-opp-youkai"></div>' +
        '<div class="v8-area" id="v8-area-opp-human"></div>' +
        '<div class="v8-area" id="v8-area-self-human"></div>' +
        '<div class="v8-area" id="v8-area-self-youkai"></div>' +
      '</div>' +

      /* 中央の固定UI（設定・ログ・メイン終了） */
      '<button type="button" class="v8-btn v8-hit v8-iconbtn v8-iconbtn--settings" id="v8-btn-settings">設定</button>' +
      '<button type="button" class="v8-btn v8-hit v8-iconbtn v8-iconbtn--log" id="v8-btn-log">ログ</button>' +
      '<button type="button" class="v8-btn v8-hit v8-main" id="v8-btn-main">' +
        '<span class="v8-main__progress" id="v8-main-progress"></span>' +
        '<span id="v8-main-label">メイン終了</span></button>' +

      P('self') +

      /* ★ドラッグしたカードの置き先。ふだんは見えない（5.4）。
         ★人間・怪異・イベント・グッズで枠を分けていましたが、
           分ける利点が無かったので1つにまとめました（2026-08-01）。
           カードの種類で枠の場所が変わると、そのつど狙いを
           変えることになり、覚えることが増えるだけでした。 */
      '<div class="v8-drop" data-drop="any" id="v8-drop"></div>' +

      /* ★拡大手札（5.2）。下部の一部が隠れてよいが、盤面カードは押せる。
         ★閉じるための取っ手を、カードの上へ細く置きます。
           拡大するとカードが手札の帯を覆ってしまい、帯をもう一度
           タップして閉じる、ができなくなるためです。 */
      '<div class="v8-hand-big" id="v8-hand-big"></div>' +

      /* 追跡の線と矢印（6.6） */
      '<svg class="v8-track-arrow" id="v8-track-arrow" aria-hidden="true">' +
        '<line id="v8-track-line" x1="0" y1="0" x2="0" y2="0"></line>' +
        '<polygon id="v8-track-head" points=""></polygon>' +
      '</svg>' +

      /* 追跡の案内（6.8：仮追跡がないときだけ） */
      '<div class="v8-track-guide" id="v8-track-guide">怪異を人間へドラッグ</div>' +

      /* 確認パネル（6.9・6.10：背景タップは効かない） */
      '<div class="v8-confirm" id="v8-confirm">' +
        '<div class="v8-confirm__scrim"></div>' +
        '<div class="v8-confirm__panel">' +
          '<p class="v8-confirm__msg" id="v8-confirm-msg"></p>' +
          /* ★ボタンは dialog() が場面に合わせて作ります。ここには置きません。 */
          '<div class="v8-confirm__row" id="v8-confirm-row"></div>' +
        '</div>' +
      '</div>' +

      /* クイック表示（第8部：左上へ固定。×は置かない） */
      '<div class="v8-quick" id="v8-quick">' +
        '<h3 class="v8-quick__name" id="v8-quick-name"></h3>' +
        '<div class="v8-quick__body" id="v8-quick-body"></div>' +
      '</div>' +

      /* 固定式カード詳細（第9部：全画面・最大3階層） */
      '<div class="v8-detail" id="v8-detail">' +
        '<div class="v8-detail__bar">' +
          '<button type="button" class="v8-btn v8-detail__nav" id="v8-detail-back">戻る</button>' +
          '<button type="button" class="v8-btn v8-detail__nav" id="v8-detail-close">閉じる</button>' +
        '</div>' +
        '<div class="v8-detail__body" id="v8-detail-body"></div>' +
      '</div>' +

      /* 効果処理パネル（第10部：画面右上。左上のクイック表示と同時に出せる） */
      '<div class="v8-effects" id="v8-effects">' +
        '<div class="v8-effects__current" id="v8-effects-current">' +
          '<h4 class="v8-effects__name" id="v8-effects-name"></h4>' +
          '<p class="v8-effects__text" id="v8-effects-text"></p>' +
        '</div>' +
        '<div class="v8-effects__queue" id="v8-effects-queue"></div>' +
      '</div>' +

      /* ★確定した追跡のコンベア式矢印（Stage 6-6）。
         カードより後ろに置きます（操作の邪魔をしないため）。 */
      '<svg class="v8-fx-arrows" id="v8-fx-arrows" aria-hidden="true"></svg>' +

      /* ★対戦中の演出（Stage 6-4）。奥と手前の2枚。
         拡大手札より奥を通る光と、手前を通る光があります。 */
      '<div class="v8-fx v8-fx--low" id="v8-fx-low"></div>' +
      '<div class="v8-fx v8-fx--top" id="v8-fx-top"></div>' +

      /* CPUの様子（既存の #cpu-thinking / #cpu-reveal を写したもの） */
      '<div class="v8-cpu" id="v8-cpu">' +
        '<div class="v8-cpu__think" id="v8-cpu-think">CPU思考中…</div>' +
        '<div class="v8-cpu__reveal" id="v8-cpu-reveal">' +
          '<div class="v8-cpu__card" id="v8-cpu-card"></div>' +
          '<div class="v8-cpu__name" id="v8-cpu-name"></div>' +
        '</div>' +
      '</div>' +

      /* 対戦中の設定（第21部） */
      '<div class="v8-set" id="v8-set">' +
        '<div class="v8-set__bar">' +
          '<button type="button" class="v8-btn v8-prep__back" id="v8-set-back">戻る</button>' +
          '<span class="v8-prep__head">設定</span>' +
        '</div>' +
        '<div class="v8-set__body" id="v8-set-body"></div>' +
      '</div>' +

      /* リザルト（第18部：使ったデッキの0コスト人間を背景に） */
      '<div class="v8-result" id="v8-result">' +
        '<div class="v8-result__art" id="v8-result-art"></div>' +
        '<div class="v8-result__veil"></div>' +
        '<div class="v8-result__main">' +
          '<h2 class="v8-result__title" id="v8-result-title"></h2>' +
          '<p class="v8-result__reason" id="v8-result-reason"></p>' +
          '<div class="v8-result__info" id="v8-result-info"></div>' +
          '<div class="v8-result__btns">' +
            '<button type="button" class="v8-btn v8-result__btn" id="v8-result-log">対戦ログ</button>' +
            '<button type="button" class="v8-btn v8-result__btn" id="v8-result-again">再戦</button>' +
            '<button type="button" class="v8-btn v8-result__btn v8-result__btn--go" id="v8-result-next">進む</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* 対戦準備（第16部：1画面に条件をまとめる） */
      '<div class="v8-prep" id="v8-prep">' +
        '<div class="v8-prep__bar">' +
          '<button type="button" class="v8-btn v8-prep__back" id="v8-prep-back">戻る</button>' +
          '<span class="v8-prep__head">CPU対戦</span>' +
        '</div>' +
        '<div class="v8-prep__body">' +
          /* ★「あなた」を上に（ダロクの指示。仕様書 16.1 は相手が上だが、
                 自分の条件から決めるほうが分かりやすいという判断） */
          '<button type="button" class="v8-prep__deck v8-deckthumb" id="v8-prep-self">' +
            '<span class="v8-prep__who v8-prep__who--me">あなた</span>' +
            '<span class="v8-prep__deckveil">' +
              '<span class="v8-prep__deckname" id="v8-prep-self-name"></span>' +
              '<span class="v8-prep__deckdesc" id="v8-prep-self-desc"></span>' +
            '</span>' +
            '<span class="v8-prep__change" id="v8-prep-self-change">変更</span>' +
          '</button>' +

          '<button type="button" class="v8-btn v8-prep__row" id="v8-prep-turn">' +
            '<span>手番</span>' +
            '<span class="v8-prep__now"><span id="v8-prep-turn-val"></span> ›</span>' +
          '</button>' +

          '<div class="v8-prep__vs">VS</div>' +

          '<button type="button" class="v8-prep__deck v8-deckthumb" id="v8-prep-opp">' +
            '<span class="v8-prep__who">CPU</span>' +
            '<span class="v8-prep__deckveil">' +
              '<span class="v8-prep__deckname" id="v8-prep-opp-name"></span>' +
              '<span class="v8-prep__deckdesc" id="v8-prep-opp-desc"></span>' +
            '</span>' +
            '<span class="v8-prep__change" id="v8-prep-opp-change">変更</span>' +
          '</button>' +

          '<button type="button" class="v8-btn v8-prep__row" id="v8-prep-diff">' +
            '<span>CPU難易度</span>' +
            '<span class="v8-prep__now"><span id="v8-prep-diff-val"></span> ›</span>' +
          '</button>' +

          /* ★詳細設定（第16部・作者の指示）。
             シードはふだん使う設定ではないので、ここへしまいます。
             同じ展開をもう一度出すために残してあります。 */
          '<button type="button" class="v8-btn v8-prep__row v8-prep__row--sub" id="v8-prep-more">' +
            '<span>詳細設定</span>' +
            '<span class="v8-prep__now"><span id="v8-prep-more-val"></span> ›</span>' +
          '</button>' +
          '<p class="v8-prep__error" id="v8-prep-error"></p>' +
          '<button type="button" class="v8-btn v8-prep__start" id="v8-prep-start">対戦開始</button>' +
        '</div>' +

        /* デッキ選択（第17部：2列・公式／自作の見出し・仮選択と確定） */
        '<div class="v8-deckpick" id="v8-deckpick">' +
          '<div class="v8-deckpick__bar">' +
            '<button type="button" class="v8-btn v8-prep__back" id="v8-deck-back">戻る</button>' +
            '<span class="v8-prep__head" id="v8-deck-title"></span>' +
          '</div>' +
          '<p class="v8-deckpick__note" id="v8-deck-note"></p>' +
          '<div class="v8-deckpick__body" id="v8-deck-list"></div>' +
          '<button type="button" class="v8-btn v8-deckpick__ok" id="v8-deck-ok">このデッキを選ぶ</button>' +
        '</div>' +

        /* 小さな選択画面（16.2） */
        /* ★詳細設定の中身（いまはシードだけ） */
        '<div class="v8-prep__more" id="v8-prep-moreui">' +
          '<div class="v8-prep__pickscrim" id="v8-prep-more-scrim"></div>' +
          '<div class="v8-prep__pickbox">' +
            '<h3 class="v8-prep__picktitle">詳細設定</h3>' +
            '<div class="v8-prep__morerow">' +
              '<span class="v8-prep__morelabel">シード</span>' +
              '<div class="v8-prep__picklist" id="v8-prep-seedmode"></div>' +
            '</div>' +
            '<input type="text" class="v8-prep__seed" id="v8-prep-seed" ' +
              'inputmode="text" autocomplete="off" placeholder="例：MAYO-1A2B-3C4D">' +
            '<p class="v8-prep__morenote">同じシードなら、毎回同じ順番で山札が並びます。' +
              '同じ展開をもう一度出したいときに使います。</p>' +
            '<button type="button" class="v8-btn v8-prep__moreclose" id="v8-prep-more-close">閉じる</button>' +
          '</div>' +
        '</div>' +
        '<div class="v8-prep__pick" id="v8-prep-pick">' +
          '<div class="v8-prep__pickscrim" id="v8-prep-pick-scrim"></div>' +
          '<div class="v8-prep__pickbox">' +
            '<h3 class="v8-prep__picktitle" id="v8-prep-pick-title"></h3>' +
            '<div class="v8-prep__picklist" id="v8-prep-pick-list"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* マリガン（第15部：手札以外を暗くし、手札と確定ボタンだけ操作できる） */
      '<div class="v8-mull" id="v8-mull">' +
        '<div class="v8-mull__scrim"></div>' +
        '<p class="v8-mull__say" id="v8-mull-say"></p>' +
        '<div class="v8-mull__hand" id="v8-mull-hand"></div>' +
        '<button type="button" class="v8-btn v8-mull__confirm" id="v8-mull-confirm"></button>' +
      '</div>' +

      /* 対戦ログ（第14部：トラッシュと同じ大型パネル） */
      '<div class="v8-log-wrap" id="v8-log-wrap">' +
        '<div class="v8-log__scrim" id="v8-log-scrim"></div>' +
        '<div class="v8-log" id="v8-log">' +
          '<h3 class="v8-log__title">対戦ログ</h3>' +
          '<div class="v8-log__body" id="v8-log-body"></div>' +
          '<button type="button" class="v8-log__more" id="v8-log-more">新しいログがあります</button>' +
        '</div>' +
      '</div>' +

      /* 公開領域の画面（第11・12・13部） */
      '<div class="v8-zone-wrap" id="v8-zone-wrap">' +
        '<div class="v8-zone__scrim" id="v8-zone-scrim"></div>' +
        '<div class="v8-zone" id="v8-zone">' +
          '<h3 class="v8-zone__title" id="v8-zone-title"></h3>' +
          '<div class="v8-zone__list" id="v8-zone-list"></div>' +
          '<div class="v8-zone__foot" id="v8-zone-foot">' +
            '<span class="v8-zone__progress" id="v8-zone-progress"></span>' +
            '<button type="button" class="v8-btn v8-zone__confirm" id="v8-zone-confirm">確定</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* 対象選択の案内（7.1） */
      '<div class="v8-pick-hint" id="v8-pick-hint"></div>' +

      '<div class="v8-phase" id="v8-phase"></div>';
  },

  /* =============================================================
     ビューモデルを流し込む
     -------------------------------------------------------------
     受け取るのは表示用の形だけ。ゲーム状態は読み書きしない。
     ============================================================= */
  render: function (view) {
    const root = this._root;
    if (!root || !view) return;
    const doc = document;
    const g = function (id) { return root.querySelector('#' + id); };
    const self = this;

    /* ★追跡フェイズは真上から見ている場面なので、遠近をつけた
       大きさの差を残すと不自然です。いちばん小さいカードに
       全部そろえます（そろえないと3枚並びの列で重なります）。 */
    const topView = !!(typeof V8Track !== 'undefined' && V8Track.active);
    const uniformW = topView ? this._uniformWidth(view) : 0;

    ['opp', 'self'].forEach(function (who) {
      const p = view[who];
      if (!p) return;

      const set = function (id, v) { const el = g(id); if (el) el.textContent = String(v); };
      set('v8-' + who + '-deck', p.deck);
      set('v8-' + who + '-trash', p.trash);
      set('v8-' + who + '-decknum', p.deck);
      set('v8-' + who + '-lost', p.lost);
      set('v8-' + who + '-lostmax', p.lostMax);
      set('v8-' + who + '-vigor', p.vigor);
      /* ★v0.10：除外と物音 */
      set('v8-' + who + '-exile', p.exile || 0);
      set('v8-' + who + '-noise', (p.noise || 0) + '（累計' + (p.noiseTotal || 0) + '）');
      const exb = g('v8-' + who + '-exilebox'); if (exb) exb.hidden = !(p.exile > 0);
      const nzb = g('v8-' + who + '-noisebox'); if (nzb) nzb.hidden = !p.noiseOn;

      /* ★山札の厚みを残り枚数に合わせる */
      const pile = g('v8-' + who + '-deckpile');
      if (pile) pile.setAttribute('data-level', String(V8Board.deckLevel(p.deck)));

      /* フィールドカードの絵 */
      const field = g('v8-' + who + '-field');
      if (field && typeof getCardImagePath === 'function') {
        const path = getCardImagePath(p.fieldId, p.side);
        if (typeof V8Images !== 'undefined') V8Images.apply(field, path);
        else if (path) field.style.backgroundImage = 'url("' + path + '")';
      }

      /* 盤面のカード。side を渡すのは陣営で絵柄が違うカードのため */
      const withSide = function (list) {
        return (list || []).map(function (c) {
          const o = {}; for (const k in c) o[k] = c[k];
          o.side = p.side; return o;
        });
      };
      /* ★通常のカードと追跡中のカードは、置く枠が違います。
         中央の大きい枠が追跡の定位置で、通常のカードは外側から埋めます。
         追跡そのものの見せ方（矢印・真上視点）は Stage 3 で作ります。 */
      /* ★左右の配置（設定）。置き場所だけを入れ替えます。
         カードの入れ物（人間の器・怪異の器）はそのままなので、
         追跡で掴めるのが自分の怪異、狙えるのが相手の人間、という
         役割の決め方は何も変わりません。 */
      V8Board.fillArea(doc, g('v8-area-' + who + '-human'), self._laneKey(who, 'human'),
        withSide(p.normalHuman), withSide(p.trackHuman), uniformW, topView);
      V8Board.fillArea(doc, g('v8-area-' + who + '-youkai'), self._laneKey(who, 'youkai'),
        withSide(p.normalYoukai), withSide(p.trackYoukai), uniformW, topView);

      /* 手札。相手は裏面（4.4）。自分は中身を出す（5.1） */
      if (who === 'opp') {
        V8Board.fillHandBacks(doc, g('v8-' + who + '-hand'), p.hand);
      } else if (typeof V8Hand !== 'undefined') {
        V8Hand.render(doc, p.handCards || []);
      }
    });

    /* ★追跡フェイズ（Stage 3-1）。役割の目印を付けてから明暗を決める */
    if (typeof V8Track !== 'undefined') {
      V8Track.sync();
      this._markTrackRoles(view);
      V8Track.refresh();
    }
    this.updateMainButton();
    /* 対戦ログが開いていれば、新しい行を足す（14.2） */
    if (typeof V8Log !== 'undefined' && V8Log.isOpen()) V8Log.onNewLines();

    /* 効果処理パネル（描き直しで強調が消えるので付け直す） */
    if (typeof V8Effects !== 'undefined') V8Effects.refresh();

    /* 対象選択中は、明暗と番号を付け直す（描き直しで消えるため） */
    if (typeof V8Target !== 'undefined' && V8Target.active) V8Target.refresh();

    /* 開いているクイック表示は、対戦の進行に合わせて中身を更新する（8.5） */
    if (typeof V8Quick !== 'undefined' && V8Quick.isOpen()) V8Quick.render(false);
    if (typeof V8Detail !== 'undefined' && V8Detail.isOpen()) V8Detail.render();
    return self;
  },

  /* =============================================================
     ★確認パネル（既存の showDialog をここへ写す）
     -------------------------------------------------------------
     背景を暗くし、背景タップは効きません。ボタンだけで進みます。
     @param {object} opts { title, message, buttons:[{label, primary, onClick}] }
     @param {Function} onClosed 閉じたあとに必ず呼ぶ（CPUの足止めを解くため）
     @return {boolean} 引き受けたか
     ============================================================= */
  dialog: function (opts, onClosed) {
    const root = this._root;
    if (!root || !this.isOpen()) return false;
    const box = root.querySelector('#v8-confirm');
    const msg = root.querySelector('#v8-confirm-msg');
    const row = root.querySelector('#v8-confirm-row');
    if (!box || !msg || !row) return false;

    const text = [opts.title, opts.message].filter(Boolean).join('\n');
    msg.textContent = text;

    row.innerHTML = '';
    const doc = document;
    let close = function () {
      box.classList.remove('v8-on');
      if (onClosed) onClosed();
    };
    /* ★端末の戻るで閉じられるよう、閉じ方を覚えておきます（20.1） */
    const self4 = this;
    this._dialogClose = function () { self4._dialogClose = null; close(); };
    const closeAll = close;
    close = function () { self4._dialogClose = null; closeAll(); };
    /* ★v0.10：答えないと対局が進まない問い（効果の中の選択など）は、
       端末の戻るでは閉じません（戻るは「受け取ったが何もしない」）。 */
    if (opts.required) this._dialogClose = function () { /* 必ず答えてもらう */ };

    (opts.buttons || [{ label: 'OK', primary: true }]).forEach(function (b) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'v8-btn v8-confirm__btn' + (b.primary ? ' v8-confirm__btn--ok' : '');
      btn.textContent = b.label;
      btn.onclick = function () { close(); if (b.onClick) b.onClick(); };
      row.appendChild(btn);
    });
    /* ★v0.10：選択肢が3つ以上なら縦に並べる（横に並べると文字が切れる） */
    row.classList.toggle('v8-confirm__row--list', (opts.buttons || []).length >= 3);
    box.classList.add('v8-on');
    return true;
  },

  /** CPUが考えているあいだの表示 */
  showCpuThinking: function (on) {
    if (!this._root) return;
    const el = this._root.querySelector('#v8-cpu-think');
    if (el) el.classList.toggle('v8-on', !!on);
  },

  /** CPUが使うカードの一時公開。cardId が無ければ片づける */
  showCpuReveal: function (cardId, owner, name) {
    if (!this._root) return;
    const box = this._root.querySelector('#v8-cpu-reveal');
    const card = this._root.querySelector('#v8-cpu-card');
    const nm = this._root.querySelector('#v8-cpu-name');
    if (!box) return;
    if (!cardId) { box.classList.remove('v8-on'); return; }
    if (card && typeof V8Images !== 'undefined' && typeof getCardImagePath === 'function') {
      V8Images.apply(card, getCardImagePath(cardId, owner));
    }
    if (nm) nm.textContent = name || '';
    box.classList.add('v8-on');
  },

  /* =============================================================
     ★端末の戻る操作（第20部）
     -------------------------------------------------------------
     開いているものを、手前から1つずつ閉じます。
     順番は 20.1 のとおりです。

       確認パネル → カード詳細（階層があれば1つ前へ）
       → トラッシュ／ロスト／山札／ログ／設定 → クイック表示
       → 対象選択の解除 → 仮追跡の解除
       → 何も無ければ、これまでどおり（対戦終了の確認など）

     @return {boolean} 閉じるものがあったか
     ============================================================= */
  onBack: function () {
    /* 1. 確認パネル（いちばん手前） */
    if (this._dialogClose) { this._dialogClose(); return true; }

    /* 2. カード詳細。階層があれば1つ前へ、1階層目なら閉じる */
    if (typeof V8Detail !== 'undefined' && V8Detail.isOpen()) { V8Detail.back(); return true; }

    /* 3. 重ねて見ている画面 */
    if (typeof V8Zones !== 'undefined' && V8Zones.isOpen()) {
      /* 選んでいる最中は勝手に閉じません（枠外タップと同じ扱い） */
      if (V8Zones.mode !== 'pick') V8Zones.close();
      return true;
    }
    if (typeof V8Log !== 'undefined' && V8Log.isOpen()) { V8Log.close(); return true; }
    if (typeof V8Settings !== 'undefined' && V8Settings.isOpen()) { V8Settings.close(); return true; }

    /* 4. クイック表示 */
    if (typeof V8Quick !== 'undefined' && V8Quick.isOpen()) { V8Quick.close(); return true; }

    /* 5. 選びかけ・仮追跡の取り消し */
    if (typeof V8Target !== 'undefined' && V8Target.active && V8Target.chosen.length) {
      V8Target.clear(); return true;
    }
    /* ★グッズの装備先を選んでいる最中で、まだ何も選んでいなければ、
       選ぶこと自体をやめます。まだ使っていないので手札に戻ります。
       効果の対象選択はすでに解決が始まっているのでやめられません。 */
    if (typeof V8Target !== 'undefined' && V8Target.active && V8Target.cancellable) {
      V8Target.cancel(); return true;
    }
    if (typeof V8Track !== 'undefined' && V8Track.active && V8Track.temp) {
      V8Track.clearTemp(); return true;
    }

    /* 6. 拡大手札 */
    if (typeof V8Hand !== 'undefined' && V8Hand.expanded) { V8Hand.collapse(); return true; }

    return false;   // 閉じるものが無い → これまでどおり
  },

  /** 中央へ大きな文字を出す（既存の showBanner をここへ写す） */
  banner: function (text, isAttack) {
    this.showPhase(text, isAttack);
  },

  /** 手札のカードを長押ししたとき（v08-hand.js から呼ばれる） */
  onCardLongPress: function (card) {
    if (typeof V8Detail !== 'undefined' && card) V8Detail.open(card.uid);
  },

  /* =============================================================
     ★左右の配置（設定「左右を反転」）
     -------------------------------------------------------------
     入れ替えるのは「どの置き場所を使うか」だけです。
     既定は「標準」で、自分＝人間が左・怪異が右です。
     ============================================================= */
  isMirrored: function () {
    try {
      if (typeof Screens !== 'undefined' && Screens.settings) {
        return Screens.settings.mirrorLanes === 'on';
      }
    } catch (e) { /* 設定が読めなくても盤面は出す */ }
    return false;
  },

  /** そのカードの種類が、いまどちらの置き場所を使うか */
  _laneKey: function (who, kind) {
    if (!this.isMirrored()) return who + '-' + kind;
    return who + '-' + ((kind === 'human') ? 'youkai' : 'human');
  },

  /** 盤面に出る全カードのうち、いちばん狭い幅（1080基準） */
  _uniformWidth: function (view) {
    let min = Infinity;
    const self = this;
    ['opp', 'self'].forEach(function (who) {
      const p = view[who];
      if (!p) return;
      [['human', p.normalHuman, p.trackHuman],
        ['youkai', p.normalYoukai, p.trackYoukai]].forEach(function (t) {
        V8Board.assign(self._laneKey(who, t[0]), t[1], t[2], true).forEach(function (pair) {
          if (pair.box.w < min) min = pair.box.w;
        });
      });
    });
    return (min === Infinity) ? 0 : min;
  },

  /* =============================================================
     追跡フェイズで掴めるカード・狙えるカードに目印を付ける
     -------------------------------------------------------------
     追跡できるのは「自分の怪異 → 相手の人間」の向きだけ（game.js）。
     組み合わせに制限はありません。
     ============================================================= */
  _markTrackRoles: function (view) {
    const root = this._root;
    if (!root) return;
    const on = (typeof V8Track !== 'undefined') && V8Track.active;

    const mark = function (areaId, role) {
      const area = root.querySelector('#' + areaId);
      if (!area) return;
      const cards = area.querySelectorAll('.v8-card');
      Array.prototype.forEach.call(cards, function (el) {
        const uid = el.getAttribute('data-uid');
        if (on && role === 'youkai' && typeof V8Track !== 'undefined') {
          el.setAttribute('data-track-role', role);
          V8Track.bindYoukai(el, uid);      // 掴める怪異はドラッグも付く
        } else {
          if (on && role) el.setAttribute('data-track-role', role);
          else el.removeAttribute('data-track-role');
          /* ★盤面のカードは、短いタップでクイック表示、
             長押しで固定式詳細（8.3・9.1）。 */
          if (typeof V8Input !== 'undefined') {
            V8Input.attach(el, {
              onTap: function () {
                /* ★対象選択中、短いタップは選択専用です。
                   クイック表示は出しません（7.7）。 */
                if (typeof V8Target !== 'undefined' && V8Target.active) {
                  V8Target.tap(uid);
                  return;
                }
                if (typeof V8Quick !== 'undefined') V8Quick.toggle(uid);
              },
              /* 長押しは、選択中でも詳細を開けます（7.7） */
              onLongPress: function () { if (typeof V8Detail !== 'undefined') V8Detail.open(uid); },
            });
          }
        }
      });
    };

    mark('v8-area-self-youkai', 'youkai');   // 掴める
    mark('v8-area-opp-human', 'human');      // 狙える
    mark('v8-area-self-human', null);
    mark('v8-area-opp-youkai', null);
  },

  /** 主操作ボタンの文字を、いまの場面に合わせる（4.6） */
  updateMainButton: function () {
    if (!this._root) return;
    const label = this._root.querySelector('#v8-main-label');
    const prog = this._root.querySelector('#v8-main-progress');
    const btn = this._root.querySelector('#v8-btn-main');
    const picking = (typeof V8Target !== 'undefined') && V8Target.active;

    if (label) {
      label.textContent = picking ? V8Target.mainLabel()
        : ((typeof V8Track !== 'undefined') ? V8Track.mainLabel() : '');
    }
    /* 複数選択の進捗はボタンの上へ（7.4） */
    if (prog) prog.textContent = picking ? V8Target.progress() : '';

    /* ★対象が選べていて、押せば進める状態のときは光らせます。
       「次はここを押す」が文字を読まなくても分かるようにするためです。 */
    if (btn) {
      btn.classList.toggle('v8-main--ready', picking && V8Target.canConfirm());
    }
  },

  /* =============================================================
     開く・閉じる
     ============================================================= */
  show: function (view) {
    if (!this._root) return;

    /* ★対戦中は V7Bridge が #v7-root に v7-hidden（display:none）を付けて
       器ごと隠しています。この画面は器の中にあるので、開いているあいだだけ
       器を出し、閉じるときに元へ戻します。 */
    this._unhidRoot = false;
    const rootEl = (typeof document !== 'undefined')
      ? document.getElementById('v7-root') : null;
    if (rootEl && rootEl.classList.contains('v7-hidden')) {
      rootEl.classList.remove('v7-hidden');
      this._unhidRoot = true;
    }

    this._root.classList.add('v7-on');
    this.render(view || this.currentView());
  },

  hide: function () {
    if (!this._root) return;
    this._root.classList.remove('v7-on');

    /* 器を自分で出していたなら、必ず元へ戻す。
       戻し忘れると既存の対戦画面が器に覆われて操作できなくなります。 */
    if (this._unhidRoot && typeof document !== 'undefined') {
      const rootEl = document.getElementById('v7-root');
      if (rootEl) rootEl.classList.add('v7-hidden');
    }
    this._unhidRoot = false;
  },

  /** 器を自分で出したかどうか（出したなら閉じるときに戻す） */
  _unhidRoot: false,

  /* =============================================================
     ★出し入れの判断（Stage 2-2 で切り替えボタンを廃止）
     -------------------------------------------------------------
     対戦が画面に出ているあいだは、この画面が対戦の盤面です。
     ただし、既存の選択画面・確認・ログなどが開いている間は
     場所を譲ります（それらの中身は Stage 3・4 でこちらへ移します）。
     ============================================================= */
  sync: function () {
    if (typeof window === 'undefined') return;
    /* ★対戦準備を出しているあいだは触りません。
       この見張りは「対戦していないなら隠す」判断をするので、
       準備画面まで一緒に閉じてしまいます。 */
    /* ★対戦準備を出しているあいだと、既存の画面へ渡している最中は触りません。
       この見張りは「対戦していないなら盤面を隠す」判断をするので、
       渡している途中に器を閉じてしまい、裏の画面が覗きます。 */
    /* ★対戦を始めようとしている最中は、対戦の盤面が出るまで準備画面を残します。
       先に下ろすと、盤面が出るまでのあいだ裏の画面が覗きます。 */
    if (typeof V8Prep !== 'undefined' && V8Prep.isStartingMatch()) {
      const started = !!(window.__v8Active && window.__v8Active());
      if (!started) return;          // まだ出ていないので、そのまま待つ
      V8Prep.finishStart();          // 出たので、ここで入れ替える
    }

    if (typeof V8Prep !== 'undefined' && V8Prep.isBusy()) return;
    /* ★リザルトを出しているあいだも触りません（対戦は終わっているので、
       そのままだと見張りが盤面ごと閉じてしまいます） */
    if (typeof V8Result !== 'undefined' && V8Result.isOpen()) return;
    if (typeof V8Settings !== 'undefined' && V8Settings.isOpen()) return;
    /* __v8Active は「マリガン中は false」を含みます（Stage 5 まで既存に任せる） */
    const active = !!(window.__v8Active && window.__v8Active());
    const overlay = !!(window.__v8LegacyOverlayOpen && window.__v8LegacyOverlayOpen());
    const want = active && !overlay;

    if (want && !this.isOpen()) {
      this.show();
      /* ★対戦が見えたところで、最初に要る画像を読み始める（19.3） */
      if (window.__v8BeginImages) window.__v8BeginImages();
      /* ログの行が増えたときに枚数を控えられるようにする */
      if (window.__v8WatchLog) window.__v8WatchLog();
      return;
    }
    if (!want && this.isOpen()) {
      this.hide();
      /* ★対戦が画面から消えたら参照を手放す（19.6） */
      if (!active && window.__v8ReleaseImages) window.__v8ReleaseImages();
      return;
    }
    if (want) this.renderIfChanged();
  },

  /* =============================================================
     ★変わったときだけ描き直す
     -------------------------------------------------------------
     ・ドラッグしている最中は描き直しません。
       描き直すとカードの要素が作り直され、掴んでいたものが
       消えてドラッグが途切れます。
     ・「出せるカードの光り方」は操作できるかどうかでも変わるので、
       それも目印に含めます。
     ============================================================= */
  _lastSig: '',

  renderIfChanged: function (force) {
    /* ★ドラッグしている最中は描き直しません。描き直すとカードの要素が
       作り直され、掴んでいたものが消えてドラッグが途切れます。
       手札のドラッグと、追跡のドラッグの両方を見ます。 */
    if (typeof V8Hand !== 'undefined' && V8Hand._drag) return;
    if (typeof V8Track !== 'undefined' && V8Track._drag) return;
    const view = this.currentView();
    let sig = '';
    if (typeof V8State !== 'undefined') sig = V8State.signature(view);
    sig += '#' + ((typeof V8Cmd !== 'undefined' && V8Cmd.canOperate()) ? '1' : '0');
    sig += '#' + ((typeof V8Hand !== 'undefined' && V8Hand.expanded) ? '1' : '0');
    sig += '#' + ((typeof V8Track !== 'undefined' && V8Track.active) ? '1' : '0');
    sig += '#' + ((typeof V8Target !== 'undefined' && V8Target.active)
      ? ('t' + V8Target.chosen.join(',')) : '');
    sig += '#' + (this.isMirrored() ? 'm' : '');
    if (!force && sig === this._lastSig) return;
    this._lastSig = sig;

    /* ★描く前に、盤面のカードがどこにあったかを控えます（2026-08-01）。
       描いたあとに「元の位置から今の位置へ」動かし直すためです。
       追跡フェイズで前に出るカードが、ぱっと入れ替わらなくなります。 */
    if (typeof V8Fx !== 'undefined') V8Fx.captureBoard();
    this.render(view);
    /* ★動かし直しているあいだ、カードの見かけの位置は「動く前」です。
       この最中に矢印を引くと、動く前の場所に引かれてしまいます
       （追跡フェイズに入った瞬間に、矢印がずれて見えていました）。
       flipBoard は「動かしたかどうか」を返すので、動かしたときは
       終わってから引き直します。 */
    const moved = (typeof V8Fx !== 'undefined') ? V8Fx.flipBoard() : false;

    /* ★飛んでいる光の行き先を向け直します（Stage 6-4）。
       手札をたたむと着地点が動くので、描き直したあとに合わせます。
       ★赤くしている体力も、描き直すと消えるので付け直します（Stage 6-5）。
       ★追跡の矢印も、カードの位置が変わるので描き直します（Stage 6-6）。 */
    if (typeof V8Fx !== 'undefined') {
      V8Fx.reaim();
      V8Fx.applyHpHit();
      if (moved) V8Fx.hideArrows();      // 動いているあいだは出さない
      else V8Fx.renderArrows();
    }
  },

  /* =============================================================
     ★軽い見張り
     -------------------------------------------------------------
     preview.js の特定の関数に知らせを差し込む形にしていましたが、
     「操作できるようになる」瞬間に呼ばれる関数が場面ごとに違い、
     取りこぼしが出ました（出せるカードが光らない・盤面が戻らない）。
     知らせは知らせで受けつつ、取りこぼしを拾うために
     ゆっくりした見張りも置きます。描き直しは変化したときだけです。
     ============================================================= */
  WATCH_MS: 220,
  _watchId: null,

  startWatch: function () {
    if (this._watchId !== null || typeof setInterval !== 'function') return;
    const self = this;
    this._watchId = setInterval(function () { self.sync(); }, this.WATCH_MS);
  },

  isOpen: function () {
    return !!(this._root && this._root.classList.contains('v7-on'));
  },

  /* =============================================================
     いま見せるべきビューモデル
     -------------------------------------------------------------
     対戦が動いていれば本物の状態、動いていなければ見本。
     ============================================================= */
  currentView: function () {
    if (typeof V8State !== 'undefined' && V8State.isLive()) {
      const v = V8State.build();
      if (v) return v;
    }
    return this.DEMO;
  },

  /* =============================================================
     本物の対戦に追従する
     -------------------------------------------------------------
     ★既存の preview.js には手を入れません。
       この画面は既存の盤面に重ねて映すだけなので、
       状態が変わったかを短い間隔で見て、変わったときだけ描き直します。
       描き直すのは表示だけで、ゲーム処理には触れません。

     Stage 2 の後半で操作をつなぐときに、この追従は
     「操作のたびに描き直す」形へ置き換えます。
     ============================================================= */
  /* =============================================================
     動きを減らす（3.7 / 21.2）
     -------------------------------------------------------------
     ゲーム内設定と prefers-reduced-motion のどちらかが有効なら軽減。
     CSS 側で media query も見ているので、ここはゲーム内設定ぶん。
     ゲーム処理の時間や順番は変えない（3.7）。
     ============================================================= */
  applyReduceMotion: function (on) {
    if (!this._root) return;
    this._root.classList.toggle('v8-reduce', !!on);
  },

  _savedReduceMotion: function () {
    try {
      /* 既存の設定と同じ場所を見ます（Stage 6-2） */
      if (typeof Screens !== 'undefined' && Screens.settings) {
        return !!Screens.settings.reduceMotion;
      }
    } catch (e) { /* 保存が使えなくても表示は続ける */ }
    return false;
  },

  /* =============================================================
     フェイズ表示（4.7：常時表示せず、開始時だけ短く中央へ）
     ============================================================= */
  /**
   * ★中央の文字を消す（2026-08-01）。
   * 印（v8-on）を外すだけでなく、文字そのものも空にします。
   * この盤面は隠れてから出し直されることがあり、印が残っていると
   * 出し直したところで動きが再生されて、前の文字がもう一度出ます。
   */
  hidePhase: function () {
    if (!this._root) return;
    const el = this._root.querySelector('#v8-phase');
    if (!el) return;
    el.classList.remove('v8-on', 'v8-phase--attack');
    el.textContent = '';
  },

  showPhase: function (text, isAttack) {
    if (!this._root) return;
    const el = this._root.querySelector('#v8-phase');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('v8-phase--attack', !!isAttack);
    el.classList.remove('v8-on');
    /* クラスを付け直してアニメーションを再生する */
    void el.offsetWidth;
    el.classList.add('v8-on');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Battle: V8Battle };
}
