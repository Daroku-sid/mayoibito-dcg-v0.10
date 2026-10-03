/* =====================================================================
   v08-zones.js ― 公開領域の画面（Stage 4-1）
   ---------------------------------------------------------------------
   仕様書 第11部（トラッシュ）・第12部（ロスト）・第13部（山札からN枚）。

   3つとも「対戦盤面の上へ重ねて見る」画面です。見た目は2種類あります。

     一覧パネル型 … トラッシュ。横4列・縦スクロール・枠外は暗転
     演出型       … ロストと「山札からN枚」。枠を作らず、黒の中へ
                    カードを浮かび上がらせる

   ★ゲーム状態は触りません。
     カードを選ぶ効果では、選び方（番号・上限・確定）を V8Target に任せます。
   ===================================================================== */

'use strict';

const V8Zones = {

  /** 'trash' / 'lost' / 'pick' / null */
  mode: null,

  _root: null,
  _cb: null,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;

    /* 枠外タップで閉じる（11.1・12.1）。
       ★その入力は閉じるためだけに使い、背後は操作しません。 */
    const scrim = rootEl.querySelector('#v8-zone-scrim');
    if (scrim) {
      scrim.addEventListener('pointerdown', function (e) {
        if (self.mode === 'pick') return;   // 選んでいる最中は勝手に閉じない
        self.close();
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }

    /* ★カード以外のどこを触っても閉じます（2026-08-01）。

       ロストの一覧は枠を持たず、カードを画面の真ん中へ並べます。
       ★カードの周りの余白は一覧そのものの領域なので、暗転の幕には
         当たりません。閉じるつもりで触っても何も起きず、
         幕の細い縁を狙う羽目になっていました。

       カードだけは素通しにします。長押しで詳細を開くためです。
       選んでいる最中（pick）は、勝手に閉じません。 */
    const box = rootEl.querySelector('#v8-zone');
    if (box) {
      box.addEventListener('pointerdown', function (e) {
        if (self.mode === 'pick') return;
        const t = e.target;
        if (t && t.closest && t.closest('.v8-zone__card')) return;
        if (t && t.closest && t.closest('.v8-zone__foot')) return;
        self.close();
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }

    const done = rootEl.querySelector('#v8-zone-confirm');
    if (done) done.onclick = function () { self._confirm(); };
    return this;
  },

  isOpen: function () { return this.mode !== null; },

  /* =============================================================
     トラッシュ（第11部）
     ============================================================= */
  openTrash: function (side) {
    const p = this._playerOf(side);
    if (!p) return;
    const me = (typeof V8State !== 'undefined') ? V8State.bottomSide() : 'village';
    const label = (side === me) ? '自分のトラッシュ' : '相手のトラッシュ';
    this._open('trash', {
      title: label + '　' + (p.trash || []).length + '枚',
      cards: (p.trash || []).slice(),     // ★置かれた順のまま。新しいものが末尾（11.3）
    });
  },

  /* =============================================================
     ★v0.10：除外ゾーン（村の除外軸など）。見るだけ
     ============================================================= */
  openExile: function (side) {
    const p = this._playerOf(side);
    if (!p) return;
    const me = (typeof V8State !== 'undefined') ? V8State.bottomSide() : 'village';
    this._open('trash', {
      title: ((side === me) ? '自分' : '相手') + 'の除外ゾーン　' + (p.exile || []).length + '枚',
      cards: (p.exile || []).slice(),
    });
  },

  /* =============================================================
     ロストゾーン（第12部）
     ============================================================= */
  openLost: function (side) {
    const p = this._playerOf(side);
    if (!p) return;
    const max = (p.field && p.field.master && p.field.master.lostLimit !== undefined)
      ? p.field.master.lostLimit : '-';
    this._open('lost', {
      title: 'ロストゾーン　' + (p.lost || []).length + ' / ' + max,
      cards: (p.lost || []).slice(),      // ロストへ送られた順のまま（12.2）
    });
  },

  /* =============================================================
     カードを選ぶ（第13部・第11部11.4）
     -------------------------------------------------------------
     既存の openCardPicker から渡されます。
     @return {boolean} 引き受けたかどうか
     ============================================================= */
  openPick: function (options, cb) {
    if (!this._root || !options || !options.cards || !options.cards.length) return false;

    this._cb = cb;
    /* ★v0.10：選んだ札は、渡された札の中から uid で引き直す。
       「山札の上から3枚を見る」などの札は、盤面にも手札にも無いので、
       盤面を探す V8Info.find では見つからず、選んだのに空で返っていた */
    this._pool = options.cards.slice();
    this._open('pick', {
      title: [options.title, options.message].filter(Boolean).join('　'),
      cards: options.cards.slice(),
      selectable: options.selectable || null,
      count: options.count,
      mode: options.mode,
    });
    return true;
  },

  _open: function (mode, opt) {
    if (!this._root) return;
    this.mode = mode;
    this._root.classList.add('v8-zone-on');
    this._root.setAttribute('data-zone', mode);

    const box = this._root.querySelector('#v8-zone');
    const title = this._root.querySelector('#v8-zone-title');
    const list = this._root.querySelector('#v8-zone-list');
    if (title) title.textContent = opt.title || '';
    if (!list) return;

    list.innerHTML = '';
    list.scrollTop = 0;                   // 対象選択のときは上端から（11.3）
    const doc = document;
    const self = this;

    (opt.cards || []).forEach(function (inst) {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = 'v8-zone__card';
      el.setAttribute('data-uid', String(inst.uid));
      el.setAttribute('data-card-id', inst.cardId || '');
      const m = inst.master || (typeof CARD_MASTER !== 'undefined' ? CARD_MASTER[inst.cardId] : null);
      el.setAttribute('aria-label', (m && m.name) || '');
      const path = (typeof getCardImagePath === 'function')
        ? getCardImagePath(inst.cardId, inst.owner) : '';
      if (typeof V8Images !== 'undefined') V8Images.apply(el, path);

      /* 通常の閲覧では、短いタップでは何もしません（11.4・12.3・13.3）。
         長押しで固定式カード詳細を開きます。 */
      if (typeof V8Input !== 'undefined') {
        V8Input.attach(el, {
          onTap: function () {
            if (self.mode === 'pick' && typeof V8Target !== 'undefined') {
              V8Target.tap(inst.uid);
              self._syncConfirm();
            }
          },
          onLongPress: function () {
            if (typeof V8Detail !== 'undefined') V8Detail.open(inst.uid);
          },
        });
      }
      list.appendChild(el);
    });

    /* 選ぶときだけ、選び方を V8Target に任せます（番号・上限・確定は第7部） */
    if (mode === 'pick' && typeof V8Target !== 'undefined') {
      const cands = (opt.selectable || opt.cards);
      V8Target.open({
        candidates: cands,
        count: opt.count,
        optional: (opt.mode === 'max'),   // 「最大N枚」は0枚でもよい（7.6）
        title: opt.title,
      }, function () { /* 確定はこの画面のボタンで受けます */ });
      V8Target.refresh();
    }
    this._syncConfirm();
  },

  _syncConfirm: function () {
    if (!this._root) return;
    const bar = this._root.querySelector('#v8-zone-foot');
    const btn = this._root.querySelector('#v8-zone-confirm');
    const prog = this._root.querySelector('#v8-zone-progress');
    const picking = (this.mode === 'pick') && (typeof V8Target !== 'undefined') && V8Target.active;
    if (bar) bar.style.display = picking ? 'flex' : 'none';
    if (!picking) return;
    if (btn) btn.textContent = V8Target.mainLabel();
    if (prog) prog.textContent = V8Target.progress();
    if (typeof V8Target !== 'undefined') V8Target.refresh();
  },

  _confirm: function () {
    if (this.mode !== 'pick' || typeof V8Target === 'undefined') return;
    if (!V8Target.canConfirm()) {
      if (typeof V7Toast !== 'undefined') V7Toast.push('対象を選んでください', { dedupe: true });
      return;
    }
    /* ★チュートリアル中は、台本がそこまで進んでいるときだけ押せます（v0.9）。
       チュートリアル以外では、いつでも true が返ります。 */
    if (typeof window !== 'undefined' && window.__v8PickConfirmAllow &&
        !window.__v8PickConfirmAllow(V8Target.chosen.length)) return;
    const uids = V8Target.chosen.slice();
    const cb = this._cb;
    V8Target.close();
    this.close();
    if (cb) {
      const pool = this._pool || [];
      const found = uids.map(function (u) {
        for (let i = 0; i < pool.length; i++) if (String(pool[i].uid) === String(u)) return pool[i];
        const f = (typeof V8Info !== 'undefined') ? V8Info.find(u) : null;
        return f ? f.inst : null;
      }).filter(Boolean);
      cb(found);
    }
  },

  close: function () {
    this.mode = null;
    this._cb = null;
    this._pool = null;
    if (typeof V8Target !== 'undefined' && V8Target.active) V8Target.close();
    if (!this._root) return;
    this._root.classList.remove('v8-zone-on');
    this._root.removeAttribute('data-zone');
  },

  _playerOf: function (side) {
    if (typeof Game === 'undefined' || !Game.state) return null;
    return Game.state.players[side] || null;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Zones: V8Zones };
}
