const API_BASE_URL = window.SkillExchangeConfig.apiBaseUrl;

const usersList = document.getElementById('users-list');
const userCount = document.getElementById('user-count');
const userNotice = document.getElementById('user-notice');

async function apiRequest(url, options = {}) {
	let response;
	try {
		response = await fetch(url, {
			...options,
			headers: {
				...(options.body ? { 'Content-Type': 'application/json' } : {}),
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
	userNotice.textContent = message;
	userNotice.classList.toggle('notice--error', isError);
	userNotice.hidden = false;
}

function createTextElement(tagName, className, text) {
	const element = document.createElement(tagName);
	element.className = className;
	element.textContent = text;
	return element;
}

function renderUsers(users) {
	userCount.textContent = `${users.length} ${users.length === 1 ? 'member' : 'members'}`;
	usersList.replaceChildren();

	if (!users.length) {
		usersList.append(createTextElement('p', 'empty-state', 'No members yet.'));
		return;
	}

	users.forEach((user) => {
		const card = document.createElement('article');
		card.className = 'record-card';

		const main = document.createElement('div');
		main.className = 'record-main';
		const initials = (user.name || '?')
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.charAt(0))
			.join('');
		main.append(createTextElement('span', 'avatar', initials));

		const copy = document.createElement('div');
		copy.className = 'record-copy';
		copy.append(createTextElement('h3', '', user.name || 'Unnamed member'));
		if (user.location) {
			copy.append(createTextElement('span', 'record-tag', user.location));
		}
		main.append(copy);

		card.append(main);
		usersList.append(card);
	});
}

async function loadUsers() {
	userCount.textContent = 'Loading';
	usersList.replaceChildren(createTextElement('p', 'empty-state', 'Loading members...'));

	try {
		const result = await apiRequest(`${API_BASE_URL}/api/users`);
		renderUsers(Array.isArray(result.data) ? result.data : []);
	} catch (error) {
		userCount.textContent = 'Unavailable';
		usersList.replaceChildren(createTextElement('p', 'empty-state', error.message));
		showNotice(error.message, true);
	}
}

loadUsers();
