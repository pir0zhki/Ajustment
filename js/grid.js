// 入力グリッド（日付 × 1時間枠）
// ------------------------------------------------------------
// ・ブラシ（○/△/×）を選んでクリック・ドラッグで塗る
// ・塗り始めたマスがすでにブラシと同じ記号なら、そのドラッグは「○に戻す」になる
// ・日付/時刻の見出しクリックで行・列をまとめて塗る
// ・Pointer Events を使うので、マウスでもタッチでもドラッグできる

import { h, slotKey, hoursOf, hourLabel, formatDate, addDays, STATES } from './util.js';

export class InputGrid {
  constructor(table, ev) {
    this.table = table;
    this.dates = ev.dates;
    this.hours = hoursOf(ev);
    this.validKeys = new Set(this.dates.flatMap((d) => this.hours.map((hr) => slotKey(d, hr))));
    this.state = {};          // ○ 以外の値だけを保持する
    this.cells = new Map();   // key -> td
    this.brush = 'ng';
    this.paintValue = null;   // ドラッグ中に塗る値（null = ドラッグしていない）
    this.lastKey = null;
    this.dirty = false;       // ユーザーが編集したか
    this.render();
    this.bindEvents();
  }

  /* ---------- 状態 ---------- */
  get(key) {
    return this.state[key] || 'ok';
  }

  set(key, value) {
    if (!this.validKeys.has(key) || this.get(key) === value) return;
    if (value === 'ok') delete this.state[key];
    else this.state[key] = value;
    this.dirty = true;
    this.updateCell(key);
  }

  getSlots() {
    return { ...this.state };
  }

  setSlots(slots) {
    this.state = {};
    for (const [k, v] of Object.entries(slots || {})) {
      if (this.validKeys.has(k) && (v === 'maybe' || v === 'ng')) this.state[k] = v;
    }
    for (const k of this.cells.keys()) this.updateCell(k);
    this.dirty = false;
  }

  /* ---------- まとめて操作 ---------- */
  rowKeys(date) {
    return this.hours.map((hr) => slotKey(date, hr));
  }

  colKeys(hour) {
    return this.dates.map((d) => slotKey(d, hour));
  }

  // 全部がブラシと同じ記号なら ○ に戻し、そうでなければブラシで塗る
  fill(keys) {
    const value = keys.every((k) => this.get(k) === this.brush) ? 'ok' : this.brush;
    keys.forEach((k) => this.set(k, value));
  }

  setAll(keys, value) {
    keys.forEach((k) => this.set(k, value));
  }

  copyFromPrevWeek(date) {
    const prev = addDays(date, -7);
    this.hours.forEach((hr) => this.set(slotKey(date, hr), this.get(slotKey(prev, hr))));
  }

  /* ---------- 描画 ---------- */
  updateCell(key) {
    const cell = this.cells.get(key);
    if (!cell) return;
    const v = this.get(key);
    cell.className = `cell s-${v}`;
    cell.textContent = STATES[v].symbol;
    cell.setAttribute('aria-label', `${cell.dataset.label} ${STATES[v].label}`);
  }

  render() {
    const headRow = () =>
      h('tr', {},
        h('th', { class: 'corner' }),
        this.hours.map((hr) =>
          h('th', { scope: 'col' },
            h('button', {
              type: 'button',
              class: 'head-btn',
              title: `${hourLabel(hr)}の列をまとめて塗る`,
              onclick: () => this.fill(this.colKeys(hr)),
            }, hourLabel(hr)))),
        h('th', {}));

    const dateSet = new Set(this.dates);
    const tbody = h('tbody');
    this.cells.clear();

    for (const date of this.dates) {
      const f = formatDate(date);
      const cells = this.hours.map((hr) => {
        const key = slotKey(date, hr);
        const td = h('td', { tabindex: '0', dataset: { key, label: `${f.md}(${f.wd}) ${hourLabel(hr)}` } });
        this.cells.set(key, td);
        return td;
      });

      tbody.append(
        h('tr', {},
          h('th', { scope: 'row', class: `row-head dow-${f.dow}` },
            h('button', {
              type: 'button',
              class: 'head-btn',
              title: 'この日をまとめて塗る',
              onclick: () => this.fill(this.rowKeys(date)),
            }, h('span', { class: 'md' }, f.md), h('span', { class: 'wd' }, `(${f.wd})`))),
          cells,
          h('td', { class: 'row-actions' },
            h('button', { type: 'button', class: 'link-btn', onclick: () => this.setAll(this.rowKeys(date), 'ok') }, 'すべて○'),
            h('button', { type: 'button', class: 'link-btn', onclick: () => this.setAll(this.rowKeys(date), 'ng') }, 'すべて×'),
            dateSet.has(addDays(date, -7)) &&
              h('button', { type: 'button', class: 'link-btn', onclick: () => this.copyFromPrevWeek(date) }, '前の週からコピー'))));
    }

    this.table.replaceChildren(h('thead', {}, headRow()), tbody);
    // 日数が多いときは下にも時刻の見出しを付ける（PDFの画面と同じ）
    if (this.dates.length > 7) this.table.append(h('tfoot', {}, headRow()));
    for (const k of this.cells.keys()) this.updateCell(k);
  }

  /* ---------- 操作 ---------- */
  bindEvents() {
    const cellOf = (node) => {
      const td = node?.closest?.('td[data-key]');
      return td && this.table.contains(td) ? td : null;
    };

    this.table.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = cellOf(e.target);
      if (!cell) return;
      e.preventDefault();
      const key = cell.dataset.key;
      this.paintValue = this.get(key) === this.brush ? 'ok' : this.brush;
      this.lastKey = key;
      this.set(key, this.paintValue);
    });

    // タッチでは最初の要素にポインターが捕捉されるため、座標からマスを探す
    window.addEventListener('pointermove', (e) => {
      if (!this.paintValue) return;
      const cell = cellOf(document.elementFromPoint(e.clientX, e.clientY));
      if (!cell || cell.dataset.key === this.lastKey) return;
      this.lastKey = cell.dataset.key;
      this.set(cell.dataset.key, this.paintValue);
    });

    const end = () => {
      this.paintValue = null;
      this.lastKey = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // キーボード操作（Tabで移動、Space/Enterで塗る）
    this.table.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const cell = cellOf(e.target);
      if (!cell) return;
      e.preventDefault();
      const key = cell.dataset.key;
      this.set(key, this.get(key) === this.brush ? 'ok' : this.brush);
    });
  }
}
