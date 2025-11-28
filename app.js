import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, addDoc, collection, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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

// DOM
const createBtn = document.getElementById('create-chat');
const joinBtnMain = document.getElementById('join-chat');
const joinSection = document.getElementById('join-section');
const joinRoomBtn = document.getElementById('join-room');
const roomIdInput = document.getElementById('room-id');
const roomPassInput = document.getElementById('room-pass');
const roomIdDisplay = document.getElementById('room-id-display');
const roomPassDisplay = document.getElementById('room-pass-display');
const linkDisplay = document.getElementById('link-display');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');

const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const nicknameInput = document.getElementById('nickname-input');
const avatarInput = document.getElementById('avatar-input');
const saveProfileBtn = document.getElementById('save-profile');

let currentRoomId = '';
let userId = `user-${Math.floor(Math.random()*10000)}`;
let nickname = "Anonymous";
let avatarUrl = "";

// Helper
function randomString(len=6){ const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let str=''; for(let i=0;i<len;i++) str+=chars.charAt(Math.floor(Math.random()*chars.length)); return str; }

// Profile
profileBtn.onclick = () => profileModal.style.display='flex';
saveProfileBtn.onclick = ()=>{
  const name = nicknameInput.value.trim();
  if(name) nickname=name;
  const file = avatarInput.files[0];
  if(file){
    const reader = new FileReader();
    reader.onload = ()=>{ avatarUrl = reader.result; }
    reader.readAsDataURL(file);
  }
  profileModal.style.display='none';
}

// Create Chat
createBtn.onclick = async ()=>{
  const roomId = randomString(8);
  const password = randomString(6);
  currentRoomId = roomId;
  await setDoc(doc(db,"rooms",roomId),{password});
  roomIdDisplay.textContent=`Room ID: ${roomId}`;
  roomPassDisplay.textContent=`Password: ${password}`;
  const link = `${window.location.origin}/msgapp/?room=${roomId}&pass=${password}`;
  linkDisplay.innerHTML=`Share link: <a href="${link}" target="_blank" style="color:#0d6efd;">${link}</a>`;
  enterChat();
}

// Join Chat
joinBtnMain.onclick = ()=> joinSection.style.display='block';
joinRoomBtn.onclick = async ()=>{
  const roomId=roomIdInput.value.trim();
  const password=roomPassInput.value.trim();
  if(!roomId || !password) return alert("Enter Room ID + Password");
  const roomDoc = await getDoc(doc(db,"rooms",roomId));
  if(!roomDoc.exists()) return alert("Room does not exist");
  if(roomDoc.data().password!==password) return alert("Incorrect password");
  currentRoomId=roomId;
  roomIdDisplay.textContent=`Room ID: ${roomId}`;
  roomPassDisplay.textContent=`Password: ${password}`;
  linkDisplay.innerHTML = `Share link: <a href="${window.location.origin}/msgapp/?room=${roomId}&pass=${password}" target="_blank" style="color:#0d6efd;">${window.location.origin}/msgapp/?room=${roomId}&pass=${password}</a>`;
}

// AUTO JOIN
window.addEventListener("load", async ()=>{
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  const urlPass = params.get("pass");
  if(!urlRoom || !urlPass) return;
  try{
    const roomRef = doc(db,"rooms",urlRoom);
    const roomDoc = await getDoc(roomRef);
    if(!roomDoc.exists()){ alert("Room does not exist anymore."); return; }
    if(roomDoc.data().password !== urlPass){ alert("Incorrect password from link."); return; }
    currentRoomId=urlRoom;
    roomIdDisplay.textContent=`Room ID: ${urlRoom}`;
    roomPassDisplay.textContent=`Password: ${urlPass}`;
    linkDisplay.innerHTML=`Share link: <a href="${window.location.origin}/msgapp/?room=${urlRoom}&pass=${urlPass}" target="_blank" style="color:#0d6efd;">${window.location.origin}/msgapp/?room=${urlRoom}&pass=${urlPass}</a>`;
    enterChat();
  }catch(err){ console.error("Auto join failed:", err); }
});

// Enter chat
function enterChat(){ listenMessages(); }

// Send message
sendBtn.onclick=async()=>{
  const text=messageInput.value.trim();
  if(!text||!currentRoomId)return;
  await addDoc(collection(db,"rooms",currentRoomId,"messages"),{
    text, userId, timestamp:new Date(), nickname, avatarUrl
  });
  messageInput.value='';
}

// Listen messages
function listenMessages(){
  const msgsCol = collection(db,"rooms",currentRoomId,"messages");
  onSnapshot(msgsCol,snapshot=>{
    messagesDiv.innerHTML='';
    snapshot.docs.sort((a,b)=>a.data().timestamp - b.data().timestamp).forEach(doc=>{
      const msg=doc.data();
      const div=document.createElement('div');

      // Info
      const infoDiv=document.createElement('div');
      infoDiv.classList.add('msg-info');
      if(msg.avatarUrl){ const img=document.createElement('img'); img.src=msg.avatarUrl; infoDiv.appendChild(img); }
      const nameSpan=document.createElement('span'); nameSpan.textContent=msg.nickname||'Anonymous';
      infoDiv.appendChild(nameSpan);

      // Message
      const msgDiv=document.createElement('div');
      msgDiv.classList.add('message'); msgDiv.classList.add(msg.userId===userId?'my-msg':'other-msg');
      msgDiv.textContent=msg.text;

      div.appendChild(infoDiv);
      div.appendChild(msgDiv);
      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTop=messagesDiv.scrollHeight;
  });
}
