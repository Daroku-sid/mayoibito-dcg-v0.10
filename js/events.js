/* =====================================================================
   events.js  ―  ゲーム内のできごとを知らせる（v0.4 仕様書 23.3）
   ---------------------------------------------------------------------
   「カードが出た」「襲撃が終わった」といったできごとを、
   聞きたい人へ知らせるだけの小さな仕組みです。

   何のために作るか:
     v0.5のチュートリアルは、盤面の変化を見張って
     「次の説明へ進む」「操作を許す」を判断します。
     そのたびに game.js を書き換えていくと、
     ルール処理がチュートリアル専用の分岐だらけになってしまいます。

     そこで game.js は「起きたことを言うだけ」にして、
     それをどう使うかは聞く側に任せます。
     チュートリアルのほかにも、実績・ミッション・リプレイなど、
     あとから足す機能が同じ仕組みに乗れます。

   大事な約束:
     ・通知はルール処理に影響しない。聞く人が誰もいなくても結果は同じ
     ・聞く側で例外が起きても、ゲームは止めない
     ・v0.3の対戦結果は1手も変わらない（同じシードなら同じログになる）
   ===================================================================== */

'use strict';

/* --- できごとの名前（仕様書 23.3） --------------------------------- */
const GAME_EVENT = {
  GAME_STARTED:               'GAME_STARTED',
  MULLIGAN_OPENED:            'MULLIGAN_OPENED',
  MULLIGAN_SELECTION_CHANGED: 'MULLIGAN_SELECTION_CHANGED',
  MULLIGAN_COMPLETED:         'MULLIGAN_COMPLETED',
  TURN_STARTED:               'TURN_STARTED',
  PHASE_CHANGED:              'PHASE_CHANGED',
  MORALE_CHANGED:             'MORALE_CHANGED',
  CARD_DRAWN:                 'CARD_DRAWN',
  CARD_PLAYED:                'CARD_PLAYED',
  CARD_EQUIPPED:              'CARD_EQUIPPED',
  EVENT_USED:                 'EVENT_USED',
  CARD_DISCARDED:             'CARD_DISCARDED',
  CARD_RECOVERED:             'CARD_RECOVERED',
  PURSUIT_SELECTED:           'PURSUIT_SELECTED',
  PURSUIT_CONFIRMED:          'PURSUIT_CONFIRMED',
  TURN_END_REQUESTED:         'TURN_END_REQUESTED',
  FIELD_EFFECT_PROMPTED:      'FIELD_EFFECT_PROMPTED',
  FIELD_EFFECT_RESOLVED:      'FIELD_EFFECT_RESOLVED',
  ASSAULT_STARTED:            'ASSAULT_STARTED',
  DAMAGE_DEALT:               'DAMAGE_DEALT',
  CARD_DEFEATED:              'CARD_DEFEATED',
  CARD_MOVED:                 'CARD_MOVED',
  ASSAULT_RESOLVED:           'ASSAULT_RESOLVED',
  LOST_COUNT_CHANGED:         'LOST_COUNT_CHANGED',
  GAME_ENDED:                 'GAME_ENDED',
};

const GameEvents = {

  /* 名前 → 聞く人の一覧 */
  _listeners: {},

  /* 直近のできごと（不具合を追うときの手がかり。多くは持たない） */
  _recent: [],
  RECENT_MAX: 40,

  /**
   * できごとを聞く。
   * @returns 聞くのをやめるための関数
   */
  on: function (name, fn) {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(fn);
    const self = this;
    return function () { self.off(name, fn); };
  },

  /** 聞くのをやめる */
  off: function (name, fn) {
    const list = this._listeners[name];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  },

  /** 全部やめる（対戦をやり直すときなど） */
  clear: function () {
    this._listeners = {};
    this._recent = [];
  },

  /**
   * できごとを知らせる。
   * 聞く側で例外が起きても、ここで受け止めてゲームは続けます。
   * ルール処理の途中から呼ばれるので、ここで止まると盤面が壊れるためです。
   */
  emit: function (name, data) {
    this._recent.push(name);
    if (this._recent.length > this.RECENT_MAX) this._recent.shift();

    const list = this._listeners[name];
    if (!list || list.length === 0) return;

    // 通知の途中で off されても崩れないよう、写しを回す
    list.slice().forEach(function (fn) {
      try {
        fn(data || {});
      } catch (e) {
        if (typeof Errors !== 'undefined' && Errors.note) {
          Errors.note('通知の受け取りで例外：' + name + ' / ' + (e && e.message));
        }
      }
    });
  },

  /** 直近のできごと（不具合の記録に添えます） */
  recent: function () {
    return this._recent.slice();
  },
};

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameEvents: GameEvents, GAME_EVENT: GAME_EVENT };
}
