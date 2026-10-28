const API_BASE_URL = window.SkillExchangeConfig.apiBaseUrl;
const TOKEN_STORAGE_KEY = 'skillExchangeToken';
const profileForm = document.getElementById('profile-form');
const profileNotice = document.getElementById('profile-notice');
const deleteDialog = document.getElementById('delete-account-dialog');
const deleteForm = document.getElementById('delete-account-form');
const deleteNotice = document.getElementById('delete-account-notice');

function showNotice(element, message, isError = false) {
	element.textContent = message;
	element.classList.toggle('notice--error', isError);
	element.hidden = false;
}

function readToken() {
	try {
		return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
	} catch (_error) {
		return '';
	}
}

async function apiRequest(path, options = {}) {
	let response;
	try {
		response = await fetch(`${API_BASE_URL}${path}`, {
			...options,
			headers: {
				...(options.body ? { 'Content-Type': 'application/json' } : {}),
				Authorization: `Bearer ${readToken()}`,
				...options.headers,
			},
		});
	} catch (_error) {
		throw new Error('Could not reach the server. Check that the backend is running and try again.');
	}
	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(result.message || `Request failed (${response.status})`);
		error.status = response.status;
		throw error;
	}
	return result;
}

function parseSkillList(value) {
	const skills = value.split(',').map((skill) => skill.trim()).filter(Boolean);
	if (skills.length > 50 || skills.some((skill) => skill.length > 100)) {
		throw new Error('Enter no more than 50 skills, each 100 characters or fewer.');
	}
	return skills;
}

async function loadProfile() {
	try {
		const result = await apiRequest('/api/auth/me');
		profileForm.elements.name.value = result.data.name || '';
		profileForm.elements.location.value = result.data.location || '';
		profileForm.elements.skillsToTeach.value = (result.data.skillsToTeach || []).join(', ');
		profileForm.elements.skillsToLearn.value = (result.data.skillsToLearn || []).join(', ');
	} catch (error) {
		if (error.status === 401) {
			window.location.replace(`login.html?returnTo=${encodeURIComponent('profile.html')}`);
			return;
		}
		showNotice(profileNotice, error.message, true);
	}
}

profileForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!profileForm.reportValidity()) return;
	const submitButton = profileForm.querySelector('button[type="submit"]');
	submitButton.disabled = true;
	try {
		const result = await apiRequest('/api/auth/me', {
			method: 'PATCH',
			body: JSON.stringify({
				name: profileForm.elements.name.value.trim(),
				location: profileForm.elements.location.value.trim(),
				skillsToTeach: parseSkillList(profileForm.elements.skillsToTeach.value),
				skillsToLearn: parseSkillList(profileForm.elements.skillsToLearn.value),
			}),
		});
		showNotice(profileNotice, result.message || 'Profile updated successfully.');
	} catch (error) {
		showNotice(profileNotice, error.message, true);
	} finally {
		submitButton.disabled = false;
	}
});

document.getElementById('open-delete-account').addEventListener('click', () => {
	deleteForm.reset();
	deleteNotice.hidden = true;
	deleteNotice.classList.remove('notice--error');
	deleteDialog.showModal();
});

document.getElementById('close-delete-account').addEventListener('click', () => deleteDialog.close());
document.getElementById('cancel-delete-account').addEventListener('click', () => deleteDialog.close());

deleteForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!deleteForm.reportValidity()) return;
	const submitButton = deleteForm.querySelector('button[type="submit"]');
	submitButton.disabled = true;
	try {
		const result = await apiRequest('/api/auth/me', { method: 'DELETE' });
		try {
			window.localStorage.removeItem(TOKEN_STORAGE_KEY);
		} catch (_error) {
			// The account is already deleted; navigation still leaves the protected page.
		}
		showNotice(deleteNotice, result.message || 'Your account was deleted.');
		window.setTimeout(() => window.location.assign('index.html'), 900);
	} catch (error) {
		showNotice(deleteNotice, error.message, true);
		submitButton.disabled = false;
	}
});

if (!readToken()) {
	window.location.replace(`login.html?returnTo=${encodeURIComponent('profile.html')}`);
} else {
	void loadProfile();
}
