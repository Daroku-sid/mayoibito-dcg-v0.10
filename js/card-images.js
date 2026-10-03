/* =====================================================================
   card-images.js  ―  カードIDと画像ファイル名の対応表
   ---------------------------------------------------------------------
   仕様書 11.1：画像ファイル名の管理はこの1か所だけで行います。
   カードID（cards.js のID）は v0.1 から変更していません。

   画像を差し替えたいとき：
     ・同じファイル名で上書きする → ここは編集不要
     ・別の名前にしたい → 下の表の右側だけ書き換える

   1枚のカードに陣営ごとの絵柄がある場合（例：境界線）は、
   { village: '…', mansion: '…' } の形で書けます。
   ===================================================================== */

'use strict';

/** 画像を置いてあるフォルダ */
const CARD_IMAGE_DIR = 'images/';

/** カードID → 画像ファイル名 */
/* ★v0.10：カードIDが gd1 の形（MURA-002 など）に変わりました。
   画像ファイルの名前は v0.9 のまま（village_haruka.webp など）で、左側のIDだけを新しくしています。
   旧ID → 新ID は名前で突き合わせて27枚すべて1対1でした。
   ここに無いカードは「絵の部分だけ空白」で、枠・名前・数値は出ます（v08-images.js）。 */
const CARD_IMAGES = {

  /* ---------------- ヨマモリ村 ---------------- */
  'MURA-001':      'village_sumire.webp',       // 放課後の帰り道 スミレ
  'MURA-002':      'village_haruka.webp',       // 孤独な夜道 ハルカ
  'MURA-003':        'village_luna.webp',         // 泣き虫転校生 ルナ
  'MURA-004':       'village_kaede.webp',        // 負けず嫌い カエデ
  'MURA-005':         'village_rin.webp',          // 頼れる委員長 リン
  'MURA-006':   'village_ichimatsu.webp',    // 寂しがる市松人形
  'MURA-007':      'village_kohaku.webp',       // 狐のお面 コハク
  'MURA-008':     'village_kakashi.webp',      // 朽ちゆく嗤い案山子
  'MURA-009':       'village_nushi.webp',        // 山を守るヌシ様
  'MURA-010':  'village_flashlight.webp',   // 懐中電灯
  'MURA-011':       'village_ofuda.webp',        // 古いお札
  'MURA-013': 'village_sashinoberu.webp',  // 引き戻す力
  'FIELD-MURA':       'field_village.webp',        // ～ヨマモリ村～（横長）

  /* ---------------- 黒薔薇の館 ---------------- */
  'YAKATA-001':       'mansion_elise.webp',        // 屋敷の令嬢 エリーゼ
  'YAKATA-002':     'mansion_annette.webp',      // 不憫な客人 アネット
  'YAKATA-003':        'mansion_emma.webp',         // 微笑む使用人 エマ
  'YAKATA-004':        'mansion_lily.webp',         // 招かれた令嬢 リリィ
  'YAKATA-005':      'mansion_sylvie.webp',       // 寡黙な使用人 シルヴィ
  'YAKATA-006':      'mansion_claude.webp',       // 紫炎の執事 クロード
  'YAKATA-007':     'mansion_chimera.webp',      // 地下室に棲むキメラ
  'YAKATA-008':       'mansion_armor.webp',        // 彷徨う亡霊甲冑
  'YAKATA-009':    'mansion_isabella.webp',     // 企む貴婦人 イザベラ
  'YAKATA-010':         'mansion_key.webp',          // 小さな鍵
  'YAKATA-011':        'mansion_ring.webp',         // 黒い指輪
  'YAKATA-012':   'mansion_sakuryaku.webp',    // 黒薔薇の策略
  'FIELD-YAKATA':       'field_mansion.webp',        // ～黒薔薇の館～（横長）

  /* ---------------- 共通 ----------------
     境界線は村・洋館の両デッキに入ります。
     いただいた画像が2種類あったため、持ち主の陣営で出し分けています。
     どちらか1枚に統一する場合は、文字列1つに書き換えてください。 */
  'MURA-012': {
    village: 'event_kyoukaisen_village.webp',
    mansion: 'event_kyoukaisen_mansion.webp',
  },
};

/**
 * カードの裏面画像。
 * まだ用意していないため null にしてあります。
 * 用意できたら images/ に置いて、ここにファイル名を書けば反映されます。
 * 例： const CARD_BACK_IMAGE = 'card_back.webp';
 */
const CARD_BACK_IMAGE = null;

/** 横長で作られているカード（フィールドカード）。表示枠の形を変えるために使う */
/* ★v0.10：フィールドは12枚。絵があるのは村・洋館の2枚だけですが、形（横長）はすべて同じ */
const LANDSCAPE_CARDS = ['FIELD-MURA', 'FIELD-YAKATA', 'FIELD-DANCHI', 'FIELD-GAKKO', 'FIELD-SHOTEN', 'FIELD-CHIKA',
  'FIELD-MORI', 'FIELD-SHIMA', 'FIELD-HOTEL', 'FIELD-YORU', 'FIELD-YUEN', 'FIELD-CHOKOKU'];

/* =====================================================================
   取り出し用の関数
   ===================================================================== */

/**
 * カードの画像パスを返す。画像が無ければ null。
 * @param {string} cardId  カードID
 * @param {string} [owner] 'village' または 'mansion'（陣営別の絵柄がある場合に使う）
 */
/* 一覧用のサムネイル置き場。
   元画像(744×1039)の1/3。カード一覧は6列、デッキ編成は8列なので
   この大きさで足ります。元画像をそのまま並べると展開後のメモリが
   9倍になり、スマホでの操作が重くなります（v0.4 Stage C）。 */
const CARD_THUMB_DIR = 'images/thumb/';

/**
 * 一覧に並べるときの画像。
 * 拡大詳細では getCardImagePath（元画像）を使ってください。
 */
function getCardThumbPath(cardId, owner) {
  const full = getCardImagePath(cardId, owner);
  if (!full) return null;
  if (full.indexOf('data:') === 0) return full;   // ★v0.10：仮カードは小さい版も同じもの
  return full.replace(CARD_IMAGE_DIR, CARD_THUMB_DIR);
}

function getCardImagePath(cardId, owner) {
  const entry = CARD_IMAGES[cardId];
  /* ★v0.10：絵が無いカードは、文字の仮カードを作って返す（作者の決定 2026-10-01：
     「文字＋コスト等＋カード種ごとのベースカラーの仮カード」）。
     ここ1か所で返すので、手札・盤面・一覧・デッキ編成・詳細のすべてに出ます。 */
  if (!entry) return makePlaceholderCard(cardId);

  if (typeof entry === 'string') return CARD_IMAGE_DIR + entry;

  // 陣営ごとに絵柄がある場合
  const file = entry[owner] || entry.village || entry.mansion;
  return file ? (CARD_IMAGE_DIR + file) : null;
}

/** 裏面画像のパス。未用意なら null（その場合は仮の裏面を表示する） */
function getCardBackPath() {
  return CARD_BACK_IMAGE ? (CARD_IMAGE_DIR + CARD_BACK_IMAGE) : null;
}

/** 横長のカードかどうか */
function isLandscapeCard(cardId) {
  return LANDSCAPE_CARDS.indexOf(cardId) !== -1;
}

/* =====================================================================
   仮カード（v0.10）
   ---------------------------------------------------------------------
   絵がまだ無いカードを、文字だけのカード画像（SVG）にして返します。
     ・地の色はカードの種類ごと（人間・怪異・グッズ・イベント・フィールド）
     ・左上にコスト、上に名前と特徴、まん中に効果文、下にスピード／体力（グッズは補正）
     ・右下に「仮」の印と、どのデッキの札か
   ★画像の大きさの比は本物のカード（744×1039）と同じ。フィールドだけ横長。
   ★作ったものは覚えておき、同じカードで二度作らない。
   ★外部の文字（ウェブフォント）は使わない（画像として読むSVGでは読めないため）。
   ===================================================================== */
const PLACEHOLDER_COLORS = {
  human:  { bg: '#3a4a63', band: '#24324a', ink: '#f2ede2', accent: '#d9c08a' },
  youkai: { bg: '#4a3560', band: '#2e1f40', ink: '#f2ede2', accent: '#c9a6e8' },
  goods:  { bg: '#3d5248', band: '#26362e', ink: '#f2ede2', accent: '#b8d6a6' },
  event:  { bg: '#5a3a35', band: '#3a2320', ink: '#f2ede2', accent: '#e8b48a' },
  field:  { bg: '#3f4740', band: '#262c27', ink: '#f2ede2', accent: '#cfd6b0' },
};
const PLACEHOLDER_TYPE_LABEL = { human: '人間', youkai: '怪異', goods: 'グッズ', event: 'イベント', field: 'フィールド' };
const _placeholderCache = {};

function _xmlEscape(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 決まった字数で折り返す（日本語はほぼ等幅なので字数で足りる） */
function _wrapText(text, perLine, maxLines) {
  const out = [];
  String(text).split(/\n|／/).forEach(function (para, i, arr) {
    let rest = para;
    while (rest.length > 0) { out.push(rest.slice(0, perLine)); rest = rest.slice(perLine); }
    if (i < arr.length - 1) out.push('');            // 「／」で区切った効果のあいだを1行あける
  });
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].slice(0, Math.max(0, perLine - 1)) + '…';
    return cut;
  }
  return out;
}

function makePlaceholderCard(cardId) {
  if (_placeholderCache[cardId]) return _placeholderCache[cardId];
  if (typeof CARD_MASTER === 'undefined' || !CARD_MASTER[cardId]) return null;
  const m = CARD_MASTER[cardId];
  const col = PLACEHOLDER_COLORS[m.type] || PLACEHOLDER_COLORS.event;
  const land = (m.type === 'field');
  const W = land ? 1039 : 744, H = land ? 744 : 1039;

  /* 両面の札は、効果文の頭に特徴が付いている（〔地下〕〔駅員〕｜…）。表示では外す */
  const effect = String(m.effect || '').replace(/^(〔[^〕]*〕)+｜/, '');
  const traits = (m.traits || []).map(function (t) { return '〔' + t + '〕'; }).join('');
  const deckName = m.deck || (DECKS && m.faction ? '' : '');

  const parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
  parts.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="34" fill="' + col.bg + '"/>');
  parts.push('<rect x="14" y="14" width="' + (W - 28) + '" height="' + (H - 28) + '" rx="26" fill="none" stroke="' + col.accent + '" stroke-width="5" opacity="0.7"/>');
  /* 名前の帯 */
  parts.push('<rect x="30" y="30" width="' + (W - 60) + '" height="150" rx="18" fill="' + col.band + '"/>');
  const font = 'font-family="Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic, Meiryo, sans-serif"';
  const nameSize = m.name.length > 12 ? 42 : (m.name.length > 9 ? 50 : 58);
  parts.push('<text x="' + (land ? 190 : 170) + '" y="105" ' + font + ' font-size="' + nameSize + '" font-weight="700" fill="' + col.ink + '">' + _xmlEscape(m.name) + '</text>');
  parts.push('<text x="' + (land ? 190 : 170) + '" y="160" ' + font + ' font-size="30" fill="' + col.accent + '">' + _xmlEscape((PLACEHOLDER_TYPE_LABEL[m.type] || '') + '　' + traits) + '</text>');
  /* コスト（フィールドはロスト上限） */
  if (m.type !== 'field') {
    parts.push('<circle cx="98" cy="105" r="58" fill="' + col.accent + '"/>');
    parts.push('<text x="98" y="128" text-anchor="middle" ' + font + ' font-size="66" font-weight="800" fill="' + col.band + '">' + _xmlEscape(m.cost == null ? '-' : m.cost) + '</text>');
  } else if (m.lostLimit != null) {
    parts.push('<rect x="40" y="48" width="130" height="114" rx="16" fill="' + col.accent + '"/>');
    parts.push('<text x="105" y="92" text-anchor="middle" ' + font + ' font-size="26" fill="' + col.band + '">ロスト</text>');
    parts.push('<text x="105" y="146" text-anchor="middle" ' + font + ' font-size="54" font-weight="800" fill="' + col.band + '">' + _xmlEscape(m.lostLimit) + '</text>');
  }
  /* 効果文 */
  const big = effect.length <= 60;
  const fs = big ? 40 : (effect.length <= 110 ? 34 : 30);
  const per = Math.floor((W - 110) / fs);
  const top = 250, bottom = land ? H - 70 : H - 190;
  const maxLines = Math.floor((bottom - top) / (fs * 1.38));
  _wrapText(effect, per, maxLines).forEach(function (line, i) {
    parts.push('<text x="55" y="' + (top + i * fs * 1.38) + '" ' + font + ' font-size="' + fs + '" fill="' + col.ink + '">' + _xmlEscape(line) + '</text>');
  });
  /* スピード／体力、グッズの補正 */
  if (m.type === 'human' || m.type === 'youkai') {
    parts.push('<rect x="40" y="' + (H - 150) + '" width="300" height="104" rx="18" fill="' + col.band + '"/>');
    parts.push('<text x="70" y="' + (H - 78) + '" ' + font + ' font-size="34" fill="' + col.accent + '">速</text>');
    parts.push('<text x="118" y="' + (H - 72) + '" ' + font + ' font-size="64" font-weight="800" fill="' + col.ink + '">' + _xmlEscape(m.speed) + '</text>');
    parts.push('<text x="185" y="' + (H - 78) + '" ' + font + ' font-size="34" fill="' + col.accent + '">体</text>');
    parts.push('<text x="233" y="' + (H - 72) + '" ' + font + ' font-size="64" font-weight="800" fill="' + col.ink + '">' + _xmlEscape(m.hp) + '</text>');
  } else if (m.type === 'goods' && m.equipBonus) {
    const b = m.equipBonus, bits = [];
    if (b.speed) bits.push('速' + (b.speed > 0 ? '+' : '') + b.speed);
    if (b.hp) bits.push('体' + (b.hp > 0 ? '+' : '') + b.hp);
    if (bits.length) {
      parts.push('<rect x="40" y="' + (H - 150) + '" width="300" height="104" rx="18" fill="' + col.band + '"/>');
      parts.push('<text x="70" y="' + (H - 78) + '" ' + font + ' font-size="50" font-weight="800" fill="' + col.ink + '">' + _xmlEscape(bits.join(' ')) + '</text>');
    }
  }
  /* 仮の印とデッキ名 */
  parts.push('<text x="' + (W - 50) + '" y="' + (H - 90) + '" text-anchor="end" ' + font + ' font-size="30" fill="' + col.accent + '" opacity="0.85">' + _xmlEscape(m.deck || '汎用') + '</text>');
  parts.push('<text x="' + (W - 50) + '" y="' + (H - 45) + '" text-anchor="end" ' + font + ' font-size="26" fill="' + col.ink + '" opacity="0.5">仮カード ' + _xmlEscape(cardId) + '</text>');
  parts.push('</svg>');

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(parts.join(''));
  _placeholderCache[cardId] = url;
  return url;
}

/** 本物の絵があるか（仮カードではないか） */
function hasRealCardImage(cardId) {
  return !!CARD_IMAGES[cardId];
}
