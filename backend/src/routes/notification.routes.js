// nexus/backend/src/routes/notification.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { getUnreadNotifications, markAsRead } = require('../services/notification.service');

router.use(authenticate);

// GET /api/v1/notifications — fetch unread
router.get('/', async (req, res, next) => {
  try {
    const notifs = await getUnreadNotifications(req.user.id, 50);
    res.json(notifs);
  } catch (err) { next(err); }
});

// POST /api/v1/notifications/read — mark as read
router.post('/read', async (req, res, next) => {
  try {
    const { ids } = req.body; // optional array of UUIDs; empty = mark all
    await markAsRead(req.user.id, ids || []);
    res.json({ message: 'Marked as read' });
  } catch (err) { next(err); }
});

module.exports = router;
