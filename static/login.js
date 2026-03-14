import { auth, db } from './firebase.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile,
    sendEmailVerification,
    signOut
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

// Check URL params for error messages
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'banned') {
        showError('Your account has been suspended or deleted by an administrator.');
    }
});

window.resendVerification = async function(e) {
    if (e) e.preventDefault();
    if (auth.currentUser) {
        try {
            await sendEmailVerification(auth.currentUser);
            showSuccess('Verification email resent! Please check your inbox and spam folder.');
            // Sign out after resending so they are forced to log in again later
            await signOut(auth);
        } catch (err) {
            showError('Failed to resend email: ' + err.message);
        }
    } else {
        showError('Session expired. Please try logging in again to trigger a resend.');
    }
};

window.handleLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        if (!userCredential.user.emailVerified) {
            const errDiv = document.getElementById('error-msg');
            errDiv.innerHTML = `Please verify your email address. <a href="#" onclick="resendVerification(event)" style="color: #fff; text-decoration: underline; font-weight: bold;">Resend Email</a>`;
            errDiv.style.display = 'block';
            document.getElementById('success-msg').style.display = 'none';
            return;
        }

        // Check if user is banned (soft deleted)
        const userRef = doc(db, "users", userCredential.user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().disabled) {
            await signOut(auth);
            showError('This account has been suspended or deleted by an administrator.');
            return;
        }

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
        
        // Send email verification
        await sendEmailVerification(userCredential.user);

        // Sign out immediately so they have to verify
        await signOut(auth);
        
        showSuccess('Account created! Please check your email and verify your account before logging in.');
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-email').value = '';
        document.getElementById('reg-password').value = '';
        document.getElementById('reg-age-range').selectedIndex = 0;
        setTimeout(() => window.switchTab('login'), 3500);
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
