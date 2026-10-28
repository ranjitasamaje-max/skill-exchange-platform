const express = require('express');
const { signup, login, getMe, updateMe, deleteMe } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const createRateLimiter = require('../middleware/rateLimit');

const router = express.Router();
const signupRateLimit = createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });
const loginRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

router.post('/signup', signupRateLimit, signup);
router.post('/login', loginRateLimit, login);
router
	.route('/me')
	.get(authenticate, getMe)
	.patch(authenticate, updateMe)
	.delete(authenticate, deleteMe);

module.exports = router;
