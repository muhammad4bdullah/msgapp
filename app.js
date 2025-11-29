// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAEWxTJ1loQkXM1ShwAAF1J15RQLlCgdGM",
  authDomain: "msgapp-262c9.firebaseapp.com",
  projectId: "msgapp-262c9",
  storageBucket: "msgapp-262c9.firebasestorage.app",
  messagingSenderId: "122648836940",
  appId: "1:122648836940:web:a098c052f65f3eb305ade9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ==== ELEMENTS ====
const loginOverlay = document.getElementById("login-overlay");
const googleLoginBtn = document.getElementById("google-login-btn");
const topAvatar = document.querySelector(".topbar .avatar");
const logoutBtn = document.querySelector(".topbar button");
const messagesWrap = document.querySelector(".messages-wrap");
const messagesContainer = document.querySelector(".messages");
const messageInput = document.querySelector(".composer input");
const sendBtn = document.querySelector(".composer button");
const roomInput = document.querySelector(".room-controls input");
const joinBtn = document.querySelector(".room-controls button");
const profileModal = document.querySelector(".modal");
const profileAvatar = document.getElementById("view-pfp");
const profileUsername = document.getElementById("profile-username");
const profileEditInput = document.getElementById("profile-edit-input");
const saveProfileBtn = document.getElementById("save-profile-btn");

// ==== GLOBAL STATE ====
let currentUser = null;
let currentRoom = null;
let isAdmin = false;
let lastUsernameEdit = null;

// ==== ADMIN CONFIG ====
const ADMIN_UID = "YOUR_ADMIN_UID_HERE"; // Replace with your Google UID

// ==== LOGIN ====
googleLoginBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
    loginOverlay.classList.add("hidden");

    // Check if admin
    isAdmin = currentUser.uid === ADMIN_UID;

    topAvatar.src = currentUser.photoURL;
    await initUserProfile();
  } catch (err) {
    console.error("Login failed:", err);
  }
});

// ==== LOGOUT ====
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

// ==== INIT USER PROFILE ====
async function initUserProfile() {
  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // First-time login
    await setDoc(userRef, {
      username: currentUser.displayName,
      avatar: currentUser.photoURL,
      lastEdit: Date.now()
    });
  }

  const userData = (await getDoc(userRef)).data();
  profileAvatar.src = userData.avatar;
  profileUsername.textContent = userData.username;
  lastUsernameEdit = userData.lastEdit;
}

// ==== PROFILE MODAL ====
topAvatar.addEventListener("click", () => {
  profileModal.classList.remove("hidden");
});

saveProfileBtn.addEventListener("click", async () => {
  const now = Date.now();
  if (now - lastUsernameEdit < 15 * 24 * 60 * 60 * 1000) {
    alert("You can only change username once every 15 days!");
    return;
  }

  const newUsername = profileEditInput.value.trim();
  if (!newUsername) return;

  const userRef = doc(db, "users", currentUser.uid);
  await updateDoc(userRef, { username: newUsername, lastEdit: now });
  profileUsername.textContent = newUsername;
  lastUsernameEdit = now;
  profileModal.classList.add("hidden");
});

// ==== JOIN OR CREATE ROOM ====
joinBtn.addEventListener("click", async () => {
  const roomName = roomInput.value.trim();
  if (!roomName) return alert("Enter a room name");

  currentRoom = roomName;
  await initRoom(roomName);
});

// ==== INIT ROOM ====
async function initRoom(roomName) {
  messagesContainer.innerHTML = ""; // clear old messages
  const roomRef = collection(db, "rooms", roomName, "messages");
  const q = query(roomRef, orderBy("timestamp"));
  
  onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = "";
    snapshot.forEach(docSnap => {
      const msg = docSnap.data();
      displayMessage(msg);
    });
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  });
}

// ==== SEND MESSAGE ====
sendBtn.addEventListener("click", async () => {
  const text = messageInput.value.trim();
  if (!text || !currentRoom) return;

  const roomRef = collection(db, "rooms", currentRoom, "messages");

  // Admin priority: admin messages always first (if required)
  await addDoc(roomRef, {
    text,
    uid: currentUser.uid,
    username: currentUser.displayName,
    timestamp: Date.now(),
    isAdmin
  });

  messageInput.value = "";
});

// ==== DISPLAY MESSAGE ====
function displayMessage(msg) {
  const div = document.createElement("div");
  div.classList.add("message");
  if (msg.uid === currentUser.uid) div.classList.add("mine");
  else div.classList.add("theirs");

  // Admin styling
  let usernameDisplay = msg.username;
  if (msg.isAdmin) usernameDisplay = `<span class="admin-name">${msg.username} <span class="admin-crown">👑</span></span>`;

  div.innerHTML = `
    <div class="msg-info">
      <img src="${msg.avatar || profileAvatar.src}" />
      <span>${usernameDisplay}</span>
    </div>
    <div class="msg-text">${msg.text}</div>
  `;
  messagesContainer.appendChild(div);
  messagesWrap.scrollTop = messagesWrap.scrollHeight;
}
