import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, addDoc, collection, onSnapshot, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// ---------- FIREBASE CONFIG ----------
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
const storage = getStorage(app);

// ---------- DOM ----------
const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const profileModal = document.getElementById('profile-modal');
const viewMode = document.getElementById('profile-view');
const editMode = document.getElementById('profile-edit');
const editNickname = document.getElementById('edit-nickname');
const editUsername = document.getElementById('edit-username');
const editAvatar = document.getElementById('edit-avatar');
const saveProfileBtn = document.getElementById('save-profile');
const cancelEditBtn = document.getElementById('cancel-edit');
const editProfileBtn = document.getElementById('edit-profile-btn');
const closeProfileView = document.getElementById('close-profile-view');

const viewPfp = document.getElementById('view-pfp');
const viewNickname = document.getElementById('view-nickname');
const viewUsername = document.getElementById('view-username');
const viewRole = document.getElementById('view-role');
const viewBio = document.getElementById('view-bio');
const viewAdminActions = document.getElementById('view-admin-actions');

const profileAvatar = document.getElementById('profile-avatar');

const chatsLeftDisplay = document.getElementById('chats-left');
const roomIdDisplay = document.getElementById('room-id-display');
const roomPassDisplay = document.getElementById('room-pass-display');
const linkDisplay = document.getElementById('link-display');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');

const createChatBtn = document.getElementById('create-chat');
const joinRoomBtn = document.getElementById('join-room');

// ---------- STATE ----------
let currentUser = null;
let currentUserDoc = null;
let currentRoomId = null;
let currentUserIsAdmin = false;
let MAX_CHATS_PER_DAY = 10;

const ROLE_QUOTAS = { admin: 50, coadmin: 30, chat_creator: 10, user: 10, member: 25 };

// ---------- UTILS ----------
function rand(len=6){ const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let s=''; for(let i=0;i<len;i++) s+=chars.charAt(Math.floor(Math.random()*chars.length)); return s; }
function safeSet(el,t){ if(el) el.textContent=t; }
function openModal(){ profileModal.classList.remove('hidden'); }
function closeModal(){ profileModal.classList.add('hidden'); }
function showView(){ viewMode.classList.remove('hidden'); editMode.classList.add('hidden'); }
function showEdit(){ viewMode.classList.add('hidden'); editMode.classList.remove('hidden'); }

function updateRoomLink(rid,pass){
  if(!linkDisplay) return;
  const base=window.location.origin+window.location.pathname.replace(/\/$/,'');
  const url=`${base}?room=${encodeURIComponent(rid)}&pass=${encodeURIComponent(pass)}`;
  linkDisplay.innerHTML=`Share link: <a href="${url}" target="_blank">${url}</a>`;
}

// ---------- AUTH ----------
googleLoginBtn.onclick=async()=>{
  const provider=new GoogleAuthProvider();
  try{ await signInWithPopup(auth,provider); }
  catch(e){ console.error(e); alert("Login failed: "+(e.message||e)); }
};
logoutBtn.onclick=async()=>{ try{ await signOut(auth); } catch(e){ console.error(e); } };

// ---------- AUTH STATE ----------
onAuthStateChanged(auth,async user=>{
  if(user){
    currentUser=user;
    loginOverlay.style.display='none';
    document.querySelector('.app-grid')?.classList.remove('hidden');
    await ensureUserDoc(user);
    await loadCurrentUserDoc();
    autoJoinFromURL();
  } else {
    currentUser=null;
    currentUserDoc=null;
    currentUserIsAdmin=false;
    loginOverlay.style.display='flex';
    document.querySelector('.app-grid')?.classList.add('hidden');
  }
});

// ---------- USER DOC ----------
async function ensureUserDoc(user){
  const ref=doc(db,'users',user.uid);
  const snap=await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref,{
      email:user.email||null,
      nickname:user.displayName||'',
      avatarUrl:user.photoURL||'',
      role:'user',
      username:null,
      bio:'',
      banned:false
    });
  }
}

async function loadCurrentUserDoc(){
  if(!currentUser) return;
  const ref=doc(db,'users',currentUser.uid);
  const snap=await getDoc(ref);
  if(!snap.exists()){ currentUserDoc=null; return; }
  currentUserDoc=snap.data();
  currentUserIsAdmin=currentUserDoc.role==='admin';
  MAX_CHATS_PER_DAY=ROLE_QUOTAS[currentUserDoc.role]||10;
  profileAvatar.src=currentUserDoc.avatarUrl||currentUser.photoURL||'';
}

// ---------- PROFILE MODAL ----------
profileAvatar.onclick=()=>openUserProfile(currentUser.uid);
closeProfileView.onclick=()=>closeModal();
cancelEditBtn.onclick=()=>showView();
editProfileBtn.onclick=()=>{ 
  if(currentUserDoc){ 
    editNickname.value=currentUserDoc.nickname||'';
    editUsername.value=currentUserDoc.username||''; 
    editAvatar.value=currentUserDoc.avatarUrl||'';
    showEdit(); 
  }
};
saveProfileBtn.onclick=async()=>{
  if(!currentUserDoc) return;
  const ref=doc(db,'users',currentUser.uid);
  const newData={
    nickname:editNickname.value,
    username:editUsername.value,
    avatarUrl:editAvatar.value
  };
  try{
    await updateDoc(ref,newData);
    currentUserDoc={...currentUserDoc,...newData};
    profileAvatar.src=currentUserDoc.avatarUrl;
    openUserProfile(currentUser.uid);
  } catch(e){ console.error(e); alert('Update failed'); }
};

// OPEN PROFILE VIEW
async function openUserProfile(uid){
  openModal();
  showView();
  viewNickname.textContent='Loading...';
  viewUsername.textContent='';
  viewRole.textContent='';
  viewBio.textContent='';
  viewPfp.src='';
  editProfileBtn.classList.add('hidden');
  viewAdminActions.innerHTML='';

  try{
    const snap=await getDoc(doc(db,'users',uid));
    if(!snap.exists()){ viewNickname.textContent='Unknown'; return; }
    const data=snap.data();
    viewPfp.src=data.avatarUrl||'';
    viewNickname.textContent=data.nickname||'';
    viewUsername.textContent=data.username?('@'+data.username):'';
    viewRole.textContent=(data.role||'user').toUpperCase();
    viewBio.textContent=data.bio||'';

    if(uid===currentUser.uid){
      editProfileBtn.classList.remove('hidden');
    } else if(currentUserIsAdmin){
      // Admin edit buttons
      const roleBtn=document.createElement('button');
      roleBtn.textContent='Change Role';
      roleBtn.onclick=async()=>{
        const newRole=prompt('Enter new role (admin, coadmin, user, member, chat_creator)',data.role||'user');
        if(newRole) { await updateDoc(doc(db,'users',uid),{role:newRole}); openUserProfile(uid); }
      };
      viewAdminActions.appendChild(roleBtn);
    }

  } catch(e){ console.error(e); viewNickname.textContent='Error'; }
}

// ---------- ROOM ----------
createChatBtn.onclick=async()=>{
  if(!currentUser) return alert('Sign in first');
  const rid=rand(8), pass=rand(6); currentRoomId=rid;
  await setDoc(doc(db,'rooms',rid),{password:pass, createdBy:currentUser.uid, members:[currentUser.uid], createdAt:Date.now()});
  safeSet(roomIdDisplay,'Room ID: '+rid);
  safeSet(roomPassDisplay,'Password: '+pass);
  updateRoomLink(rid,pass);
  listenMessages();
};

joinRoomBtn.onclick=async()=>{
  const rid=document.getElementById('room-id').value.trim();
  const pass=document.getElementById('room-pass').value.trim();
  if(!rid||!pass) return alert('Enter Room ID and Password');
  const snap=await getDoc(doc(db,'rooms',rid));
  if(!snap.exists()) return alert('Room not found');
  if(snap.data().password!==pass) return alert('Incorrect password');
  currentRoomId=rid;
  safeSet(roomIdDisplay,'Room ID: '+rid);
  safeSet(roomPassDisplay,'Password: '+pass);
  updateRoomLink(rid,pass);
  listenMessages();
};

// ---------- MESSAGES ----------
sendBtn.onclick=sendMessage;
messageInput.addEventListener('keydown',e=>{ if(e.key==='Enter') sendMessage(); });

async function sendMessage(){
  if(!currentUser||!currentRoomId) return;
  const txt=messageInput.value.trim();
  if(!txt) return;
  await addDoc(collection(db,'rooms',currentRoomId,'messages'),{
    text:txt,
    nickname:currentUserDoc.nickname||'',
    username:currentUserDoc.username||'',
    avatarUrl:currentUserDoc.avatarUrl||'',
    userId:currentUser.uid,
    role:currentUserDoc.role||'user',
    timestamp:Date.now()
  });
  messageInput.value='';
}

function listenMessages(){
  if(!currentRoomId) return;
  const col=collection(db,'rooms',currentRoomId,'messages');
  onSnapshot(col,snap=>{
    messagesDiv.innerHTML='';
    snap.docs.sort((a,b)=> (a.data().timestamp||0)-(b.data().timestamp||0))
      .forEach(d=>{
        const m=d.data();
        const div=document.createElement('div');
        div.className='message '+((m.userId===currentUser.uid)?'mine':'theirs');

        const info=document.createElement('div'); info.className='msg-info';

        if(m.avatarUrl){
          const img=document.createElement('img'); img.src=m.avatarUrl;
          img.onclick=()=>openUserProfile(m.userId);
          info.appendChild(img);
        }

        const nameSpan=document.createElement('span'); nameSpan.textContent=m.nickname;
        nameSpan.style.cursor='pointer';
        nameSpan.onclick=()=>openUserProfile(m.userId);
        if(m.role==='admin') nameSpan.innerHTML=`<span class="admin-name"><span class="admin-crown">👑</span>${m.nickname}</span>`;
        info.appendChild(nameSpan);

        div.appendChild(info);
        const txtDiv=document.createElement('div'); txtDiv.className='msg-text'; txtDiv.textContent=m.text;
        div.appendChild(txtDiv);

        messagesDiv.appendChild(div);
      });
    messagesDiv.scrollTo({top:messagesDiv.scrollHeight, behavior:'smooth'});
  });
}

// ---------- AUTO JOIN ----------
function autoJoinFromURL(){
  const params=new URLSearchParams(window.location.search);
  const rid=params.get('room'); const pass=params.get('pass');
  if(!rid||!pass) return;
  getDoc(doc(db,'rooms',rid)).then(snap=>{
    if(!snap.exists()) return;
    if(snap.data().password!==pass) return;
    currentRoomId=rid;
    safeSet(roomIdDisplay,'Room ID: '+rid);
    safeSet(roomPassDisplay,'Password: '+pass);
    updateRoomLink(rid,pass);
    listenMessages();
  }).catch(e=>console.error(e));
}

console.log('App.js loaded ✅');
