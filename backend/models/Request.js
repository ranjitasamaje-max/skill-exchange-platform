const mongoose = require('mongoose');

// Store requests between members to exchange a skill.
const requestSchema = new mongoose.Schema(
	{
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
		message: {
			type: String,
			trim: true,
			maxlength: [1000, 'Request message cannot exceed 1000 characters'],
		},
		requestedSkill: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Skill',
			required: [true, 'Requested skill is required'],
		},
		status: {
			type: String,
			enum: {
				values: ['pending', 'accepted', 'rejected', 'cancelled'],
				message: 'Status must be pending, accepted, rejected, or cancelled',
			},
			default: 'pending',
		},
		senderName: {
			type: String,
			trim: true,
		},
		receiverName: {
			type: String,
			trim: true,
		},
		skillRequested: {
			type: String,
			trim: true,
		},
		offeredSkillName: {
			type: String,
			trim: true,
		},
		requestedSkillName: {
			type: String,
			trim: true,
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Request', requestSchema);
