/* =====================================================================
   v08-detail.js ― クイック表示と固定式カード詳細（Stage 2-3）
   ---------------------------------------------------------------------
   仕様書 第8部・第9部。

   V8Info   … カード1枚ぶんの情報を集める（読むだけ）
   V8Quick  … 画面左上へ固定する小さなパネル（短いタップ）
   V8Detail … 全画面の詳細（長押し。最大3階層）

   ★ゲーム状態は読むだけです。
   ===================================================================== */

'use strict';

/* =====================================================================
   カード1枚ぶんの情報
   ===================================================================== */
const V8Info = {

  ZONE_LABEL: {
    board: '場', hand: '手札', trash: 'トラッシュ',
    lost: 'ロスト', deck: '山札', field: 'フィールド',
  },

  /** uid からカードを探す。どの領域にあるかも返す */
  find: function (uid) {
    if (typeof Game === 'undefined' || !Game.state) return null;
    const key = String(uid);
    const st = Game.state;
    let hit = null;

    ['village', 'mansion'].forEach(function (side) {
      const p = st.players[side];
      if (!p || hit) return;
      const scan = function (list, zone) {
        (list || []).forEach(function (c) {
          if (!hit && c && String(c.uid) === key) hit = { inst: c, zone: zone, side: side };
        });
      };
      scan(p.humans, 'board');
      scan(p.youkai, 'board');
      /* 装備しているグッズも探せるようにする（詳細の関連カードから飛ぶため） */
      (p.humans || []).concat(p.youkai || []).forEach(function (c) {
        if (!hit && c && c.equippedGoods && String(c.equippedGoods.uid) === key) {
          hit = { inst: c.equippedGoods, zone: 'board', side: side };
        }
      });
      scan(p.hand, 'hand');
      scan(p.trash, 'trash');
      scan(p.lost, 'lost');
      scan(p.deck, 'deck');
      if (!hit && p.field && String(p.field.uid) === key) {
        hit = { inst: p.field, zone: 'field', side: side };
      }
    });
    return hit;
  },

  /**
   * 表示用にまとめる。
   * ★非公開の領域（山札・相手の手札）は中身を出しません（8.5）。
   */
  of: function (uid) {
    const found = this.find(uid);
    if (!found) return null;
    const inst = found.inst;
    const m = inst.master || (typeof CARD_MASTER !== 'undefined' ? CARD_MASTER[inst.cardId] : null);
    if (!m) return null;

    const hidden = (found.zone === 'deck') ||
      (found.zone === 'hand' && found.side !== this._mySide());

    const out = {
      uid: inst.uid,
      cardId: inst.cardId,
      side: inst.owner,
      zone: found.zone,
      zoneLabel: this.ZONE_LABEL[found.zone] || '',
      hidden: hidden,
      name: hidden ? '？？？' : m.name,
      cost: hidden ? null : m.cost,
      type: m.type,
      traits: hidden ? [] : (m.traits || []),
      effect: hidden ? '' : (m.effect || ''),
      hasStats: false,
      corrections: [],
      equip: null,
      tracking: false,
      trackRole: null,      // 'chasing'（追跡している）／'chased'（追跡されている）
    };
    if (hidden) return out;

    if (typeof Game !== 'undefined' && Game.getStats) {
      const s = Game.getStats(inst);
      if (s && s.hasStats) {
        out.hasStats = true;
        out.baseSpeed = s.baseSpeed;
        out.baseHp = s.baseHp;
        out.speed = Math.max(0, s.curSpeed);
        out.hp = Math.max(0, s.curHp);
        out.maxHp = s.maxHp;
        out.accum = s.accum || 0;
        out.corrections = s.corrections || [];
        out.tracking = !!s.tracking;
      }
    }
    out.trackRole = this.trackRoleOf(inst);
    if (out.trackRole) out.tracking = true;

    /* ★効果の条件の達成度（2026-08-01）。
       「トラッシュの〔村〕が5枚以上あるなら」のようなカードで、
       いま何枚あるのかを添えます。持たないカードでは空になります。 */
    out.conditions = (typeof V8Cond !== 'undefined')
      ? V8Cond.linesFor(inst.cardId, inst.owner) : [];

    if (inst.equippedGoods) {
      const g = inst.equippedGoods;
      out.equip = {
        uid: g.uid,
        cardId: g.cardId,
        name: (g.master && g.master.name) || '',
      };
    }
    return out;
  },

  _mySide: function () {
    return (typeof V8State !== 'undefined') ? V8State.bottomSide() : 'village';
  },

  /* =============================================================
     ★追跡の向き
     -------------------------------------------------------------
     Game.state.tracking[側] = { youkai, human } の形で、
       youkai … その側の怪異（追跡している側）
       human  … 相手の人間（追跡されている側）
     が入ります。どちらに一致するかで向きが決まります。
     ============================================================= */
  trackRoleOf: function (inst) {
    if (typeof Game === 'undefined' || !Game.state || !Game.state.tracking) return null;
    const tr = Game.state.tracking;
    let role = null;
    ['village', 'mansion'].forEach(function (side) {
      const t = tr[side];
      if (!t || role) return;
      if (t.youkai && t.youkai === inst) role = 'chasing';
      else if (t.human && t.human === inst) role = 'chased';
    });
    return role;
  },

  /** 状態の1行に出す文字 */
  trackLabel: function (info) {
    if (!info) return '';
    if (info.trackRole === 'chasing') return '追跡している';
    if (info.trackRole === 'chased') return '追跡されている';
    return '';
  },

  /* =============================================================
     ★カードIDだけで情報を作る（ログのカード名から開くとき・14.5）
     -------------------------------------------------------------
     ログには名前しか残っていません。そのときの能力値は控えていないので、
     出すのは「そのカード本来の情報」です。
     ============================================================= */
  ofCard: function (cardId) {
    const m = (typeof CARD_MASTER !== 'undefined') ? CARD_MASTER[cardId] : null;
    if (!m) return null;
    return {
      uid: null, cardId: cardId, side: null, zone: null, zoneLabel: '',
      hidden: false, name: m.name, cost: m.cost, type: m.type,
      traits: m.traits || [], effect: m.effect || '',
      hasStats: (typeof m.speed === 'number' && typeof m.hp === 'number'),
      baseSpeed: m.speed, baseHp: m.hp,
      speed: m.speed, hp: m.hp, maxHp: m.hp, accum: 0,
      corrections: [], equip: null, tracking: false, trackRole: null,
    };
  },

  /** 現在値の1行（例：スピード 5 / 体力 2 / 4） */
  statLine: function (info) {
    if (!info || !info.hasStats) return '';
    return 'スピード ' + info.speed + '　体力 ' + info.hp + ' / ' + info.maxHp;
  },
};

/* =====================================================================
   クイック表示（第8部）
   ===================================================================== */
const V8Quick = {

  uid: null,
  _root: null,
  _outside: null,

  init: function (rootEl) {
    this._root = rootEl;
    return this;
  },

  isOpen: function () { return this.uid !== null; },

  /** 同じカードをもう一度短くタップしたら閉じる（8.3） */
  toggle: function (uid) {
    if (String(this.uid) === String(uid)) { this.close(); return; }
    this.open(uid);
  },

  open: function (uid) {
    if (!this._root) return;
    /* ★固定式詳細とは同時に持ちません（8.6） */
    if (typeof V8Detail !== 'undefined' && V8Detail.isOpen()) V8Detail.close();

    const changed = String(this.uid) !== String(uid);
    this.uid = uid;
    this._root.classList.add('v8-quick-on');
    this.render(changed);
    this._watchOutside(true);
  },

  close: function () {
    /* ★状態を先に戻します。画面がまだ無いときに先頭で return すると、
       開いたままの状態が残り続けます。 */
    this.uid = null;
    this._watchOutside(false);
    if (this._root) this._root.classList.remove('v8-quick-on');
  },

  /** @param {boolean} resetScroll 別のカードを開いたときは先頭から（8.4） */
  render: function (resetScroll) {
    if (!this._root || this.uid === null) return;
    const box = this._root.querySelector('#v8-quick');
    if (!box) return;
    const info = V8Info.of(this.uid);
    if (!info) { this.close(); return; }

    const body = box.querySelector('#v8-quick-body');
    const nameEl = box.querySelector('#v8-quick-name');
    if (nameEl) nameEl.textContent = info.name;
    if (!body) return;

    const keep = body.scrollTop;
    body.innerHTML = '';
    const doc = document;
    const row = function (label, value, cls) {
      if (value === '' || value === null || value === undefined) return;
      const r = doc.createElement('div');
      r.className = 'v8-quick__row' + (cls ? ' ' + cls : '');
      const a = doc.createElement('span');
      a.className = 'v8-quick__label';
      a.textContent = label;
      const b = doc.createElement('span');
      b.className = 'v8-quick__value';
      b.textContent = String(value);
      r.appendChild(a); r.appendChild(b);
      body.appendChild(r);
    };

    if (info.hasStats) {
      row('スピード', info.speed);
      row('体力', info.hp + ' / ' + info.maxHp);
      if (info.accum > 0) row('受けたダメージ', info.accum);
    }
    if (info.equip) row('装備', info.equip.name);
    if (info.trackRole) row('状態', V8Info.trackLabel(info));
    if (info.traits && info.traits.length) row('特徴', info.traits.join('・'));

    /* ★効果の条件の達成度を、効果の文章より先に出します（2026-08-01）。
       出すかどうかを決めるのに要る情報なので、
       文章の下に置くと読み飛ばされます。 */
    (info.conditions || []).forEach(function (c) {
      row(c.label, c.value, 'v8-cond' + (c.ok ? ' v8-cond--ok' : ''));
    });

    if (info.effect) {
      const t = doc.createElement('p');
      t.className = 'v8-quick__text';
      t.textContent = info.effect;
      body.appendChild(t);
    }

    /* ★v0.10：起動型の能力（学校の切り札2・彫刻公園の壁の作品）を使うボタン。
       自分のメインフェイズで、自分の場の札のときだけ出ます */
    const abs = (typeof window !== 'undefined' && window.__v10AbilitiesOf) ? window.__v10AbilitiesOf(this.uid) : [];
    const uidNow = this.uid;
    abs.forEach(function (ab) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'v8-btn v8-quick__ability';
      btn.textContent = '能力：' + ab.label;
      btn.disabled = !ab.usable;
      btn.onclick = function (e) { e.stopPropagation(); window.__v10Activate(uidNow, ab.key); };
      body.appendChild(btn);
    });

    /* 同じカードの更新中は読んでいる位置を保つ（8.4） */
    body.scrollTop = resetScroll ? 0 : keep;
  },

  /* =============================================================
     ★パネルの外へ触れた最初の入力は「閉じるためだけ」に使う（8.3）
     -------------------------------------------------------------
     タップ・長押し・ドラッグ・ボタン、どれであっても
     本来の操作は行いません。閉じたあと、改めて操作します。
     ============================================================= */
  _watchOutside: function (on) {
    if (typeof document === 'undefined') return;
    const self = this;
    if (on) {
      if (this._outside) return;
      this._outside = function (e) {
        if (!self.isOpen()) return;
        const t = e.target;
        if (t && t.closest && t.closest('#v8-quick')) return;   // パネルの中は素通し

        /* ★手札の札だけは素通しにします（2026-08-01）。
           手札は「選ぶ／解く」を自分で持っていて、そこで
           この表示も開け閉めしています。ここで飲み込むと、
           ★1回目のタップでこの表示が閉じるだけで終わり、
             選択を解くのに2回押すことになっていました。 */
        if (t && t.closest && t.closest('.v8-hand__card')) return;

        self.close();
        /* 表示を閉じたなら、手札の選択も一緒に解きます。
           片方だけ残ると、持ち上がったまま中身が見えない札ができます。 */
        if (typeof V8Hand !== 'undefined' && V8Hand.clearSelection) V8Hand.clearSelection();
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('pointerdown', this._outside, true);
      return;
    }
    if (this._outside) {
      document.removeEventListener('pointerdown', this._outside, true);
      this._outside = null;
    }
  },
};

/* =====================================================================
   固定式カード詳細（第9部）
   ===================================================================== */
const V8Detail = {

  /** 見ているカードの履歴。最大3階層（9.4） */
  MAX_DEPTH: 3,
  stack: [],
  _root: null,
  _scroll: [],

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;
    const back = rootEl.querySelector('#v8-detail-back');
    const close = rootEl.querySelector('#v8-detail-close');
    if (back) back.onclick = function () { self.back(); };
    if (close) close.onclick = function () { self.close(); };
    return this;
  },

  isOpen: function () { return this.stack.length > 0; },

  /** カードIDだけで開く（ログのカード名から・14.5） */
  openCard: function (cardId) {
    this.open({ cardId: cardId });
  },

  open: function (uid) {
    if (!this._root) return;
    /* ★開いた時点でクイック表示は完全に閉じます（8.6） */
    if (typeof V8Quick !== 'undefined' && V8Quick.isOpen()) V8Quick.close();
    this.stack = [uid];
    this._scroll = [0];
    this._root.classList.add('v8-detail-on');
    this.render();
  },

  /** 関連カードへ進む（9.4：最大3階層） */
  push: function (uid) {
    if (!this.isOpen()) { this.open(uid); return; }
    if (this.stack.length >= this.MAX_DEPTH) return;
    this._saveScroll();
    this.stack.push(uid);
    this._scroll.push(0);
    this.render();
  },

  back: function () {
    if (this.stack.length <= 1) { this.close(); return; }
    this.stack.pop();
    this._scroll.pop();
    this.render();
  },

  close: function () {
    /* ★状態を先に戻します（上と同じ理由） */
    this.stack = [];
    this._scroll = [];
    if (this._root) this._root.classList.remove('v8-detail-on');
  },

  _saveScroll: function () {
    const body = this._root && this._root.querySelector('#v8-detail-body');
    if (body) this._scroll[this.stack.length - 1] = body.scrollTop;
  },

  render: function () {
    if (!this._root || !this.isOpen()) return;
    const key = this.stack[this.stack.length - 1];
    const info = (key && key.cardId !== undefined)
      ? V8Info.ofCard(key.cardId) : V8Info.of(key);
    if (!info) { this.close(); return; }

    const doc = document;
    const body = this._root.querySelector('#v8-detail-body');
    const back = this._root.querySelector('#v8-detail-back');
    /* 1階層目では戻るを出さない（9.4） */
    if (back) back.style.visibility = (this.stack.length > 1) ? 'visible' : 'hidden';
    if (!body) return;
    body.innerHTML = '';

    /* 1. カード画像。画面と一緒にスクロールする（9.1） */
    const img = doc.createElement('div');
    img.className = 'v8-detail__img';
    const path = (typeof getCardImagePath === 'function' && !info.hidden)
      ? getCardImagePath(info.cardId, info.side) : '';
    if (typeof V8Images !== 'undefined') V8Images.apply(img, path);
    else if (path) img.style.backgroundImage = 'url("' + path + '")';
    body.appendChild(img);

    const h = doc.createElement('h3');
    h.className = 'v8-detail__name';
    h.textContent = info.name;
    body.appendChild(h);

    const sec = function (title) {
      const s = doc.createElement('div');
      s.className = 'v8-detail__sec';
      const t = doc.createElement('h4');
      t.className = 'v8-detail__sectitle';
      t.textContent = title;
      s.appendChild(t);
      body.appendChild(s);
      return s;
    };
    const line = function (parent, label, value, cls) {
      if (value === '' || value === null || value === undefined) return;
      const r = doc.createElement('div');
      r.className = 'v8-detail__row' + (cls ? ' ' + cls : '');
      const a = doc.createElement('span'); a.textContent = label;
      const b = doc.createElement('span'); b.className = 'v8-detail__val'; b.textContent = String(value);
      r.appendChild(a); r.appendChild(b);
      parent.appendChild(r);
      return r;
    };

    /* ★並び順はダロクの指定どおり
         カード種類 → コスト → 現在スピード → 現在体力 → 補正 → 特徴 → 効果
       ダメージ・装備・追跡は指定に無いので、関係の近いところへ挟んでいます。 */
    const s1 = sec('カードの情報');

    line(s1, '種類', ({ human: '人間', youkai: '怪異', goods: 'グッズ',
      event: 'イベント', field: 'フィールド' })[info.type] || info.type);
    if (info.cost !== null && info.cost !== undefined) line(s1, 'コスト', info.cost);

    if (info.hasStats) {
      line(s1, 'スピード', info.speed);
      line(s1, '体力', info.hp + ' / ' + info.maxHp);
      if (info.accum > 0) line(s1, '受けたダメージ', info.accum);

      /* 補正。基礎値と内訳を最初から開いた状態で出す（9.2） */
      const dS = info.speed - info.baseSpeed;
      const dH = info.maxHp - info.baseHp;
      if (dS === 0 && dH === 0 && !(info.corrections || []).length) {
        line(s1, '補正', 'なし');
      } else {
        if (dS !== 0) {
          line(s1, '補正（スピード）',
            '基礎 ' + info.baseSpeed + ' ' + (dS > 0 ? '+' : '') + dS + ' → ' + info.speed,
            dS > 0 ? 'v8-detail__row--up' : 'v8-detail__row--down');
        }
        if (dH !== 0) {
          line(s1, '補正（体力）',
            '基礎 ' + info.baseHp + ' ' + (dH > 0 ? '+' : '') + dH + ' → ' + info.maxHp,
            dH > 0 ? 'v8-detail__row--up' : 'v8-detail__row--down');
        }
        (info.corrections || []).forEach(function (n) { line(s1, '内訳', n); });
      }
    }

    if (info.equip) line(s1, '装備', info.equip.name);
    if (info.trackRole) line(s1, '状態', V8Info.trackLabel(info));
    if (info.traits && info.traits.length) line(s1, '特徴', info.traits.join('・'));

    /* 効果 */
    if (info.effect || (info.conditions || []).length) {
      const s4 = sec('効果');

      /* ★条件の達成度を、いちばん上に出します（2026-08-01）。
         出すかどうかを決めるのに要る情報なので、
         文章の下に置くと読み飛ばされます。 */
      (info.conditions || []).forEach(function (c) {
        const r = line(s4, c.label, c.value);
        if (r) r.classList.add('v8-cond', c.ok ? 'v8-cond--ok' : 'v8-cond--ng');
      });

      if (info.effect) {
        const p = doc.createElement('p');
        p.className = 'v8-detail__text';
        p.textContent = info.effect;
        s4.appendChild(p);
      }
    }

    /* 関連カード。3階層目では先へのリンクを出さない（9.4） */
    if (info.equip) {
      const s5 = sec('関連するカード');
      const r = line(s5, '装備', info.equip.name);
      if (r && this.stack.length < this.MAX_DEPTH) {
        r.classList.add('v8-detail__row--link');
        const self = this;
        r.onclick = function () { self.push(info.equip.uid); };
      }
    }

    body.scrollTop = this._scroll[this.stack.length - 1] || 0;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Info: V8Info, V8Quick: V8Quick, V8Detail: V8Detail };
}
