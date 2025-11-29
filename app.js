import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyAEWxTJ1loQkXM1ShwAAF1J15RQLlCgdGM",
  authDomain: "msgapp-262c9.firebaseapp.com",
  projectId: "msgapp-262c9",
  storageBucket: "msgapp-262c9.firebasestorage.app",
  messagingSenderId: "122648836940",
  appId: "1:122648836940:web:a098c052f65f3eb305ade9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ===== DOM ELEMENTS =====
const loginOverlay = document.getElementById("login-overlay");
const googleLoginBtn = document.getElementById("google-login-btn");
const appGrid = document.querySelector(".app-grid");
const profileAvatar = document.getElementById("profile-avatar");
const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const createRoomBtn = document.getElementById("create-room");
const roomList = document.getElementById("roomList");
const roomTitle = document.getElementById("room-title");
const logoutBtn = document.getElementById("logout-btn");
const nicknameInput = document.getElementById("nicknameInput");

let currentUser = null;
let currentRoom = null;
let isAdmin = false;
const ADMIN_EMAIL = "m10abdullah09@gmail.com";

// ===== GOOGLE LOGIN =====
googleLoginBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
    isAdmin = currentUser.email === ADMIN_EMAIL;
    loginOverlay.classList.add("hidden");
    appGrid.classList.remove("hidden");
    profileAvatar.src = currentUser.photoURL || "";
    await ensureUserProfile();
    loadRooms();
  } catch(e) {
    console.error(e);
    alert("Login failed: " + e.message);
  }
});

// ===== ENSURE PROFILE =====
async function ensureUserProfile() {
  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      username: currentUser.displayName,
      nickname: currentUser.displayName,
      avatar: currentUser.photoURL || "",
      isAdmin,
      createdRoomsToday: 0,
      lastCreatedDay: new Date().getDate()
    });
  }
}

// ===== CREATE RANDOM ROOM =====
createRoomBtn.addEventListener("click", async () => {
  const nickname = nicknameInput.value.trim() || currentUser.displayName;
  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);
  let data = snap.data();

  const today = new Date().getDate();
  if (today !== data.lastCreatedDay) { data.createdRoomsToday = 0; data.lastCreatedDay = today; }

  if (!isAdmin && data.createdRoomsToday >= 10) return alert("Daily room limit reached (10).");

  const roomName = randomAlpha(6);
  const roomPass = Math.floor(1000 + Math.random() * 9000); // 4-digit password

  await setDoc(doc(db, "rooms", roomName), {
    creator: currentUser.uid,
    createdAt: Date.now(),
    nickname,
    password: roomPass
  });

  if (!isAdmin) {
    data.createdRoomsToday++;
    await setDoc(userRef, data);
  }

  joinRoom(roomName);
  alert(`Room Created!\nName: ${roomName}\nPassword: ${roomPass}\nLink: ${window.location.href}?room=${roomName}`);
});

// ===== JOIN ROOM =====
async function joinRoom(roomName) {
  currentRoom = roomName;
  roomTitle.textContent = roomName;
  messagesContainer.innerHTML = "";

  const roomRef = collection(db, "rooms", roomName, "messages");
  const q = query(roomRef, orderBy("timestamp"));

  onSnapshot(q, snapshot => {
    messagesContainer.innerHTML = "";
    snapshot.forEach(docSnap => displayMessage(docSnap.data()));
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// ===== DISPLAY MESSAGE =====
function displayMessage(msg) {
  const div = document.createElement("div");
  div.classList.add("message", msg.uid === currentUser.uid ? "mine" : "theirs");

  let usernameBadge = msg.username;
  if (msg.isAdmin) usernameBadge += ' <span class="admin-crown">★</span>';

  div.innerHTML = `
    <div class="msg-info">
      <img src="${msg.avatar}" alt="${msg.username}">
      <strong>${usernameBadge}</strong>
    </div>
    <div>${msg.text}</div>
  `;
  messagesContainer.appendChild(div);
}

// ===== SEND MESSAGE =====
sendBtn.addEventListener("click", async () => {
  if (!currentRoom) return alert("Join a room first!");
  const text = messageInput.value.trim();
  if (!text) return;

  await addDoc(collection(db, "rooms", currentRoom, "messages"), {
    uid: currentUser.uid,
    username: nicknameInput.value.trim() || currentUser.displayName,
    avatar: currentUser.photoURL || "",
    text,
    timestamp: Date.now(),
    isAdmin
  });

  messageInput.value = "";
});

// ===== LOAD ROOMS & CHAT HISTORY =====
async function loadRooms() {
  roomList.innerHTML = "";
  const roomsSnap = await getDocs(collection(db, "rooms"));
  roomsSnap.forEach(docSnap => {
    const li = document.createElement("li");
    li.textContent = docSnap.id;
    li.style.cursor = "pointer";
    li.title = `Join Room: ${docSnap.id}`;
    li.addEventListener("click", () => joinRoom(docSnap.id));
    roomList.appendChild(li);
  });
}

// ===== LOGOUT =====
logoutBtn.addEventListener("click", () => signOut(auth).then(() => location.reload()));

// ===== AUTH STATE =====
onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    isAdmin = currentUser.email === ADMIN_EMAIL;
    loginOverlay.classList.add("hidden");
    appGrid.classList.remove("hidden");
    profileAvatar.src = currentUser.photoURL || "";
    ensureUserProfile();
    loadRooms();
  } else {
    loginOverlay.classList.remove("hidden");
    appGrid.classList.add("hidden");
  }
});

// ===== UTIL =====
function randomAlpha(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0; i < len; i++) str += chars.charAt(Math.floor(Math.random() * chars.length));
  return str;
}
