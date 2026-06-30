const express = require('express');
const db = require('../db');
const { authenticateToken } = require('./auth');
const router = express.Router({ mergeParams: true });

// Helper to broadcast changes
const broadcastProjectUpdate = (req, projectId, type, data) => {
  const io = req.app.get('io');
  if (io) {
    io.to(projectId).emit('project_event', { type, data, projectId });
  }
};

// GET /api/projects/:projectId/tasks/:taskId/comments - Get all comments for a task
router.get('/', authenticateToken, async (req, res) => {
  const { projectId, taskId } = req.params;

  try {
    // Check project membership
    const accessCheck = await db.query(
      `SELECT 1 FROM pm_projects p
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [projectId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `SELECT c.*, u.full_name as author_name, u.avatar_color as author_avatar_color, u.email as author_email
       FROM pm_comments c
       JOIN pm_users u ON c.user_id = u.id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC`,
      [taskId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch comments error:', error);
    res.status(500).json({ error: 'Server error fetching comments' });
  }
});

// POST /api/projects/:projectId/tasks/:taskId/comments - Create a new comment
router.post('/', authenticateToken, async (req, res) => {
  const { projectId, taskId } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  try {
    // Check project membership
    const accessCheck = await db.query(
      `SELECT 1 FROM pm_projects p
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [projectId, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      'INSERT INTO pm_comments (task_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [taskId, req.user.id, content]
    );

    const newComment = result.rows[0];

    // Fetch author details
    const authorRes = await db.query('SELECT full_name as author_name, avatar_color as author_avatar_color, email as author_email FROM pm_users WHERE id = $1', [req.user.id]);
    Object.assign(newComment, authorRes.rows[0]);

    broadcastProjectUpdate(req, projectId, 'COMMENT_CREATED', { ...newComment, taskId });

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Server error adding comment' });
  }
});

// DELETE /api/projects/:projectId/tasks/:taskId/comments/:id - Delete a comment
router.delete('/:id', authenticateToken, async (req, res) => {
  const { projectId, taskId, id } = req.params;

  try {
    // Check if the comment belongs to the user or if the user owns the project
    const commentCheck = await db.query(
      `SELECT c.user_id, p.owner_id
       FROM pm_comments c
       JOIN pm_tasks t ON c.task_id = t.id
       JOIN pm_projects p ON t.project_id = p.id
       WHERE c.id = $1 AND c.task_id = $2`,
      [id, taskId]
    );

    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const { user_id, owner_id } = commentCheck.rows[0];

    if (user_id !== req.user.id && owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await db.query('DELETE FROM pm_comments WHERE id = $1', [id]);

    broadcastProjectUpdate(req, projectId, 'COMMENT_DELETED', { id, taskId });

    res.json({ message: 'Comment deleted successfully', id });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Server error deleting comment' });
  }
});

module.exports = router;
