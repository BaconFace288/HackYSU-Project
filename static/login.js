import { auth } from './firebase.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

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
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = '/';
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
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Set the display name to the username they chose
        await updateProfile(userCredential.user, {
            displayName: username
        });
        
        showSuccess('Account created! You can now log in.');
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-email').value = '';
        document.getElementById('reg-password').value = '';
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
