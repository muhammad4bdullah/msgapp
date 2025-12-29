// ------------------------ IMPORTS ------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get, remove, update, onDisconnect } 
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";


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
let myStatusRef = null;
let activeRoomCreator = null;


// ------------------------ UI ELEMENTS ------------------------
const mainScreen = document.getElementById("main");
const btnLogout = document.getElementById("btnLogout");
const userPhoto = document.getElementById("userPhoto");
const userNameDisplay = document.getElementById("userNameDisplay");
const userEmail = document.getElementById("userEmail");
const myStatusDot = document.getElementById("userStatus");


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
const modalHeading = document.getElementById("modalHeading");

const filterAllBtn = document.getElementById("filterAll");
const filterCreatedBtn = document.getElementById("filterCreated");
const filterJoinedBtn = document.getElementById("filterJoined");

const typingIndicator = document.getElementById("typingIndicator");

const imageViewer = document.getElementById("imageViewer");
const imageViewerImg = document.getElementById("imageViewerImg");
const imageViewerClose = document.getElementById("imageViewerClose");

// Create a download button dynamically
let imageViewerDownload = document.getElementById("imageViewerDownload");
if (!imageViewerDownload) {
  imageViewerDownload = document.createElement("button");
  imageViewerDownload.id = "imageViewerDownload";
  imageViewerDownload.innerText = "Download";
  imageViewerDownload.style.position = "absolute";
  imageViewerDownload.style.bottom = "20px";
  imageViewerDownload.style.right = "20px";
  imageViewerDownload.style.padding = "6px 12px";
  imageViewerDownload.style.border = "none";
  imageViewerDownload.style.borderRadius = "6px";
  imageViewerDownload.style.background = "rgba(255,255,255,0.9)";
  imageViewerDownload.style.color = "#000";
  imageViewerDownload.style.cursor = "pointer";
  imageViewerDownload.style.zIndex = "1000000";
  imageViewer.appendChild(imageViewerDownload);
}

function openImageViewer(src) {
  imageViewerImg.src = src;
  imageViewer.classList.remove("hidden"); // make visible
  void imageViewer.offsetWidth; // force reflow for transition
  imageViewer.classList.add("show"); // triggers fade-in + scale
}

function closeImageViewer() {
  imageViewer.classList.remove("show");
  imageViewer.classList.add("closing"); // fade out
  imageViewer.addEventListener(
    "transitionend",
    function hideAfterTransition(e) {
      if (e.propertyName === "opacity") {
        imageViewer.classList.add("hidden");
        imageViewer.classList.remove("closing");
        imageViewerImg.src = "";
        imageViewer.removeEventListener("transitionend", hideAfterTransition);
      }
    }
  );
}

// Close on ❌ click
imageViewerClose.onclick = closeImageViewer;

// Close on background click
imageViewer.onclick = (e) => {
  if (e.target === imageViewer) closeImageViewer();
};

// Download the image
imageViewerDownload.onclick = () => {
  const a = document.createElement("a");
  a.href = imageViewerImg.src;
  a.download = "image.png"; // default filename
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};


// ------------------------ LOGOUT ------------------------
btnLogout.onclick = async () => {
  if (myStatusRef) {
    await set(myStatusRef, {
      state: "offline",
      lastChanged: Date.now()
    });
  }
  await signOut(auth);
  window.location.href = "login.html";
};

// ------------------------ AUTH STATE ------------------------
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  // ✅ SET USER ONLINE
  setUserOnline(user.uid);

  // show app
  mainScreen.style.display = "flex";

  // load profile data
  await loadUserProfile(user.uid);

  // normal app flow (unchanged)
  loadRooms();
  checkRoomLink();

  if (activeRoom) {
    openRoom(activeRoom);
  }
});

// ------------------------ USER PRESENCE ------------------------
function setUserOnline(uid) {
  myStatusRef = ref(db, `status/${uid}`);

  // set online
  set(myStatusRef, {
    state: "online",
    lastChanged: Date.now()
  });

  // auto set offline if tab closes / internet drops
  onDisconnect(myStatusRef).set({
    state: "offline",
    lastChanged: Date.now()
  });

  // update my own UI dot
  updateStatusDot(myStatusDot, "online");
}

function updateStatusDot(dotEl, state) {
  if (!dotEl) return;
  dotEl.classList.remove("online", "offline");
  dotEl.classList.add(state);
}


// ------------------------ LOAD USER PROFILE ------------------------
async function loadUserProfile(uid) {
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);

  let data;

  if (!snap.exists()) {
  // first login - already set
} else {
  data = snap.val();
  let needsUpdate = false;
  if (!data.username) { data.username = "user" + uid.slice(0, 6); needsUpdate = true; }
  if (!data.nickname) { data.nickname = "User"; needsUpdate = true; }
  if (!data.photoURL) { data.photoURL = DEFAULT_AVATAR; needsUpdate = true; }

  if (needsUpdate) await update(userRef, {
    username: data.username,
    nickname: data.nickname,
    photoURL: data.photoURL
  });

  await update(userRef, { lastLogin: Date.now() });
}

  // Cache user
  usersCache[uid] = data;

  // Update UI
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

  // ✅ Prevent rejoin if kicked
  const kickedSnap = await get(ref(db, `kicked/${roomID}/${currentUser.uid}`));
  if (kickedSnap.exists()) return alert("You were kicked from this room.");

  // Add user to members
  await set(ref(db, `members/${roomID}/${currentUser.uid}`), true);

  openRoom(roomID);
  updateRoomInfo(roomID, pass, snap.val().chatName, snap.val().roomURL);
}



// ------------------------ CREATE & JOIN ROOM ------------------------
btnShowCreate.onclick = () => { createRoomSection.classList.toggle("hidden"); joinRoomSection.classList.add("hidden"); };
btnShowJoin.onclick = () => { joinRoomSection.classList.toggle("hidden"); createRoomSection.classList.add("hidden"); };

function randomRoomID() { 
    return Math.floor(10000000 + Math.random() * 90000000).toString(); 
}


btnCreate.onclick = async () => {
  const pass = roomPASScreate.value.trim();
 if (!/^[a-z0-9]{6,12}$/.test(pass)) 
    return alert("Password must be 6-12 characters, lowercase letters and digits only");


  const id = randomRoomID();
  const chatName = roomNameCreate.value.trim() || id;
  const roomURL = `${location.origin}${location.pathname}?room=${id}&pass=${pass}`;

  await set(ref(db, `rooms/${id}`), { pass, chatName, roomURL, createdBy: currentUser.uid, createdAt: Date.now() });
  await set(ref(db, `members/${id}/${currentUser.uid}`), true);
  pushSystemMessage(id, `<strong>${userNameDisplay.innerText}</strong> has joined the room`);


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

  // ✅ Check if user is kicked
  const kickedSnap = await get(ref(db, `kicked/${id}/${currentUser.uid}`));
  if (kickedSnap.exists()) return alert("You were kicked from this room.");

  await set(ref(db, `members/${id}/${currentUser.uid}`), true);
  openRoom(id);
  pushSystemMessage(id, `<strong>${userNameDisplay.innerText}</strong> has joined the room`);

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
//SHOW ROOOOM MENU
function showRoomMenu(event, roomID, isCreator) {
    const oldMenu = document.getElementById("roomMenu");
    if (oldMenu) oldMenu.remove(); // remove old menu

    const menu = document.createElement("div");
    menu.id = "roomMenu";
    menu.className = "room-menu";
    menu.style.position = "absolute";
    menu.style.top = event.clientY + "px";
    menu.style.left = event.clientX + "px";
    menu.style.background = "#1e1e1e";
    menu.style.color = "#fff";
    menu.style.borderRadius = "8px";
    menu.style.padding = "8px 0";
    menu.style.minWidth = "150px";
    menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
    menu.style.zIndex = "10000";

    // Helper to create a menu button
    const addBtn = (text, color = "#fff", onclick) => {
        const btn = document.createElement("div");
        btn.innerText = text;
        btn.style.padding = "8px 16px";
        btn.style.cursor = "pointer";
        btn.style.userSelect = "none";
        btn.style.color = color;
        btn.onmouseover = () => btn.style.background = "#333";
        btn.onmouseout = () => btn.style.background = "transparent";
        btn.onclick = () => { onclick(); menu.remove(); };
        menu.appendChild(btn);
    };

    // Leave Room (not creator)
    if (!isCreator) addBtn("Leave Room", "#fff", async () => {
        await remove(ref(db, `members/${roomID}/${currentUser.uid}`));
        if (activeRoom === roomID) clearUI();
        loadRooms();
    });

    // Creator-only buttons
    if (isCreator) {
        addBtn("Rename Room", "#fff", () => renameRoom(roomID));
        addBtn("Change Password", "#fff", () => changeRoomPassword(roomID));
        addBtn("Delete Room", "red", () => deleteRoom(roomID));
        addBtn("Unblock Users", "#fff", () => openKickBlockModal(roomID));
    }

    document.body.appendChild(menu);

    // Remove menu when clicking outside
    setTimeout(() => {
        const handler = (e) => {
            if (!menu.contains(e.target)) menu.remove();
            document.removeEventListener("click", handler);
        };
        document.addEventListener("click", handler);
    }, 10);
}





// ---------------- ROOM SEARCH ----------------
const roomSearchInput = document.getElementById("roomSearchInput");

roomSearchInput.addEventListener("input", () => {
  const query = roomSearchInput.value.trim().toLowerCase();

  const roomRows = Array.from(roomListEl.children).filter(c => c.classList.contains("room-row"));
  
  roomRows.forEach(row => {
    const roomName = row.querySelector("button")?.textContent.toLowerCase() || "";
    if (roomName.includes(query)) {
      row.style.display = "flex";
    } else {
      row.style.display = "none";
    }
  });

  // Show "No rooms found" if none match
  const anyVisible = roomRows.some(row => row.style.display !== "none");
  noRooms.textContent = anyVisible ? "No rooms yet — create or join one." : "No matching rooms found.";
});


// ------------------------ THREE DOTS MENU ------------------------
function showKickMenu(event, uid, nickname) {
  const old = document.getElementById("kickMenu");
  if (old) old.remove();

  const menu = document.createElement("div");
  menu.id = "kickMenu";
  menu.className = "room-menu";
  menu.style.position = "fixed";
  menu.style.top = event.clientY + "px";
  menu.style.left = event.clientX + "px";
  menu.style.zIndex = "50000";

  menu.innerHTML = `<div onclick="kickUser('${uid}', '${nickname}')">Kick</div>`;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("click", () => menu.remove(), { once: true });
  }, 50);
}



window.leaveRoom = async function(roomID) {
  if (!confirm("Do you want to leave this room?")) return;

  // push system message before leaving
  pushSystemMessage(roomID, `<strong>${userNameDisplay.innerText}</strong> has left the room`);

  // remove this user from the members of the room
  await remove(ref(db, `members/${roomID}/${currentUser.uid}`));

  // If user was in this active room, clear UI
  if (activeRoom === roomID) {
    activeRoom = null;
    localStorage.removeItem("activeRoom");
    clearUI();
  }

  // reload the room list
  loadRooms();

  alert("You have left the room.");
};

async function openKickBlockModal(roomID) {
  // Get all blocked users for this room
  const snap = await get(ref(db, `kicked/${roomID}`));
  const blocked = snap.exists() ? snap.val() : {};

  // If no blocked users, show alert
  if (Object.keys(blocked).length === 0) return alert("No blocked users");

  // Create modal
  const modal = document.createElement("div");
  modal.id = "blockModal";
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "#222";
  modal.style.color = "#fff";
  modal.style.padding = "20px";
  modal.style.borderRadius = "10px";
  modal.style.zIndex = "100000";
  modal.style.maxHeight = "80vh";
  modal.style.overflowY = "auto";
  modal.style.minWidth = "300px";

  const title = document.createElement("h3");
  title.innerText = "Blocked Users";
  modal.appendChild(title);

  Object.keys(blocked).forEach(uid => {
    const user = usersCache[uid] || { nickname: "User" };
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.marginTop = "6px";

    const name = document.createElement("span");
    name.innerText = user.nickname || uid;

    const unblockBtn = document.createElement("button");
    unblockBtn.innerText = "Unblock";
    unblockBtn.style.background = "green";
    unblockBtn.style.color = "#fff";
    unblockBtn.style.border = "none";
    unblockBtn.style.borderRadius = "4px";
    unblockBtn.style.cursor = "pointer";
    unblockBtn.onclick = async () => {
      await remove(ref(db, `kicked/${roomID}/${uid}`));
      alert(`${user.nickname} has been unblocked`);
      row.remove();
    };

    row.appendChild(name);
    row.appendChild(unblockBtn);
    modal.appendChild(row);
  });

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.innerText = "Close";
  closeBtn.style.marginTop = "12px";
  closeBtn.style.background = "#555";
  closeBtn.style.color = "#fff";
  closeBtn.style.border = "none";
  closeBtn.style.borderRadius = "4px";
  closeBtn.style.padding = "6px 12px";
  closeBtn.style.cursor = "pointer";
  closeBtn.onclick = () => modal.remove();
  modal.appendChild(closeBtn);

  document.body.appendChild(modal);
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

// Make a function to push system messages to the chat
window.pushSystemMessage = function(roomID, text) {
  if (!roomID) return;
  push(ref(db, `messages/${roomID}`), {
    type: "system",   // mark this as a system message
    text,
    time: Date.now()
  });
}


function pushSystemMessage(roomID, text) {
  if (!roomID) return;
  push(ref(db, `messages/${roomID}`), {
    type: "system",   // flag for system messages
    text,
    time: Date.now()
  });
}






// Removes a user from the room and posts a system message
async function kickUser(uid, name) {
  if (!activeRoom) return;
  if (currentUser.uid !== activeRoomCreator) return; // safety check

  // Remove user from members
  await remove(ref(db, `members/${activeRoom}/${uid}`));

  // Mark user as kicked
  await set(ref(db, `kicked/${activeRoom}/${uid}`), true);

  // Post system message
  pushSystemMessage(
    activeRoom,
    `<strong>${name}</strong> was kicked by <strong>${userNameDisplay.innerText}</strong>`
  );
}


window.changeRoomPassword = async function(roomID) {
  const snap = await get(ref(db, `rooms/${roomID}`));
  if (!snap.exists() || snap.val().createdBy !== currentUser.uid) return;

  const newPass = prompt("Enter new room password (6-12 lowercase letters or digits):");
  if (!newPass || !/^[a-z0-9]{6,12}$/.test(newPass)) {
    return alert("Invalid password format.");
  }

  await update(ref(db, `rooms/${roomID}`), { pass: newPass });

  // Update room info UI if currently active
  if (activeRoom === roomID) {
    updateRoomInfo(roomID, newPass, snap.val().chatName, snap.val().roomURL);
  }

  alert("Room password updated successfully!");
};



// ------------------------ OPEN ROOM ------------------------
window.openRoom = async function(roomID) {
  activeRoom = roomID;
  localStorage.setItem("activeRoom", roomID);

  const snap = await get(ref(db, `rooms/${roomID}`));
  if (!snap.exists()) return;

  const roomData = snap.val();
  activeRoomCreator = roomData.createdBy; // store room creator UID

  chatHeader.innerText = roomData.chatName;
  updateRoomInfo(roomID, roomData.pass, roomData.chatName, roomData.roomURL);

  listenMessages(roomID);  
  listenTyping(roomID);  
  listenForKick(roomID); // listen if this user is kicked
  
};

// ------------------------ LISTEN MESSAGES ------------------------
function listenMessages(roomID) {
  onValue(ref(db, `messages/${roomID}`), snap => {
    messagesEl.innerHTML = ""; // clear previous messages

    if (!snap.exists()) {
      messagesEl.innerHTML = `<div class="center muted">No messages</div>`;
      return;
    }

    snap.forEach(m => {
      const d = m.val();

      // SYSTEM MESSAGE
      if (d.type === "system") {
        const sysMsg = document.createElement("div");
        sysMsg.className = "system-message";
        sysMsg.innerHTML = d.text;
        messagesEl.appendChild(sysMsg);
        return;
      }

      // NORMAL MESSAGE
      const wrap = document.createElement("div");
      wrap.className = "message " + (d.uid === currentUser.uid ? "mine" : "");
      // Add animation class
      wrap.classList.add("new-msg");

      // Trigger animation
      requestAnimationFrame(() => wrap.classList.add("show"));

      // AVATAR
      const avatar = document.createElement("img");
      avatar.src = d.photoURL || DEFAULT_AVATAR;
      avatar.className = "msg-avatar";
      avatar.onclick = () => {
  openProfileModal(d.uid, d.uid === currentUser.uid);

  // Only creator can kick others
  if (currentUser.uid === activeRoomCreator && d.uid !== currentUser.uid) {
    avatar.oncontextmenu = (e) => { // right-click to kick
      e.preventDefault();
      showKickMenu(d.uid, d.nickname);
    };
  }
};



      // BUBBLE
      const bubble = document.createElement("div");
      bubble.className = "bubble";

      // NAME
      const name = document.createElement("div");
      name.className = "msg-name";
      name.textContent = d.nickname || "User";
      bubble.appendChild(name);

      // MESSAGE CONTENT
      if (d.type === "image") {
        const imgEl = document.createElement("img");
        imgEl.src = d.text;
        imgEl.className = "chat-image";
        imgEl.style.cursor = "pointer";
        imgEl.onclick = (e) => {
          e.preventDefault();
          openImageViewer(d.text);
        };
        bubble.appendChild(imgEl);

      } else if (d.type === "link") {
        const linkEl = document.createElement("a");
        linkEl.href = d.text;
        linkEl.textContent = d.text;
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        linkEl.className = "chat-link";
        bubble.appendChild(linkEl);

      } else if (d.type === "file") {
      const doc = document.createElement("a");
      doc.href = d.text;            // use the actual file URL
      doc.className = "chat-document";
      doc.download = d.text;        // sets the filename for download
      doc.innerHTML = `
    <div class="doc-icon">📄</div>
    <div class="doc-info">
      <div class="doc-name">${d.text}</div>
      <div class="doc-size">Document</div>
    </div>
  `;
  bubble.appendChild(doc);
}
 else {
        // normal text
        const textEl = document.createElement("div");
        textEl.textContent = d.text;
        bubble.appendChild(textEl);
      }

      // TIME
      const time = document.createElement("div");
      time.className = "msg-time";
      time.textContent = new Date(d.time).toLocaleTimeString();
      bubble.appendChild(time);

      // APPEND
      wrap.appendChild(avatar);
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

  const userTypingRef = ref(db, `typing/${activeRoom}/${currentUser.uid}`);
  remove(userTypingRef);
}

// ------------------------ PROFILE MODAL ------------------------
modalClose.onclick = () => profileModal.classList.remove("show");
userPhoto.onclick = async () => openProfileModal(currentUser.uid, true);

async function openProfileModal(uid, editable) {
  let data = usersCache[uid];
  if (!data) {
    const snap = await get(ref(db, `users/${uid}`));
    data = snap.exists() ? snap.val() : { nickname: "User", username: "user", photoURL: DEFAULT_AVATAR, dob: "" };
    usersCache[uid] = data;
  }

  modalPhoto.src = data.photoURL || DEFAULT_AVATAR;
  modalUsername.value = data.username || "user" + uid.slice(0,6);
  modalNickname.value = data.nickname || "User";
  modalDOB.value = data.dob || "";

  modalHeading.innerText = editable ? "Edit Profile" : "View Profile";
  modalUsername.disabled = !editable;
  modalNickname.disabled = !editable;
  modalDOB.disabled = !editable;
  modalSaveProfile.style.display = editable ? "block" : "none";
  document.getElementById("modalInstructions").style.display = editable ? "block" : "none";
  modalPhoto.style.cursor = editable ? "pointer" : "default";
  modalPhoto.onclick = editable ? () => avatarInput.click() : null;

  // Remove any previous kick button
  const oldKickBtn = document.getElementById("kickUserBtn");
  if (oldKickBtn) oldKickBtn.remove();

  // ✅ Add kick button if current user is creator & opening another user's profile
  if (currentUser.uid === activeRoomCreator && uid !== currentUser.uid) {
    const kickBtn = document.createElement("button");
    kickBtn.id = "kickUserBtn";
    kickBtn.innerText = "Kick User";
    kickBtn.style.background = "red";
    kickBtn.style.color = "white";
    kickBtn.style.padding = "6px 12px";
    kickBtn.style.border = "none";
    kickBtn.style.borderRadius = "6px";
    kickBtn.style.cursor = "pointer";
    kickBtn.onclick = async () => {
      if (!confirm(`Are you sure you want to kick ${data.nickname}?`)) return;
      await remove(ref(db, `members/${activeRoom}/${uid}`));
      await set(ref(db, `kicked/${activeRoom}/${uid}`), true);
      pushSystemMessage(activeRoom, `<strong>${data.nickname}</strong> was kicked by <strong>${userNameDisplay.innerText}</strong>`);
      profileModal.classList.remove("show");
    };
    profileModal.querySelector(".modal-footer")?.appendChild(kickBtn);
  }

  // Online/offline status
  const modalStatusDot = document.getElementById("modalStatus");
  const statusRef = ref(db, `status/${uid}`);
  onValue(statusRef, snap => {
    const state = snap.exists() ? snap.val().state : "offline";
    updateStatusDot(modalStatusDot, state);
  });

  profileModal.classList.add("show");
}


// ---------- AVATAR PICKER ----------
const avatarInput = document.getElementById("avatarInput");
avatarInput.onchange = () => {
  const file = avatarInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { alert("Please choose an image file"); return; }
  const reader = new FileReader();
  reader.onload = () => { modalPhoto.src = reader.result; };
  reader.readAsDataURL(file);
};
modalPhoto.onclick = () => avatarInput.click();

// ------------------------ SAVE PROFILE ------------------------
modalSaveProfile.onclick = async () => {
  if (!currentUser) return;
  const snap = await get(ref(db, `users/${currentUser.uid}`));
  const data = snap.exists() ? snap.val() : {};
  const now = Date.now();

  // Username: 14 days limit
  if (modalUsername.value.trim() !== data.username && (now - (data.lastUsernameChange || 0)) < 14*24*60*60*1000) {
    alert("You can change username only once every 14 days.");
    return;
  }

  // Nickname: 3 days limit
  if (modalNickname.value.trim() !== data.nickname && (now - (data.lastNicknameChange || 0)) < 3*24*60*60*1000) {
    alert("You can change nickname only once every 3 days.");
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
    lastUsernameChange: (newUsername !== data.username) ? now : data.lastUsernameChange || 0,
    lastNicknameChange: (newNickname !== data.nickname) ? now : data.lastNicknameChange || 0
  });

  usersCache[currentUser.uid] = {
    ...data,
    username: newUsername,
    nickname: newNickname,
    displayName: newNickname,
    photoURL: modalPhoto.src,
    dob: modalDOB.value,
    lastUsernameChange: (newUsername !== data.username) ? now : data.lastUsernameChange || 0,
    lastNicknameChange: (newNickname !== data.nickname) ? now : data.lastNicknameChange || 0
  };

  userPhoto.src = modalPhoto.src;
  userNameDisplay.innerText = newNickname;

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

// ------------------------ KEEP ROOM AFTER REFRESH ------------------------
window.addEventListener("load", async () => {
  if (!activeRoom) return;
  const snap = await get(ref(db, `rooms/${activeRoom}`));
  if (!snap.exists()) return;
  openRoom(activeRoom);
});

profileModal.querySelector(".modal-content")?.addEventListener("click", e => e.stopPropagation());
profileModal.addEventListener("click", () => profileModal.classList.remove("show"));

// ------------------------ LISTEN FOR KICK ------------------------
// Forces user to leave UI if removed from the room
function listenForKick(roomID) {
  const myMemberRef = ref(db, `members/${roomID}/${currentUser.uid}`);
  onValue(myMemberRef, snap => {
    if (!snap.exists() && activeRoom === roomID) {
      activeRoom = null;
      localStorage.removeItem("activeRoom");
      clearUI();
      alert("You were kicked from the room");
    }
  });
}


// ------------------------ TYPING INDICATOR ------------------------
let typingTimeout = null;
let typingListener = null;

msgInput.addEventListener("input", () => {
  if (!activeRoom || !currentUser) return;

  const userTypingRef = ref(db, `typing/${activeRoom}/${currentUser.uid}`);
  set(userTypingRef, true);

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => remove(userTypingRef), 1500);
});

function listenTyping(roomID) {
  if (typingListener) typingListener();

  const refTyping = ref(db, `typing/${roomID}`);
  typingListener = onValue(refTyping, snap => {
    typingIndicator.innerHTML = "";
    if (!snap.exists()) { typingIndicator.classList.remove("show"); return; }

    const typingUsers = [];
    snap.forEach(child => { if (child.key !== currentUser.uid) typingUsers.push(child.key); });

    if (typingUsers.length === 0) { typingIndicator.classList.remove("show"); return; }

    typingIndicator.classList.add("show");
    typingIndicator.style.display = "flex";

    const uid = typingUsers[0];
    const user = usersCache[uid] || { photoURL: DEFAULT_AVATAR, nickname: "User" };

    const avatar = document.createElement("img");
    avatar.src = user.photoURL;
    avatar.className = "typing-avatar";

    const dots = document.createElement("div");
    dots.className = "typing-dots";
    dots.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;

    typingIndicator.appendChild(avatar);
    typingIndicator.appendChild(dots);

    messagesEl.appendChild(typingIndicator);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
 

// ====================== ATTACHMENT BUTTON ======================
const attachmentBtn = document.getElementById("attachmentBtn");
const attachmentMenu = document.getElementById("attachmentMenu");
const imageBtn = document.getElementById("imageBtn");
const documentBtn = document.getElementById("documentBtn");
const linkBtn = document.getElementById("linkBtn");

// Hidden file input for uploads
const attachmentFileInput = document.createElement("input");
attachmentFileInput.type = "file";
attachmentFileInput.style.display = "none";
document.body.appendChild(attachmentFileInput);

// ------------------ TOGGLE ATTACHMENT MENU ------------------
attachmentBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  attachmentMenu.classList.toggle("show"); // toggle visibility
});

// Hide menu when clicking outside
document.addEventListener("click", (e) => {
  if (!attachmentMenu.contains(e.target) && e.target !== attachmentBtn) {
    attachmentMenu.classList.remove("show");
  }
});

// ------------------ IMAGE UPLOAD ------------------
imageBtn.addEventListener("click", () => {
  attachmentFileInput.accept = "image/*";
  attachmentFileInput.click();
  attachmentMenu.classList.remove("show");
});

// ------------------ DOCUMENT UPLOAD ------------------
documentBtn.addEventListener("click", () => {
  attachmentFileInput.accept = "*/*";
  attachmentFileInput.click();
  attachmentMenu.classList.remove("show");
});

// ------------------ LINK MESSAGE ------------------
linkBtn.addEventListener("click", () => {
  attachmentMenu.classList.remove("show");
  const url = prompt("Paste the link here:");
  if (!url) return;

  push(ref(db, `messages/${activeRoom}`), {
    uid: currentUser.uid,
    nickname: userNameDisplay.innerText,
    photoURL: userPhoto.src,
    text: url,
    type: "link",
    time: Date.now()
  });
});

// ------------------ HANDLE FILE SELECTION ------------------
attachmentFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type.startsWith("image/")) {
    // Convert image to base64 and push
    const reader = new FileReader();
    reader.onload = () => {
      push(ref(db, `messages/${activeRoom}`), {
        uid: currentUser.uid,
        nickname: userNameDisplay.innerText,
        photoURL: userPhoto.src,
        text: reader.result,
        type: "image",
        time: Date.now()
      });
    };
    reader.readAsDataURL(file);
  } else {
    // Push generic file
    push(ref(db, `messages/${activeRoom}`), {
      uid: currentUser.uid,
      nickname: userNameDisplay.innerText,
      photoURL: userPhoto.src,
      text: file.name,
      type: "file",
      time: Date.now()
    });
  }

  attachmentFileInput.value = ""; // reset input
});

