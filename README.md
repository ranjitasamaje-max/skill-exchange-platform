# Skill Exchange Platform

An existing HTML/CSS/vanilla JavaScript frontend with a Node.js, Express, and
Mongoose API. The API connects to the MongoDB database named in the configured
Atlas URI. It does not create, reset, or migrate existing collections.

## Local configuration and startup

The backend loads `backend/.env` and requires:

- `MONGO_URI` (or `MONGODB_URI`): the Atlas connection URI, including its
  configured database name.
- `JWT_SECRET`: a random secret with at least 32 UTF-8 bytes.
- `PORT` (optional; defaults to `5000`).

Use `backend/.env.example` for variable names only. `.gitignore` excludes
both `.env` files; never copy credentials or tokens into frontend files.

From the project root, either run the backend and frontend separately:

```powershell
npm run server
npm run frontend
```

Or start both with:

```powershell
npm run dev
```

On Windows, you can also double-click `Start Skill Exchange.bat` in the
project folder. It starts both services in a terminal and opens the app in
your browser. Keep that terminal open while using the app. Double-clicking
`frontend/index.html` directly does not start the backend, so signup, login,
and other API features will not work from that file URL.

To use the VS Code Live Server **Go Live** button, open the project root folder
in VS Code and allow the recommended backend task to run when prompted. The
workspace settings serve `frontend` on port `8080`, while the task starts (or
reuses) the API on port `5000`. Then open `frontend/index.html` and click **Go
Live**. If VS Code did not run the task, start the API from the project-root
terminal with `npm run server` before clicking **Go Live**.

Keep the terminal running the server(s) open. The package scripts configure
the backend on port `5000` (bound to all interfaces) and serve `frontend` on
port `8080` (also bound to all interfaces). Open
[http://localhost:8080/index.html](http://localhost:8080/index.html) on the
host computer. The API address is configured once in `frontend/js/config.js`;
it uses the browser's current host name or IP and port `5000`.

For a college demonstration on the same Wi-Fi, find the host computer's
private IPv4 address with:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
	$_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and
	$_.InterfaceAlias -notmatch 'Loopback|Virtual|WSL|vEthernet'
} | Select-Object InterfaceAlias,IPAddress
```

On another device connected to the same network, open
`http://<host-LAN-IP>:8080/index.html` (for example,
`http://192.168.1.25:8080/index.html`). Windows Firewall must allow inbound
TCP ports `8080` and `5000` on the private network. The backend must also be
able to reach Atlas; Atlas Network Access must allow the host computer's
outbound public IP. Do not open Atlas or the database port to the demonstration
devices. A different Wi-Fi/network needs a reachable hosted frontend and
backend; local IP addresses are not reachable across networks. This project is
not deployed by these development settings.

## Authentication

- `POST /api/auth/signup` — JSON `name`, `email`, and `password`; optional
  `location`, `skillsToTeach`, and `skillsToLearn`. Returns `201` and a JWT.
- `POST /api/auth/login` — JSON `email` and `password`; returns `200` and a JWT.
- `GET /api/auth/me` — authenticated profile.
- `PATCH /api/auth/me` — authenticated profile updates for `name`, `location`,
  `skillsToTeach`, and `skillsToLearn`.
- `DELETE /api/auth/me` — deletes only the authenticated account and, in one
  MongoDB transaction, its linked skills, requests, and learning exchanges.
  Account deletion is available only in the Profile page.

Passwords are validated and hashed with bcryptjs. Responses omit password
hashes. Email is normalized and unique. Private APIs require
`Authorization: Bearer <token>`. The frontend stores only the one-hour JWT in
`localStorage` as `skillExchangeToken`; it never stores the password.
`localStorage` is accessible to same-origin JavaScript, so production systems
should consider secure HttpOnly/SameSite cookies and appropriate CSRF
protections.

The legacy `POST /api/users` and `POST /api/users/login` endpoints remain
available. Account creation must include a password; use the signup page for
normal registration. The public member directory omits email addresses.

## Skills and search

- `GET /api/skills/available?search=<text>` — public database-backed skill
  search across skill names and teacher names; results include owner name and
  location.
- `GET /api/skills` — list skill records with owner details.
- `POST /api/skills` — authenticated skill creation with `skillName` and
  optional `description`; ownership is taken from the token.
- `PUT /api/skills/:id`, `DELETE /api/skills/:id` — authenticated owner-only
  operations. A referenced skill cannot be deleted.

The Skills page uses the available-skills API for every search; it does not
ship a hardcoded skill directory.

Signup and login requests are rate limited. Learning-request creation is
limited to 30 attempts per client IP in 15 minutes.

## Learning requests and exchanges

`POST /api/requests` requires a bearer token. The token identifies the sender.
The receiver and requested skill are required; `offeredSkill` and a message
(up to 1000 characters) are optional:

```json
{
  "receiver": "teacher-user-id",
  "requestedSkill": "teacher-skill-id",
  "offeredSkill": "optional-sender-skill-id",
  "message": "Optional note for the teacher"
}
```

Omit `offeredSkill` (or send an empty value) for one-way learning. When present,
the offered skill must belong to the sender; the requested skill must belong
to the receiver. Self-requests, invalid references, duplicate pending
requests, and duplicate active exchanges are rejected. Requests remain
`pending` until the receiver decides.

- `GET /api/requests`, `/api/requests/incoming`, `/api/requests/outgoing` —
  authenticated participant-scoped records. Optional `status` filter:
  `pending`, `accepted`, `rejected`, or `cancelled`.
- `POST /api/requests/:id/accept` — receiver-only; transactionally marks the
  request accepted and creates one active learning record.
- `POST /api/requests/:id/reject` — receiver-only; rejected requests do not
  create learning records.
- `DELETE /api/requests/:id` — authenticated requester-only cancellation of a
  pending request. The request remains in history with `cancelled` status.
- `GET /api/exchanges/active`, `GET /api/exchanges?status=completed` — only
  exchanges involving the authenticated user.
- `PATCH /api/exchanges/:id/progress` — participant progress update with
  `direction` (`sender` or `receiver`), optional `percentage` (0-100), and/or
  `note`. One-way requests track learning progress for the requesting learner.
- `PATCH /api/exchanges/:id/complete` — either participant can complete an
  active exchange.

For a two-way exchange, the sender learns the receiver's requested skill and
the receiver learns the sender's offered skill. For a one-way request, the
requester learns the requested skill from the teacher, and no return skill is
stored. The dashboard renders both cases from each participant's perspective.
Repeated decisions return a conflict response and cannot create a second
record.

## Data and MongoDB Compass

Mongoose models use their default collection names: `users`, `skills`,
`requests`, and `learningexchanges`. The database itself is the database named
in `MONGO_URI`; do not assume a particular Atlas database name. Existing
documents are not deleted or automatically migrated. Older unlinked requests
remain visible but cannot be accepted unless their required user/skill
references are present.

To inspect data in Compass, connect with the same Atlas URI configured in the
local `backend/.env` (do not paste it into source code or screenshots). Select
the same database name from the URI, refresh the database/collection list, and
inspect the corresponding collection:

- New registration: `users`; inspect the email and confirm the password field
  is a bcrypt hash, not the submitted password.
- Added teachable skill: `skills`; inspect `userId` and confirm it matches the
  owner's `_id`.
- Sent request: `requests`; inspect sender, receiver, requested skill,
  optional offered skill, status, and timestamps.
- Accepted request: inspect the request's `accepted` status and the matching
  `learningexchanges` document with participants, skills, start date, status,
  and progress.
- Rejected request: inspect its `rejected` status and confirm no corresponding
  learning record was created.

Compass access is a manual verification step; the app does not control or
report Compass's UI state.

## Manual API test outline

Use Postman, Thunder Client, or another API client. Sign up two distinct test
accounts, log both in, and use each returned token as a bearer token. Create
each participant's skills with `POST /api/skills`, browse/search with
`GET /api/skills/available?search=...`, and submit a two-way request or omit
`offeredSkill` for one-way learning. Log in as the teacher to inspect incoming
requests and accept/reject. Then refresh both dashboards and inspect the
participant-scoped active/completed exchange APIs. Try the same decision
twice, use a different participant's token, omit required fields, and submit
an invalid MongoDB ID to verify the conflict, permission, and validation
responses. Avoid using real personal data for test accounts.

No frontend framework or new runtime dependency is required.
