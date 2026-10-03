/* =====================================================================
   screens.js  ―  v0.3 の画面遷移（仕様書 5〜7）
   ---------------------------------------------------------------------
   タイトル・モード選択・各設定画面・遊び方・設定を切り替えます。

   考え方:
     ・画面はすべて index.html の #start-screen の中に置いてあり、
       いま出したい1枚だけに is-open を付けます。
     ・「戻る」で1つ前へ返れるように、通ってきた画面を履歴として
       積んでいきます（stack）。
     ・対戦そのものは preview.js の startGame() が受け持ちます。
       このファイルはゲームのルールに一切触れません。

   対戦そのものは preview.js が、CPUの操作は cpu-driver.js が受け持ちます。
   ===================================================================== */

'use strict';

/* 開発用の調整パネルを出すかどうか。
   配布版では隠すため false。開発中に触りたいときだけ true にします。
   （仕様書 33：配布版に開発用UIを残さない） */
const DEV_PANEL = false;

const Screens = {

  /* 通ってきた画面の履歴。いちばん後ろが「いま出ている画面」 */
  stack: [],

  /* どの画面から対戦へ入ったか。リザルトの戻り先に使います */
  lastSetup: null,

  /* =============================================================
     起動時に1回だけ呼ぶ
     ============================================================= */
  /* CPU対戦の設定。ここが既定値で、前回の選択があれば _restore が上書きします */
  cpu: {
    playerDeck: 'gd1-mura',   // ★v0.10：公式デッキの名前（gd1）。旧 'village' / 'mansion' は modernDeckKey で読み替え
    cpuDeck: 'gd1-yakata',    // 公式デッキの名前 / 'random'
    difficulty: 'normal',    // weak / normal / strong / expert / unfair
    firstPlayer: 'player',   // 'player' / 'cpu' / 'random'
    seedMode: 'random',      // 'random' / 'fixed'
  },

  /* ひとり回しの設定（仕様書 19.2） */
  solo: {
    deck1: 'gd1-mura',       // プレイヤー1のデッキ（★v0.10：gd1 の公式デッキ名）
    deck2: 'gd1-yakata',     // プレイヤー2のデッキ
    firstPlayer: 'deck1',    // 'deck1' / 'deck2' / 'random'
    seedMode: 'random',      // 'random' / 'fixed'
  },

  /* 設定画面の値（仕様書 22）。ON/OFF も文字列で持ちます */
  settings: {
    cpuActionSpeed: 'normal',
    animationSpeed: 'normal',
    seEnabled: 'on',
    /* ★v0.8：既定は「標準」。以前は「左右を反転」でした（作者の指示） */
    mirrorLanes: 'off',
  },

  /* CPU観戦の設定（仕様書 20.2） */
  watch: {
    deck1: 'gd1-mura', diff1: 'strong',
    deck2: 'gd1-yakata', diff2: 'strong',
    firstPlayer: 'cpu1',     // 'cpu1' / 'cpu2' / 'random'
    seedMode: 'random',
    speed: 'normal',         // 'normal' / 'fast' / 'veryfast'
  },

  /* 直前の対戦の中身（リザルトと再戦で使います） */
  lastMatch: null,

  /* ★v0.10：CPU対戦・CPU観戦を開けるか。gd1 の AI をつなぐまで false（準備中の案内を出す）。
     検査ではここを true にして、設定画面の流れそのものを確かめる。
     ★名前を aiReady にすると、下にある既存の aiReady()（AIの読み込み確認）とぶつかる */
  v10CpuReady: true,     // ★v0.10：gd1 v1.2 の AI（最強）をつないだ

  init: function () {
    const self = this;

    // data-go="◯◯" のボタンは、その画面へ進む
    document.querySelectorAll('[data-go]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.go(btn.dataset.go);
      });
    });

    // data-back のボタンは、1つ前の画面へ戻る
    document.querySelectorAll('[data-back]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.back(); });
    });

    this.setupStartScreen();     // タップしてスタート（仕様書 5.2）
    this.setupComingSoon();      // まだ作っていない項目

    this._setupOptionGroups();
    this._setupSolo();
    this._setupCpu();
    this._setupWatch();
    this._setupSettings();
    this._hideDevPanel();
    this._restore();
  },

  /* =============================================================
     data-opt / data-val の選択ボタンをまとめて配線する
     -------------------------------------------------------------
       <div class="menu__choices" data-opt="difficulty">
         <button data-val="weak">弱</button> ...
     と書いておけば、押したときに this.cpu.difficulty が変わります。
     Stage D・E の設定画面でも同じ仕組みを使います。
     ============================================================= */
  _setupOptionGroups: function () {
    const self = this;
    document.querySelectorAll('[data-opt]').forEach(function (group) {
      const store = group.dataset.store || 'cpu';   // どの設定に書き込むか
      const key = group.dataset.opt;
      group.querySelectorAll('[data-val]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self[store][key] = btn.dataset.val;
          self._renderOptions();
          if (store === 'cpu') self._renderCpu();
          if (store === 'solo') self._renderSolo();
          if (store === 'watch') self._renderWatch();
          if (store === 'settings') self._applySettings();
        });
      });
    });
  },

  /** 選ばれているボタンの見た目を合わせ直す（全画面ぶん） */
  _renderOptions: function () {
    const self = this;
    document.querySelectorAll('[data-opt]').forEach(function (group) {
      const store = group.dataset.store || 'cpu';
      const key = group.dataset.opt;
      group.querySelectorAll('[data-val]').forEach(function (btn) {
        btn.classList.toggle('is-on', self[store][key] === btn.dataset.val);
      });
    });
  },

  /* =============================================================
     画面を切り替える
     ------------------------------------------------------------- 
     go()   … 履歴に積んで進む
     back() … 1つ戻る（履歴が空ならタイトルへ）
     reset()… 履歴を捨てて、その画面から始め直す
     ============================================================= */

  /* =============================================================
     スタート画面（v0.4 仕様書 5.2）
     -------------------------------------------------------------
     画面のどこを押しても始まります。PCではEnterとSpaceでも。
     二重に進まないよう、進み始めたら受付を止めます。
     ============================================================= */
  _startLocked: false,

  setupStartScreen: function () {
    const self = this;
    const screen = document.getElementById('screen-start');
    if (!screen) return;

    /* ★どこを押しても始まるようにするには、
       画面いっぱいに広がっている層に付ける必要があります。
       #screen-start は中身の箱で、幅が画面より狭いため、
       その外側を押しても反応しませんでした（v0.4.4までの不具合）。 */
    const layer = document.getElementById('start-screen') || screen;

    /* 押されてからモード選択に着くまでの流れ（v0.4.5）
         0.00s  タイトルが滲みながら広がって消える
         0.90s  画面が黒く沈みきる
         1.50s  黒からモード選択が浮かび上がる

       すぐ切り替わると「押した」という手応えが無く、
       画面が飛んだように見えます。
       演出のあいだは受付を止めて、二重に進まないようにします。 */
    const FADE_MS = 1500;

    const begin = function () {
      if (self._startLocked) return;
      if (self.current() !== 'start') return;
      self._startLocked = true;
      Se.play('button');

      screen.classList.add('is-leaving');

      setTimeout(function () {
        screen.classList.remove('is-leaving');
        // ここは幕を使いません。すでに黒く沈んでいるので、
        // その黒からモード選択が浮かび上がるようにつなぎます。
        self.goNow('mode');
        self.riseIn();
        self._startLocked = false;
      }, FADE_MS);
    };

    layer.addEventListener('pointerup', function (e) {
      // メニュー階層の他の画面が開いているときは反応しない
      if (self.current() !== 'start') return;
      if (e.target.closest && e.target.closest('button, a, input')) return;
      begin();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (self.current() !== 'start') return;
      e.preventDefault();
      begin();
    });
  },

  /** まだ作っていない項目を押されたとき（v0.4 の途中段階でだけ出ます） */
  setupComingSoon: function () {
    document.querySelectorAll('[data-soon]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showToast('この機能はまだ準備中です。');
      });
    });
  },

  /* =============================================================
     画面の切り替え演出（v0.4.5）
     -------------------------------------------------------------
     幕が横切るあいだに、裏で画面を入れ替えます。
       進むとき … 左から右へ
       戻るとき … 右から左へ
     方向を分けているのは、いま進んだのか戻ったのかを
     文字を読まずに分かるようにするためです。
     ============================================================= */
  SWEEP_MS: 110,         // 幕が横切る時間（片道）。速いほうが小気味よい
  HOLD_MS: 240,          // 完全に暗くなっている時間。ここで中身を入れ替える
  _wiping: false,

  /* 幕を出さない画面（v0.4.7）
     -------------------------------------------------------------
     幕は「別の場所へ移った」ことを伝えるためのものです。
     デッキやカードを続けて見ていくところでは、
     同じ場所の中で見え方が変わっているだけなので、
     いちいち暗転すると行き来が重くなります。

     この一覧にある画面へ入るとき・から出るときは幕を出しません。
     デッキ一覧そのものは入っていません。
     カードのモードから入るときは、場所が変わるので幕を出します。 */
  NO_WIPE: ['deck-view', 'deck-edit', 'field-select', 'deck-pick'],

  /** その行き来で幕を出すか */
  needsWipe: function (to) {
    const from = this.current();
    return this.NO_WIPE.indexOf(from) === -1 && this.NO_WIPE.indexOf(to) === -1;
  },

  /**
   * 幕を通してから中身を入れ替える。
   * @param dir 'forward'（左→右）か 'back'（右→左）
   * @param swap 幕が画面を覆いきったときに呼ぶ
   */
  wipe: function (dir, swap) {
    const veil = document.getElementById('screen-wipe');

    // 幕が使えない環境や、続けて押されたときは、そのまま入れ替える
    if (!veil || this._wiping) { swap(); return; }

    const self = this;
    this._wiping = true;

    veil.classList.remove('is-forward', 'is-back', 'is-out');
    veil.classList.add(dir === 'back' ? 'is-back' : 'is-forward');
    veil.classList.add('is-on');

    /* 流れは3つに分かれます。
         1. 横切って覆う（SWEEP_MS）
         2. 真っ黒のまま保つ（HOLD_MS）… ここで中身を差し替える
         3. 同じ向きに抜けていく（SWEEP_MS）
       覆いきった瞬間に抜け始めると、切り替わった実感が出ません。
       少しだけ黒を保つと、場面が変わったことが伝わります。 */
    setTimeout(function () {
      swap();                       // 真っ黒のあいだに中身を差し替える

      setTimeout(function () {
        veil.classList.add('is-out');
        setTimeout(function () {
          veil.classList.remove('is-on', 'is-out', 'is-forward', 'is-back');
          self._wiping = false;
        }, self.SWEEP_MS);
      }, self.HOLD_MS);
    }, this.SWEEP_MS);
  },

  go: function (name) {
    if (!this.needsWipe(name)) { this.goNow(name); return; }
    const self = this;
    this.wipe('forward', function () {
      self.stack.push(name);
      self._render();
    });
  },

  back: function () {
    const prev = this.stack[this.stack.length - 2] || 'start';
    if (!this.needsWipe(prev)) { this.backNow(); return; }
    const self = this;
    this.wipe('back', function () {
      self.stack.pop();
      if (self.stack.length === 0) self.stack.push('start');
      self._render();
    });
  },

  /* =============================================================
     演出なしで動く道（v0.4.7）
     -------------------------------------------------------------
     幕は「別の場所へ移った」ことを伝えるためのものです。
     カードやデッキを続けて見ていくところでは、
     同じ場所の中で見え方が変わっているだけなので、
     幕を出すとかえって行き来が重くなります。

     幕を出さないところ:
       デッキ一覧 → デッキ確認 → 編成 → フィールド選択
       対戦前のデッキ選択
       対戦の開始・終了（別の演出が続くため）
     ============================================================= */
  goNow: function (name) {
    this.stack.push(name);
    this._render();
  },

  backNow: function () {
    this.stack.pop();
    if (this.stack.length === 0) this.stack.push('start');
    this._render();
  },

  /** 黒から、いまの画面を浮かび上がらせる */
  riseIn: function () {
    const sec = document.querySelector('.menu.is-open');
    if (!sec) return;
    sec.classList.remove('is-arriving');
    void sec.offsetWidth;          // いったん外して、もう一度動かすための空読み
    sec.classList.add('is-arriving');
    setTimeout(function () { sec.classList.remove('is-arriving'); }, 600);
  },

  reset: function (name) {
    this.stack = [name || 'start'];
    this._render();
  },

  /** メニュー全体を閉じる（対戦画面へ入るとき） */
  close: function () {
    const layer = document.getElementById('start-screen');
    if (layer) layer.classList.remove('is-open');
    // 幕が出たままだと対戦画面が黒いままになるので、必ず片づける
    const veil = document.getElementById('screen-wipe');
    if (veil) veil.classList.remove('is-on', 'is-out', 'is-forward', 'is-back');
    this._wiping = false;
  },

  /** いま出ている画面の名前（出ていなければ null） */
  current: function () {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  },

  _render: function () {
    const layer = document.getElementById('start-screen');
    const name = this.current();

    layer.classList.add('is-open');
    layer.querySelectorAll('.menu').forEach(function (sec) {
      sec.classList.toggle('is-open', sec.dataset.screen === name);
    });

    // 設定画面へ入るたびに、選ばれている項目の見た目を合わせ直す
    if (name === 'solo-setup') this._renderSolo();
    if (name === 'cpu-setup') this._renderCpu();
    if (name === 'watch-setup') this._renderWatch();
    if (name === 'options') this._renderSettings();
    if (name === 'card-list') CardListUI.render();
    if (name === 'deck-list') DeckListUI.renderList();
    if (name === 'deck-view') DeckListUI.renderView();
    if (name === 'deck-edit') DeckEditorUI.render();
    if (name === 'field-select') FieldPickerUI.render();
    if (name === 'deck-pick') DeckPickerUI.render();
    if (name === 'cpu-setup' || name === 'solo-setup') DeckPickerUI.refreshLabels();

    // メニューが出ている間は盤面を操作させない
    if (typeof view !== 'undefined') view.locked = true;
  },

  /* =============================================================
     ひとり回しの設定（仕様書 19.2）
     -------------------------------------------------------------
     デッキ2つ・先攻・シード。同じデッキを選べばミラー対戦になります。
     ============================================================= */

  _setupSolo: function () {
    const self = this;
    const goBtn = document.getElementById('solo-start');
    if (!goBtn) return;

    goBtn.addEventListener('click', function () {
      if (goBtn.disabled) return;          // 連打よけ（仕様書 28）
      goBtn.disabled = true;
      const ok = self._startSoloMatch();
      if (!ok) goBtn.disabled = false;
      else setTimeout(function () { goBtn.disabled = false; }, 800);
    });
  },

  /** ひとり回しの設定画面を描き直す */
  _renderSolo: function () {
    const s = this.solo;
    this._renderOptions();

    // ミラー対戦になるときの案内
    const hint = document.getElementById('solo-mirror-hint');
    if (hint) {
      hint.textContent = (s.deck1 === s.deck2)
        ? '同じデッキ同士のミラー対戦になります。呼び名は「プレイヤー1／2」になります。'
        : '';
    }

    const input = document.getElementById('seed-input');
    if (input) input.disabled = (s.seedMode !== 'fixed');

    this._soloError('');
  },

  _soloError: function (msg) {
    const el = document.getElementById('solo-setup-error');
    if (el) { el.textContent = msg || ''; el.classList.toggle('is-on', !!msg); }
  },

  /** ひとり回しを始める */
  _startSoloMatch: function () {
    const s = this.solo;

    // --- シード ---
    let seed;
    if (s.seedMode === 'fixed') {
      const input = document.getElementById('seed-input');
      seed = input ? input.value.trim() : '';
      if (seed === '') { this._soloError('シードを入力してください。'); return false; }
      if (seed.length > 32) { this._soloError('シードは32文字までにしてください。'); return false; }
    } else {
      seed = autoGenerateSeed();
    }

    // --- 先攻（ランダムはシードから決める） ---
    let firstIsP1;
    if (s.firstPlayer === 'random') firstIsP1 = createRng(seed + ':setup').int(2) === 0;
    else firstIsP1 = (s.firstPlayer === 'deck1');

    // 選んだデッキが消えていたり使えなくなっていたら、公式へ戻します
    s.deck1 = DeckPickerUI.ensureUsable(modernDeckKey(s.deck1), DEFAULT_DECK);
    s.deck2 = DeckPickerUI.ensureUsable(modernDeckKey(s.deck2), DEFAULT_DECK);

    // --- 席の割り当て：プレイヤー1＝席village／プレイヤー2＝席mansion ---
    // 自作デッキが選ばれていれば、対戦側へ中身を預けてから始めます（仕様書 17.2）
    const decks = DeckManager.prepareForBattle({ village: s.deck1, mansion: s.deck2 });

    // デッキが違えばデッキ名のほうが分かりやすいので、そのまま使う。
    // 同じデッキ（ミラー）だと見分けがつかないので、プレイヤー1／2 と呼びます。
    const labels = (s.deck1 === s.deck2)
      ? { village: 'プレイヤー1', mansion: 'プレイヤー2' }
      : null;
    const deckNames = { village: s.deck1, mansion: s.deck2 };

    this.lastMatch = {
      mode: 'solo',
      deck1: s.deck1, deck2: s.deck2,
      firstIsP1: firstIsP1,
      seed: seed, seedMode: s.seedMode,
      mirror: (s.deck1 === s.deck2),
    };

    this.lastSetup = 'solo-setup';
    this.close();
    this.startWithLoading([s.deck1, s.deck2], function () {
      startGame(firstIsP1 ? 'village' : 'mansion', seed,
        labels ? { decks: decks, labels: labels } : { decks: decks });
    });
    return true;
  },

  /* =============================================================
     CPU対戦の設定（仕様書 8〜13）
     ============================================================= */

  /* 難易度の説明（仕様書 10.1） */
  DIFF_TEXT: {
    weak:   'カードゲームに不慣れな人向け。判断ミスも多めです。',
    normal: '基本的な行動を行う、標準的なCPUです。',
    strong: '盤面や手札を考え、より効率的に行動します。',
    expert: '高度な判断を行う、本気の対戦用CPUです。',
    unfair: 'CPUがこっそりイカサマしてきます。公平な勝負ではない、おまけ難易度です。',
  },

  DECK_LABEL: { village: 'ヨマモリ村', mansion: '黒薔薇の館' },
  DIFF_LABEL: { weak: '弱', normal: '中', strong: '強',
                expert: 'エキスパート', unfair: '理不尽（特殊難易度）' },

  _setupCpu: function () {
    const self = this;
    const goBtn = document.getElementById('cpu-start');
    if (!goBtn) return;

    goBtn.addEventListener('click', function () {
      if (goBtn.disabled) return;          // 連打よけ（仕様書 28）
      goBtn.disabled = true;
      const ok = self._startCpuMatch();
      if (!ok) goBtn.disabled = false;     // 入力エラーなら押し直せるように
      else setTimeout(function () { goBtn.disabled = false; }, 800);
    });
  },

  /** 選ばれている項目の見た目と説明文を合わせ直す */
  _renderCpu: function () {
    const c = this.cpu;
    this._renderOptions();

    // 難易度の説明
    const desc = document.getElementById('cpu-diff-desc');
    if (desc) desc.textContent = this.DIFF_TEXT[c.difficulty] || '';

    // ミラー対戦になるときの案内（仕様書 9.3）
    const hint = document.getElementById('cpu-mirror-hint');
    if (hint) {
      if (c.cpuDeck === 'random') {
        hint.textContent = '対戦開始時に抽選します（自分と同じデッキになることもあります）。';
      } else if (c.cpuDeck === c.playerDeck) {
        hint.textContent = '同じデッキ同士のミラー対戦になります。';
      } else {
        hint.textContent = '';
      }
    }

    // シードの入力欄は「指定する」のときだけ使う
    const input = document.getElementById('cpu-seed-input');
    if (input) input.disabled = (c.seedMode !== 'fixed');

    this._cpuError('');
  },

  _cpuError: function (msg) {
    const el = document.getElementById('cpu-setup-error');
    if (el) { el.textContent = msg || ''; el.classList.toggle('is-on', !!msg); }
  },

  /* =============================================================
     入力を確かめて対戦を始める
     -------------------------------------------------------------
     ランダムの項目（CPUデッキ・先攻）は、シードから作った乱数で
     決めます。Math.random() は使いません（仕様書 12.4・33-9）。
     ============================================================= */
  _startCpuMatch: function () {
    /* ★v0.10：ルール処理を gd1（R28最終）に差し替えた。旧AIは旧27枚向けで新しい札を正しく使えないので、
       CPU対戦 は準備中（gd1 の AI をつなぐまで）。ひとり回しで遊べます */
    if (!this.v10CpuReady) { v10NotReady('CPU対戦'); return false; }
    const c = this.cpu;

    // --- 0. CPUが使えるか（仕様書 30） ---
    if (!this.aiReady()) {
      this._cpuError('CPUの読み込みに失敗しています。ページを再読み込みしてください。');
      return false;
    }

    // --- 1. シードを決める（仕様書 12.2・12.3） ---
    let seed;
    if (c.seedMode === 'fixed') {
      const input = document.getElementById('cpu-seed-input');
      seed = input ? input.value.trim() : '';
      if (seed === '') {
        this._cpuError('シードを入力してください。');
        return false;
      }
      if (seed.length > 32) {
        this._cpuError('シードは32文字までにしてください。');
        return false;
      }
    } else {
      seed = autoGenerateSeed();     // random.js の自動生成
    }

    // --- 2. ランダムの項目を、シードから決める ---
    const pick = createRng(seed + ':setup');

    let cpuDeck = c.cpuDeck;
    if (cpuDeck === 'random') cpuDeck = DECK_ORDER[pick.int(13)];   // ★v0.10：R28最終の13本から
    cpuDeck = modernDeckKey(cpuDeck);

    // 選んだデッキが消えていたり使えなくなっていたら、公式へ戻します
    c.playerDeck = DeckPickerUI.ensureUsable(modernDeckKey(c.playerDeck), DEFAULT_DECK);

    let playerFirst;
    if (c.firstPlayer === 'random') playerFirst = pick.int(2) === 0;
    else playerFirst = (c.firstPlayer === 'player');

    // --- 3. 席にデッキを割り当てる ---
    //   席 village ＝ あなた／席 mansion ＝ CPU（CPU対戦では固定）
    // 自作デッキが選ばれていれば、対戦側へ中身を預けてから始めます（仕様書 17.1）
    const decks  = DeckManager.prepareForBattle({ village: c.playerDeck, mansion: cpuDeck });
    const labels = { village: 'あなた',     mansion: 'CPU' };
    const firstSide = playerFirst ? 'village' : 'mansion';

    // --- 4. あとで使う情報を控える（リザルト・再戦・結果コピー） ---
    this.lastMatch = {
      mode: 'cpu',
      playerDeck: c.playerDeck,
      cpuDeck: cpuDeck,
      difficulty: c.difficulty,
      playerFirst: playerFirst,
      seed: seed,
      seedMode: c.seedMode,
      mirror: (c.playerDeck === cpuDeck),
    };

    // 次に開いたときのために、選んだ内容を覚えておく（仕様書 24）
    Storage.remember({
      cpuDifficulty: c.difficulty,
      playerDeck: c.playerDeck,
      cpuDeck: c.cpuDeck,
      firstPlayerSetting: c.firstPlayer,
      seedMode: c.seedMode,
    });

    this.lastSetup = 'cpu-setup';
    this.close();
    this.startWithLoading([c.playerDeck, cpuDeck], function () {
      startGame(firstSide, seed, {
        decks: decks,
        labels: labels,
        cpu: { side: 'mansion', difficulty: c.difficulty, mode: 'cpu' },
        });
    });
    return true;
  },

  /* =============================================================
     CPU観戦（仕様書 20）
     ============================================================= */
  _setupWatch: function () {
    const self = this;
    const goBtn = document.getElementById('watch-start');
    if (!goBtn) return;

    goBtn.addEventListener('click', function () {
      if (goBtn.disabled) return;
      goBtn.disabled = true;
      const ok = self._startWatchMatch();
      if (!ok) goBtn.disabled = false;
      else setTimeout(function () { goBtn.disabled = false; }, 800);
    });
  },

  _renderWatch: function () {
    this._renderOptions();
    const input = document.getElementById('watch-seed-input');
    if (input) input.disabled = (this.watch.seedMode !== 'fixed');
    this._watchError('');
  },

  _watchError: function (msg) {
    const el = document.getElementById('watch-setup-error');
    if (el) { el.textContent = msg || ''; el.classList.toggle('is-on', !!msg); }
  },

  _startWatchMatch: function () {
    /* ★v0.10：ルール処理を gd1（R28最終）に差し替えた。旧AIは旧27枚向けで新しい札を正しく使えないので、
       CPU観戦 は準備中（gd1 の AI をつなぐまで）。ひとり回しで遊べます */
    if (!this.v10CpuReady) { v10NotReady('CPU観戦'); return false; }
    const w = this.watch;

    // --- シード ---
    let seed;
    if (w.seedMode === 'fixed') {
      const input = document.getElementById('watch-seed-input');
      seed = input ? input.value.trim() : '';
      if (seed === '') { this._watchError('シードを入力してください。'); return false; }
      if (seed.length > 32) { this._watchError('シードは32文字までにしてください。'); return false; }
    } else {
      seed = autoGenerateSeed();
    }

    // --- 先攻 ---
    let firstIsCpu1;
    if (w.firstPlayer === 'random') firstIsCpu1 = createRng(seed + ':setup').int(2) === 0;
    else firstIsCpu1 = (w.firstPlayer === 'cpu1');

    // --- 席の割り当て：CPU 1＝席village／CPU 2＝席mansion ---
    const decks  = { village: w.deck1, mansion: w.deck2 };
    const labels = { village: 'CPU 1', mansion: 'CPU 2' };

    this.lastMatch = {
      mode: 'watch',
      deck1: w.deck1, diff1: w.diff1,
      deck2: w.deck2, diff2: w.diff2,
      firstIsCpu1: firstIsCpu1,
      seed: seed, seedMode: w.seedMode,
    };

    if (!this.aiReady()) {
      this._watchError('CPUの読み込みに失敗しています。ページを再読み込みしてください。');
      return false;
    }

    CpuDriver.speed = w.speed;
    this.lastSetup = 'watch-setup';
    this.close();
    this.startWithLoading([w.deck1, w.deck2], function () {
      startGame(firstIsCpu1 ? 'village' : 'mansion', seed, {
        decks: decks,
        labels: labels,
        watch: { village: w.diff1, mansion: w.diff2 },
      });
    });
    return true;
  },

  /* =============================================================
     設定（仕様書 22）
     ============================================================= */
  /* ★v0.9 Phase 5-5：旧デザインの設定画面を消したので、
     その画面のつまみやボタンをつなぐ処理も落としました。
     ★設定そのものは残っています（ホーム → その他 → 設定）。
       読み書きは __v8SettingsGet / __v8SettingsSet を通します。 */
  _setupSettings: function () {
    this._setupSaveData();
  },

  /* =============================================================
     セーブデータの持ち出し・持ち込み・全消し（仕様書 26）
     -------------------------------------------------------------
     この端末のブラウザにためている記録は、
     ブラウザのデータを消すと一緒に消えます。
     取り返しがつかないので、ファイルへ書き出せるようにします。
     ============================================================= */
  _setupSaveData: function () {
    const self = this;

    /* --- 書き出す --- */
    /* ★v0.9 Phase 5-5：旧デザインの設定画面を消したので、
       ここに書いてあった「書き出す／読み込む／すべて初期化」の配線も
       落としました。
       ★同じことは ホーム → その他 → 設定 → データ管理 でできます。
         そちらは v07-save.js が受け持っています。 */

  },

  /** 読み込みや初期化のあと、画面を作り直す */
  _afterSaveDataChanged: function () {
    this._restore();
    this._renderSettings();
    /* デッキ一覧やカード一覧は、開くたびに SaveManager から読み直す作りなので、
       ここで何かを呼ぶ必要はありません。次に開いたとき新しい内容になります。 */
  },

  /** 文字列をファイルとして保存させる */
  _downloadText: function (name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // すぐ消すと保存が間に合わないことがあるので、少し待ってから片づけます
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  },

  _done: function (msg) {
    const el = document.getElementById('opt-done');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(this._doneTimer);
    this._doneTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2200);
  },

  /* ★v0.9 Phase 5-5：旧デザインの設定画面の描き直しも要らなくなりました */
  _renderSettings: function () {
    this._renderOptions();
  },

  /** 設定をゲーム側へ反映し、端末へ保存する */
  _applySettings: function () {
    const s = this.settings;

    CpuDriver.speed = s.cpuActionSpeed;
    speedScale = (s.animationSpeed === 'fast') ? 0.7 : 1;
    Se.enabled = (s.seEnabled === 'on');
    mirrorLanes = (s.mirrorLanes === 'on');
    document.body.classList.toggle('mirror-lanes', mirrorLanes);

    Storage.set('cpuActionSpeed', s.cpuActionSpeed);
    Storage.set('animationSpeed', s.animationSpeed);
    Storage.set('seEnabled', s.seEnabled === 'on');
    Storage.set('mirrorLanes', s.mirrorLanes === 'on');
  },

  /** 端末に保存された設定と、前回の選択を読み戻す */
  _restore: function () {
    Storage.load();

    this.settings.cpuActionSpeed = Storage.get('cpuActionSpeed');
    this.settings.animationSpeed = Storage.get('animationSpeed');
    this.settings.seEnabled = Storage.get('seEnabled') ? 'on' : 'off';
    this.settings.mirrorLanes = Storage.get('mirrorLanes') ? 'on' : 'off';
    Se.volume = (Storage.get('seVolume') || 0) / 100;

    // 前回のCPU対戦の選択（あれば）
    const last = ['cpuDifficulty', 'playerDeck', 'cpuDeck', 'firstPlayerSetting', 'seedMode'];
    const map = { cpuDifficulty: 'difficulty', playerDeck: 'playerDeck',
                  cpuDeck: 'cpuDeck', firstPlayerSetting: 'firstPlayer', seedMode: 'seedMode' };
    const self = this;
    last.forEach(function (k) {
      const v = Storage.lastOf(k);
      if (v) self.cpu[map[k]] = modernDeckKey(v);   // ★v0.10：旧デッキ名の読み替え
    });

    this._applySettings();
    this._renderOptions();
  },

  /* =============================================================
     対戦を始める前の読み込み（仕様書 30）
     -------------------------------------------------------------
     使うデッキのカード画像を先に読み込みます。
     読めない画像があっても、v0.2の代わりの見た目で対戦は始めます。
     ============================================================= */
  startWithLoading: function (deckIds, go) {
    const box = document.getElementById('loading');
    const fill = box ? box.querySelector('.loading__fill') : null;
    const count = box ? box.querySelector('.loading__count') : null;

    if (box) {
      if (fill) fill.style.width = '0%';
      if (count) count.textContent = '';
      box.classList.add('is-on');
    }

    /* ★v0.8 Stage 6-2：新しい対戦画面が出る対戦（CPU対戦）では、
       画像は v08-images.js が「最初に見えるものから」読みます（19.3）。
       ここで全部読み終わるまで待つ必要はありません。
       ひとりまわし・観戦・チュートリアルは既存の盤面を使うので、
       これまでどおり読み終わってから始めます。 */
    if (typeof V8Battle !== 'undefined' && typeof match !== 'undefined' &&
      match && match.mode === 'cpu') {
      if (box) box.classList.remove('is-on');
      go();
      return;
    }

    Assets.preloadDecks(deckIds, function (done, total) {
      if (fill) fill.style.width = Math.round(done / total * 100) + '%';
      if (count) count.textContent = done + ' / ' + total;
    }, function () {
      if (box) box.classList.remove('is-on');
      go();
    });
  },

  /**
   * CPUが使えるかを確かめる（仕様書 30）。
   * 読み込みに失敗しているのに始めると、相手が動かないまま止まります。
   */
  aiReady: function () {
    return (typeof AiPlayer !== 'undefined') && (typeof AiCore !== 'undefined') &&
           (typeof AiHeuristic !== 'undefined') && (typeof AiUiOps !== 'undefined') &&
           (typeof CpuDriver !== 'undefined');
  },

  /* =============================================================
     同じ設定でもう一度（仕様書 25.4）
     -------------------------------------------------------------
     「同じ対戦をなぞる」のではなく「同じ設定でやり直す」ので、
     ランダムを選んでいる項目は選び直されます。
       ・指定シード → 同じシード
       ・ランダムシード → 新しいシードを作る
       ・ランダムのCPUデッキ・先攻 → もう一度抽選
     ============================================================= */
  restartLast: function () {
    const mode = (this.lastMatch && this.lastMatch.mode) || 'solo';
    if (mode === 'cpu') return this._startCpuMatch();
    if (mode === 'watch') return this._startWatchMatch();
    return this._startSoloMatch();
  },

  /* =============================================================
     開発用の調整パネルを隠す（仕様書 33）
     ============================================================= */
  _hideDevPanel: function () {
    if (DEV_PANEL) return;
    ['panel', 'panel-toggle'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  },
};

/* =====================================================================
   ★v0.8 Stage 5-2：対戦準備画面の入口（第16部）
   ---------------------------------------------------------------------
   設定の中身も、対戦の始め方も、既存のものをそのまま使います。
   新しい画面は「見せ方」だけを受け持ちます。
   ===================================================================== */

/** デッキの合計枚数を数える */
function __v8DeckTotal(def) {
  if (!def || !def.mainDeck) return 0;
  return def.mainDeck.reduce(function (a, e) { return a + (e.count || 0); }, 0);
}

/** 座席デッキ名を、デッキ一覧が使うIDへ直す（公式は official_◯◯） */
function __v8DeckManagerId(id) {
  id = modernDeckKey(id);
  if (typeof DECKS !== 'undefined' && DECKS[id]) return 'official_' + id;
  return id;
}

/** デッキ1つぶんの見せ方（名前・短い説明・フィールドの絵） */
function __v8DeckInfo(id) {
  /* 'official_mansion' のような見出し用の id が来ても扱えるようにする */
  if (typeof id === 'string' && id.indexOf('official_') === 0) id = id.slice(9);
  if (id === 'random') {
    return { id: id, name: 'ランダム', desc: '対戦開始時に抽選します。', image: '' };
  }
  id = modernDeckKey(id);
  const def = (typeof deckDefOf === 'function') ? deckDefOf(id) : DECKS[id];
  if (!def) return { id: id, name: '（未選択）', desc: '', image: '' };
  const side = def.side || id;
  const field = (typeof CARD_MASTER !== 'undefined' && def.fieldId)
    ? CARD_MASTER[def.fieldId] : null;
  return {
    id: id,
    name: (DECKS[id] ? deckDisplayName(id) : (def.label || def.name || id)),
    desc: (field && field.effect) ? String(field.effect).split('\n')[0] : '',
    image: (typeof getCardImagePath === 'function' && def.fieldId)
      ? getCardImagePath(def.fieldId, side) : '',
  };
}

/* ★node のテストでは window がありません。触る前に確かめます。 */
if (typeof window !== 'undefined') {

/** いまの設定を、新しい画面へ渡す形にして返す */
window.__v8PrepGet = function () {
  const c = Screens.cpu;
  if (!c) return null;

  /* 押せない理由（16.3）。デッキが選ばれていない・構成が不正なときだけ出します。 */
  let reason = '';
  const check = function (id) {
    if (!id) return 'デッキが選ばれていません。';
    if (id === 'random') return '';
    const def = (typeof deckDefOf === 'function') ? deckDefOf(id) : DECKS[id];
    if (!def) return 'デッキが見つかりません。';
    /* ★40枚そろっていないデッキでは始められません（17.4）。
       枚数はデッキの中身から数えます。 */
    if (__v8DeckTotal(def) !== 40) return 'デッキが40枚になっていません。';
    return '';
  };
  reason = check(c.playerDeck) || check(c.cpuDeck);

  return {
    player: __v8DeckInfo(c.playerDeck),
    cpu: __v8DeckInfo(c.cpuDeck),
    difficulty: c.difficulty,
    firstPlayer: c.firstPlayer,
    /* ★シードは「詳細設定」の中へ入れます（第16部・作者の指示）。
       ふだん使う設定ではありませんが、同じ展開をもう一度出すために
       残してあります。 */
    seedMode: c.seedMode,
    seed: (document.getElementById('cpu-seed-input') || {}).value || '',
    invalidReason: reason,
  };
};

/** ★詳細設定：指定するシードの文字（既存の入力欄をそのまま使います） */
window.__v8PrepSetSeed = function (text) {
  const input = document.getElementById('cpu-seed-input');
  if (!input) return;
  input.value = String(text || '');
  if (Screens._saveCpu) Screens._saveCpu();
};

/** 設定を1つ変える。ほかの設定はそのままです（16.2） */
window.__v8PrepSet = function (key, value) {
  if (!Screens.cpu) return;
  Screens.cpu[key] = value;
  if (Screens._renderCpu) Screens._renderCpu();
  if (Screens._saveCpu) Screens._saveCpu();
};

/**
 * デッキの中身（第17部 17.3）。
 * @param {string} id   座席デッキ名（'village' など）または自作デッキのID
 * @param {string} key  'playerDeck' / 'cpuDeck'
 */
window.__v8DeckDetail = function (id, key) {
  /* ★v0.10：旧デッキ名（'village' / 'mansion'）は新しい名前へ読み替える */
  if (typeof modernDeckKey === 'function') id = modernDeckKey(id);
  const def = (typeof deckDefOf === 'function') ? deckDefOf(id) : null;
  if (!def) return null;

  const field = (typeof CARD_MASTER !== 'undefined' && def.fieldId)
    ? CARD_MASTER[def.fieldId] : null;

  /* 自作かどうか。公式は decks.js に鍵がある */
  const isOfficial = (typeof DECKS !== 'undefined') && !!DECKS[id];

  const cards = (def.mainDeck || []).map(function (e) {
    const m = (typeof CARD_MASTER !== 'undefined') ? CARD_MASTER[e.id] : null;
    return {
      cardId: e.id,
      count: e.count,
      name: m ? m.name : e.id,
      cost: m ? m.cost : null,
      type: m ? m.type : '',
      image: (typeof getCardImagePath === 'function')
        ? getCardImagePath(e.id, def.side || id) : '',
    };
  });
  const total = cards.reduce(function (a, c) { return a + (c.count || 0); }, 0);

  return {
    id: id,
    name: (DECKS[id] ? deckDisplayName(id) : (def.label || def.name || id)),
    fieldName: field ? field.name : '',
    fieldEffect: field ? (field.effect || '') : '',
    tactics: __v8DeckInfo(id).desc,
    image: __v8DeckInfo(id).image,
    cards: cards,
    total: total,
    /* ★編集できるのは「自分側の自作デッキ」だけ（17.4）。
       公式デッキと、相手側は編集できません。 */
    editable: (!isOfficial && key === 'playerDeck' && id !== 'random'),
  };
};

/**
 * 既存の画面へ渡す。
 * ★行き先まで一気に開きます。
 *   以前は先に「デッキ一覧」を出してから移動していたため、
 *   一覧が一瞬見えたうえ、そこで止まってしまうことがありました。
 *   V7Bridge.openLegacy は道順（path）を受け取れるので、
 *   暗転しているあいだに行き先まで進めてしまいます。
 * @param {string[]} path 例：['deck-list', 'deck-view']
 */
function __v8ToLegacy(path) {
  if (typeof V7Bridge === 'undefined' || !V7Bridge.openLegacy) return false;
  return V7Bridge.openLegacy({
    path: path,
    screen: path[path.length - 1],
    entryTab: 'battle',
  });
}

/**
 * ★デッキの中身は、既存のデッキ確認画面をそのまま出します（17.3）。
 *   40枚の並びも、コピーや画像保存も、そのまま使えます。
 */
window.__v8PrepViewDeck = function (id) {
  if (typeof DeckListUI === 'undefined' || !DeckListUI.openView) return false;
  const dmId = __v8DeckManagerId(id);
  if (typeof DeckManager !== 'undefined' && DeckManager.byId && !DeckManager.byId(dmId)) {
    return false;
  }
  /* ★どのデッキを見るかを先に決めてから開きます。
     積むのは行き先だけです。「デッキ一覧」を下に積むと、
     確認画面で「戻る」を押したときに一覧を経由してしまいます。 */
  DeckListUI.openView(dmId);
  return __v8ToLegacy(['deck-view']);
};

/** 自作デッキを、既存のデッキ編集画面で開く（17.4：通常の編集画面を共用） */
window.__v8PrepEditDeck = function (id) {
  if (typeof DeckEditorUI === 'undefined' || !DeckEditorUI.open) return false;
  const dmId = __v8DeckManagerId(id);
  if (typeof DeckManager !== 'undefined' && DeckManager.byId && !DeckManager.byId(dmId)) {
    return false;
  }
  DeckEditorUI.open(dmId);
  return __v8ToLegacy(['deck-edit']);
};

/** 対戦を始める。既存の処理をそのまま呼びます */
window.__v8PrepStart = function () {
  return !!(Screens._startCpuMatch && Screens._startCpuMatch());
};

/**
 * デッキの候補を返す（第17部）。
 * ★どのデッキを出すかは既存の DeckPickerUI.optionsFor に任せます。
 *   CPU側に自作デッキを出さない決まりも、そこに入っています（17.1）。
 */
window.__v8PrepDeckOptions = function (key) {
  if (typeof DeckPickerUI === 'undefined') return null;
  const o = DeckPickerUI.optionsFor('cpu.' + key);
  if (!o) return null;

  /* ★一覧に並ぶ id と、設定へ入れる id は別ものです。
       一覧      … 'official_mansion'（公式デッキの見出し用）
       設定へ入れる … 'mansion'（対戦で使う座席デッキ名）
     既存の deck-picker-ui.js も同じ変換をしています
     （deck.official ? deck.officialKey : deck.id）。
     ここを変換し忘れると「デッキが見つかりません」になり、
     絵も出なくなります（実際になりました）。 */
  const realId = function (d) { return d.official ? d.officialKey : d.id; };

  const conv = function (d) {
    const id = realId(d);
    const info = __v8DeckInfo(id);
    return {
      id: id,
      name: d.name || info.name,
      desc: d.tactics || d.desc || info.desc,
      image: info.image,
      /* ★編集できるのは自分側の自作デッキだけ（17.4） */
      editable: (!d.official && key === 'playerDeck'),
    };
  };
  const decks = (o.decks || []);
  return {
    title: o.title || 'デッキを選ぶ',
    note: o.note || '',
    official: decks.filter(function (d) { return d.official; }).map(conv),
    custom: decks.filter(function (d) { return !d.official; }).map(conv),
    extra: (o.extra || []).map(function (d) {
      return { id: d.id, name: d.name, desc: d.desc || '', image: '' };
    }),
  };
};

/** 準備画面から戻る */
window.__v8PrepBack = function () {
  if (typeof V7Bridge !== 'undefined' && V7Bridge.returnToHub) V7Bridge.returnToHub();
};

}

/* ★v0.10：まだ使えないモードの案内（CPU対戦・CPU観戦・チュートリアル） */
function v10NotReady(what) {
  const msg = what + 'は v0.10 では準備中です。\n新しいデッキは「ひとり回し」で遊べます。';
  /* ★ホームなどの新しい画面の上では、旧来の確認パネル（#dialog）は下に隠れて見えない。
     どの画面でも見える知らせ（V7Toast）を先に使う */
  if (typeof V7Toast !== 'undefined' && V7Toast.push) {
    V7Toast.push(what + 'は v0.10 では準備中です。新しいデッキは「ひとり回し」で遊べます。', { dedupe: true });
  } else if (typeof showDialog === 'function') {
    showDialog({ title: '準備中', message: msg, buttons: [{ label: 'OK', primary: true }] });
  } else if (typeof showToast === 'function') {
    showToast(msg);
  }
}
