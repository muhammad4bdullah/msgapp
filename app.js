import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Firebase config
 const firebaseConfig = {
    apiKey: "AIzaSyAEWxTJ1loQkXM1ShwAAF1J15RQLlCgdGM",
    authDomain: "msgapp-262c9.firebaseapp.com",
    projectId: "msgapp-262c9",
    storageBucket: "msgapp-262c9.firebasestorage.app",
    messagingSenderId: "122648836940",
    appId: "1:122648836940:web:a098c052f65f3eb305ade9"
  };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);
const auth = getAuth(app);

// DOM
const loginSection = document.getElementById("loginSection");
const googleLoginBtn = document.getElementById("googleLogin");
const profileSetup = document.getElementById("profileSetup");
const usernameInput = document.getElementById("username");
const nicknameInput = document.getElementById("nickname");
const profilePicInput = document.getElementById("profilePic");
const saveProfileBtn = document.getElementById("saveProfile");
const chatSection = document.getElementById("chatSection");
const roomNameDisplay = document.getElementById("roomNameDisplay");
const chatWindow = document.getElementById("chatWindow");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessage");
const createRoomBtn = document.getElementById("createRoom");
const copyLinkBtn = document.getElementById("copyLink");
const openMenuBtn = document.getElementById("openMenu");
const closeMenuBtn = document.getElementById("closeMenu");
const hamburgerMenu = document.getElementById("hamburgerMenu");
const roomList = document.getElementById("roomList");
const logoutBtn = document.getElementById("logoutBtn");

// State
let currentUser = null;
let currentRoom = null;
const adminEmail = "m10abdullah09@gmail.com";

// -------------------- Google Login --------------------
googleLoginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});

// Persistent login
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = { uid: user.uid, email: user.email, displayName: user.displayName, isAdmin: user.email === adminEmail };
    loginSection.classList.add("hidden");

    const userRef = ref(db, `users/${user.uid}`);
    onValue(userRef, (snapshot) => {
      if (!snapshot.exists()) {
        profileSetup.classList.remove("hidden");
      } else {
        currentUser = snapshot.val();
        profileSetup.classList.add("hidden");
        chatSection.classList.remove("hidden");
        updateRoomList();
      }
    });
  } else {
    loginSection.classList.remove("hidden");
    profileSetup.classList.add("hidden");
    chatSection.classList.add("hidden");
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  signOut(auth);
  currentRoom = null;
  chatWindow.innerHTML = "";
});

// -------------------- Profile Setup --------------------
saveProfileBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const nickname = nicknameInput.value.trim();
  const file = profilePicInput.files[0];
  if (!username || !nickname || !file) return alert("Fill all fields");

  const storageRef = sRef(storage, `profilePics/${currentUser.uid}_${file.name}`);
  await uploadBytes(storageRef, file);
  const picURL = await getDownloadURL(storageRef);

  currentUser.username = username;
  currentUser.nickname = nickname;
  currentUser.profilePicURL = picURL;

  set(ref(db, `users/${currentUser.uid}`), currentUser);
  profileSetup.classList.add("hidden");
  chatSection.classList.remove("hidden");
  updateRoomList();
});

// -------------------- Hamburger Menu --------------------
openMenuBtn.addEventListener("click", () => hamburgerMenu.classList.add("menu-open"));
closeMenuBtn.addEventListener("click", () => hamburgerMenu.classList.remove("menu-open"));

// -------------------- Rooms --------------------
function randomRoomName(len = 6) {
  let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let name = "";
  for (let i = 0; i < len; i++) name += chars[Math.floor(Math.random() * chars.length)];
  return name;
}
function randomPassword(len = 4) {
  let nums = "0123456789";
  let pass = "";
  for (let i = 0; i < len; i++) pass += nums[Math.floor(Math.random() * nums.length)];
  return pass;
}

createRoomBtn.addEventListener("click", async () => {
  if (!currentUser) return alert("Set up your profile first");

  const today = new Date();
  const dayKey = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;

  // Admin bypass
  if (!currentUser.isAdmin) {
    const userRoomsRef = ref(db, `userRoomHistory/${currentUser.uid}/${dayKey}`);
    let roomsToday = 0;
    await onValue(userRoomsRef, (snapshot) => {
      if (snapshot.exists()) roomsToday = snapshot.val();
    }, { onlyOnce: true });

    if (roomsToday >= 10) return alert("You have reached your 10 room creation limit today.");

    set(ref(db, `userRoomHistory/${currentUser.uid}/${dayKey}`), roomsToday + 1);
  }

  const roomID = Date.now();
  const roomName = randomRoomName();
  const password = randomPassword();

  currentRoom = { roomID, roomName, password, createdBy: currentUser.uid, members: [currentUser.uid] };
  set(ref(db, `rooms/${roomID}`), currentRoom);
  roomNameDisplay.textContent = `Room: ${roomName}`;
  updateRoomList();
});

// -------------------- Copy Link --------------------
copyLinkBtn.addEventListener("click", () => {
  if (!currentRoom) return;
  const link = `${window.location.href}?room=${currentRoom.roomID}`;
  navigator.clipboard.writeText(link);
  alert("Link copied!");
});

// -------------------- Send Message --------------------
sendMessageBtn.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (!text || !currentRoom) return;
  const msg = { senderUID: currentUser.uid, message: text, timestamp: Date.now() };
  push(ref(db, `rooms/${currentRoom.roomID}/messages`), msg);
  messageInput.value = "";
});

// -------------------- Listen Messages --------------------
function listenMessages(roomID) {
  chatWindow.innerHTML = "";
  const messagesRef = ref(db, `rooms/${roomID}/messages`);
  onValue(messagesRef, (snapshot) => {
    chatWindow.innerHTML = "";
    snapshot.forEach(snap => {
      const msg = snap.val();
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("message");
      const isAdmin = currentUser.isAdmin && msg.senderUID === currentUser.uid;
      msgDiv.classList.add(isAdmin ? "admin" : "user");
      msgDiv.innerHTML = `<b>${isAdmin ? "Admin" : currentUser.nickname || "User"}</b>: ${msg.message}`;
      chatWindow.appendChild(msgDiv);
      chatWindow.scrollTop = chatWindow.scrollHeight;
    });
  });
}

// -------------------- Room List --------------------
function updateRoomList() {
  roomList.innerHTML = "";
  const roomsRef = ref(db, "rooms");
  onValue(roomsRef, (snapshot) => {
    roomList.innerHTML = "";
    snapshot.forEach(snap => {
      const room = snap.val();
      if (room.members.includes(currentUser.uid)) {
        const li = document.createElement("li");
        li.textContent = `${room.roomName} (${room.password})`;
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
          currentRoom = room;
          roomNameDisplay.textContent = `Room: ${room.roomName}`;
          listenMessages(room.roomID);
          hamburgerMenu.classList.remove("menu-open");
        });
        roomList.appendChild(li);
      }
    });
  });
}

// -------------------- Auto Join via URL --------------------
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get("room");
if (roomParam && currentUser) {
  currentRoom = { roomID: roomParam };
  roomNameDisplay.textContent = `Room: ${roomParam}`;
  listenMessages(roomParam);
}
