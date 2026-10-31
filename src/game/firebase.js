import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, addDoc, query, where, limit, getDocs, serverTimestamp, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref as rtdbRef, set as rtdbSet, get as rtdbGet, onValue, onDisconnect, remove as rtdbRemove, update as rtdbUpdate, serverTimestamp as rtdbTimestamp } from 'firebase/database';

// ==========================================
// FIREBASE SETUP — Replace this config with
// your own from the Firebase Console:
// console.firebase.google.com → Project Settings → Your Apps → Web
// ==========================================
const firebaseConfig = {
  apiKey: 'AIzaSyAnY8TV6Ts1kb7bDKsaTmzjHb8LXeokfAw',
  authDomain: 'shred-summit-3079f.firebaseapp.com',
  projectId: 'shred-summit-3079f',
  storageBucket: 'shred-summit-3079f.firebasestorage.app',
  messagingSenderId: '617043389770',
  appId: '1:617043389770:web:13dee92542cd7dcf21a5b3',
  measurementId: 'G-LRXJE5CLPV',
  databaseURL: 'https://shred-summit-3079f-default-rtdb.firebaseio.com',
};

let db = null;
let auth = null;
let rtdb = null;

export function isFirebaseConfigured() {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function initFirebase() {
  if (!isFirebaseConfigured()) {
    console.warn('Firebase config not set — auth & cloud save disabled. See src/game/firebase.js');
    return null;
  }
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    try { rtdb = getDatabase(app); } catch (e) { console.warn('RTDB init failed:', e); }
    // Local testing: `VITE_FIREBASE_EMULATOR=1 npm run dev` with `firebase emulators:start`
    if (import.meta.env.VITE_FIREBASE_EMULATOR) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      if (rtdb) connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
      console.log('[firebase] using local emulators');
    }
    return db;
  } catch (e) {
    console.warn('Firebase init failed:', e);
    return null;
  }
}

export function getFirebaseAuth() {
  return auth;
}

export function getDb() {
  return db;
}

export function getRtdb() {
  return rtdb;
}

// ---- RTDB helpers (re-exported for MultiplayerManager) ----
export { rtdbRef, rtdbSet, rtdbGet, onValue, onDisconnect, rtdbRemove, rtdbUpdate, rtdbTimestamp };

// ---- AUTH ----

export async function createAccount(email, password) {
  if (!auth) throw new Error('Firebase not initialized');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginAccount(email, password) {
  if (!auth) throw new Error('Firebase not initialized');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function resetPassword(email) {
  if (!auth) throw new Error('Firebase not initialized');
  await sendPasswordResetEmail(auth, email);
}

export async function logoutAccount() {
  if (!auth) return;
  await signOut(auth);
}

export function onAuthChange(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

// ---- CLOUD SAVE ----

let _saveTimer = null;
let _pendingSave = null;

export async function cloudSaveProgress(uid, data) {
  if (!db || !uid) return;
  // Debounce: buffer writes
  _pendingSave = { uid, data };
  if (_saveTimer) return;
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    if (!_pendingSave) return;
    const { uid: u, data: d } = _pendingSave;
    _pendingSave = null;
    try {
      await setDoc(doc(db, 'users', u), d, { merge: true });
    } catch (e) {
      console.warn('Cloud save failed:', e);
    }
  }, 500);
}

export async function cloudLoadProgress(uid) {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) return snap.data();
  } catch (e) {
    console.warn('Cloud load failed:', e);
  }
  return null;
}

// ---- LEADERBOARD (existing) ----

/**
 * Get ISO 8601 week ID string like "2026-W10".
 */
export function getWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function submitScore(dbRef, nickname, score, title = null, parkId = null) {
  if (!dbRef) return null;
  try {
    const d = {
      nickname: nickname,
      score: score,
      createdAt: serverTimestamp(),
    };
    if (title) d.title = title;
    if (parkId && parkId !== 'big-white') d.parkId = parkId;
    const docRef = await addDoc(collection(dbRef, 'scores'), d);
    return docRef.id;
  } catch (e) {
    console.warn('Failed to submit score to Firebase:', e);
    return null;
  }
}

// Park scores submitted before this date are ignored (bug-abused scores)
const PARK_RESET_EPOCH = new Date('2026-03-14T00:00:00Z');

export async function fetchWorldwideScores(dbRef, maxResults = 20, parkId = null) {
  if (!dbRef) return null;
  try {
    // All scores live in 'scores' collection — park scores have no chair field
    const q = query(
      collection(dbRef, 'scores'),
      limit(500),
    );
    const snapshot = await getDocs(q);
    const scores = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })).filter(s => {
      if (s.chair) return false; // not a park score
      // Ignore park scores before reset epoch
      if (s.createdAt && s.createdAt.toDate && s.createdAt.toDate() < PARK_RESET_EPOCH) return false;
      // Filter by parkId — legacy scores (no parkId) are big-white
      if (parkId && parkId !== 'big-white') {
        return s.parkId === parkId;
      } else {
        return !s.parkId || s.parkId === 'big-white';
      }
    });
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, maxResults);
  } catch (e) {
    console.warn('Failed to fetch worldwide scores:', e);
    return null;
  }
}

export async function submitSummitScore(dbRef, nickname, score, chair, title = null) {
  if (!dbRef) return null;
  try {
    const d = {
      nickname: nickname,
      score: score,
      chair: chair,
      createdAt: serverTimestamp(),
    };
    if (title) d.title = title;
    const docRef = await addDoc(collection(dbRef, 'scores'), d);
    return docRef.id;
  } catch (e) {
    console.warn('Failed to submit summit score to Firebase:', e);
    return null;
  }
}

export async function fetchSummitScores(dbRef, chair, maxResults = 20) {
  if (!dbRef) return null;
  try {
    // All scores live in 'scores' collection — filter by chair client-side
    const q = query(
      collection(dbRef, 'scores'),
      limit(500),
    );
    const snapshot = await getDocs(q);
    const scores = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })).filter(s => s.chair === chair);
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, maxResults);
  } catch (e) {
    console.warn('Failed to fetch summit scores:', e);
    return null;
  }
}

