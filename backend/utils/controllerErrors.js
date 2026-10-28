const createHttpError = (status, message) => {
	const error = new Error(message);
	error.status = status;
	return error;
};

const sendControllerError = (res, error) => {
	if (error.status) {
		return res.status(error.status).json({ message: error.message });
	}

	if (error.code === 11000) {
		const duplicateField = Object.keys(error.keyPattern || {})[0];
		const message =
			duplicateField === 'email'
				? 'An account with this email already exists'
				: duplicateField === 'activeExchangeKey' || duplicateField === 'request'
					? 'An active learning exchange already exists for this skill pairing'
					: `A record with this ${duplicateField || 'value'} already exists`;
		return res.status(409).json({ message });
	}

	if (error.name === 'ValidationError') {
		const message = Object.values(error.errors)
			.map((validationError) => validationError.message)
			.join('. ');
		return res.status(400).json({ message });
	}

	if (error.name === 'CastError') {
		return res.status(400).json({ message: `Invalid ${error.path} value` });
	}

	console.error(error);
	return res.status(500).json({ message: 'An unexpected server error occurred' });
};

module.exports = { createHttpError, sendControllerError };
