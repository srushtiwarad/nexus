const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { listProjects, getProject, createProject, updateProject, deleteProject } = require('../controllers/project.controller');
const { listTasks, getTask, createTask, updateTask, deleteTask } = require('../controllers/task.controller');
const { listMilestones, createMilestone, updateMilestone, deleteMilestone } = require('../controllers/milestone.controller');

router.get   ('/',              authenticate, listProjects);
router.post  ('/',              authenticate, createProject);
router.get   ('/:id',          authenticate, getProject);
router.patch ('/:id',          authenticate, updateProject);
router.delete('/:id',          authenticate, deleteProject);

// Task sub-routes
router.get   ('/:projectId/tasks',         authenticate, listTasks);
router.post  ('/:projectId/tasks',         authenticate, createTask);
router.get   ('/:projectId/tasks/:taskId', authenticate, getTask);
router.patch ('/:projectId/tasks/:taskId', authenticate, updateTask);
router.delete('/:projectId/tasks/:taskId', authenticate, deleteTask);

// Milestone sub-routes
router.get   ('/:projectId/milestones',                 authenticate, listMilestones);
router.post  ('/:projectId/milestones',                 authenticate, createMilestone);
router.patch ('/:projectId/milestones/:milestoneId',    authenticate, updateMilestone);
router.delete('/:projectId/milestones/:milestoneId',    authenticate, deleteMilestone);

module.exports = router;
