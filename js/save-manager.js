/* =====================================================================
   save-manager.js  ―  セーブデータの管理（v0.4 仕様書 25・26）
   ---------------------------------------------------------------------
   端末への保存を、ここ1か所へ集めます。

   なぜ集めるか:
     v0.3では各画面が localStorage を直接触っていました。
     v0.4からは設定に加えて、所持カード・自作デッキ・チュートリアルの
     クリア状況まで保存します。書き込む場所が散らばっていると、
     「どこかが古い形式のまま書き込んで壊す」事故が起きます。

   壊れたデータへの構え（仕様書 25.6）:
     ・ゲーム全体を起動不能にしない
     ・おかしい部分だけ初期値へ戻し、残りは活かす
     ・戻した箇所を記録し、利用者へ伝えられるようにする
     ・可能なら、壊れる前の中身を控えておく

   v0.3からの引き継ぎ（仕様書 25.5）:
     設定と前回の選択は引き継ぎ、旧初心者ガイドの記録は捨てます。
   ===================================================================== */

'use strict';

const SaveManager = {

  /* ★v0.8 Stage 0：v0.7 までのキー（mayohibito.v04）とは別にしています。
     同じ配信元では localStorage が共有されるため、キーを分けないと
     v0.8 の不具合が v0.7 の自作デッキや設定を壊す恐れがあります。
     引き継ぎは行いません（第20部の考え方を踏襲）。 */
  KEY: 'mayohibito.v08',
  OLD_KEY: 'mayohibito.v03',
  SCHEMA: 2,

  /* いまの中身 */
  data: null,

  /* 直近の読み込みで直した箇所（利用者への説明に使う） */
  repairs: [],

  /* 壊れていたときの元の中身（書き出して調べられるように） */
  brokenBackup: null,

  /* -------------------------------------------------------------
     既定値
     ------------------------------------------------------------- */
  defaults: function () {
    return {
      schemaVersion: this.SCHEMA,
      appVersion: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '0.4.0',
      settings: {
        cpuActionSpeed: 'normal',   // 'normal' / 'fast'
        animationSpeed: 'normal',   // 'normal' / 'fast'
        seEnabled: true,
        seVolume: 60,               // 0〜100
        mirrorLanes: false,   // ★v0.8：既定は「標準」
      },
      tutorial: {
        basicCompleted: false,
        advancedCompleted: false,
        tutorialVersion: 1,
      },
      collection: {},               // cardId → 所持枚数
      customDecks: [],
      lastSelections: {
        cpuDifficulty: null,
        playerDeck: null,
        cpuDeck: null,
        firstPlayerSetting: null,
        seedMode: null,
      },
      initialGrantCompleted: false,
    };
  },

  /* =============================================================
     読み込み
     ============================================================= */
  load: function () {
    this.repairs = [];
    this.brokenBackup = null;
    this.data = this.defaults();

    let raw = null;
    try {
      raw = window.localStorage.getItem(this.KEY);
    } catch (e) {
      // プライベートモードなどで使えない。既定値のまま進みます
      this.repairs.push('端末への保存が使えないため、設定は今回かぎりになります。');
      return this.data;
    }

    // v0.4のデータが無ければ、v0.3からの引き継ぎを試す
    if (!raw) {
      this.migrateFromV03();
      return this.data;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this.brokenBackup = raw;
      this.repairs.push('保存データを読み取れなかったため、初期状態から始めます。');
      return this.data;
    }

    this.applyValidated(parsed);
    return this.data;
  },

  /* =============================================================
     検証して取り込む
     -------------------------------------------------------------
     知っている項目だけを、型と範囲を確かめてから入れます。
     おかしい項目は既定値のままにして、直した箇所を控えます。
     ============================================================= */
  applyValidated: function (parsed) {
    const d = this.data;

    if (!parsed || typeof parsed !== 'object') {
      this.repairs.push('保存データの形式が正しくないため、初期状態から始めます。');
      return;
    }

    // スキーマ版
    if (parsed.schemaVersion !== this.SCHEMA) {
      if (parsed.schemaVersion === 1 || parsed.storageSchemaVersion === 1) {
        // v0.3の形。設定だけ引き継ぐ
        this.takeV03Shape(parsed);
        this.repairs.push('以前の版の保存データから、設定を引き継ぎました。');
        return;
      }
      this.brokenBackup = JSON.stringify(parsed);
      this.repairs.push('保存データの版が合わないため、初期状態から始めます。');
      return;
    }

    this.takeSettings(parsed.settings);
    this.takeTutorial(parsed.tutorial);
    this.takeCollection(parsed.collection);
    this.takeCustomDecks(parsed.customDecks);
    this.takeLastSelections(parsed.lastSelections);

    if (typeof parsed.initialGrantCompleted === 'boolean') {
      d.initialGrantCompleted = parsed.initialGrantCompleted;
    }
  },

  takeSettings: function (src) {
    if (!src || typeof src !== 'object') return;
    const d = this.data.settings;
    const speed = ['normal', 'fast'];
    if (speed.indexOf(src.cpuActionSpeed) !== -1) d.cpuActionSpeed = src.cpuActionSpeed;
    if (speed.indexOf(src.animationSpeed) !== -1) d.animationSpeed = src.animationSpeed;
    if (typeof src.seEnabled === 'boolean') d.seEnabled = src.seEnabled;
    if (typeof src.seVolume === 'number' && src.seVolume >= 0 && src.seVolume <= 100) {
      d.seVolume = Math.round(src.seVolume);
    }
    if (typeof src.mirrorLanes === 'boolean') d.mirrorLanes = src.mirrorLanes;
  },

  takeTutorial: function (src) {
    if (!src || typeof src !== 'object') return;
    const d = this.data.tutorial;
    if (typeof src.basicCompleted === 'boolean') d.basicCompleted = src.basicCompleted;
    if (typeof src.advancedCompleted === 'boolean') d.advancedCompleted = src.advancedCompleted;
    if (typeof src.tutorialVersion === 'number') d.tutorialVersion = src.tutorialVersion;
  },

  /** 所持カード。知らないカードIDと、おかしい枚数は捨てる */
  takeCollection: function (src) {
    if (!src || typeof src !== 'object') return;
    const d = this.data.collection;
    let dropped = 0;
    Object.keys(src).forEach(function (cardId) {
      if (typeof CARD_MASTER === 'undefined' || !CARD_MASTER[cardId]) { dropped += 1; return; }
      const n = src[cardId];
      if (typeof n !== 'number' || !isFinite(n) || n < 0) { dropped += 1; return; }
      d[cardId] = Math.floor(n);
    });
    if (dropped > 0) {
      this.repairs.push('所持カードのうち、' + dropped + '件は読み取れなかったため除きました。');
    }
  },

  /** 自作デッキ。1つ壊れていても、他のデッキは残す（仕様書 27.2） */
  takeCustomDecks: function (src) {
    if (!Array.isArray(src)) return;
    const out = [];
    let dropped = 0;
    const self = this;

    src.forEach(function (deck) {
      const cleaned = self.cleanDeck(deck);
      if (cleaned) out.push(cleaned);
      else dropped += 1;
    });

    this.data.customDecks = out.slice(0, 10);   // 自作は最大10個（仕様書 11.3）
    if (out.length > 10) {
      this.repairs.push('自作デッキが上限の10個を超えていたため、以降を読み込みませんでした。');
    }
    if (dropped > 0) {
      this.repairs.push('自作デッキのうち、' + dropped + '個は読み取れなかったため除きました。');
    }
  },

  /**
   * デッキ1個を整える。
   * 「使えるかどうか」の判定はここではしません（仕様書 25.4）。
   * 形式として読めるかどうかだけを見て、中身の良し悪しは
   * deck-validator が対戦前に判断します。
   */
  cleanDeck: function (deck) {
    if (!deck || typeof deck !== 'object') return null;
    if (typeof deck.id !== 'string' || deck.id === '') return null;

    const out = {
      id: deck.id,
      name: (typeof deck.name === 'string' ? deck.name : '').slice(0, 16) || '新しいデッキ',
      fieldId: (typeof deck.fieldId === 'string') ? deck.fieldId : null,
      mainDeck: [],
      aceCardId: (typeof deck.aceCardId === 'string') ? deck.aceCardId : null,
      createdAt: (typeof deck.createdAt === 'string') ? deck.createdAt : null,
      updatedAt: (typeof deck.updatedAt === 'string') ? deck.updatedAt : null,
    };

    // 知らないフィールドIDは、そのまま残して使用不可として見せる（勝手に消さない）
    if (Array.isArray(deck.mainDeck)) {
      deck.mainDeck.forEach(function (e) {
        if (!e || typeof e.cardId !== 'string') return;
        const n = e.count;
        if (typeof n !== 'number' || !isFinite(n) || n <= 0) return;
        out.mainDeck.push({ cardId: e.cardId, count: Math.floor(n) });
      });
    }
    return out;
  },

  takeLastSelections: function (src) {
    if (!src || typeof src !== 'object') return;
    const d = this.data.lastSelections;
    Object.keys(d).forEach(function (k) {
      if (typeof src[k] === 'string') d[k] = src[k];
    });
  },

  /* =============================================================
     v0.3からの引き継ぎ（仕様書 25.5）
     ============================================================= */
  migrateFromV03: function () {
    let raw = null;
    try {
      raw = window.localStorage.getItem(this.OLD_KEY);
    } catch (e) {
      return;
    }
    if (!raw) return;

    let old = null;
    try {
      old = JSON.parse(raw);
    } catch (e) {
      return;   // 読めなければ、何も引き継がずに初期状態から
    }
    this.takeV03Shape(old);
    this.save();
  },

  /** v0.3の形から、引き継ぐものだけを取り出す */
  takeV03Shape: function (old) {
    if (!old || typeof old !== 'object') return;

    this.takeSettings(old.settings);

    if (old.last && typeof old.last === 'object') {
      const d = this.data.lastSelections;
      Object.keys(d).forEach(function (k) {
        if (typeof old.last[k] === 'string') d[k] = old.last[k];
      });
    }

    // 旧初心者ガイドの記録は引き継がない（仕様書 18.2・25.5）。
    // 正式チュートリアルのクリア状態へ読み替えることもしない。
  },

  /* =============================================================
     書き込み
     ============================================================= */
  save: function () {
    if (!this.data) return { ok: false, reason: 'データがありません' };
    this.data.appVersion = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : this.data.appVersion;
    try {
      window.localStorage.setItem(this.KEY, JSON.stringify(this.data));
      return { ok: true };
    } catch (e) {
      // 容量不足・書き込み拒否。成功したように見せない（仕様書 27.3）
      return { ok: false, reason: (e && e.name) || '保存できませんでした' };
    }
  },

  /* =============================================================
     取り出し・書き換え
     ============================================================= */
  get: function (key) {
    if (!this.data) this.load();
    return this.data.settings[key];
  },

  set: function (key, value) {
    if (!this.data) this.load();
    this.data.settings[key] = value;
    return this.save();
  },

  remember: function (obj) {
    if (!this.data) this.load();
    const d = this.data.lastSelections;
    Object.keys(obj || {}).forEach(function (k) {
      if (k in d && typeof obj[k] === 'string') d[k] = obj[k];
    });
    return this.save();
  },

  lastOf: function (key) {
    if (!this.data) this.load();
    return this.data.lastSelections[key];
  },

  /** 設定と前回の選択だけを初期化（所持カード・デッキ・チュートリアルは残す） */
  resetSettings: function () {
    if (!this.data) this.load();
    const fresh = this.defaults();
    this.data.settings = fresh.settings;
    this.data.lastSelections = fresh.lastSelections;
    return this.save();
  },

  /** すべて初期化（仕様書 26.3） */
  reset: function () {
    this.data = this.defaults();
    this.repairs = [];
    return this.save();
  },

  /* =============================================================
     書き出し・読み込み（仕様書 26.1・26.2）
     ============================================================= */
  exportText: function () {
    if (!this.data) this.load();
    const out = JSON.parse(JSON.stringify(this.data));
    out.exportedAt = new Date().toISOString();
    return JSON.stringify(out, null, 2);
  },

  exportFileName: function () {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return 'マヨイビト_セーブデータ_' +
      d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
  },

  /**
   * 読み込む。中身を確かめてから差し替えます。
   * @returns { ok, reason, repairs }
   */
  importText: function (text) {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'ファイルの中身がJSONとして読めませんでした。' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, reason: 'セーブデータの形式ではありません。' };
    }
    const ver = parsed.schemaVersion;
    if (ver !== this.SCHEMA && ver !== 1 && parsed.storageSchemaVersion !== 1) {
      return { ok: false, reason: 'この版のセーブデータには対応していません。' };
    }

    // いったん既定値へ戻してから、確かめて入れ直す
    const backup = this.data;
    this.data = this.defaults();
    this.repairs = [];
    this.applyValidated(parsed);

    const r = this.save();
    if (!r.ok) {
      this.data = backup;   // 保存できなければ元へ戻す
      return { ok: false, reason: '端末へ保存できませんでした。' + r.reason };
    }
    return { ok: true, repairs: this.repairs.slice() };
  },
};

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SaveManager;
}
