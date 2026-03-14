import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot,
    serverTimestamp,
    doc,
    getDoc
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
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Fetch the user's role from Firestore
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const role = userSnap.exists() ? userSnap.data().role : "user";
        setupUI(role);
        listenForPosts(); // Load the Community Feed immediately
    } else {
        window.location.href = '/login';
    }
});

function setupUI(role) {
    // Role-aware avatar color
    const bgColor = role === 'admin' ? '773585' : role === 'Certified Therapist' ? '008088' : '475569';

    // Update user avatar in UI to match their real username
    const avatarImg = document.querySelector(".avatar img");
    if(avatarImg && currentUser.displayName) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${currentUser.displayName}&background=${bgColor}&color=fff&rounded=true`;
    }
    const userNameSpan = document.querySelector(".user-info h3");
    if(userNameSpan && currentUser.displayName) {
        userNameSpan.textContent = currentUser.displayName;
    }

    // Add role badge next to username
    if (role === 'admin' || role === 'Certified Therapist') {
        const badgeEl = document.createElement('span');
        badgeEl.textContent = role === 'admin' ? '🛡️ Admin' : '🧠 Therapist';
        badgeEl.style.cssText = `font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 20px;
            background: ${ role === 'admin' ? 'rgba(119,53,133,0.15)' : 'rgba(0,128,136,0.12)' };
            color: ${ role === 'admin' ? '#773585' : '#008088' };
            border: 1px solid ${ role === 'admin' ? 'rgba(119,53,133,0.3)' : 'rgba(0,128,136,0.3)' };
            margin-left: 6px;`;
        if (userNameSpan) userNameSpan.parentElement.appendChild(badgeEl);
    }
    
    // Show admin panel link in header for admins
    if (role === 'admin') {
        const header = document.querySelector('.app-header');
        const adminLink = document.createElement('a');
        adminLink.href = '/admin';
        adminLink.innerHTML = '<i class="fas fa-shield-halved"></i> Admin';
        adminLink.style.cssText = 'color: #773585; font-weight: 600; font-size: 0.9rem; text-decoration: none; display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(119,53,133,0.3); background: rgba(119,53,133,0.08); transition: background 0.2s;';
        adminLink.onmouseover = () => adminLink.style.background = 'rgba(119,53,133,0.16)';
        adminLink.onmouseout = () => adminLink.style.background = 'rgba(119,53,133,0.08)';
        if (header) header.insertBefore(adminLink, header.querySelector('.user-profile'));
    }
    
    // Profile click → settings
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

// =========== Crisis Keyword Detection ===========
const CRISIS_KEYWORDS = [
    // Self-harm / suicide
    'suicide', 'suicidal', 'kill myself', 'killing myself', 'end my life', 'end it all',
    'take my life', 'take my own life', 'want to die', 'wanna die', 'going to die',
    'i want to die', 'i wanna die', 'dont want to live', "don't want to live",
    'no reason to live', 'not worth living', 'life is not worth', 'tired of living',
    'self harm', 'self-harm', 'cutting myself', 'hurt myself', 'hurting myself',
    'overdose', 'hang myself', 'shoot myself', 'slit my wrists',
    // Harm to others
    'kill someone', 'hurt someone', 'harm someone', 'going to hurt', 'going to kill',
    'want to hurt', 'want to kill', 'shooting', 'stabbing'
];

function checkForCrisisKeywords(text) {
    const lower = text.toLowerCase();
    return CRISIS_KEYWORDS.find(kw => lower.includes(kw)) || null;
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

        // ---- Crisis Detection ----
        const triggeredKeyword = checkForCrisisKeywords(text);
        if (triggeredKeyword) {
            // Write a flag to the admin-visible flaggedMessages collection
            await addDoc(collection(db, "flaggedMessages"), {
                text: text,
                triggerKeyword: triggeredKeyword,
                uid: currentUser.uid,
                displayName: currentUser.displayName || 'Anonymous',
                roomId: currentRoomId,
                roomTitle: roomTitleEl.textContent || 'Unknown Room',
                flaggedAt: Date.now(),
                dismissed: false
            });
        }
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
