const mongoose = require('mongoose');

// Store skills offered by platform members.
const skillSchema = new mongoose.Schema(
	{
		skillName: {
			type: String,
			required: [true, 'Skill name is required'],
			trim: true,
			maxlength: [100, 'Skill name cannot exceed 100 characters'],
		},
		description: {
			type: String,
			trim: true,
			maxlength: [2000, 'Skill description cannot exceed 2000 characters'],
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: [true, 'Skill owner is required'],
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Skill', skillSchema);
