import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, addDoc, collection, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// --------------------------
// Firebase
// --------------------------
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

// --------------------------
// Variables
// --------------------------
let currentUser = null;
let nickname = "";
let avatarUrl = "";
let currentRoomId = "";
let chatsToday = 0;

let MAX_CHATS_PER_DAY = 10; // Default (normal users)

// --------------------------
// UI Elements
// --------------------------
const loginOverlay = document.getElementById("login-overlay");
const googleLoginBtn = document.getElementById("google-login-btn");
const profileBtn = document.getElementById("profile-btn");
const profileModal = document.getElementById("profile-modal");
const nicknameInput = document.getElementById("nickname-input");
const avatarInput = document.getElementById("avatar-input");
const saveProfileBtn = document.getElementById("save-profile");
const logoutBtn = document.getElementById("logout-btn");
const chatsLeftDisplay = document.getElementById("chats-left");

const roomIdDisplay = document.getElementById("room-id-display");
const roomPassDisplay = document.getElementById("room-pass-display");
const linkDisplay = document.getElementById("link-display");

const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send");
const messagesDiv = document.getElementById("messages");

// --------------------------
// Helpers
// --------------------------
function randomString(len = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function updateRoomLink(roomId, pass) {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, "");
  const link = `${base}?room=${roomId}&pass=${pass}`;
  linkDisplay.innerHTML = `Share link: <a href="${link}" target="_blank">${link}</a>`;
}

// --------------------------
// Login
// --------------------------
googleLoginBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
  } catch (e) {
    alert("Login failed: " + e.message);
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginOverlay.style.display = "none";
    document.querySelector(".app-grid").classList.remove("hidden");

    await loadProfile();
    updateChatsLeft();
    joinRoomFromURL();
  } else {
    loginOverlay.style.display = "flex";
  }
});

// --------------------------
// Load profile + ADMIN CHECK
// --------------------------
async function loadProfile() {
  const docSnap = await getDoc(doc(db, "users", currentUser.uid));

  if (docSnap.exists()) {
    const data = docSnap.data();
    nickname = data.nickname || currentUser.displayName;
    avatarUrl = data.avatarUrl || currentUser.photoURL;

    // -------- ADMIN MODE --------
    if (data.isAdmin) {
      MAX_CHATS_PER_DAY = 50; // admin gets 50 per day
      nickname = nickname.replace(/\s*\[Admin\]$/, "");
      nickname = nickname + " [Admin]";
    }

  } else {
    nickname = currentUser.displayName;
    avatarUrl = currentUser.photoURL;
  }

  nicknameInput.value = nickname;
  updateProfileUI();
}

function updateProfileUI() {
  const avatar = document.getElementById("profile-avatar");
  if (avatar) avatar.src = avatarUrl || "";
}

// --------------------------
// Save profile
// --------------------------
saveProfileBtn.onclick = async () => {
  let name = nicknameInput.value.trim();

  const userDoc = await getDoc(doc(db, "users", currentUser.uid));
  const isAdmin = userDoc.exists() && userDoc.data().isAdmin;

  if (isAdmin) {
    name = name.replace(/\s*\[Admin\]$/, "");
    name = name + " [Admin]";
  }

  nickname = name;

  if (avatarInput.files[0]) {
    avatarUrl = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(avatarInput.files[0]);
    });
  }

  await setDoc(
    doc(db, "users", currentUser.uid),
    { nickname, avatarUrl, lastSet: Date.now() },
    { merge: true }
  );

  profileModal.classList.add("hidden");
  updateProfileUI();
};

// --------------------------
// Logout
// --------------------------
logoutBtn.onclick = async () => {
  await signOut(auth);
  currentRoomId = "";
};

// --------------------------
// Join room from URL
// --------------------------
function joinRoomFromURL() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");
  const pass = params.get("pass");

  if (!roomId || !pass) return;

  getDoc(doc(db, "rooms", roomId)).then((roomDoc) => {
    if (!roomDoc.exists()) return alert("Room doesn't exist");
    if (roomDoc.data().password !== pass) return alert("Wrong password");

    currentRoomId = roomId;
    roomIdDisplay.textContent = "Room ID: " + roomId;
    roomPassDisplay.textContent = "Password: " + pass;
    updateRoomLink(roomId, pass);

    listenMessages();
  });
}

// --------------------------
// Create Room
// --------------------------
document.getElementById("create-chat").onclick = async () => {
  if (chatsToday >= MAX_CHATS_PER_DAY) return alert("Daily limit reached!");

  const roomId = randomString(8);
  const password = randomString(6);

  currentRoomId = roomId;
  chatsToday++;

  await setDoc(doc(db, "rooms", roomId), {
    password,
    createdBy: currentUser.uid,
    members: [nickname]
  });

  roomIdDisplay.textContent = "Room ID: " + roomId;
  roomPassDisplay.textContent = "Password: " + password;
  updateRoomLink(roomId, password);

  updateChatsLeft();
  listenMessages();
};

// --------------------------
// Join Room
// --------------------------
document.getElementById("join-room").onclick = async () => {
  const id = document.getElementById("room-id").value.trim();
  const pass = document.getElementById("room-pass").value.trim();

  if (!id || !pass) return alert("Enter both fields");

  const roomDoc = await getDoc(doc(db, "rooms", id));

  if (!roomDoc.exists()) return alert("Not found");
  if (roomDoc.data().password !== pass) return alert("Wrong password");

  currentRoomId = id;

  roomIdDisplay.textContent = "Room ID: " + id;
  roomPassDisplay.textContent = "Password: " + pass;
  updateRoomLink(id, pass);

  listenMessages();
};

// --------------------------
// Messaging
// --------------------------
sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentRoomId) return;

  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    text,
    nickname,
    avatarUrl,
    userId: currentUser.uid,
    timestamp: Date.now()
  });

  messageInput.value = "";
}

function listenMessages() {
  const colRef = collection(db, "rooms", currentRoomId, "messages");

  onSnapshot(colRef, (snap) => {
    messagesDiv.innerHTML = "";

    snap.docs
      .sort((a, b) => a.data().timestamp - b.data().timestamp)
      .forEach((d) => {
        const m = d.data();

        const div = document.createElement("div");
        div.className = "message " + (m.userId === currentUser.uid ? "mine" : "theirs");

        const info = document.createElement("div");
        info.className = "msg-info";

        if (m.avatarUrl) {
          const img = document.createElement("img");
          img.src = m.avatarUrl;
          info.appendChild(img);
        }

        const name = document.createElement("span");
        name.textContent = m.nickname;
        info.appendChild(name);

        div.appendChild(info);

        const t = document.createElement("div");
        t.className = "msg-text";
        t.textContent = m.text;

        div.appendChild(t);
        messagesDiv.appendChild(div);
      });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// --------------------------
// Chats left
// --------------------------
function updateChatsLeft() {
  chatsLeftDisplay.textContent = `${MAX_CHATS_PER_DAY - chatsToday} chats left today`;
}
