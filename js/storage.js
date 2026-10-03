/* =====================================================================
   storage.js  ―  v0.3の呼び出しを SaveManager へ橋渡しする
   ---------------------------------------------------------------------
   v0.4では保存を save-manager.js へ集約しました（仕様書 25.2）。
   ただ、既存の画面（screens.js・preview.js）は Storage.get / set を
   あちこちから呼んでいます。呼び出し側をいっぺんに書き換えると、
   保存の作り替えと画面の作り替えが同時に走って原因を切り分けにくくなります。

   そこで、この薄い層を残して SaveManager へ渡すだけにします。
   画面側の書き換えは、それぞれの Stage で少しずつ行います。

   ＊新しく書くコードは SaveManager を直接使ってください。
   ===================================================================== */

'use strict';

const Storage = {

  load: function () {
    return SaveManager.load();
  },

  save: function () {
    return SaveManager.save().ok;
  },

  get: function (key) {
    return SaveManager.get(key);
  },

  set: function (key, value) {
    SaveManager.set(key, value);
  },

  remember: function (obj) {
    SaveManager.remember(obj);
  },

  lastOf: function (key) {
    return SaveManager.lastOf(key);
  },

  resetSettings: function () {
    SaveManager.resetSettings();
  },

  /* --- 旧初心者ガイド（v0.4 Stage B で削除します：仕様書 18） ------
     いまは呼び出し元が残っているので、何もしない関数として置いておきます。
     ガイドの完了記録は v0.4 では保存しません（仕様書 25.5）。
     ---------------------------------------------------------------- */
  isGuideDone: function () { return false; },
  markGuideDone: function () {},
  markGuideAllDone: function () {},
  resetGuide: function () {},
};
