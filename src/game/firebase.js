import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';

// ==========================================
// FIREBASE SETUP — Replace this config with
// your own from the Firebase Console:
// console.firebase.google.com → Project Settings → Your Apps → Web
// ==========================================
const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

let db = null;

export function initFirebase() {
  // Don't init if config is empty (placeholder)
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn('Firebase config not set — worldwide leaderboard disabled. See src/game/firebase.js');
    return null;
  }
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    return db;
  } catch (e) {
    console.warn('Firebase init failed, worldwide leaderboard disabled:', e);
    return null;
  }
}

/**
 * Get ISO 8601 week ID string like "2026-W10".
 * Weeks start on Monday. Week 1 contains January 4th.
 */
export function getWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Submit a score to the worldwide leaderboard.
 * Returns the document ID on success, null on failure.
 */
export async function submitScore(db, nickname, score, title = null) {
  if (!db) return null;
  try {
    const weekId = getWeekId();
    const doc = {
      nickname: nickname,
      score: score,
      weekId: weekId,
      createdAt: serverTimestamp(),
    };
    if (title) doc.title = title;
    const docRef = await addDoc(collection(db, 'scores'), doc);
    return docRef.id;
  } catch (e) {
    console.warn('Failed to submit score to Firebase:', e);
    return null;
  }
}

/**
 * Fetch the top worldwide scores for the current week.
 * Returns an array of { nickname, score, weekId, createdAt } objects.
 */
export async function fetchWorldwideScores(db, maxResults = 20) {
  if (!db) return [];
  try {
    const weekId = getWeekId();
    const q = query(
      collection(db, 'scores'),
      where('weekId', '==', weekId),
      orderBy('score', 'desc'),
      limit(maxResults),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (e) {
    console.warn('Failed to fetch worldwide scores:', e);
    return [];
  }
}

export function getDb() {
  return db;
}
