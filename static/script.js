import { auth, db } from './firebase.js';
import { containsProfanity } from './profanity.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    doc,
    getDoc,
    updateDoc,
    arrayUnion
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
let currentUserRole = 'user'; // persisted after auth
let currentUserAgeRange = 'everyone'; // persisted after auth
let currentRoomId = null;
let unsubscribeMessages = null;
let currentFeedFilter = 'all'; // 'all' | 'hosted'

// =========== Auth Check & Init ===========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Fetch the user's role and ageRange from Firestore
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const role = userData.role || "user";
        currentUserRole = role; // store globally
        currentUserAgeRange = userData.ageRange || 'everyone'; // store globally
        setupUI(role);
        listenForPosts(); // Load the Community Feed immediately
        checkTherapistStatus(user.uid); // Watch for approval/denial notifications
    } else {
        window.location.href = '/login';
    }
});

function setupUI(role) {
    // Role-aware avatar color
    const bgColor = role === 'admin' ? '773585' : role === 'Certified Therapist' ? '008088' : '475569';

    // Update user avatar in UI to match their real username
    const avatarImg = document.querySelector(".avatar img");
    if (avatarImg && currentUser.displayName) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${currentUser.displayName}&background=${bgColor}&color=fff&rounded=true`;
    }
    const userNameSpan = document.querySelector(".user-info h3");
    if (userNameSpan && currentUser.displayName) {
        userNameSpan.textContent = currentUser.displayName;
    }

    // Add role badge next to username
    if (role === 'admin' || role === 'Certified Therapist') {
        const badgeEl = document.createElement('span');
        badgeEl.textContent = role === 'admin' ? '🛡️ Admin' : '🧠 Therapist';
        badgeEl.style.cssText = `font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 20px;
            background: ${role === 'admin' ? 'rgba(119,53,133,0.15)' : 'rgba(0,128,136,0.12)'};
            color: ${role === 'admin' ? '#773585' : '#008088'};
            border: 1px solid ${role === 'admin' ? 'rgba(119,53,133,0.3)' : 'rgba(0,128,136,0.3)'};
            margin-left: 6px;`;
        if (userNameSpan) userNameSpan.parentElement.appendChild(badgeEl);
    }

    // Build header nav links
    const headerNav = document.getElementById('header-nav');
    if (headerNav) {
        // Conversations link (all users)
        const convLink = document.createElement('a');
        convLink.href = '/conversations';
        convLink.innerHTML = '<i class="fas fa-comments"></i> Conversations';
        convLink.style.cssText = 'color: #008088; font-weight: 600; font-size: 0.9rem; text-decoration: none; display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(0,128,136,0.3); background: rgba(0,128,136,0.08); transition: background 0.2s;';
        convLink.onmouseover = () => convLink.style.background = 'rgba(0,128,136,0.16)';
        convLink.onmouseout = () => convLink.style.background = 'rgba(0,128,136,0.08)';
        headerNav.appendChild(convLink);

        // Admin link (admins only)
        if (role === 'admin') {
            const adminLink = document.createElement('a');
            adminLink.href = '/admin';
            adminLink.innerHTML = '<i class="fas fa-shield-halved"></i> Admin';
            adminLink.style.cssText = 'color: #773585; font-weight: 600; font-size: 0.9rem; text-decoration: none; display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(119,53,133,0.3); background: rgba(119,53,133,0.08); transition: background 0.2s;';
            adminLink.onmouseover = () => adminLink.style.background = 'rgba(119,53,133,0.16)';
            adminLink.onmouseout = () => adminLink.style.background = 'rgba(119,53,133,0.08)';
            headerNav.appendChild(adminLink);
        }
    }

    // Profile click → settings
    const userProfile = document.querySelector(".user-profile");
    if (userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.title = "Click to view settings";
        userProfile.onclick = () => {
            window.location.href = '/settings';
        };
    }

    // Inject 'My Hosted Chats' tab strip (admins & therapists only)
    if (role === 'admin' || role === 'Certified Therapist') {
        const boardHeader = document.querySelector('.board-header');
        if (boardHeader) {
            const tabStrip = document.createElement('div');
            tabStrip.id = 'feed-tab-strip';
            tabStrip.style.cssText = `
                display: flex;
                gap: 6px;
                margin-top: 12px;
                padding: 4px;
                background: rgba(0,0,0,0.04);
                border-radius: 10px;
                width: 100%;
            `;
            tabStrip.innerHTML = `
                <button id="tab-all" onclick="window.setFeedTab('all')"
                    style="flex:1; padding: 7px 14px; border-radius: 7px; border: none; cursor: pointer;
                           font-size: 0.88rem; font-weight: 600; background: var(--primary); color: white;
                           transition: all 0.2s;">
                    💬 All Chats
                </button>
                <button id="tab-hosted" onclick="window.setFeedTab('hosted')"
                    style="flex:1; padding: 7px 14px; border-radius: 7px; border: none; cursor: pointer;
                           font-size: 0.88rem; font-weight: 600; background: transparent; color: var(--text-secondary);
                           transition: all 0.2s;">
                    ${role === 'admin' ? '🛡️' : '🧠'} My Hosted Chats
                </button>
            `;
            // Insert tab strip below the h2/button row
            boardHeader.style.flexWrap = 'wrap';
            boardHeader.appendChild(tabStrip);
        }
    }
}

// Switch feed tab (all | hosted)
window.setFeedTab = function (tab) {
    currentFeedFilter = tab;
    const tabAll = document.getElementById('tab-all');
    const tabHosted = document.getElementById('tab-hosted');
    if (tabAll && tabHosted) {
        tabAll.style.background = tab === 'all' ? 'var(--primary)' : 'transparent';
        tabAll.style.color = tab === 'all' ? 'white' : 'var(--text-secondary)';
        tabHosted.style.background = tab === 'hosted' ? 'var(--primary)' : 'transparent';
        tabHosted.style.color = tab === 'hosted' ? 'white' : 'var(--text-secondary)';
    }
    renderFeed(window._latestFeedSnapshot);
};

// =========== Board / Feed Logic ===========
function listenForPosts() {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        window._latestFeedSnapshot = snapshot; // store for re-rendering on tab switch
        renderFeed(snapshot);
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

function renderFeed(snapshot) {
    if (!snapshot) return;
    feedContainer.innerHTML = '';

    // Filter docs based on active tab
    let docs = snapshot.docs;
    if (currentFeedFilter === 'hosted') {
        docs = docs.filter(d => d.data().hostUid === currentUser.uid);
    }

    // Filter by audience: show post if audience is 'everyone' OR matches the viewer's age range
    docs = docs.filter(d => {
        const audience = d.data().audience || 'everyone';
        return audience === 'everyone' || audience === currentUserAgeRange;
    });

    if (docs.length === 0) {
        const emptyMsg = currentFeedFilter === 'hosted'
            ? 'You are not currently hosting any chats.'
            : 'No posts match your age range yet. Be the first to create one!';
        feedContainer.innerHTML = `
            <div class="post-card" style="grid-column: 1 / -1; text-align: center; background: transparent; border: 2px dashed var(--border);">
                <h3 style="color: var(--text-secondary);">${currentFeedFilter === 'hosted' ? '🛡️ No Hosted Chats' : 'No posts for your age range'}</h3>
                <p>${emptyMsg}</p>
            </div>
        `;
        return;
    }

    docs.forEach((docSnap) => {
        const postId = docSnap.id;
        const data = docSnap.data();
        const isPending = data.status === 'pending';
        const canHost = currentUserRole === 'admin' || currentUserRole === 'Certified Therapist';
        const audience = data.audience || 'everyone';
        const audienceLabel = audience === 'everyone' ? '👥 Everyone' : `🎯 ${audience}`;
        const audienceBadge = `<span style="font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:20px;
            background:rgba(0,128,136,0.1); color:#008088; border:1px solid rgba(0,128,136,0.25); white-space:nowrap;">
            ${audienceLabel}
        </span>`;

        const card = document.createElement('div');
        card.classList.add('post-card');
        card.dataset.postId = postId;

        if (isPending) {
            // Locked card — can't be joined yet
            card.style.cssText = 'cursor: default; opacity: 0.85;';
            card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 6px;">
                        <h3 style="margin:0;">${data.title}</h3>
                        <span style="font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:20px;
                            background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3); white-space:nowrap;">
                            🔒 Waiting for Host
                        </span>
                    </div>
                    <p>${data.description}</p>
                    <div class="post-meta">
                        <span class="host-name">
                            <i class="fas fa-user-circle"></i> ${data.hostName || 'Anonymous'}
                        </span>
                        ${audienceBadge}
                        ${canHost
                    ? `<button onclick="window.hostPost('${postId}', event)"
                                style="background: linear-gradient(135deg,#773585,#008088); color:white; border:none;
                                        padding:6px 14px; border-radius:8px; font-size:0.85rem; font-weight:600;
                                        cursor:pointer; display:flex; align-items:center; gap:6px;">
                                    🛡️ Host this Chat
                               </button>`
                    : `<span style="color:var(--text-secondary); font-size:0.85rem;">Waiting for an admin or therapist to host</span>`
                }
                    </div>
                `;
        } else {
            // Active card — joinable by anyone
            card.onclick = () => window.openRoom(postId, data.title, data.hostName);
            card.innerHTML = `
                    <h3>${data.title}</h3>
                    <p>${data.description}</p>
                    <div class="post-meta">
                        <span class="host-name">
                            <i class="fas fa-user-circle"></i> ${data.hostName}
                        </span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${audienceBadge}
                            <span>Click to join chat →</span>
                        </div>
                    </div>
                `;
        }

        feedContainer.appendChild(card);
    });
}

window.openCreateModal = function () {
    createModal.style.display = 'flex';
}

window.closeCreateModal = function () {
    createModal.style.display = 'none';
    document.getElementById('post-title').value = '';
    document.getElementById('post-desc').value = '';
    const audienceSel = document.getElementById('post-audience');
    if (audienceSel) audienceSel.value = 'everyone';
}

window.submitPost = async function (event) {
    event.preventDefault();

    const title = document.getElementById('post-title').value.trim();
    const desc = document.getElementById('post-desc').value.trim();
    const audienceEl = document.getElementById('post-audience');
    const audience = audienceEl ? audienceEl.value : 'everyone';

    if (!title || !desc) return;

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Posting...';
    submitBtn.disabled = true;

    // Admins and therapists can start active rooms immediately;
    // regular users must wait for a host to volunteer.
    const isPrivileged = currentUserRole === 'admin' || currentUserRole === 'Certified Therapist';
    const status = isPrivileged ? 'active' : 'pending';

    try {
        await addDoc(collection(db, "posts"), {
            title: title,
            description: desc,
            hostName: isPrivileged ? (currentUser.displayName || 'Anonymous') : null,
            hostUid: isPrivileged ? currentUser.uid : null,
            creatorName: currentUser.displayName || 'Anonymous',
            creatorUid: currentUser.uid,
            status: status,
            audience: audience,
            createdAt: Date.now()
        });

        window.closeCreateModal();
        if (!isPrivileged) {
            alert('✅ Your support request has been posted! A therapist or admin will volunteer to host it shortly.');
        }
    } catch (e) {
        console.error("Error creating post: ", e);
        alert("Failed to post: " + e.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Admin/Therapist volunteers to host a pending post
window.hostPost = async function (postId, event) {
    event.stopPropagation(); // don't let it bubble to the card
    try {
        await updateDoc(doc(db, "posts", postId), {
            hostName: currentUser.displayName || 'Host',
            hostUid: currentUser.uid,
            status: 'active'
        });
    } catch (e) {
        alert("Failed to accept hosting: " + e.message);
    }
}

// =========== Chat Room Logic ===========

window.openRoom = function (postId, title, hostName) {
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

window.closeRoom = function () {
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
window.checkForCrisisKeywords = checkForCrisisKeywords;

window.sendMessage = async function (event) {
    event.preventDefault();
    if (!currentRoomId) return;

    const text = messageInput.value.trim();
    if (text === '' && !pendingImageData) return;   // need text OR image

    // ---- Profanity filter (text) ----
    if (text && containsProfanity(text)) {
        showProfanityAlert();
        return;
    }

    // ---- AI image moderation ----
    let approvedImageData = null;
    if (pendingImageData) {
        const statusEl = document.getElementById('img-moderation-status');
        statusEl.textContent = '🔍 Checking image with AI...';
        statusEl.style.color = '#ca8a04';
        try {
            const modRes = await fetch('/api/moderate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: pendingImageData })
            });
            const modData = await modRes.json();
            if (modData.approved) {
                approvedImageData = pendingImageData;
                window.clearImageSelection();
            } else {
                statusEl.textContent = `❌ Image rejected: ${modData.reason || 'Inappropriate content'}`;
                statusEl.style.color = '#ef4444';
                return;  // Don't send
            }
        } catch (err) {
            statusEl.textContent = '❌ Moderation check failed. Please try again.';
            statusEl.style.color = '#ef4444';
            return;
        }
    }

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
        const msgDoc = { uid: currentUser.uid, displayName: currentUser.displayName, createdAt: Date.now() };
        if (text) msgDoc.text = text;
        if (approvedImageData) msgDoc.imageData = approvedImageData;
        await addDoc(messagesRef, msgDoc);

        // Track this room in the user's participatedRooms for the Conversations tab
        updateDoc(doc(db, "users", currentUser.uid), {
            participatedRooms: arrayUnion({
                id: currentRoomId,
                title: roomTitleEl.textContent || 'Unnamed Room'
            })
        }).catch(() => { }); // Non-critical, ignore failures

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
            // Show the in-site support popup to the user
            showCrisisPopup();
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

    // Render image if present
    if (data.imageData) {
        const img = document.createElement('img');
        img.src = data.imageData;
        img.alt = 'shared image';
        img.style.cssText = 'max-width:220px; max-height:220px; border-radius:10px; display:block; margin-bottom:' + (data.text ? '6px' : '0') + '; cursor:zoom-in;';
        img.onclick = () => { showImageLightbox(data.imageData); };
        contentDiv.appendChild(img);
    }
    if (data.text) {
        const textNode = document.createTextNode(data.text);
        contentDiv.appendChild(textNode);
    }

    msgDiv.appendChild(contentDiv);
    messagesContainer.appendChild(msgDiv);

    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}

// =========== Image Lightbox ===========
function showImageLightbox(src) {
    let overlay = document.getElementById('image-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'image-lightbox';
        overlay.style.cssText = `
            position:fixed; top:0; left:0; width:100%; height:100%;
            background:rgba(0,0,0,0.8); z-index:99999;
            display:flex; align-items:center; justify-content:center;
            cursor:zoom-out; backdrop-filter:blur(6px);
            animation: fadeIn 0.25s ease;
        `;
        overlay.onclick = () => { overlay.style.display = 'none'; };
        document.body.appendChild(overlay);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') overlay.style.display = 'none';
        });
    }
    overlay.innerHTML = `
        <img src="${src}" alt="Full size image" style="
            max-width:90vw; max-height:90vh; border-radius:12px;
            box-shadow:0 8px 40px rgba(0,0,0,0.5); object-fit:contain;
        ">
        <button onclick="event.stopPropagation(); document.getElementById('image-lightbox').style.display='none';"
            style="position:absolute; top:1rem; right:1rem; background:rgba(255,255,255,0.15);
                   border:none; color:white; width:36px; height:36px; border-radius:50%;
                   font-size:1.2rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
    `;
    overlay.style.display = 'flex';
}

// =========== Image Attachment Handling ===========
let pendingImageData = null;  // compressed base64 to send with next message

window.handleImageSelected = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        alert('Image must be under 10 MB.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const MAX = 900;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                else { width = Math.round(width * MAX / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            pendingImageData = canvas.toDataURL('image/jpeg', 0.82);

            // Show preview strip
            document.getElementById('img-preview-thumb').src = pendingImageData;
            const strip = document.getElementById('img-preview-strip');
            strip.style.display = 'flex';
            document.getElementById('img-moderation-status').textContent = '✅ Image ready — send your message';
            document.getElementById('img-moderation-status').style.color = '#16a34a';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    // Reset the input so the same file can be re-selected
    event.target.value = '';
};

window.clearImageSelection = function () {
    pendingImageData = null;
    document.getElementById('img-preview-strip').style.display = 'none';
    document.getElementById('img-preview-thumb').src = '';
};

// =========== Profanity Alert ===========
function showProfanityAlert() {
    let toast = document.getElementById('profanity-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'profanity-toast';
        toast.style.cssText = `
            position: fixed; top: 1rem; left: 50%; transform: translateX(-50%);
            background: rgba(239,68,68,0.92); color: white;
            padding: 10px 22px; border-radius: 12px;
            font-size: 0.9rem; font-weight: 600;
            box-shadow: 0 4px 20px rgba(239,68,68,0.35);
            z-index: 99999; backdrop-filter: blur(8px);
            animation: crisisSlideUp 0.3s ease;
            display: flex; align-items: center; gap: 10px;
        `;
        toast.innerHTML = '🚫 <span>Your message contains inappropriate language and cannot be sent.</span>';
        document.body.appendChild(toast);
    }
    toast.style.display = 'flex';
    clearTimeout(window._profanityTimer);
    window._profanityTimer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}
window.showProfanityAlert = showProfanityAlert;

// =========== Crisis Support Popup ===========
function showCrisisPopup() {
    const popup = document.getElementById('crisis-popup');
    if (!popup) return;
    // Re-trigger animation each time
    popup.style.display = 'none';
    // Force reflow so animation plays again
    void popup.offsetWidth;
    popup.style.display = 'block';
    // Auto-dismiss after 30 seconds
    clearTimeout(window._crisisPopupTimer);
    window._crisisPopupTimer = setTimeout(() => {
        popup.style.display = 'none';
    }, 30000);
}

// =========== Therapist Application Status Watcher ===========
function checkTherapistStatus(uid) {
    // Only register listener for regular users (skip admins/therapists)
    if (currentUserRole === 'admin' || currentUserRole === 'Certified Therapist') return;

    onSnapshot(doc(db, "therapistApplications", uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const status = data.status;
        const notifiedKey = `therapist_notified_${uid}_${status}`;

        // Only show the popup once per status change
        if (localStorage.getItem(notifiedKey)) return;

        if (status === 'approved') {
            localStorage.setItem(notifiedKey, '1');
            showTherapistPopup('approved', null);
            // Freshen the local role so the badge updates without reload
            currentUserRole = 'Certified Therapist';
        } else if (status === 'denied') {
            localStorage.setItem(notifiedKey, '1');
            showTherapistPopup('denied', data.denialReason || 'No reason provided.');
        }
    });
}

function showTherapistPopup(type, reason) {
    // Create or re-use popup element
    let popup = document.getElementById('therapist-decision-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'therapist-decision-popup';
        popup.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.55); z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(popup);
    }

    const isApproved = type === 'approved';
    popup.innerHTML = `
        <div style="
            background: var(--card-bg); border-radius: 20px; padding: 2.5rem 2rem;
            max-width: 440px; width: 90%; text-align: center; position: relative;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            border: 1.5px solid ${isApproved ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.35)'};
            animation: crisisSlideUp 0.4s cubic-bezier(0.16,1,0.3,1);
        ">
            <div style="font-size: 3.5rem; margin-bottom: 1rem;">${isApproved ? '🎉' : '😔'}</div>
            <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 0.5rem;
                color: ${isApproved ? '#16a34a' : '#ef4444'};">
                ${isApproved ? 'You\'re now a Certified Therapist!' : 'Application Not Approved'}
            </h2>
            <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.25rem;">
                ${isApproved
            ? 'Congratulations! Your therapist application has been approved by the HealSpace admin team. You can now host group chats and support users on the platform. 🧠'
            : 'Unfortunately, the admin team was unable to approve your application at this time.'}
            </p>
            ${!isApproved && reason ? `
                <div style="background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.25);
                    border-radius: 10px; padding: 12px 16px; font-size: 0.88rem; margin-bottom: 1rem; text-align: left;">
                    <strong>Reason:</strong> ${reason}
                </div>` : ''}
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 0.5rem;">
                ${isApproved ? `
                <button onclick="location.reload()"
                    style="background: linear-gradient(135deg,#008088,#773585); color:white; border:none;
                           padding: 10px 24px; border-radius: 10px; font-size: 0.95rem; font-weight: 700; cursor: pointer;">
                    Reload to see my badge 🧠
                </button>` : `
                <button onclick="window.location.href='/settings'"
                    style="background: var(--primary); color:white; border:none;
                           padding: 10px 24px; border-radius: 10px; font-size: 0.95rem; font-weight: 700; cursor: pointer;">
                    View Details in Settings
                </button>`}
                <button onclick="document.getElementById('therapist-decision-popup').remove()"
                    style="background: rgba(0,0,0,0.06); color: var(--text-secondary); border: 1px solid var(--border);
                           padding: 10px 20px; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer;">
                    Dismiss
                </button>
            </div>
        </div>
    `;
    popup.style.display = 'flex';
}
