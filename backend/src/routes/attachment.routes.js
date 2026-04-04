// nexus/backend/src/routes/attachment.routes.js
const express = require('express');
const router = express.Router({ mergeParams: true });
const { authenticate, requireProjectMembership } = require('../middleware/auth.middleware');
const { writeRateLimiter } = require('../middleware/rateLimiter');
const { validateUUID } = require('../middleware/sanitize');
const { auditLog } = require('../middleware/auditLog.middleware');
const {
  requestUploadUrl, confirmUpload, listAttachments, deleteAttachment
} = require('../controllers/attachment.controller');

router.use(authenticate);

router.get ('/',                     requireProjectMembership('viewer'), listAttachments);
router.post('/upload-url',           requireProjectMembership('member'), writeRateLimiter, requestUploadUrl);
router.post('/confirm',              requireProjectMembership('member'), writeRateLimiter, auditLog('attachment'), confirmUpload);
router.delete('/:attachmentId',      validateUUID('attachmentId'), requireProjectMembership('member'), auditLog('attachment'), deleteAttachment);

module.exports = router;
