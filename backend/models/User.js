const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
			maxlength: [100, 'Name cannot exceed 100 characters'],
		},
		email: {
			type: String,
			required: [true, 'Email is required'],
			unique: true,
			trim: true,
			lowercase: true,
			maxlength: [254, 'Email cannot exceed 254 characters'],
			match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
		},
		password: {
			type: String,
			required: [true, 'Password is required'],
			minlength: [8, 'Password must be at least 8 characters long'],
			validate: {
				validator: (value) => Buffer.byteLength(value, 'utf8') <= 72,
				message: 'Password must be no longer than 72 UTF-8 bytes',
			},
			select: false,
		},
		location: {
			type: String,
			trim: true,
			maxlength: [120, 'Location cannot exceed 120 characters'],
			default: '',
		},
		skillsToTeach: {
			type: [{ type: String, trim: true }],
			default: [],
		},
		skillsToLearn: {
			type: [{ type: String, trim: true }],
			default: [],
		},
	},
	{
		timestamps: true,
		toJSON: {
			transform(_document, result) {
				delete result.password;
				return result;
			},
		},
	}
);

userSchema.pre('save', async function hashPassword() {
	if (!this.isModified('password')) return;
	this.password = await bcrypt.hash(this.password, 12);
});

userSchema.statics.comparePassword = (candidate, hash) => bcrypt.compare(candidate, hash);

module.exports = mongoose.model('User', userSchema);
