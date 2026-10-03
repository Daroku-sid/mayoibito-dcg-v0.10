/* =====================================================================
   result.js  ―  対戦結果のまとめと、コピー（仕様書 25・26）
   ---------------------------------------------------------------------
   リザルト画面に出す「対戦の条件」と、
   制作者へ送ってもらうための貼り付け用の文章を作ります。

   不具合の報告に使うものなので、
   同じ対戦をこちらで再現できるだけの情報（デッキ・難易度・先攻・シード）を
   必ず入れています。
   ===================================================================== */

'use strict';

const Result = {

  DECK_LABEL: { village: 'ヨマモリ村', mansion: '黒薔薇の館' },
  DIFF_LABEL: {
    weak: '弱', normal: '中', strong: '強', expert: 'エキスパート',
    unfair: '理不尽（特殊難易度）',      // 仕様書 10.2・26
  },
  MODE_LABEL: { cpu: 'CPU対戦', solo: 'ひとり回し', watch: 'CPU観戦' },

  /** 「『マヨイビト』DCG v0.3.0」のような見出し */
  appLabel: function () {
    if (typeof APP_TITLE !== 'undefined') return APP_TITLE + ' ' + APP_VERSION_LABEL;
    return '『マヨイビト』DCG';
  },

  /* =============================================================
     画面に出す「対戦の条件」（仕様書 25.1・25.3）
     -------------------------------------------------------------
     [見出し, 中身] の配列で返します。
     ============================================================= */
  infoRows: function (st, last) {
    const rows = [];
    if (!st) return rows;
    const m = last || {};
    const mode = m.mode || 'solo';

    if (mode === 'cpu') {
      rows.push(['自分のデッキ', this.DECK_LABEL[m.playerDeck] || '-']);
      rows.push(['CPUのデッキ', this.DECK_LABEL[m.cpuDeck] || '-']);
      rows.push(['CPU難易度', this.DIFF_LABEL[m.difficulty] || '-']);
      rows.push(['先攻・後攻', m.playerFirst ? '自分が先攻' : '自分が後攻']);
    } else if (mode === 'watch') {
      rows.push(['CPU 1', (this.DECK_LABEL[m.deck1] || '-') + '／' + (this.DIFF_LABEL[m.diff1] || '-')]);
      rows.push(['CPU 2', (this.DECK_LABEL[m.deck2] || '-') + '／' + (this.DIFF_LABEL[m.diff2] || '-')]);
      rows.push(['先攻', m.firstIsCpu1 ? 'CPU 1' : 'CPU 2']);
    } else {
      rows.push(['プレイヤー1', this.DECK_LABEL[m.deck1] || '-']);
      rows.push(['プレイヤー2', this.DECK_LABEL[m.deck2] || '-']);
      rows.push(['先攻', m.firstIsP1 === false ? 'プレイヤー2' : 'プレイヤー1']);
    }

    rows.push(['経過ターン', st.gameOver ? (st.gameOver.turnCount + 'ターン') : '-']);
    rows.push(['シード', st.seed || '-']);
    return rows;
  },

  /** 決着の理由を1行にまとめる */
  reasonText: function (st) {
    const over = st && st.gameOver;
    if (!over) return '';
    if (over.draw) {
      return over.losers.map(function (l) {
        return Game.labelOf(l.side) + '＝' + l.reasons.join('／');
      }).join('、');
    }
    const loser = over.losers[0];
    return Game.labelOf(loser.side) + 'の敗北：' + loser.reasons.join('／');
  },

  /* =============================================================
     貼り付け用の文章（仕様書 26）
     ============================================================= */
  copyText: function (st, last) {
    if (!st) return '';
    const m = last || {};
    const mode = m.mode || 'solo';
    const over = st.gameOver;
    const lines = [];

    lines.push(this.appLabel());
    lines.push('モード：' + (this.MODE_LABEL[mode] || mode));

    if (mode === 'cpu') {
      lines.push('自分：' + (this.DECK_LABEL[m.playerDeck] || '-'));
      lines.push('CPU：' + (this.DECK_LABEL[m.cpuDeck] || '-'));
      lines.push('難易度：' + (this.DIFF_LABEL[m.difficulty] || '-'));
      lines.push('自分：' + (m.playerFirst ? '先攻' : '後攻'));
      if (over) {
        // CPU対戦では、自分の席はつねに village（screens.js の割り当て）
        lines.push('結果：' + (over.draw ? '引き分け'
          : (over.winner === 'village' ? '勝利' : '敗北')));
      }
    } else if (mode === 'watch') {
      lines.push('CPU 1：' + (this.DECK_LABEL[m.deck1] || '-') + '／' + (this.DIFF_LABEL[m.diff1] || '-'));
      lines.push('CPU 2：' + (this.DECK_LABEL[m.deck2] || '-') + '／' + (this.DIFF_LABEL[m.diff2] || '-'));
      lines.push('先攻：' + (m.firstIsCpu1 ? 'CPU 1' : 'CPU 2'));
      if (over) {
        lines.push('結果：' + (over.draw ? '引き分け'
          : (over.winner === 'village' ? 'CPU 1の勝利' : 'CPU 2の勝利')));
      }
    } else {
      lines.push('プレイヤー1：' + (this.DECK_LABEL[m.deck1] || '-'));
      lines.push('プレイヤー2：' + (this.DECK_LABEL[m.deck2] || '-'));
      lines.push('先攻：' + (m.firstIsP1 === false ? 'プレイヤー2' : 'プレイヤー1'));
      if (over) {
        lines.push('結果：' + (over.draw ? '引き分け'
          : (over.winner === 'village' ? 'プレイヤー1の勝利' : 'プレイヤー2の勝利')));
      }
    }

    if (over) {
      lines.push('勝敗理由：' + this.reasonText(st));
      lines.push('終了ターン：' + over.turnCount);
      lines.push('決着した場面：' + (over.phaseLabel || '-'));
    }
    lines.push('シード：' + st.seed);

    const env = this.envText();
    if (env) lines.push('端末：' + env);

    return lines.join('\n');
  },

  /** ブラウザとOSのおおよその種別（不具合の切り分け用：仕様書 26） */
  envText: function () {
    try {
      const ua = navigator.userAgent || '';
      let os = 'その他';
      if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
      else if (/Android/.test(ua)) os = 'Android';
      else if (/Mac OS X/.test(ua)) os = 'macOS';
      else if (/Windows/.test(ua)) os = 'Windows';

      let br = 'その他';
      if (/Edg\//.test(ua)) br = 'Edge';
      else if (/CriOS|Chrome\//.test(ua)) br = 'Chrome';
      else if (/Firefox\//.test(ua)) br = 'Firefox';
      else if (/Safari\//.test(ua)) br = 'Safari';

      return os + ' / ' + br;
    } catch (e) {
      return '';
    }
  },

  /* =============================================================
     クリップボードへ写す（仕様書 26・33-11）
     -------------------------------------------------------------
     うまくいかない環境があるので、失敗したら
     「選んでコピーできる枠」に出す、という逃げ道を用意します。
     ============================================================= */
  copy: function (text, onOk, onFail) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onOk, onFail);
        return;
      }
    } catch (e) { /* 下の逃げ道へ */ }
    onFail();
  },
};

/* Node.jsでのテスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Result;
}
