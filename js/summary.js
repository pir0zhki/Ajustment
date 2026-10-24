// 集計表・おすすめ候補・内訳表示

import { h, slotKey, hoursOf, hourLabel, formatDate, formatDateLong, rangeLabel } from './util.js';

let selectedKey = null;

/** マスごとに ○/△/× の名前リストを作る */
export function aggregate(ev, responses) {
  const map = new Map();
  for (const date of ev.dates) {
    for (const hour of hoursOf(ev)) {
      const key = slotKey(date, hour);
      const s = { key, date, hour, ok: [], maybe: [], ng: [] };
      for (const r of responses) {
        const v = r.slots?.[key];
        (v === 'maybe' || v === 'ng' ? s[v] : s.ok).push(r.name);
      }
      map.set(key, s);
    }
  }
  return map;
}

/**
 * 同じ日の連続した時間で人数が同じものを1つの時間帯にまとめ、
 * ×が少ない → ○が多い → 長い → 早い 順に並べる
 */
export function rankBlocks(ev, agg) {
  const blocks = [];
  for (const date of ev.dates) {
    let cur = null;
    for (const hour of hoursOf(ev)) {
      const s = agg.get(slotKey(date, hour));
      const sig = `${s.ok.length}/${s.maybe.length}/${s.ng.length}`;
      if (cur && cur.sig === sig) {
        cur.end = hour + 1;
        cur.keys.push(s.key);
      } else {
        cur = { date, start: hour, end: hour + 1, sig, keys: [s.key], ok: s.ok.length, maybe: s.maybe.length, ng: s.ng.length };
        blocks.push(cur);
      }
    }
  }
  return blocks.sort((a, b) =>
    a.ng - b.ng ||
    b.ok - a.ok ||
    (b.end - b.start) - (a.end - a.start) ||
    a.keys[0].localeCompare(b.keys[0]));
}

const countBadges = (ok, maybe, ng) =>
  h('span', { class: 'counts' },
    h('span', { class: 'badge b-ok' }, `○ ${ok}`),
    h('span', { class: 'badge b-maybe' }, `△ ${maybe}`),
    h('span', { class: 'badge b-ng' }, `× ${ng}`));

/** 集計エリア全体を描画する */
export function renderSummary(els, ev, responses) {
  const agg = aggregate(ev, responses);
  const blocks = responses.length ? rankBlocks(ev, agg) : [];
  const rerender = () => renderSummary(els, ev, responses);
  const select = (key) => {
    selectedKey = key;
    rerender();
  };

  renderTop(els.top, blocks, responses.length, (key) => {
    select(key);
    els.detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  renderTable(els.table, ev, agg, responses.length, new Set(blocks[0]?.keys || []), select);
  renderDetail(els.detail, agg);
}

function renderTop(root, blocks, n, onPick) {
  if (!n) {
    root.replaceChildren(h('li', { class: 'top-empty' }, '回答が集まると、おすすめの時間帯が表示されます。'));
    return;
  }
  root.replaceChildren(
    ...blocks.slice(0, 3).map((b, i) =>
      h('li', {},
        h('button', { type: 'button', class: 'top-item', onclick: () => onPick(b.keys[0]) },
          h('span', { class: 'rank' }, i + 1),
          h('span', { class: 'top-when' }, `${formatDateLong(b.date)} ${rangeLabel(b.start, b.end)}`),
          b.ng === 0 && b.maybe === 0 && h('span', { class: 'badge tag-all' }, '全員参加可能'),
          countBadges(b.ok, b.maybe, b.ng)))));
}

function renderTable(table, ev, agg, n, topKeys, onSelect) {
  const hours = hoursOf(ev);
  const headRow = () =>
    h('tr', {},
      h('th', { class: 'corner' }),
      hours.map((hr) => h('th', { scope: 'col', class: 'col-label' }, hourLabel(hr))));

  const tbody = h('tbody');
  for (const date of ev.dates) {
    const f = formatDate(date);
    tbody.append(
      h('tr', {},
        h('th', { scope: 'row', class: `row-head dow-${f.dow}` },
          h('div', { class: 'col-label' }, h('span', { class: 'md' }, f.md), h('span', { class: 'wd' }, `(${f.wd})`))),
        hours.map((hr) => {
          const s = agg.get(slotKey(date, hr));
          const classes = ['sum-cell'];
          const style = {};
          if (n) {
            if (s.ng.length === 0 && s.maybe.length === 0) classes.push('lv-best');
            else if (s.ng.length === 0) classes.push('lv-good');
            else style.background = `rgba(239, 68, 68, ${(0.08 + 0.42 * (s.ng.length / n)).toFixed(3)})`;
          }
          if (topKeys.has(s.key)) classes.push('is-top');
          if (s.key === selectedKey) classes.push('is-selected');

          const tip = [
            `${formatDateLong(date)} ${rangeLabel(hr, hr + 1)}`,
            `○ ${s.ok.join('、') || '—'}`,
            `△ ${s.maybe.join('、') || '—'}`,
            `× ${s.ng.join('、') || '—'}`,
          ].join('\n');

          return h('td', { class: classes.join(' '), style, title: tip, onclick: () => onSelect(s.key) },
            h('div', { class: 'sum-ok' }, `○${s.ok.length}`),
            h('div', { class: 'sum-sub' }, `△${s.maybe.length} ×${s.ng.length}`));
        })));
  }

  table.replaceChildren(h('thead', {}, headRow()), tbody);
  if (ev.dates.length > 7) table.append(h('tfoot', {}, headRow()));
}

function renderDetail(root, agg) {
  const s = selectedKey && agg.get(selectedKey);
  if (!s) {
    root.replaceChildren(h('p', { class: 'none', style: { margin: 0 } }, 'マスをクリックすると、その時間の回答者の内訳が表示されます。'));
    return;
  }
  const group = (cls, label, names) =>
    h('div', { class: 'detail-group' },
      h('span', { class: `badge ${cls}` }, `${label} ${names.length}人`),
      names.length
        ? h('div', { class: 'name-chips' }, names.map((n) => h('span', { class: 'name-chip' }, n)))
        : h('span', { class: 'none' }, '—'));

  root.replaceChildren(
    h('p', { class: 'detail-title' }, `${formatDateLong(s.date)} ${rangeLabel(s.hour, s.hour + 1)}`),
    group('b-ok', '○ 参加可能', s.ok),
    group('b-maybe', '△ 未定', s.maybe),
    group('b-ng', '× 参加不可', s.ng));
}
