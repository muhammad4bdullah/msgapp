import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* Firebase */
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

/* DOM */
const createBtn = document.getElementById("create-chat");
const joinBtn = document.getElementById("join-chat");
const joinRoomBtn = document.getElementById("join-room");
const roomIdInput = document.getElementById("room-id");
const roomPassInput = document.getElementById("room-pass");

const roomIdDisplay = document.getElementById("room-id-display");
const roomPassDisplay = document.getElementById("room-pass-display");
const linkDisplay = document.getElementById("link-display");

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send");

const profileBtn = document.getElementById("profile-btn");
const profileModal = document.getElementById("profile-modal");
const nicknameInput = document.getElementById("nickname-input");
const avatarInput = document.getElementById("avatar-input");
const saveProfileBtn = document.getElementById("save-profile");

/* Mobile */
const hamburger = document.getElementById("hamburger-btn");
const mobileMenu = document.getElementById("mobile-menu");
const closeMenu = document.getElementById("close-menu");

const mobileJoin = document.getElementById("mobile-join");
const mobileCreate = document.getElementById("mobile-create");

let currentRoomId = "";
let userId = "user-" + Math.floor(Math.random() * 10000);
let nickname = "Anonymous";
let avatarUrl = "";

/* Helper */
function randomString(len = 6) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return [...Array(len)].map(
    _ => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

/* Profile */
profileBtn.onclick = () => profileModal.style.display = "flex";

saveProfileBtn.onclick = () => {
  if (nicknameInput.value.trim())
    nickname = nicknameInput.value.trim();

  const file = avatarInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => avatarUrl = reader.result;
    reader.readAsDataURL(file);
  }

  profileModal.style.display = "none";
};

/* CREATE ROOM */
createBtn.onclick = async () => {
  const roomId = randomString(8);
  const password = randomString(6);

  await setDoc(doc(db, "rooms", roomId), { password });

  currentRoomId = roomId;
  updateRoomInfo(roomId, password);

  enterChat();
};

/* JOIN ROOM */
joinBtn.onclick = () => {
  document.getElementById("join-section").style.display = "block";
};

joinRoomBtn.onclick = async () => {
  joinRoom(roomIdInput.value, roomPassInput.value);
};

/* MOBILE CREATE + JOIN */
mobileCreate.onclick = () => createBtn.click();

mobileJoin.onclick = () => {
  roomIdInput.value = document.getElementById("mobile-room-id").value;
  roomPassInput.value = document.getElementById("mobile-room-pass").value;
  joinRoomBtn.click();
  mobileMenu.classList.remove("open");
};

/* Update room UI */
function updateRoomInfo(id, pass) {
  roomIdDisplay.textContent = "Room ID: " + id;
  roomPassDisplay.textContent = "Password: " + pass;

  linkDisplay.innerHTML =
    Share link: <a href="?room=${id}&pass=${pass}">Open</a>;
}

/* JOIN HANDLER */
async function joinRoom(roomId, password) {
  if (!roomId || !password)
    return alert("Enter Room ID + Password");

  const roomDoc = await getDoc(doc(db, "rooms", roomId));

  if (!roomDoc.exists())
    return alert("Room doesn't exist!");

  if (roomDoc.data().password !== password)
    return alert("Incorrect password");

  currentRoomId = roomId;
  updateRoomInfo(roomId, password);
  enterChat();
}

/* ENTER CHAT */
function enterChat() {
  listenMessages();
}

/* SEND MESSAGE */
sendBtn.onclick = async () => {
  if (!currentRoomId || !messageInput.value.trim()) return;

  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    text: messageInput.value,
    timestamp: new Date(),
    userId,
    nickname,
    avatarUrl
  });

  messageInput.value = "";
};

/* LISTEN MESSAGES */
function listenMessages() {
  const msgRef = collection(db, "rooms", currentRoomId, "messages");

  onSnapshot(msgRef, snapshot => {
    messagesDiv.innerHTML = "";

    snapshot.docs
      .sort((a, b) => a.data().timestamp - b.data().timestamp)
      .forEach(d => {
        const msg = d.data();
        const div = document.createElement("div");

        const info = document.createElement("div");
        info.className = "msg-info";

        if (msg.avatarUrl) {
          const img = document.createElement("img");
          img.src = msg.avatarUrl;
          info.appendChild(img);
        }

        const name = document.createElement("span");
        name.textContent = msg.nickname || "Anonymous";
        info.appendChild(name);

        const bubble = document.createElement("div");
        bubble.className = "message " +
          (msg.userId === userId ? "my-msg" : "other-msg");
        bubble.textContent = msg.text;

        div.appendChild(info);
        div.appendChild(bubble);

        messagesDiv.appendChild(div);
      });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

/* HAMBURGER MENU TOGGLE */
hamburger.onclick = () => mobileMenu.classList.add("open");
closeMenu.onclick = () => mobileMenu.classList.remove("open");
