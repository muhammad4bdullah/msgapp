// app.js - FIXED + auto-join URL
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, addDoc, collection, onSnapshot, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ---------------- FIREBASE CONFIG ----------------
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

// ---------------- DOM ELEMENTS ----------------
const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');

const profileModal = document.getElementById('profile-modal');
const viewMode = document.getElementById('profile-view');
const editMode = document.getElementById('profile-edit');

const viewPfp = document.getElementById('view-pfp');
const viewNickname = document.getElementById('view-nickname');
const viewUsername = document.getElementById('view-username');
const viewRole = document.getElementById('view-role');
const viewBio = document.getElementById('view-bio');
const viewAdminActions = document.getElementById('view-admin-actions');
const closeProfileView = document.getElementById('close-profile-view');

const editNickname = document.getElementById('edit-nickname');
const editUsername = document.getElementById('edit-username');
const editAvatar = document.getElementById('edit-avatar');
const usernameLockNote = document.getElementById('username-lock-note');
const saveProfileBtn = document.getElementById('save-profile');
const cancelEditBtn = document.getElementById('cancel-edit');

const chatsLeftDisplay = document.getElementById('chats-left');
const roomIdDisplay = document.getElementById('room-id-display');
const roomPassDisplay = document.getElementById('room-pass-display');
const linkDisplay = document.getElementById('link-display');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');

const createChatBtn = document.getElementById('create-chat');
const joinRoomBtn = document.getElementById('join-room');

// ---------------- STATE ----------------
let currentUser = null;
let currentUserDoc = null;
let currentUserRole = 'user';
let currentUserIsAdmin = false;
let MAX_CHATS_PER_DAY = 10;
let currentRoomId = null;

const ROLE_QUOTAS = { admin: 50, coadmin: 30, chat_creator: 10, user: 10, member: 25 };

// ---------------- UTILS ----------------
function rand(len = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
function safeSet(el, t) { if (el) el.textContent = t; }
function openProfileModal() { profileModal.classList.remove('hidden'); }
function closeProfileModal() { profileModal.classList.add('hidden'); }
function showViewMode() { viewMode.classList.remove('hidden'); editMode.classList.add('hidden'); }
function showEditMode() { viewMode.classList.add('hidden'); editMode.classList.remove('hidden'); }

function updateRoomLink(rid, pass) {
  if (!linkDisplay) return;
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const url = `${base}?room=${encodeURIComponent(rid)}&pass=${encodeURIComponent(pass)}`;
  linkDisplay.innerHTML = `Share link: <a href="${url}" target="_blank" rel="noopener">${url}</a>`;
}

// ---------------- AUTH ----------------
googleLoginBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) { console.error("Login failed:", e); alert("Login failed: " + (e.message || e)); }
};

logoutBtn.onclick = async () => {
  try { await signOut(auth); }
  catch (e) { console.error("Logout failed:", e); }
};

// ---------------- AUTH STATE ----------------
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    loginOverlay.style.display = 'none';
    document.querySelector('.app-grid')?.classList.remove('hidden');
    await ensureUserDoc(user);
    await loadCurrentUserDoc();
    await refreshDailyQuotaUI();
    // if there was a room query param, auto-join
    autoJoinFromURL();
  } else {
    currentUser = null;
    currentUserDoc = null;
    currentUserRole = 'user';
    currentUserIsAdmin = false;
    loginOverlay.style.display = 'flex';
    document.querySelector('.app-grid')?.classList.add('hidden');
  }
});

// ---------------- USER DOC ----------------
async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || null,
      nickname: user.displayName || '',
      avatarUrl: user.photoURL || '',
      role: 'user',
      username: null,
      usernameLastChanged: null,
      bio: '',
      banned: false
    });
  }
}

async function loadCurrentUserDoc() {
  if (!currentUser) return;
  const ref = doc(db, 'users', currentUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) { currentUserDoc = null; return; }
  currentUserDoc = snap.data();
  currentUserRole = currentUserDoc.role || 'user';
  currentUserIsAdmin = currentUserRole === 'admin';
  MAX_CHATS_PER_DAY = ROLE_QUOTAS[currentUserRole] ?? 10;

  // ensure admin nickname tag
  if (currentUserIsAdmin) {
    let nick = currentUserDoc.nickname || currentUser.displayName || '';
    nick = nick.replace(/\s*\[Admin\]$/, '') + ' [Admin]';
    if (nick !== currentUserDoc.nickname) {
      try { await updateDoc(ref, { nickname: nick }); currentUserDoc.nickname = nick; } catch (e) { console.error("Update admin nickname failed:", e); }
    }
  }

  // update profile avatar in topbar if you use profile-avatar id
  const profileAvatar = document.getElementById('profile-avatar');
  if (profileAvatar) profileAvatar.src = currentUserDoc?.avatarUrl || currentUser.photoURL || '';
}

// ---------------- DAILY QUOTA ----------------
async function readDailyLimitDoc(uid) {
  const metaRef = doc(db, 'users', uid, 'meta', 'dailyLimit');
  const snap = await getDoc(metaRef);
  const today = new Date().toISOString().split('T')[0];
  if (!snap.exists()) { await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today }); return { chatsLeft: MAX_CHATS_PER_DAY }; }
  const data = snap.data();
  if (!data.lastReset || data.lastReset !== today) { await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY, lastReset: today }, { merge: true }); return { chatsLeft: MAX_CHATS_PER_DAY }; }
  return { chatsLeft: data.chatsLeft ?? MAX_CHATS_PER_DAY };
}

async function tryConsumeCreateQuota(uid) {
  if (currentUserIsAdmin) return { ok: true, remaining: ROLE_QUOTAS['admin'] };
  const metaRef = doc(db, 'users', uid, 'meta', 'dailyLimit');
  const snap = await getDoc(metaRef);
  const today = new Date().toISOString().split('T')[0];

  if (!snap.exists()) { await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY - 1, lastReset: today }); return { ok: true, remaining: MAX_CHATS_PER_DAY - 1 }; }
  const data = snap.data();
  if (data.lastReset !== today) { await setDoc(metaRef, { chatsLeft: MAX_CHATS_PER_DAY - 1, lastReset: today }, { merge: true }); return { ok: true, remaining: MAX_CHATS_PER_DAY - 1 }; }

  const current = typeof data.chatsLeft === 'number' ? data.chatsLeft : MAX_CHATS_PER_DAY;
  if (current <= 0) return { ok: false, remaining: 0 };
  await updateDoc(metaRef, { chatsLeft: current - 1 });
  return { ok: true, remaining: current - 1 };
}

async function refreshDailyQuotaUI() {
  if (!currentUser) { safeSet(chatsLeftDisplay, 'Not signed in'); return; }
  const meta = await readDailyLimitDoc(currentUser.uid);
  safeSet(chatsLeftDisplay, `${meta.chatsLeft} chats left today`);
}

// ---------------- ROOM ----------------
createChatBtn.onclick = async () => {
  if (!currentUser) return alert('Sign in first');
  if (currentUserDoc?.banned) return alert('You are banned.');
  const res = await tryConsumeCreateQuota(currentUser.uid);
  if (!res.ok) return alert('You used all your create chats today.');
  const rid = rand(8), pass = rand(6);
  currentRoomId = rid;
  await setDoc(doc(db, 'rooms', rid), { password: pass, createdBy: currentUser.uid, members: [currentUser.uid], createdAt: Date.now() });

  safeSet(roomIdDisplay, `Room ID: ${rid}`);
  safeSet(roomPassDisplay, `Password: ${pass}`);
  updateRoomLink(rid, pass);            // <-- auto-join link added
  listenMessages();
  await refreshDailyQuotaUI();
};

joinRoomBtn.onclick = async () => {
  const rid = document.getElementById('room-id').value.trim();
  const pass = document.getElementById('room-pass').value.trim();
  if (!rid || !pass) return alert('Enter Room ID and Password');
  const snap = await getDoc(doc(db, 'rooms', rid));
  if (!snap.exists()) return alert('Room not found');
  if (snap.data().password !== pass) return alert('Incorrect password');
  currentRoomId = rid;
  safeSet(roomIdDisplay, `Room ID: ${rid}`);
  safeSet(roomPassDisplay, `Password: ${pass}`);
  updateRoomLink(rid, pass);            // update link on join also
  listenMessages();
};

// ---------------- MESSAGES ----------------
sendBtn.onclick = sendMessage;
messageInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
  if (!currentUser) return alert('Sign in to send messages');
  if (!currentRoomId) return alert('Join or create a room first');
  const txt = messageInput.value.trim();
  if (!txt) return;

  await addDoc(collection(db, 'rooms', currentRoomId, 'messages'), {
    text: txt,
    nickname: currentUserDoc?.nickname || currentUser.displayName || '',
    username: currentUserDoc?.username || null,
    avatarUrl: currentUserDoc?.avatarUrl || currentUser.photoURL || '',
    userId: currentUser.uid,
    role: currentUserDoc?.role || "user",
    timestamp: Date.now()
  });

  messageInput.value = '';
}

function listenMessages() {
  if (!currentRoomId) return;
  const col = collection(db, 'rooms', currentRoomId, 'messages');
  onSnapshot(col, snap => {
    messagesDiv.innerHTML = '';
    snap.docs.slice().sort((a, b) => (a.data().timestamp || 0) - (b.data().timestamp || 0))
      .forEach(d => {
        const m = d.data();
        const div = document.createElement('div');
        div.className = 'message ' + ((m.userId === currentUser?.uid) ? 'mine' : 'theirs');

        const info = document.createElement('div'); info.className = 'msg-info';
        if (m.avatarUrl) {
          const img = document.createElement('img'); img.src = m.avatarUrl;
          img.style.cursor = 'pointer';
          img.onclick = () => openUserProfile(m.userId);
          info.appendChild(img);
        }

        const nameSpan = document.createElement('span');
        if (m.role === "admin") {
          nameSpan.innerHTML = `
            <span class="admin-name">
              <span class="admin-crown">👑</span>
              ${m.nickname}
            </span>
          `;
        } else {
          nameSpan.textContent = m.nickname || 'Unknown';
        }
        nameSpan.style.cursor = 'pointer';
        nameSpan.onclick = () => openUserProfile(m.userId);
        info.appendChild(nameSpan);

        if (currentUserIsAdmin || currentUserRole === 'coadmin') {
          const del = document.createElement('button'); del.textContent = 'Del';
          del.onclick = async () => { try { await deleteDoc(d.ref); alert('Message deleted'); } catch (e) { console.error(e); alert('Delete failed'); } };
          info.appendChild(del);
        }

        div.appendChild(info);
        const textDiv = document.createElement('div'); textDiv.className = 'msg-text'; textDiv.textContent = m.text || '';
        div.appendChild(textDiv);

        messagesDiv.appendChild(div);
      });
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  });
}

// ---------------- AUTO JOIN FROM URL ----------------
function autoJoinFromURL() {
  const params = new URLSearchParams(window.location.search);
  const rid = params.get('room');
  const pass = params.get('pass');
  if (!rid || !pass) return;
  // try to auto-join (no alert on failure)
  getDoc(doc(db, 'rooms', rid)).then(snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.password !== pass) return;
    currentRoomId = rid;
    safeSet(roomIdDisplay, `Room ID: ${rid}`);
    safeSet(roomPassDisplay, `Password: ${pass}`);
    updateRoomLink(rid, pass);
    listenMessages();
  }).catch(e => console.error("autoJoinFromURL error:", e));
}

// ---------------- PROFILE / VIEW (placeholder) ----------------
// openUserProfile needs your existing implementation (profile modal rendering).
// If you want, I can also rewrite the profile modal code to match this updated structure.

function openUserProfile(uid) {
  // placeholder minimal: open profile modal and show uid
  openProfileModal();
  showViewMode();
  viewNickname.textContent = 'Loading...';
  viewUsername.textContent = '';
  viewRole.textContent = '';
  viewBio.textContent = '';
  viewPfp.src = '';

  getDoc(doc(db, 'users', uid)).then(snap => {
    if (!snap.exists()) {
      viewNickname.textContent = 'Unknown';
      return;
    }
    const data = snap.data();
    viewPfp.src = data.avatarUrl || '';
    viewNickname.textContent = data.nickname || '';
    viewUsername.textContent = data.username ? '@' + data.username : '';
    viewRole.textContent = (data.role || 'user').toUpperCase();
    viewBio.textContent = data.bio || '';
    // admin actions area (if any) should be rendered here
  }).catch(e => {
    console.error("openUserProfile error:", e);
    viewNickname.textContent = 'Error';
  });
}

// ---------------- INIT ----------------
console.log('app.js loaded');
