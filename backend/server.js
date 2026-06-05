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

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
});

// Разрешаем CORS для твоего фронтенда на Vercel и локальных адресов
app.use(cors({
  origin: ['https://task-flow-two-dun.vercel.app', 'http://localhost:8000', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Логирование всех входящих запросов (полезно для отладки)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeStatus(status) {
  if (typeof status === 'undefined' || status === null || status === '') return 'todo';
  return String(status).trim().toLowerCase();
}

function validateStatus(status) {
  return ['todo', 'done'].includes(status);
}

function parseTaskId(value) {
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  return Number(value);
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

function authMiddleware(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Authentication token is required' });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Регистрация
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
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({
      token: createToken(user),
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    next(error);
  }
});

// Логин (основной обработчик для /api/auth/login)
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      token: createToken(user),
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    next(error);
  }
});

// ========== АЛИАС для старых запросов на /api/login ==========
app.post('/api/login', async (req, res, next) => {
  // Просто перенаправляем логику на основной обработчик, сохраняя контекст
  // Можно скопировать код, но лучше переиспользовать: вызываем тот же обработчик,
  // изменив url (не обязательно). Для простоты – копируем код из /api/auth/login.
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      token: createToken(user),
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    next(error);
  }
});
// =============================================================

// Получить все задачи пользователя
app.get('/api/tasks', authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, status, created_at, updated_at
       FROM tasks
       WHERE user_id = $1
       ORDER BY id ASC`,
      [req.user.id]
    );
    res.json(result.rows.map(toTask));
  } catch (error) {
    next(error);
  }
});

// Создать задачу
app.post('/api/tasks', authMiddleware, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const status = normalizeStatus(req.body.status);
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!validateStatus(status)) {
      return res.status(400).json({ error: 'Status must be todo or done' });
    }

    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, status)
       VALUES ($1, $2, $3)
       RETURNING id, title, status, created_at, updated_at`,
      [req.user.id, title, status]
    );
    res.status(201).json(toTask(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

// Обновить задачу (заголовок или статус)
app.patch('/api/tasks/:id', authMiddleware, async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);
    const hasTitle = Object.prototype.hasOwnProperty.call(req.body, 'title');
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');
    const title = hasTitle ? String(req.body.title || '').trim() : null;
    const status = hasStatus ? normalizeStatus(req.body.status) : null;

    if (!id) {
      return res.status(400).json({ error: 'Task id must be a number' });
    }
    if (!hasTitle && !hasStatus) {
      return res.status(400).json({ error: 'Provide title or status to update' });
    }
    if (hasTitle && !title) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }
    if (hasStatus && !validateStatus(status)) {
      return res.status(400).json({ error: 'Status must be todo or done' });
    }

    const result = await pool.query(
      `UPDATE tasks
       SET title = COALESCE($1, title),
           status = COALESCE($2, status)
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, status, created_at, updated_at`,
      [title, status, id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(toTask(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

// Удалить задачу
app.delete('/api/tasks/:id', authMiddleware, async (req, res, next) => {
  try {
    const id = parseTaskId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Task id must be a number' });
    }
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Обработка 404 для несуществующих маршрутов
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Глобальный обработчик ошибок
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong' });
});

// Запуск сервера
if (require.main === module) {
  app.listen(port, () => {
    console.log(`TaskFlow API listening on port ${port}`);
  });
}

module.exports = app;
