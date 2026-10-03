/* =====================================================================
   deck-list-ui.js  ―  デッキ一覧とデッキ確認（v0.4 仕様書 11・13・30.4）
   ---------------------------------------------------------------------
   ・一覧：公式2つを上に固定し、その下に自作デッキを2列で並べる
   ・確認：40枚を8×5で並べ、枚数配分と操作ボタンを出す

   軽さのための決めごと（カード一覧と同じ）:
     並べる画像はサムネイル。拡大詳細だけ元画像を使います。
   ===================================================================== */

'use strict';

const DeckListUI = {

  /* いま見ているデッキ（デッキ確認画面で使う） */
  viewing: null,

  built: false,

  build: function () {
    if (this.built) return;
    this.built = true;
    const self = this;

    const add = document.getElementById('decklist-add');
    if (add) {
      add.addEventListener('click', function () {
        Se.play('button');
        self.createNew();
      });
    }

    [['deckview-copy', function () { self.copyViewing(); }],
     ['deckview-delete', function () { self.deleteViewing(); }],
     ['deckview-image', function () { self.saveImage(); }],
     ['deckview-edit', function () { self.editViewing(); }],
    ].forEach(function (pair) {
      const el = document.getElementById(pair[0]);
      if (el) el.addEventListener('click', function () { Se.play('button'); pair[1](); });
    });
  },

  /* =============================================================
     デッキ一覧（仕様書 11）
     ============================================================= */
  renderList: function () {
    const box = document.getElementById('decklist-grid');
    if (!box) return;
    box.innerHTML = '';

    const self = this;
    DeckManager.allDecks().forEach(function (deck) {
      box.appendChild(self.makeDeckCard(deck));
    });

    // 上限に達したら「デッキ作成」を止めて理由を出す（仕様書 11.3）
    const add = document.getElementById('decklist-add');
    const note = document.getElementById('decklist-note');
    const full = !DeckManager.canAddMore();
    if (add) {
      add.disabled = full;
      add.classList.toggle('is-off', full);
    }
    if (note) {
      note.textContent = full ? '自作デッキの保存数が上限に達しています。' : '';
      note.classList.toggle('is-on', full);
    }

    const count = document.getElementById('decklist-count');
    if (count) {
      count.textContent = '自作 ' + DeckManager.customDecks().length +
        ' / ' + DeckManager.MAX_CUSTOM;
    }
  },

  /** 一覧に並ぶデッキ1個ぶん（仕様書 11.4） */
  makeDeckCard: function (deck) {
    const result = DeckValidator.check(deck);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dcard' + (result.usable ? '' : ' dcard--unusable');
    card.dataset.deckId = deck.id;

    // 名前と、公式か自作か
    const head = document.createElement('div');
    head.className = 'dcard__head';
    const name = document.createElement('span');
    name.className = 'dcard__name';
    name.textContent = deck.name;
    head.appendChild(name);
    const kind = document.createElement('span');
    kind.className = 'dcard__kind';
    kind.textContent = deck.official ? '公式' : '自作';
    head.appendChild(kind);
    card.appendChild(head);

    // 戦術ラベル（公式のみ）と枚数
    const meta = document.createElement('div');
    meta.className = 'dcard__meta';
    const tactics = document.createElement('span');
    tactics.className = 'dcard__tactics';
    tactics.textContent = deck.official ? (deck.tactics || '公式デッキ') : '自作デッキ';
    meta.appendChild(tactics);
    const num = document.createElement('span');
    num.className = 'dcard__num';
    num.textContent = result.total + ' / ' + DeckValidator.MAIN_DECK_SIZE + '枚';
    meta.appendChild(num);
    card.appendChild(meta);

    // 代表カードとフィールド
    const arts = document.createElement('div');
    arts.className = 'dcard__arts';
    arts.appendChild(this.thumb(DeckManager.faceCardOf(deck), 'dcard__ace'));
    arts.appendChild(this.thumb(deck.fieldId, 'dcard__field'));
    card.appendChild(arts);

    // 最終更新日時（公式デッキには出さない）
    const stamp = DeckManager.updatedText(deck);
    if (stamp) {
      const time = document.createElement('div');
      time.className = 'dcard__time';
      time.textContent = '更新 ' + stamp;
      card.appendChild(time);
    }

    // 使えるかどうか（仕様書 11.5）
    const state = document.createElement('div');
    state.className = 'dcard__state';
    state.textContent = result.usable ? '使用可能' : DeckValidator.shortReason(result);
    card.appendChild(state);
    if (!result.usable) {
      const tag = document.createElement('span');
      tag.className = 'dcard__tag';
      tag.textContent = '使用不可';
      card.appendChild(tag);
    }

    const self = this;
    card.addEventListener('click', function () {
      Se.play('button');
      self.openView(deck.id);
    });
    return card;
  },

  /** サムネイル画像の要素。無ければ空の枠を返す */
  thumb: function (cardId, className) {
    const wrap = document.createElement('div');
    wrap.className = className;
    if (!cardId || !CARD_MASTER[cardId]) {
      wrap.classList.add('is-empty');
      return wrap;
    }
    const m = CARD_MASTER[cardId];
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = m.name;
    const p = getCardThumbPath(cardId, m.faction);
    if (p) img.src = p;
    img.addEventListener('error', function () {
      wrap.classList.add('is-empty');
      img.remove();
    });
    wrap.appendChild(img);
    return wrap;
  },

  /* =============================================================
     デッキ確認（仕様書 13）
     ============================================================= */
  openView: function (deckId) {
    this.viewing = DeckManager.byId(deckId);
    if (!this.viewing) return;
    Screens.go('deck-view');
  },

  renderView: function () {
    // 編成から戻ってきたときは、保存された最新の中身を読み直します
    if (this.viewing) {
      const latest = DeckManager.byId(this.viewing.id);
      if (latest) this.viewing = latest;
    }
    const deck = this.viewing;
    if (!deck) return;
    const result = DeckValidator.check(deck);

    const title = document.getElementById('deckview-title');
    if (title) title.textContent = deck.name;

    // フィールド
    const field = document.getElementById('deckview-field');
    if (field) {
      field.innerHTML = '';
      field.appendChild(this.thumb(deck.fieldId, 'dview__fieldimg'));
    }

    // 最終更新日時
    const stampBox = document.getElementById('deckview-time');
    if (stampBox) {
      const stamp = DeckManager.updatedText(deck);
      stampBox.textContent = stamp ? '最終更新 ' + stamp : '公式デッキ';
    }

    // 枚数配分（仕様書 13.4）
    const info = document.getElementById('deckview-counts');
    if (info) {
      const c = result.counts;
      const rows = [
        ['人間', c.human], ['怪異', c.youkai],
        ['グッズ', c.goods], ['イベント', c.event],
        ['合計', result.total + ' / ' + DeckValidator.MAIN_DECK_SIZE],
      ];
      info.innerHTML = '';
      rows.forEach(function (r) {
        const item = document.createElement('div');
        item.className = 'dview__count' + (r[0] === '合計' ? ' dview__count--total' : '');
        item.innerHTML = '<span class="dview__ckey"></span><span class="dview__cval"></span>';
        item.querySelector('.dview__ckey').textContent = r[0];
        item.querySelector('.dview__cval').textContent = r[1];
        info.appendChild(item);
      });
    }

    // 使えない理由をすべて出す（仕様書 11.5）
    const probs = document.getElementById('deckview-problems');
    if (probs) {
      probs.innerHTML = '';
      probs.classList.toggle('is-on', !result.usable);
      if (!result.usable) {
        const h = document.createElement('div');
        h.className = 'dview__phead ui-alert__title';
        h.textContent = 'このデッキは対戦で使えません';
        probs.appendChild(h);
        result.problems.forEach(function (t) {
          const li = document.createElement('div');
          li.className = 'dview__pitem ui-alert__item';
          li.textContent = '・' + t;
          probs.appendChild(li);
        });
      }
    }

    // 40枚（仕様書 13.2）
    const grid = document.getElementById('deckview-grid');
    if (grid) {
      grid.innerHTML = '';
      const ids = DeckManager.expand(deck);
      const self = this;
      ids.forEach(function (cardId) {
        const cell = self.thumb(cardId, 'dview__card');
        cell.addEventListener('click', function () {
          Se.play('button');
          CardListUI.openDetail(cardId);
        });
        grid.appendChild(cell);
      });
      // 足りないぶんは空き枠（仕様書 13.2）
      for (let i = ids.length; i < DeckValidator.MAIN_DECK_SIZE; i++) {
        const empty = document.createElement('div');
        empty.className = 'dview__card is-blank';
        grid.appendChild(empty);
      }
    }

    // 操作ボタン（仕様書 13.5・13.6）
    const editable = DeckManager.isEditable(deck);
    ['deckview-edit', 'deckview-delete'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.style.display = editable ? '' : 'none';
    });
  },

  /* =============================================================
     操作
     ============================================================= */
  createNew: function () {
    const r = DeckManager.create(null, '新しいデッキ');
    if (!r.ok) { showToast(r.reason); return; }
    this.renderList();
    // 作ったらそのまま編成へ進みます（作るだけで終わることはないため）
    DeckEditorUI.open(r.deck.id, true);
  },

  copyViewing: function () {
    const r = DeckManager.copy(this.viewing);
    if (!r.ok) { showToast(r.reason); return; }
    showToast('「' + r.deck.name + '」を作成しました。');
    this.viewing = r.deck;
    this.renderView();
  },

  editViewing: function () {
    if (!this.viewing || !DeckManager.isEditable(this.viewing)) return;
    DeckEditorUI.open(this.viewing.id, false);
  },

  deleteViewing: function () {
    const deck = this.viewing;
    if (!deck || !DeckManager.isEditable(deck)) return;
    const self = this;
    showDialog({
      title: 'このデッキを削除しますか？',
      message: 'この操作は元に戻せません。',
      buttons: [
        { label: 'やめる' },
        {
          label: '削除する', primary: true,
          onClick: function () {
            const r = DeckManager.remove(deck.id);
            if (!r.ok) { showToast(r.reason); return; }
            self.viewing = null;
            Screens.back();
            self.renderList();
            showToast('デッキを削除しました。');
          },
        },
      ],
    });
  },

  /* =============================================================
     デッキ画像の書き出し（仕様書 14）
     -------------------------------------------------------------
     元画像(744×1039)を40枚並べると 6000×5200 相当のCanvasになり、
     スマホでは作れないことがあります。サムネイルの大きさで描きます。
     ============================================================= */
  saveImage: function () {
    const deck = this.viewing;
    if (!deck) return;

    const CW = 124, CH = 173, GAP = 6;       // 1枚の大きさ（サムネイルの半分）
    const COLS = 8, ROWS = 5;
    const PAD = 28;
    const HEAD = 150;

    const w = PAD * 2 + COLS * CW + (COLS - 1) * GAP;
    const h = HEAD + PAD + ROWS * CH + (ROWS - 1) * GAP + PAD + 46;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { showToast('この端末では画像を作れませんでした。'); return; }

    ctx.fillStyle = '#0d1220';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#eef4ff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(deck.name, PAD, 52);

    const result = DeckValidator.check(deck);
    ctx.fillStyle = '#93a7c6';
    ctx.font = '22px sans-serif';
    const c = result.counts;
    ctx.fillText('人間' + c.human + '／怪異' + c.youkai + '／グッズ' + c.goods +
                 '／イベント' + c.event + '　合計' + result.total + '枚', PAD, 92);
    const fieldName = deck.fieldId && CARD_MASTER[deck.fieldId]
      ? CARD_MASTER[deck.fieldId].name : '未設定';
    ctx.fillText('フィールド：' + fieldName, PAD, 126);

    ctx.fillStyle = '#5b6d8c';
    ctx.font = '20px sans-serif';
    ctx.fillText(APP_TITLE + ' ' + APP_VERSION_LABEL, PAD, h - 22);

    const ids = DeckManager.expand(deck);
    const self = this;
    let done = 0;
    const total = ids.length;

    const finish = function () {
      try {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = self.imageFileName(deck);
        a.click();
        showToast('デッキ画像を書き出しました。');
      } catch (e) {
        showToast('画像の書き出しに失敗しました。');
      }
    };

    if (total === 0) { finish(); return; }

    ids.forEach(function (cardId, i) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = PAD + col * (CW + GAP);
      const y = HEAD + row * (CH + GAP);

      const m = CARD_MASTER[cardId];
      const img = new Image();
      const step = function () {
        done += 1;
        if (done >= total) finish();
      };
      img.onload = function () {
        ctx.drawImage(img, x, y, CW, CH);
        step();
      };
      img.onerror = function () {
        // 読めなかったカードは枠と名前で埋める
        ctx.fillStyle = '#1d2740';
        ctx.fillRect(x, y, CW, CH);
        ctx.fillStyle = '#cfe0ff';
        ctx.font = '14px sans-serif';
        ctx.fillText(m.name.slice(0, 6), x + 6, y + CH / 2);
        step();
      };
      img.src = getCardThumbPath(cardId, m.faction) || '';
    });
  },

  imageFileName: function (deck) {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    const safe = String(deck.name).replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 16);
    return 'マヨイビト_' + safe + '_' +
      d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.png';
  },
};
