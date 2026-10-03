/* =====================================================================
   v08-log.js ― 対戦ログ（Stage 4-3）
   ---------------------------------------------------------------------
   仕様書 第14部。

   ★もとになるのは既存の Game.state.log（文字列の並び）です。
     ゲーム側のログの作り方は変えていません。
     ここでやるのは「読みやすく見せる」ことだけです。

       ・ターンで区切って見出しを付ける（14.3）
       ・内部の処理だけの行を出さない（14.4）
       ・続けて起きた同じことをまとめる（14.4）
       ・カード名をタップできるようにする（14.5）
       ・古いものが上、新しいものが下。開いたら最新へ（14.2）
   ===================================================================== */

'use strict';

const V8Log = {

  _root: null,
  open_: false,

  /** 最新を追いかけているか（14.2） */
  follow: true,

  /** 前に描いたときの行数。増えたかどうかの判定に使う */
  _seen: 0,

  init: function (rootEl) {
    this._root = rootEl;
    const self = this;

    const scrim = rootEl.querySelector('#v8-log-scrim');
    if (scrim) {
      /* 枠外タップで対戦へ戻る（14.1）。その入力は閉じるためだけに使う */
      scrim.addEventListener('pointerdown', function (e) {
        self.close();
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }

    const body = rootEl.querySelector('#v8-log-body');
    if (body) {
      body.addEventListener('scroll', function () {
        /* いちばん下を見ているあいだだけ追いかける（14.2） */
        const bottom = body.scrollHeight - body.clientHeight - body.scrollTop;
        self.follow = bottom < 24;
        self._syncMore();
      });
    }

    const more = rootEl.querySelector('#v8-log-more');
    if (more) {
      more.onclick = function () {
        self.follow = true;
        self._toBottom();
        self._syncMore();
      };
    }
    return this;
  },

  isOpen: function () { return this.open_; },

  open: function () {
    if (!this._root) return;
    this.open_ = true;
    this.follow = true;              // 開いた直後は最新から（14.2）
    this._root.classList.add('v8-log-on');
    this.render(true);
  },

  close: function () {
    this.open_ = false;
    if (this._root) this._root.classList.remove('v8-log-on');
  },

  /* =============================================================
     ★出さない行（14.4）
     -------------------------------------------------------------
     「実際に起こった結果」だけを書きます。
     内部の下ごしらえ（シャッフルなど）は出しません。
     ============================================================= */
  HIDE: [/^シード：/, /^シャッフル/, /^先攻：/],

  isNoise: function (line) {
    return this.HIDE.some(function (re) { return re.test(line); });
  },

  /* =============================================================
     ターンで区切る（14.3）
     -------------------------------------------------------------
     既存のログには「── ターン3｜ヨマモリ村 第2ターン 開始」という
     区切りの行が入っています。これを見出しに使います。
     ============================================================= */
  TURN_RE: /^──\s*ターン(\d+)｜(.+?)\s+第(\d+)ターン/,

  /**
   * 行の並びを、ターンのまとまりへ分ける。
   * @return {Array<{title:string, lines:string[]}>}
   */
  group: function (lines, meSide, labelOf) {
    const out = [];
    let cur = { title: '対戦開始まで', lines: [] };
    const self = this;

    (lines || []).forEach(function (raw, i) {
      const line = String(raw);
      const m = line.match(self.TURN_RE);
      if (m) {
        if (cur.lines.length) out.push(cur);
        const who = m[2];
        const mine = (labelOf && labelOf(meSide) === who);
        cur = { title: m[1] + 'ターン目　' + (mine ? '自分のターン' : '相手のターン'), lines: [] };
        return;
      }
      if (self.isNoise(line)) return;
      /* 何行目だったかを覚えておく。枚数の変化を出すのに使う */
      cur.lines.push({ text: line, from: i, to: i });
    });
    if (cur.lines.length) out.push(cur);
    return out;
  },

  /* =============================================================
     ★続けて起きた同じことをまとめる（14.4）
     -------------------------------------------------------------
     「ドロー：ヨマモリ村 A」「ドロー：ヨマモリ村 B」が続いたら
     「ドロー：ヨマモリ村 A、B」の1行にします。
     ============================================================= */
  MERGE_RE: /^(ドロー|トラッシュへ|手札へ)：(\S+)\s+(.+)$/,

  merge: function (lines) {
    const out = [];
    const self = this;
    (lines || []).forEach(function (it) {
      const item = (typeof it === 'string') ? { text: it, from: -1, to: -1 } : it;
      const m = item.text.match(self.MERGE_RE);
      const prev = out.length ? out[out.length - 1] : null;
      if (m && prev) {
        const p = prev.text.match(self.MERGE_RE);
        if (p && p[1] === m[1] && p[2] === m[2]) {
          prev.text = p[1] + '：' + p[2] + ' ' + p[3] + '、' + m[3];
          prev.to = item.to;      // まとめた範囲の終わりを更新する
          return;
        }
      }
      out.push({ text: item.text, from: item.from, to: item.to });
    });
    return out;
  },

  /* =============================================================
     描く
     ============================================================= */
  render: function (jump) {
    if (!this._root || !this.open_) return;
    const body = this._root.querySelector('#v8-log-body');
    if (!body) return;
    if (typeof Game === 'undefined' || !Game.state) return;

    const lines = Game.state.log || [];
    const meSide = (typeof V8State !== 'undefined') ? V8State.bottomSide() : 'village';
    const labelOf = (typeof Game.labelOf === 'function')
      ? function (s) { return Game.labelOf(s); } : null;

    const keep = body.scrollTop;
    body.innerHTML = '';
    const doc = document;
    const self = this;

    this.group(lines, meSide, labelOf).forEach(function (blk) {
      const h = doc.createElement('h4');
      h.className = 'v8-log__turn';
      h.textContent = blk.title;
      body.appendChild(h);

      self.merge(blk.lines).forEach(function (item) {
        const p = doc.createElement('p');
        p.className = 'v8-log__line';
        self._withLinks(doc, p, item.text);

        const side = self.sideOfLine(item.text, labelOf);
        const d = self.deltaText(item.from, item.to, side, labelOf);
        if (d) {
          const s = doc.createElement('span');
          s.className = 'v8-log__delta';
          s.textContent = d;
          p.appendChild(s);
        }
        body.appendChild(p);
      });
    });

    this._seen = lines.length;
    if (jump || this.follow) this._toBottom();
    else body.scrollTop = keep;
    this._syncMore();
  },

  /* =============================================================
     ★領域の枚数がどう変わったかを添える（ダロクの指示）
     -------------------------------------------------------------
     「ドロー：ヨマモリ村 ルナ（手札 2→3、山札 33→32）」のように出します。
     ログの行が増えた瞬間の枚数を控えてあるので、その前後を比べます。

     どの領域を出すかは決め打ちにせず、**実際に変わったものだけ**を出します。
     こうすると、サーチでも墓地肥やしでも同じ仕組みで正しく出ます。
     ============================================================= */
  ZONE_LABEL: { hand: '手札', deck: '山札', trash: 'トラッシュ', lost: 'ロスト' },

  /** 行が増えた瞬間の枚数。counts[n] = n行目まで進んだ時点の枚数 */
  counts: {},

  noteCounts: function (len, snap) {
    if (snap) this.counts[len] = snap;
  },

  /**
   * from 行の直前 → to 行の時点 で変わった枚数を文字にする。
   * @return {string} 変化が無ければ空文字
   */
  deltaText: function (from, to, sideOfLine, labelOf) {
    const a = this.counts[from];      // その行より前の時点
    const b = this.counts[to + 1];    // その行まで進んだ時点
    if (!a || !b) return '';

    const self = this;
    const parts = [];
    ['village', 'mansion'].forEach(function (side) {
      if (!a[side] || !b[side]) return;
      const zones = [];
      Object.keys(self.ZONE_LABEL).forEach(function (z) {
        if (a[side][z] === b[side][z]) return;
        zones.push(self.ZONE_LABEL[z] + ' ' + a[side][z] + '→' + b[side][z]);
      });
      if (!zones.length) return;
      /* その行の主が別の側なら、どちらの話か分かるように名前を添える */
      const label = (labelOf && side !== sideOfLine) ? (labelOf(side) + 'の') : '';
      parts.push(label + zones.join('、'));
    });
    return parts.length ? ('（' + parts.join(' ／ ') + '）') : '';
  },

  /** 行の頭にある陣営名から、どちらの側かを求める */
  sideOfLine: function (text, labelOf) {
    if (!labelOf) return null;
    const m = String(text).match(/^[^：]+：(\S+)/);
    if (!m) return null;
    if (labelOf('village') === m[1]) return 'village';
    if (labelOf('mansion') === m[1]) return 'mansion';
    return null;
  },

  /* =============================================================
     ★カード名をタップできるようにする（14.5）
     -------------------------------------------------------------
     ログにはカードの名前しか残っていません。
     開くのは「そのカード本来の情報」です。
     そのときの能力値を控えておくようなことはしません。
     ============================================================= */
  _names: null,

  cardNames: function () {
    if (this._names) return this._names;
    const list = [];
    if (typeof CARD_MASTER !== 'undefined') {
      Object.keys(CARD_MASTER).forEach(function (id) {
        const m = CARD_MASTER[id];
        if (m && m.name) list.push({ id: id, name: m.name });
      });
    }
    /* 長い名前から先に探す（短い名前が先に当たるのを防ぐ） */
    list.sort(function (a, b) { return b.name.length - a.name.length; });
    this._names = list;
    return list;
  },

  _withLinks: function (doc, el, line) {
    const names = this.cardNames();
    let rest = String(line);
    let guard = 0;

    while (rest.length && guard++ < 40) {
      let hit = null;
      names.forEach(function (n) {
        const at = rest.indexOf(n.name);
        if (at < 0) return;
        if (!hit || at < hit.at) hit = { at: at, n: n };
      });
      if (!hit) break;

      if (hit.at > 0) el.appendChild(doc.createTextNode(rest.slice(0, hit.at)));
      const a = doc.createElement('span');
      a.className = 'v8-log__card';
      a.textContent = hit.n.name;
      a.setAttribute('data-card-id', hit.n.id);
      a.onclick = function () {
        if (typeof V8Detail !== 'undefined') V8Detail.openCard(hit.n.id);
      };
      el.appendChild(a);
      rest = rest.slice(hit.at + hit.n.name.length);
    }
    if (rest.length) el.appendChild(doc.createTextNode(rest));
  },

  /* =============================================================
     新しいログの知らせ（14.2）
     ============================================================= */
  onNewLines: function () {
    if (!this.open_) return;
    const n = (typeof Game !== 'undefined' && Game.state) ? (Game.state.log || []).length : 0;
    if (n === this._seen) return;
    this.render(false);
  },

  _toBottom: function () {
    const body = this._root && this._root.querySelector('#v8-log-body');
    if (body) body.scrollTop = body.scrollHeight;
  },

  _syncMore: function () {
    if (!this._root) return;
    const more = this._root.querySelector('#v8-log-more');
    if (more) more.style.display = this.follow ? 'none' : 'block';
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { V8Log: V8Log };
}
