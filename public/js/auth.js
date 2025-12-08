/**
 * Authentication handling for login and register pages
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check if already authenticated
    if (API.Auth.isAuthenticated()) {
        window.location.href = '/dashboard.html';
        return;
    }

    // Setup form handlers
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        setupLoginForm(loginForm);
    }

    if (registerForm) {
        setupRegisterForm(registerForm);
    }
});

/**
 * Setup login form
 */
function setupLoginForm(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorDiv = document.getElementById('loginError');
        
        // Get form data
        const username = form.querySelector('#username').value.trim();
        const password = form.querySelector('#password').value;

        // Validate
        if (!username || !password) {
            showError(errorDiv, 'Please fill in all fields');
            return;
        }

        // Show loading state
        setLoading(submitBtn, true);
        hideError(errorDiv);

        try {
            await API.Auth.login({ username, password });
            window.location.href = '/dashboard.html';
        } catch (error) {
            showError(errorDiv, error.message);
        } finally {
            setLoading(submitBtn, false);
        }
    });
}

/**
 * Setup register form
 */
function setupRegisterForm(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorDiv = document.getElementById('registerError');
        
        // Get form data
        const fullName = form.querySelector('#fullName').value.trim();
        const username = form.querySelector('#username').value.trim();
        const email = form.querySelector('#email').value.trim();
        const password = form.querySelector('#password').value;
        const confirmPassword = form.querySelector('#confirmPassword').value;

        // Validate
        if (!fullName || !username || !email || !password) {
            showError(errorDiv, 'Please fill in all required fields');
            return;
        }

        if (password !== confirmPassword) {
            showError(errorDiv, 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            showError(errorDiv, 'Password must be at least 6 characters');
            return;
        }

        if (!isValidEmail(email)) {
            showError(errorDiv, 'Please enter a valid email address');
            return;
        }

        // Show loading state
        setLoading(submitBtn, true);
        hideError(errorDiv);

        try {
            await API.Auth.register({ fullName, username, email, password });
            window.location.href = '/dashboard.html';
        } catch (error) {
            showError(errorDiv, error.message);
        } finally {
            setLoading(submitBtn, false);
        }
    });
}

/**
 * Show error message
 */
function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.classList.remove('hidden');
    }
}

/**
 * Hide error message
 */
function hideError(element) {
    if (element) {
        element.classList.add('hidden');
    }
}

/**
 * Set loading state on button
 */
function setLoading(button, isLoading) {
    if (!button) return;
    
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.innerHTML = '<span class="spinner spinner-sm"></span> Loading...';
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Submit';
    }
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
