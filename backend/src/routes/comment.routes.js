// nexus/backend/src/routes/comment.routes.js
const express = require('express');
const router = express.Router({ mergeParams: true }); // projectId + taskId
const { authenticate, requireProjectMembership } = require('../middleware/auth.middleware');
const { writeRateLimiter } = require('../middleware/rateLimiter');
const { validateUUID } = require('../middleware/sanitize');
const {
  listComments, createComment, updateComment, deleteComment, createCommentValidators
} = require('../controllers/comment.controller');

router.use(authenticate);

router.get ('/',              requireProjectMembership('viewer'), listComments);
router.post('/',              requireProjectMembership('member'), writeRateLimiter, createCommentValidators, createComment);
router.patch ('/:commentId',  validateUUID('commentId'), requireProjectMembership('member'), writeRateLimiter, updateComment);
router.delete('/:commentId',  validateUUID('commentId'), requireProjectMembership('member'), deleteComment);

module.exports = router;
