const API_BASE_URL = window.SkillExchangeConfig.apiBaseUrl;
const TOKEN_STORAGE_KEY = 'skillExchangeToken';

const skillForm = document.getElementById('skill-form');
const skillsList = document.getElementById('skills-list');
const skillCount = document.getElementById('skill-count');
const skillNotice = document.getElementById('skill-notice');
const skillAuthHint = document.getElementById('skill-auth-hint');
const editDialog = document.getElementById('edit-skill-dialog');
const editSkillForm = document.getElementById('edit-skill-form');
const editSkillNotice = document.getElementById('edit-skill-notice');
const exchangeDialog = document.getElementById('exchange-dialog');
const exchangeForm = document.getElementById('exchange-form');
const exchangeNotice = document.getElementById('exchange-notice');
const exchangeSummary = document.getElementById('exchange-summary');
const requestedSkillInput = document.getElementById('requested-skill-id');
const offeredSkillSelect = document.getElementById('offered-skill-id');
const exchangeLoginHint = document.getElementById('exchange-login-hint');
const exchangeSubmitButton = document.getElementById('send-exchange-request');
const skillSearchInput = document.getElementById('skill-search-input');

let availableSkills = [];
let ownSkills = [];
let currentUser = null;
let token = '';
let currentSearch = '';
let skillLoadVersion = 0;
let searchTimer;

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
				...(token ? { Authorization: `Bearer ${token}` } : {}),
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

function createTextElement(tagName, className, text) {
	const element = document.createElement(tagName);
	element.className = className;
	element.textContent = text;
	return element;
}

function showNotice(element, message, isError = false) {
	element.textContent = message;
	element.classList.toggle('notice--error', isError);
	element.hidden = false;
}

function addLoginLink(container, message) {
	container.replaceChildren(document.createTextNode(`${message} `));
	const link = document.createElement('a');
	link.href = 'login.html';
	link.textContent = 'Log in';
	container.append(link, document.createTextNode('.'));
	container.hidden = false;
}

function setSkillEntryAuthState() {
	const submitButton = skillForm.querySelector('button[type="submit"]');
	submitButton.disabled = !token || !currentUser;
	skillAuthHint.hidden = Boolean(token && currentUser);
}

function getOwnerId(skill) {
	return skill.owner?._id || skill.userId?._id || skill.userId || '';
}

function populateOfferedSkills(selectedId = '') {
	offeredSkillSelect.replaceChildren(new Option('Skip — request one-way learning', ''));
	ownSkills.forEach((skill) => {
		const option = new Option(skill.skillName, skill._id);
		option.selected = skill._id === selectedId;
		offeredSkillSelect.add(option);
	});
}

function renderSkills(skills) {
	skillCount.textContent = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
	skillsList.replaceChildren();

	if (!skills.length) {
		skillsList.append(
			createTextElement(
				'p',
				'empty-state',
				currentSearch
					? 'No skills or teachers match your search. Try another name.'
					: 'No available skills yet. Add a skill to start sharing.'
			)
		);
		return;
	}

	skills.forEach((skill) => {
		const card = document.createElement('article');
		card.className = 'record-card skill-record-card';

		const main = document.createElement('div');
		main.className = 'record-main';
		main.append(
			createTextElement('span', 'avatar', (skill.skillName || '?').trim().charAt(0))
		);

		const copy = document.createElement('div');
		copy.className = 'record-copy';
		copy.append(createTextElement('h3', '', skill.skillName || 'Unnamed skill'));
		copy.append(
			createTextElement('p', '', skill.description || 'No description provided.')
		);
		const owner = skill.owner;
		if (owner?.name) {
			copy.append(createTextElement('span', 'record-tag', `Taught by ${owner.name}`));
		} else {
			copy.append(createTextElement('span', 'record-tag', 'Teacher details unavailable'));
		}
		if (owner?.location) {
			copy.append(createTextElement('span', 'record-tag', owner.location));
		}
		main.append(copy);

		const actions = document.createElement('div');
		actions.className = 'record-actions';
		const isOwnSkill =
			currentUser && String(getOwnerId(skill)) === String(currentUser._id);
		if (isOwnSkill) {
			actions.append(createTextElement('span', 'skill-owner-label', 'Your skill'));
			const editButton = createTextElement('button', 'button button--quiet', 'Edit');
			editButton.type = 'button';
			editButton.setAttribute('aria-label', `Edit ${skill.skillName || 'skill'}`);
			editButton.addEventListener('click', () => openEditDialog(skill));
			const deleteButton = createTextElement(
				'button',
				'button button--quiet button--danger',
				'Delete'
			);
			deleteButton.type = 'button';
			deleteButton.setAttribute('aria-label', `Delete ${skill.skillName || 'skill'}`);
			deleteButton.addEventListener('click', () => deleteSkill(skill._id, skill.skillName));
			actions.append(editButton, deleteButton);
		} else {
			const requestButton = createTextElement(
				'button',
				'button button--primary exchange-request-button',
				'Request to Learn'
			);
			requestButton.type = 'button';
			requestButton.addEventListener('click', () => openExchangeDialog(skill));
			actions.append(requestButton);
		}

		card.append(main, actions);
		skillsList.append(card);
	});
}

async function loadSkills(search = currentSearch) {
	currentSearch = search.trim();
	const loadVersion = ++skillLoadVersion;
	skillCount.textContent = 'Loading';
	skillsList.replaceChildren(createTextElement('p', 'empty-state', 'Loading available skills...'));

	try {
		const searchQuery = currentSearch
			? `?${new URLSearchParams({ search: currentSearch }).toString()}`
			: '';
		const [availableResult, ownResult] = await Promise.all([
			apiRequest(`${API_BASE_URL}/api/skills/available${searchQuery}`),
			apiRequest(`${API_BASE_URL}/api/skills`),
		]);
		if (loadVersion !== skillLoadVersion) return;
		availableSkills = Array.isArray(availableResult.data) ? availableResult.data : [];
		const allSkills = Array.isArray(ownResult.data) ? ownResult.data : [];
		ownSkills = currentUser
			? allSkills.filter(
					(skill) => String(getOwnerId(skill)) === String(currentUser._id)
				)
			: [];
		populateOfferedSkills();
		renderSkills(availableSkills);
	} catch (error) {
		if (loadVersion !== skillLoadVersion) return;
		skillCount.textContent = 'Unavailable';
		skillsList.replaceChildren(createTextElement('p', 'empty-state', error.message));
		showNotice(skillNotice, error.message, true);
	}
}

function openExchangeDialog(skill) {
	if (!token || !currentUser) {
		const returnTo = `skills.html?requestSkill=${encodeURIComponent(skill._id)}`;
		window.location.assign(`login.html?returnTo=${encodeURIComponent(returnTo)}`);
		return;
	}
	exchangeForm.reset();
	exchangeNotice.hidden = true;
	exchangeNotice.classList.remove('notice--error');
	requestedSkillInput.value = skill._id;
	exchangeSummary.textContent = `Request to learn ${skill.skillName} from ${skill.owner?.name || 'this teacher'}. You can offer a skill in return or skip to request one-way learning.`;
	populateOfferedSkills();

	if (!token || !currentUser) {
		offeredSkillSelect.disabled = true;
		exchangeSubmitButton.disabled = true;
		addLoginLink(exchangeLoginHint, 'You need to be logged in to send a learning request.');
	} else {
		offeredSkillSelect.disabled = false;
		exchangeSubmitButton.disabled = false;
		exchangeLoginHint.hidden = true;
	}
	exchangeDialog.showModal();
}

function openEditDialog(skill) {
	editSkillForm.elements.id.value = skill._id;
	editSkillForm.elements.skillName.value = skill.skillName || '';
	editSkillForm.elements.description.value = skill.description || '';
	editSkillNotice.hidden = true;
	editSkillNotice.classList.remove('notice--error');
	editDialog.showModal();
}

async function deleteSkill(id, name) {
	if (!window.confirm(`Delete ${name || 'this skill'}?`)) return;
	try {
		const result = await apiRequest(`${API_BASE_URL}/api/skills/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		});
		await loadSkills();
		showNotice(skillNotice, result.message || 'Skill deleted successfully.');
	} catch (error) {
		showNotice(skillNotice, error.message, true);
	}
}

skillForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!token || !currentUser) {
		addLoginLink(skillAuthHint, 'Log in before adding a skill.');
		return;
	}
	if (!skillForm.reportValidity()) return;
	const formData = new FormData(skillForm);
	const skill = {
		skillName: formData.get('skillName').trim(),
		description: formData.get('description').trim(),
	};
	const submitButton = skillForm.querySelector('button[type="submit"]');
	submitButton.disabled = true;

	try {
		const result = await apiRequest(`${API_BASE_URL}/api/skills`, {
			method: 'POST',
			body: JSON.stringify(skill),
		});
		skillForm.reset();
		await loadSkills();
		showNotice(skillNotice, result.message || 'Skill added successfully.');
	} catch (error) {
		showNotice(skillNotice, error.message, true);
	} finally {
		submitButton.disabled = false;
	}
});

editSkillForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!editSkillForm.reportValidity()) return;
	const formData = new FormData(editSkillForm);
	const skill = {
		skillName: formData.get('skillName').trim(),
		description: formData.get('description').trim(),
	};
	const id = formData.get('id');

	try {
		const result = await apiRequest(`${API_BASE_URL}/api/skills/${encodeURIComponent(id)}`, {
			method: 'PUT',
			body: JSON.stringify(skill),
		});
		editDialog.close();
		await loadSkills();
		showNotice(skillNotice, result.message || 'Skill updated successfully.');
	} catch (error) {
		showNotice(editSkillNotice, error.message, true);
	}
});

exchangeForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!token || !currentUser) {
		addLoginLink(exchangeLoginHint, 'You need to be logged in to send an exchange request.');
		return;
	}
	if (!exchangeForm.reportValidity()) return;

	const offeredSkill = offeredSkillSelect.value;
	const requestedSkill = requestedSkillInput.value;
	const ownSkill = offeredSkill ? ownSkills.find((skill) => skill._id === offeredSkill) : null;
	const requestedSkillRecord = availableSkills.find((skill) => skill._id === requestedSkill);
	if (offeredSkill && (!ownSkill || String(getOwnerId(ownSkill)) !== String(currentUser._id))) {
		showNotice(exchangeNotice, 'Choose a skill owned by your account.', true);
		return;
	}
	if (
		!requestedSkillRecord ||
		String(getOwnerId(requestedSkillRecord)) === String(currentUser._id)
	) {
		showNotice(exchangeNotice, 'You can only request a skill from another member.', true);
		return;
	}

	exchangeSubmitButton.disabled = true;
	exchangeSubmitButton.textContent = 'Sending request...';
	try {
		await apiRequest(`${API_BASE_URL}/api/requests`, {
			method: 'POST',
			body: JSON.stringify({
				receiver: getOwnerId(requestedSkillRecord),
				...(offeredSkill ? { offeredSkill } : {}),
				requestedSkill,
				message: exchangeForm.elements.message.value.trim(),
			}),
		});
		showNotice(
			exchangeNotice,
			'Request sent. It will stay pending until the teacher accepts; it is not an active exchange yet.'
		);
		exchangeForm.reset();
		exchangeSubmitButton.disabled = true;
		window.setTimeout(() => exchangeDialog.close(), 1800);
	} catch (error) {
		showNotice(exchangeNotice, error.message, true);
		if (error.status === 401) {
			token = '';
			currentUser = null;
			try {
				window.localStorage.removeItem(TOKEN_STORAGE_KEY);
			} catch (_error) {
				// Storage may be unavailable; the current page still treats this session as logged out.
			}
			const returnTo = `skills.html?requestSkill=${encodeURIComponent(requestedSkill)}`;
			window.location.assign(`login.html?returnTo=${encodeURIComponent(returnTo)}`);
		} else {
			exchangeSubmitButton.disabled = false;
			exchangeSubmitButton.innerHTML = 'Send learning request <span aria-hidden="true">↗</span>';
		}
	}
});

document.getElementById('close-edit-dialog').addEventListener('click', () => editDialog.close());
document.getElementById('cancel-edit-dialog').addEventListener('click', () => editDialog.close());
document.getElementById('close-exchange-dialog').addEventListener('click', () => exchangeDialog.close());
document.getElementById('cancel-exchange-dialog').addEventListener('click', () => exchangeDialog.close());
skillSearchInput.addEventListener('input', () => {
	window.clearTimeout(searchTimer);
	searchTimer = window.setTimeout(() => loadSkills(skillSearchInput.value), 250);
});

async function initializeSkillsPage() {
	token = readToken();
	const addSkillButton = skillForm.querySelector('button[type="submit"]');
	addSkillButton.disabled = true;
	if (token) {
		try {
			const result = await apiRequest(`${API_BASE_URL}/api/auth/me`);
			currentUser = result.data || null;
		} catch (error) {
			currentUser = null;
			token = '';
			if (error.status === 401) {
				try {
					window.localStorage.removeItem(TOKEN_STORAGE_KEY);
				} catch (_storageError) {
					// The public skill directory still works without browser storage.
				}
			} else {
				showNotice(skillNotice, error.message, true);
			}
		}
	}
	setSkillEntryAuthState();
	await loadSkills();
	const requestedSkillId = new URLSearchParams(window.location.search).get('requestSkill');
	if (requestedSkillId) {
		const requestedSkill = availableSkills.find((skill) => skill._id === requestedSkillId);
		if (requestedSkill) openExchangeDialog(requestedSkill);
		else showNotice(skillNotice, 'That skill is no longer available. Choose another skill to request.', true);
	}
}

initializeSkillsPage();
