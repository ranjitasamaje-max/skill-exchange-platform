const express = require('express');
const {
	getExchanges,
	getActiveExchanges,
	updateProgress,
	completeExchange,
} = require('../controllers/exchangeController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.get('/', authenticate, getExchanges);
router.get('/active', authenticate, getActiveExchanges);
router.patch('/:id/progress', authenticate, updateProgress);
router.patch('/:id/complete', authenticate, completeExchange);

module.exports = router;
