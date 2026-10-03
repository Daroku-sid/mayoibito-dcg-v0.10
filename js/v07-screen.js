/* =====================================================================
   v07-screen.js ― 個別画面ルーター＆レンダラー（Stage 3）
   ---------------------------------------------------------------------
   仕様書 第12〜17部・第27部Stage3。

   役割:
     ・メインハブの上に重なる「個別画面レイヤー」(#v7-screen)を管理する
     ・共通固定ヘッダー（戻る／タイトル／右操作）＋スクロール本文（15.1）
     ・画面遷移は 0.4秒の暗転（15.2、既存 V7Wipe を流用）
     ・戻るスタックを持ち、画面内の戻ると端末の戻る（popstate）を
       同じ階層に合わせる（第17部）
     ・親子の戻り（FAQ→ヘルプ→設定→その他タブ 等：15.3 / 17.2）

   触らないもの:
     ・既存ゲーム本体（game.js 等）。本接続は Stage 4。
     ・ここでは新規個別画面だけを完成させる。既存画面へは Stage 4 で繋ぐ。

   設計メモ:
     ・各画面は { key, title, parent, render(bodyEl), rightBtn? } で表す。
     ・スタックは this._stack（配列）。末尾が現在の画面。
     ・popstate は V7Screen が唯一の所有者。多重登録しない（17.7）。
   ===================================================================== */

'use strict';

const V7Screen = {

  WIPE_HALF: 200,          // 暗転の片道（15.2：0.2秒で黒→差し替え→0.2秒で表示）

  _root: null,             // #v7-screen（レイヤー）
  _header: null,           // 固定ヘッダー
  _titleEl: null,
  _backBtn: null,
  _rightWrap: null,
  _bodyEl: null,           // スクロールする本文
  _toastAnchor: null,      // 個別画面用の通知位置（ヘッダー直下：16.3）

  _stack: [],              // 現在の画面スタック（末尾＝最前面）
  _inited: false,
  _busy: false,            // 遷移アニメ中は入力を受けない（15.2）
  _popBound: false,        // popstate を登録済みか（多重防止：17.7）
  _entryTab: null,         // 個別画面群へ入ったときのメインタブ（復帰先）

  /* =============================================================
     初期化：レイヤーとヘッダーの骨格を1度だけ作る
     ============================================================= */
  init: function (shellEl) {
    if (this._inited) return;
    this._inited = true;

    const layer = document.createElement('div');
    layer.className = 'v7-screen';
    layer.id = 'v7-screen';
    layer.style.display = 'none';

    // 固定ヘッダー（15.1）
    const header = document.createElement('div');
    header.className = 'v7-screen__header v7-safe-top';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'v7-screen__back';
    back.setAttribute('aria-label', '戻る');
    back.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    back.addEventListener('click', function () { V7Screen.back(); });

    const title = document.createElement('h2');
    title.className = 'v7-screen__title';

    const right = document.createElement('div');
    right.className = 'v7-screen__right';

    header.appendChild(back);
    header.appendChild(title);
    header.appendChild(right);

    // 個別画面用の通知アンカー（ヘッダー直下：16.3）
    const toastAnchor = document.createElement('div');
    toastAnchor.className = 'v7-screen__toast';
    toastAnchor.id = 'v7-screen-toast';

    const body = document.createElement('div');
    body.className = 'v7-screen__body';

    layer.appendChild(header);
    layer.appendChild(toastAnchor);
    layer.appendChild(body);
    shellEl.appendChild(layer);

    this._root = layer;
    this._header = header;
    this._titleEl = title;
    this._backBtn = back;
    this._rightWrap = right;
    this._bodyEl = body;
    this._toastAnchor = toastAnchor;

    this._bindPop();
  },

  /* popstate は一度だけ登録（17.7：多重登録しない） */
  _bindPop: function () {
    if (this._popBound) return;
    this._popBound = true;
    window.addEventListener('popstate', function () {
      V7Screen._onPop();
    });
  },

  isOpen: function () {
    return this._stack.length > 0;
  },

  depth: function () {
    return this._stack.length;
  },

  /* =============================================================
     画面を開く（メインハブ／親画面から）
     entry=true なら「ハブから個別画面群へ入る」起点
     ============================================================= */
  open: function (key, opts) {
    opts = opts || {};
    if (this._busy) return;
    const def = this._def(key);
    if (!def) return;

    const wasClosed = this._stack.length === 0;
    if (wasClosed) {
      // ハブから入る起点：復帰先のメインタブを覚えておく（15.3）
      this._entryTab = (typeof V7Hub !== 'undefined') ? V7Hub.current() : 'home';
      if (typeof V7Hub !== 'undefined' && V7Hub.onHubHidden) V7Hub.onHubHidden();
    }

    this._stack.push({ key: key, data: opts.data || null });
    // ブラウザー履歴に1段積む（端末の戻ると階層を合わせる：17.1）
    // 画面スタックと履歴は 1対1。ダイアログは履歴に積まない。
    try { window.history.pushState({ v7depth: this._stack.length }, ''); } catch (e) {}

    this._transitionTo(def, wasClosed);
  },

  /* 親画面へ1段戻る（画面内の戻るボタン）
     ダイアログが開いていればまずそれを閉じる（17.3）。 */
  back: function () {
    if (typeof V7Dialog !== 'undefined' && V7Dialog.isOpen()) {
      V7Dialog.handleBack();
      return;
    }
    if (this._busy) return;
    if (this._stack.length === 0) return;
    // 履歴を1つ戻す→ popstate（_onPop）が実際の描画を行う（両者を一致させる：17.1）
    try { window.history.back(); } catch (e) { this._popOne(); }
  },

  /* 端末／ブラウザーの戻る。
     ・ダイアログが開いていれば、それを閉じるだけ（履歴は触らない：17.3）
       → 端末戻りで消費した1エントリはダイアログを閉じるのに使われる。
         画面スタックは維持し、埋め合わせの pushState はしない。
     ・ダイアログが無ければ画面を1段戻す。 */
  _onPop: function () {
    if (typeof V7Dialog !== 'undefined' && V7Dialog.isOpen()) {
      // 端末戻るでダイアログを閉じる（17.3）。このとき履歴を1つ消費して
      // いるので、画面スタックとのズレを防ぐため1つ積み直す。
      // （ボタンで閉じる場合はこの経路を通らないので積み直さない＝対称）
      V7Dialog.handleBack();
      try { window.history.pushState({ v7depth: this._stack.length }, ''); } catch (e) {}
      return;
    }
    // 既存機能（対戦・カード・デッキ等）を v0.7 経由で開いている間の
    // ブラウザー戻るは、既存機能の「戻る」として扱う（第17部 17.1）。
    if (typeof V7Bridge !== 'undefined' && V7Bridge.isActive()) {
      V7Bridge.handleBrowserBack();
      // 既存機能はまだ画面を占有しているので、履歴を1つ積み直しておく
      try { window.history.pushState({ v7legacy: 1 }, ''); } catch (e) {}
      return;
    }
    if (this._stack.length === 0) {
      // 個別画面が無い＝メインハブ側の戻る（17.4）はハブに委ねる
      if (typeof V7Hub !== 'undefined' && V7Hub.handleHubBack) V7Hub.handleHubBack();
      return;
    }
    this._popOne();
  },

  _popOne: function () {
    if (this._busy) return;
    if (this._stack.length === 0) return;
    this._stack.pop();

    if (this._stack.length === 0) {
      // 個別画面群を抜けてメインハブへ戻る
      this._transitionToHub();
      return;
    }
    const top = this._stack[this._stack.length - 1];
    const def = this._def(top.key);
    if (def) this._transitionTo(def, false);
  },

  /* すべて閉じてメインハブへ（初期化後などの強制復帰：20.6）
     -------------------------------------------------------------
     history.back() を複数回呼ぶと、実ブラウザでは popstate が非同期に
     何度も発火し、余分に戻ってページを離脱する事故が起きうる。
     そこで「積んだ履歴を1回の replaceState でならし、描画は自前で行う」
     方式にする。back() 連打はしない。 */
  closeAll: function (targetTab) {
    if (targetTab && typeof V7Hub !== 'undefined') {
      V7Hub._pendingTab = targetTab;
    }
    const hadScreens = this._stack.length > 0;
    this._stack = [];
    // 積み上げた画面ぶんの履歴エントリを、現在位置ごと「ハブ相当の1つ」へ
    // 置き換える。これで端末戻るは（ハブの手前＝ブラウザ標準）へ向かう。
    try { window.history.replaceState({ v7depth: 0 }, ''); } catch (e) {}
    if (hadScreens) this._transitionToHub();
    else if (typeof V7Hub !== 'undefined' && V7Hub._pendingTab) {
      const t = V7Hub._pendingTab; V7Hub._pendingTab = null; V7Hub.jumpTab(t);
    }
  },

  /* =============================================================
     遷移（15.2：0.4秒暗転。頂点で中身を差し替える）
     ============================================================= */
  _transitionTo: function (def, showLayer) {
    const self = this;
    this._busy = true;
    V7Wipe.run(function () {
      if (showLayer) self._root.style.display = '';
      self._paint(def);
    }, function () {
      self._busy = false;
    });
  },

  _transitionToHub: function () {
    const self = this;
    this._busy = true;
    this._entryTab = null;
    V7Wipe.run(function () {
      self._root.style.display = 'none';
      self._bodyEl.innerHTML = '';
      // ハブへ戻す。保留タブがあればそのタブへ。
      if (typeof V7Hub !== 'undefined') {
        if (V7Hub._pendingTab) {
          const t = V7Hub._pendingTab;
          V7Hub._pendingTab = null;
          V7Hub.jumpTab(t);
        }
        if (V7Hub.onHubShown) V7Hub.onHubShown();
      }
    }, function () {
      self._busy = false;
    });
  },

  /* ヘッダーと本文を、画面定義に沿って描く */
  _paint: function (def) {
    // ヘッダー
    this._titleEl.textContent = def.title || '';
    this._rightWrap.innerHTML = '';
    if (def.rightBtn) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'v7-screen__rightbtn';
      b.textContent = def.rightBtn.label;
      b.addEventListener('click', def.rightBtn.onClick);
      this._rightWrap.appendChild(b);
    }
    // 本文
    this._bodyEl.scrollTop = 0;
    this._bodyEl.innerHTML = '';
    const top = this._stack[this._stack.length - 1];
    def.render(this._bodyEl, (top && top.data) || null);
  },

  /* 個別画面用の通知（ヘッダー直下：16.3）。ハブと同じ V7Toast を使う。 */
  toast: function (text, opts) {
    if (typeof V7Toast !== 'undefined') V7Toast.push(text, opts);
  },

  /* =============================================================
     画面定義の解決
     ============================================================= */
  _def: function (key) {
    return V7Screens[key] || null;
  },

  /* -------------------------------------------------------------
     共通パーツ：横長リスト項目（設定ハブ・ヘルプで使う）
     ------------------------------------------------------------- */
  listRow: function (opts) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'v7-listrow' + (opts.soon ? ' v7-listrow--soon' : '');

    const main = document.createElement('span');
    main.className = 'v7-listrow__main';
    const nameEl = document.createElement('span');
    nameEl.className = 'v7-listrow__name';
    nameEl.textContent = opts.name;
    main.appendChild(nameEl);
    if (opts.desc) {
      const descEl = document.createElement('span');
      descEl.className = 'v7-listrow__desc';
      descEl.textContent = opts.desc;
      main.appendChild(descEl);
    }
    row.appendChild(main);

    if (opts.soon) {
      const soon = document.createElement('span');
      soon.className = 'v7-listrow__soon';
      soon.textContent = '準備中';
      row.appendChild(soon);
    } else {
      const arrow = document.createElement('span');
      arrow.className = 'v7-listrow__arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '›';
      row.appendChild(arrow);
    }
    if (opts.onClick) row.addEventListener('click', opts.onClick);
    return row;
  },

  /* 共通パーツ：アコーディオン（用語集・FAQ：14.3/14.4） */
  accordion: function (items, qKey, aKey) {
    const wrap = document.createElement('div');
    wrap.className = 'v7-acc';
    items.forEach(function (it) {
      const box = document.createElement('div');
      box.className = 'v7-acc__item';

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'v7-acc__head';
      head.setAttribute('aria-expanded', 'false');
      const term = document.createElement('span');
      term.className = 'v7-acc__term';
      term.textContent = it[qKey];
      const mark = document.createElement('span');
      mark.className = 'v7-acc__mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '+';
      head.appendChild(term);
      head.appendChild(mark);

      const panel = document.createElement('div');
      panel.className = 'v7-acc__panel';
      const inner = document.createElement('div');
      inner.className = 'v7-acc__desc';
      inner.textContent = it[aKey];
      panel.appendChild(inner);

      head.addEventListener('click', function () {
        const open = box.classList.toggle('is-open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        // 複数同時に開ける（14.3）。高さは中身に合わせる。
        panel.style.maxHeight = open ? (inner.scrollHeight + 40) + 'px' : '0px';
        mark.textContent = open ? '−' : '+';
      });

      box.appendChild(head);
      box.appendChild(panel);
      wrap.appendChild(box);
    });
    return wrap;
  },

  /* 共通パーツ：見出し */
  sectionTitle: function (text) {
    const h = document.createElement('div');
    h.className = 'v7-screen__section';
    h.textContent = text;
    return h;
  },

  /* =============================================================
     ★共通パーツ：選ぶ設定の1行（v0.9）
     -------------------------------------------------------------
     「名前 ＋ 説明 ＋ 2〜3択」を1行で出します。

     ★中身は既存の設定をそのまま読み書きします。
       設定そのものは前から動いていて、対戦の外から触る道が
       無かっただけです。ここで道を作ります。
     ============================================================= */
  choiceRow: function (opts) {
    const row = document.createElement('div');
    row.className = 'v7-setrow';

    const head = document.createElement('div');
    head.className = 'v7-setrow__head';
    const name = document.createElement('span');
    name.className = 'v7-setrow__name';
    name.textContent = opts.name;
    head.appendChild(name);
    row.appendChild(head);

    if (opts.desc) {
      const d = document.createElement('p');
      d.className = 'v7-setrow__desc';
      d.textContent = opts.desc;
      row.appendChild(d);
    }

    const box = document.createElement('div');
    box.className = 'v7-setrow__choices ui-choices';

    const paint = function () {
      Array.prototype.forEach.call(box.children, function (b) {
        const on = String(b.dataset.val) === String(opts.get());
        b.classList.toggle('is-on', on);
        /* ★選ばれていることを、色だけでなく読み上げにも伝えます */
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    };

    (opts.options || []).forEach(function (pair) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'v7-setrow__choice ui-choice';
      b.dataset.val = String(pair[1]);
      b.textContent = pair[0];
      b.addEventListener('click', function () {
        opts.set(pair[1]);
        paint();
      });
      box.appendChild(b);
    });

    row.appendChild(box);
    paint();
    return row;
  },

  /* =============================================================
     ★共通パーツ：つまみで決める設定の1行（v0.9）
     -------------------------------------------------------------
     ★動かしている最中は、まだ保存しません。
       指を離したところで保存します。1目盛りごとに書き込むと、
       動かすたびに保存が走ります。
     ============================================================= */
  rangeRow: function (opts) {
    const row = document.createElement('div');
    row.className = 'v7-setrow';

    const head = document.createElement('div');
    head.className = 'v7-setrow__head';
    const name = document.createElement('span');
    name.className = 'v7-setrow__name';
    name.textContent = opts.name;
    const val = document.createElement('span');
    val.className = 'v7-setrow__value';
    head.appendChild(name);
    head.appendChild(val);
    row.appendChild(head);

    if (opts.desc) {
      const d = document.createElement('p');
      d.className = 'v7-setrow__desc';
      d.textContent = opts.desc;
      row.appendChild(d);
    }

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'v7-setrow__range';
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step || 1);
    input.value = String(opts.get());
    val.textContent = input.value + (opts.unit || '');

    input.addEventListener('input', function () {
      val.textContent = input.value + (opts.unit || '');
      if (opts.onInput) opts.onInput(Number(input.value));
    });
    input.addEventListener('change', function () {
      opts.set(Number(input.value));
    });

    row.appendChild(input);
    return row;
  },
};

/* =====================================================================
   各個別画面の定義
   ---------------------------------------------------------------------
   key ごとに { title, render(body, data) } を持つ。
   parent は「画面内の戻る」で戻す先の意味（スタックで管理するので
   実際の戻りはスタック依存だが、開くときの積み方をここで決める）。
   ===================================================================== */
const V7Screens = {

  /* ---------- プロフィール（第12部） ---------- */
  profile: {
    title: 'プロフィール',
    render: function (body) {
      const p = (typeof V7Save !== 'undefined' && V7Save.data)
        ? V7Save.data.profile : { playerName: 'プレイヤー', title: 'はじめての一歩' };
      const localId = (typeof V7Save !== 'undefined' && V7Save.localId)
        ? (V7Save.localId() || '----') : '----';

      const card = document.createElement('div');
      card.className = 'v7-prof';

      // アイコン（汎用シルエット）
      const icon = document.createElement('div');
      icon.className = 'v7-prof__icon';
      icon.innerHTML =
        '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">' +
        '<circle cx="24" cy="17" r="9"/><path d="M8 42c0-9 7-14 16-14s16 5 16 14z"/></svg>';
      card.appendChild(icon);

      const name = document.createElement('div');
      name.className = 'v7-prof__name';
      name.textContent = p.playerName || 'プレイヤー';
      card.appendChild(name);

      const title = document.createElement('div');
      title.className = 'v7-prof__title';
      title.textContent = p.title || 'はじめての一歩';
      card.appendChild(title);

      // ローカルID＋コピー（12.4 / 12.5）
      const idRow = document.createElement('div');
      idRow.className = 'v7-prof__idrow';
      const idLabel = document.createElement('span');
      idLabel.className = 'v7-prof__idlabel';
      idLabel.textContent = 'ローカルID';
      const idVal = document.createElement('span');
      idVal.className = 'v7-prof__idval';
      idVal.textContent = localId;
      idVal.id = 'v7-prof-idval';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'v7-prof__copy';
      copy.textContent = 'コピー';
      copy.addEventListener('click', function () {
        V7Screen._copyLocalId(localId, idVal);
      });
      idRow.appendChild(idLabel);
      idRow.appendChild(idVal);
      idRow.appendChild(copy);
      card.appendChild(idRow);

      body.appendChild(card);

      // お気に入りカード（12.6）
      body.appendChild(V7Screen.sectionTitle('お気に入りカード'));
      const fav = document.createElement('button');
      fav.type = 'button';
      fav.className = 'v7-prof__fav';
      const favImg = document.createElement('span');
      favImg.className = 'v7-prof__favimg';
      favImg.setAttribute('aria-hidden', 'true');
      const favName = document.createElement('span');
      favName.className = 'v7-prof__favname';
      favName.textContent = '《屋敷の令嬢 エリーゼ》';
      fav.appendChild(favImg);
      fav.appendChild(favName);
      fav.addEventListener('click', function () {
        V7Screen._openFavoriteCard();
      });
      body.appendChild(fav);
    },
  },

  /* ---------- お知らせ一覧（第13部 13.1） ---------- */
  news: {
    title: 'お知らせ',
    render: function (body) {
      const list = (typeof V7_NEWS !== 'undefined') ? V7_NEWS : [];
      const wrap = document.createElement('div');
      wrap.className = 'v7-news';
      list.forEach(function (n) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'v7-news__row';

        const meta = document.createElement('span');
        meta.className = 'v7-news__meta';
        const date = document.createElement('span');
        date.className = 'v7-news__date';
        date.textContent = n.date || '';
        const cat = document.createElement('span');
        cat.className = 'v7-news__cat v7-news__cat--' + V7Screen._catClass(n.category);
        cat.textContent = n.category || '';
        meta.appendChild(date);
        meta.appendChild(cat);

        const titleEl = document.createElement('span');
        titleEl.className = 'v7-news__title';
        titleEl.textContent = n.title || '';

        row.appendChild(meta);
        row.appendChild(titleEl);
        row.addEventListener('click', function () {
          V7Screen.open('newsDetail', { data: n });
        });
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
    },
  },

  /* ---------- お知らせ詳細（第13部 13.2） ---------- */
  newsDetail: {
    title: 'お知らせ',
    render: function (body, data) {
      const n = data || {};
      const art = document.createElement('article');
      art.className = 'v7-newsdet';

      const h = document.createElement('h3');
      h.className = 'v7-newsdet__title';
      h.textContent = n.title || '';

      const meta = document.createElement('div');
      meta.className = 'v7-newsdet__meta';
      const date = document.createElement('span');
      date.className = 'v7-newsdet__date';
      date.textContent = n.date || '';
      const cat = document.createElement('span');
      cat.className = 'v7-news__cat v7-news__cat--' + V7Screen._catClass(n.category);
      cat.textContent = n.category || '';
      meta.appendChild(date);
      meta.appendChild(cat);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'v7-newsdet__body';
      bodyEl.textContent = n.body || '';   // 改行は CSS の white-space で活かす

      art.appendChild(h);
      art.appendChild(meta);
      art.appendChild(bodyEl);
      body.appendChild(art);
    },
  },

  /* ---------- ソロプレイ選択（第9部 9.2） ---------- */
  solo: {
    title: 'ソロプレイ',
    render: function (body) {
      const t = (typeof V7_SELECT_TEXT !== 'undefined') ? V7_SELECT_TEXT : {};
      const layout = document.createElement('div');
      layout.className = 'v7-lr v7-lr--screen';

      const left = V7Screen._tile('ストーリー', { big: true, soon: true, onClick: function () {
        V7Dialog.comingSoon('ストーリー', t.story || '準備中です。');
      }});
      left.classList.add('v7-lr__main');

      const side = document.createElement('div');
      side.className = 'v7-lr__side';
      side.appendChild(V7Screen._tile('ソロ周回', { soon: true, onClick: function () {
        V7Dialog.comingSoon('ソロ周回', t.soloLoop || '準備中です。');
      }}));

      layout.appendChild(left);
      layout.appendChild(side);
      body.appendChild(layout);
    },
  },

  /* ---------- オンライン選択（第9部 9.3） ---------- */
  online: {
    title: 'オンライン',
    render: function (body) {
      const t = (typeof V7_SELECT_TEXT !== 'undefined') ? V7_SELECT_TEXT : {};

      body.appendChild(V7Screen.sectionTitle('オンラインコンテンツ'));
      const g1 = document.createElement('div');
      g1.className = 'v7-grid v7-grid--2';
      g1.appendChild(V7Screen._tile('期間限定イベント', { soon: true, onClick: function () {
        V7Dialog.comingSoon('期間限定イベント', t.onlineEvent || '準備中です。');
      }}));
      g1.appendChild(V7Screen._tile('タワー', { soon: true, onClick: function () {
        V7Dialog.comingSoon('タワー', t.onlineTower || '準備中です。');
      }}));
      body.appendChild(g1);

      body.appendChild(V7Screen.sectionTitle('対人戦'));
      const g2 = document.createElement('div');
      g2.className = 'v7-grid v7-grid--2';
      g2.appendChild(V7Screen._tile('フレンド対戦', { soon: true, onClick: function () {
        V7Dialog.comingSoon('フレンド対戦', t.onlineFriend || '準備中です。');
      }}));
      g2.appendChild(V7Screen._tile('カジュアルマッチ', { soon: true, onClick: function () {
        V7Dialog.comingSoon('カジュアルマッチ', t.onlineCasual || '準備中です。');
      }}));
      body.appendChild(g2);
    },
  },

  /* ---------- その他対戦選択（第9部 9.4） ---------- */
  otherBattle: {
    title: 'その他対戦',
    render: function (body) {
      const layout = document.createElement('div');
      layout.className = 'v7-lr v7-lr--screen';

      const left = V7Screen._tile('トレーニングモード', { big: true, onClick: function () {
        V7Screen.open('training');
      }});
      left.classList.add('v7-lr__main');

      const side = document.createElement('div');
      side.className = 'v7-lr__side';
      // チュートリアル・開発者用モードは既存機能へ接続（第9部 9.4）。
      side.appendChild(V7Screen._tile('チュートリアル', { onClick: function () {
        if (typeof V7Bridge !== 'undefined') {
          V7Bridge.openLegacy({ screen: 'tutorial-select', entryTab: 'battle' });
        }
      }}));
      side.appendChild(V7Screen._tile('開発者用モード', { onClick: function () {
        if (typeof V7Bridge !== 'undefined') {
          V7Bridge.openLegacy({ screen: 'dev-mode', entryTab: 'battle' });
        }
      }}));

      layout.appendChild(left);
      layout.appendChild(side);
      body.appendChild(layout);
    },
  },

  /* ---------- トレーニングモード選択（第9部 9.5） ---------- */
  training: {
    title: 'トレーニングモード',
    render: function (body) {
      const grid = document.createElement('div');
      grid.className = 'v7-grid v7-grid--2';
      // CPU対戦・ひとりまわしは既存機能へ直接接続（第9部 9.5）。
      grid.appendChild(V7Screen._tile('CPU対戦', { big: true, onClick: function () {
        if (typeof V7Bridge !== 'undefined') {
          V7Bridge.openLegacy({ screen: 'cpu-setup', entryTab: 'battle' });
        }
      }}));
      grid.appendChild(V7Screen._tile('ひとりまわし', { big: true, onClick: function () {
        if (typeof V7Bridge !== 'undefined') {
          V7Bridge.openLegacy({ screen: 'solo-setup', entryTab: 'battle' });
        }
      }}));
      body.appendChild(grid);
    },
  },

  /* ---------- 設定ハブ（第14部 14.1） ---------- */
  settings: {
    title: '設定',
    render: function (body) {
      /* ★v0.9：3つとも「準備中」でした。
         ★中身はすべて前から動いていて、対戦の外から触る道が
           無かっただけです（旧デザインの設定画面にはありましたが、
           ホーム画面が入ってから、そこへ行く道が消えていました）。
         ここで道を作ります。 */
      body.appendChild(V7Screen.sectionTitle('ゲーム設定'));
      body.appendChild(V7Screen.listRow({ name: 'サウンド設定', desc: '効果音の入り切りと音量を調整します',
        onClick: function () { V7Screen.open('setSound'); }}));
      body.appendChild(V7Screen.listRow({ name: '表示・演出設定', desc: '演出の速さや盤面の見え方を調整します',
        onClick: function () { V7Screen.open('setDisplay'); }}));
      body.appendChild(V7Screen.listRow({ name: '操作設定', desc: 'CPUの速さや確認表示を調整します',
        onClick: function () { V7Screen.open('setControl'); }}));

      // データ
      body.appendChild(V7Screen.sectionTitle('データ'));
      body.appendChild(V7Screen.listRow({ name: 'データ管理', desc: '保存データの書き出し・読み込み・初期化',
        onClick: function () { V7Screen.open('dataManage'); }}));

      // サポート・情報
      body.appendChild(V7Screen.sectionTitle('サポート・情報'));
      body.appendChild(V7Screen.listRow({ name: 'ヘルプ', desc: '遊び方や用語、よくある質問を確認します',
        onClick: function () { V7Screen.open('help'); }}));
      body.appendChild(V7Screen.listRow({ name: 'クレジット', desc: '制作スタッフや使用ツールを確認します',
        onClick: function () { V7Screen.open('credits'); }}));
    },
  },

  /* =====================================================================
     ★設定の中身（v0.9）
     ---------------------------------------------------------------------
     ★読み書きするのは、対戦中の設定パネルと同じ入口です
       （window.__v8SettingsGet / __v8SettingsSet）。

       ★2つ作ると必ず食い違います。
         ここで直したのに対戦中は変わらない、という形になります。
     ===================================================================== */
  setSound: {
    title: 'サウンド設定',
    render: function (body) {
      const get = function () {
        return (typeof window.__v8SettingsGet === 'function') ? window.__v8SettingsGet() : {};
      };
      const set = function (k, v) {
        if (typeof window.__v8SettingsSet === 'function') window.__v8SettingsSet(k, v);
      };

      body.appendChild(V7Screen.choiceRow({
        name: '効果音',
        desc: '音を鳴らすかどうかです。',
        options: [['ON', 'on'], ['OFF', 'off']],
        get: function () { return get().seEnabled; },
        set: function (v) { set('seEnabled', v); },
      }));

      body.appendChild(V7Screen.rangeRow({
        name: '効果音の音量',
        desc: 'つまみから指を離したときに、試しの音が鳴ります。',
        min: 0, max: 100, step: 5, unit: '％',
        get: function () {
          const v = (typeof Storage !== 'undefined') ? Storage.get('seVolume') : null;
          return (v === null || v === undefined) ? 60 : Number(v);
        },
        /* ★動かしている最中は、音だけ合わせて保存はしません */
        onInput: function (v) { if (typeof Se !== 'undefined') Se.volume = v / 100; },
        /* ★指を離したところで保存し、試しの音を鳴らします */
        set: function (v) {
          if (typeof Se !== 'undefined') Se.volume = v / 100;
          if (typeof Storage !== 'undefined') Storage.set('seVolume', v);
          if (typeof Se !== 'undefined' && Se.preview) Se.preview();
        },
      }));

      const note = document.createElement('p');
      note.className = 'v7-screen__note';
      note.textContent = 'BGMは準備中です。いまは効果音だけを調整できます。';
      body.appendChild(note);
    },
  },

  setDisplay: {
    title: '表示・演出設定',
    render: function (body) {
      const get = function () {
        return (typeof window.__v8SettingsGet === 'function') ? window.__v8SettingsGet() : {};
      };
      const set = function (k, v) {
        if (typeof window.__v8SettingsSet === 'function') window.__v8SettingsSet(k, v);
      };

      body.appendChild(V7Screen.choiceRow({
        name: '演出の速さ',
        desc: 'カードの動きや文字の出る速さを変えます。',
        options: [['標準', 'normal'], ['高速', 'fast']],
        get: function () { return get().animationSpeed; },
        set: function (v) { set('animationSpeed', v); },
      }));

      body.appendChild(V7Screen.choiceRow({
        name: '動きを減らす',
        desc: '視点の切り替えや光り方をひかえめにします。ゲームの進み方は変わりません。',
        options: [['ON', true], ['OFF', false]],
        get: function () { return !!get().reduceMotion; },
        set: function (v) { set('reduceMotion', v); },
      }));

      body.appendChild(V7Screen.choiceRow({
        name: '左右の配置',
        desc: '盤面の左右を入れ替えます。役割は変わりません。',
        options: [['標準', 'off'], ['左右を反転', 'on']],
        get: function () { return get().mirrorLanes; },
        set: function (v) { set('mirrorLanes', v); },
      }));
    },
  },

  setControl: {
    title: '操作設定',
    render: function (body) {
      const get = function () {
        return (typeof window.__v8SettingsGet === 'function') ? window.__v8SettingsGet() : {};
      };
      const set = function (k, v) {
        if (typeof window.__v8SettingsSet === 'function') window.__v8SettingsSet(k, v);
      };

      body.appendChild(V7Screen.choiceRow({
        name: 'CPUの行動速度',
        desc: 'CPUが1手ずつ見せる速さです。次のCPUの行動から変わります。',
        options: [['標準', 'normal'], ['高速', 'fast']],
        get: function () { return get().cpuActionSpeed; },
        set: function (v) { set('cpuActionSpeed', v); },
      }));

      body.appendChild(V7Screen.choiceRow({
        name: '見落とし警告',
        desc: 'まだ使えるカードがあるままターンを終えようとしたとき、確認します。',
        options: [['ON', true], ['OFF', false]],
        get: function () { return get().warnUnplayedCards !== false; },
        set: function (v) { set('warnUnplayedCards', v); },
      }));
    },
  },

  /* ---------- データ管理（第20部 20.6） ---------- */
  dataManage: {
    title: 'データ管理',
    render: function (body) {
      body.appendChild(V7Screen.listRow({ name: 'データを書き出す',
        desc: '保存データを1つのファイルとして書き出します',
        onClick: function () { V7Screen._exportData(); }}));
      body.appendChild(V7Screen.listRow({ name: 'データを読み込む',
        desc: '書き出したファイルから読み込みます',
        onClick: function () { V7Screen._importData(); }}));
      body.appendChild(V7Screen.listRow({ name: 'すべてのデータを初期化する',
        desc: 'デッキやプロフィールを消して最初の状態に戻します',
        onClick: function () { V7Screen._resetData(); }}));

      const note = document.createElement('p');
      note.className = 'v7-screen__note';
      note.textContent =
        'データはこの端末のブラウザー内に保存されます。ブラウザーのデータを削除すると消える場合があります。大切なデータは書き出して保管してください。';
      body.appendChild(note);

      // 隠しファイル入力（読み込み用）
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'application/json,.json';
      file.id = 'v7-import-file';
      file.style.display = 'none';
      file.addEventListener('change', function () { V7Screen._onImportFile(file); });
      body.appendChild(file);
    },
  },

  /* ---------- ヘルプ選択（第14部 14.2） ---------- */
  help: {
    title: 'ヘルプ',
    render: function (body) {
      body.appendChild(V7Screen.listRow({ name: 'ゲームの遊び方', desc: '基本のルールを確認します',
        onClick: function () {
          if (typeof V7Bridge !== 'undefined') {
            V7Bridge.openLegacy({ screen: 'howto', entryTab: 'other' });
          }
        }}));
      body.appendChild(V7Screen.listRow({ name: 'チュートリアル', desc: '基本編・応用編を遊びます',
        onClick: function () {
          if (typeof V7Bridge !== 'undefined') {
            V7Bridge.openLegacy({ screen: 'tutorial-select', entryTab: 'other' });
          }
        }}));
      body.appendChild(V7Screen.listRow({ name: '用語集', desc: 'ゲーム用語の意味を調べます',
        onClick: function () { V7Screen.open('glossary'); }}));
      body.appendChild(V7Screen.listRow({ name: 'よくある質問', desc: 'よくある疑問と答えを確認します',
        onClick: function () { V7Screen.open('faq'); }}));
    },
  },

  /* ---------- 用語集（第14部 14.3） ---------- */
  glossary: {
    title: '用語集',
    render: function (body) {
      const items = (typeof V7_GLOSSARY !== 'undefined') ? V7_GLOSSARY : [];
      body.appendChild(V7Screen.accordion(items, 'term', 'desc'));
    },
  },

  /* ---------- よくある質問（第14部 14.4） ---------- */
  faq: {
    title: 'よくある質問',
    render: function (body) {
      const items = (typeof V7_FAQ !== 'undefined') ? V7_FAQ : [];
      body.appendChild(V7Screen.accordion(items, 'q', 'a'));
    },
  },

  /* ---------- クレジット（第14部 14.5） ---------- */
  credits: {
    title: 'クレジット',
    render: function (body) {
      const items = (typeof V7_CREDITS !== 'undefined') ? V7_CREDITS : [];
      const wrap = document.createElement('div');
      wrap.className = 'v7-credits';
      const title = document.createElement('div');
      title.className = 'v7-credits__game';
      title.textContent = 'マヨイビト DCG';
      wrap.appendChild(title);
      items.forEach(function (c) {
        const row = document.createElement('div');
        row.className = 'v7-credits__row';
        const role = document.createElement('span');
        role.className = 'v7-credits__role';
        role.textContent = c.role;
        const nm = document.createElement('span');
        nm.className = 'v7-credits__name';
        nm.textContent = c.name;
        row.appendChild(role);
        row.appendChild(nm);
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
    },
  },
};

/* =====================================================================
   V7Screen の内部ヘルパー（タイル・コピー・データ操作）
   ===================================================================== */

/* 選択画面のタイル（準備中は暗め＋バッジ＋タップ可能：9.3） */
V7Screen._tile = function (label, opts) {
  opts = opts || {};
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'v7-tile'
    + (opts.big ? ' v7-tile--big' : '')
    + (opts.soon ? ' v7-tile--soon' : '');
  const labelEl = document.createElement('span');
  labelEl.className = 'v7-tile__label';
  labelEl.textContent = label;
  btn.appendChild(labelEl);
  if (opts.soon) {
    const badge = document.createElement('span');
    badge.className = 'v7-tile__badge';
    badge.textContent = '準備中';
    btn.appendChild(badge);
  }
  if (opts.onClick) btn.addEventListener('click', opts.onClick);
  return btn;
};

V7Screen._catClass = function (cat) {
  switch (cat) {
    case 'アップデート': return 'update';
    case '遊び方': return 'howto';
    case '重要': return 'important';
    case '開発情報': return 'dev';
    default: return 'update';
  }
};

/* ローカルIDのコピー（12.5） */
V7Screen._copyLocalId = function (id, idValEl) {
  const done = function (ok) {
    if (ok) {
      V7Screen.toast('ローカルIDをコピーしました');
    } else {
      V7Screen.toast('コピーできませんでした。IDを長押しで選択してください', { warn: true });
      // 選択しやすくする（12.5 失敗時）
      try {
        const range = document.createRange();
        range.selectNodeContents(idValEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
    }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(function () { done(true); },
        function () { done(false); });
      return;
    }
  } catch (e) {}
  // フォールバック（execCommand）
  try {
    const ta = document.createElement('textarea');
    ta.value = id;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    done(!!ok);
  } catch (e) {
    done(false);
  }
};

/* お気に入りカードの詳細（12.6）。既存のカード拡大詳細を流用する。
   既存 #card-detail は「閉じるボタンのみで閉じ、外側タップでは閉じない」
   ので、仕様 12.6 の要件（外側タップで閉じない）をそのまま満たす。
   閉じると（戻ると）プロフィールへ戻る。 */
V7Screen._openFavoriteCard = function () {
  const cardId = (typeof V7Save !== 'undefined' && V7Save.data && V7Save.data.profile
    && V7Save.data.profile.favoriteCardId) || 'mansion_elise';

  // 既存のカード詳細表示が使えれば、それを流用（本物の詳細）
  if (typeof CardListUI !== 'undefined' && CardListUI.openDetail
      && typeof CARD_MASTER !== 'undefined' && CARD_MASTER[cardId]) {
    CardListUI.openDetail(cardId);
    return;
  }

  // 流用できない環境（テスト等）では簡易フォールバック
  V7Dialog.open({
    title: '《屋敷の令嬢 エリーゼ》',
    body: 'お気に入りカードの詳細表示です。',
    buttons: [{ label: '閉じる', kind: 'primary' }],
    dismissable: true,
  });
};

/* データ書き出し（20.4）。Blob を作ってダウンロードさせる。 */
V7Screen._exportData = function () {
  try {
    const text = V7Save.exportText();
    const name = V7Save.exportFileName();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    V7Timers.set('export-revoke', function () { URL.revokeObjectURL(url); }, 1000);
    V7Screen.toast('データを書き出しました');
  } catch (e) {
    V7Screen.toast('データの書き出しに失敗しました', { warn: true });
  }
};

/* データ読み込み（20.5）：ファイル選択を促す */
V7Screen._importData = function () {
  const file = document.getElementById('v7-import-file');
  if (file) file.click();
};

V7Screen._onImportFile = function (fileInput) {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = function () {
    const text = String(reader.result || '');
    // 現データは変えずに確認ダイアログを出す（20.5 の 1〜4）。
    // 実際の検証・巻き戻しは importText 内部で行う（失敗時は現データ不変）。
    V7Dialog.confirm({
      title: 'データの読み込み',
      body: '現在のデータを上書きします。よろしいですか？',
      confirmLabel: '上書きする',
      cancelLabel: 'キャンセル',
      danger: true,
      onConfirm: function () {
        const res = V7Save.importText(text);
        if (res.ok) {
          // プロフィール表示など、必要な画面を再描画（20.5 の 7）
          if (typeof V7Hub !== 'undefined' && V7Hub.refreshProfile) V7Hub.refreshProfile();
          // 現在プロフィール画面ならその場を描き直す
          V7Screen._repaintCurrent();
          V7Screen.toast('データを読み込みました');
        } else {
          // 失敗時は現データ不変（importText が巻き戻す）
          V7Screen.toast('データを読み込めませんでした。ファイルを確認してください', { warn: true });
        }
      },
    });
  };
  reader.onerror = function () {
    V7Screen.toast('ファイルを読み取れませんでした', { warn: true });
  };
  reader.readAsText(f);
  // 同じファイルを再選択できるように値をクリア
  fileInput.value = '';
};

/* データ初期化（20.6）：二段階確認 */
V7Screen._resetData = function () {
  V7Dialog.confirm({
    title: 'データの初期化',
    body: 'すべてのデッキとプロフィールデータが削除されます。',
    confirmLabel: '次へ',
    cancelLabel: 'キャンセル',
    danger: true,
    onConfirm: function () {
      V7Dialog.confirm({
        title: 'データの初期化',
        body: 'この操作は取り消せません。本当に初期化しますか？',
        confirmLabel: '初期化する',
        cancelLabel: 'キャンセル',
        danger: true,
        onConfirm: function () {
          V7Save.reset();                        // 新しいローカルIDを再生成（20.6）
          if (typeof V7Hub !== 'undefined' && V7Hub.refreshProfile) V7Hub.refreshProfile();
          // ホームタブへ戻る（20.6）＋通知
          V7Screen.closeAll('home');
          V7Screen.toast('データを初期化しました');
        },
      });
    },
  });
};

/* いま表示中の個別画面をその場で描き直す（読み込み後の再描画用） */
V7Screen._repaintCurrent = function () {
  if (this._stack.length === 0) return;
  const top = this._stack[this._stack.length - 1];
  const def = this._def(top.key);
  if (!def) return;
  this._bodyEl.scrollTop = 0;
  this._bodyEl.innerHTML = '';
  def.render(this._bodyEl, top.data || null);
};

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V7Screen: V7Screen, V7Screens: V7Screens };
}
