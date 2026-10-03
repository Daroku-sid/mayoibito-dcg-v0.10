/* =====================================================================
   v08-settings.js ― 対戦中の設定（Stage 6-2）
   ---------------------------------------------------------------------
   仕様書 第21部。

   これまで設定だけは既存の画面が出ていて、開くたびに見た目が変わって
   いました。ここを新しい画面へ移すと、対戦中の画面の切り替わりが
   なくなります。

   ★設定の中身と保存は、既存の仕組みをそのまま使います。
     ここは並べて見せるだけです。
   ===================================================================== */

'use strict';

const V8Settings = {

  open_: false,
  _root: null,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;
    const back = rootEl.querySelector('#v8-set-back');
    if (back) back.onclick = function () { self.close(); };
    return this;
  },

  isOpen: function () { return this.open_; },

  open: function () {
    if (!this._root) return false;
    this.open_ = true;
    this._root.classList.add('v8-set-on');
    this.render();
    return true;
  },

  close: function () {
    this.open_ = false;
    if (this._root) this._root.classList.remove('v8-set-on');
  },

  /* =============================================================
     並べる
     ============================================================= */
  render: function () {
    if (!this._root || !this.open_) return;
    const box = this._root.querySelector('#v8-set-body');
    if (!box) return;
    const s = (typeof window !== 'undefined' && window.__v8SettingsGet)
      ? window.__v8SettingsGet() : null;
    if (!s) return;

    box.innerHTML = '';
    const doc = document;
    const self = this;

    /** 選ぶ1行 */
    const choiceRow = function (label, note, options, now, onPick) {
      const row = doc.createElement('div');
      row.className = 'v8-set__row';
      const t = doc.createElement('div');
      t.className = 'v8-set__label';
      t.textContent = label;
      const n = doc.createElement('div');
      n.className = 'v8-set__note';
      n.textContent = note;
      const wrap = doc.createElement('div');
      wrap.className = 'v8-set__choices';
      options.forEach(function (pair) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'v8-btn v8-set__choice' + (now === pair[1] ? ' v8-set__choice--on' : '');
        b.textContent = pair[0];
        b.onclick = function () {
          onPick(pair[1]);
          self.render();          // 選んだ結果をその場で見せる
        };
        wrap.appendChild(b);
      });
      row.appendChild(t); row.appendChild(n); row.appendChild(wrap);
      box.appendChild(row);
    };

    /** 押す1行 */
    const actionRow = function (label, note, btnText, onTap) {
      const row = doc.createElement('div');
      row.className = 'v8-set__row';
      const t = doc.createElement('div');
      t.className = 'v8-set__label';
      t.textContent = label;
      const n = doc.createElement('div');
      n.className = 'v8-set__note';
      n.textContent = note;
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'v8-btn v8-set__action';
      b.textContent = btnText;
      b.onclick = onTap;
      row.appendChild(t); row.appendChild(n); row.appendChild(b);
      box.appendChild(row);
    };

    const set = function (key, value) {
      if (typeof window !== 'undefined' && window.__v8SettingsSet) {
        window.__v8SettingsSet(key, value);
      }
    };

    /* ★1. プレイ可能カードの見落とし警告（21.1・初期値 ON） */
    choiceRow('見落とし警告',
      'まだ使えるカードがあるままターンを終えようとしたとき、確認します。',
      [['ON', true], ['OFF', false]], s.warnUnplayedCards,
      function (v) { set('warnUnplayedCards', v); });

    /* ★2. 動きを減らす（21.2） */
    choiceRow('動きを減らす',
      '視点の切り替えや光り方をひかえめにします。ゲームの進み方は変わりません。',
      [['ON', true], ['OFF', false]], s.reduceMotion,
      function (v) { set('reduceMotion', v); });

    /* 3. CPUの行動速度（CPUが動く対戦のときだけ） */
    if (s.showCpuSpeed) {
      choiceRow(s.isWatch ? '観戦速度' : 'CPUの行動速度',
        'CPUが1手ずつ見せる速さです。次のCPUの行動から変わります。',
        s.isWatch
          ? [['標準', 'normal'], ['高速', 'fast'], ['超高速', 'veryfast']]
          : [['標準', 'normal'], ['高速', 'fast']],
        s.cpuActionSpeed, function (v) { set('cpuActionSpeed', v); });
    }

    /* 4. 演出の速さ */
    choiceRow('演出の速さ', 'カードの動きや文字の出る速さを変えます。',
      [['標準', 'normal'], ['高速', 'fast']], s.animationSpeed,
      function (v) { set('animationSpeed', v); });

    /* 5. 効果音 */
    choiceRow('効果音', '音を鳴らすかどうかです。',
      [['ON', 'on'], ['OFF', 'off']], s.seEnabled,
      function (v) { set('seEnabled', v); });

    /* 6. 左右の配置 */
    /* ★「標準」を先に置きます（既定が「標準」なので、並びもそろえます） */
    choiceRow('左右の配置', '盤面の左右を入れ替えます。役割は変わりません。',
      [['標準', 'off'], ['左右を反転', 'on']], s.mirrorLanes,
      function (v) { set('mirrorLanes', v); });

    /* 7. 遊び方 */
    actionRow('遊び方', 'ルールと操作の説明を見ます。閉じると同じ対戦へ戻ります。',
      '遊び方を開く', function () {
        if (typeof window !== 'undefined' && window.__v8OpenHowto) window.__v8OpenHowto();
      });

    /* 8. はじめから */
    actionRow('はじめから', 'いまと同じ条件で、対戦を最初からやり直します。',
      'この設定ではじめから', function () {
        self.close();
        if (typeof window !== 'undefined' && window.__v8RestartMatch) window.__v8RestartMatch();
      });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Settings: V8Settings };
}
