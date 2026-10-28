const express = require('express');
const { createUser, getUsers } = require('../controllers/userController');
const { login } = require('../controllers/authController');
const createRateLimiter = require('../middleware/rateLimit');

const router = express.Router();
const signupRateLimit = createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });
const loginRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

router.route('/').post(signupRateLimit, createUser).get(getUsers);
router.post('/login', loginRateLimit, login);

module.exports = router;
