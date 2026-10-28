const mongoose = require('mongoose');

const progressUpdateSchema = new mongoose.Schema(
	{
		updatedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		percentage: {
			type: Number,
			min: 0,
			max: 100,
			required: true,
		},
		direction: {
			type: String,
			enum: ['sender', 'receiver'],
		},
		note: {
			type: String,
			trim: true,
			maxlength: [1000, 'Progress notes cannot exceed 1000 characters'],
		},
		createdAt: {
			type: Date,
			default: Date.now,
		},
	},
	{ _id: false }
);

const learningExchangeSchema = new mongoose.Schema(
	{
		request: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Request',
			required: [true, 'Accepted request is required'],
			unique: true,
		},
		sender: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'Sender is required'],
		},
		receiver: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'Receiver is required'],
		},
		offeredSkill: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Skill',
		},
		requestedSkill: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Skill',
			required: [true, 'Requested skill is required'],
		},
		activeExchangeKey: {
			type: String,
			select: false,
		},
		startDate: {
			type: Date,
			required: [true, 'Exchange start date is required'],
			default: Date.now,
		},
		completedAt: {
			type: Date,
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'completed', 'cancelled'],
				message: 'Status must be active, completed, or cancelled',
			},
			default: 'active',
		},
		progress: {
			percentage: {
				type: Number,
				min: [0, 'Progress cannot be less than 0'],
				max: [100, 'Progress cannot exceed 100'],
				default: 0,
			},
			senderLearningPercentage: {
				type: Number,
				min: [0, 'Sender learning progress cannot be less than 0'],
				max: [100, 'Sender learning progress cannot exceed 100'],
				default: 0,
			},
			receiverLearningPercentage: {
				type: Number,
				min: [0, 'Receiver learning progress cannot be less than 0'],
				max: [100, 'Receiver learning progress cannot exceed 100'],
				default: 0,
			},
			updates: {
				type: [progressUpdateSchema],
				default: [],
			},
		},
	},
	{ timestamps: true }
);

learningExchangeSchema.index(
	{ activeExchangeKey: 1 },
	{
		unique: true,
		name: 'unique_active_skill_exchange',
		partialFilterExpression: { status: 'active', activeExchangeKey: { $type: 'string' } },
	}
);

module.exports = mongoose.model('LearningExchange', learningExchangeSchema);
