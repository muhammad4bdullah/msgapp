import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, addDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "msgapp-262c9.firebaseapp.com",
  projectId: "msgapp-262c9",
  storageBucket: "msgapp-262c9.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===== DOM ELEMENTS =====
const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');

const profileModal = document.getElementById('profile-modal');
const profileAvatar = document.getElementById('profile-avatar');

const viewMode = document.getElementById('profile-view');
const editMode = document.getElementById('profile-edit');
const viewPfp = document.getElementById('view-pfp');
const viewNickname = document.getElementById('view-nickname');
const viewUsername = document.getElementById('view-username');
const viewRole = document.getElementById('view-role');
const viewBio = document.getElementById('view-bio');
const viewAdminActions = document.getElementById('view-admin-actions');
const closeProfileView = document.getElementById('close-profile-view');

const editNickname = document.getElementById('edit-nickname');
const editUsername = document.getElementById('edit-username');
const editAvatar = document.getElementById('edit-avatar');
const saveProfileBtn = document.getElementById('save-profile');
const cancelEditBtn = document.getElementById('cancel-edit');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');

const roomIdInput = document.getElementById('room-id');
const roomPassInput = document.getElementById('room-pass');
const createRoomBtn = document.getElementById('create-chat');
const joinRoomBtn = document.getElementById('join-room');

let currentUser = null;
let currentRoomId = null;

// ===== LOGIN / LOGOUT =====
googleLoginBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch(e) {
    alert("Login failed: " + e.message);
  }
};
logoutBtn.onclick = async () => {
  await signOut(auth);
};

// ===== AUTH STATE =====
onAuthStateChanged(auth, async user => {
  if(user){
    currentUser = user;
    loginOverlay.classList.add('hidden');
    profileAvatar.src = user.photoURL || '';
    await ensureUserDoc(user);
  } else {
    currentUser = null;
    loginOverlay.classList.remove('hidden');
  }
});

// ===== ENSURE USER DOC =====
async function ensureUserDoc(user){
  const ref = doc(db,'users',user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref,{
      email: user.email,
      nickname: user.displayName || '',
      username: null,
      avatarUrl: user.photoURL || '',
      role: 'user',
      bio: ''
    });
  }
}

// ===== PROFILE MODAL =====
profileAvatar.onclick = () => openUserProfile(currentUser.uid);
closeProfileView.onclick = () => profileModal.classList.add('hidden');

async function openUserProfile(uid){
  profileModal.classList.remove('hidden');
  viewMode.classList.remove('hidden');
  editMode.classList.add('hidden');

  const snap = await getDoc(doc(db,'users',uid));
  if(!snap.exists()) return;

  const data = snap.data();
  viewPfp.src = data.avatarUrl || '';
  viewNickname.textContent = data.nickname || '';
  viewUsername.textContent = data.username ? '@' + data.username : '';
  viewRole.textContent = (data.role || 'user').toUpperCase();
  viewBio.textContent = data.bio || '';

  viewAdminActions.innerHTML = '';
  if(currentUser.uid !== uid && currentUser.role === 'admin'){
    const kickBtn = document.createElement('button');
    kickBtn.textContent = "Kick User";
    kickBtn.onclick = ()=>alert("Kick logic here");
    viewAdminActions.appendChild(kickBtn);
  }
}

// ===== EDIT PROFILE =====
saveProfileBtn.onclick = async () => {
  const ref = doc(db,'users',currentUser.uid);
  const data = {};
  if(editNickname.value) data.nickname = editNickname.value;
  if(editUsername.value) data.username = editUsername.value;
  if(editAvatar.files[0]){
    // In production, upload to Firebase Storage & get URL
    const file = editAvatar.files[0];
    data.avatarUrl = URL.createObjectURL(file);
  }
  await updateDoc(ref,data);
  openUserProfile(currentUser.uid);
};
cancelEditBtn.onclick = () => {
  editMode.classList.add('hidden');
  viewMode.classList.remove('hidden');
};

// ===== MESSAGES =====
sendBtn.onclick = sendMessage;
messageInput.addEventListener('keydown', e => { if(e.key==='Enter') sendMessage(); });

async function sendMessage(){
  if(!currentUser || !currentRoomId) return;
  const text = messageInput.value.trim();
  if(!text) return;
  await addDoc(collection(db,'rooms',currentRoomId,'messages'),{
    text,
    userId: currentUser.uid,
    nickname: currentUser.displayName || '',
    avatarUrl: currentUser.photoURL || '',
    timestamp: Date.now()
  });
  messageInput.value = '';
}

// ===== LISTEN MESSAGES =====
function listenMessages(){
  if(!currentRoomId) return;
  const col = collection(db,'rooms',currentRoomId,'messages');
  onSnapshot(col, snap=>{
    messagesDiv.innerHTML = '';
    snap.docs.sort((a,b)=> (a.data().timestamp||0) - (b.data().timestamp||0))
      .forEach(d=>{
        const m = d.data();
        const div = document.createElement('div');
        div.className = 'message ' + (m.userId === currentUser.uid ? 'mine' : 'theirs');
        const info = document.createElement('div'); info.className='msg-info';
        const img = document.createElement('img'); img.src = m.avatarUrl; img.onclick = ()=>openUserProfile(m.userId);
        info.appendChild(img);
        const name = document.createElement('span'); name.textContent = m.nickname; name.onclick = ()=>openUserProfile(m.userId);
        info.appendChild(name);
        div.appendChild(info);
        const textDiv = document.createElement('div'); textDiv.className='msg-text'; textDiv.textContent = m.text;
        div.appendChild(textDiv);
        messagesDiv.appendChild(div);
      });
    messagesDiv.scrollTo({top:messagesDiv.scrollHeight, behavior:'smooth'});
  });
}

// ===== ROOM CREATION & JOIN =====
createRoomBtn.onclick = async () => {
  if(!currentUser) return;
  const roomId = roomIdInput.value.trim() || 'room-' + Date.now();
  currentRoomId = roomId;
  await setDoc(doc(db,'rooms',roomId),{created: Date.now()});
  listenMessages();
  alert("Room created: "+roomId);
};

joinRoomBtn.onclick = async () => {
  const roomId = roomIdInput.value.trim();
  if(!roomId) return alert("Enter Room ID");
  const snap = await getDoc(doc(db,'rooms',roomId));
  if(!snap.exists()) return alert("Room not found");
  currentRoomId = roomId;
  listenMessages();
  alert("Joined Room: "+roomId);
};
