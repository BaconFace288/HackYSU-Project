function switchTab(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabs = document.querySelectorAll('.tab-btn');
    
    // Clear messages
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

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    try {
        const response = await fetch('/token', {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('healspace_token', data.access_token);
            localStorage.setItem('healspace_username', username);
            window.location.href = '/';
        } else {
            const err = await response.json();
            showError(err.detail || 'Login failed. Please verify credentials.');
        }
    } catch (err) {
        showError('Network error during login.');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            showSuccess('Account created! You can now log in.');
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
            setTimeout(() => switchTab('login'), 2000);
        } else {
            const err = await response.json();
            showError(err.detail || 'Registration failed. Username might be taken.');
        }
    } catch (err) {
        showError('Network error during registration.');
    }
}
