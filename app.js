// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyAEWxTJ1loQkXM1ShwAAF1J15RQLlCgdGM",
  authDomain: "msgapp-262c9.firebaseapp.com",
  projectId: "msgapp-262c9",
  storageBucket: "msgapp-262c9.appspot.com",
  messagingSenderId: "122648836940",
  appId: "1:122648836940:web:a098c052f65f3eb305ade9",
  databaseURL: "https://msgapp-262c9-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let activeRoom = null;

// --- UI elements ---
const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main");
const googleLoginBtn = document.getElementById("googleLogin");
const userPhoto = document.getElementById("userPhoto");
const userNameDisplay = document.getElementById("userNameDisplay");
const userEmail = document.getElementById("userEmail");
const btnLogout = document.getElementById("btnLogout");

const editNicknameInput = document.getElementById("editNickname");
const editPhotoInput = document.getElementById("editPhoto");
const btnSaveProfile = document.getElementById("btnSaveProfile");

const btnShowCreate = document.getElementById("btnShowCreate");
const btnShowJoin = document.getElementById("btnShowJoin");
const createRoomSection = document.getElementById("createRoomSection");
const joinRoomSection = document.getElementById("joinRoomSection");
const btnCreate = document.getElementById("btnCreate");
const btnJoin = document.getElementById("btnJoin");
const roomPASScreate = document.getElementById("roomPASScreate");
const roomNameCreate = document.getElementById("roomNameCreate");
const roomIDjoin = document.getElementById("roomIDjoin");
const roomPASSjoin = document.getElementById("roomPASSjoin");

const roomListEl = document.getElementById("roomList");
const noRooms = document.getElementById("noRooms");
const chatHeader = document.getElementById("chatHeader");
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendMsg = document.getElementById("sendMsg");
const roomInfoEl = document.getElementById("roomInfo");

// Profile modal elements
const profileModal = document.getElementById("profileModal");
const modalPhoto = document.getElementById("modalPhoto");
const modalNickname = document.getElementById("modalNickname");
const modalPhotoURL = document.getElementById("modalPhotoURL");
const modalDOB = document.createElement("input");
modalDOB.type = "date";
modalDOB.id = "modalDOB";
modalDOB.placeholder = "Date of Birth";
modalDOB.style.width = "100%";
modalDOB.style.padding = "6px 8px";
modalDOB.style.borderRadius = "6px";
modalDOB.style.border = "none";
modalDOB.style.background = "#051017";
modalDOB.style.color = "#eaf3f5";
profileModal.querySelector(".panel").insertBefore(modalDOB, profileModal.querySelector("#modalSaveProfile"));

const modalSave = document.getElementById("modalSaveProfile");
const modalClose = document.getElementById("modalClose");
const editNickToggle = document.getElementById("editNickToggle");
const editPhotoToggle = document.getElementById("editPhotoToggle");

// --- Auth handlers ---
googleLoginBtn.onclick = () => signInWithPopup(auth, provider).catch(err => alert(err.message || err));
btnLogout.onclick = () => signOut(auth).catch(console.error);

// --- Profile save (top bar) ---
btnSaveProfile.onclick = async () => {
  if (!currentUser) return;
  const nickname = editNicknameInput.value.trim() || currentUser.displayName || "User";
  const photoURL = editPhotoInput.value.trim() || currentUser.photoURL || "";
  try {
    await updateProfile(currentUser, { displayName: nickname, photoURL });
    await update(ref(db, `users/${currentUser.uid}`), { displayName: nickname, photoURL });
    userNameDisplay.innerText = nickname;
    userPhoto.src = photoURL || "";
    alert("Profile updated!");
  } catch(err) { console.error(err); alert("Failed to update profile"); }
};

// --- Profile modal handlers ---
userPhoto.onclick = () => {
  if (!currentUser) return;
  profileModal.classList.add("show");
  modalPhoto.src = currentUser.photoURL || "";
  modalNickname.value = currentUser.displayName || "User";
  modalPhotoURL.value = currentUser.photoURL || "";
  get(ref(db, `users/${currentUser.uid}/dob`)).then(snap => {
    modalDOB.value = snap.exists() ? snap.val() : "";
  });
};

modalClose.onclick = () => profileModal.classList.remove("show");
modalSave.onclick = async () => {
  if (!currentUser) return;
  const nickname = modalNickname.value.trim() || "User";
  const photoURL = modalPhotoURL.value.trim() || "";
  const dob = modalDOB.value || "";
  try {
    await updateProfile(currentUser, { displayName: nickname, photoURL });
    await update(ref(db, `users/${currentUser.uid}`), { displayName: nickname, photoURL, dob });
    userNameDisplay.innerText = nickname;
    userPhoto.src = photoURL || "";
    profileModal.classList.remove("show");
    alert("Profile updated!");
  } catch(err) { console.error(err); alert("Failed to update profile"); }
};

// --- Toggle sections ---
btnShowCreate.onclick = () => {
  createRoomSection.classList.toggle("hidden");
  joinRoomSection.classList.add("hidden");
  roomPASScreate.value = "";
  roomNameCreate.value = "";
  roomPASScreate.focus();
};
btnShowJoin.onclick = () => {
  joinRoomSection.classList.toggle("hidden");
  createRoomSection.classList.add("hidden");
  roomIDjoin.value = "";
  roomPASSjoin.value = "";
  roomIDjoin.focus();
};

// --- Auth state ---
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    loginScreen.style.display = "none";
    mainScreen.style.display = "block";

    userPhoto.src = user.photoURL || "";
    userNameDisplay.innerText = user.displayName || "User";
    userEmail.innerText = user.email || "";

    editNicknameInput.value = user.displayName || "User";
    editPhotoInput.value = user.photoURL || "";

    await set(ref(db, `users/${user.uid}`), {
      uid: user.uid,
      displayName: user.displayName || "User",
      email: user.email || "",
      photoURL: user.photoURL || "",
      lastLogin: Date.now()
    });

    loadRooms();
    createRoomSection.classList.add("hidden");
    joinRoomSection.classList.add("hidden");
  } else {
    currentUser = null;
    loginScreen.style.display = "block";
    mainScreen.style.display = "none";
    clearUI();
  }
});

// --- Room creation ---
function randomRoomID() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

btnCreate.onclick = async () => {
  if (!currentUser) { alert("Login first"); return; }

  let pass = roomPASScreate.value.trim();
  if (!/^\d{6,}$/.test(pass)) {
    pass = prompt("Enter a 6-digit numeric room password:");
    if (!pass || !/^\d{6,}$/.test(pass)) { alert("Invalid password"); return; }
  }

  const id = randomRoomID();
  const name = roomNameCreate.value.trim() || "Unnamed Room";
  const roomURL = `${window.location.origin}${window.location.pathname}?room=${id}`;

  try {
    await set(ref(db, `rooms/${id}`), { name, pass, createdBy: currentUser.uid, createdAt: Date.now(), roomURL });
    await set(ref(db, `members/${id}/${currentUser.uid}`), true);

    roomPASScreate.value = "";
    roomNameCreate.value = "";
    loadRooms();
    openRoom(id);
    showRoomInfo(id, name, pass, roomURL);
  } catch(err) { console.error(err); alert("Failed to create room"); }
};

// --- Join room ---
btnJoin.onclick = async () => {
  if (!currentUser) { alert("Login first"); return; }

  const id = roomIDjoin.value.trim().toUpperCase();
  const pass = roomPASSjoin.value.trim();
  if (!id || !pass) { alert("Enter Room ID & Pass"); return; }

  try {
    const snap = await get(ref(db, `rooms/${id}`));
    if (!snap.exists()) { alert("Room not found"); return; }
    if ((snap.val().pass || "") !== pass) { alert("Wrong password"); return; }

    await set(ref(db, `members/${id}/${currentUser.uid}`), true);
    roomIDjoin.value = "";
    roomPASSjoin.value = "";
    openRoom(id);

    const { name, roomURL } = snap.val();
    showRoomInfo(id, name, pass, roomURL);
  } catch(err) { console.error(err); alert("Failed to join room"); }
};

// --- Show room info ---
function showRoomInfo(id, name, pass, url) {
  roomInfoEl.innerHTML = `
    <div><b>Room Name:</b> ${name}</div>
    <div><b>Room ID:</b> ${id}</div>
    <div><b>Pass:</b> ${pass}</div>
    <div><b>Link:</b> <input type="text" value="${url}" readonly style="width:200px;"> <button onclick="copyRoomLink()">Copy</button></div>
  `;
}

// --- Load rooms ---
function loadRooms() {
  if (!currentUser) return;
  onValue(ref(db, "members"), snap => {
    roomListEl.innerHTML = "";
    let found = false;
    snap.forEach(roomSnap => {
      if (roomSnap.child(currentUser.uid).exists()) {
        found = true;
        const id = roomSnap.key;
        get(ref(db, `rooms/${id}`)).then(roomSnapData => {
          const roomName = roomSnapData.exists() ? roomSnapData.val().name : id;
          const btn = document.createElement("button");
          btn.textContent = `${roomName} (${id})`;
          btn.onclick = () => openRoom(id);
          roomListEl.appendChild(btn);
        });
      }
    });
    noRooms.classList.toggle("hidden", found);
  });
}

// --- Open & listen ---
window.openRoom = function(room){
  activeRoom = room;
  get(ref(db, `rooms/${room}`)).then(snap => {
    const name = snap.exists() ? snap.val().name : room;
    chatHeader.innerText = `Room: ${name}`;
  });
  messagesEl.innerHTML = `<div class="muted center">Loading messages...</div>`;
  listenRoom(room);
};

function listenRoom(room) {
  if (!room) return;
  const messagesRef = ref(db, `messages/${room}`);
  onValue(messagesRef, snap => {
    messagesEl.innerHTML = "";
    if (!snap.exists()) {
      messagesEl.innerHTML = `<div class="muted center">No messages yet</div>`;
      return;
    }
    snap.forEach(m => {
      const d = m.val();
      const wrapper = document.createElement("div");
      wrapper.className = `message ${d.uid === currentUser.uid ? "mine" : ""}`;

      const img = document.createElement("img");
      img.src = d.photoURL || "";
      img.alt = d.nickname || "user";

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      const nameDiv = document.createElement("div");
      nameDiv.className = "msg-name";
      nameDiv.textContent = d.nickname || "User";

      const textDiv = document.createElement("div");
      textDiv.textContent = d.text || "";
      textDiv.style.whiteSpace = "pre-wrap";

      const timeDiv = document.createElement("div");
      timeDiv.className = "msg-time";
      timeDiv.textContent = d.time ? new Date(d.time).toLocaleString() : "";

      bubble.appendChild(nameDiv);
      bubble.appendChild(textDiv);
      bubble.appendChild(timeDiv);

      wrapper.appendChild(img);
      wrapper.appendChild(bubble);

      messagesEl.appendChild(wrapper);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// --- Send message ---
sendMsg.onclick = sendMessage;
msgInput.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
function sendMessage() {
  if (!currentUser || !activeRoom) return;
  const t = msgInput.value.trim();
  if (!t) return;
  msgInput.value = "";
  push(ref(db, `messages/${activeRoom}`), {
    uid: currentUser.uid,
    nickname: currentUser.displayName || "User",
    photoURL: currentUser.photoURL || "",
    text: t,
    time: Date.now()
  });
}

// --- Helpers ---
function clearUI() {
  roomListEl.innerHTML = "";
  messagesEl.innerHTML = `<div class="muted center">Select a room to start chatting</div>`;
  chatHeader.innerText = "No Room Selected";
  roomInfoEl.innerHTML = "";
  noRooms.classList.remove("hidden");
}

// --- Copy room link ---
window.copyRoomLink = () => {
  const input = roomInfoEl.querySelector("input");
  input.select();
  document.execCommand("copy");
  alert("Room link copied!");
};
