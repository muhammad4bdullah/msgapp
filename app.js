// app.js - full rewrite with Firestore-backed daily "create chat" limit (option B)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, addDoc, collection, onSnapshot, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// --- Firebase Config (your config) ---
const firebaseConfig = {
  apiKey: "AIzaSyAEWxTJ1loQkXM1ShwAAF1J15RQLlCgdGM",
  authDomain: "msgapp-262c9.firebaseapp.com",
  projectId: "msgapp-262c9",
  storageBucket: "msgapp-262c9.appspot.com",
  messagingSenderId: "122648836940",
  appId: "1:122648836940:web:a098c052f65f3eb305ade9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- DOM Elements ---
const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn = document.getElementById('google-login-btn');
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const nicknameInput = document.getElementById('nickname-input');
const avatarInput = document.getElementById('avatar-input');
const saveProfileBtn = document.getElementById('save-profile');
const logoutBtn = document.getElementById('logout-btn');
const chatsLeftDisplay = document.getElementById('chats-left');

const roomIdDisplay = document.getElementById('room-id-display');
const roomPassDisplay = document.getElementById('room-pass-display');
const linkDisplay = document.getElementById('link-display');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');
const leftChats = document.getElementById('chats-list');

let currentUser = null;
let nickname = '';
let avatarUrl = '';
let currentRoomId = '';
let chatsTodayLocal = 0;            // local mirror for UI (not authoritative)
const MAX_CHATS_PER_DAY = 10;

// ----------------- Helpers -----------------
function randomString(len = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let str = '';
  for (let i = 0; i < len; i++) str += chars.charAt(Math.floor(Math.random() * chars.length));
  return str;
}

function setTextSafe(el, txt) {
  if (!el) return;
  el.textContent = txt;
}

function updateRoomLink(roomId, password) {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const link = `${base}?room=${roomId}&pass=${password}`;
  if (linkDisplay) linkDisplay.innerHTML = `Share link: <a href="${link}" target="_blank">${link}</a>`;
}

// ----------------- Daily limit in Firestore -----------------
// Document path: users/{uid}/meta/dailyLimit
// Fields: { chatsLeft: number, lastReset: "YYYY-MM-DD" }

async function ensureDailyLimitDoc(uid) {
  const metaRef = doc(db, "users", uid, "meta", "dailyLimit");
  const snap = await getDoc(metaRef);
  const today = new Date().toISOString().split("T")[0];

  if (!snap.exists()) {
    await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today });
    return { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today };
  }

  const data = snap.data();
  if (!data || !data.lastReset || data.lastReset !== today) {
    // reset for new day
    await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today }, { merge: true });
    return { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today };
  }

  return { chatsLeft: data.chatsLeft ?? MAX_CHATS_PER_DAY, lastReset: data.lastReset };
}

async function getDailyLimit(uid) {
  const metaRef = doc(db, "users", uid, "meta", "dailyLimit");
  const snap = await getDoc(metaRef);
  if (!snap.exists()) return await ensureDailyLimitDoc(uid);
  const data = snap.data();
  const today = new Date().toISOString().split("T")[0];

  if (data.lastReset !== today) {
    await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today }, { merge: true });
    return { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today };
  }

  return { chatsLeft: data.chatsLeft ?? MAX_CHATS_PER_DAY, lastReset: data.lastReset };
}

async function tryConsumeChatQuota(uid) {
  const metaRef = doc(db, "users", uid, "meta", "dailyLimit");
  // read current atomically-ish by reading doc then update
  const snap = await getDoc(metaRef);
  if (!snap.exists()) {
    // initialize and consume one
    await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY - 1, lastReset: new Date().toISOString().split("T")[0] });
    return { ok: true, remaining: MAX_CHATS_PER_DAY - 1 };
  }
  const data = snap.data();
  const today = new Date().toISOString().split("T")[0];
  if (data.lastReset !== today) {
    // reset and consume one
    await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY - 1, lastReset: today }, { merge: true });
    return { ok: true, remaining: MAX_CHATS_PER_DAY - 1 };
  }
  const current = (typeof data.chatsLeft === "number") ? data.chatsLeft : MAX_CHATS_PER_DAY;
  if (current <= 0) return { ok: false, remaining: 0 };
  await updateDoc(metaRef, { chatsLeft: current - 1 });
  return { ok: true, remaining: current - 1 };
}

// ----------------- Auth & UI flow -----------------
googleLoginBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    // result.user available
    // auth state handler will update UI and load profile/meta
    console.log("Sign-in success:", result.user);
  } catch (err) {
    console.error("Login failed:", err);
    alert("Login failed: " + (err && err.message ? err.message : err));
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    // Show app
    loginOverlay.style.display = 'none';
    document.querySelector('.app-grid')?.classList.remove('hidden');

    // Load profile + daily limit
    await loadProfile();
    await refreshDailyLimitUI();

    // Load chat list UI (placeholder)
    renderLeftChats();

    // Auto join if URL has room
    joinRoomFromURL();
  } else {
    // hide app and show login
    currentUser = null;
    loginOverlay.style.display = 'flex';
    document.querySelector('.app-grid')?.classList.add('hidden');
  }
});

// ----------------- Profile -----------------
profileBtn.onclick = () => profileModal.classList.remove('hidden');

saveProfileBtn.onclick = async () => {
  try {
    const name = (nicknameInput.value || '').trim();
    if (name) nickname = name;

    if (avatarInput.files && avatarInput.files[0]) {
      avatarUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(avatarInput.files[0]);
      });
    }

    if (!currentUser) throw new Error("Not signed in");

    await setDoc(doc(db, "users", currentUser.uid), {
      nickname,
      avatarUrl,
      lastSet: Date.now()
    }, { merge: true });

    profileModal.classList.add('hidden');
    updateProfileUI();
  } catch (e) {
    console.error("Save profile error:", e);
    alert("Could not save profile.");
  }
};

logoutBtn.onclick = async () => {
  await signOut(auth);
  currentUser = null;
  nickname = '';
  avatarUrl = '';
  // UI reset
  setTextSafe(document.getElementById('room-id-display'), '');
  setTextSafe(document.getElementById('room-pass-display'), '');
  setTextSafe(messagesDiv, '');
  setTextSafe(chatsLeftDisplay, 'Logged out');
};

// ----------------- Profile & UI helpers -----------------
function updateProfileUI() {
  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl) avatarEl.src = avatarUrl || currentUser?.photoURL || '';
}

async function loadProfile() {
  if (!currentUser) return;
  const userDoc = await getDoc(doc(db, "users", currentUser.uid));
  if (userDoc.exists()) {
    const data = userDoc.data();
    nickname = data.nickname || currentUser.displayName || '';
    avatarUrl = data.avatarUrl || currentUser.photoURL || '';
  } else {
    nickname = currentUser.displayName || '';
    avatarUrl = currentUser.photoURL || '';
  }
  if (nicknameInput) nicknameInput.value = nickname;
  updateProfileUI();
}

// ----------------- Daily limit UI refresh -----------------
async function refreshDailyLimitUI() {
  if (!currentUser) {
    setTextSafe(chatsLeftDisplay, 'Not signed in');
    return;
  }
  const meta = await getDailyLimit(currentUser.uid);
  chatsTodayLocal = MAX_CHATS_PER_DAY - meta.chatsLeft;
  setTextSafe(chatsLeftDisplay, `${meta.chatsLeft} chats left today`);
}

// ----------------- Create / Join chat (option B: only create consumes quota) -----------------
document.getElementById('create-chat').onclick = async () => {
  if (!currentUser) return alert("Please login first.");
  // Check & consume quota
  const res = await tryConsumeChatQuota(currentUser.uid);
  if (!res.ok) {
    return alert("You used all your chats for today. Try again tomorrow.");
  }
  // update UI
  setTextSafe(chatsLeftDisplay, `${res.remaining} chats left today`);

  // create room
  const roomId = randomString(8);
  const password = randomString(6);
  currentRoomId = roomId;

  await setDoc(doc(db, "rooms", roomId), {
    password,
    createdBy: currentUser.uid,
    members: [nickname || currentUser.displayName || currentUser.email || 'Guest'],
    createdAt: Date.now()
  });

  roomIdDisplay.textContent = `Room ID: ${roomId}`;
  roomPassDisplay.textContent = `Password: ${password}`;
  updateRoomLink(roomId, password);
  listenMessages();
  renderLeftChats();
};

document.getElementById('join-room').onclick = async () => {
  const ridEl = document.getElementById('room-id');
  const passEl = document.getElementById('room-pass');
  const roomId = (ridEl?.value || '').trim();
  const password = (passEl?.value || '').trim();
  if (!roomId || !password) return alert("Enter Room ID + Password");
  const roomDoc = await getDoc(doc(db, "rooms", roomId));
  if (!roomDoc.exists()) return alert("Room does not exist");
  if (roomDoc.data().password !== password) return alert("Incorrect password");

  currentRoomId = roomId;
  roomIdDisplay.textContent = `Room ID: ${roomId}`;
  roomPassDisplay.textContent = `Password: ${password}`;
  updateRoomLink(roomId, password);
  listenMessages();
};

// ----------------- Messaging -----------------
sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", (e) => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
  if (!currentUser) return alert("Sign in to send messages");
  const text = (messageInput.value || '').trim();
  if (!text || !currentRoomId) return;
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    text,
    userId: currentUser.uid,
    nickname: nickname || currentUser.displayName || '',
    avatarUrl: avatarUrl || currentUser.photoURL || '',
    timestamp: Date.now()
  });
  messageInput.value = '';
}

let messagesUnsub = null;
function listenMessages() {
  if (!currentRoomId) return;
  // Unsubscribe previous if exists
  // (Note: using onSnapshot already returns unsubscribe; for simplicity we don't store it long-term)
  const msgsCol = collection(db, "rooms", currentRoomId, "messages");
  onSnapshot(msgsCol, snapshot => {
    messagesDiv.innerHTML = '';
    const docs = snapshot.docs.slice().sort((a, b) => (a.data().timestamp || 0) - (b.data().timestamp || 0));
    docs.forEach(d => {
      const msg = d.data();
      const div = document.createElement('div');
      div.classList.add('message', msg.userId === currentUser?.uid ? 'mine' : 'theirs');

      const info = document.createElement('div'); info.classList.add('msg-info');
      if (msg.avatarUrl) {
        const img = document.createElement('img'); img.src = msg.avatarUrl; info.appendChild(img);
      }
      const span = document.createElement('span'); span.textContent = msg.nickname || 'Unknown'; info.appendChild(span);
      div.appendChild(info);

      const textDiv = document.createElement('div'); textDiv.classList.add('msg-text'); textDiv.textContent = msg.text || '';
      div.appendChild(textDiv);

      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  });
}

// ----------------- Join room from URL helper -----------------
function joinRoomFromURL() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  const password = params.get('pass');
  if (!roomId || !password) return;
  getDoc(doc(db, "rooms", roomId)).then(roomDoc => {
    if (!roomDoc.exists()) return; // don't alert on auto check
    if (roomDoc.data().password !== password) return;
    currentRoomId = roomId;
    roomIdDisplay.textContent = `Room ID: ${roomId}`;
    roomPassDisplay.textContent = `Password: ${password}`;
    updateRoomLink(roomId, password);
    listenMessages();
  }).catch(e => console.error("joinRoomFromURL error:", e));
}

// ----------------- Left column UI (placeholder) -----------------
function renderLeftChats() {
  // Placeholder: you can expand to list recent rooms from Firestore.
  // For now we show created room id on top of left list
  if (!leftChats) return;
  leftChats.innerHTML = '';
  if (currentRoomId) {
    const node = document.createElement('div');
    node.className = 'left-room';
    node.textContent = currentRoomId;
    node.onclick = () => {
      // navigate to that room (no password stored here)
      const rid = currentRoomId;
      if (rid) {
        // do nothing — already in room
      }
    };
    leftChats.appendChild(node);
  }
}

// ----------------- Init (nothing else) -----------------
console.log("App loaded");
 
