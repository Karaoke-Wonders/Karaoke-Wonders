// Using main domain path route for Worker API
const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev'; 

let isRegisterMode = false;

// Discord Forum Tag IDs from your server settings
const TAG_IDS = {
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027'
};

document.addEventListener('DOMContentLoaded', async () => {
    const alertBox = document.getElementById('alert-box');
    const alertText = document.getElementById('alert-text');
    const alertIcon = document.getElementById('alert-icon');

    // UI Helper: Show Banner Alert
    function showAlert(message, type = 'error') {
        if (!alertBox) return;
        alertBox.classList.remove('hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400', 'bg-green-500/10', 'border-green-500/20', 'text-green-400');
        
        if (type === 'error') {
            alertBox.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
            if (alertIcon) alertIcon.setAttribute('data-lucide', 'alert-circle');
        } else {
            alertBox.classList.add('bg-green-500/10', 'border-green-500/20', 'text-green-400');
            if (alertIcon) alertIcon.setAttribute('data-lucide', 'check-circle');
        }
        
        if (alertText) alertText.textContent = message;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async function refreshUserSession() {
        const sessionData = localStorage.getItem('kw_session');
        if (!sessionData) return;

        try {
            const rawUser = JSON.parse(sessionData);
            const user = rawUser.user || rawUser;

            const username = user.username || rawUser.username || '';
            const password = user.password || rawUser.password || '';

            if (!username || !password) {
                console.warn('Session is missing credentials. Retaining local session.');
                return;
            }

            const response = await fetch(`${WORKER_BASE_URL}/api/get-account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            // Only clear session on explicit authentication rejection
            if (response.status === 401 || response.status === 403) {
                console.error('Session validation rejected by worker:', response.status);
                localStorage.removeItem('kw_session');
                return;
            }

            if (!response.ok) {
                console.warn(`Background session check returned HTTP ${response.status}. Retaining local session.`);
                return;
            }

            const data = await response.json();
            const userTags = data.tags || [];

            if (userTags.includes(TAG_IDS.blacklisted) || data.isLocked) {
                localStorage.removeItem('kw_session');
                alert('Your account has been restricted or blacklisted.');
                window.location.href = 'index.html';
                return;
            }

            const isStaff = Boolean(
                data.isAdmin || 
                userTags.includes(TAG_IDS.staff) || 
                username.toLowerCase().includes('admin')
            );

            const updatedSession = {
                ...rawUser,
                username: data.username || username,
                password: password,
                threadId: data.threadId || user.threadId || '',
                avatarUrl: data.avatarUrl || user.avatarUrl || '',
                tags: userTags,
                isAdmin: isStaff,
                role: isStaff ? 'administrator' : 'member'
            };
            
            localStorage.setItem('kw_session', JSON.stringify(updatedSession));

        } catch (err) {
            console.error('Failed to sync session background state:', err);
        }
    }

    // 1. Check and refresh existing session on load
    const existingSession = localStorage.getItem('kw_session');
    if (existingSession) {
        await refreshUserSession();
        const updatedSession = localStorage.getItem('kw_session');
        if (updatedSession) {
            try {
                const user = JSON.parse(updatedSession);
                if (user && user.username) {
                    window.location.href = user.isAdmin ? 'admin.html' : 'main.html';
                    return;
                }
            } catch (e) {
                localStorage.removeItem('kw_session');
            }
        }
    }

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    const loginForm = document.getElementById('auth-form');
    const submitBtn = document.getElementById('submit-btn');

    function hideAlert() {
        if (alertBox) alertBox.classList.add('hidden');
    }

    // Toggle between "Sign In" and "Request Access / Register"
    window.toggleMode = function() {
        isRegisterMode = !isRegisterMode;

        const subtitle = document.getElementById('auth-subtitle');
        const extraFields = document.getElementById('extra-fields');
        const btnText = document.getElementById('btn-text');
        const toggleLabel = document.getElementById('toggle-label');
        const toggleBtn = document.getElementById('toggle-mode-btn');

        hideAlert();

        if (isRegisterMode) {
            if (subtitle) subtitle.textContent = "Submit a request to join the stage platform";
            if (extraFields) extraFields.classList.remove('hidden');
            if (btnText) btnText.textContent = "Submit Account Request";
            if (toggleLabel) toggleLabel.textContent = "Already have an account?";
            if (toggleBtn) toggleBtn.textContent = "Sign In";
        } else {
            if (subtitle) subtitle.textContent = "Sign in to access your stage profile";
            if (extraFields) extraFields.classList.add('hidden');
            if (btnText) btnText.textContent = "Sign In";
            if (toggleLabel) toggleLabel.textContent = "Don't have an account?";
            if (toggleBtn) toggleBtn.textContent = "Request Access";
        }
    };

    // Form Submission Handler
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');

            const username = usernameInput ? usernameInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';

            if (!username || !password) {
                showAlert('Username and password are required.');
                return;
            }

            submitBtn.disabled = true;
            const originalBtnHTML = submitBtn.innerHTML;
            submitBtn.innerHTML = `<span>Connecting to Stage...</span>`;

            try {
                if (isRegisterMode) {
                    const response = await fetch(`${WORKER_BASE_URL}/api/create-account`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Failed to submit account request.');
                    }

                    showAlert('Access request created! A thread has been opened in Discord.', 'success');
                    
                    setTimeout(() => {
                        toggleMode();
                    }, 2000);

                } else {
                    const response = await fetch(`${WORKER_BASE_URL}/api/get-account`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await response.json();

                    if (!response.ok) {
                        if (response.status === 404) {
                            throw new Error('Account not found in Discord. Ensure your username is correct and your thread is active.');
                        }
                        throw new Error(data.error || 'Invalid credentials or server error.');
                    }

                    const userTags = data.tags || [];
                    if (userTags.includes(TAG_IDS.blacklisted) || data.isLocked) {
                        showAlert('This account has been blacklisted.', 'error');
                        return;
                    }

                    const isStaff = Boolean(
                        data.isAdmin || 
                        userTags.includes(TAG_IDS.staff) || 
                        username.toLowerCase().includes('admin')
                    );

                    // Guarantees username and password are never undefined
                    const userSession = {
                        username: data.username || username,
                        threadId: data.threadId || '',
                        password: password,
                        avatarUrl: data.avatarUrl || '',
                        tags: userTags,
                        role: isStaff ? 'administrator' : 'member',
                        isAdmin: isStaff,
                        loggedInAt: new Date().toISOString()
                    };

                    localStorage.setItem('kw_session', JSON.stringify(userSession));
                    
                    if (isStaff) {
                        showAlert('Staff credentials verified! Redirecting to Admin Hub...', 'success');
                    } else {
                        showAlert('Login verified! Redirecting to stage...', 'success');
                    }

                    setTimeout(() => {
                        window.location.href = isStaff ? 'admin.html' : 'main.html';
                    }, 1000);
                }

            } catch (err) {
                showAlert(err.message || 'An error occurred during authentication.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        });
    }
});