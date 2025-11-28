import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, addDoc, collection, onSnapshot, getDoc, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Firebase config
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
const provider = new GoogleAuthProvider();

// DOM elements
const overlay = document.getElementById("login-overlay");
const loginBtn = document.getElementById("google-login-btn");
const profileModal = document.getElementById("profile-modal");
const nicknameInput = document.getElementById("nickname-input");
const avatarInput = document.getElementById("avatar-input");
const saveProfileBtn = document.getElementById("save-profile");

const leftCol = document.querySelector(".left-col");
const chatList = document.querySelector(".chats-list");
const roomIdDisplay = document.getElementById("room-id-display");
const roomPassDisplay = document.getElementById("room-pass-display");
const linkDisplay = document.getElementById("link-display");
const createBtn = document.getElementById("create-chat");
const joinBtn = document.getElementById("join-chat");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send");
const dailyCounter = document.getElementById("daily-count");

let currentUser = null;
let currentRoomId = "";
let nickname = "Anonymous";
let avatarUrl = "";
let chatLimit = 10;

// ----------------- Helper Functions -----------------
function randomString(len = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let str = '';
  for (let i = 0; i < len; i++) str += chars.charAt(Math.floor(Math.random() * chars.length));
  return str;
}

function updateRoomLink(roomId, password) {
  const link = `${window.location.origin}/msgapp/?room=${roomId}&pass=${password}`;
  linkDisplay.innerHTML = `Share link: <a href="${link}" target="_blank" style="color:#0d6efd;">${link}</a>`;
}

// ----------------- Auth & Profile -----------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    overlay.style.display = "none";

    // Fetch user profile from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      nickname = data.nickname || user.displayName || "Anonymous";
      avatarUrl = data.avatarUrl || user.photoURL || "";
      nicknameInput.value = nickname;
    } else {
      profileModal.style.display = "flex";
    }

    updateDailyCounter();
    loadUserChats();
  } else {
    overlay.style.display = "flex";
  }
});

// Google login
loginBtn.onclick = () => {
  signInWithPopup(auth, provider).catch(err => alert(err.message));
};

// Save profile with 15-day username lock
saveProfileBtn.onclick = async () => {
  const name = nicknameInput.value.trim();
  if (!name) return alert("Nickname required!");
  nickname = name;

  const file = avatarInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = async () => {
      avatarUrl = reader.result;
      await saveUserProfile();
      profileModal.style.display = "none";
    };
    reader.readAsDataURL(file);
  } else {
    await saveUserProfile();
    profileModal.style.display = "none";
  }
};

async function saveUserProfile() {
  await setDoc(doc(db, "users", currentUser.uid), {
    nickname,
    avatarUrl,
    lockUntil: Date.now() + 15*24*3600*1000  // 15 days lock
  }, { merge: true });
}

// ----------------- Left Menu: Chats -----------------
async function loadUserChats() {
  const chatsRef = collection(db, "users", currentUser.uid, "chats");
  onSnapshot(chatsRef, snapshot => {
    chatList.innerHTML = "";
    snapshot.docs.forEach(docSnap => {
      const chat = docSnap.data();
      const div = document.createElement("div");
      div.classList.add("chat-item");
      div.textContent = chat.title;
      div.onclick = () => openChat(chat.roomId);
      chatList.appendChild(div);
    });
  });
}

// Update daily counter
async function updateDailyCounter() {
  const today = new Date().toISOString().slice(0,10);
  const counterDoc = await getDoc(doc(db, "users", currentUser.uid, "daily", today));
  const used = counterDoc.exists() ? counterDoc.data().count : 0;
  dailyCounter.textContent = `Chats left today: ${chatLimit - used}`;
}

// Increment daily chat usage
async function incrementDailyCount() {
  const today = new Date().toISOString().slice(0,10);
  const docRef = doc(db, "users", currentUser.uid, "daily", today);
  const docSnap = await getDoc(docRef);
  const count = docSnap.exists() ? docSnap.data().count : 0;
  if (count >= chatLimit) return false;
  await setDoc(docRef, { count: count + 1 });
  updateDailyCounter();
  return true;
}

// ----------------- Create / Join Chat -----------------
createBtn.onclick = async () => {
  if (!(await incrementDailyCount())) return alert("Daily chat limit reached!");
  const roomId = randomString(8);
  const password = randomString(6);
  currentRoomId = roomId;
  await setDoc(doc(db,"rooms",roomId), { password, users: [nickname] });
  await setDoc(doc(db,"users",currentUser.uid,"chats",roomId), { title: nickname, roomId, password });
  roomIdDisplay.textContent = `Room ID: ${roomId}`;
  roomPassDisplay.textContent = `Password: ${password}`;
  updateRoomLink(roomId, password);
  enterChat();
};

joinBtn.onclick = async () => {
  const roomId = prompt("Enter Room ID:");
  const password = prompt("Enter Room Password:");
  if (!roomId || !password) return;
  const roomDoc = await getDoc(doc(db,"rooms",roomId));
  if (!roomDoc.exists()) return alert("Room does not exist");
  if (roomDoc.data().password !== password) return alert("Incorrect password");

  currentRoomId = roomId;
  await setDoc(doc(db,"users",currentUser.uid,"chats",roomId), { title: roomDoc.data().users.join(", "), roomId, password });
  roomIdDisplay.textContent = `Room ID: ${roomId}`;
  roomPassDisplay.textContent = `Password: ${password}`;
  updateRoomLink(roomId, password);
  enterChat();
};

// ----------------- Chat -----------------
function enterChat() {
  listenMessages();
}

// Send message (Enter key)
messageInput.addEventListener("keypress", async (e) => {
  if (e.key === "Enter") sendMessage();
});
sendBtn.onclick = sendMessage;

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentRoomId) return;
  await addDoc(collection(db,"rooms",currentRoomId,"messages"), {
    text,
    userId: currentUser.uid,
    timestamp: new Date(),
    nickname,
    avatarUrl
  });
  messageInput.value = '';
}

// Listen messages
function listenMessages() {
  const msgsCol = collection(db,"rooms",currentRoomId,"messages");
  const q = query(msgsCol, orderBy("timestamp"));
  onSnapshot(q, snapshot => {
    messagesDiv.innerHTML = "";
    snapshot.docs.forEach(docSnap => {
      const msg = docSnap.data();
      const div = document.createElement("div");
      div.classList.add("message");
      div.classList.add(msg.userId === currentUser.uid ? "mine" : "theirs");

      // Info
      const infoDiv = document.createElement("div");
      infoDiv.classList.add("msg-info");
      if(msg.avatarUrl){
        const img = document.createElement("img");
        img.src = msg.avatarUrl;
        infoDiv.appendChild(img);
      }
      const nameSpan = document.createElement("span");
      nameSpan.textContent = msg.nickname;
      infoDiv.appendChild(nameSpan);

      div.appendChild(infoDiv);

      // Message text
      const textDiv = document.createElement("div");
      textDiv.textContent = msg.text;
      div.appendChild(textDiv);

      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

// Open existing chat from left menu
async function openChat(roomId){
  currentRoomId = roomId;
  const roomDoc = await getDoc(doc(db,"rooms",roomId));
  roomIdDisplay.textContent = `Room ID: ${roomId}`;
  roomPassDisplay.textContent = `Password: ${roomDoc.data().password}`;
  updateRoomLink(roomId, roomDoc.data().password);
  enterChat();
}
