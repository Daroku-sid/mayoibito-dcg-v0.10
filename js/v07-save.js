/* =====================================================================
   v07-save.js ― v0.7 専用の保存レイヤー（Stage 1）
   ---------------------------------------------------------------------
   仕様書 第20部：
     ・v0.7 は v0.6 以前と別リンクで配布する
     ・旧セーブを引き継がない / 移行しない / 旧形式判定もしない
     ・v0.7 専用の保存キー（mayoibito_v07_save）を使う

   ★v0.8 Stage 0：
     同じ考え方で、v0.8 は v0.7 の保存データを読み書きしません。
     キーを mayoibito_v08_save へ変えてあります。
     （GitHub Pages では v0.7 と v0.8 が同じ localStorage を共有するため、
       キーを分けないと v0.8 の不具合が v0.7 のデータを壊します）

   なぜ既存 SaveManager と分けるか（実装判断）:
     既存 SaveManager（キー: mayohibito.v04）は、対戦・デッキ・
     チュートリアルが全面的に依存しています。これを書き換えると
     既存機能を壊す恐れが高いため、v0.7 が新しく持つデータ
     （ローカルID・プロフィール・v0.7 の将来領域）だけを、
     この独立レイヤーで別キーへ保存します。
     既存のデッキ保存などは、これまでどおり SaveManager が扱います。

   Stage 1 で扱うもの:
     ・初回起動時の初期データ生成
     ・ローカルID の生成・保存（第12部 12.4）
     ・自動保存（第20部 20.3：有効な変更の直後に即保存）
   書き出し・読み込み・全初期化の「画面からの操作」は Stage 3。
   ここでは仕組み（export/import/reset）だけ用意します。
   ===================================================================== */

'use strict';

const V7Save = {

  KEY: 'mayoibito_v08_save',
  SCHEMA: 1,

  data: null,

  /* 直近の読み込みで直した箇所（利用者への説明に使う） */
  repairs: [],

  /* -------------------------------------------------------------
     初期データ（第20部 20.2）
     ------------------------------------------------------------- */
  defaults: function () {
    return {
      saveVersion: this.SCHEMA,
      localId: null,                 // 初回起動で生成（12.4）
      profile: {
        playerName: 'プレイヤー',
        title: 'はじめての一歩',
        favoriteCardId: 'mansion_elise',   // 《屋敷の令嬢 エリーゼ》（12.6）
      },
      /* 将来拡張用の設定領域（20.2）。v0.7 では中身を持たない。 */
      settings: {},
    };
  },

  /* =============================================================
     読み込み（無ければ初期データを作って保存）
     ============================================================= */
  load: function () {
    this.repairs = [];
    this.data = this.defaults();

    let raw = null;
    try {
      raw = window.localStorage.getItem(this.KEY);
    } catch (e) {
      this.repairs.push('端末への保存が使えないため、今回かぎりの状態で進みます。');
      this.ensureLocalId();          // 保存できなくても ID は用意する
      return this.data;
    }

    if (!raw) {
      // 初回起動：初期データを作り、ローカルIDを生成して保存（20.2 / 12.4）
      this.ensureLocalId();
      this.save();
      return this.data;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this.repairs.push('保存データを読み取れなかったため、初期状態から始めます。');
      this.ensureLocalId();
      this.save();
      return this.data;
    }

    this.applyValidated(parsed);
    // 検証後もローカルID が無ければ生成（12.4）
    this.ensureLocalId();
    return this.data;
  },

  /* =============================================================
     検証して取り込む（知っている項目だけ・型を確かめる）
     ============================================================= */
  applyValidated: function (parsed) {
    const d = this.data;
    if (!parsed || typeof parsed !== 'object') {
      this.repairs.push('保存データの形式が正しくないため、初期状態から始めます。');
      return;
    }

    if (typeof parsed.localId === 'string' && this.isValidLocalId(parsed.localId)) {
      d.localId = parsed.localId;
    }

    const p = parsed.profile;
    if (p && typeof p === 'object') {
      if (typeof p.playerName === 'string' && p.playerName.length) {
        d.profile.playerName = p.playerName;
      }
      if (typeof p.title === 'string' && p.title.length) {
        d.profile.title = p.title;
      }
      if (typeof p.favoriteCardId === 'string' && p.favoriteCardId.length) {
        d.profile.favoriteCardId = p.favoriteCardId;
      }
    }

    if (parsed.settings && typeof parsed.settings === 'object') {
      d.settings = parsed.settings;
    }
  },

  /* =============================================================
     保存（第20部 20.3：有効な変更の直後に即保存）
     ============================================================= */
  save: function () {
    try {
      window.localStorage.setItem(this.KEY, JSON.stringify(this.data));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  },

  /* =============================================================
     ローカルID（第12部 12.4）
     -------------------------------------------------------------
       ・MB-XXXX-XXXX（大文字英数字）
       ・0/O、1/I など紛らわしい文字は除外
       ・認証や本人確認には使わない
     ============================================================= */
  ID_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',  // 0/O/1/I を除外

  isValidLocalId: function (s) {
    return typeof s === 'string' && /^MB-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(s);
  },

  generateLocalId: function () {
    const abc = this.ID_ALPHABET;
    const pick = function () {
      let out = '';
      for (let i = 0; i < 4; i++) {
        out += abc[Math.floor(Math.random() * abc.length)];
      }
      return out;
    };
    return 'MB-' + pick() + '-' + pick();
  },

  /** ローカルID が無ければ生成する（生成したら true） */
  ensureLocalId: function () {
    if (this.data.localId && this.isValidLocalId(this.data.localId)) return false;
    this.data.localId = this.generateLocalId();
    return true;
  },

  localId: function () {
    return this.data ? this.data.localId : null;
  },

  /* =============================================================
     書き出し・読み込み・全初期化の「仕組み」
     -------------------------------------------------------------
     画面からの操作（ボタン・確認ダイアログ）は Stage 3 で作ります。
     ここでは中身の関数だけ用意しておきます。
     ============================================================= */

  /** 書き出し用の文字列（1つのJSON：第20部 20.4） */
  exportText: function () {
    return JSON.stringify(this.data, null, 2);
  },

  exportFileName: function () {
    const id = this.localId() || 'noid';
    return 'mayoibito_v07_save_' + id + '.json';
  },

  /** 読み込み：検証して、問題なければ差し替える（第20部 20.5）
      戻り値 { ok, repairs } / 失敗時は現在データを変えない */
  importText: function (text) {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'parse' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, reason: 'shape' };
    }
    // いったん初期データへ検証取り込みし、問題なければ確定
    const backup = this.data;
    this.data = this.defaults();
    this.repairs = [];
    this.applyValidated(parsed);
    this.ensureLocalId();
    const saved = this.save();
    if (!saved.ok) {
      this.data = backup;            // 保存に失敗したら元へ戻す
      return { ok: false, reason: 'save' };
    }
    return { ok: true, repairs: this.repairs.slice() };
  },

  /** 全初期化（第20部 20.6）：新しいローカルIDを再生成して保存 */
  reset: function () {
    this.data = this.defaults();
    this.repairs = [];
    this.ensureLocalId();            // 新しいIDを生成（12.4）
    return this.save();
  },
};

/* Node（テスト）からも使えるように */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V7Save: V7Save };
}
