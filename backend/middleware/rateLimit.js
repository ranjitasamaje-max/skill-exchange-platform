const createRateLimiter = ({ limit, windowMs }) => {
	const requests = new Map();
	let lastCleanup = Date.now();

	return (req, res, next) => {
		const now = Date.now();
		if (now - lastCleanup >= windowMs) {
			for (const [key, record] of requests) {
				if (record.resetAt <= now) requests.delete(key);
			}
			lastCleanup = now;
		}

		const key = req.ip || req.socket.remoteAddress || 'unknown';
		let record = requests.get(key);
		if (!record || record.resetAt <= now) {
			record = { count: 0, resetAt: now + windowMs };
			requests.set(key, record);
		}
		record.count += 1;
		res.set('RateLimit-Limit', String(limit));
		res.set('RateLimit-Remaining', String(Math.max(0, limit - record.count)));
		res.set('RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));
		if (record.count > limit) {
			res.set('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
			return res.status(429).json({ message: 'Too many requests. Please try again later.' });
		}
		return next();
	};
};

module.exports = createRateLimiter;
