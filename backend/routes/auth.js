const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'luxury_stealth_wealth_secret_key_123';

// Generate a random high-end/luxury looking color code for user avatars
function getRandomAvatarColor() {
  const luxuryColors = [
    '#38BDF8', // Ice Blue
    '#E2E8F0', // Platinum
    '#94A3B8', // Slate Grey
    '#0EA5E9', // Sky Accent
    '#0284C7', // Deep Slate Accent
    '#60A5FA', // Premium Blue
    '#F1F5F9'  // Pearl
  ];
  return luxuryColors[Math.floor(Math.random() * luxuryColors.length)];
}

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. Token missing.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, fullName } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const userExist = await db.query('SELECT * FROM pm_users WHERE email = $1', [email.toLowerCase()]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const avatarColor = getRandomAvatarColor();

    const result = await db.query(
      'INSERT INTO pm_users (email, password_hash, full_name, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, avatar_color, created_at',
      [email.toLowerCase(), passwordHash, fullName, avatarColor]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM pm_users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_color: user.avatar_color,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT id, email, full_name, avatar_color, created_at FROM pm_users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ error: 'Server error fetching user profile' });
  }
});

module.exports = {
  router,
  authenticateToken
};
