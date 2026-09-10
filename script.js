// Using main domain path route for Worker API
const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev'; 

let isRegisterMode = false;

// Replace these with your actual Discord Forum Tag IDs from your server settings
const TAG_IDS = {
    staff: '1547672021364768848',
    restricted: '1547672052750884864',
    blacklisted: '1547672075395792947'
};

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    const loginForm = document.getElementById('auth-form');
    const alertBox = document.getElementById('alert-box');
    const alertText = document.getElementById('alert-text');
    const alertIcon = document.getElementById('alert-icon');
    const submitBtn = document.getElementById('submit-btn');

    // UI Helper: Show Banner Alert
    function showAlert(message, type = 'error') {
        alertBox.classList.remove('hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400', 'bg-green-500/10', 'border-green-500/20', 'text-green-400');
        
        if (type === 'error') {
            alertBox.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
            alertIcon.setAttribute('data-lucide', 'alert-circle');
        } else {
            alertBox.classList.add('bg-green-500/10', 'border-green-500/20', 'text-green-400');
            alertIcon.setAttribute('data-lucide', 'check-circle');
        }
        
        alertText.textContent = message;
        lucide.createIcons();
    }

    function hideAlert() {
        alertBox.classList.add('hidden');
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
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password') ? document.getElementById('password').value.trim() : '';
            const initialData = document.getElementById('initialData') ? document.getElementById('initialData').value.trim() : '';

            if (!username) {
                showAlert('Please enter your username.');
                return;
            }

            if (isRegisterMode && !password) {
                showAlert('Username and password are required.');
                return;
            }

            // Disable button during network call
            submitBtn.disabled = true;
            const originalBtnHTML = submitBtn.innerHTML;
            submitBtn.innerHTML = `<span>Connecting to Stage...</span>`;

            try {
                if (isRegisterMode) {
                    // --- REGISTRATION / CREATE FORUM THREAD ---
                    const response = await fetch(`${WORKER_BASE_URL}/api/create-account`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password, initialData })
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
                    // --- LOGIN / FETCH FORUM THREAD STATUS ---
                    const response = await fetch(`${WORKER_BASE_URL}/api/get-account?username=${encodeURIComponent(username)}`);
                    const data = await response.json();

                    if (!response.ok) {
                        if (response.status === 404) {
                            throw new Error('Account thread not found in Discord. Please request access.');
                        }
                        throw new Error(data.error || 'Server error occurred during sign in.');
                    }

                    // Check if user is blacklisted using the tag array check
                    const userTags = data.tags || [];
                    if (userTags.includes(TAG_IDS.blacklisted)) {
                        showAlert('This account has been blacklisted.', 'error');
                        return;
                    }

                    // Check if user is an admin via tags or naming convention fallback
                    const isStaff = userTags.includes(TAG_IDS.staff) || username.toLowerCase().includes('admin');

                    // Save session payload to local storage
                    const userSession = {
                        username: data.username,
                        threadId: data.threadId,
                        avatarUrl: data.avatarUrl || '',
                        tags: userTags,
                        role: isStaff ? 'administrator' : 'member',
                        isAdmin: isStaff,
                        loggedInAt: new Date().toISOString()
                    };

                    localStorage.setItem('kw_session', JSON.stringify(userSession));
                    showAlert('Login verified! Redirecting to stage...', 'success');

                    setTimeout(() => {
                        window.location.href = '/dashboard.html';
                    }, 1000);
                }

            } catch (err) {
                showAlert(err.message || 'An error occurred during authentication.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
                lucide.createIcons();
            }
        });
    }
});