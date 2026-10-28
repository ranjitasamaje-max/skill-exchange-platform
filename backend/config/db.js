const mongoose = require('mongoose');

// Connect to the MongoDB Atlas cluster configured in the environment.
const connectDB = async () => {
	const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

	if (!mongoUri) {
		throw new Error('Set MONGO_URI in the environment before starting the server.');
	}

	await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
	console.log('MongoDB connected');
};

module.exports = connectDB;
