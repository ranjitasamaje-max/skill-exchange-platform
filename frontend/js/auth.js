const API_BASE_URL = window.SkillExchangeConfig.apiBaseUrl;
const TOKEN_STORAGE_KEY = 'skillExchangeToken';
const requestedReturnTo = new URLSearchParams(window.location.search).get('returnTo');

function getSafeReturnTo(candidate) {
	if (!candidate) return '';
	try {
		const destination = new URL(candidate, window.location.href);
		const allowedPages = ['dashboard.html', 'skills.html', 'profile.html'].map(
			(page) => new URL(page, window.location.href).pathname
		);
		if (destination.origin !== window.location.origin || !allowedPages.includes(destination.pathname)) {
			return '';
		}
		const page = destination.pathname.split('/').pop();
		const search = destination.search || (page === 'dashboard.html' ? '?v=2' : '');
		return `${page}${search}`;
	} catch (_error) {
		return '';
	}
}

const returnTo = getSafeReturnTo(requestedReturnTo);

function showNotice(element, message, isError = false) {
	element.textContent = message;
	element.classList.toggle('notice--error', isError);
	element.hidden = false;
}

async function sendAuthRequest(path, payload) {
	let response;
	try {
		response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
	} catch (_error) {
		throw new Error('Could not reach the server. Check that the backend is running and try again.');
	}

	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(result.message || `Request failed (${response.status})`);
	}
	return result;
}

function validateForm(form) {
	if (form.id === 'signup-form') {
		form.elements.name.setCustomValidity(
			form.elements.name.value.trim() ? '' : 'Please enter your full name.'
		);
		if (!form.reportValidity()) return false;

		const password = form.elements.password.value;
		const confirmPassword = form.elements.confirmPassword.value;
		if (new TextEncoder().encode(password).length > 72) {
			form.elements.password.setCustomValidity('Password must be no longer than 72 UTF-8 bytes.');
			form.elements.password.reportValidity();
			return false;
		}
		if (password !== confirmPassword) {
			form.elements.confirmPassword.setCustomValidity('Passwords do not match.');
			form.elements.confirmPassword.reportValidity();
			return false;
		}
	} else if (!form.reportValidity()) {
		return false;
	}

	return true;
}

const signupForm = document.getElementById('signup-form');
if (signupForm) {
	const loginLink = document.querySelector('.auth-switch a');
	const notice = document.getElementById('signup-notice');
	const submitButton = signupForm.querySelector('button[type="submit"]');
	if (loginLink && returnTo) {
		loginLink.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
	}
	signupForm.elements.password.addEventListener('input', () => {
		signupForm.elements.confirmPassword.setCustomValidity('');
	});
	signupForm.elements.confirmPassword.addEventListener('input', () => {
		signupForm.elements.confirmPassword.setCustomValidity('');
	});
	signupForm.elements.name.addEventListener('input', () => {
		signupForm.elements.name.setCustomValidity('');
	});

	signupForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!validateForm(signupForm)) return;

		submitButton.disabled = true;
		submitButton.textContent = 'Creating account...';
		const formData = new FormData(signupForm);
		const payload = {
			name: formData.get('name').trim(),
			email: formData.get('email').trim(),
			password: formData.get('password'),
			location: formData.get('location').trim(),
		};

		try {
			const result = await sendAuthRequest('signup', payload);
			showNotice(notice, `${result.message || 'Account created successfully.'} Taking you to login...`);
			signupForm.reset();
			const loginQuery = new URLSearchParams({ registered: '1' });
			if (returnTo) loginQuery.set('returnTo', returnTo);
			window.setTimeout(() => {
				window.location.assign(`login.html?${loginQuery.toString()}`);
			}, 1200);
		} catch (error) {
			showNotice(notice, error.message, true);
			submitButton.disabled = false;
			submitButton.innerHTML = 'Create account <span aria-hidden="true">↗</span>';
		}
	});
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
	const signupLink = document.querySelector('.auth-switch a');
	const notice = document.getElementById('login-notice');
	const submitButton = loginForm.querySelector('button[type="submit"]');
	if (signupLink && returnTo) {
		signupLink.href = `signup.html?returnTo=${encodeURIComponent(returnTo)}`;
	}
	const query = new URLSearchParams(window.location.search);
	if (query.get('registered') === '1') {
		showNotice(notice, 'Account created. Log in with your new email and password.');
		loginForm.elements.email.focus();
	}

	loginForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!validateForm(loginForm)) return;

		submitButton.disabled = true;
		submitButton.textContent = 'Logging in...';
		const formData = new FormData(loginForm);
		const payload = {
			email: formData.get('email').trim(),
			password: formData.get('password'),
		};

		try {
			const result = await sendAuthRequest('login', payload);
			if (!result.data || typeof result.data.token !== 'string') {
				throw new Error('Login response did not include an authentication token.');
			}
			window.localStorage.setItem(TOKEN_STORAGE_KEY, result.data.token);
			showNotice(notice, 'Login successful. Redirecting to your dashboard...');
			loginForm.reset();
			window.setTimeout(
				() => window.location.assign(returnTo || 'dashboard.html?v=2'),
				700
			);
		} catch (error) {
			showNotice(notice, error.message, true);
			submitButton.disabled = false;
			submitButton.innerHTML = 'Log in <span aria-hidden="true">↗</span>';
		}
	});
}
