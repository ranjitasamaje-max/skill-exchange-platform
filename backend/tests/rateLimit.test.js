const assert = require('node:assert/strict');
const test = require('node:test');
const createRateLimiter = require('../middleware/rateLimit');

test('rate limiter rejects requests after the configured limit', () => {
	const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
	const response = {
		headers: {},
		statusCode: 0,
		body: null,
		set(name, value) {
			this.headers[name] = value;
			return this;
		},
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(value) {
			this.body = value;
			return this;
		},
	};
	let nextCalls = 0;
	const request = { ip: '192.0.2.10', socket: { remoteAddress: '192.0.2.10' } };
	const next = () => {
		nextCalls += 1;
	};

	limiter(request, response, next);
	limiter(request, response, next);

	assert.equal(nextCalls, 1);
	assert.equal(response.statusCode, 429);
	assert.equal(response.headers['Retry-After'] !== undefined, true);
	assert.match(response.body.message, /try again later/i);
});
