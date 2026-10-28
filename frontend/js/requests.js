const API_BASE_URL = window.SkillExchangeConfig.apiBaseUrl;
const TOKEN_STORAGE_KEY = 'skillExchangeToken';

const requestsList = document.getElementById('requests-list');
const requestCount = document.getElementById('request-count');
const requestNotice = document.getElementById('request-notice');

function readToken() {
	try {
		return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
	} catch (_error) {
		return '';
	}
}

async function apiRequest(url, options = {}) {
	let response;
	try {
		response = await fetch(url, {
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

function showNotice(message, isError = false) {
	requestNotice.textContent = message;
	requestNotice.classList.toggle('notice--error', isError);
	requestNotice.hidden = false;
}

function createTextElement(tagName, className, text) {
	const element = document.createElement(tagName);
	element.className = className;
	element.textContent = text;
	return element;
}

function sameId(left, right) {
	return String(left?._id || left || '') === String(right?._id || right || '');
}

function renderRequests(requests, currentUserId) {
	requestCount.textContent = `${requests.length} ${requests.length === 1 ? 'request' : 'requests'}`;
	requestsList.replaceChildren();
	if (!requests.length) {
		requestsList.append(createTextElement('p', 'empty-state', 'You have no requests yet. Browse available skills to get started.'));
		return;
	}

	requests.forEach((request) => {
		const card = document.createElement('article');
		card.className = 'record-card';
		const main = document.createElement('div');
		main.className = 'record-main';
		const incoming = sameId(request.receiver, currentUserId);
		const otherPerson = incoming ? request.senderName : request.receiverName;
		const initials = (otherPerson || 'Member').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
		main.append(createTextElement('span', 'avatar', initials));

		const copy = document.createElement('div');
		copy.className = 'record-copy';
		copy.append(createTextElement('h3', '', incoming ? `Request from ${otherPerson || 'a member'}` : `Request to ${otherPerson || 'a member'}`));
		const requestedSkill = request.requestedSkillName || request.skillRequested || 'a skill';
		const offeredSkill = request.offeredSkillName;
		copy.append(createTextElement('p', '', offeredSkill
			? `${incoming ? 'They want to learn' : 'You want to learn'} ${requestedSkill}; ${incoming ? 'they offer' : 'you offer'} ${offeredSkill} in return.`
			: `${incoming ? 'They want to learn' : 'You want to learn'} ${requestedSkill} (one-way request).`));
		copy.append(createTextElement('span', `dashboard-status dashboard-status--${request.status || 'pending'}`, request.status || 'pending'));
		if (incoming && request.message) {
			copy.append(createTextElement('p', 'dashboard-request-message', request.message));
		}
		main.append(copy);
		card.append(main);

		if (!incoming && request.status === 'pending') {
			const actions = document.createElement('div');
			actions.className = 'record-actions';
			const cancelButton = createTextElement('button', 'button button--quiet button--danger', 'Cancel request');
			cancelButton.type = 'button';
			cancelButton.addEventListener('click', () => deleteRequest(request._id, requestedSkill));
			actions.append(cancelButton);
			card.append(actions);
		}
		requestsList.append(card);
	});
}

async function loadRequests(currentUserId) {
	requestCount.textContent = 'Loading';
	requestsList.replaceChildren(createTextElement('p', 'empty-state', 'Loading your requests...'));
	try {
		const result = await apiRequest(`${API_BASE_URL}/api/requests`);
		renderRequests(Array.isArray(result.data) ? result.data : [], currentUserId);
	} catch (error) {
		requestCount.textContent = 'Unavailable';
		requestsList.replaceChildren(createTextElement('p', 'empty-state', error.message));
		showNotice(error.message, true);
	}
}

async function deleteRequest(id, skillName) {
	if (!window.confirm(`Cancel your pending request to learn ${skillName}?`)) return;
	try {
		const result = await apiRequest(`${API_BASE_URL}/api/requests/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		});
		showNotice(result.message || 'Request cancelled.');
		await initializeRequests();
	} catch (error) {
		showNotice(error.message, true);
	}
}

async function initializeRequests() {
	if (!readToken()) {
		requestCount.textContent = 'Sign in required';
		requestsList.replaceChildren(createTextElement('p', 'empty-state', 'Log in to see requests associated with your account.'));
		const link = document.createElement('a');
		link.href = 'login.html';
		link.textContent = 'Log in';
		requestsList.append(link);
		return;
	}
	try {
		const profile = await apiRequest(`${API_BASE_URL}/api/auth/me`);
		if (!profile.data?._id) throw new Error('Your profile could not be loaded. Please log in again.');
		await loadRequests(profile.data._id);
	} catch (error) {
		requestCount.textContent = 'Unavailable';
		requestsList.replaceChildren(createTextElement('p', 'empty-state', error.message));
		showNotice(error.message, true);
	}
}

initializeRequests();
