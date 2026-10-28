const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const LearningExchange = require('../models/LearningExchange');
const Request = require('../models/Request');
const Skill = require('../models/Skill');
const User = require('../models/User');
const { createRequest, deleteRequest } = require('../controllers/requestController');

const ids = {
	sender: '64b000000000000000000001',
	receiver: '64b000000000000000000002',
	offeredSkill: '64b000000000000000000003',
	requestedSkill: '64b000000000000000000004',
};

function installModelMocks({ existingRequest = null, existingExchange = null } = {}) {
	const originals = {
		userFindById: User.findById,
		skillFindById: Skill.findById,
		requestFindOne: Request.findOne,
		requestFindById: Request.findById,
		requestCreate: Request.create,
		exchangeFindOne: LearningExchange.findOne,
	};
	const created = [];
	const users = new Map([
		[ids.sender, { _id: new mongoose.Types.ObjectId(ids.sender), name: 'Requester' }],
		[ids.receiver, { _id: new mongoose.Types.ObjectId(ids.receiver), name: 'Teacher' }],
	]);
	const skills = new Map([
		[
			ids.offeredSkill,
			{
				_id: new mongoose.Types.ObjectId(ids.offeredSkill),
				userId: new mongoose.Types.ObjectId(ids.sender),
				skillName: 'Stitching',
			},
		],
		[
			ids.requestedSkill,
			{
				_id: new mongoose.Types.ObjectId(ids.requestedSkill),
				userId: new mongoose.Types.ObjectId(ids.receiver),
				skillName: 'Crafts',
			},
		],
	]);

	User.findById = async (id) => users.get(String(id)) || null;
	Skill.findById = async (id) => skills.get(String(id)) || null;
	Request.findOne = async () => existingRequest;
	Request.create = async (record) => {
		created.push(record);
		return { _id: new mongoose.Types.ObjectId(), status: 'pending', ...record };
	};
	LearningExchange.findOne = () => Promise.resolve(existingExchange);

	return {
		created,
		skills,
		restore() {
			User.findById = originals.userFindById;
			Skill.findById = originals.skillFindById;
			Request.findOne = originals.requestFindOne;
			Request.findById = originals.requestFindById;
			Request.create = originals.requestCreate;
			LearningExchange.findOne = originals.exchangeFindOne;
		},
	};
}

async function submitRequest(body, senderId = ids.sender) {
	const response = {
		statusCode: 0,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(result) {
			this.body = result;
			return this;
		},
	};
	await createRequest(
		{
			body,
			user: { _id: new mongoose.Types.ObjectId(senderId), name: 'Requester' },
		},
		response
	);
	return response;
}

test('creates a one-way learning request without an offered skill', async () => {
	const mocks = installModelMocks();
	try {
		const response = await submitRequest({
			receiver: ids.receiver,
			requestedSkill: ids.requestedSkill,
		});
		assert.equal(response.statusCode, 201);
		assert.equal(mocks.created.length, 1);
		assert.equal(mocks.created[0].offeredSkill, undefined);
		assert.equal(mocks.created[0].requestedSkillName, 'Crafts');
		assert.equal(response.body.data.status, 'pending');
	} finally {
		mocks.restore();
	}
});

test('creates a two-way request when the offered skill belongs to the sender', async () => {
	const mocks = installModelMocks();
	try {
		const response = await submitRequest({
			receiver: ids.receiver,
			offeredSkill: ids.offeredSkill,
			requestedSkill: ids.requestedSkill,
			message: 'I would love to learn.',
		});
		assert.equal(response.statusCode, 201);
		assert.equal(response.body.data.offeredSkillName, 'Stitching');
		assert.equal(response.body.data.requestedSkillName, 'Crafts');
		assert.equal(mocks.created[0].message, 'I would love to learn.');
	} finally {
		mocks.restore();
	}
});

test("cancels only the authenticated requester's pending request", async (t) => {
	const originalFindById = Request.findById;
	const request = {
		sender: new mongoose.Types.ObjectId(ids.sender),
		status: 'pending',
		async save() {
			return this;
		},
	};
	Request.findById = async () => request;
	const response = {
		statusCode: 0,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(result) {
			this.body = result;
			return this;
		},
	};
	try {
		await deleteRequest(
			{ params: { id: '64b000000000000000000005' }, user: { _id: request.sender } },
			response
		);
		assert.equal(response.statusCode, 200);
		assert.equal(request.status, 'cancelled');
		assert.match(response.body.message, /cancelled/i);
	} finally {
		Request.findById = originalFindById;
	}

	await t.test('rejects cancellation by a different account', async () => {
		const originalFindByIdForAccessTest = Request.findById;
		Request.findById = async () => ({
			sender: new mongoose.Types.ObjectId(ids.sender),
			status: 'pending',
		});
		const forbiddenResponse = {
			statusCode: 0,
			body: null,
			status(code) {
				this.statusCode = code;
				return this;
			},
			json(result) {
				this.body = result;
				return this;
			},
		};
		try {
			await deleteRequest(
				{
					params: { id: '64b000000000000000000005' },
					user: { _id: new mongoose.Types.ObjectId(ids.receiver) },
				},
				forbiddenResponse
			);
			assert.equal(forbiddenResponse.statusCode, 403);
		} finally {
			Request.findById = originalFindByIdForAccessTest;
		}
	});
});

test('rejects invalid ownership, self-requests, missing fields, and duplicate pending requests', async (t) => {
	await t.test('offered skill owned by someone else', async () => {
		const mocks = installModelMocks();
		try {
			const response = await submitRequest({
				receiver: ids.receiver,
				offeredSkill: ids.requestedSkill,
				requestedSkill: ids.requestedSkill,
			});
			assert.equal(response.statusCode, 400);
			assert.match(response.body.message, /offered skill must belong to the sender/i);
		} finally {
			mocks.restore();
		}
	});

	await t.test('self-request', async () => {
		const mocks = installModelMocks();
		try {
			const response = await submitRequest({
				receiver: ids.sender,
				requestedSkill: ids.requestedSkill,
			});
			assert.equal(response.statusCode, 400);
			assert.match(response.body.message, /different users/i);
		} finally {
			mocks.restore();
		}
	});

	await t.test('missing required skill', async () => {
		const mocks = installModelMocks();
		try {
			const response = await submitRequest({ receiver: ids.receiver });
			assert.equal(response.statusCode, 400);
			assert.match(response.body.message, /requestedskill/i);
		} finally {
			mocks.restore();
		}
	});

	await t.test('duplicate pending request', async () => {
		const mocks = installModelMocks({ existingRequest: { _id: 'existing' } });
		try {
			const response = await submitRequest({
				receiver: ids.receiver,
				requestedSkill: ids.requestedSkill,
			});
			assert.equal(response.statusCode, 409);
		} finally {
			mocks.restore();
		}
	});

	await t.test('duplicate active learning in the same direction', async () => {
		const mocks = installModelMocks({ existingExchange: { _id: 'active' } });
		try {
			const response = await submitRequest({
				receiver: ids.receiver,
				requestedSkill: ids.requestedSkill,
			});
			assert.equal(response.statusCode, 409);
		} finally {
			mocks.restore();
		}
	});
});
