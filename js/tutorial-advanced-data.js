/* =====================================================================
   tutorial-advanced-data.js  ―― 実践編の台本（仕様書 21）
   ---------------------------------------------------------------------
   基本編（tutorial-basic-data.js）と同じ形です。
   進め方の仕組みは tutorial-controller.js、
   見た目は tutorial-ui.js が受け持ちます。

   【基本編との一番の違い】
   実践編は、対戦のはじめからではなく★途中から始まります（仕様書 21.2）。
   盤面は tutorial-deck.js の applySnapshot が組み立てます。

   【説明文を書くときに決めたこと】（基本編と同じ）
     ・一度に1つのことだけ言う
     ・「なぜそうするのか」を必ず添える
     ・専門語を先に説明してから使う
     ・カード名は《》で囲む
   ===================================================================== */

/* 実践編で使うカード（仕様書 21.2・全13枚とも実在を確認済み） */
const TUTORIAL_ADV_CARDS = {
  // --- あなた（ヨマモリ村） ---
  haruka:     'village_haruka',        // 孤独な夜道 ハルカ    人間 SP2/HP3
  flashlight: 'village_flashlight',    // 懐中電灯            グッズ コスト0
  ichimatsu:  'village_ichimatsu',     // 寂しがる市松人形      怪異 SP3/HP2
  ofuda:      'village_ofuda',         // 古いお札            グッズ コスト1
  boundary:   'event_kyoukaisen',      // 境界線              イベント コスト0
  nushi:      'village_nushi',         // 山を守るヌシ様        怪異 SP4/HP6
  helping:    'village_sashinoberu',   // 引き戻す力         イベント コスト0
  luna:       'village_luna',          // 泣き虫転校生 ルナ     人間 SP2/HP2

  // --- 相手（黒薔薇の館） ---
  sylvie:     'mansion_sylvie',        // 寡黙な使用人 シルヴィ  人間 SP2/HP4
  emma:       'mansion_emma',          // 微笑む使用人 エマ     人間 SP2/HP3
  chimera:    'mansion_chimera',       // 地下室に棲むキメラ    怪異 SP3/HP2
  lily:       'mansion_lily',          // 招かれた令嬢 リリィ    人間 SP3/HP2
  annette:    'mansion_annette',       // 不憫な客人 アネット    人間 SP2/HP2
};

const TA = TUTORIAL_ADV_CARDS;

const TutorialAdvancedData = {

  id: 'advanced',
  title: '実践編',

  /* =============================================================
     対戦の決めごと（仕様書 21.2）
     ============================================================= */
  fixed: {
    playerDeck: 'village',
    cpuDeck: 'mansion',
    playerSide: 'village',
    cpuSide: 'mansion',
    firstSide: 'village',      // あなたの番から始まります
    seed: 'TUTORIAL-ADVANCED',
  },

  /* =============================================================
     ★開始時の盤面（仕様書 21.2）
     -------------------------------------------------------------
     対戦を普通に始めてから、この形へ組み立て直します。
     カードは増やしません。場へ出したぶんは山札から抜きます。
     ============================================================= */
  openingSnapshot: {
    village: {
      humans: [TA.haruka],
      youkai: [],
      hand: [TA.flashlight, TA.ichimatsu, TA.ofuda, TA.boundary, TA.nushi],
      energy: 2,
    },
    mansion: {
      humans: [TA.sylvie, TA.emma],
      youkai: [TA.chimera],
      energy: 2,
    },
    // キメラがハルカを追跡している状態から始まります
    tracking: {
      side: 'mansion',
      youkai: TA.chimera,
      targetSide: 'village',
      human: TA.haruka,
    },
  },

  /* =============================================================
     山札の仕込み（仕様書 21.5）
     -------------------------------------------------------------
     台本どおりの札が来るように、引く順番を決めておきます。

     ★仕込む時機は、それぞれのステップの setup に書いてあります。
     ここに一覧を置いているのは、見比べやすくするためです。
     ============================================================= */
  drawPlan: {
    // 市松人形とシルヴィの襲撃のあと、《引き戻す力》を引きます
    afterFirstAssault: [TA.helping],
    // 境界線で2枚引くとき、《市松人形》《ルナ》が来ます
    boundaryDraw: [TA.ichimatsu, TA.luna],
  },

  chapters: [
    'グッズを使う',
    'グッズで戦う',
    'イベントを使う',
    '気力を持ち越す',
    '大きな怪異で攻める',
    '勝負を決める',
  ],

  steps: [

    /* ===========================================================
       第1章　グッズを使う
       =========================================================== */
    {
      id: 'advanced_intro',
      chapter: 'グッズを使う',
      pages: [
        {
          title: '実践編へようこそ',
          text: 'ここでは、対戦の途中から始めます。\n' +
                '基本編より一歩ふみこんだ内容です。\n\n' +
                'グッズ、イベント、気力のやりくり。\n' +
                '勝ち筋を組み立てるための道具がそろいます。',
        },
        {
          title: 'いまの盤面',
          text: 'あなたの場には《孤独な夜道 ハルカ》がいます。\n' +
                '相手の《地下室に棲むキメラ》が、\n' +
                'そのハルカを追跡しています。\n\n' +
                '次の相手の番に、ハルカは襲われます。',
        },
        {
          title: 'このままだと',
          text: 'ハルカは 体力3。キメラのスピードは 3。\n' +
                'ちょうど倒れてしまいます。\n\n' +
                'でも、あなたの手札には手立てがあります。',
        },
      ],
      allow: ['next'],
      done: 'pages',
    },

    {
      id: 'advanced_equip_flashlight',
      chapter: 'グッズを使う',
      pages: [
        {
          title: 'グッズ',
          text: 'グッズは、場のカードに付けて使います。\n' +
                '付けた相手を強くしたり、守ったりします。\n\n' +
                '手札の《懐中電灯》を見てください。\n' +
                'コストは 0。気力を使いません。',
        },
        {
          title: 'グッズの付けかた',
          text: 'グッズも、ほかのカードと同じように紫の枠へ運びます。\n' +
                'そのあと「付ける相手」を選び、「対象を確定」を押します。\n\n' +
                '確定するまでは、何も減りません。選び直せます。',
        },
        {
          title: '誰に付けるか',
          text: '《懐中電灯》は人間に付けるグッズです。\n' +
                '付けた人間の体力が 1 増えます。\n\n' +
                'ハルカの体力が 3 から 4 になれば、\n' +
                'キメラの 3 ダメージでは倒れません。',
        },
      ],
      /* ★v0.9：グッズの使い方が変わりました。
         カードの上へ直に落とすのではなく、
         ★紫の枠へ運んでから、付ける相手を選んで確定します。
         ★手順を伝えないと、カードの上へ落とそうとして付けられません。 */
      guide: '《懐中電灯》を紫の枠へ運び、《孤独な夜道 ハルカ》を選んで確定',
      allow: ['playCard'],
      allowCards: [TA.flashlight],
      allowTargets: [TA.haruka],
      done: 'cardPlayed',
      doneCards: [TA.flashlight],
      hint: 'まず《懐中電灯》を紫の枠へ運びます。' +
            'そのあと《孤独な夜道 ハルカ》を選び、「対象を確定」を押してください。',
      highlight: { board: [TA.haruka], zone: 'self-normal-human' },
      result: {
        title: 'ハルカの体力が4になりました',
        text: 'これでキメラの 3 ダメージを受けても、\n' +
              '体力 1 で生き残ります。\n\n' +
              'グッズは気力を使わないものもあります。\n' +
              '出し惜しみせず、必要な場面で使いましょう。',
      },
    },

    {
      id: 'advanced_play_ichimatsu',
      chapter: 'グッズを使う',
      pages: [
        {
          title: '守るだけでは勝てません',
          text: '守りは固めました。次は攻めです。\n\n' +
                '手札の《寂しがる市松人形》を出しましょう。\n' +
                'スピード3・体力2 の怪異。コストは 1 です。',
        },
      ],
      guide: '《寂しがる市松人形》を紫の枠へドラッグ',
      allow: ['playCard'],
      allowCards: [TA.ichimatsu],
      allowTargets: ['unit'],
      done: 'cardPlayed',
      doneCards: [TA.ichimatsu],
      hint: '《寂しがる市松人形》を、自分の紫の枠へ運んでください。',
      highlight: { zone: 'self-normal-youkai' },
    },

    {
      id: 'advanced_equip_ofuda',
      chapter: 'グッズを使う',
      pages: [
        {
          title: '怪異に付けるグッズもあります',
          text: '《古いお札》は怪異に付けるグッズです。\n' +
                'コストは 1。付けた怪異のスピードが上がります。\n\n' +
                'グッズには「人間用」と「怪異用」があります。\n' +
                '間違った相手には付けられません。',
        },
        {
          title: 'なぜスピードを上げるのか',
          text: '相手の《寡黙な使用人 シルヴィ》は 体力4。\n' +
                '市松人形のスピードは 3 なので、届きません。\n\n' +
                'お札で 4 にすれば、ちょうど倒せます。',
        },
      ],
      guide: '《古いお札》を紫の枠へ運び、《寂しがる市松人形》を選んで確定',
      allow: ['playCard'],
      allowCards: [TA.ofuda],
      allowTargets: [TA.ichimatsu],
      done: 'cardPlayed',
      doneCards: [TA.ofuda],
      hint: 'まず《古いお札》を紫の枠へ運びます。' +
            'そのあと《寂しがる市松人形》を選び、「対象を確定」を押してください。',
      highlight: { board: [TA.ichimatsu], zone: 'self-normal-youkai' },
      result: {
        title: '気力を使い切りました',
        text: '市松人形に 1、お札に 1。気力 2 を全部使いました。\n\n' +
              '気力は毎ターン増えます。\n' +
              'ためこむより、使い切るほうが強いことが多いです。',
      },
    },

    /* ===========================================================
       第2章　グッズで戦う
       =========================================================== */
    /* ★v0.9：追跡が独立したフェイズになったので、
       「メイン終了」を押す場面をここに足しました。
       ★押すことを伝えないと、メインフェイズのまま
         つなごうとして先へ進めません。 */
    {
      id: 'advanced_end_main_1',
      chapter: 'グッズで戦う',
      pages: [
        {
          title: '出す物は出しました',
          text: 'カードを出す番は、これで終わりです。\\n「メイン終了」を押して、追跡を決める場面へ進みます。',
        },
      ],
      guide: '「メイン終了」を押す',
      allow: ['endMain'],
      done: 'mainEnded',
      hint: '画面下の「メイン終了」を押すと、追跡を決める場面になります。',
      highlight: { button: 'btn-main' },
      warnings: { playableCardWarning: 'hide' },
    },

    {
      id: 'advanced_pursue_sylvie',
      chapter: 'グッズで戦う',
      pages: [
        {
          title: '誰を狙うか',
          text: '相手の人間は 2 体。\n' +
                '《寡黙な使用人 シルヴィ》と《微笑む使用人 エマ》です。\n\n' +
                'エマは 体力3 なので、いまでも倒せます。\n' +
                'でも、狙うのはシルヴィです。',
        },
        {
          title: 'なぜ固いほうを狙うのか',
          text: 'シルヴィは 体力4 で、倒しにくい相手です。\n' +
                'お札を付けたいまだから倒せます。\n\n' +
                '倒しにくい相手ほど、\n' +
                '倒せるときに倒しておくのが得です。',
        },
      ],
      guide: '《寂しがる市松人形》から《寡黙な使用人 シルヴィ》へドラッグ',
      allow: ['selectPursuit'],
      allowCards: [TA.ichimatsu],
      allowTargets: [TA.sylvie],
      done: 'pursuitSelected',
      hint: '自分の《寂しがる市松人形》から、相手の《シルヴィ》へ運んでください。',
      highlight: { board: [TA.ichimatsu, TA.sylvie] },
    },

    {
      id: 'advanced_confirm_first_pursuit',
      chapter: 'グッズで戦う',
      guide: '「追跡を確定」を押す',
      /* 選び直しも許しておきます。万一追跡が外れても、
         もう一度つなげば進めます（v0.5.2 の教訓）。 */
      allow: ['confirmPursuit', 'selectPursuit'],
      allowCards: [TA.ichimatsu],
      allowTargets: [TA.sylvie],
      done: 'pursuitConfirmed',
      hint: '画面下の「追跡を確定」を押してください。',
      highlight: { button: 'btn-main', board: [TA.ichimatsu, TA.sylvie] },
    },

    {
      id: 'advanced_assault_haruka',
      chapter: 'グッズで戦う',
      pages: [
        {
          title: '相手の番です',
          text: 'まず、キメラがハルカを襲います。\n\n' +
                '懐中電灯のおかげで、ハルカは 体力4。\n' +
                'どうなるか見ていてください。',
        },
      ],
      allow: ['next'],
      done: 'assaultDone',
      result: {
        title: 'ハルカが生き残りました',
        text: 'ハルカは 3 ダメージを受けて 体力1。\n' +
              'キメラはハルカの反撃 2 を受けて倒れました。\n\n' +
              'グッズ 1 枚で、守りと反撃の両方が変わりました。',
      },
    },

    {
      id: 'advanced_assault_sylvie',
      chapter: 'グッズで戦う',
      /* ★このステップに入るとき、次に引く札を仕込みます（仕様書 21.5）。
         襲撃が終わったあとのターン開始で《引き戻す力》を引かせるためです。
         仕込まないと、山札の順どおりの札が来て、台本と食い違います。 */
      setup: { stackTop: { village: [TA.helping] } },
      pages: [
        {
          title: 'こんどはあなたの番です',
          text: 'お札を付けた市松人形が、シルヴィを襲います。',
        },
      ],
      allow: ['next'],
      done: 'assaultDone',
      result: {
        title: '相打ちになりました',
        text: 'シルヴィはロスト。\n' +
              '市松人形もシルヴィの反撃 2 を受けて倒れました。\n\n' +
              '付けていた《古いお札》も、\n' +
              'いっしょにトラッシュへ行きます。',
      },
    },

    /* ===========================================================
       第3章　イベントを使う
       =========================================================== */
    {
      id: 'advanced_use_boundary',
      chapter: 'イベントを使う',
      /* 境界線で引く2枚を決めておきます（仕様書 21.5）。
         《市松人形》と《ルナ》が来ます。 */
      setup: { stackTop: { village: [TA.ichimatsu, TA.luna] } },
      pages: [
        {
          title: '手札を作りかえる',
          text: '気力が 2 に増え、《引き戻す力》を引きました。\n' +
                'いまの手札は 3 枚です。\n\n' +
                '《境界線》《山を守るヌシ様》《引き戻す力》',
        },
        {
          title: 'イベント',
          text: 'イベントは、使うとその場で効果が起きて、\n' +
                'そのままトラッシュへ行くカードです。\n' +
                '場には残りません。\n\n' +
                '《境界線》はコスト 0。気力を使いません。',
        },
        {
          title: '境界線の効果',
          text: '手札を 1 枚トラッシュへ置いて、2 枚引きます。\n\n' +
                '要らない札を、使える札に変えられます。',
        },
      ],
      guide: '《境界線》を紫の枠へドラッグ',
      allow: ['playCard'],
      allowCards: [TA.boundary],
      allowTargets: ['event'],
      done: 'cardPlayed',
      doneCards: [TA.boundary],
      hint: '《境界線》を、光っている紫の枠へ運んでください。',
      highlight: { zone: 'event-drop' },
    },

    {
      id: 'advanced_discard_nushi',
      chapter: 'イベントを使う',
      pages: [
        {
          title: '何を捨てるか',
          text: '捨てるのは《山を守るヌシ様》です。\n\n' +
                '「一番強いカードを捨てるの？」と思うかもしれません。\n' +
                'でも、いまの気力は 2。コスト 4 のヌシ様は出せません。',
        },
        {
          title: 'あとで取り返せます',
          text: '手札にある《引き戻す力》は、\n' +
                'トラッシュからカードを回収するイベントです。\n\n' +
                'いったん捨てて、すぐ拾う。\n' +
                'そのあいだに 2 枚引けるぶんが、まるまる得になります。',
        },
      ],
      guide: '《山を守るヌシ様》を選んで「確定 1枚」を押す',
      allow: ['pickCard', 'pickConfirm'],
      allowCards: [TA.nushi],
      done: 'cardsPicked',
      hint: '捨てるのは《山を守るヌシ様》です。選んでから確定してください。',
    },

    {
      id: 'advanced_draw_boundary_cards',
      chapter: 'イベントを使う',
      pages: [
        {
          title: '2枚引きます',
          text: '境界線の効果で、山札から 2 枚引きます。',
        },
      ],
      allow: ['next'],
      done: 'pages',
      result: {
        title: '《市松人形》と《ルナ》が来ました',
        text: '手札は《引き戻す力》《市松人形》《ルナ》の 3 枚。\n\n' +
              '《境界線》はトラッシュへ行きました。\n' +
              'コスト 0 だったので、気力は 2 のままです。',
      },
    },

    {
      id: 'advanced_use_helping_hand',
      chapter: 'イベントを使う',
      pages: [
        {
          title: 'カードを使う順番',
          text: 'ここで《引き戻す力》を使います。\n\n' +
                'さきほど捨てたヌシ様を、いま取り返すためです。\n' +
                '順番が逆だったら、この動きはできませんでした。',
        },
        {
          title: '順番が大事です',
          text: '先に《引き戻す力》を使っていたら、\n' +
                'トラッシュには何もなく、無駄になっていました。\n\n' +
                '「どのカードを、どの順で使うか」。\n' +
                'これが勝ち負けを分けます。',
        },
      ],
      guide: '《引き戻す力》を紫の枠へドラッグ',
      allow: ['playCard'],
      allowCards: [TA.helping],
      allowTargets: ['event'],
      done: 'cardPlayed',
      doneCards: [TA.helping],
      hint: '《引き戻す力》を、光っている紫の枠へ運んでください。',
      highlight: { zone: 'event-drop' },
    },

    {
      id: 'advanced_recover_nushi',
      chapter: 'イベントを使う',
      guide: '《山を守るヌシ様》を選んで確定する',
      allow: ['pickCard', 'pickConfirm'],
      allowCards: [TA.nushi],
      done: 'cardsPicked',
      hint: 'トラッシュの《山を守るヌシ様》を選んでください。',
      result: {
        title: 'ヌシ様が戻りました',
        text: '手札は《市松人形》《ルナ》《山を守るヌシ様》。\n\n' +
              'イベント 2 枚はどちらもコスト 0。\n' +
              '気力 2 を使わずに、手札を作りかえました。',
      },
    },

    /* ===========================================================
       第4章　気力を持ち越す
       =========================================================== */
    {
      id: 'advanced_save_morale',
      chapter: '気力を持ち越す',
      pages: [
        {
          title: 'ここで手を止めます',
          text: '手札には《市松人形》も《ルナ》もあります。\n' +
                '気力 2 で、どちらも出せます。\n\n' +
                'でも、出しません。',
        },
        {
          title: '気力は持ち越せます',
          text: '使わなかった気力は、次のターンへ残ります。\n' +
                '次のターンに 2 増えるので、合わせて 4。\n\n' +
                'コスト 4 の《山を守るヌシ様》が出せます。',
        },
        {
          title: '大きな一手のために',
          text: '小さいカードを 2 枚出すより、\n' +
                'ヌシ様 1 体のほうがはるかに強い。\n\n' +
                'スピード4・体力6。相手の人間を次々と倒せます。',
        },
      ],
      /* ★v0.9：追跡が独立したフェイズになりました。
         ★「メイン終了」→ 追跡の場面 →「追跡せずに終了」の順です。 */
      guide: '「メイン終了」→「追跡せずに終了」の順に押す',
      allow: ['endTurn'],
      done: 'endTurnWarning',
      hint: 'まず「メイン終了」を押します。' +
            '追跡の場面になったら「追跡せずに終了」を押してください。',
      highlight: { button: 'btn-main' },
      /* ★ここだけ通常の警告を出します（仕様書 21.6・24章）。
         ふだんは邪魔なので出しませんが、この場面では
         「わざと残している」ことを分かってもらう必要があります。

         書き方は「警告の名前ごとに show / hide」です。
         'show' とだけ書くと、どの警告も出ません（v0.6.3で修正）。 */
      warnings: { playableCardWarning: 'show' },
    },

    {
      id: 'advanced_confirm_save_morale',
      chapter: '気力を持ち越す',
      pages: [
        {
          title: 'この警告について',
          text: '「まだ使用できるカードがあります」と出ました。\n\n' +
                'カードの使い忘れを防ぐための親切な忠告です。\n' +
                '今回は、あえて無視してみましょう。',
        },
      ],
      /* ★確認の中のボタンは「ターンを終了」です */
      guide: '確認の「ターンを終了」を押す',
      allow: ['confirmEndTurn'],
      done: 'turnEnded',
      hint: '警告の中の「ターンを終了」を押してください。',
      highlight: { dialog: 'primary' },
    },

    {
      id: 'advanced_cpu_play_lily',
      /* ★相手の手札に、出させたいカードを用意します（v0.6.6）。
         山札まかせだと、招かれた令嬢 リリィが手札に来ません。
         来なければ台本を実行できず、チュートリアルが止まります。 */
      setup: { ensureHand: { mansion: [TA.lily] } },
      chapter: '気力を持ち越す',
      pages: [
        {
          title: '相手の番です',
          text: '相手も手を進めてきます。',
        },
      ],
      allow: ['next'],
      done: 'cpuScriptDone',
      cpuScript: [
        { action: 'play', cardId: TA.lily, zone: 'human',
          say: '相手が《招かれた令嬢 リリィ》を出しました。\n' +
               'スピード3・体力2。反撃が少し痛い相手です。' },
        { action: 'confirm' },
      ],
    },

    /* ===========================================================
       第5章　大きな怪異で攻める
       =========================================================== */
    {
      id: 'advanced_play_nushi',
      chapter: '大きな怪異で攻める',
      pages: [
        {
          title: '気力が4になりました',
          text: '持ち越した 2 に、今ターンの 2 が足されました。\n\n' +
                '待った甲斐がありました。',
        },
      ],
      guide: '《山を守るヌシ様》を紫の枠へドラッグ',
      allow: ['playCard'],
      allowCards: [TA.nushi],
      allowTargets: ['unit'],
      done: 'cardPlayed',
      doneCards: [TA.nushi],
      hint: '《山を守るヌシ様》を、自分の紫の枠へ運んでください。',
      highlight: { zone: 'self-normal-youkai' },
      result: {
        title: 'ヌシ様が場に出ました',
        text: 'スピード4・体力6。\n' +
              '気力は 4 から 0 になりました。\n\n' +
              '1 ターン待って、大きな一手を通す。\n' +
              'これが気力の持ち越しです。',
      },
    },

    /* ★v0.9：追跡が独立したフェイズになったので、
       「メイン終了」を押す場面をここに足しました。 */
    {
      id: 'advanced_end_main_3',
      chapter: '大きな怪異で攻める',
      pages: [
        {
          title: 'ふたたびメインを終えます',
          text: '出すものは出しました。\\n「メイン終了」を押して、追跡を決めます。',
        },
      ],
      guide: '「メイン終了」を押す',
      allow: ['endMain'],
      done: 'mainEnded',
      hint: '画面下の「メイン終了」を押すと、追跡を決める場面になります。',
      highlight: { button: 'btn-main' },
      warnings: { playableCardWarning: 'hide' },
    },

    {
      id: 'advanced_pursue_emma_01',
      chapter: '大きな怪異で攻める',
      pages: [
        {
          title: '誰から倒すか',
          text: '相手の人間は《微笑む使用人 エマ》と\n' +
                '《招かれた令嬢 リリィ》の 2 体。\n\n' +
                'どちらもヌシ様なら倒せます。\n' +
                'では、どちらから狙いますか。',
        },
        {
          title: '反撃の小さいほうから',
          text: 'エマのスピードは 2、リリィは 3。\n' +
                '襲うと、そのぶんの反撃を受けます。\n\n' +
                'ヌシ様は倒れずに何度も戦わせたい。\n' +
                'だから、傷の浅いエマから倒します。',
        },
      ],
      guide: '《山を守るヌシ様》から《微笑む使用人 エマ》へドラッグ',
      /* ★確定まで1つのステップで行うので、確定の操作も許します。
         これが無いと、追跡は選べるのに確定できません（v0.6.5）。 */
      allow: ['selectPursuit', 'confirmPursuit'],
      allowCards: [TA.nushi],
      allowTargets: [TA.emma],
      done: 'pursuitConfirmed',
      hint: '自分の《ヌシ様》から、相手の《エマ》へ運んでください。',
      highlight: { board: [TA.nushi, TA.emma] },
    },

    {
      id: 'advanced_cpu_play_emma_02',
      /* ★相手の手札に、出させたいカードを用意します（v0.6.6）。
         山札まかせだと、2枚目の微笑む使用人 エマが手札に来ません。
         来なければ台本を実行できず、チュートリアルが止まります。 */
      setup: { ensureHand: { mansion: [TA.emma] } },
      chapter: '大きな怪異で攻める',
      pages: [
        {
          title: '相手の番です',
          text: '相手も人間を足してきます。',
        },
      ],
      allow: ['next'],
      done: 'cpuScriptDone',
      cpuScript: [
        { action: 'play', cardId: TA.emma, zone: 'human',
          say: '相手が 2 枚目の《微笑む使用人 エマ》を出しました。' },
        { action: 'confirm' },
      ],
    },

    {
      id: 'advanced_assault_emma_01',
      chapter: '大きな怪異で攻める',
      pages: [
        {
          title: 'ヌシ様の襲撃',
          text: 'ヌシ様が 1 枚目のエマを襲います。',
        },
      ],
      allow: ['next'],
      done: 'assaultDone',
      result: {
        title: 'エマがロストしました',
        text: 'ヌシ様はエマの反撃 2 を受けました。\n' +
              '体力 6 から 4 へ。\n\n' +
              'この傷は、倒れるまで残り続けます。\n' +
              'これを「蓄積ダメージ」と呼びます。',
      },
    },

    /* ===========================================================
       第6章　勝負を決める
       =========================================================== */
    /* ★v0.9：追跡が独立したフェイズになったので、
       「メイン終了」を押す場面をここに足しました。
       ★押すことを伝えないと、メインフェイズのまま
         つなごうとして先へ進めません。 */
    {
      id: 'advanced_end_main_2',
      chapter: '勝負を決める',
      pages: [
        {
          title: 'ここでもメインを終えます',
          text: 'ヌシ様を出しました。あとは追跡を決めるだけです。\\n「メイン終了」を押してください。',
        },
      ],
      guide: '「メイン終了」を押す',
      allow: ['endMain'],
      done: 'mainEnded',
      hint: '画面下の「メイン終了」を押すと、追跡を決める場面になります。',
      highlight: { button: 'btn-main' },
      warnings: { playableCardWarning: 'hide' },
    },

    {
      id: 'advanced_pursue_lily',
      chapter: '勝負を決める',
      pages: [
        {
          title: '相手のロストは2枚',
          text: '黒薔薇の館のロスト上限は 4。\n' +
                'あと 2 枚で勝ちです。\n\n' +
                '次はリリィを狙います。',
        },
      ],
      guide: '《山を守るヌシ様》から《招かれた令嬢 リリィ》へドラッグ',
      /* ★確定まで1つのステップで行うので、確定の操作も許します。
         これが無いと、追跡は選べるのに確定できません（v0.6.5）。 */
      allow: ['selectPursuit', 'confirmPursuit'],
      allowCards: [TA.nushi],
      allowTargets: [TA.lily],
      done: 'pursuitConfirmed',
      hint: '自分の《ヌシ様》から、相手の《リリィ》へ運んでください。',
      highlight: { board: [TA.nushi, TA.lily] },
    },

    {
      id: 'advanced_cpu_play_annette',
      /* ★相手の手札に、出させたいカードを用意します（v0.6.6）。
         山札まかせだと、不憫な客人 アネットが手札に来ません。
         来なければ台本を実行できず、チュートリアルが止まります。 */
      setup: { ensureHand: { mansion: [TA.annette] } },
      chapter: '勝負を決める',
      pages: [
        {
          title: '相手の番です',
          text: '相手も粘ってきます。',
        },
      ],
      allow: ['next'],
      done: 'cpuScriptDone',
      cpuScript: [
        { action: 'play', cardId: TA.annette, zone: 'human',
          say: '相手が《不憫な客人 アネット》を出しました。' },
        { action: 'confirm' },
      ],
    },

    {
      id: 'advanced_assault_lily',
      chapter: '勝負を決める',
      pages: [
        {
          title: 'リリィを襲います',
          text: 'リリィのスピードは 3。\n' +
                'エマより反撃が痛い相手です。',
        },
      ],
      allow: ['next'],
      done: 'assaultDone',
      result: {
        title: 'ヌシ様が体力1になりました',
        text: 'リリィはロスト。相手のロストは 3 枚。\n\n' +
              'ヌシ様は 3 ダメージを受けました。\n' +
              'エマの 2 と合わせて 5。体力 6 のうち 5 を失い、残りは 1 です。',
      },
    },

    {
      id: 'advanced_mansion_field',
      chapter: '勝負を決める',
      pages: [
        {
          title: '相手のフィールドが働きました',
          text: '黒薔薇の館には効果があります。\n\n' +
                '「ロストが 3 枚になったとき、\n' +
                'そのすべてが〔洋館〕なら、気力を 1 回復する」',
        },
        {
          title: '相手の場も見ましょう',
          text: 'ロストした 3 人はいずれも〔洋館〕でした。\n' +
                'そのため相手の気力が 1 増えます。\n\n' +
                '自分の盤面だけでなく、\n' +
                '相手のフィールドも読んでおく必要があります。',
        },
      ],
      allow: ['next'],
      done: 'pages',
    },

    /* ★v0.9：追跡が独立したフェイズになったので、
       「メイン終了」を押す場面をここに足しました。 */
    {
      id: 'advanced_end_main_4',
      chapter: '勝負を決める',
      pages: [
        {
          title: '最後の追跡へ',
          text: 'ここも「メイン終了」から追跡を決めます。',
        },
      ],
      guide: '「メイン終了」を押す',
      allow: ['endMain'],
      done: 'mainEnded',
      hint: '画面下の「メイン終了」を押すと、追跡を決める場面になります。',
      highlight: { button: 'btn-main' },
      warnings: { playableCardWarning: 'hide' },
    },

    {
      id: 'advanced_pursue_emma_02',
      chapter: '勝負を決める',
      pages: [
        {
          title: 'あと1枚',
          text: '相手のロストは 3 枚。上限は 4。\n' +
                'あと 1 枚で決まります。\n\n' +
                '相手の人間は、2 枚目のエマとアネットです。',
        },
        {
          title: 'ヌシ様は体力1',
          text: 'どちらを襲っても、反撃でヌシ様は倒れます。\n\n' +
                'それでもかまいません。\n' +
                '4 枚目のロストが入った時点で、こちらの勝ちです。',
        },
      ],
      guide: '《山を守るヌシ様》から《微笑む使用人 エマ》へドラッグ',
      /* ★確定まで1つのステップで行うので、確定の操作も許します。
         これが無いと、追跡は選べるのに確定できません（v0.6.5）。 */
      allow: ['selectPursuit', 'confirmPursuit'],
      allowCards: [TA.nushi],
      allowTargets: [TA.emma],
      done: 'pursuitConfirmed',
      hint: '自分の《ヌシ様》から、相手の《エマ》へ運んでください。',
      highlight: { board: [TA.nushi, TA.emma] },
    },

    {
      id: 'advanced_final_assault',
      chapter: '勝負を決める',
      pages: [
        {
          title: '最後の襲撃です',
          text: '見届けてください。',
        },
      ],
      allow: ['next'],
      done: 'gameOver',
      result: {
        title: 'あなたの勝ちです',
        text: 'エマがロストし、相手のロストは 4 枚。上限に達しました。\n\n' +
              'ヌシ様も反撃を受けて倒れましたが、\n' +
              'それは織り込みずみでした。',
      },
    },

    {
      id: 'advanced_complete',
      chapter: '勝負を決める',
      pages: [
        {
          title: '実践編クリア',
          text: 'おつかれさまでした。\n' +
                'ここで身につけたことを並べておきます。',
        },
        {
          title: '覚えたこと',
          text: '・グッズには人間用と怪異用がある\n' +
                '・グッズ1枚で襲撃の結果が変わる\n' +
                '・イベントは使うとトラッシュへ行く\n' +
                '・カードを使う順番で、できることが変わる\n' +
                '・気力は持ち越せる',
        },
        {
          title: 'そして',
          text: '・傷は倒れるまで残る（蓄積ダメージ）\n' +
                '・反撃の小さい相手から倒す\n' +
                '・相手のフィールド効果も読む\n' +
                '・ロスト上限から逆算して攻める',
        },
        {
          title: '次はご自分で',
          text: 'ここまで来れば、もう自分で戦えます。\n\n' +
                'まずは弱いCPUを相手に、\n' +
                '好きなように試してみてください。',
        },
      ],
      allow: ['next'],
      done: 'complete',
    },
  ],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TutorialAdvancedData: TutorialAdvancedData, TUTORIAL_ADV_CARDS: TUTORIAL_ADV_CARDS };
}
