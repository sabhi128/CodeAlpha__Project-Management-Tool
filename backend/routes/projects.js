const express = require('express');
const db = require('../db');
const { authenticateToken } = require('./auth');
const router = express.Router();

// GET /api/projects - Get all projects the user owns or is a member of
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, u.full_name as owner_name, u.avatar_color as owner_avatar_color, pm.role as user_role
       FROM pm_projects p
       JOIN pm_users u ON p.owner_id = u.id
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       WHERE p.owner_id = $1 OR pm.user_id = $1
       GROUP BY p.id, u.id, pm.role
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch projects error:', error);
    res.status(500).json({ error: 'Server error fetching projects' });
  }
});

// GET /api/projects/:id - Get details of a single project
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is owner or member
    const accessCheck = await db.query(
      `SELECT 1 FROM pm_projects p
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
      [req.params.id, req.user.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const result = await db.query(
      `SELECT p.*, u.full_name as owner_name, u.email as owner_email, u.avatar_color as owner_avatar_color, pm.role as user_role
       FROM pm_projects p
       JOIN pm_users u ON p.owner_id = u.id
       LEFT JOIN pm_project_members pm ON p.id = pm.project_id AND pm.user_id = $2
       WHERE p.id = $1`,
      [req.params.id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch project detail error:', error);
    res.status(500).json({ error: 'Server error fetching project details' });
  }
});

// POST /api/projects - Create a new project
router.post('/', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const result = await db.query(
      'INSERT INTO pm_projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.id]
    );
    const newProject = result.rows[0];

    // Automatically add owner to project members
    await db.query(
      'INSERT INTO pm_project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
      [newProject.id, req.user.id, 'owner']
    );

    res.status(201).json(newProject);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Server error creating project' });
  }
});

// PUT /api/projects/:id - Update project
router.put('/:id', authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    // Only owner can update
    const checkOwner = await db.query('SELECT owner_id FROM pm_projects WHERE id = $1', [req.params.id]);
    if (checkOwner.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (checkOwner.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the project owner can update this project' });
    }

    const result = await db.query(
      'UPDATE pm_projects SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Server error updating project' });
  }
});

// DELETE /api/projects/:id - Delete project
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Only owner can delete
    const checkOwner = await db.query('SELECT owner_id FROM pm_projects WHERE id = $1', [req.params.id]);
    if (checkOwner.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (checkOwner.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the project owner can delete this project' });
    }

    await db.query('DELETE FROM pm_projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Server error deleting project' });
  }
});

// GET /api/projects/:id/members - Get all members of the project
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_color, pm.role
       FROM pm_users u
       JOIN pm_project_members pm ON u.id = pm.user_id
       WHERE pm.project_id = $1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch members error:', error);
    res.status(500).json({ error: 'Server error fetching project members' });
  }
});

// POST /api/projects/:id/members - Add a user to a project
router.post('/:id/members', authenticateToken, async (req, res) => {
  const { email, role } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email of the user is required' });
  }

  try {
    // Check if the current user is a project member with permission (owner/admin)
    const checkRole = await db.query(
      `SELECT role FROM pm_project_members WHERE project_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (checkRole.rows.length === 0 || (checkRole.rows[0].role !== 'owner' && checkRole.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only owners or admins can add members to a project' });
    }

    // Find the user to add
    const userResult = await db.query('SELECT id, full_name, email, avatar_color FROM pm_users WHERE email = $1', [email.toLowerCase()]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'User with this email not found' });
    }
    const targetUser = userResult.rows[0];

    // Check if already a member
    const checkExist = await db.query(
      'SELECT 1 FROM pm_project_members WHERE project_id = $1 AND user_id = $2',
      [req.params.id, targetUser.id]
    );
    if (checkExist.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    // Add member
    await db.query(
      'INSERT INTO pm_project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
      [req.params.id, targetUser.id, role || 'member']
    );

    res.status(201).json({
      message: 'Member added successfully',
      user: {
        id: targetUser.id,
        full_name: targetUser.full_name,
        email: targetUser.email,
        avatar_color: targetUser.avatar_color,
        role: role || 'member'
      }
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Server error adding member' });
  }
});

module.exports = router;
