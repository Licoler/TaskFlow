require('dotenv').config();

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
});

const email = process.env.SEED_USER_EMAIL || 'test@test.com';
const password = process.env.SEED_USER_PASSWORD || 'test1234';
const sampleTasks = [
  { title: 'Create a TaskFlow account', status: 'done' },
  { title: 'Connect the frontend to the API', status: 'todo' },
  { title: 'Deploy the project', status: 'todo' }
];

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, email`,
      [email, passwordHash]
    );
    const user = userResult.rows[0];

    await client.query('DELETE FROM tasks WHERE user_id = $1', [user.id]);

    for (const task of sampleTasks) {
      await client.query(
        'INSERT INTO tasks (user_id, title, status) VALUES ($1, $2, $3)',
        [user.id, task.title, task.status]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${email} with ${sampleTasks.length} tasks.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
