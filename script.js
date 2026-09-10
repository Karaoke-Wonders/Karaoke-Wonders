document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    const loginForm = document.getElementById('login-form');
    const alertBox = document.getElementById('alert-box');
    const alertText = document.getElementById('alert-text');
    const alertIcon = document.getElementById('alert-icon');
    const submitBtn = document.getElementById('submit-btn');

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

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            showAlert('Please fill in all fields.');
            return;
        }

        // Disable button during submit
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Signing in...</span>`;

        try {
            /* 
              Future Cloudflare Worker / API call placeholder:
              
              const response = await fetch('/api/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username, password })
              });
              const data = await response.json();
            */

            // Simulated API network delay
            await new Promise(resolve => setTimeout(resolve, 800));

            // Client-Side session handling
            let userRole = 'member';
            let isAdmin = false;

            if (username.toLowerCase() === 'admin') {
                userRole = 'administrator';
                isAdmin = true;
            }

            const userSession = {
                username: username,
                role: userRole,
                isAdmin: isAdmin,
                loggedInAt: new Date().toISOString()
            };

            localStorage.setItem('kw_session', JSON.stringify(userSession));
            showAlert('Login successful! Redirecting...', 'success');

            // Redirect to dashboard page
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1000);

        } catch (err) {
            showAlert('An error occurred during sign in. Please try again.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Sign In</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
            lucide.createIcons();
        }
    });
});