const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsHost = window.location.host || "localhost:8000";

// Auth Check
const token = localStorage.getItem('healspace_token');
const username = localStorage.getItem('healspace_username');

if (!token) {
    window.location.href = '/login';
}

const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws?token=${token}`);

const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');

// Update user avatar in UI to match their real username
document.addEventListener("DOMContentLoaded", () => {
    const avatarImg = document.querySelector(".avatar img");
    if(avatarImg && username) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${username}&background=6366f1&color=fff&rounded=true`;
    }
    const userNameSpan = document.querySelector(".user-info h3");
    if(userNameSpan && username) {
        userNameSpan.textContent = username;
    }
    
    // Add logout button functionality if we want
    const userProfile = document.querySelector(".user-profile");
    if(userProfile) {
        userProfile.style.cursor = 'pointer';
        userProfile.title = "Click to log out";
        userProfile.onclick = () => {
            localStorage.removeItem('healspace_token');
            localStorage.removeItem('healspace_username');
            window.location.href = '/login';
        };
    }
});

ws.onmessage = function(event) {
    let messageData;
    try {
        messageData = JSON.parse(event.data);
    } catch (e) {
        // Fallback for simple text messages
        messageData = {
            id: 'unknown',
            text: event.data
        };
    }

    appendMessage(messageData);
};

function sendMessage(event) {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (text === '') return;
    
    // Create a JSON payload (we don't need to send id anymore, backend knows who we are)
    const payload = {
        text: text
    };

    ws.send(JSON.stringify(payload));
    messageInput.value = '';
    
    // Add small visual feedback on send button
    const btn = document.getElementById('send-btn');
    btn.style.transform = 'scale(0.9)';
    setTimeout(() => {
        btn.style.transform = '';
    }, 150);
}

function appendMessage(data) {
    const isSelf = data.id === username;
    
    // Create message element wrapper
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.classList.add(isSelf ? 'self' : 'other');

    // Create Sender name (only visible for others)
    if (!isSelf) {
        const senderDiv = document.createElement('div');
        senderDiv.classList.add('message-sender');
        senderDiv.textContent = data.id;
        msgDiv.appendChild(senderDiv);
    }

    // Create message content bubble
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = data.text; // prevents XSS by using textContent

    msgDiv.appendChild(contentDiv);
    messagesContainer.appendChild(msgDiv);

    // Scroll to bottom with smooth behavior
    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}
