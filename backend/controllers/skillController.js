const mongoose = require('mongoose');
const LearningExchange = require('../models/LearningExchange');
const Request = require('../models/Request');
const Skill = require('../models/Skill');
const User = require('../models/User');
const { createHttpError, sendControllerError } = require('../utils/controllerErrors');

const createSkill = async (req, res) => {
	try {
		const { skillName, description, userId } = req.body || {};
		if (
			typeof skillName !== 'string' ||
			!skillName.trim() ||
			skillName.trim().length > 100 ||
			(description !== undefined &&
				(typeof description !== 'string' || description.length > 2000))
		) {
			throw createHttpError(400, 'Skill name and description contain invalid values');
		}
		if (userId) {
			if (!mongoose.isObjectIdOrHexString(userId)) {
				throw createHttpError(400, 'userId must be a valid MongoDB ID');
			}
			if (!req.user._id.equals(userId)) {
				throw createHttpError(403, 'You can only create skills for your own account');
			}
		}

		const skill = await Skill.create({ skillName, description, userId: req.user._id });
		return res.status(201).json({ message: 'Skill created successfully', data: skill });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const formatSkillWithOwner = (skill) => {
	const result = skill.toObject({ depopulate: true });
	const owner = skill.userId;
	result.owner =
		owner && owner.name !== undefined
			? { _id: owner._id, name: owner.name, location: owner.location }
			: null;
	result.userId = owner && owner.name !== undefined ? owner._id : owner;
	return result;
};

const getSkills = async (_req, res) => {
	try {
		const skills = await Skill.find()
			.populate('userId', 'name location')
			.sort({ createdAt: -1 });
		return res.status(200).json({ data: skills.map(formatSkillWithOwner) });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const getAvailableSkills = async (req, res) => {
	try {
		if (req.query.search !== undefined && typeof req.query.search !== 'string') {
			throw createHttpError(400, 'search must be a single text value');
		}
		const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
		if (search.length > 100) {
			throw createHttpError(400, 'Search text cannot exceed 100 characters');
		}
		const filter = {};
		if (search) {
			const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const matchingOwners = await User
				.find({ name: { $regex: escapedSearch, $options: 'i' } })
				.select('_id');
			filter.$or = [
				{ skillName: { $regex: escapedSearch, $options: 'i' } },
				{ userId: { $in: matchingOwners.map((user) => user._id) } },
			];
		}
		const skills = await Skill.find(filter)
			.populate('userId', 'name location')
			.sort({ skillName: 1, createdAt: -1 });
		const availableSkills = skills
			.filter((skill) => skill.userId)
			.map(formatSkillWithOwner);
		return res.status(200).json({ data: availableSkills });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const updateSkill = async (req, res) => {
	try {
		const body = req.body || {};
		const updates = {};
		['skillName', 'description', 'userId'].forEach((field) => {
			if (Object.prototype.hasOwnProperty.call(body, field)) {
				updates[field] = body[field];
			}
		});
		if (
			(Object.prototype.hasOwnProperty.call(updates, 'skillName') &&
				(typeof updates.skillName !== 'string' ||
					!updates.skillName.trim() ||
					updates.skillName.trim().length > 100)) ||
			(Object.prototype.hasOwnProperty.call(updates, 'description') &&
				(typeof updates.description !== 'string' || updates.description.length > 2000))
		) {
			throw createHttpError(400, 'Skill name and description contain invalid values');
		}

		if (Object.prototype.hasOwnProperty.call(updates, 'userId')) {
			if (!mongoose.isObjectIdOrHexString(updates.userId)) {
				throw createHttpError(400, 'userId must be a valid MongoDB ID');
			}
			if (!req.user._id.equals(updates.userId)) {
				throw createHttpError(403, 'You cannot change a skill owner');
			}
			delete updates.userId;
		}

		const skill = await Skill.findById(req.params.id);
		if (!skill) {
			throw createHttpError(404, 'Skill not found');
		}
		if (!skill.userId) {
			throw createHttpError(409, 'This legacy skill has no owner account linked');
		}
		if (!skill.userId.equals(req.user._id)) {
			throw createHttpError(403, 'You can only update your own skills');
		}
		Object.assign(skill, updates);
		await skill.save();
		return res.status(200).json({ message: 'Skill updated successfully', data: skill });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

const deleteSkill = async (req, res) => {
	try {
		const skill = await Skill.findById(req.params.id);
		if (!skill) {
			throw createHttpError(404, 'Skill not found');
		}
		if (!skill.userId) {
			throw createHttpError(409, 'This legacy skill has no owner account linked');
		}
		if (!skill.userId.equals(req.user._id)) {
			throw createHttpError(403, 'You can only delete your own skills');
		}

		const [relatedRequest, relatedExchange] = await Promise.all([
			Request.exists({ $or: [{ offeredSkill: skill._id }, { requestedSkill: skill._id }] }),
			LearningExchange.exists({ $or: [{ offeredSkill: skill._id }, { requestedSkill: skill._id }] }),
		]);
		if (relatedRequest || relatedExchange) {
			throw createHttpError(409, 'Skill cannot be deleted while linked requests or exchanges exist');
		}

		await skill.deleteOne();
		return res.status(200).json({ message: 'Skill deleted successfully', data: skill });
	} catch (error) {
		return sendControllerError(res, error);
	}
};

module.exports = { createSkill, getSkills, getAvailableSkills, updateSkill, deleteSkill };
