import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, addDoc, collection, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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

// DOM
const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn = document.getElementById('google-login-btn');
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const nicknameInput = document.getElementById('nickname-input');
const avatarInput = document.getElementById('avatar-input');
const saveProfileBtn = document.getElementById('save-profile');
const logoutBtn = document.getElementById('logout-btn');
const chatsLeftDisplay = document.getElementById('chats-left');

const roomIdDisplay = document.getElementById('room-id-display');
const roomPassDisplay = document.getElementById('room-pass-display');
const linkDisplay = document.getElementById('link-display');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');
const leftChats = document.getElementById('chats-list');

let currentUser = null;
let nickname = '';
let avatarUrl = '';
let currentRoomId = '';
let chatsToday = 0;
const MAX_CHATS_PER_DAY = 10;

// === Helpers ===
function randomString(len = 6){
  const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let str=''; for(let i=0;i<len;i++) str+=chars.charAt(Math.floor(Math.random()*chars.length));
  return str;
}

// 1️⃣ Function to update shareable link
function updateRoomLink(roomId, password){
    const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const link = `${base}?room=${roomId}&pass=${password}`;
    linkDisplay.innerHTML = `Share link: <a href="${link}" target="_blank" style="color:#0d6efd;">${link}</a>`;
}

// 2️⃣ Google Login Button
googleLoginBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  currentUser = result.user;

  loginOverlay.style.display = 'none';
  document.querySelector('.app-grid').classList.remove('hidden');

  await loadProfile();
  loadUserChats();

  // Optional: auto-join URL after login
  joinRoomFromURL();
};

// 3️⃣ Auth State Changed
onAuthStateChanged(auth, async (user) => {
  if(user){
    currentUser = user;

    loginOverlay.style.display = 'none';
    document.querySelector('.app-grid').classList.remove('hidden');

    await loadProfile();
    loadUserChats();

    // ✅ Auto-join chat if URL has room/pass
    joinRoomFromURL();
  } else {
    loginOverlay.style.display = 'flex';
    document.querySelector('.app-grid').classList.add('hidden');
  }
});

// 4️⃣ Function to auto-join room from URL
function joinRoomFromURL() {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const password = params.get('pass');
    if (!roomId || !password) return;

    getDoc(doc(db,"rooms",roomId)).then(roomDoc => {
        if(!roomDoc.exists()) return alert("Room does not exist");
        if(roomDoc.data().password !== password) return alert("Incorrect password");

        currentRoomId = roomId;
        roomIdDisplay.textContent = `Room ID: ${roomId}`;
        roomPassDisplay.textContent = `Password: ${password}`;
        updateRoomLink(roomId, password);
        listenMessages();
    });
}



// === Profile Modal ===
profileBtn.onclick = () => profileModal.classList.remove('hidden');

saveProfileBtn.onclick = async () => {
  const name = nicknameInput.value.trim();
  if(name) nickname = name;

  if(avatarInput.files[0]){
    avatarUrl = await new Promise(resolve=>{
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(avatarInput.files[0]);
    });
  }

  await setDoc(doc(db,"users",currentUser.uid),{
    nickname,
    avatarUrl,
    lastSet: Date.now()
  }, {merge:true});

  profileModal.classList.add('hidden');
  updateProfileUI();
};

logoutBtn.onclick = async () => {
  await signOut(auth);
  currentUser=null;
  nickname='';
  avatarUrl='';
  loginOverlay.style.display='flex';
  profileModal.classList.add('hidden');
};

// Update topbar avatar
function updateProfileUI(){
  document.getElementById('profile-avatar').src = avatarUrl || '';
}

// === Chat Creation & Joining ===
document.getElementById('create-chat').onclick = async () => {
  if(chatsToday >= MAX_CHATS_PER_DAY){
    return alert("You reached maximum chats today!");
  }
  const roomId = randomString(8);
  const password = randomString(6);
  currentRoomId = roomId;
  chatsToday++;

  await setDoc(doc(db,"rooms",roomId),{
    password,
    createdBy: currentUser.uid,
    members: [nickname]
  });

  roomIdDisplay.textContent = `Room ID: ${roomId}`;
  roomPassDisplay.textContent = `Password: ${password}`;
  updateRoomLink(roomId,password);
  listenMessages();
  renderLeftChats();
};

document.getElementById('join-room').onclick = async () => {
  const roomId = document.getElementById('room-id').value.trim();
  const password = document.getElementById('room-pass').value.trim();
  if(!roomId || !password) return alert("Enter Room ID + Password");

  const roomDoc = await getDoc(doc(db,"rooms",roomId));
  if(!roomDoc.exists()) return alert("Room does not exist");
  if(roomDoc.data().password !== password) return alert("Incorrect password");

  currentRoomId = roomId;
  roomIdDisplay.textContent = `Room ID: ${roomId}`;
  roomPassDisplay.textContent = `Password: ${password}`;
  updateRoomLink(roomId,password);
  listenMessages();
};

// === Messaging ===
sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", e => { if(e.key==='Enter') sendMessage(); });

async function sendMessage(){
  const text = messageInput.value.trim();
  if(!text || !currentRoomId) return;
  await addDoc(collection(db,"rooms",currentRoomId,"messages"),{
    text,
    userId: currentUser.uid,
    nickname,
    avatarUrl,
    timestamp: new Date()
  });
  messageInput.value='';
}

function listenMessages(){
  if(!currentRoomId) return;
  const msgsCol = collection(db,"rooms",currentRoomId,"messages");
  onSnapshot(msgsCol, snapshot => {
    messagesDiv.innerHTML='';
    snapshot.docs
      .sort((a,b)=>a.data().timestamp - b.data().timestamp)
      .forEach(doc=>{
        const msg = doc.data();
        const div = document.createElement('div');
        div.classList.add('message');
        div.classList.add(msg.userId===currentUser.uid ? 'mine' : 'theirs');

        const info = document.createElement('div'); info.classList.add('msg-info');
        if(msg.avatarUrl){ const img = document.createElement('img'); img.src = msg.avatarUrl; info.appendChild(img); }
        const span = document.createElement('span'); span.textContent = msg.nickname; info.appendChild(span);
        div.appendChild(info);

        const textDiv = document.createElement('div'); textDiv.classList.add('msg-text'); textDiv.textContent = msg.text;
        div.appendChild(textDiv);

        messagesDiv.appendChild(div);
      });
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  });
}

// === Profile Load ===
async function loadProfile(){
  const docSnap = await getDoc(doc(db,"users",currentUser.uid));
  if(docSnap.exists()){
    const data = docSnap.data();
    nickname = data.nickname || currentUser.displayName;
    avatarUrl = data.avatarUrl || currentUser.photoURL;
  } else {
    nickname = currentUser.displayName;
    avatarUrl = currentUser.photoURL;
  }
  nicknameInput.value = nickname;
  updateProfileUI();
}

// === Chats Left Placeholder ===
function loadUserChats(){
  chatsLeftDisplay.textContent = `${MAX_CHATS_PER_DAY - chatsToday} chats left today`;
}

function renderLeftChats(){
  // Placeholder: implement chat list dynamically if needed
}


