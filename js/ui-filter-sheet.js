/* =====================================================================
   ui-filter-sheet.js ― 絞り込みの板（v0.9・共通部品）
   ---------------------------------------------------------------------
   カード一覧で作った形を、そのまま他の画面でも使えるようにしたものです。

     ふだん   [ カード名で探す        ] [≡]
              ↓ [≡] を押す
     板がせり上がる
       特徴で探す
       種類 / コスト / 並び
       ────────────────
       [ リセット ] [   絞り込み   ]

   ---------------------------------------------------------------------
   ★いちばん大事なところ
   ---------------------------------------------------------------------
   ★板の中で選んでいるあいだは、まだ効かせません。

     押すたびに一覧が動くと、いくつも選ぶ途中で
     「いま何が見えているのか」が分からなくなります。
     「絞り込み」を押したところで、まとめて効かせます。

   ---------------------------------------------------------------------
   ★決めごと
   ---------------------------------------------------------------------
   ・閉じただけ（[≡]の再押下・板の外を触る）なら、選びかけを捨てる
     → 「絞り込み」を押していないので、効くほうが驚きになります
   ・リセットは選びかけを消すだけ。板は開いたまま
     → ここで閉じると、消したあと選び直すのに開き直すことになります
   ・[≡] に「いくつ絞り込んでいるか」を出す
     → ★板を下ろすと条件が見えなくなるので、これが無いと
       「なぜ少ししか出ていないのか」が分からなくなります
   ・検索欄だけは打つたびに即反映
     → ここは「探す」操作なので、結果がすぐ動いたほうが分かります

   ---------------------------------------------------------------------
   使い方
   ---------------------------------------------------------------------
     UiFilterSheet.create({
       scope: '#screen-deck-edit',   // どの画面の中を見るか
       ids: { panel, scrim, toggle, badge, reset, apply, trait },
       get: function () { return { conditions, sortMode }; },
       set: function (conditions, sortMode) { ... },   // 確定したとき
       onApply: function () { ... },                   // 一覧を描き直す
     });
   ===================================================================== */

'use strict';

const UiFilterSheet = {

  create: function (opt) {
    const sheet = Object.create(this._proto);
    sheet.opt = opt || {};
    sheet.ids = sheet.opt.ids || {};
    sheet.draft = null;
    sheet.build();
    return sheet;
  },

  _proto: {

    el: function (key) {
      const id = this.ids[key];
      return id ? document.getElementById(id) : null;
    },

    each: function (attr, fn) {
      const scope = this.opt.scope || 'body';
      document.querySelectorAll(scope + ' [' + attr + ']').forEach(fn);
    },

    build: function () {
      const self = this;

      const toggle = this.el('toggle');
      if (toggle) toggle.addEventListener('click', function () { self.toggle(); });

      const scrim = this.el('scrim');
      if (scrim) scrim.addEventListener('click', function () { self.close(); });

      const trait = this.el('trait');
      if (trait) {
        trait.addEventListener('input', function () {
          if (self.draft) self.draft.trait = trait.value;
        });
      }

      this.each('data-filter', function (btn) {
        btn.addEventListener('click', function () {
          self.toggleValue(btn.dataset.filter, btn.dataset.val);
          self.paint();
        });
      });
      this.each('data-sort', function (btn) {
        btn.addEventListener('click', function () {
          if (self.draft) self.draft.sortMode = btn.dataset.sort;
          /* ★並びは1つだけ選ぶ条件なので、選んだらその行を閉じます。
             いくつでも選べる種類・コストは、開いたままにします。 */
          self.closeDrops();
          self.paint();
        });
      });

      /* ★押すと開く行。種類・コスト・並びの3つとも同じ形です。
         ★開いた中身は下へ重ねて出します（CSS）。
           板の中に押し込むと、板が伸びて上の行までせり上がります。 */
      this.each('data-drop-group', function (drop) {
        const head = drop.querySelector('.ui-drop__head');
        if (!head) return;
        head.addEventListener('click', function () {
          const open = !drop.classList.contains('is-open');
          /* ★同時に開くのは1つだけ。重ねて出すので、
             2つ開くと下の行の中身が隠れます。 */
          self.closeDrops();
          if (open) {
            drop.classList.add('is-open');
            head.setAttribute('aria-expanded', 'true');
          }
        });
      });

      const reset = this.el('reset');
      if (reset) {
        reset.addEventListener('click', function () {
          if (!self.draft) return;
          self.draft.trait = '';
          self.draft.types = [];
          self.draft.costs = [];
          self.draft.sortMode = 'default';
          const t = self.el('trait');
          if (t) t.value = '';
          self.paint();
        });
      }

      const apply = this.el('apply');
      if (apply) apply.addEventListener('click', function () { self.apply(); });

      this.paint();
    },

    /** 絞り込みの入り切り。★選びかけ（draft）だけを触ります */
    toggleValue: function (kind, value) {
      const key = { type: 'types', cost: 'costs' }[kind];
      if (!key || !this.draft) return;
      const v = (kind === 'cost') ? Number(value) : value;
      const list = this.draft[key];
      const i = list.indexOf(v);
      if (i === -1) list.push(v); else list.splice(i, 1);
    },

    /** 開いている行をすべて閉じる */
    closeDrops: function () {
      this.each('data-drop-group', function (drop) {
        drop.classList.remove('is-open');
        const head = drop.querySelector('.ui-drop__head');
        if (head) head.setAttribute('aria-expanded', 'false');
      });
    },

    toggle: function () { if (this.draft) this.close(); else this.open(); },

    open: function () {
      const now = this.opt.get();
      /* ★いまの条件を写してから開きます。
         ここを共有にすると、閉じただけで効いてしまいます。 */
      this.draft = {
        trait: now.conditions.trait,
        types: now.conditions.types.slice(),
        costs: now.conditions.costs.slice(),
        sortMode: now.sortMode,
      };
      const t = this.el('trait');
      if (t) t.value = this.draft.trait;

      const panel = this.el('panel');
      if (panel && panel.parentNode) panel.parentNode.classList.add('is-open');
      const toggle = this.el('toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      this.paint();
    },

    /** ★選びかけを捨てて閉じます（効かせません） */
    close: function () {
      this.draft = null;
      /* ★開いたままの行を残すと、次に開いたときに出しっぱなしになります */
      this.closeDrops();
      const panel = this.el('panel');
      if (panel && panel.parentNode) panel.parentNode.classList.remove('is-open');
      const toggle = this.el('toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      this.paint();
    },

    /** 「絞り込み」を押した。まとめて効かせて、板を下ろします */
    apply: function () {
      if (!this.draft) return;
      const now = this.opt.get();
      const c = now.conditions;
      c.trait = this.draft.trait;
      c.types = this.draft.types.slice();
      c.costs = this.draft.costs.slice();
      if (this.opt.set) this.opt.set(c, this.draft.sortMode);
      this.close();
      if (this.opt.onApply) this.opt.onApply();
    },

    /**
     * 板の中の印を塗り直す。
     * ★閉じているときは、いま効いている条件で塗ります。
     *   開いたときに前回の選びかけが残っていると、混乱します。
     */
    paint: function () {
      const now = this.opt.get();
      const d = this.draft || {
        types: now.conditions.types, costs: now.conditions.costs,
        sortMode: now.sortMode,
      };
      this.each('data-filter', function (btn) {
        const key = { type: 'types', cost: 'costs' }[btn.dataset.filter];
        const v = (btn.dataset.filter === 'cost') ? Number(btn.dataset.val) : btn.dataset.val;
        const on = !!key && d[key].indexOf(v) !== -1;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      this.each('data-sort', function (btn) {
        const on = btn.dataset.sort === d.sortMode;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      /* ★閉じている行にも、いま何を選んでいるかを出します。
         開かないと分からないと、いちいち開いて確かめることになります。 */
      const LABEL = { type: 'types', cost: 'costs' };
      this.each('data-drop-group', function (drop) {
        const now = drop.querySelector('[data-drop-now]');
        if (!now) return;
        const group = drop.getAttribute('data-drop-group');
        const picked = [];

        if (group === 'sort') {
          drop.querySelectorAll('[data-sort]').forEach(function (btn) {
            if (btn.dataset.sort === d.sortMode) picked.push(btn.textContent);
          });
        } else {
          const key = LABEL[group];
          drop.querySelectorAll('[data-filter]').forEach(function (btn) {
            const v = (btn.dataset.filter === 'cost') ? Number(btn.dataset.val) : btn.dataset.val;
            if (key && d[key].indexOf(v) !== -1) picked.push(btn.textContent);
          });
        }
        now.textContent = picked.length ? picked.join('・') : 'すべて';
      });

      this.paintBadge();
    },

    /**
     * ★いくつ絞り込んでいるかを、四角いボタンに出します。
     * 板を下ろすと条件が見えなくなるので、これが無いと
     * 「なぜ少ししか出ていないのか」が分からなくなります。
     */
    paintBadge: function () {
      const badge = this.el('badge');
      if (!badge) return;
      const now = this.opt.get();
      const c = now.conditions;
      const n = c.types.length + c.costs.length + (c.trait ? 1 : 0) +
        (now.sortMode !== 'default' ? 1 : 0);
      badge.textContent = String(n);
      badge.hidden = (n === 0);
      const toggle = this.el('toggle');
      if (toggle) toggle.classList.toggle('is-filtering', n > 0);
    },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UiFilterSheet: UiFilterSheet };
}
