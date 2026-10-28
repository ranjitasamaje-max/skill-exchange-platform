const API_BASE_URL = window.SkillExchangeConfig.apiBaseUrl;
const TOKEN_STORAGE_KEY = 'skillExchangeToken';

const dashboardNotice = document.getElementById('dashboard-notice');
const logoutButton = document.getElementById('logout-button');

let token = '';
let currentUser = null;

function readToken() {
	try {
		return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
	} catch (_error) {
		return '';
	}
}

function clearToken() {
	try {
		window.localStorage.removeItem(TOKEN_STORAGE_KEY);
	} catch (_error) {
		// Navigation still clears the current browser session if storage is unavailable.
	}
}

function createTextElement(tagName, className, text) {
	const element = document.createElement(tagName);
	element.className = className;
	element.textContent = text;
	return element;
}

function showNotice(message, isError = false) {
	dashboardNotice.textContent = message;
	dashboardNotice.classList.toggle('notice--error', isError);
	dashboardNotice.hidden = false;
}

async function apiRequest(path, options = {}) {
	let response;
	try {
		response = await fetch(`${API_BASE_URL}${path}`, {
			...options,
			headers: {
				...(options.body ? { 'Content-Type': 'application/json' } : {}),
				Authorization: `Bearer ${token}`,
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

function handleUnauthorized(error) {
	if (error.status === 401) {
		clearToken();
		window.location.replace('login.html');
		return true;
	}
	return false;
}

function renderSkillList(elementId, skills, emptyMessage) {
	const container = document.getElementById(elementId);
	container.replaceChildren();
	const names = Array.isArray(skills) ? skills.filter((skill) => typeof skill === 'string' && skill.trim()) : [];
	if (!names.length) {
		container.append(createTextElement('p', 'dashboard-empty-copy', emptyMessage));
		if (elementId === 'skills-to-teach') {
			const link = createTextElement('a', 'button button--primary', 'Add a New Skill');
			link.href = 'skills.html';
			container.append(link);
		}
		return;
	}
	names.forEach((name) => {
		container.append(createTextElement('span', 'dashboard-skill-chip', name));
	});
}

function renderRequests(containerId, countId, requests, type) {
	const container = document.getElementById(containerId);
	const count = document.getElementById(countId);
	count.textContent = `${requests.length} ${requests.length === 1 ? 'request' : 'requests'}`;
	container.replaceChildren();
	if (!requests.length) {
		const text =
			type === 'incoming'
				? 'No one has sent you an exchange request yet.'
				: 'You have no outgoing requests.';
		container.append(createTextElement('p', 'empty-state', text));
		return;
	}

	const renderRequestCard = (request) => {
		const card = document.createElement('article');
		card.className = 'dashboard-record-card';
		const details = document.createElement('div');
		details.className = 'dashboard-record-details';
		const otherPerson = type === 'incoming'
			? request.senderName || 'A member'
			: request.receiverName || 'A member';
		const requested = request.requestedSkillName || request.skillRequested || 'a skill';
		const offered = request.offeredSkillName;
		details.append(createTextElement(
			'h3',
			'',
			type === 'incoming'
				? `${otherPerson} wants to learn ${requested}`
				: offered
					? `${otherPerson} will teach`
					: `You requested ${requested} from ${otherPerson}`
		));
		details.append(
			createTextElement(
				'p',
				'',
				offered
					? `${offered} ↔ ${requested}`
					: `${type === 'incoming' ? 'They want to learn' : 'You want to learn'} ${requested} with no skill offered in return.`
			)
		);
		details.append(
			createTextElement(
				'span',
				`dashboard-status dashboard-status--${request.status || 'pending'}`,
				request.status || 'pending'
			)
		);
		if (type === 'incoming' && request.message) {
			details.append(createTextElement('p', 'dashboard-request-message', request.message));
		}
		card.append(details);

		if (request.status === 'pending') {
			const actions = document.createElement('div');
			actions.className = 'dashboard-actions';
			if (type === 'incoming') {
				const acceptButton = createTextElement('button', 'button button--primary', 'Accept');
				acceptButton.type = 'button';
				acceptButton.addEventListener('click', () => resolveRequest(request._id, 'accept', acceptButton));
				const rejectButton = createTextElement('button', 'button button--quiet button--danger', 'Reject');
				rejectButton.type = 'button';
				rejectButton.addEventListener('click', () => resolveRequest(request._id, 'reject', rejectButton));
				actions.append(acceptButton, rejectButton);
			} else {
				const cancelButton = createTextElement('button', 'button button--quiet button--danger', 'Cancel request');
				cancelButton.type = 'button';
				cancelButton.addEventListener('click', () => cancelRequest(request._id, cancelButton));
				actions.append(cancelButton);
			}
			card.append(actions);
		}
		return card;
	};

	if (type === 'outgoing') {
		for (const status of ['pending', 'accepted', 'rejected', 'cancelled']) {
			const groupRequests = requests.filter((request) => request.status === status);
			const group = document.createElement('section');
			group.className = 'dashboard-request-group';
			group.append(createTextElement(
				'h3',
				'dashboard-request-group-title',
				`${status.charAt(0).toUpperCase()}${status.slice(1)} (${groupRequests.length})`
			));
			if (groupRequests.length) {
				groupRequests.forEach((request) => group.append(renderRequestCard(request)));
			} else {
				group.append(createTextElement('p', 'dashboard-empty-copy', `No ${status} requests.`));
			}
			container.append(group);
		}
	} else {
		requests.forEach((request) => container.append(renderRequestCard(request)));
	}
}

function renderLearningSkills(exchanges) {
	const container = document.getElementById('learning-skills');
	container.replaceChildren();
	const learningExchanges = exchanges.filter((exchange) => {
		const senderIsCurrent = String(getId(exchange.sender)) === String(currentUser._id);
		return senderIsCurrent || Boolean(exchange.offeredSkill);
	});
	if (!learningExchanges.length) {
		container.append(createTextElement(
			'p',
			'empty-state',
			'Accepted learning exchanges will appear here.'
		));
		return;
	}

	learningExchanges.forEach((exchange) => {
		const senderIsCurrent = String(getId(exchange.sender)) === String(currentUser._id);
		const skill = senderIsCurrent ? exchange.requestedSkill : exchange.offeredSkill;
		const partner = senderIsCurrent ? exchange.receiver : exchange.sender;
		const card = document.createElement('article');
		card.className = 'dashboard-record-card';
		const details = document.createElement('div');
		details.className = 'dashboard-record-details';
		details.append(createTextElement('h3', '', displaySkill(skill)));
		details.append(createTextElement('p', '', `Learning from ${displayName(partner)}`));
		details.append(createTextElement(
			'span',
			`dashboard-status dashboard-status--${exchange.status}`,
			exchange.status
		));
		card.append(details);
		container.append(card);
	});
}

async function cancelRequest(requestId, button) {
	button.disabled = true;
	button.textContent = 'Cancelling...';
	try {
		const result = await apiRequest(`/api/requests/${encodeURIComponent(requestId)}`, {
			method: 'DELETE',
		});
		showNotice(result.message || 'Request cancelled.');
		await refreshDashboardData();
	} catch (error) {
		if (handleUnauthorized(error)) return;
		showNotice(error.message, true);
		button.disabled = false;
		button.textContent = 'Cancel request';
	}
}

async function resolveRequest(requestId, decision, button) {
	const actions = button.closest('.dashboard-actions');
	actions.querySelectorAll('button').forEach((control) => {
		control.disabled = true;
	});
	button.textContent = decision === 'accept' ? 'Accepting...' : 'Rejecting...';
	try {
		const result = await apiRequest(`/api/requests/${encodeURIComponent(requestId)}/${decision}`, {
			method: 'POST',
			body: JSON.stringify({}),
		});
		showNotice(result.message || `Request ${decision}ed successfully.`);
		await refreshDashboardData();
	} catch (error) {
		if (handleUnauthorized(error)) return;
		showNotice(error.message, true);
		actions.querySelectorAll('button').forEach((control) => {
			control.disabled = false;
		});
		button.textContent = decision === 'accept' ? 'Accept' : 'Reject';
	}
}

function getId(value) {
	return value && typeof value === 'object' ? value._id : value;
}

function displayName(value) {
	return value && typeof value === 'object' ? value.name || 'A member' : 'A member';
}

function displaySkill(value) {
	return value && typeof value === 'object' ? value.skillName || 'a skill' : 'a skill';
}

function formatDate(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? 'Date unavailable'
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function getDuration(value) {
	const start = new Date(value);
	if (Number.isNaN(start.getTime())) return 'Duration unavailable';
	const elapsedMilliseconds = Math.max(0, Date.now() - start.getTime());
	const totalDays = Math.floor(elapsedMilliseconds / 86400000);
	const years = Math.floor(totalDays / 365);
	const months = Math.floor((totalDays % 365) / 30);
	const days = totalDays - years * 365 - months * 30;
	const parts = [];
	if (years) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
	if (months) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
	if (!years && !months) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
	else if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
	return parts.join(', ');
}

function renderProgress(exchange, direction, currentId) {
	const ownDirection = direction === 'sender' ? 'sender' : 'receiver';
	const progress = exchange.progress || {};
	if (!exchange.offeredSkill) {
		const learnerPercentage = Number(progress.senderLearningPercentage) || 0;
		const learnerName = displayName(exchange.sender);
		const section = document.createElement('div');
		section.className = 'dashboard-progress';
		section.append(
			createTextElement('p', '', `${learnerName}'s learning progress: ${learnerPercentage}%`)
		);
		const bar = document.createElement('progress');
		bar.max = 100;
		bar.value = learnerPercentage;
		bar.setAttribute('aria-label', `${learnerName}'s learning progress ${learnerPercentage}%`);
		section.append(bar);
		const updates = Array.isArray(progress.updates) ? progress.updates.slice(-3).reverse() : [];
		if (updates.length) {
			const milestones = document.createElement('ul');
			milestones.className = 'dashboard-milestones';
			updates.forEach((update) => {
				milestones.append(
					createTextElement(
						'li',
						'',
						update.note?.trim() || `${learnerName} reached ${update.percentage || 0}%`
					)
				);
			});
			section.append(milestones);
		}
		return section;
	}
	const ownField =
		ownDirection === 'sender' ? 'senderLearningPercentage' : 'receiverLearningPercentage';
	const otherField =
		ownDirection === 'sender' ? 'receiverLearningPercentage' : 'senderLearningPercentage';
	const ownPercentage = Number(progress[ownField]) || 0;
	const otherPercentage = Number(progress[otherField]) || 0;
	const section = document.createElement('div');
	section.className = 'dashboard-progress';
	section.append(createTextElement('p', '', `Your learning progress: ${ownPercentage}%`));
	const ownBar = document.createElement('progress');
	ownBar.max = 100;
	ownBar.value = ownPercentage;
	ownBar.setAttribute('aria-label', `Your learning progress ${ownPercentage}%`);
	section.append(ownBar);
	const otherName =
		String(getId(exchange.sender)) === String(currentId)
			? displayName(exchange.receiver)
			: displayName(exchange.sender);
	section.append(
		createTextElement('p', 'dashboard-other-progress', `${otherName}'s progress: ${otherPercentage}%`)
	);
	const otherBar = document.createElement('progress');
	otherBar.max = 100;
	otherBar.value = otherPercentage;
	otherBar.setAttribute('aria-label', `${otherName}'s learning progress ${otherPercentage}%`);
	section.append(otherBar);

	const updates = Array.isArray(progress.updates) ? progress.updates.slice(-3).reverse() : [];
	if (updates.length) {
		const milestones = document.createElement('ul');
		milestones.className = 'dashboard-milestones';
		updates.forEach((update) => {
			const label = update.note?.trim()
				? `${displayName(update.updatedBy) === 'A member' ? (update.direction === 'sender' ? 'Sender' : 'Receiver') : displayName(update.updatedBy)}: ${update.note}`
				: `${update.direction === 'sender' ? 'Sender' : 'Receiver'} reached ${update.percentage || 0}%`;
			milestones.append(createTextElement('li', '', label));
		});
		section.append(milestones);
	} else {
		section.append(createTextElement('p', 'dashboard-empty-copy', 'No progress updates yet.'));
	}
	return section;
}

function renderExchanges(containerId, countId, exchanges, isActive) {
	const container = document.getElementById(containerId);
	const count = document.getElementById(countId);
	count.textContent = `${exchanges.length} ${exchanges.length === 1 ? 'exchange' : 'exchanges'}`;
	container.replaceChildren();
	if (!exchanges.length) {
		container.append(
			createTextElement(
				'p',
				'empty-state',
				isActive ? 'No active learning exchanges yet.' : 'No completed exchanges yet.'
			)
		);
		return;
	}

	exchanges.forEach((exchange) => {
		const senderIsCurrent = String(getId(exchange.sender)) === String(currentUser._id);
		const oneWay = !exchange.offeredSkill;
		const learnedSkill = senderIsCurrent ? exchange.requestedSkill : exchange.offeredSkill;
		const teacher = senderIsCurrent ? exchange.receiver : exchange.sender;
		const taughtSkill = oneWay ? exchange.requestedSkill : senderIsCurrent ? exchange.offeredSkill : exchange.requestedSkill;
		const learner = oneWay ? exchange.sender : senderIsCurrent ? exchange.receiver : exchange.sender;
		const direction = senderIsCurrent ? 'sender' : 'receiver';
		const card = document.createElement('article');
		card.className = 'dashboard-exchange-card';

		const heading = document.createElement('div');
		heading.className = 'dashboard-exchange-heading';
		const title = document.createElement('h3');
		title.textContent = oneWay
			? senderIsCurrent
				? `Learning ${displaySkill(learnedSkill)} from ${displayName(teacher)}`
				: `Teaching ${displaySkill(taughtSkill)} to ${displayName(learner)}`
			: `Learning ${displaySkill(learnedSkill)} from ${displayName(teacher)}`;
		heading.append(title);
		heading.append(
			createTextElement(
				'span',
				`dashboard-status dashboard-status--${exchange.status}`,
				exchange.status
			)
		);
		card.append(heading);
		card.append(
			createTextElement(
				'p',
				'dashboard-exchange-return',
				oneWay
					? senderIsCurrent
						? `This is a one-way learning request. You are learning ${displaySkill(learnedSkill)} from ${displayName(teacher)}.`
						: `This is a one-way learning request. You are teaching ${displaySkill(taughtSkill)} to ${displayName(learner)}.`
					: `You are teaching ${displaySkill(taughtSkill)} to ${displayName(learner)} in return.`
			)
		);

		const dates = document.createElement('div');
		dates.className = 'dashboard-exchange-dates';
		dates.append(createTextElement('span', '', `Started ${formatDate(exchange.startDate)}`));
		dates.append(createTextElement('span', '', getDuration(exchange.startDate)));
		card.append(dates);

		if (isActive) {
			card.append(renderProgress(exchange, direction, currentUser._id));
			if (!oneWay || senderIsCurrent) {
				const updateForm = document.createElement('form');
			updateForm.className = 'dashboard-progress-form';
			const percentageLabel = createTextElement('label', '', 'Update your progress');
			const percentageInput = document.createElement('input');
			percentageInput.name = 'percentage';
			percentageInput.type = 'number';
			percentageInput.min = '0';
			percentageInput.max = '100';
			percentageInput.step = '1';
			percentageInput.placeholder = '0-100';
			percentageLabel.append(percentageInput);
			const noteLabel = createTextElement('label', '', 'Milestone note');
			const noteInput = document.createElement('input');
			noteInput.name = 'note';
			noteInput.type = 'text';
			noteInput.maxLength = 1000;
			noteInput.placeholder = 'What have you practiced?';
			noteLabel.append(noteInput);
			const saveButton = createTextElement(
				'button',
				'button button--secondary',
				'Save progress'
			);
			saveButton.type = 'submit';
			updateForm.append(percentageLabel, noteLabel, saveButton);
			updateForm.addEventListener('submit', (event) => {
				event.preventDefault();
				void updateExchangeProgress(exchange._id, direction, updateForm);
			});
			card.append(updateForm);
			}

			const completeButton = createTextElement('button', 'button button--quiet', 'Mark completed');
			completeButton.type = 'button';
			completeButton.addEventListener('click', () =>
				completeExchange(exchange._id, completeButton)
			);
			card.append(completeButton);
		} else {
			card.append(
				createTextElement(
					'p',
					'dashboard-completed-date',
					`Completed ${formatDate(exchange.completedAt || exchange.updatedAt)}`
				)
			);
		}
		container.append(card);
	});
}

async function updateExchangeProgress(exchangeId, direction, form) {
	const percentageValue = form.elements.percentage.value;
	const note = form.elements.note.value.trim();
	if (!percentageValue && !note) {
		showNotice('Enter a progress percentage, a milestone note, or both.', true);
		return;
	}
	const payload = { direction };
	if (percentageValue) payload.percentage = Number(percentageValue);
	if (note) payload.note = note;
	const button = form.querySelector('button[type="submit"]');
	button.disabled = true;
	button.textContent = 'Saving...';
	try {
		const result = await apiRequest(
			`/api/exchanges/${encodeURIComponent(exchangeId)}/progress`,
			{ method: 'PATCH', body: JSON.stringify(payload) }
		);
		showNotice(result.message || 'Learning progress updated.');
		await refreshDashboardData();
	} catch (error) {
		if (handleUnauthorized(error)) return;
		showNotice(error.message, true);
		button.disabled = false;
		button.textContent = 'Save progress';
	}
}

async function completeExchange(exchangeId, button) {
	button.disabled = true;
	button.textContent = 'Completing...';
	try {
		const result = await apiRequest(
			`/api/exchanges/${encodeURIComponent(exchangeId)}/complete`,
			{ method: 'PATCH', body: JSON.stringify({}) }
		);
		showNotice(result.message || 'Learning exchange completed.');
		await refreshDashboardData();
	} catch (error) {
		if (handleUnauthorized(error)) return;
		showNotice(error.message, true);
		button.disabled = false;
		button.textContent = 'Mark completed';
	}
}

async function refreshDashboardData() {
	const results = await Promise.allSettled([
		apiRequest('/api/requests/incoming?status=pending'),
		apiRequest('/api/requests/outgoing'),
		apiRequest('/api/exchanges/active'),
		apiRequest('/api/exchanges?status=completed'),
	]);
	const bindings = [
		{ index: 0, container: 'incoming-requests', count: 'incoming-count', type: 'incoming' },
		{ index: 1, container: 'outgoing-requests', count: 'outgoing-count', type: 'outgoing' },
	];
	for (const binding of bindings) {
		const result = results[binding.index];
		if (result.status === 'fulfilled') {
			renderRequests(binding.container, binding.count, result.value.data || [], binding.type);
		} else {
			if (handleUnauthorized(result.reason)) return;
			document.getElementById(binding.count).textContent = 'Unavailable';
			document.getElementById(binding.container).replaceChildren(
				createTextElement('p', 'empty-state', result.reason.message)
			);
		}
	}

	const activeResult = results[2];
	let activeExchanges = [];
	if (activeResult.status === 'fulfilled') {
		activeExchanges = Array.isArray(activeResult.value.data) ? activeResult.value.data : [];
		renderExchanges('active-exchanges', 'active-count', activeExchanges, true);
	} else {
		if (handleUnauthorized(activeResult.reason)) return;
		document.getElementById('active-count').textContent = 'Unavailable';
		document.getElementById('active-exchanges').replaceChildren(
			createTextElement('p', 'empty-state', activeResult.reason.message)
		);
	}

	const completedResult = results[3];
	let completedExchanges = [];
	if (completedResult.status === 'fulfilled') {
		completedExchanges = Array.isArray(completedResult.value.data)
			? completedResult.value.data
			: [];
		renderExchanges(
			'completed-exchanges',
			'completed-count',
			completedExchanges,
			false
		);
	} else {
		if (handleUnauthorized(completedResult.reason)) return;
		document.getElementById('completed-count').textContent = 'Unavailable';
		document.getElementById('completed-exchanges').replaceChildren(
			createTextElement('p', 'empty-state', completedResult.reason.message)
		);
	}
	renderLearningSkills([...activeExchanges, ...completedExchanges]);
}

async function initializeDashboard() {
	token = readToken();
	if (!token) {
		window.location.replace('login.html');
		return;
	}
	try {
		const result = await apiRequest('/api/auth/me');
		currentUser = result.data;
		if (!currentUser?._id) {
			throw new Error('Your profile could not be loaded. Please log in again.');
		}
		let ownedSkills = [];
		try {
			const skillsResult = await apiRequest('/api/skills');
			ownedSkills = Array.isArray(skillsResult.data)
				? skillsResult.data
						.filter((skill) => String(getId(skill.owner) || getId(skill.userId)) === String(currentUser._id))
						.map((skill) => skill.skillName)
						.filter((name) => typeof name === 'string' && name.trim())
				: [];
		} catch (error) {
			if (handleUnauthorized(error)) return;
			showNotice(`Your teachable skill records could not be loaded: ${error.message}`, true);
		}
		document.getElementById('welcome-title').replaceChildren(
			document.createTextNode(`Welcome, ${currentUser.name || 'member'}`),
			createTextElement('span', 'title-period', '.')
		);
		document.getElementById('dashboard-subtitle').textContent =
			currentUser.location || 'Here is your personal skill exchange activity.';
		renderSkillList(
			'skills-to-teach',
			ownedSkills,
			'You have not added skills you can teach yet.'
		);
		await refreshDashboardData();
	} catch (error) {
		if (handleUnauthorized(error)) return;
		showNotice(error.message, true);
		document.getElementById('dashboard-subtitle').textContent =
			'Your dashboard data could not be loaded.';
	}
}

logoutButton.addEventListener('click', () => {
	clearToken();
	window.location.replace('login.html');
});

initializeDashboard();
