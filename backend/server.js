const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./db');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure CORS for Express
app.use(cors({
  origin: '*', // Allow all origins for dev/testing ease
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Set up Socket.IO
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store io instance on the app object to make it accessible in routes
app.set('io', io);

// WebSocket Connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join room for a specific project
  socket.on('join_project', (projectId) => {
    socket.join(projectId);
    console.log(`Socket ${socket.id} joined project room: ${projectId}`);
  });

  // Leave room for a specific project
  socket.on('leave_project', (projectId) => {
    socket.leave(projectId);
    console.log(`Socket ${socket.id} left project room: ${projectId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Import route modules
const { router: authRouter } = require('./routes/auth');
const projectsRouter = require('./routes/projects');
const tasksRouter = require('./routes/tasks');
const commentsRouter = require('./routes/comments');

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);

// Nest tasks under projects
projectsRouter.use('/:projectId/tasks', tasksRouter);
// Nest comments under tasks
tasksRouter.use('/:taskId/comments', commentsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

const path = require('path');
// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Fallback unmatched non-API routes to index.html for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Initialize database and start the server
const PORT = process.env.PORT || 5000;

// Auto-run schema setup for serverless contexts on module load
db.initializeDatabase();

if (process.env.VERCEL) {
  // Export app for Vercel Serverless Function context
  module.exports = app;
} else {
  const startServer = async () => {
    try {
      server.listen(PORT, () => {
        console.log(`Luxury Backend server is running on port ${PORT}`);
      });
    } catch (error) {
      console.error('Failed to start backend server:', error);
      process.exit(1);
    }
  };
  startServer();
}
