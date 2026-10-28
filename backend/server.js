const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const skillRoutes = require('./routes/skillRoutes');
const requestRoutes = require('./routes/requestRoutes');
const exchangeRoutes = require('./routes/exchangeRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

const allowedOrigins = new Set(
	(process.env.FRONTEND_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean)
);
for (const interfaces of Object.values(os.networkInterfaces())) {
	for (const networkInterface of interfaces || []) {
		const octets = networkInterface.address.split('.').map(Number);
		const isPrivateIPv4 =
			octets[0] === 10 ||
			(octets[0] === 192 && octets[1] === 168) ||
			(octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
		if (
			networkInterface.family === 'IPv4' &&
			!networkInterface.internal &&
			isPrivateIPv4
		) {
			allowedOrigins.add(`http://${networkInterface.address}:8080`);
		}
	}
}

app.use(
	cors({
		origin(origin, callback) {
			if (!origin || allowedOrigins.has(origin)) return callback(null, true);
			return callback(new Error('Origin is not allowed by CORS'));
		},
	})
);
app.use(express.json());

app.get('/', (_req, res) => {
	res.status(200).json({ message: 'Skill Exchange Platform API is running' });
});

app.get('/api/health', (_req, res) => {
	const ready = mongoose.connection.readyState === 1;
	return res.status(ready ? 200 : 503).json({
		status: ready ? 'ok' : 'unavailable',
		database: ready ? 'connected' : 'disconnected',
	});
});

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/exchanges', exchangeRoutes);

app.use((error, _req, res, next) => {
	if (error.type === 'entity.parse.failed') {
		return res.status(400).json({ message: 'Request body must contain valid JSON' });
	}
	if (error.type === 'entity.too.large') {
		return res.status(413).json({ message: 'Request body exceeds the 100 KB limit' });
	}
	if (error.message === 'Origin is not allowed by CORS') {
		return res.status(403).json({ message: 'This frontend origin is not allowed' });
	}
	return next(error);
});

// Start accepting requests only after the database connection is ready.
const startServer = async () => {
	try {
		const port = Number(process.env.PORT || 5000);
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new Error('PORT must be a valid TCP port between 1 and 65535.');
		}
		if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
			throw new Error('JWT_SECRET must contain at least 32 UTF-8 bytes.');
		}
		await connectDB();
		app.listen(port, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${port}`));
	} catch (error) {
		if (error.name === 'MongoServerSelectionError') {
			console.error('Unable to reach MongoDB Atlas. Check the URI, DNS, and Atlas network access list.');
		} else {
			console.error(`Unable to start server: ${error.message}`);
		}
		process.exit(1);
	}
};

startServer();
