const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const LearningExchange = require('../models/LearningExchange');
const Request = require('../models/Request');
const Skill = require('../models/Skill');
const User = require('../models/User');
const { createHttpError, sendControllerError } = require('../utils/controllerErrors');

const getJwtSecret = () => {
	const secret = process.env.JWT_SECRET;
	if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
		throw createHttpError(500, 'Authentication is not configured with a strong JWT secret');
	}
	return secret;
};

const createToken = (user, secret = getJwtSecret()) =>
	jwt.sign({}, secret, {
		subject: user._id.toString(),
		expiresIn: '1h',
		algorithm: 'HS256',
	});

const signup = async (req, res) => {
	try {
		const { name, email, password, location, skillsToTeach, skillsToLearn } = req.body || {};
		if (
			typeof name !== 'string' ||
			typeof email !== 'string' ||
			typeof password !== 'string' ||
			!name.trim() ||
			!email.trim() ||
			Buffer.byteLength(password, 'utf8') < 8
		) {
			throw createHttpError(400, 'Name, email, and password are required');
		}
		if (Buffer.byteLength(password, 'utf8') > 72) {
			throw createHttpError(400, 'Password must be no longer than 72 UTF-8 bytes');
		}
		if (name.trim().length > 100 || email.trim().length > 254) {
			throw createHttpError(400, 'Name or email exceeds the allowed length');
		}
		if (location !== undefined && (typeof location !== 'string' || location.length > 120)) {
			throw createHttpError(400, 'Location must be text no longer than 120 characters');
		}
		for (const [field, value] of Object.entries({ skillsToTeach, skillsToLearn })) {
			if (
				value !== undefined &&
				(!Array.isArray(value) ||
					value.length > 50 ||
					value.some((skill) => typeof skill !== 'string' || skill.length > 100))
			) {
				throw createHttpError(400, `${field} must be an array of up to 50 text values`);
			}
		}

		const secret = getJwtSecret();
		const user = await User.create({
			name,
			email,
			password,
			location,
			skillsToTeach,
			skillsToLearn,
		});
		const token = createToken(user, secret);
		return res.status(201).json({
			message: 'Account created successfully',
			data: { user, token },
		});
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const login = async (req, res) => {
	try {
		const { email, password } = req.body || {};
		if (
			typeof email !== 'string' ||
			typeof password !== 'string' ||
			!email.trim() ||
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
			!password ||
			email.trim().length > 254 ||
			Buffer.byteLength(password, 'utf8') > 72
		) {
			throw createHttpError(400, 'A valid email and password are required');
		}

		const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
		if (!user || !(await User.comparePassword(password, user.password))) {
			throw createHttpError(401, 'Invalid email or password');
		}
		const token = createToken(user);
		return res.status(200).json({
			message: 'Login successful',
			data: { user, token },
		});
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const getMe = async (req, res) => {
	return res.status(200).json({ data: req.user });
};

const updateMe = async (req, res) => {
	try {
		const body = req.body || {};
		const updates = {};
		const allowedFields = ['name', 'location', 'skillsToTeach', 'skillsToLearn'];
		const unsupportedFields = Object.keys(body).filter((field) => !allowedFields.includes(field));
		if (unsupportedFields.length) {
			throw createHttpError(
				400,
				`Cannot update these profile fields: ${unsupportedFields.join(', ')}`
			);
		}
		if (!Object.keys(body).length) {
			throw createHttpError(400, 'Provide at least one profile field to update');
		}
		for (const field of allowedFields) {
			if (Object.prototype.hasOwnProperty.call(body, field)) {
				updates[field] = body[field];
			}
		}
		if (
			(nameIsInvalid(updates.name)) ||
			(Object.prototype.hasOwnProperty.call(updates, 'location') &&
				(typeof updates.location !== 'string' || updates.location.length > 120)) ||
			['skillsToTeach', 'skillsToLearn'].some(
				(field) =>
					Object.prototype.hasOwnProperty.call(updates, field) &&
					(!Array.isArray(updates[field]) ||
						updates[field].length > 50 ||
						updates[field].some(
							(skill) => typeof skill !== 'string' || skill.length > 100
						))
			)
		) {
			throw createHttpError(400, 'Profile fields contain invalid values or exceed allowed lengths');
		}
		if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
			updates.name = updates.name.trim();
			if (!updates.name) throw createHttpError(400, 'Name cannot be empty');
		}

		const user = await User.findById(req.user._id);
		if (!user) {
			throw createHttpError(404, 'User not found');
		}
		Object.assign(user, updates);
		await user.save();
		return res.status(200).json({ message: 'Profile updated successfully', data: user });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const nameIsInvalid = (name) =>
	name !== undefined && (typeof name !== 'string' || name.length > 100);

const deleteMe = async (req, res) => {
	let session;
	try {
		session = await mongoose.startSession();
		await session.withTransaction(async () => {
			const ownedSkills = await Skill.find({ userId: req.user._id })
				.select('_id')
				.session(session);
			const skillIds = ownedSkills.map((skill) => skill._id);
			const relatedRequests = await Request.find({
				$or: [
					{ sender: req.user._id },
					{ receiver: req.user._id },
					...(skillIds.length
						? [{ offeredSkill: { $in: skillIds } }, { requestedSkill: { $in: skillIds } }]
						: []),
				],
			})
				.select('_id')
				.session(session);
			const requestIds = relatedRequests.map((request) => request._id);
			await LearningExchange.deleteMany({
				$or: [
					{ sender: req.user._id },
					{ receiver: req.user._id },
					...(requestIds.length ? [{ request: { $in: requestIds } }] : []),
					...(skillIds.length
						? [{ offeredSkill: { $in: skillIds } }, { requestedSkill: { $in: skillIds } }]
						: []),
				],
			}).session(session);
			if (requestIds.length) {
				await Request.deleteMany({ _id: { $in: requestIds } }).session(session);
			}
			await Skill.deleteMany({ userId: req.user._id }).session(session);
			await User.deleteOne({ _id: req.user._id }).session(session);
		});
		return res.status(200).json({ message: 'Your account and associated records were deleted' });
	} catch (error) {
		return sendControllerError(res, error);
	} finally {
		if (session) await session.endSession();
	}
};

module.exports = { signup, login, getMe, updateMe, deleteMe };
