require('dotenv').config();

const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;

if (!jwtSecret) throw new Error('JWT_SECRET is required');
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const ALLOWED_ORIGINS = [
  'https://task-flow-two-dun.vercel.app',
  'http://localhost:8000',
  'http://localhost:3000'
];

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDb(databaseUrl) ? false : { rejectUnauthorized: false }
});


function isLocalDb(url) {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function normalizeStatus(raw) {
  if (raw == null || raw === '') return 'todo';
  return String(raw).trim().toLowerCase();
}

function isValidStatus(status) {
  return status === 'todo' || status === 'done';
}

function parseTaskId(value) {
  return /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;
}

function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

function authMiddleware(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Authentication token is required' });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function handleLogin(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ token: createToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = rows[0];

    res.status(201).json({ token: createToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    next(err);
  }
});

app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

app.get('/api/tasks', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, status, created_at, updated_at FROM tasks WHERE user_id = $1 ORDER BY id ASC',
      [req.user.id]
    );
    res.json(rows.map(toTask));
  } catch (err) {
    next(err);
  }
});

app.post('/api/tasks', authMiddleware, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const status = normalizeStatus(req.body.status);

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!isValidStatus(status)) return res.status(400).json({ error: 'Status must be todo or done' });

    const { rows } = await pool.query(
      'INSERT INTO tasks (user_id, title, status) VALUES ($1, $2, $3) RETURNING id, title, status, created_at, updated_at',
      [req.user.id, title, status]
    );
    res.status(201).json(toTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

app.patch('/api/tasks/:id', authMiddleware, async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Task id must be a number' });

    const hasTitle = Object.prototype.hasOwnProperty.call(req.body, 'title');
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');

    if (!hasTitle && !hasStatus) {
      return res.status(400).json({ error: 'Provide title or status to update' });
    }

    const title = hasTitle ? String(req.body.title || '').trim() : null;
    const status = hasStatus ? normalizeStatus(req.body.status) : null;

    if (hasTitle && !title) return res.status(400).json({ error: 'Title cannot be empty' });
    if (hasStatus && !isValidStatus(status)) return res.status(400).json({ error: 'Status must be todo or done' });

    const { rows, rowCount } = await pool.query(
      `UPDATE tasks
       SET title = COALESCE($1, title), status = COALESCE($2, status)
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, status, created_at, updated_at`,
      [title, status, id, req.user.id]
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(toTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

app.delete('/api/tasks/:id', authMiddleware, async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Task id must be a number' });

    const { rowCount } = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

if (require.main === module) {
  app.listen(port, () => console.log(`TaskFlow API listening on port ${port}`));
}

module.exports = app;
