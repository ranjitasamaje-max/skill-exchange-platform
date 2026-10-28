const LearningExchange = require('../models/LearningExchange');
const { createHttpError, sendControllerError } = require('../utils/controllerErrors');

const listExchanges = async (req, res, status) => {
	try {
		const requestedStatus = status || req.query.status;
		if (requestedStatus && !['active', 'completed', 'cancelled'].includes(requestedStatus)) {
			throw createHttpError(400, 'status must be active, completed, or cancelled');
		}
		const filter = {
			$or: [{ sender: req.user._id }, { receiver: req.user._id }],
		};
		if (requestedStatus) filter.status = requestedStatus;

		const exchanges = await LearningExchange.find(filter)
			.populate('sender', 'name')
			.populate('receiver', 'name')
			.populate('offeredSkill', 'skillName')
			.populate('requestedSkill', 'skillName')
			.sort({ createdAt: -1 });
		return res.status(200).json({ data: exchanges });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const getExchanges = (req, res) => listExchanges(req, res);
const getActiveExchanges = (req, res) => listExchanges(req, res, 'active');

const updateProgress = async (req, res) => {
	try {
		const { direction, percentage, note } = req.body || {};
		if (!['sender', 'receiver'].includes(direction)) {
			throw createHttpError(
				400,
				'direction must be sender or receiver to identify whose learning progress is updated'
			);
		}
		if (percentage === undefined && (typeof note !== 'string' || !note.trim())) {
			throw createHttpError(400, 'Provide a progress percentage, a non-empty note, or both');
		}
		if (
			percentage !== undefined &&
			(typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100)
		) {
			throw createHttpError(400, 'Progress percentage must be a number from 0 to 100');
		}
		if (note !== undefined && typeof note !== 'string') {
			throw createHttpError(400, 'Progress note must be text');
		}

		const exchange = await LearningExchange.findById(req.params.id);
		if (!exchange) {
			throw createHttpError(404, 'Learning exchange not found');
		}
		const expectedParticipant = direction === 'sender' ? exchange.sender : exchange.receiver;
		if (!expectedParticipant.equals(req.user._id)) {
			throw createHttpError(403, `Only the ${direction} can update their learning progress`);
		}
		if (!exchange.offeredSkill && direction === 'receiver') {
			throw createHttpError(400, 'Only the learner can update progress for a one-way learning request');
		}
		if (exchange.status !== 'active') {
			throw createHttpError(409, 'Progress can only be updated for an active exchange');
		}

		const progressField =
			direction === 'sender' ? 'senderLearningPercentage' : 'receiverLearningPercentage';
		if (percentage !== undefined) exchange.progress[progressField] = percentage;
		exchange.progress.percentage = Math.round(
			(exchange.progress.senderLearningPercentage +
				exchange.progress.receiverLearningPercentage) /
				2
		);
		exchange.progress.updates.push({
			updatedBy: req.user._id,
			direction,
			percentage: exchange.progress[progressField],
			note: note?.trim(),
		});
		await exchange.save();

		return res.status(200).json({ message: 'Exchange progress updated', data: exchange });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const completeExchange = async (req, res) => {
	try {
		const exchange = await LearningExchange.findById(req.params.id);
		if (!exchange) {
			throw createHttpError(404, 'Learning exchange not found');
		}
		if (!exchange.sender.equals(req.user._id) && !exchange.receiver.equals(req.user._id)) {
			throw createHttpError(403, 'Only an exchange participant can complete this exchange');
		}
		if (exchange.status !== 'active') {
			throw createHttpError(409, `Exchange has already been ${exchange.status}`);
		}

		exchange.status = 'completed';
		exchange.completedAt = new Date();
		await exchange.save();
		return res.status(200).json({ message: 'Learning exchange completed', data: exchange });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

module.exports = {
	getExchanges,
	getActiveExchanges,
	updateProgress,
	completeExchange,
};
