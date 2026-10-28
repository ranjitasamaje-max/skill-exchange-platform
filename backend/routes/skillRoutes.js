const express = require('express');
const {
	createSkill,
	getSkills,
	getAvailableSkills,
	updateSkill,
	deleteSkill,
} = require('../controllers/skillController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.route('/').post(authenticate, createSkill).get(getSkills);
router.get('/available', getAvailableSkills);
router.route('/:id').put(authenticate, updateSkill).delete(authenticate, deleteSkill);

module.exports = router;
