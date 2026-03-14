import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot,
    serverTimestamp,
    doc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elements
const boardView = document.getElementById('board-view');
const roomView = document.getElementById('room-view');
const createModal = document.getElementById('create-modal');
const feedContainer = document.getElementById('feed-container');

const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const roomTitleEl = document.getElementById('room-title');
const roomHostEl = document.getElementById('room-host');

let currentUser = null;
let currentRoomId = null;
let unsubscribeMessages = null;

// =========== Auth Check & Init ===========
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        setupUI();
        listenForPosts(); // Load the Community Feed immediately
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
        userProfile.title = "Click to view settings";
        userProfile.onclick = () => {
            window.location.href = '/settings';
        };
    }
}

// =========== Board / Feed Logic ===========
function listenForPosts() {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; // Clear skeleton
        
        if (snapshot.empty) {
            feedContainer.innerHTML = `
                <div class="post-card" style="grid-column: 1 / -1; text-align: center; background: transparent; border: 2px dashed var(--border);">
                    <h3 style="color: var(--text-secondary);">No active support requests</h3>
                    <p>Be the first to create a post and start a conversation!</p>
                </div>
            `;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const postId = docSnap.id;
            
            // Build the card
            const card = document.createElement('div');
            card.className = 'post-card';
            card.onclick = () => window.openRoom(postId, data.title, data.hostName);
            
            card.innerHTML = `
                <h3>${data.title}</h3>
                <p>${data.description}</p>
                <div class="post-meta">
                    <span class="host-name">
                        <i class="fas fa-user-circle"></i> ${data.hostName}
                    </span>
                    <span>Click to join chat →</span>
                </div>
            `;
            
            feedContainer.appendChild(card);
        });
    }, (error) => {
        console.error("Firestore Listen Error:", error);
        feedContainer.innerHTML = `
            <div class="post-card" style="border-color: #ef4444;">
                <h3 style="color: #ef4444;">Connection Error</h3>
                <p>${error.message}</p>
            </div>
        `;
    });
}

window.openCreateModal = function() {
    createModal.style.display = 'flex';
}

window.closeCreateModal = function() {
    createModal.style.display = 'none';
    document.getElementById('post-title').value = '';
    document.getElementById('post-desc').value = '';
}

window.submitPost = async function(event) {
    event.preventDefault();
    
    const title = document.getElementById('post-title').value.trim();
    const desc = document.getElementById('post-desc').value.trim();
    
    if(!title || !desc) return;
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Posting...';
    submitBtn.disabled = true;

    try {
        await addDoc(collection(db, "posts"), {
            title: title,
            description: desc,
            hostName: currentUser.displayName || 'Anonymous',
            hostUid: currentUser.uid,
            createdAt: Date.now()
        });
        
        window.closeCreateModal();
    } catch (e) {
        console.error("Error creating post: ", e);
        alert("Failed to post: " + e.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// =========== Chat Room Logic ===========

window.openRoom = function(postId, title, hostName) {
    currentRoomId = postId;
    
    // Update UI headers
    roomTitleEl.textContent = title;
    roomHostEl.textContent = `Hosted by ${hostName}`;
    
    // Switch Views
    boardView.style.display = 'none';
    roomView.style.display = 'flex';
    
    // Connect to specific room messages
    connectToRoomChat(postId);
}

window.closeRoom = function() {
    currentRoomId = null;
    
    // Stop listening to the old room to save bandwidth and prevent memory leaks
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    // Switch Views back
    roomView.style.display = 'none';
    boardView.style.display = 'block';
}

function connectToRoomChat(roomId) {
    // Reference: posts/{post_id}/messages
    const messagesRef = collection(db, "posts", roomId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    
    messagesContainer.innerHTML = '';
    
    // Keep reference to the listener so we can unsubscribe when leaving the room
    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                appendMessage(change.doc.data());
            }
        });
    }, (error) => {
        console.error("Room Chat Error:", error);
    });
}

window.sendMessage = async function(event) {
    event.preventDefault();
    if(!currentRoomId) return;

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
        // Write to posts/{post_id}/messages
        const messagesRef = collection(db, "posts", currentRoomId, "messages");
        await addDoc(messagesRef, {
            text: text,
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            createdAt: Date.now()
        });
    } catch (e) {
        console.error("Error adding message: ", e);
        alert("Failed to send: " + e.message);
    }
}

function appendMessage(data) {
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
