/* =====================================================================
   v08-prep.js ― 対戦準備画面（Stage 5-2）
   ---------------------------------------------------------------------
   仕様書 第16部。

   スマートフォンの縦画面 1画面へ、対戦の条件をまとめます。

     上から  相手デッキ → CPU難易度 → VS → 自分デッキ → 先攻／後攻 → 対戦開始

   ★設定の中身（どのデッキ・どの難易度・どの手番）は、
     既存の対戦準備が持っているものをそのまま読み書きします。
     対戦の始め方も既存の処理をそのまま呼びます。
   ===================================================================== */

'use strict';

const V8Prep = {

  open_: false,
  _root: null,

  /** 小さな選択画面で、いま何を選んでいるか（'difficulty' / 'firstPlayer'） */
  _picking: null,

  DIFF: [
    { v: 'weak', label: '弱' },
    { v: 'normal', label: '中' },
    { v: 'strong', label: '強' },
    { v: 'expert', label: 'エキスパート' },
    { v: 'unfair', label: '理不尽' },
  ],

  TURN: [
    { v: 'player', label: '先攻' },
    { v: 'cpu', label: '後攻' },
    { v: 'random', label: 'ランダム' },
  ],

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;

    const bind = function (id, fn) {
      const el = rootEl.querySelector('#' + id);
      if (el) el.onclick = fn;
    };
    bind('v8-prep-diff', function () { self.openPicker('difficulty'); });
    bind('v8-prep-turn', function () { self.openPicker('firstPlayer'); });
    bind('v8-prep-start', function () { self.start(); });
    bind('v8-prep-back', function () { self.close(); });
    /* ★詳細設定（シード） */
    bind('v8-prep-more', function () { self.openMore(); });
    bind('v8-prep-more-close', function () { self.closeMore(); });
    bind('v8-prep-more-scrim', function () { self.closeMore(); });

    /* 小さな選択画面は、枠外タップで閉じる。★選んだ値は変わりません（16.2） */
    const scrim = rootEl.querySelector('#v8-prep-pick-scrim');
    if (scrim) {
      scrim.addEventListener('pointerdown', function (e) {
        self.closePicker();
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }

    /* デッキの変更は、いまは既存のデッキ選択へ渡します（5-3 で作り替えます） */
    /* パネルのどこを押してもデッキ選択が開きます（「変更」も同じ動きです） */
    bind('v8-prep-self', function () { self._changeDeck('playerDeck'); });
    bind('v8-prep-opp', function () { self._changeDeck('cpuDeck'); });
    const stop = function (id, key) {
      const el = rootEl.querySelector('#' + id);
      if (!el) return;
      el.onclick = function (e) {
        /* パネルにも同じ処理が付いているので、二重に開かないよう止めます */
        if (e && e.stopPropagation) e.stopPropagation();
        self._changeDeck(key);
      };
    };
    stop('v8-prep-self-change', 'playerDeck');
    stop('v8-prep-opp-change', 'cpuDeck');
    bind('v8-deck-back', function () { self.closeDeck(); });
    bind('v8-deck-ok', function () { self.confirmDeck(); });
    this.hookReturn();
    return this;
  },

  isOpen: function () { return this.open_; },

  open: function () {
    if (!this._root) return false;
    this.open_ = true;

    /* ★この画面は対戦画面のレイヤーの中にあります。
       対戦していないあいだ、そのレイヤーは器ごと隠れているので、
       ここで自分から出さないと「開いたのに何も見えない」状態になります。
       （実際にそうなり、CPU対戦へ進めなくなりました） */
    this._root.classList.add('v7-on');
    this._root.classList.add('v8-prep-on');
    this.render();
    return true;
  },

  /** 画面を隠すだけ（対戦を始めるときに使う） */
  hide: function () {
    this.open_ = false;
    if (!this._root) return;
    this._root.classList.remove('v8-prep-on');
    this._root.classList.remove('v7-on');
  },

  /** 閉じてメインハブへ戻る */
  close: function () {
    this.hide();
    if (typeof window !== 'undefined' && window.__v8PrepBack) window.__v8PrepBack();
  },

  _get: function () {
    return (typeof window !== 'undefined' && window.__v8PrepGet) ? window.__v8PrepGet() : null;
  },

  /* =============================================================
     描く
     ============================================================= */
  render: function () {
    if (!this._root || !this.open_) return;
    const s = this._get();
    if (!s) return;
    const self = this;

    /* --- デッキパネル（16.1：フィールドの絵・名前・短い説明・変更） --- */
    ['opp', 'self'].forEach(function (who) {
      const d = (who === 'self') ? s.player : s.cpu;
      const panel = self._root.querySelector('#v8-prep-' + who);
      if (!panel || !d) return;
      if (typeof V8Images !== 'undefined') V8Images.apply(panel, d.image || '');
      const set = function (id, text) {
        const el = self._root.querySelector('#' + id);
        if (el) el.textContent = text;
      };
      set('v8-prep-' + who + '-name', d.name || '');
      set('v8-prep-' + who + '-desc', d.desc || '');
    });

    /* --- 難易度と手番（16.2：現在値だけ出す） --- */
    const diff = this._root.querySelector('#v8-prep-diff-val');
    if (diff) diff.textContent = this._labelOf(this.DIFF, s.difficulty);
    /* ★詳細設定の右側に、いまのシードの扱いを短く出します。
       開かなくても「ランダムのままか」が分かるようにするためです。 */
    const more = this._root.querySelector('#v8-prep-more-val');
    if (more) {
      more.textContent = (s.seedMode === 'fixed') ? 'シード指定' : 'シード：ランダム';
    }

    const turn = this._root.querySelector('#v8-prep-turn-val');
    if (turn) turn.textContent = this._labelOf(this.TURN, s.firstPlayer);

    /* --- 対戦開始（16.3：条件がそろっているときだけ押せる） --- */
    const btn = this._root.querySelector('#v8-prep-start');
    const err = this._root.querySelector('#v8-prep-error');
    const reason = s.invalidReason || '';
    if (btn) btn.disabled = !!reason;
    if (err) {
      err.textContent = reason;
      err.style.display = reason ? 'block' : 'none';
    }
  },

  /* =============================================================
     ★詳細設定（第16部・作者の指示）
     -------------------------------------------------------------
     シードはふだん使う設定ではないので、ここへしまいます。
     ★機能そのものは残します。同じ種を与えれば同じ展開になるので、
       不具合を確かめたり、同じ勝負をもう一度見たりするのに要ります。
     ============================================================= */
  SEED_MODE: [
    { v: 'random', label: 'ランダム' },
    { v: 'fixed', label: '指定する' },
  ],

  openMore: function () {
    if (!this._root) return;
    this._root.classList.add('v8-prep-more-on');
    this.renderMore();
  },

  closeMore: function () {
    if (this._root) this._root.classList.remove('v8-prep-more-on');
    this.render();
  },

  renderMore: function () {
    if (!this._root) return;
    const s = this._get();
    if (!s) return;
    const self = this;
    const doc = document;

    const box = this._root.querySelector('#v8-prep-seedmode');
    if (box) {
      box.innerHTML = '';
      this.SEED_MODE.forEach(function (o) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'v8-btn v8-prep__opt' +
          (o.v === s.seedMode ? ' v8-prep__opt--on' : '');
        b.textContent = o.label;
        b.onclick = function () {
          if (typeof window !== 'undefined' && window.__v8PrepSet) {
            window.__v8PrepSet('seedMode', o.v);
          }
          self.renderMore();
        };
        box.appendChild(b);
      });
    }

    const input = this._root.querySelector('#v8-prep-seed');
    if (input) {
      input.value = s.seed || '';
      /* ★「指定する」でなければ触らせません。
         入れても使われないのに書けると、効いていると思われます。 */
      input.disabled = (s.seedMode !== 'fixed');
      input.oninput = function () {
        if (typeof window !== 'undefined' && window.__v8PrepSetSeed) {
          window.__v8PrepSetSeed(input.value);
        }
      };
    }
  },

  _labelOf: function (list, value) {
    for (let i = 0; i < list.length; i++) if (list[i].v === value) return list[i].label;
    return '';
  },

  /* =============================================================
     小さな選択画面（16.2）
     -------------------------------------------------------------
     ★選択肢を準備画面へ常時横並びにはしません。
       タップして開き、選んだら準備画面へ戻ります。
       ほかの設定はそのままです。
     ============================================================= */
  openPicker: function (key) {
    if (!this._root) return;
    const s = this._get();
    if (!s) return;
    this._picking = key;
    this._root.classList.add('v8-prep-pick-on');

    const list = (key === 'difficulty') ? this.DIFF : this.TURN;
    const now = (key === 'difficulty') ? s.difficulty : s.firstPlayer;
    const title = this._root.querySelector('#v8-prep-pick-title');
    if (title) title.textContent = (key === 'difficulty') ? 'CPU難易度' : '手番';

    const box = this._root.querySelector('#v8-prep-pick-list');
    if (!box) return;
    box.innerHTML = '';
    const doc = document;
    const self = this;
    list.forEach(function (o) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'v8-btn v8-prep__opt' + (o.v === now ? ' v8-prep__opt--on' : '');
      b.textContent = o.label;
      b.onclick = function () {
        if (typeof window !== 'undefined' && window.__v8PrepSet) {
          window.__v8PrepSet(key, o.v);
        }
        self.closePicker();
        self.render();          // 選んだら準備画面へ戻る（16.2）
      };
      box.appendChild(b);
    });
  },

  closePicker: function () {
    this._picking = null;
    if (this._root) this._root.classList.remove('v8-prep-pick-on');
  },

  /* =============================================================
     デッキ選択（第17部 17.1・17.2）
     -------------------------------------------------------------
     2列。公式と自作を見出しで分けます。
     タップは仮選択で、下の「このデッキを選ぶ」で確定します。
     戻ると変更は捨てて、もとのデッキのままです（17.2）。
     ============================================================= */
  _deckKey: null,     // 'playerDeck' / 'cpuDeck'
  _deckTemp: null,    // 仮選択

  _changeDeck: function (key) {
    if (!this._root) return;
    const opt = (typeof window !== 'undefined' && window.__v8PrepDeckOptions)
      ? window.__v8PrepDeckOptions(key) : null;
    if (!opt) return;

    const s = this._get();
    this._deckKey = key;
    this._deckTemp = s ? ((key === 'playerDeck') ? s.player.id : s.cpu.id) : null;
    this._root.classList.add('v8-deckpick-on');

    const set = function (root, id, text) {
      const el = root.querySelector('#' + id);
      if (el) el.textContent = text;
    };
    set(this._root, 'v8-deck-title', opt.title);
    set(this._root, 'v8-deck-note', opt.note);

    const box = this._root.querySelector('#v8-deck-list');
    if (!box) return;
    box.innerHTML = '';
    const doc = document;
    const self = this;

    const section = function (label, list) {
      if (!list || !list.length) return;
      const h = doc.createElement('h4');
      h.className = 'v8-deck__head';
      h.textContent = label;
      box.appendChild(h);

      const grid = doc.createElement('div');
      grid.className = 'v8-deck__grid';   // 2列（17.1）
      list.forEach(function (d) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'v8-deck__item v8-deckthumb';
        b.setAttribute('data-deck-id', d.id);
        if (typeof V8Images !== 'undefined' && d.image) V8Images.apply(b, d.image);
        const veil = doc.createElement('span');
        veil.className = 'v8-deck__veil';
        const nm = doc.createElement('span');
        nm.className = 'v8-deck__name';
        nm.textContent = d.name;
        const ds = doc.createElement('span');
        ds.className = 'v8-deck__desc';
        ds.textContent = d.desc || '';
        veil.appendChild(nm); veil.appendChild(ds);
        b.appendChild(veil);
        b.onclick = function () { self._pickDeck(d.id); };

        /* 詳細ボタン（17.1：各パネルに詳細）。既存の確認画面を出します */
        const info = doc.createElement('span');
        info.className = 'v8-deck__info';
        info.textContent = '詳細';
        info.onclick = function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          self.viewDeck(d.id);
        };
        b.appendChild(info);

        /* ★編集は自分側の自作デッキだけ（17.4） */
        if (d.editable) {
          const ed = doc.createElement('span');
          ed.className = 'v8-deck__edit';
          ed.textContent = '編集';
          ed.onclick = function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            self.editDeck(d.id);
          };
          b.appendChild(ed);
        }
        grid.appendChild(b);
      });
      box.appendChild(grid);
    };

    section('公式デッキ', opt.official);
    section('自作デッキ', opt.custom);
    section('そのほか', opt.extra);
    this._syncDeckPick();
  },

  /** タップは仮選択（17.2） */
  _pickDeck: function (id) {
    this._deckTemp = id;
    this._syncDeckPick();
  },

  _syncDeckPick: function () {
    if (!this._root) return;
    const items = this._root.querySelectorAll('.v8-deck__item');
    const self = this;
    Array.prototype.forEach.call(items, function (el) {
      el.classList.toggle('v8-deck__item--on',
        el.getAttribute('data-deck-id') === String(self._deckTemp));
    });
  },

  /* =============================================================
     デッキの中身を見る（17.3）
     -------------------------------------------------------------
     ★既存のデッキ確認画面をそのまま出します（ダロクの指示）。
       40枚の並び・種類ごとの枚数・コピー・画像保存が、そのまま使えます。
       自分で作り直すより、できているものを使うほうが確実です。
     ============================================================= */
  viewDeck: function (id) {
    /* ★暗転が始まる前に、こちらの画面を先に隠します。
       あとから隠すと、暗転が晴れる手前で一瞬こちらが見えます。 */
    this._handOver('view');
    const ok = (typeof window !== 'undefined' && window.__v8PrepViewDeck)
      ? window.__v8PrepViewDeck(id) : false;
    if (!ok) { this._waitReturn = false; this.open_ = true; }
  },

  /** 自作デッキを既存の編集画面で開く（17.4） */
  editDeck: function (id) {
    this._handOver('edit');
    const ok = (typeof window !== 'undefined' && window.__v8PrepEditDeck)
      ? window.__v8PrepEditDeck(id) : false;
    if (!ok) { this._waitReturn = false; this.open_ = true; }
  },

  /* =============================================================
     既存の画面へ渡すときの後始末
     -------------------------------------------------------------
     ★ここで自分を隠してはいけません。
       この画面は v0.7 の器（#v7-root）の中にあり、
       渡し先の処理が暗転してから器ごと隠してくれます。
       先に自分だけ隠すと、暗転が始まるまでのあいだ
       裏にある画面（トレーニングモード選択など）が覗きます。
       実際にそうなりました。
     ============================================================= */
  _handOver: function (mode) {
    this._waitReturn = true;
    this._resumeMode = mode || 'view';
    /* ★デッキ選択は閉じません。開いたまま器ごと隠れるので、
       戻ってきたときに「詳細を押す直前」がそのまま現れます
       （どのデッキを選びかけていたかも残ります）。 */
    this.open_ = false;      // 状態だけ下ろす。見た目は器ごと隠れる
  },

  /** 渡している最中かどうか。見張りに触らせないための印 */
  isBusy: function () { return this.open_ || this._waitReturn || this._startingMatch; },

  /** 対戦を始めようとしている最中か */
  isStartingMatch: function () { return !!this._startingMatch; },

  /** 対戦の盤面が出たので、準備画面を下ろす */
  finishStart: function () {
    this._startingMatch = false;
    this.open_ = false;
    if (!this._root) return;
    this._root.classList.remove('v8-prep-on');
    this._root.classList.remove('v8-deckpick-on');
    /* 器（v7-on）は残します。対戦の盤面が同じ器を使います。 */
  },

  _startingMatch: false,

  /** 戻ってきたときに、詳細を押す直前の状態へ戻す */
  _resume: function () {
    const mode = this._resumeMode;
    this._resumeMode = null;
    this.open();

    /* 編集から戻ったときは、中身が変わっているので一覧を作り直します。
       選びかけていたデッキはそのまま残します。 */
    if (mode === 'edit' && this._deckKey) {
      const keep = this._deckTemp;
      this._changeDeck(this._deckKey);
      if (keep) { this._deckTemp = keep; this._syncDeckPick(); }
    }
  },

  _resumeMode: null,

  /** 見た目も含めて確実に下ろす（準備画面へ戻らないとき） */
  _reallyHide: function () {
    this.open_ = false;
    this._resumeMode = null;
    if (!this._root) return;
    this._root.classList.remove('v8-prep-on');
    this._root.classList.remove('v7-on');
    this._root.classList.remove('v8-deckpick-on');
  },

  /* =============================================================
     ★戻ってきたときの復帰（17.4）
     -------------------------------------------------------------
     以前は見張り（0.22秒ごと）で「編集画面から出たか」を見ていました。
     戻った瞬間が分からず、一瞬だけ元の画面が見えます。
     いまは既存の「メインハブへ戻る」処理に相乗りして、
     戻る操作そのものを合図にしています。
     ============================================================= */
  hookReturn: function () {
    if (typeof V7Bridge === 'undefined' || V7Bridge.__v8prepHooked) return;
    V7Bridge.__v8prepHooked = true;
    const orig = V7Bridge.returnToHub;
    const self = this;
    V7Bridge.returnToHub = function () {
      const back = self._waitReturn;
      self._waitReturn = false;
      /* 準備画面へ戻らないときは、残っている見た目をここで下ろします */
      if (!back) self._reallyHide();
      const r = orig.apply(this, arguments);
      /* 既存の後始末が終わってから、詳細を押す直前の状態へ戻します */
      if (back) self._resume();
      return r;
    };
  },

  _waitReturn: false,

  /** 「このデッキを選ぶ」で確定（17.2） */
  confirmDeck: function () {
    if (this._deckKey && this._deckTemp &&
      typeof window !== 'undefined' && window.__v8PrepSet) {
      window.__v8PrepSet(this._deckKey, this._deckTemp);
    }
    this.closeDeck();
    this.render();
  },

  /** ★戻ると変更は捨てます（17.2） */
  closeDeck: function () {
    this._deckKey = null;
    this._deckTemp = null;
    if (this._root) this._root.classList.remove('v8-deckpick-on');
  },

  /* =============================================================
     対戦開始（16.3）
     ============================================================= */
  _busy: false,

  start: function () {
    /* ★二重タップで2試合始めないようにします（16.3） */
    if (this._busy) return;
    const s = this._get();
    if (s && s.invalidReason) return;

    this._busy = true;
    const self = this;

    /* ★先に画面を黒く落としてから始めます（2026-08-01）。
       準備画面から盤面へ入れ替わるところを覆うためです。
       黒が晴れるのは、盤面が出てからです（dealForV8Mulligan）。 */
    const run = function () {
      const ok = (typeof window !== 'undefined' && window.__v8PrepStart)
        ? window.__v8PrepStart() : false;

      /* ★始まっても、ここでは隠しません。
         すぐ隠すと、対戦の盤面が出るまでのあいだ、
         裏にある画面（CPU対戦／ひとりまわしの選択）が覗きます。
         対戦が画面に出たのを見てから下ろします（下の finishStart）。 */
      if (ok) self._startingMatch = true;
      /* 始められなかったときは押し直せるように戻します */
      setTimeout(function () { self._busy = false; }, ok ? 1200 : 300);
      if (!ok) {
        /* 始まらなかったのに黒いままだと、何も押せなくなります */
        if (typeof V8Fx !== 'undefined') V8Fx.curtainUp();
        self.render();
      }
    };

    if (typeof V8Fx !== 'undefined') V8Fx.curtainDown(run);
    else run();
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Prep: V8Prep };
}
