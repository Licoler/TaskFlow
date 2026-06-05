# TaskFlow

[![Maintainability](https://qlty.sh/gh/Licoler/projects/TaskFlow/maintainability.svg)](https://qlty.sh/gh/Licoler/projects/TaskFlow)

TaskFlow is a full-stack todo app built from a vanilla JavaScript TodoMVC-style frontend and a Node.js API. Users can register, log in, and manage their own tasks through JWT-authenticated API requests backed by PostgreSQL.

Live deploy: [https://taskflow-licoler.vercel.app](https://task-flow-two-dun.vercel.app/#/)

## Tech Stack

- Vanilla JS
- Node.js
- Express
- PostgreSQL

## Test Credentials

- Email: `test@test.com`
- Password: `test1234`

## Run Locally

### 1. Create a PostgreSQL database

Use a free PostgreSQL provider such as Neon or Supabase, then copy the connection string.

Run the schema migration:

```sh
cd backend
psql "$DATABASE_URL" -f migrations/001_create_users_tasks.sql
```

### 2. Start the backend

```sh
cd backend
cp .env.example .env
npm install
npm run seed
npm start
```

Set these values in `backend/.env`:

```sh
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
JWT_SECRET=replace-with-a-long-random-secret
PORT=3000
```

The API runs at `http://localhost:3000`.

### 3. Start the frontend

From the project root:

```sh
npm install
npm start
```

Open `http://localhost:8000`.

The frontend defaults to `http://localhost:3000` for API requests. For a deployed backend, update `window.TASKFLOW_API_URL` in `index.html` or set `localStorage.taskflow_api_url` in the browser.

## API Endpoints

- `POST /api/auth/register` with `{ "email": "...", "password": "..." }`
- `POST /api/auth/login` with `{ "email": "...", "password": "..." }`
- `GET /api/tasks`
- `POST /api/tasks` with `{ "title": "...", "status": "todo" }`
- `PATCH /api/tasks/:id` with `{ "title": "..." }` or `{ "status": "done" }`
- `DELETE /api/tasks/:id`

Task routes require `Authorization: Bearer <token>`.

## Deploy

### Frontend on Vercel

1. Import this repository into Vercel.
2. Use the project root as the frontend root.
3. Keep the app as a static site; `vercel.json` handles fallback routing.
4. Point `window.TASKFLOW_API_URL` to the deployed backend URL.

### Backend on Render

1. Create a new Web Service from this repository.
2. Set the root directory to `backend`.
3. Use `npm install` as the build command.
4. Use `npm start` as the start command.
5. Add environment variables for `DATABASE_URL`, `JWT_SECRET`, and `PORT`.
6. Run `migrations/001_create_users_tasks.sql` against the Neon or Supabase database.
7. Run `npm run seed` once from the Render shell if you want the test account and sample tasks.

`backend/render.yaml` contains the same Render service configuration.

## Commit Plan

When you commit, use logical steps:

1. `feat: add backend express api with auth`
2. `feat: add postgresql schema and migrations`
3. `feat: connect frontend to api`
4. `docs: update readme with deploy instructions`
