// index.html：イベント作成

import { isDemo, createEvent } from './db.js';
import { h, toast, WEEKDAYS, toDateStr, formatDateLong, getRecent, addRecent } from './util.js';

const $ = (id) => document.getElementById(id);
const MAX_DATES = 90;

const selected = new Set();
const today = toDateStr(new Date());
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();

if (isDemo) $('demo-banner').hidden = false;
setupHours();
renderCalendar();
renderChips();
renderRecent();

/* ---------- カレンダー ---------- */
function renderCalendar() {
  const first = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const offset = first.getDay();

  const nav = h('div', { class: 'cal-nav' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '前の月', onclick: () => moveMonth(-1) }, '‹'),
    h('div', { class: 'cal-title' }, `${viewYear}年${viewMonth + 1}月`),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '次の月', onclick: () => moveMonth(1) }, '›'));

  const grid = h('div', { class: 'cal-grid' });
  WEEKDAYS.forEach((w, i) =>
    grid.append(h('button', {
      type: 'button',
      class: `cal-wd dow-${i}`,
      title: `この月の${w}曜日をまとめて選択・解除`,
      onclick: () => toggleWeekday(i),
    }, w)));
  for (let i = 0; i < offset; i++) grid.append(h('div'));

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDateStr(new Date(viewYear, viewMonth, d));
    const isSel = selected.has(ds);
    grid.append(h('button', {
      type: 'button',
      class: `cal-day dow-${(offset + d - 1) % 7}${isSel ? ' selected' : ''}${ds === today ? ' today' : ''}`,
      disabled: ds < today,
      'aria-pressed': String(isSel),
      'aria-label': formatDateLong(ds),
      onclick: () => toggleDate(ds),
    }, d));
  }
  $('calendar').replaceChildren(nav, grid);
}

function moveMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  renderCalendar();
}

function addDate(ds) {
  if (selected.size >= MAX_DATES) {
    toast(`候補日は${MAX_DATES}日までです`, 'error');
    return false;
  }
  selected.add(ds);
  return true;
}

function toggleDate(ds) {
  if (selected.has(ds)) selected.delete(ds);
  else addDate(ds);
  refresh();
}

function toggleWeekday(dow) {
  const days = [];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    const ds = toDateStr(date);
    if (date.getDay() === dow && ds >= today) days.push(ds);
  }
  if (days.length && days.every((ds) => selected.has(ds))) days.forEach((ds) => selected.delete(ds));
  else for (const ds of days) if (!selected.has(ds) && !addDate(ds)) break;
  refresh();
}

function refresh() {
  renderCalendar();
  renderChips();
}

function renderChips() {
  const sorted = [...selected].sort();
  $('date-count').textContent = `${sorted.length}日選択中`;
  $('clear-dates').hidden = sorted.length === 0;
  $('date-chips').replaceChildren(
    ...sorted.map((ds) =>
      h('span', { class: 'date-chip' },
        formatDateLong(ds),
        h('button', {
          type: 'button',
          'aria-label': `${formatDateLong(ds)}を削除`,
          onclick: () => { selected.delete(ds); refresh(); },
        }, '×'))));
}

$('clear-dates').addEventListener('click', () => {
  selected.clear();
  refresh();
});

/* ---------- 時間帯 ---------- */
function setupHours() {
  for (let i = 0; i <= 23; i++) $('start-hour').append(h('option', { value: i }, `${i}:00`));
  for (let i = 1; i <= 24; i++) $('end-hour').append(h('option', { value: i }, `${i}:00`));
  $('start-hour').value = '9';
  $('end-hour').value = '21';
}

/* ---------- 最近のイベント ---------- */
function renderRecent() {
  const list = getRecent();
  if (!list.length) return;
  $('recent-list').replaceChildren(
    ...list.map((e) => h('li', {}, h('a', { href: `event.html?id=${encodeURIComponent(e.id)}` }, e.title))));
  $('recent').hidden = false;
}

/* ---------- 作成 ---------- */
$('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('title').value.trim();
  const startHour = Number($('start-hour').value);
  const endHour = Number($('end-hour').value);

  if (!title) {
    toast('イベント名を入力してください', 'error');
    $('title').focus();
    return;
  }
  if (selected.size === 0) return toast('候補日を1日以上選んでください', 'error');
  if (startHour >= endHour) return toast('終了時刻は開始時刻より後にしてください', 'error');

  const btn = $('create-btn');
  btn.disabled = true;
  btn.textContent = '作成中…';
  try {
    const id = await createEvent({
      title,
      creator: $('creator').value.trim(),
      description: $('description').value.trim(),
      dates: [...selected].sort(),
      startHour,
      endHour,
    });
    addRecent(id, title);
    location.href = `event.html?id=${id}&created=1`;
  } catch (err) {
    console.error(err);
    toast('作成に失敗しました。Firebaseの設定とセキュリティルールを確認してください。', 'error');
    btn.disabled = false;
    btn.textContent = 'イベントを作成して共有URLを発行';
  }
});
