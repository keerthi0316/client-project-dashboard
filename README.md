# Real-Time Client Project Dashboard

Full-stack technical assessment implementation: React + TypeScript, Node.js + Express + TypeScript, PostgreSQL, Prisma, Socket.IO, node-cron and JWT authentication.

## Features
- Admin / Project Manager / Developer RBAC enforced at API and WebSocket layers.
- Short-lived access JWT plus rotating refresh token in an HttpOnly cookie. Refresh tokens are hashed in PostgreSQL.
- PM project ownership and Developer task ownership checks prevent direct API access to other users' resources.
- Projects, clients, tasks, task status history/activity records and notifications.
- Socket.IO project rooms, global presence, live activity and live notification events.
- Last 20 authorized activity events are fetched from PostgreSQL after reconnect/offline.
- Admin, PM and Developer dashboards.
- Task filtering by status, priority and due-date query parameters.
- node-cron background job flags overdue unfinished tasks every 15 minutes.
- Server-side Zod validation and consistent JSON errors.
- Seed data with 1 admin, 2 PMs, 4 developers, 3 projects, 18 tasks, overdue tasks and activity history.

## Architecture decisions
Socket.IO was chosen for authenticated bidirectional communication, room-based project broadcasts, reconnect support and presence. node-cron is sufficient for the lightweight recurring overdue scan; a larger deployment could use BullMQ/Redis for durable retries and distributed workers. Prisma keeps relational access typed and service-oriented. Refresh tokens are stored only in an HttpOnly cookie and their hashes are persisted in PostgreSQL; access tokens are held in browser memory.

## Local setup
1. Copy `.env.example` to `server/.env` and replace the secrets.
2. Start PostgreSQL: `docker compose up -d`.
3. Install dependencies: `npm install`, then `npm run install:all`.
4. In `server`, run `npx prisma generate`, `npx prisma migrate dev --name init`, and `npm run db:seed`.
5. Start both apps with `npm run dev`.
6. Open http://localhost:5173.

Seed password for every account: `Password123!`

Accounts:
- admin@example.com
- pm1@example.com
- pm2@example.com
- dev1@example.com through dev4@example.com

## API
`/api/auth`, `/api/users` (extensible), `/api/clients`, `/api/projects`, `/api/tasks`, `/api/activity`, `/api/notifications`, `/api/dashboard`.

## Database indexes
Indexes exist on project creator/client, task project/developer/status/priority/due date, activity project/user/task plus timestamp, notification user/read and refresh-token user. These support the ownership filters, task dashboards, activity history and unread notification queries.

## Security notes
No secrets are committed. Role checks are performed on the backend. WebSocket project-room membership is checked against project ownership/task assignment. Error responses never expose stack traces.

## Deployment
The React client can be deployed to Vercel. The API should run on a persistent Node host that supports long-lived WebSocket connections; configure `CLIENT_URL`, database URL and JWT secrets in that host's environment. Set `VITE_API_URL` in the client build environment to the public API `/api` base URL.

## Known limitations
- The demo uses a single Socket.IO process; a multi-instance deployment should add a Socket.IO Redis adapter.
- The overdue scheduler runs inside the API process; use a dedicated worker/BullMQ in a horizontally scaled production environment.
- The demo UI intentionally focuses on the assessment's required flows rather than full design-system polish.
