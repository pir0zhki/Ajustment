// event.html：回答入力・回答者一覧・集計

import { isDemo, getEvent, saveResponse, subscribeResponses } from './db.js';
import { InputGrid } from './grid.js';
import { renderSummary } from './summary.js';
import {
  h, toast, copyText, addRecent, normalizeName, storageGet, storageSet,
  formatDateLong, rangeLabel,
} from './util.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const eventId = params.get('id');
const NAME_KEY = `chosei:name:${eventId}`;

let ev = null;
let grid = null;
let responses = [];
let firstSnapshot = true;

init();

async function init() {
  if (isDemo) $('demo-banner').hidden = false;

  if (!eventId || !/^[a-z0-9]{6,32}$/.test(eventId)) {
    return showError('イベントが指定されていません。URLをご確認ください。');
  }
  try {
    ev = await getEvent(eventId);
  } catch (err) {
    console.error(err);
    return showError('イベントの読み込みに失敗しました。時間をおいて再度お試しください。');
  }
  if (!ev) return showError('イベントが見つかりませんでした。URLをご確認ください。');

  renderHeader();
  grid = new InputGrid($('input-grid'), ev);
  setupPalette();
  setupForm();

  $('loading').hidden = true;
  $('app').hidden = false;
  addRecent(eventId, ev.title);

  if (params.has('created')) {
    toast('イベントを作成しました。URLを参加者に共有してください。', 'success');
    history.replaceState(null, '', shareUrl());
  }

  subscribeResponses(eventId, onResponses, (err) => {
    console.error(err);
    toast('回答の取得に失敗しました。ページを再読み込みしてください。', 'error');
  });
}

function showError(message) {
  $('loading').hidden = true;
  $('error-message').textContent = message;
  $('error').hidden = false;
}

const shareUrl = () => `${location.origin}${location.pathname}?id=${eventId}`;

/* ---------- イベント情報 ---------- */
function renderHeader() {
  document.title = `${ev.title} - 日程調整ツール`;
  $('ev-title').textContent = ev.title;
  $('ev-creator').textContent = ev.creator ? `👤 作成者: ${ev.creator}` : '';
  $('ev-period').textContent =
    `🗓 候補: ${formatDateLong(ev.dates[0])}〜${formatDateLong(ev.dates.at(-1))}（${ev.dates.length}日）・${rangeLabel(ev.startHour, ev.endHour)}`;
  if (ev.description) {
    $('ev-desc').textContent = ev.description;
    $('ev-desc').hidden = false;
  }
  $('share-url').value = shareUrl();
  $('share-url').addEventListener('focus', (e) => e.target.select());
  $('copy-btn').addEventListener('click', async () => {
    const ok = await copyText(shareUrl());
    toast(ok ? 'URLをコピーしました' : 'コピーできませんでした。URLを選択してコピーしてください', ok ? 'success' : 'error');
  });
}

/* ---------- ブラシ ---------- */
function setupPalette() {
  const buttons = [...$('palette').querySelectorAll('.brush')];
  const select = (brush) => {
    grid.brush = brush;
    buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.brush === brush)));
  };
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.brush)));
  select('ng');
}

/* ---------- 回答フォーム ---------- */
function setupForm() {
  $('name').addEventListener('input', updateOverwriteNote);

  $('reset-btn').addEventListener('click', () => {
    grid.setSlots({});
    $('name').value = '';
    $('comment').value = '';
    updateOverwriteNote();
    toast('入力をリセットしました');
  });

  $('response-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = normalizeName($('name').value);
    const comment = $('comment').value.trim();
    if (!name) {
      toast('お名前を入力してください', 'error');
      $('name').focus();
      return;
    }
    if (name.length > 30) return toast('お名前は30文字以内で入力してください', 'error');
    if (comment.length > 200) return toast('コメントは200文字以内で入力してください', 'error');

    const btn = $('submit-btn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '送信中…';
    try {
      const overwritten = await saveResponse(eventId, { name, comment, slots: grid.getSlots() });
      storageSet(NAME_KEY, name);
      grid.dirty = false;
      $('name').value = name;
      toast(overwritten ? `${name}さんの回答を上書きしました` : '回答を送信しました。ありがとうございます！', 'success');
    } catch (err) {
      console.error(err);
      toast('送信に失敗しました。通信状況を確認して、もう一度お試しください。', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

const findByName = (name) => {
  const target = normalizeName(name);
  return target ? responses.find((r) => normalizeName(r.name) === target) : null;
};

function updateOverwriteNote() {
  const r = findByName($('name').value);
  const note = $('overwrite-note');
  note.hidden = !r;
  if (r) note.textContent = `⚠ 「${r.name}」さんの回答がすでにあります。送信すると上書きされます。`;
}

function loadResponse(r, notify) {
  grid.setSlots(r.slots);
  $('name').value = r.name;
  $('comment').value = r.comment || '';
  updateOverwriteNote();
  if (notify) {
    toast(`${r.name}さんの回答を読み込みました`);
    $('input-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- 回答一覧・集計 ---------- */
function onResponses(list) {
  responses = list;
  renderResponders();
  renderSummary({ top: $('top-list'), table: $('summary-grid'), detail: $('slot-detail') }, ev, responses);
  updateOverwriteNote();

  // この端末で前回回答した名前があれば、最初の1回だけ自動で読み込む
  if (firstSnapshot) {
    firstSnapshot = false;
    const saved = storageGet(NAME_KEY);
    const mine = saved && findByName(saved);
    if (mine && !grid.dirty && !$('name').value) loadResponse(mine, false);
  }
}

function renderResponders() {
  const items = responses.length
    ? h('ul', { class: 'resp-list' },
        responses.map((r) =>
          h('li', { class: 'resp-item' },
            h('button', { type: 'button', class: 'resp-name', onclick: () => loadResponse(r, true) }, r.name),
            r.comment && h('span', { class: 'resp-comment' }, r.comment))))
    : h('p', { class: 'resp-empty' }, 'まだ回答がありません。');

  $('responders').replaceChildren(
    h('div', { class: 'resp-box' },
      h('div', { class: 'resp-head' }, `回答者一覧（${responses.length}人）`),
      items));
}
