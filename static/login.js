import { auth, db } from './firebase.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Admins are auto-promoted by display name on first login (Hackathon approach)
const ADMIN_NAMES = ["BaconFace288"];

// Creates or ensures a user profile doc exists in Firestore
async function ensureUserDoc(user, ageRange) {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        // New user — determine their initial role
        let role = "user";
        if (ADMIN_NAMES.includes(user.displayName)) {
            role = "admin";
        }
        await setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName || "Anonymous",
            email: user.email,
            role: role,
            ageRange: ageRange || "18-24",
            createdAt: Date.now()
        });
    } else {
        // Existing user — auto-promote by name if they were added to ADMIN_NAMES later
        const data = snap.data();
        if (ADMIN_NAMES.includes(user.displayName) && data.role !== "admin") {
            await setDoc(userRef, { ...data, role: "admin" });
        }
    }
}

// Expose these to global window object so our HTML inline onclick events still work
window.switchTab = function(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabs = document.querySelectorAll('.tab-btn');
    
    document.getElementById('error-msg').style.display = 'none';
    document.getElementById('success-msg').style.display = 'none';

    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'login') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        tabs[0].classList.add('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        tabs[1].classList.add('active');
    }
}

window.togglePassword = function(inputId, icon) {
    const passwordInput = document.getElementById(inputId);
    if (!passwordInput) return;

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    }
}

function showError(msg) {
    const errDiv = document.getElementById('error-msg');
    errDiv.textContent = msg;
    errDiv.style.display = 'block';
    document.getElementById('success-msg').style.display = 'none';
}

function showSuccess(msg) {
    const sucDiv = document.getElementById('success-msg');
    sucDiv.textContent = msg;
    sucDiv.style.display = 'block';
    document.getElementById('error-msg').style.display = 'none';
}

window.handleLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Ensure their Firestore profile exists and check for admin promotion
        await ensureUserDoc(userCredential.user, null);
        window.location.href = '/app';
    } catch (err) {
        let errorMsg = 'Login failed. Please verify credentials.';
        if (err.code === 'auth/invalid-credential') {
            errorMsg = 'Invalid email or password.';
        }
        showError(errorMsg);
    }
}

window.handleRegister = async function(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const ageRange = document.getElementById('reg-age-range').value;

    if (!ageRange) {
        showError('Please select your age range.');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Set the display name to the username they chose
        await updateProfile(userCredential.user, {
            displayName: username
        });

        // Create the Firestore user profile with role and age range
        await ensureUserDoc({ ...userCredential.user, displayName: username }, ageRange);
        
        showSuccess('Account created! You can now log in.');
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-email').value = '';
        document.getElementById('reg-password').value = '';
        document.getElementById('reg-age-range').selectedIndex = 0;
        setTimeout(() => window.switchTab('login'), 2000);
    } catch (err) {
        let errorMsg = 'Registration failed.';
        if (err.code === 'auth/email-already-in-use') {
            errorMsg = 'That email is already in use.';
        } else if (err.code === 'auth/weak-password') {
            errorMsg = 'Password should be at least 6 characters.';
        }
        showError(errorMsg);
    }
}
