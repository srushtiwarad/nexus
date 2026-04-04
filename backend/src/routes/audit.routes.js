const express = require('express');
const router = express.Router();
const { getLogs } = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET /api/v1/audit — list activity logs
router.get('/', getLogs);

module.exports = router;
