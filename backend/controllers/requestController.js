const mongoose = require('mongoose');
const LearningExchange = require('../models/LearningExchange');
const Request = require('../models/Request');
const Skill = require('../models/Skill');
const User = require('../models/User');
const { createHttpError, sendControllerError } = require('../utils/controllerErrors');

const getActiveExchangeKey = (sender, receiver, offeredSkill, requestedSkill) => {
	const participants = [
		{
			user: sender.toString(),
			skill: offeredSkill ? offeredSkill.toString() : `one-way:${requestedSkill.toString()}`,
		},
		{ user: receiver.toString(), skill: requestedSkill.toString() },
	].sort((left, right) => (left.user < right.user ? -1 : left.user > right.user ? 1 : 0));
	return participants.map(({ user, skill }) => `${user}:${skill}`).join('|');
};

const ensureNoActiveExchange = async (sender, receiver, offeredSkill, requestedSkill, session) => {
	const exactPair = offeredSkill
		? {
				$or: [
					{ sender, receiver, offeredSkill, requestedSkill },
					{
						sender: receiver,
						receiver: sender,
						offeredSkill: requestedSkill,
						requestedSkill: offeredSkill,
					},
				],
			}
		: { sender, receiver, requestedSkill };
	const duplicateFilters = [
		{ activeExchangeKey: getActiveExchangeKey(sender, receiver, offeredSkill, requestedSkill) },
		...(exactPair.$or || [exactPair]),
	];
	const query = LearningExchange.findOne({
		status: 'active',
		$or: duplicateFilters,
	});
	if (session) query.session(session);
	const activeExchange = await query;
	if (activeExchange) {
		throw createHttpError(409, 'An active learning exchange already exists for these skills');
	}
};

const createRequest = async (req, res) => {
	try {
		const { sender, receiver, offeredSkill, requestedSkill, message } = req.body || {};
		if (!receiver || !requestedSkill) {
			throw createHttpError(400, 'Receiver and requestedSkill are required');
		}
		if (message !== undefined && (typeof message !== 'string' || message.length > 1000)) {
			throw createHttpError(400, 'Message must be text no longer than 1000 characters');
		}
		const fields = { receiver, requestedSkill };
		if (offeredSkill) fields.offeredSkill = offeredSkill;
		for (const [field, value] of Object.entries(fields)) {
			if (!mongoose.isObjectIdOrHexString(value)) {
				throw createHttpError(400, `${field} must be a valid MongoDB ID`);
			}
		}
		if (sender) {
			if (!mongoose.isObjectIdOrHexString(sender)) {
				throw createHttpError(400, 'sender must be a valid MongoDB ID');
			}
			if (!req.user._id.equals(sender)) {
				throw createHttpError(403, 'A request sender must be the authenticated user');
			}
		}

		const senderUser = req.user;
		const [receiverUser, offeredSkillRecord, requestedSkillRecord] = await Promise.all([
			User.findById(receiver),
			offeredSkill ? Skill.findById(offeredSkill) : Promise.resolve(null),
			Skill.findById(requestedSkill),
		]);

		if (!receiverUser) throw createHttpError(404, 'Receiver not found');
		if (senderUser._id.equals(receiverUser._id)) {
			throw createHttpError(400, 'Sender and receiver must be different users');
		}
		if (!requestedSkillRecord) throw createHttpError(404, 'Requested skill not found');
		if (offeredSkill && !offeredSkillRecord) throw createHttpError(404, 'Offered skill not found');
		if (!requestedSkillRecord.userId || (offeredSkillRecord && !offeredSkillRecord.userId)) {
			throw createHttpError(409, 'A selected skill is missing its owner account');
		}
		if (offeredSkillRecord && offeredSkillRecord.userId.toString() !== senderUser._id.toString()) {
			throw createHttpError(400, 'The offered skill must belong to the sender');
		}
		if (requestedSkillRecord.userId.toString() !== receiverUser._id.toString()) {
			throw createHttpError(400, 'The requested skill must belong to the receiver');
		}

		await ensureNoActiveExchange(
			senderUser._id,
			receiverUser._id,
			offeredSkillRecord?._id,
			requestedSkillRecord._id
		);

		const pendingPair = offeredSkillRecord
			? {
					$or: [
						{
							sender: senderUser._id,
							receiver: receiverUser._id,
							offeredSkill: offeredSkillRecord._id,
							requestedSkill: requestedSkillRecord._id,
						},
						{
							sender: receiverUser._id,
							receiver: senderUser._id,
							offeredSkill: requestedSkillRecord._id,
							requestedSkill: offeredSkillRecord._id,
						},
					],
				}
			: {
					sender: senderUser._id,
					receiver: receiverUser._id,
					offeredSkill: null,
					requestedSkill: requestedSkillRecord._id,
				};
		const pendingRequest = await Request.findOne({ status: 'pending', ...pendingPair });
		if (pendingRequest) {
			throw createHttpError(409, 'A pending request already exists for this skill pairing');
		}

		const request = await Request.create({
			sender: senderUser._id,
			receiver: receiverUser._id,
			...(offeredSkillRecord ? { offeredSkill: offeredSkillRecord._id } : {}),
			requestedSkill: requestedSkillRecord._id,
			...(message?.trim() ? { message: message.trim() } : {}),
			senderName: senderUser.name,
			receiverName: receiverUser.name,
			skillRequested: requestedSkillRecord.skillName,
			offeredSkillName: offeredSkillRecord?.skillName || '',
			requestedSkillName: requestedSkillRecord.skillName,
		});
		return res.status(201).json({ message: 'Request created successfully', data: request });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const listRequests = async (req, res, direction) => {
	try {
		const requestedDirection = direction || req.query.direction || 'all';
		if (!['all', 'incoming', 'outgoing'].includes(requestedDirection)) {
			throw createHttpError(400, 'direction must be all, incoming, or outgoing');
		}
		const status = req.query.status;
		if (status && !['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
			throw createHttpError(400, 'status must be pending, accepted, rejected, or cancelled');
		}
		const participantFilter =
			requestedDirection === 'incoming'
				? { receiver: req.user._id }
				: requestedDirection === 'outgoing'
					? { sender: req.user._id }
					: { $or: [{ sender: req.user._id }, { receiver: req.user._id }] };
		const filter = status
			? { $and: [participantFilter, { status }] }
			: participantFilter;
		const requests = await Request.find(filter).sort({ createdAt: -1 });
		return res.status(200).json({ data: requests });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const getRequests = (req, res) => listRequests(req, res);
const getIncomingRequests = (req, res) => listRequests(req, res, 'incoming');
const getOutgoingRequests = (req, res) => listRequests(req, res, 'outgoing');

const acceptRequest = async (req, res) => {
	let session;
	try {
		session = await mongoose.startSession();
		let request;
		let exchange;
		await session.withTransaction(async () => {
			request = await Request.findById(req.params.id).session(session);
			if (!request) throw createHttpError(404, 'Request not found');
			if (!request.receiver) {
				throw createHttpError(409, 'This legacy request has no receiver account linked');
			}
			if (!request.receiver.equals(req.user._id)) {
				throw createHttpError(403, 'Only the receiver can accept this request');
			}
			if (!request.sender || !request.requestedSkill) {
				throw createHttpError(409, 'This legacy request is missing exchange details');
			}
			if (request.status !== 'pending') {
				throw createHttpError(409, `Request has already been ${request.status}`);
			}
			const [offeredSkill, requestedSkill] = await Promise.all([
				request.offeredSkill
					? Skill.findById(request.offeredSkill).session(session)
					: Promise.resolve(null),
				Skill.findById(request.requestedSkill).session(session),
			]);
			if ((request.offeredSkill && !offeredSkill) || !requestedSkill) {
				throw createHttpError(409, 'A skill linked to this request no longer exists');
			}
			if (
				(offeredSkill && !offeredSkill.userId?.equals(request.sender)) ||
				!requestedSkill.userId?.equals(request.receiver)
			) {
				throw createHttpError(409, 'A skill owner no longer matches this request participant');
			}
			await ensureNoActiveExchange(
				request.sender,
				request.receiver,
				request.offeredSkill,
				request.requestedSkill,
				session
			);

			[exchange] = await LearningExchange.create(
				[
					{
						request: request._id,
						sender: request.sender,
						receiver: request.receiver,
						...(request.offeredSkill ? { offeredSkill: request.offeredSkill } : {}),
						requestedSkill: request.requestedSkill,
						activeExchangeKey: getActiveExchangeKey(
							request.sender,
							request.receiver,
							request.offeredSkill,
							request.requestedSkill
						),
						startDate: new Date(),
						status: 'active',
						progress: {
							percentage: 0,
							senderLearningPercentage: 0,
							receiverLearningPercentage: 0,
							updates: [],
						},
					},
				],
				{ session }
			);
			request.status = 'accepted';
			await request.save({ session });
		});

		return res.status(200).json({
			message: 'Request accepted and learning exchange started',
			data: { request, exchange },
		});
	} catch (error) {
		return sendControllerError(res, error);
	} finally {
		if (session) await session.endSession();
	}
};

const rejectRequest = async (req, res) => {
	let session;
	try {
		session = await mongoose.startSession();
		let request;
		await session.withTransaction(async () => {
			request = await Request.findById(req.params.id).session(session);
			if (!request) throw createHttpError(404, 'Request not found');
			if (!request.receiver) {
				throw createHttpError(409, 'This legacy request has no receiver account linked');
			}
			if (!request.receiver.equals(req.user._id)) {
				throw createHttpError(403, 'Only the receiver can reject this request');
			}
			if (request.status !== 'pending') {
				throw createHttpError(409, `Request has already been ${request.status}`);
			}
			request.status = 'rejected';
			await request.save({ session });
		});

		return res.status(200).json({ message: 'Request rejected', data: request });
	} catch (error) {
		return sendControllerError(res, error);
	} finally {
		if (session) await session.endSession();
	}
};

const deleteRequest = async (req, res) => {
	try {
		const request = await Request.findById(req.params.id);
		if (!request) {
			throw createHttpError(404, 'Request not found');
		}
		if (!request.sender?.equals(req.user._id)) {
			throw createHttpError(403, 'Only the requester can cancel this request');
		}
		if (request.status !== 'pending') {
			throw createHttpError(409, 'Only a pending request can be cancelled');
		}
		request.status = 'cancelled';
		await request.save();
		return res.status(200).json({ message: 'Request cancelled successfully', data: request });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

module.exports = {
	createRequest,
	getRequests,
	getIncomingRequests,
	getOutgoingRequests,
	acceptRequest,
	rejectRequest,
	deleteRequest,
};
