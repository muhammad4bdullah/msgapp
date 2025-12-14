// ------------------------ IMPORTS ------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get, remove, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ------------------------ FIREBASE INIT ------------------------
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
const DEFAULT_AVATAR = "https://i.ibb.co/7QpKsCX/default-avatar.png";

// ------------------------ GLOBALS ------------------------
let currentUser = null;
let activeRoom = localStorage.getItem("activeRoom") || null;
let roomFilter = "all";
let usersCache = {}; // Cache for user data to avoid re-fetching

// ------------------------ UI ELEMENTS ------------------------
const mainScreen = document.getElementById("main");
const btnLogout = document.getElementById("btnLogout");
const userPhoto = document.getElementById("userPhoto");
const userNameDisplay = document.getElementById("userNameDisplay");
const userEmail = document.getElementById("userEmail");

const btnShowCreate = document.getElementById("btnShowCreate");
const btnShowJoin = document.getElementById("btnShowJoin");
const createRoomSection = document.getElementById("createRoomSection");
const joinRoomSection = document.getElementById("joinRoomSection");
const roomNameCreate = document.getElementById("roomNameCreate");
const roomPASScreate = document.getElementById("roomPASScreate");
const btnCreate = document.getElementById("btnCreate");
const roomIDjoin = document.getElementById("roomIDjoin");
const roomPASSjoin = document.getElementById("roomPASSjoin");
const btnJoin = document.getElementById("btnJoin");
const roomListEl = document.getElementById("roomList");
const noRooms = document.getElementById("noRooms");
const chatHeader = document.getElementById("chatHeader");
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendMsg = document.getElementById("sendMsg");
const roomInfoEl = document.getElementById("roomInfo");

const profileModal = document.getElementById("profileModal");
const modalPhoto = document.getElementById("modalPhoto");
const modalNickname = document.getElementById("modalNickname");
const modalDOB = document.getElementById("modalDOB");
const modalSaveProfile = document.getElementById("modalSaveProfile");
const modalClose = document.getElementById("modalClose");
const modalUsername = document.getElementById("modalUsername");
const modalHeading = document.getElementById("modalHeading"); // new heading element

const filterAllBtn = document.getElementById("filterAll");
const filterCreatedBtn = document.getElementById("filterCreated");
const filterJoinedBtn = document.getElementById("filterJoined");

// ------------------------ LOGOUT ------------------------
btnLogout.onclick = () => signOut(auth).then(() => { window.location.href = "login.html"; });

// ------------------------ AUTH STATE ------------------------
onAuthStateChanged(auth, async user => {
  if (!user) return window.location.href = "login.html";
  currentUser = user;
  mainScreen.style.display = "block";
  await loadUserProfile(user.uid);
  loadRooms();
  checkRoomLink();
  if (activeRoom) openRoom(activeRoom);
});

// ------------------------ LOAD USER PROFILE ------------------------
async function loadUserProfile(uid) {
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);

  if (!snap.exists()) {
    const newUser = {
      uid,
      email: currentUser.email,
      username: "user" + uid.slice(0, 6),
      nickname: "User",
      displayName: "User",
      photoURL: DEFAULT_AVATAR,
      dob: "",
      createdAt: Date.now(),
      lastLogin: Date.now(),
      lastUsernameChange: 0
    };
    await set(userRef, newUser);
    usersCache[uid] = newUser;
  } else {
    usersCache[uid] = snap.val();
    await update(userRef, { lastLogin: Date.now() });
  }

  const data = usersCache[uid];
  userPhoto.src = data.photoURL || DEFAULT_AVATAR;
  userNameDisplay.innerText = data.nickname || data.displayName || "User";
  userEmail.innerText = data.email || currentUser.email || "No email";
}

// ------------------------ CHECK ROOM LINK ------------------------
function checkRoomLink() {
  const params = new URLSearchParams(window.location.search);
  const roomID = params.get("room");
  const roomPASS = params.get("pass");
  if (roomID) handleRoomLink(roomID, roomPASS);
}

async function handleRoomLink(roomID, passFromURL) {
  const snap = await get(ref(db, `rooms/${roomID}`));
  if (!snap.exists()) return alert("Room not found");

  let pass = passFromURL || prompt("Enter room password to join:");
  if (!pass) return;
  if (snap.val().pass !== pass) return alert("Wrong password");

  await set(ref(db, `members/${roomID}/${currentUser.uid}`), true);
  openRoom(roomID);
  updateRoomInfo(roomID, pass, snap.val().chatName, snap.val().roomURL);
}

// ------------------------ CREATE & JOIN ROOM ------------------------
btnShowCreate.onclick = () => { createRoomSection.classList.toggle("hidden"); joinRoomSection.classList.add("hidden"); };
btnShowJoin.onclick = () => { joinRoomSection.classList.toggle("hidden"); createRoomSection.classList.add("hidden"); };

function randomRoomID() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

btnCreate.onclick = async () => {
  const pass = roomPASScreate.value.trim();
  if (!/^\d{6}$/.test(pass)) return alert("Password must be 6 digits");

  const id = randomRoomID();
  const chatName = roomNameCreate.value.trim() || id;
  const roomURL = `${location.origin}${location.pathname}?room=${id}&pass=${pass}`;

  await set(ref(db, `rooms/${id}`), { pass, chatName, roomURL, createdBy: currentUser.uid, createdAt: Date.now() });
  await set(ref(db, `members/${id}/${currentUser.uid}`), true);

  loadRooms();
  openRoom(id);
  updateRoomInfo(id, pass, chatName, roomURL);
};

btnJoin.onclick = async () => {
  const id = roomIDjoin.value.trim().toUpperCase();
  const pass = roomPASSjoin.value.trim();
  const snap = await get(ref(db, `rooms/${id}`));
  if (!snap.exists()) return alert("Room not found");
  if (snap.val().pass !== pass) return alert("Wrong password");

  await set(ref(db, `members/${id}/${currentUser.uid}`), true);
  openRoom(id);
  updateRoomInfo(id, pass, snap.val().chatName, snap.val().roomURL);
};

// ------------------------ ROOM INFO ------------------------
function updateRoomInfo(id, pass, name, url) {
  roomInfoEl.innerHTML = `
    <div><b>Name:</b> ${name}</div>
    <div><b>ID:</b> ${id}</div>
    <div><b>Password:</b> ${pass}</div>
    <div><b>URL:</b> 
      <input value="${url}" readonly style="width:200px;">
      <button onclick="copyRoomLink()">Copy</button>
    </div>`;
  localStorage.setItem("activeRoom", id);
}
window.copyRoomLink = () => {
  const box = roomInfoEl.querySelector("input");
  if (box) navigator.clipboard.writeText(box.value).then(() => alert("Copied!"));
};

// ------------------------ FILTER BUTTONS ------------------------
filterAllBtn.onclick = () => { roomFilter = "all"; updateFilterButtons(); loadRooms(); };
filterCreatedBtn.onclick = () => { roomFilter = "created"; updateFilterButtons(); loadRooms(); };
filterJoinedBtn.onclick = () => { roomFilter = "joined"; updateFilterButtons(); loadRooms(); };

function updateFilterButtons() {
  [filterAllBtn, filterCreatedBtn, filterJoinedBtn].forEach(b => b.classList.remove("active"));
  if (roomFilter === "all") filterAllBtn.classList.add("active");
  if (roomFilter === "created") filterCreatedBtn.classList.add("active");
  if (roomFilter === "joined") filterJoinedBtn.classList.add("active");
}

// ------------------------ ROOM LIST ------------------------
function loadRooms() {
  onValue(ref(db, "members"), async snap => {
    roomListEl.innerHTML = "";
    let found = false;
    const rooms = [];
    snap.forEach(roomSnap => { if (roomSnap.child(currentUser.uid).exists()) rooms.push(roomSnap.key); });
    if (rooms.length === 0) { noRooms.classList.remove("hidden"); return; }
    noRooms.classList.add("hidden");

    for (const id of rooms) {
      const roomSnap = await get(ref(db, `rooms/${id}`));
      if (!roomSnap.exists()) continue;
      const roomData = roomSnap.val();
      const isCreator = roomData.createdBy === currentUser.uid;
      if ((roomFilter === "created" && !isCreator) || (roomFilter === "joined" && isCreator)) continue;
      found = true;

      const row = document.createElement("div");
      row.className = "room-row";

      const btn = document.createElement("button");
      btn.textContent = roomData.chatName + (isCreator ? " ⭐" : "");
      btn.onclick = () => openRoom(id);

      const dots = document.createElement("span");
      dots.innerHTML = "⋮";
      dots.className = "room-dots";
      dots.style.marginLeft = "12px";
      dots.style.zIndex = "9999";
      dots.style.cursor = "pointer";
      dots.onclick = e => { e.stopPropagation(); showRoomMenu(e, id, isCreator); };

      row.appendChild(btn);
      row.appendChild(dots);
      roomListEl.appendChild(row);
    }
    noRooms.classList.toggle("hidden", !found);
  });
}

// ------------------------ THREE DOTS MENU ------------------------
function showRoomMenu(e, roomID, isCreator) {
  const old = document.getElementById("roomMenu");
  if (old) old.remove();

  const menu = document.createElement("div");
  menu.id = "roomMenu";
  menu.className = "room-menu";
  menu.style.position = "fixed";
  menu.style.top = e.clientY + "px";
  menu.style.left = e.clientX + "px";
  menu.style.zIndex = "50000";
  menu.innerHTML = `
    ${isCreator ? `<div onclick="renameRoom('${roomID}')">Rename</div>` : ""}
    ${isCreator ? `<div onclick="deleteRoom('${roomID}')">Delete</div>` : ""}
  `;
  document.body.appendChild(menu);
  setTimeout(() => { document.addEventListener("click", () => menu.remove(), { once: true }); }, 50);
}

// ------------------------ RENAME & DELETE ------------------------
window.renameRoom = async (roomID) => {
  const snap = await get(ref(db, `rooms/${roomID}`));
  if (!snap.exists() || snap.val().createdBy !== currentUser.uid) return;
  const newName = prompt("Enter new chat name:", snap.val().chatName);
  if (!newName || newName.trim() === "") return;

  await update(ref(db, `rooms/${roomID}`), { chatName: newName.trim() });
  if (activeRoom === roomID) chatHeader.innerText = newName;
  loadRooms();
};

window.deleteRoom = async (roomID) => {
  const snap = await get(ref(db, `rooms/${roomID}`));
  if (!snap.exists() || snap.val().createdBy !== currentUser.uid) return;
  if (!confirm("Are you sure you want to delete this room?")) return;

  await remove(ref(db, `rooms/${roomID}`));
  await remove(ref(db, `members/${roomID}`));
  await remove(ref(db, `messages/${roomID}`));

  if (activeRoom === roomID) {
    activeRoom = null;
    chatHeader.innerText = "No Room";
    messagesEl.innerHTML = `<div class="center muted">Select a room</div>`;
    localStorage.removeItem("activeRoom");
  }

  loadRooms();
};

// ------------------------ OPEN ROOM ------------------------
window.openRoom = async function(roomID) {
  activeRoom = roomID;
  localStorage.setItem("activeRoom", roomID);

  const snap = await get(ref(db, `rooms/${roomID}`));
  if (!snap.exists()) return;

  const roomData = snap.val();
  chatHeader.innerText = roomData.chatName;
  updateRoomInfo(roomID, roomData.pass, roomData.chatName, roomData.roomURL);

  listenMessages(roomID);
};

// ------------------------ LISTEN MESSAGES ------------------------
function listenMessages(roomID) {
  onValue(ref(db, `messages/${roomID}`), snap => {
    messagesEl.innerHTML = "";
    if (!snap.exists()) { messagesEl.innerHTML = `<div class="center muted">No messages</div>`; return; }

    snap.forEach(m => {
      const d = m.val();
      const wrap = document.createElement("div");
      wrap.className = "message " + (d.uid === currentUser.uid ? "mine" : "");

      const img = document.createElement("img");
      img.src = d.photoURL || DEFAULT_AVATAR;
      img.className = "msg-avatar";
      img.onclick = () => openProfileModal(d.uid, d.uid === currentUser.uid); // avatar click

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      const name = document.createElement("div");
      name.className = "msg-name";
      name.textContent = d.nickname;

      const txt = document.createElement("div");
      txt.textContent = d.text;

      const time = document.createElement("div");
      time.className = "msg-time";
      time.textContent = new Date(d.time).toLocaleTimeString();

      bubble.appendChild(name);
      bubble.appendChild(txt);
      bubble.appendChild(time);
      wrap.appendChild(img);
      wrap.appendChild(bubble);
      messagesEl.appendChild(wrap);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ------------------------ SEND MESSAGE ------------------------
sendMsg.onclick = sendMessage;
msgInput.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

function sendMessage() {
  if (!currentUser || !activeRoom) return;
  const text = msgInput.value.trim();
  if (!text) return;
  msgInput.value = "";

  push(ref(db, `messages/${activeRoom}`), {
    uid: currentUser.uid,
    nickname: userNameDisplay.innerText,
    photoURL: userPhoto.src,
    text,
    time: Date.now()
  });
}

// ------------------------ PROFILE MODAL ------------------------
modalClose.onclick = () => profileModal.classList.remove("show");

// own avatar click
userPhoto.onclick = async () => openProfileModal(currentUser.uid, true);

async function openProfileModal(uid, editable) {
  let data = usersCache[uid];
  if (!data) {
    const snap = await get(ref(db, `users/${uid}`));
    data = snap.exists() ? snap.val() : { nickname: "User", username: "user", photoURL: DEFAULT_AVATAR, dob: "" };
    usersCache[uid] = data;
  }

  // Populate modal
  modalPhoto.src = data.photoURL || DEFAULT_AVATAR;
  modalUsername.value = data.username || "user" + uid.slice(0,6);
  modalNickname.value = data.nickname || "User";
  modalDOB.value = data.dob || "";

  // Heading
  modalHeading.innerText = editable ? "Edit Profile" : "View Profile";

  // Enable/disable fields
  modalUsername.disabled = !editable;
  modalNickname.disabled = !editable;
  modalDOB.disabled = !editable;

  // Save button & instructions
  modalSaveProfile.style.display = editable ? "block" : "none";
  document.getElementById("modalInstructions").style.display = editable ? "block" : "none";

  // Avatar click
  modalPhoto.style.cursor = editable ? "pointer" : "default";
  modalPhoto.onclick = editable ? () => avatarInput.click() : null;

  // Show modal
  profileModal.classList.add("show");
}


// ---------- AVATAR PICKER LOGIC ----------
const avatarInput = document.getElementById("avatarInput");

// click avatar → open file chooser
modalPhoto.onclick = () => {
  avatarInput.click();
};

// file selected → preview
avatarInput.onchange = () => {
  const file = avatarInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    modalPhoto.src = reader.result;
  };
  reader.readAsDataURL(file);
};


// ------------------------ SAVE PROFILE ------------------------
modalSaveProfile.onclick = async () => {
  if (!currentUser) return;
  const snap = await get(ref(db, `users/${currentUser.uid}`));
  const data = snap.exists() ? snap.val() : {};
  const now = Date.now();

  if (modalUsername.value.trim() !== data.username && (now - (data.lastUsernameChange || 0)) < 14*24*60*60*1000) {
    alert("You can change username only once every 14 days.");
    return;
  }

  const newUsername = modalUsername.value.trim();
  const newNickname = modalNickname.value.trim();

  await update(ref(db, `users/${currentUser.uid}`), {
    username: newUsername,
    displayName: newNickname,
    nickname: newNickname,
    dob: modalDOB.value,
    photoURL: modalPhoto.src,
    lastUsernameChange: (newUsername !== data.username) ? now : data.lastUsernameChange || 0
  });

  usersCache[currentUser.uid] = {
    ...data,
    username: newUsername,
    nickname: newNickname,
    displayName: newNickname,
    photoURL: modalPhoto.src,
    dob: modalDOB.value,
    lastUsernameChange: data.lastUsernameChange
  };

  userPhoto.src = modalPhoto.src;
  userNameDisplay.innerText = newNickname;

  // Update messages in active room only
  if (activeRoom) {
    onValue(ref(db, `messages/${activeRoom}`), snap => {
      snap.forEach(async m => {
        const msgData = m.val();
        if (msgData.uid === currentUser.uid) {
          await update(ref(db, `messages/${activeRoom}/${m.key}`), {
            nickname: newNickname,
            photoURL: modalPhoto.src
          });
        }
      });
    }, { onlyOnce: true });
  }

  profileModal.classList.remove("show");
  alert("Profile updated!");
};

// ------------------------ CLEAR UI ------------------------
function clearUI() {
  messagesEl.innerHTML = `<div class="center muted">Select a room</div>`;
  chatHeader.innerText = "No Room";
  roomListEl.innerHTML = "";
  roomInfoEl.innerHTML = "";
}

// ------------------------ KEEP ROOM INFO BAR AFTER REFRESH ------------------------
window.addEventListener("load", async () => {
  if (!activeRoom) return;
  const snap = await get(ref(db, `rooms/${activeRoom}`));
  if (!snap.exists()) return;
  openRoom(activeRoom);
});

// stop clicks inside modal from closing it
profileModal.querySelector(".modal-content")?.addEventListener("click", e => {
  e.stopPropagation();
});

// clicking outside closes modal
profileModal.addEventListener("click", () => {
  profileModal.classList.remove("show");
});



// ------------------------ TYPING INDICATOR ------------------------
const typingIndicator = document.getElementById("typingIndicator");
let typingTimeout = null;
let typingRef = null; // current typing listener reference

// Emit typing status to Firebase
msgInput.addEventListener("input", () => {
  if (!activeRoom || !currentUser) return;

  const userTypingRef = ref(db, `typing/${activeRoom}/${currentUser.uid}`);
  set(userTypingRef, true);

  if (typingTimeout) clearTimeout(typingTimeout);

  // Remove typing after 1.5s of inactivity
  typingTimeout = setTimeout(() => remove(userTypingRef), 1500);
});

// Remove typing indicator immediately when user sends a message
window.sendMessage = async function(messageText) {
  if (!activeRoom || !currentUser || !messageText.trim()) return;

  const messagesRef = ref(db, `messages/${activeRoom}`);
  const newMsgRef = push(messagesRef);
  await set(newMsgRef, {
    sender: currentUser.uid,
    text: messageText,
    time: Date.now()
  });

  // Remove typing status immediately
  const userTypingRef = ref(db, `typing/${activeRoom}/${currentUser.uid}`);
  remove(userTypingRef);
  msgInput.value = ""; // clear input
};

// Function to listen for typing users in the current room
function listenTyping(roomID) {
  // Remove previous listener if exists
  if (typingRef) typingRef.off(); 

  typingRef = ref(db, `typing/${roomID}`);
  onValue(typingRef, snap => {
    // Clear indicator if no one is typing
    if (!snap.exists()) {
      typingIndicator.classList.add("hidden");
      typingIndicator.innerHTML = "";
      return;
    }

    const typingUsers = [];
    snap.forEach(child => {
      if (child.key !== currentUser.uid) typingUsers.push(child.key);
    });

    if (typingUsers.length === 0) {
      typingIndicator.classList.add("hidden");
      typingIndicator.innerHTML = "";
      return;
    }

    typingIndicator.classList.remove("hidden");
    typingIndicator.innerHTML = "";

    // Show only the first typing user
    const uid = typingUsers[0];
    const user = usersCache[uid] || { photoURL: DEFAULT_AVATAR, nickname: "User" };

    // Avatar
    const avatar = document.createElement("img");
    avatar.src = user.photoURL || DEFAULT_AVATAR;
    avatar.className = "typing-avatar";

    // Animated dots
    const dots = document.createElement("div");
    dots.className = "typing-dots";
    dots.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;

    typingIndicator.appendChild(avatar);
    typingIndicator.appendChild(dots);

    // Place typingIndicator at the bottom of messages
    const messagesContainer = document.querySelector(".messages");
    messagesContainer.appendChild(typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}


