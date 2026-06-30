const express = require('express');
const db = require('../db');
const { authenticateToken } = require('./auth');
const router = express.Router({ mergeParams: true }); // Merge params to access projectId

// Helper to broadcast changes
const broadcastProjectUpdate = (req, projectId, type, data) => {
  const io = req.app.get('io');
  if (io) {
    io.to(projectId).emit('project_event', { type, data, projectId });
  }
};

// GET /api/projects/:projectId/tasks - Get all tasks in a project
router.get('/', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  try {
    // Check if user is owner or member
    const accessCheck = await db.query(
      `SELECT 1 FROM pm_projects p
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [projectId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project tasks' });
    }

    const result = await db.query(
      `SELECT t.*, u.full_name as assignee_name, u.avatar_color as assignee_avatar_color, u.email as assignee_email
       FROM pm_tasks t
       LEFT JOIN pm_users u ON t.assigned_to = u.id
       WHERE t.project_id = $1
       ORDER BY t.status, t.position, t.created_at ASC`,
      [projectId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ error: 'Server error fetching tasks' });
  }
});

// POST /api/projects/:projectId/tasks - Create a new task
router.post('/', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { title, description, status, priority, assigned_to, due_date } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  try {
    // Check project access
    const accessCheck = await db.query(
      `SELECT 1 FROM pm_projects p
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [projectId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get max position in current status
    const posResult = await db.query(
      'SELECT COALESCE(MAX(position), 0) as max_pos FROM pm_tasks WHERE project_id = $1 AND status = $2',
      [projectId, status || 'todo']
    );
    const position = posResult.rows[0].max_pos + 1;

    const cleanAssignedTo = (assigned_to && assigned_to.trim() !== '') ? assigned_to : null;
    const cleanDueDate = (due_date && due_date.trim() !== '') ? due_date : null;

    const result = await db.query(
      `INSERT INTO pm_tasks (project_id, title, description, status, priority, assigned_to, position, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [projectId, title, description, status || 'todo', priority || 'medium', cleanAssignedTo, position, cleanDueDate]
    );

    const newTask = result.rows[0];

    // Fetch assignee details if set
    if (newTask.assigned_to) {
      const uRes = await db.query('SELECT full_name as assignee_name, avatar_color as assignee_avatar_color, email as assignee_email FROM pm_users WHERE id = $1', [newTask.assigned_to]);
      if (uRes.rows.length > 0) {
        Object.assign(newTask, uRes.rows[0]);
      }
    }

    broadcastProjectUpdate(req, projectId, 'TASK_CREATED', newTask);

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error creating task' });
  }
});

// PUT /api/projects/:projectId/tasks/:id - Update task details
router.put('/:id', authenticateToken, async (req, res) => {
  const { projectId, id } = req.params;
  const { title, description, status, priority, assigned_to, position, due_date } = req.body;

  try {
    // Check access
    const accessCheck = await db.query(
      `SELECT 1 FROM pm_projects p
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [projectId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if task exists and belongs to project
    const taskCheck = await db.query('SELECT status, position, assigned_to, due_date FROM pm_tasks WHERE id = $1 AND project_id = $2', [id, projectId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found in this project' });
    }
    const existingTask = taskCheck.rows[0];

    // Fetch the user's role in this project
    const roleCheck = await db.query(
      `SELECT role FROM pm_project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, req.user.id]
    );
    const userRole = roleCheck.rows.length > 0 ? roleCheck.rows[0].role : null;

    let cleanAssignedTo = (assigned_to && assigned_to.trim() !== '') ? assigned_to : null;
    let cleanDueDate = (due_date && due_date.trim() !== '') ? due_date : null;

    if (userRole === 'member') {
      // Overwrite changes to assignee and due date with existing values from the database
      cleanAssignedTo = existingTask.assigned_to;
      cleanDueDate = existingTask.due_date;
    }

    const result = await db.query(
      `UPDATE pm_tasks
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           status = COALESCE($3, status),
           priority = COALESCE($4, priority),
           assigned_to = $5,
           position = COALESCE($6, position),
           due_date = $7
       WHERE id = $8 AND project_id = $9
       RETURNING *`,
      [
        title || null,
        description || null,
        status || null,
        priority || null,
        cleanAssignedTo,
        position !== undefined ? position : null,
        cleanDueDate,
        id,
        projectId
      ]
    );

    const updatedTask = result.rows[0];

    // Fetch assignee details
    if (updatedTask.assigned_to) {
      const uRes = await db.query('SELECT full_name as assignee_name, avatar_color as assignee_avatar_color, email as assignee_email FROM pm_users WHERE id = $1', [updatedTask.assigned_to]);
      if (uRes.rows.length > 0) {
        Object.assign(updatedTask, uRes.rows[0]);
      }
    }

    broadcastProjectUpdate(req, projectId, 'TASK_UPDATED', updatedTask);

    res.json(updatedTask);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Server error updating task' });
  }
});

// DELETE /api/projects/:projectId/tasks/:id - Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
  const { projectId, id } = req.params;

  try {
    // Check access
    const accessCheck = await db.query(
      `SELECT 1 FROM pm_projects p
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [projectId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const taskCheck = await db.query('SELECT id FROM pm_tasks WHERE id = $1 AND project_id = $2', [id, projectId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found in this project' });
    }

    await db.query('DELETE FROM pm_tasks WHERE id = $1 AND project_id = $2', [id, projectId]);

    broadcastProjectUpdate(req, projectId, 'TASK_DELETED', { id });

    res.json({ message: 'Task deleted successfully', id });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error deleting task' });
  }
});

module.exports = router;
