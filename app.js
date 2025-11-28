import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, addDoc, collection, onSnapshot, getDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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

const leftChats = document.querySelector('.chats-list');
const profileBtn = document.querySelector('.profile-btn');
const profileModal = document.getElementById('profile-modal');
const nicknameInput = document.getElementById('nickname-input');
const avatarInput = document.getElementById('avatar-input');
const saveProfileBtn = document.getElementById('save-profile');
const chatsLeftDisplay = document.getElementById('chats-left');

const roomIdDisplay = document.getElementById('room-id-display');
const roomPassDisplay = document.getElementById('room-pass-display');
const linkDisplay = document.getElementById('link-display');

const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');

// State
let currentRoomId = '';
let currentUser = null;
let nickname = '';
let avatarUrl = '';
let chatsToday = 0;
const MAX_CHATS_PER_DAY = 10;

// HELPER
function randomString(len = 6){
    const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let str='';
    for(let i=0;i<len;i++) str+=chars.charAt(Math.floor(Math.random()*chars.length));
    return str;
}

function updateRoomLink(roomId, password){
    const link = `${window.location.origin}/?room=${roomId}&pass=${password}`;
    linkDisplay.innerHTML = `Share link: <a href="${link}" target="_blank" style="color:#0d6efd;">${link}</a>`;
}

// GOOGLE LOGIN
googleLoginBtn.onclick = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
    localStorage.setItem('uid', currentUser.uid);
    loginOverlay.style.display = 'none';
    loadProfile();
    loadUserChats();
};

onAuthStateChanged(auth, user => {
    if(user){
        currentUser = user;
        loginOverlay.style.display = 'none';
        loadProfile();
        loadUserChats();
    } else {
        loginOverlay.style.display = 'flex';
    }
});

// PROFILE
profileBtn.onclick = () => profileModal.style.display = 'flex';
saveProfileBtn.onclick = async () => {
    const name = nicknameInput.value.trim();
    if(name) nickname = name;

    const file = avatarInput.files[0];
    if(file){
        const reader = new FileReader();
        reader.onload = () => {
            avatarUrl = reader.result;
        }
        reader.readAsDataURL(file);
    }
    await setDoc(doc(db,"users",currentUser.uid),{
        nickname,
        avatarUrl,
        lastSet: Date.now()
    }, {merge:true});
    profileModal.style.display = 'none';
};

// CREATE CHAT
document.getElementById('create-chat').onclick = async () => {
    if(chatsToday >= MAX_CHATS_PER_DAY){
        alert("You reached the maximum chats for today!");
        return;
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
    updateRoomLink(roomId,password);
    roomIdDisplay.textContent = `Room ID: ${roomId}`;
    roomPassDisplay.textContent = `Password: ${password}`;
    listenMessages();
    renderLeftChats();
};

// JOIN CHAT
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

// SEND MESSAGE
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

// LISTEN MESSAGES
function listenMessages(){
    const msgsCol = collection(db,"rooms",currentRoomId,"messages");
    onSnapshot(msgsCol, snapshot => {
        messagesDiv.innerHTML='';
        snapshot.docs.sort((a,b)=>a.data().timestamp - b.data().timestamp)
        .forEach(doc=>{
            const msg = doc.data();
            const div = document.createElement('div');
            div.classList.add('message');
            div.classList.add(msg.userId===currentUser.uid ? 'mine' : 'theirs');

            const info = document.createElement('div'); info.classList.add('msg-info');
            if(msg.avatarUrl){
                const img = document.createElement('img'); img.src = msg.avatarUrl; info.appendChild(img);
            }
            const span = document.createElement('span'); span.textContent = msg.nickname; info.appendChild(span);
            div.appendChild(info);

            const textDiv = document.createElement('div'); textDiv.classList.add('msg-text'); textDiv.textContent = msg.text;
            div.appendChild(textDiv);
            messagesDiv.appendChild(div);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// LOAD PROFILE
async function loadProfile(){
    const docSnap = await getDoc(doc(db,"users",currentUser.uid));
    if(docSnap.exists()){
        const data = docSnap.data();
        nickname = data.nickname || currentUser.displayName;
        avatarUrl = data.avatarUrl || currentUser.photoURL;
        nicknameInput.value = nickname;
    } else {
        nickname = currentUser.displayName;
        avatarUrl = currentUser.photoURL;
        nicknameInput.value = nickname;
    }
}

// LEFT MENU CHATS
async function loadUserChats(){
    // Placeholder: Load chats user created today (simplified)
    chatsLeftDisplay.textContent = `${MAX_CHATS_PER_DAY - chatsToday} chats left today`;
}

function renderLeftChats(){
    // Placeholder: render chat titles dynamically
}
