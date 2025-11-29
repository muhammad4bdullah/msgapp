// app.js - FULL FIXED: roles, admin powers, profile, username 15-day lock, Firestore quota
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, addDoc, collection, onSnapshot, getDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyAEWxTJ1loQkXM1ShwAAF1J15RQLlCgdGM",
  authDomain: "msgapp-262c9.firebaseapp.com",
  projectId: "msgapp-262c9",
  storageBucket: "msgapp-262c9.appspot.com", // <-- FIXED
  messagingSenderId: "122648836940",
  appId: "1:122648836940:web:a098c052f65f3eb305ade9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------- DOM ----------
const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn = document.getElementById('google-login-btn');

const profileModal = document.getElementById('profile-modal');
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
const usernameLockNote = document.getElementById('username-lock-note');
const saveProfileBtn = document.getElementById('save-profile');
const cancelEditBtn = document.getElementById('cancel-edit');

const logoutBtn = document.getElementById('logout-btn');

const chatsLeftDisplay = document.getElementById('chats-left');
const roomIdDisplay = document.getElementById('room-id-display');
const roomPassDisplay = document.getElementById('room-pass-display');
const linkDisplay = document.getElementById('link-display');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');
const leftChats = document.getElementById('chats-list');

const createChatBtn = document.getElementById('create-chat');
const joinRoomBtn = document.getElementById('join-room');

// ---------- STATE ----------
let currentUser = null;
let currentUserDoc = null;
let currentUserRole = 'user';
let currentUserIsAdmin = false;
let MAX_CHATS_PER_DAY = 10;
let currentRoomId = null;

const ROLE_QUOTAS = {
  admin: 50,
  coadmin: 30,
  chat_creator: 10, // 10 chats/day
  user: 10,
  member: 25
};

// ---------- UTIL ----------
function rand(len=6){
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s='';
  for(let i=0;i<len;i++) s+=chars.charAt(Math.floor(Math.random()*chars.length));
  return s;
}
function safeSet(el, t){ if(el) el.textContent = t; }
function openProfileModal(){ profileModal.classList.remove('hidden'); }
function closeProfileModal(){ profileModal.classList.add('hidden'); }
function showViewMode(){ viewMode.classList.remove('hidden'); editMode.classList.add('hidden'); }
function showEditMode(){ viewMode.classList.add('hidden'); editMode.classList.remove('hidden'); }

// ---------- AUTH ----------
googleLoginBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  try{
    await signInWithPopup(auth, provider);
  }catch(e){
    console.error("Login failed", e);
    alert("Login failed: "+(e.message||e));
  }
};

logoutBtn.onclick = async () => {
  await signOut(auth);
};

// ---------- AUTH STATE ----------
onAuthStateChanged(auth, async (user) => {
  if(user){
    currentUser = user;
    loginOverlay.style.display = 'none';
    document.querySelector('.app-grid')?.classList.remove('hidden');

    await ensureUserDoc(user);
    await loadCurrentUserDoc();
    await refreshDailyQuotaUI();
    joinRoomFromURL();
  } else {
    currentUser = null;
    currentUserDoc = null;
    currentUserRole = 'user';
    currentUserIsAdmin = false;
    loginOverlay.style.display = 'flex';
    document.querySelector('.app-grid')?.classList.add('hidden');
  }
});

// ---------- USER DOC ----------
async function ensureUserDoc(user){
  const ref = doc(db,'users',user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref,{
      email: user.email || null,
      nickname: user.displayName || '',
      avatarUrl: user.photoURL || '',
      role: 'user',
      username: null,
      usernameLastChanged: null,
      bio: '',
      banned: false
    });
  }
}

async function loadCurrentUserDoc(){
  if(!currentUser) return;
  const ref = doc(db,'users',currentUser.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){ currentUserDoc=null; return; }
  currentUserDoc = snap.data();
  currentUserRole = currentUserDoc.role || 'user';
  currentUserIsAdmin = (currentUserRole==='admin');
  MAX_CHATS_PER_DAY = ROLE_QUOTAS[currentUserRole] ?? 10;

  if(currentUserIsAdmin){
    let nick = currentUserDoc.nickname || currentUser.displayName || '';
    nick = nick.replace(/\s*\[Admin\]$/,'') + ' [Admin]';
    if(nick!==currentUserDoc.nickname){
      await updateDoc(ref,{nickname:nick});
      currentUserDoc.nickname = nick;
    }
  }
}

// ---------- DAILY QUOTA ----------
async function readDailyLimitDoc(uid){
  const metaRef = doc(db,'users',uid,'meta','dailyLimit');
  const snap = await getDoc(metaRef);
  const today = new Date().toISOString().split('T')[0];
  if(!snap.exists()){
    await setDoc(metaRef,{chatsLeft: MAX_CHATS_PER_DAY,lastReset: today});
    return { chatsLeft: MAX_CHATS_PER_DAY,lastReset: today };
  }
  const data = snap.data();
  if(!data.lastReset || data.lastReset!==today){
    await setDoc(metaRef,{chatsLeft: MAX_CHATS_PER_DAY,lastReset: today},{merge:true});
    return { chatsLeft: MAX_CHATS_PER_DAY,lastReset: today };
  }
  return { chatsLeft: data.chatsLeft ?? MAX_CHATS_PER_DAY,lastReset: data.lastReset };
}

async function tryConsumeCreateQuota(uid){
  if(currentUserIsAdmin){
    return { ok:true, remaining: ROLE_QUOTAS['admin'] };
  }
  const metaRef = doc(db,'users',uid,'meta','dailyLimit');
  const snap = await getDoc(metaRef);
  const today = new Date().toISOString().split('T')[0];

  if(!snap.exists()){
    await setDoc(metaRef,{chatsLeft: MAX_CHATS_PER_DAY-1,lastReset:today});
    return { ok:true, remaining: MAX_CHATS_PER_DAY-1 };
  }

  const data = snap.data();
  if(data.lastReset!==today){
    await setDoc(metaRef,{chatsLeft: MAX_CHATS_PER_DAY-1,lastReset:today},{merge:true});
    return { ok:true, remaining: MAX_CHATS_PER_DAY-1 };
  }

  const current = (typeof data.chatsLeft==='number')? data.chatsLeft : MAX_CHATS_PER_DAY;
  if(current<=0) return { ok:false, remaining:0 };

  await updateDoc(metaRef,{chatsLeft: current-1});
  return { ok:true, remaining: current-1 };
}

async function refreshDailyQuotaUI(){
  if(!currentUser){ safeSet(chatsLeftDisplay,'Not signed in'); return; }
  const meta = await readDailyLimitDoc(currentUser.uid);
  safeSet(chatsLeftDisplay,`${meta.chatsLeft} chats left today`);
}

// ---------- CREATE / JOIN ROOM ----------
createChatBtn.onclick = async () => {
  if(!currentUser) return alert('Sign in first');
  if(currentUserDoc?.banned) return alert('You are banned.');

  const res = await tryConsumeCreateQuota(currentUser.uid);
  if(!res.ok) return alert('You used all your create chats today.');

  const rid = rand(8);
  const pass = rand(6);
  currentRoomId = rid;

  await setDoc(doc(db,'rooms',rid),{
    password: pass,
    createdBy: currentUser.uid,
    members: [currentUser.uid],
    createdAt: Date.now()
  });

  safeSet(roomIdDisplay,`Room ID: ${rid}`);
  safeSet(roomPassDisplay,`Password: ${pass}`);
  updateRoomLink(rid,pass);
  await refreshDailyQuotaUI();
  listenMessages();
  renderLeftChats();
};

joinRoomBtn.onclick = async () => {
  const rid = document.getElementById('room-id').value.trim();
  const pass = document.getElementById('room-pass').value.trim();
  if(!rid || !pass) return alert('Enter Room ID and Password');

  const snap = await getDoc(doc(db,'rooms',rid));
  if(!snap.exists()) return alert('Room not found');
  const data = snap.data();
  if(data.password!==pass) return alert('Incorrect password');

  currentRoomId = rid;
  safeSet(roomIdDisplay,`Room ID: ${rid}`);
  safeSet(roomPassDisplay,`Password: ${pass}`);
  updateRoomLink(rid,pass);
  listenMessages();
};

// ---------- MESSAGES ----------
sendBtn.onclick = sendMessage;
messageInput.addEventListener('keydown', e=>{ if(e.key==='Enter') sendMessage(); });

async function sendMessage(){
  if(!currentUser) return alert('Sign in to send messages');
  if(!currentRoomId) return alert('Join or create a room first');
  const txt = messageInput.value.trim();
  if(!txt) return;

  await addDoc(collection(db,'rooms',currentRoomId,'messages'),{
    text: txt,
    nickname: currentUserDoc?.nickname || currentUser.displayName || '',
    username: currentUserDoc?.username || null,
    avatarUrl: currentUserDoc?.avatarUrl || currentUser.photoURL || '',
    userId: currentUser.uid,
    timestamp: Date.now()
  });

  messageInput.value = '';
}

function listenMessages(){
  if(!currentRoomId) return;
  const col = collection(db,'rooms',currentRoomId,'messages');
  onSnapshot(col,snap=>{
    messagesDiv.innerHTML='';
    const docs = snap.docs.slice().sort((a,b)=> (a.data().timestamp||0)-(b.data().timestamp||0));
    docs.forEach(d=>{
      const m=d.data();
      const div=document.createElement('div');
      div.className='message '+((m.userId===currentUser?.uid)?'mine':'theirs');

      const info=document.createElement('div'); info.className='msg-info';

      if(m.avatarUrl){
        const img=document.createElement('img'); img.src=m.avatarUrl;
        img.style.cursor='pointer';
        img.onclick=()=>openUserProfile(m.userId);
        info.appendChild(img);
      }

      const nameSpan=document.createElement('span'); nameSpan.textContent=m.nickname||'Unknown';
      nameSpan.style.cursor='pointer';
      nameSpan.onclick=()=>openUserProfile(m.userId);
      info.appendChild(nameSpan);

      div.appendChild(info);

      const textDiv=document.createElement('div'); textDiv.className='msg-text'; textDiv.textContent=m.text;
      div.appendChild(textDiv);

      // admin delete
      if(currentUserIsAdmin || currentUserRole==='coadmin'){
        const del=document.createElement('button'); del.textContent='Del';
        del.style.marginLeft='8px';
        del.onclick=async()=>{ try{ await deleteDoc(d.ref); alert('Message deleted'); }catch(e){ console.error(e); alert('Delete failed'); } };
        info.appendChild(del);
      }

      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTo({top:messagesDiv.scrollHeight, behavior:'smooth'});
  });
}

// ---------- PROFILE ----------
document.getElementById('profile-btn').onclick=()=>{
  openProfileModal();
  showEditMode();
  editNickname.value=currentUserDoc?.nickname||currentUser.displayName||'';
  editUsername.value=currentUserDoc?.username||'';
  usernameLockNote.textContent='';

  const last=currentUserDoc?.usernameLastChanged? new Date(currentUserDoc.usernameLastChanged):null;
  if(last && !currentUserIsAdmin){
    const days=Math.floor((Date.now()-last.getTime())/(1000*60*60*24));
    const remaining=15-days;
    if(remaining>0){
      usernameLockNote.textContent=`Username locked for ${remaining} more day(s).`;
      editUsername.disabled=true;
    } else editUsername.disabled=false;
  } else editUsername.disabled=false;
};

cancelEditBtn.onclick=()=>closeProfileModal();

saveProfileBtn.onclick=async()=>{
  if(!currentUser) return;
  try{
    let newNick=editNickname.value.trim();
    let newUser=editUsername.value.trim();
    const userRef=doc(db,'users',currentUser.uid);
    const snap=await getDoc(userRef);
    const cur=snap.exists()?snap.data():{};

    const isAdmin=cur.role==='admin';
    if(isAdmin) newNick=newNick.replace(/\s*\[Admin\]$/,'')+' [Admin]';

    if(newUser!==cur.username){
      if(!isAdmin){
        const last=cur.usernameLastChanged?new Date(cur.usernameLastChanged):null;
        if(last){
          const days=Math.floor((Date.now()-last.getTime())/(1000*60*60*24));
          if(days<15) return alert(`Username can only be changed every 15 days. ${15-days} day(s) left.`);
        }
      }
      await updateDoc(userRef,{username:newUser||null,usernameLastChanged:Date.now()});
    }

    if(editAvatar.files && editAvatar.files[0]){
      const file=editAvatar.files[0];
      const b64=await new Promise(res=>{
        const r=new FileReader();
        r.onload=()=>res(r.result);
        r.readAsDataURL(file);
      });
      await updateDoc(userRef,{avatarUrl:b64});
    }

    await updateDoc(userRef,{nickname:newNick,lastSet:Date.now()});
    await loadCurrentUserDoc();
    alert('Profile saved.');
    closeProfileModal();
  }catch(e){ console.error(e); alert('Save failed.'); }
};

// ---------- OPEN USER PROFILE ----------
async function openUserProfile(uid){
  if(!uid) return;
  openProfileModal();
  showViewMode();

  const snap=await getDoc(doc(db,'users',uid));
  if(!snap.exists()){
    viewNickname.textContent='Unknown';
    viewUsername.textContent='';
    viewRole.textContent='';
    viewBio.textContent='';
    viewPfp.src='';
    viewAdminActions.innerHTML='';
    return;
  }
  const data=snap.data();
  viewPfp.src=data.avatarUrl||'';
  viewNickname.textContent=data.nickname||'Unknown';
  viewUsername.textContent=data.username? '@'+data.username:'(no username)';
  viewRole.textContent=(data.role||'user').toUpperCase();
  viewBio.textContent=data.bio||'';
  viewAdminActions.innerHTML='';

  viewPfp.onclick=()=>{ if(viewPfp.src) window.open(viewPfp.src,'_blank'); };

  if(currentUser && (currentUserIsAdmin || currentUserRole==='coadmin')){
    const roles=['member','user','chat_creator','coadmin'];
    roles.forEach(r=>{
      const b=document.createElement('button'); b.textContent='Make '+r;
      b.onclick=async()=>{
        if(!confirm(`Make this user ${r}?`)) return;
        await updateDoc(doc(db,'users',uid),{role:r});
        alert('Role updated');
        if(uid===currentUser.uid) await loadCurrentUserDoc();
      };
      viewAdminActions.appendChild(b);
    });

    if(currentUserIsAdmin){
      const makeAdmin=document.createElement('button'); makeAdmin.textContent='Make admin';
      makeAdmin.onclick=async()=>{
        if(!confirm('Make this user admin?')) return;
        await updateDoc(doc(db,'users',uid),{role:'admin'});
        alert('User is now admin');
      };
      viewAdminActions.appendChild(makeAdmin);

      const deleteRoomBtn=document.createElement('button'); deleteRoomBtn.textContent='Delete all rooms by user';
      deleteRoomBtn.onclick=()=>{ alert('To implement: batch delete rooms via admin tool.'); };
      viewAdminActions.appendChild(deleteRoomBtn);
    }

    const banBtn=document.createElement('button'); banBtn.textContent=data.banned?'Unban':'Ban';
    banBtn.onclick=async()=>{ await updateDoc(doc(db,'users',uid),{banned:!data.banned}); alert('Ban toggled'); };
    viewAdminActions.appendChild(banBtn);
  }
}

closeProfileView.onclick=()=>closeProfileModal();

// ---------- JOIN FROM URL ----------
function joinRoomFromURL(){
  const params=new URLSearchParams(window.location.search);
  const rid=params.get('room');
  const pass=params.get('pass');
  if(!rid || !pass) return;
  getDoc(doc(db,'rooms',rid)).then(snap=>{
    if(!snap.exists()) return;
    const data=snap.data();
    if(data.password!==pass) return;
    currentRoomId=rid;
    safeSet(roomIdDisplay,`Room ID: ${rid}`);
    safeSet(roomPassDisplay,`Password: ${pass}`);
    updateRoomLink(rid,pass);
    listenMessages

