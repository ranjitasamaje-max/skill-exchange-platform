const User = require('../models/User');
const { createHttpError, sendControllerError } = require('../utils/controllerErrors');

const createUser = async (req, res) => {
	try {
		const { name, email, password, location, skillsToTeach, skillsToLearn } = req.body || {};
		if (
			typeof name !== 'string' ||
			!name.trim() ||
			name.trim().length > 100 ||
			typeof email !== 'string' ||
			!email.trim() ||
			email.trim().length > 254 ||
			typeof password !== 'string' ||
			Buffer.byteLength(password, 'utf8') < 8 ||
			Buffer.byteLength(password, 'utf8') > 72
		) {
			throw createHttpError(400, 'Name, valid email, and password are required');
		}
		if (
			(location !== undefined && (typeof location !== 'string' || location.length > 120)) ||
			['skillsToTeach', 'skillsToLearn'].some((field) => {
				const value = req.body[field];
				return value !== undefined &&
					(!Array.isArray(value) ||
						value.length > 50 ||
						value.some((skill) => typeof skill !== 'string' || skill.length > 100));
			})
		) {
			throw createHttpError(400, 'Optional profile fields contain invalid values');
		}
		const user = await User.create({
			name,
			email,
			password,
			location,
			skillsToTeach,
			skillsToLearn,
		});
		return res.status(201).json({ message: 'User created successfully', data: user });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const getUsers = async (_req, res) => {
	try {
		const users = await User.find()
			.select('name location skillsToTeach skillsToLearn createdAt')
			.sort({ createdAt: -1 });
		return res.status(200).json({ data: users });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

module.exports = { createUser, getUsers };
