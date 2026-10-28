const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { createHttpError, sendControllerError } = require('../utils/controllerErrors');

const authenticate = async (req, res, next) => {
	try {
		const authorization = req.get('authorization') || '';
		const match = authorization.match(/^Bearer\s+(\S+)$/i);
		if (!match) {
			throw createHttpError(401, 'A valid bearer token is required');
		}
		if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
			throw createHttpError(500, 'Authentication is not configured');
		}

		let payload;
		try {
			payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
		} catch (_error) {
			throw createHttpError(401, 'Invalid or expired token');
		}
		if (
			typeof payload !== 'object' ||
			typeof payload.sub !== 'string' ||
			!mongoose.isObjectIdOrHexString(payload.sub)
		) {
			throw createHttpError(401, 'Invalid or expired token');
		}

		const user = await User.findById(payload.sub);
		if (!user) {
			throw createHttpError(401, 'Account associated with this token no longer exists');
		}
		req.user = user;
		return next();
	} catch (error) {
		return sendControllerError(res, error);
	}
};

module.exports = authenticate;
