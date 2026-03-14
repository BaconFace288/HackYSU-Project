import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot,
    serverTimestamp,
    limit
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');

let currentUser = null;

// Auth Check
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        setupUI();
        listenForMessages();
    } else {
        window.location.href = '/login';
    }
});

function setupUI() {
    // Update user avatar in UI to match their real username
    const avatarImg = document.querySelector(".avatar img");
    if(avatarImg && currentUser.displayName) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${currentUser.displayName}&background=6366f1&color=fff&rounded=true`;
    }
    const userNameSpan = document.querySelector(".user-info h3");
    if(userNameSpan && currentUser.displayName) {
        userNameSpan.textContent = currentUser.displayName;
    }
    
    // Add logout button functionality
    const userProfile = document.querySelector(".user-profile");
    if(userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.title = "Click to log out";
        userProfile.onclick = () => {
            signOut(auth);
        };
    }
}

function listenForMessages() {
    // Simplified query to bypass complex Firebase indexing requirements
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    
    // Clear the dummy message
    messagesContainer.innerHTML = '';
    
    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                appendMessage(change.doc.data());
            }
        });
    }, (error) => {
        console.error("Firestore Listen Error:", error);
        alert("Firebase Auth/Permission Error: " + error.message + "\n\nPlease ensure your Firestore Database is built and set to 'Test Mode'.");
    });
}

window.sendMessage = async function(event) {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (text === '') return;
    
    messageInput.value = '';
    
    // Add small visual feedback on send button
    const btn = document.getElementById('send-btn');
    if (btn) {
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => { btn.style.transform = ''; }, 150);
    }

    try {
        await addDoc(collection(db, "messages"), {
            text: text,
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            createdAt: Date.now() // Use standard local time to avoid serverTimestamp sync delays
        });
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Failed to send: " + e.message + "\n\nMake sure your Firestore Database rules are in Test Mode!");
    }
}

function appendMessage(data) {
    // If it's a completely new message from the server that doesn't have a timestamp yet, 
    // it's likely our local positive write.
    const isSelf = data.uid === currentUser.uid;
    
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.classList.add(isSelf ? 'self' : 'other');

    if (!isSelf) {
        const senderDiv = document.createElement('div');
        senderDiv.classList.add('message-sender');
        senderDiv.textContent = data.displayName || 'Unknown';
        msgDiv.appendChild(senderDiv);
    }

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = data.text;

    msgDiv.appendChild(contentDiv);
    messagesContainer.appendChild(msgDiv);

    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}
