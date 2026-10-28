const express = require('express');
const {
	createRequest,
	getRequests,
	getIncomingRequests,
	getOutgoingRequests,
	acceptRequest,
	rejectRequest,
	deleteRequest,
} = require('../controllers/requestController');
const authenticate = require('../middleware/authenticate');
const createRateLimiter = require('../middleware/rateLimit');

const router = express.Router();
const createRequestRateLimit = createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });

router.post('/', createRequestRateLimit, authenticate, createRequest);
router.get('/', authenticate, getRequests);
router.get('/incoming', authenticate, getIncomingRequests);
router.get('/outgoing', authenticate, getOutgoingRequests);
router.post('/:id/accept', authenticate, acceptRequest);
router.post('/:id/reject', authenticate, rejectRequest);
router.delete('/:id', authenticate, deleteRequest);

module.exports = router;
