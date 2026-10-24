// 汎用ユーティリティ

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 回答の状態。未入力のマスは "ok"（○）として扱う
export const STATES = {
  ok:    { symbol: '○', label: '参加可能' },
  maybe: { symbol: '△', label: '未定' },
  ng:    { symbol: '×', label: '参加不可' },
};

export const pad2 = (n) => String(n).padStart(2, '0');

/* ---------- 日付 ---------- */
// "YYYY-MM-DD" ⇔ Date（ローカル時刻）
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function formatDate(str) {
  const d = parseDate(str);
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, wd: WEEKDAYS[d.getDay()], dow: d.getDay() };
}
export function formatDateLong(str) {
  const f = formatDate(str);
  return `${f.md}(${f.wd})`;
}

/* ---------- 時間枠 ---------- */
// マスのキー: "2026-10-26_09"（文字列順 = 時系列順）
export const slotKey = (date, hour) => `${date}_${pad2(hour)}`;
export function hoursOf(ev) {
  const list = [];
  for (let h = ev.startHour; h < ev.endHour; h++) list.push(h);
  return list;
}
export const hourLabel = (h) => `${h}:00`;
export const rangeLabel = (start, end) => `${start}:00〜${end}:00`;

/* ---------- ID・名前 ---------- */
// 推測されにくいイベントID（32文字種 × 12桁 ≒ 60bit）
export function randomId(len = 12) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

// 表記ゆれ（全角/半角・前後の空白）をそろえる
export const normalizeName = (s) => String(s).normalize('NFKC').trim().replace(/\s+/g, ' ');

// 名前から回答のドキュメントIDを作る（同じ名前 → 同じID → 上書き）
export async function nameKey(name) {
  const norm = normalizeName(name);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
    return Array.from(new Uint8Array(buf).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return encodeURIComponent(norm).replace(/\./g, '%2E');
}

/* ---------- DOM ---------- */
// 要素生成ヘルパー。innerHTML を使わないので、名前などに HTML が含まれても安全
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function toast(message, type = 'info') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = h('div', { id: 'toast-box', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast toast-${type}` }, message);
  box.append(t);
  setTimeout(() => {
    t.classList.add('hide');
    setTimeout(() => t.remove(), 300);
  }, type === 'error' ? 4500 : 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* ---------- localStorage（使えない環境でも落ちないように） ---------- */
export function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 何もしない */ }
}

const RECENT_KEY = 'chosei:recent';
export function getRecent() {
  try { return JSON.parse(storageGet(RECENT_KEY)) || []; } catch { return []; }
}
export function addRecent(id, title) {
  const list = getRecent().filter((e) => e.id !== id);
  list.unshift({ id, title, at: Date.now() });
  storageSet(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
}
