/* =====================================================================
   rules-boot.js ― ルール処理を組み立てて、画面から使う名前で置く（v0.10）
   ---------------------------------------------------------------------
   ★v0.10 からルール処理は gd1 v1.2（AI Lab の清書版エンジン・R28最終＋v1.1/v1.2 の層）を
     そのまま使います（js/rules-gd1.js）。
     gd1 は v0.9 の game.js / effects.js の分家で、窓口の名前が同じです。
     なので v0.9 の画面は、ここで置く名前を通してそのまま動きます。

   ここで置く名前（v0.9 の cards.js / decks.js / effects.js / game.js が置いていたもの）
     CARD_MASTER  カードの表（gd1：379行。うちデッキで使うのは約200種）
     DECKS        公式デッキ（R28最終の13本＋ギミック版5本）
     Game         ルール本体
     Effects      カード効果
     RuntimeDecks / deckDefOf   自作デッキの預かり
     otherSide    相手の席
     HAND_LIMIT 等の定数

   ★読み込み順：random.js と events.js のあと、rules-gd1.js のあと。
     画面が聞いているのはゲーム側の GameEvents なので、それを渡します。
   ===================================================================== */
'use strict';

/* ★ルール処理は gd1 v1.2（L01〜L13）＋ L14（v0.10 の裁定：効果の解決順）。
   手札上限の撤廃（v1.1 の L12）・山札の下は常にランダム（v1.2 の L13）は gd1 側にある。
   作り方は tools/gd1-build/README.md */
const RULES_ENV = GD1Rules.createRulesEnv({ createRng: createRng, GameEvents: GameEvents, GAME_EVENT: GAME_EVENT });

const CARD_MASTER = RULES_ENV.CARD_MASTER;
const DECKS = RULES_ENV.DECKS;
const DECK_ORDER = RULES_ENV.DECK_ORDER;
const Game = RULES_ENV.Game;
const Effects = RULES_ENV.Effects;
const RuntimeDecks = RULES_ENV.RuntimeDecks;
function deckDefOf(deckId) { return RuntimeDecks.get(deckId); }
function otherSide(side) { return side === 'village' ? 'mansion' : 'village'; }
const ENERGY_MAX = RULES_ENV.constants.ENERGY_MAX;
const MAX_HUMANS = RULES_ENV.constants.MAX_HUMANS;
const MAX_YOUKAI = RULES_ENV.constants.MAX_YOUKAI;
const HAND_LIMIT = RULES_ENV.constants.HAND_LIMIT;
const NOISE_STEP = RULES_ENV.constants.NOISE_STEP;
/** 既定のデッキ（対戦設定で何も選ばれていないとき）。R28最終の1本目＝村 */
const DEFAULT_DECK = DECK_ORDER[0];

/* =====================================================================
   遊べる札かどうか（v0.10）
   ---------------------------------------------------------------------
   カード表（CARD_MASTER）には、遊ばない札も入っています。
     ・削除札（pool: 'removed'）26枚 … 棚卸しで消した札。R28 の再現のために表に残っている
     ・裏面・表示用（faceOnly）3枚 … 成長・変身の面。デッキに入れる札ではない
     ・未実装（効果がエンジンに無い）20枚 … 18本には入っていない（gd1 QUESTIONS Q-D4）
   これらは配らず、一覧にもデッキ編成にも出しません。
   ===================================================================== */
const UNIMPLEMENTED_CARDS = RULES_ENV.UNIMPLEMENTED.slice();
function isPlayableCard(cardId) {
  const m = CARD_MASTER[cardId];
  if (!m) return false;
  if (m.pool === 'removed') return false;
  if (m.faceOnly) return false;
  if (UNIMPLEMENTED_CARDS.indexOf(cardId) !== -1) return false;
  return true;
}

/** 公式デッキの表示名（gd1 の displayName。無ければ label） */
function deckDisplayName(key) {
  const d = DECKS[key];
  return d ? (d.displayName || d.label || key) : key;
}

/* ★v0.9 までの座席デッキ名（'village' / 'mansion'）が、保存データや前回の設定に残っていることがあります。
   新しいデッキの名前へ読み替えます（村 → gd1-mura、洋館 → gd1-yakata）。 */
const LEGACY_DECK_KEYS = { village: 'gd1-mura', mansion: 'gd1-yakata' };
function modernDeckKey(key) {
  if (typeof key === 'string' && LEGACY_DECK_KEYS[key]) return LEGACY_DECK_KEYS[key];
  return key;
}

/* ★対戦を始めるとき、デッキの指定が無ければ v0.9 と同じく「村 対 洋館」。
   旧デッキ名（'village' / 'mansion'）が来たら新しい名前へ読み替える。
   （v0.9 までは席の名前とデッキの名前が同じだったので、その書き方が各所に残っている） */
(function () {
  const rawStart = Game.start;
  Game.start = function (firstSide, seedInput, options) {
    const o = Object.assign({}, options || {});
    const d = Object.assign({ village: 'gd1-mura', mansion: 'gd1-yakata' }, o.decks || {});
    d.village = modernDeckKey(d.village);
    d.mansion = modernDeckKey(d.mansion);
    o.decks = d;
    return rawStart.call(this, firstSide, seedInput, o);
  };
})();

/* ★v0.10（CPU）：名前で呼ぶ歩（js/v010-step.js の V10Ops）が使う部品。Worker の中でも同じ名前で置く */
Game.__v10AiCore = RULES_ENV.AiCore;
Game.__v10Effects = RULES_ENV.Effects;
