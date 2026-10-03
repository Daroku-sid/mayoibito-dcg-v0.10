/* =====================================================================
   version.js  ―  版の番号（仕様書 31・32.9）
   ---------------------------------------------------------------------
   版の番号をあちこちに書くと、必ずどこかが古いまま残ります。
   ここ1か所だけを直せば、次のすべてに反映されます。

     ・タイトル画面の表示
     ・対戦結果のコピー
     ・不具合の記録

   更新したときは、index.html の読み込みに付けている ?v= の数字も
   同じものに揃えてください（古いファイルを掴んだままになるのを防ぐため）。
   ===================================================================== */

'use strict';

const APP_VERSION = '0.10.2';
const APP_TITLE = '『マヨイビト』DCG';

/* 画面やコピーに出す表記（例：v0.6.10） */
const APP_VERSION_LABEL = 'v' + APP_VERSION;

/* ★ブラウザのタブに出す題名も、ここから作ります（v0.6.10）。
   index.html に版を直接書いていたため、v0.3 のまま取り残されていました。
   一箇所を直せば全部そろうようにしておきます。 */
if (typeof document !== 'undefined') {
  document.title = 'マヨイビト ' + APP_VERSION_LABEL;
}

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    APP_VERSION: APP_VERSION,
    APP_TITLE: APP_TITLE,
    APP_VERSION_LABEL: APP_VERSION_LABEL,
  };
}
