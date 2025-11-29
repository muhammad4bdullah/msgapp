import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, onSnapshot, updateDoc 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyAEWxTJ1loQkXM1ShwAAF1J15RQLlCgdGM",
  authDomain: "msgapp-262c9.firebaseapp.com",
  projectId: "msgapp-262c9",
  storageBucket: "msgapp-262c9.appspot.com",
  messagingSenderId: "122648836940",
  appId: "1:122648836940:web:a098c052f65f3eb305ade9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

// ===== DOM ELEMENTS =====
const loginOverlay = document.getElementById("login-overlay");
const googleLoginBtn = document.getElementById("google-login-btn");
const appGrid = document.querySelector(".app-grid");
const topAvatar = document.getElementById("profile-avatar");
const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const joinRoomBtn = document.getElementById("join-room");
const createRoomBtn = document.getElementById("create-room");
const roomNameInput = document.getElementById("room-name");
const roomPassInput = document.getElementById("room-pass");
const logoutBtn = document.getElementById("logout-btn");
const profileModal = document.getElementById("profile-modal");
const viewPfp = document.getElementById("view-pfp");
const viewUsername = document.getElementById("view-username");
const viewNickname = document.getElementById("view-nickname");
const viewRole = document.getElementById("view-role");
const editUsernameInput = document.getElementById("edit-username");
const editNicknameInput = document.getElementById("edit-nickname");
const editAvatarInput = document.getElementById("edit-avatar");
const saveProfileBtn = document.getElementById("save-profile");
const profileBtn = document.getElementById("profile-btn");
const closeProfileBtn = document.getElementById("close-profile-view");
const cancelEditBtn = document.getElementById("cancel-edit");
const profileViewDiv = document.getElementById("profile-view");
const profileEditDiv = document.getElementById("profile-edit");
const chatsListDiv = document.getElementById("chats-list");

let currentUser = null;
let currentRoom = null;
let isAdmin = false;

// ===== ADMIN UID =====
const ADMIN_UID = "YOUR_ADMIN_UID_HERE"; // Replace with your Firebase UID

// ===== GOOGLE LOGIN =====
googleLoginBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
    isAdmin = currentUser.uid === ADMIN_UID;
    loginOverlay.classList.add("hidden");
    appGrid.classList.remove("hidden");
    topAvatar.src = currentUser.photoURL || "";
    await ensureUserProfile();
    loadUserRooms();
  } catch (err) {
    alert("Login failed: " + err.message);
    console.error(err);
  }
});

// ===== ENSURE USER PROFILE =====
async function ensureUserProfile() {
  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      username: currentUser.displayName,
      nickname: "",
      avatar: currentUser.photoURL || "",
      isAdmin,
      lastUsernameChange: 0,
      roomsCreatedToday: 0,
      lastRoomCreationDay: 0
    });
  }
}

// ===== SEND MESSAGE =====
sendBtn.addEventListener("click", async () => {
  if (!currentRoom) return alert("Join a room first!");
  const text = messageInput.value.trim();
  if (!text) return;
  const roomRef = collection(db, "rooms", currentRoom, "messages");
  await addDoc(roomRef, {
    text,
    uid: currentUser.uid,
    username: currentUser.displayName,
    avatar: currentUser.photoURL,
    timestamp: Date.now(),
    isAdmin
  });
  messageInput.value = "";
});

// ===== CREATE ROOM =====
createRoomBtn.addEventListener("click", async () => {
  const roomName = roomNameInput.value.trim() || generateRandomName();
  const roomPass = roomPassInput.value.trim() || generateRandomPass();
  
  // Check daily limit for normal users
  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();
  const today = new Date().toDateString();
  
  if (!isAdmin) {
    if (userData.lastRoomCreationDay !== today) {
      await updateDoc(userRef, { roomsCreatedToday: 0, lastRoomCreationDay: today });
      userData.roomsCreatedToday = 0;
    }
    if (userData.roomsCreatedToday >= 10) return alert("Daily room creation limit reached");
  }

  const roomRefDoc = doc(db, "rooms", roomName);
  const snap = await getDoc(roomRefDoc);
  if (snap.exists()) return alert("Room already exists");

  await setDoc(roomRefDoc, {
    createdAt: Date.now(),
    creator: currentUser.uid,
    password: roomPass
  });

  if (!isAdmin) await updateDoc(userRef, { roomsCreatedToday: userData.roomsCreatedToday + 1, lastRoomCreationDay: today });

  joinRoom(roomName);
  loadUserRooms();
});

// ===== JOIN ROOM =====
joinRoomBtn.addEventListener("click", async () => {
  const roomName = roomNameInput.value.trim();
  if (!roomName) return alert("Enter room name to join");
  joinRoom(roomName);
});

// ===== JOIN ROOM FUNCTION =====
async function joinRoom(roomName) {
  currentRoom = roomName;
  messagesContainer.innerHTML = "";
  const roomRef = collection(db, "rooms", roomName, "messages");
  const q = query(roomRef, orderBy("timestamp"));
  
  onSnapshot(q, (snapshot) => {
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

// ===== PROFILE MODAL =====
profileBtn.addEventListener("click", async () => {
  profileModal.classList.remove("hidden");
  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data();
  viewPfp.src = data.avatar || "";
  viewUsername.textContent = data.username;
  viewNickname.textContent = data.nickname || "";
  viewRole.textContent = data.isAdmin ? "Admin" : "User";
});

closeProfileBtn.addEventListener("click", () => profileModal.classList.add("hidden"));
cancelEditBtn.addEventListener("click", () => {
  profileEditDiv.classList.add("hidden");
  profileViewDiv.classList.remove("hidden");
});

// ===== SAVE PROFILE =====
saveProfileBtn.addEventListener("click", async () => {
  const newUsername = editUsernameInput.value.trim();
  const newNickname = editNicknameInput.value.trim();
  let avatarUrl = currentUser.photoURL;

  if (editAvatarInput.files.length > 0) {
    const file = editAvatarInput.files[0];
    const storageRef = ref(storage, `avatars/${currentUser.uid}`);
    await uploadBytes(storageRef, file);
    avatarUrl = await getDownloadURL(storageRef);
  }

  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data();
  const fifteenDays = 1000*60*60*24*15;

  if (newUsername && Date.now() - data.lastUsernameChange < fifteenDays) {
    alert("Username can only be changed once every 15 days");
    return;
  }

  await updateDoc(userRef, {
    username: newUsername || data.username,
    nickname: newNickname,
    avatar: avatarUrl,
    lastUsernameChange: newUsername ? Date.now() : data.lastUsernameChange
  });

  alert("Profile updated!");
  profileEditDiv.classList.add("hidden");
  profileViewDiv.classList.remove("hidden");
});

// ===== LOGOUT =====
logoutBtn.addEventListener("click", () => signOut(auth).then(() => location.reload()));

// ===== AUTH STATE =====
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    isAdmin = currentUser.uid === ADMIN_UID;
    loginOverlay.classList.add("hidden");
    appGrid.classList.remove("hidden");
    topAvatar.src = currentUser.photoURL || "";
    ensureUserProfile();
    loadUserRooms();
  } else {
    loginOverlay.classList.remove("hidden");
    appGrid.classList.add("hidden");
  }
});

// ===== LOAD USER ROOMS =====
async function loadUserRooms() {
  chatsListDiv.innerHTML = "";
  const roomsSnap = await getDoc(doc(db, "users", currentUser.uid));
  const roomsData = roomsSnap.data();

  // Load all rooms (you can add join info or history)
  const roomsCol = collection(db, "rooms");
  onSnapshot(roomsCol, (snapshot) => {
    chatsListDiv.innerHTML = "";
    snapshot.forEach(docSnap => {
      const r = docSnap.data();
      const roomDiv = document.createElement("div");
      roomDiv.style.padding = "8px";
      roomDiv.style.marginBottom = "6px";
      roomDiv.style.background = "rgba(255,255,255,0.05)";
      roomDiv.style.borderRadius = "8px";
      roomDiv.style.cursor = "pointer";
      roomDiv.innerHTML = `
        <strong>${docSnap.id}</strong>
        <br>
        <small>Creator: ${r.creator}</small>
        <br>
        <small>Password: ${r.password || "None"}</small>
        <button style="margin-top:4px;">Join</button>
        <button style="margin-top:4px;">Copy Link</button>
      `;
      const joinBtn = roomDiv.querySelector("button:nth-child(4)");
      joinBtn.addEventListener("click", () => joinRoom(docSnap.id));

      const copyBtn = roomDiv.querySelector("button:nth-child(5)");
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(`${window.location.href}?room=${docSnap.id}`);
        alert("Room link copied!");
      });

      chatsListDiv.appendChild(roomDiv);
    });
  });
}

// ===== RANDOM GENERATORS =====
function generateRandomName() {
  return Math.random().toString(36).substring(2, 8);
}
function generateRandomPass() {
  return Math.floor(1000 + Math.random()*9000).toString();
}
