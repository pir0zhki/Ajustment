// データアクセス層
// ------------------------------------------------------------
// firebase-config.js が未設定ならデモモード（localStorage）、
// 設定済みなら Firestore を使う。画面側はどちらかを意識しない。
//
// Firestore のデータ構造
//   events/{eventId}
//     title, creator, description, dates[], startHour, endHour, createdAt
//   events/{eventId}/responses/{nameKey}
//     name, comment, slots{ "2026-10-26_09": "maybe" | "ng" }, createdAt, updatedAt
//   ※ slots には ○ 以外のマスだけを保存する（未記載 = ○）

import { firebaseConfig } from './firebase-config.js';
import { randomId, nameKey } from './util.js';

export const isDemo = !firebaseConfig?.apiKey || firebaseConfig.apiKey.startsWith('YOUR_');

const SDK_URL = 'https://www.gstatic.com/firebasejs/10.12.2';
let firestorePromise = null;

// Firebase SDK は必要になったときに CDN から読み込む（デモモードでは読み込まない）
function firestore() {
  if (!firestorePromise) {
    firestorePromise = (async () => {
      const { initializeApp } = await import(`${SDK_URL}/firebase-app.js`);
      const fs = await import(`${SDK_URL}/firebase-firestore.js`);
      const app = initializeApp(firebaseConfig);
      return { fs, db: fs.getFirestore(app) };
    })();
  }
  return firestorePromise;
}

/* ---------- デモモード用ストア ---------- */
const DEMO_KEY = 'chosei:demo-db';
const DEMO_EVENT = 'chosei-demo-change';
const demo = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY)) || { events: {}, responses: {} };
    } catch {
      return { events: {}, responses: {} };
    }
  },
  save(data) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event(DEMO_EVENT));
  },
};

const sortResponses = (list) => list.sort((a, b) => a.createdAt - b.createdAt);

/* ---------- 公開API ---------- */

/** イベントを作成し、IDを返す */
export async function createEvent(data) {
  const id = randomId();
  if (isDemo) {
    const d = demo.load();
    d.events[id] = { ...data, createdAt: Date.now() };
    demo.save(d);
    return id;
  }
  const { fs, db } = await firestore();
  await fs.setDoc(fs.doc(db, 'events', id), { ...data, createdAt: fs.serverTimestamp() });
  return id;
}

/** イベントを取得（存在しなければ null） */
export async function getEvent(id) {
  if (isDemo) return demo.load().events[id] || null;
  const { fs, db } = await firestore();
  const snap = await fs.getDoc(fs.doc(db, 'events', id));
  return snap.exists() ? snap.data() : null;
}

/** 回答を保存（同じ名前なら上書き）。上書きだったら true を返す */
export async function saveResponse(eventId, { name, comment, slots }) {
  const key = await nameKey(name);
  if (isDemo) {
    const d = demo.load();
    const list = (d.responses[eventId] ||= {});
    const existed = !!list[key];
    const now = Date.now();
    list[key] = { name, comment, slots, createdAt: list[key]?.createdAt ?? now, updatedAt: now };
    demo.save(d);
    return existed;
  }
  const { fs, db } = await firestore();
  const ref = fs.doc(db, 'events', eventId, 'responses', key);
  const snap = await fs.getDoc(ref);
  await fs.setDoc(ref, {
    name,
    comment,
    slots,
    // 初回回答時刻は維持する（回答者一覧の並び順に使う）
    createdAt: snap.exists() ? snap.data().createdAt : fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp(),
  });
  return snap.exists();
}

/**
 * 回答一覧を購読する。変更があるたびに onData(list) が呼ばれる。
 * 戻り値の関数を呼ぶと購読を解除する。
 */
export function subscribeResponses(eventId, onData, onError = console.error) {
  if (isDemo) {
    const emit = () => {
      const map = demo.load().responses[eventId] || {};
      onData(sortResponses(Object.entries(map).map(([id, r]) => ({ id, ...r }))));
    };
    const onStorage = (e) => { if (!e.key || e.key === DEMO_KEY) emit(); };
    window.addEventListener('storage', onStorage);   // 別タブでの変更
    window.addEventListener(DEMO_EVENT, emit);       // 同じタブでの変更
    emit();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DEMO_EVENT, emit);
    };
  }

  let unsub = null;
  let cancelled = false;
  firestore()
    .then(({ fs, db }) => {
      if (cancelled) return;
      unsub = fs.onSnapshot(
        fs.collection(db, 'events', eventId, 'responses'),
        (qs) => {
          const list = qs.docs.map((doc) => {
            const r = doc.data({ serverTimestamps: 'estimate' });
            return {
              id: doc.id,
              name: r.name,
              comment: r.comment || '',
              slots: r.slots || {},
              createdAt: r.createdAt?.toMillis?.() ?? Date.now(),
            };
          });
          onData(sortResponses(list));
        },
        onError,
      );
    })
    .catch(onError);
  return () => {
    cancelled = true;
    unsub?.();
  };
}
