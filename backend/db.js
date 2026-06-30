const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Connection config
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/codealpha_project_management';
const isNeon = connectionString.includes('neon.tech');

const pool = new Pool({
  connectionString,
  ssl: (isProduction || isNeon) ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('Connected to the PostgreSQL database.');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

// Auto-run migrations to create schema
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Initializing database schema if not exists...');
    
    // Create UUID extension if not exists
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // pm_users Table (prefixed to avoid clashes with other tasks' tables)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pm_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        avatar_color VARCHAR(7) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // pm_projects Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pm_projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id UUID REFERENCES pm_users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // pm_project_members Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pm_project_members (
        project_id UUID REFERENCES pm_projects(id) ON DELETE CASCADE,
        user_id UUID REFERENCES pm_users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        PRIMARY KEY (project_id, user_id)
      );
    `);

    // pm_tasks Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pm_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES pm_projects(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'todo',
        priority VARCHAR(50) DEFAULT 'medium',
        assigned_to UUID REFERENCES pm_users(id) ON DELETE SET NULL,
        position INTEGER DEFAULT 0,
        due_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // pm_comments Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pm_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES pm_tasks(id) ON DELETE CASCADE,
        user_id UUID REFERENCES pm_users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database initialization completed successfully.');
  } catch (error) {
    console.error('Error initializing database schema:', error);
  } finally {
    client.release();
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initializeDatabase
};
