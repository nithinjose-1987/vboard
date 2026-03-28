# V Board – Vadakkekkara Group

Leaderboard dashboard with event calendar, admin panel, image uploads, and SQLite persistence.

## Quick Start

```bash
# 1. Install dependencies (requires Node.js 18+)
cd vboard
npm install

# 2. Run
npm start
```

Open **http://localhost:3000** in your browser.

## Admin Access

Password: **`VG@2026`**

Click **Admin Login** in the top-right corner.

To change the password, set the `ADMIN_PASSWORD` environment variable before starting:
```bash
ADMIN_PASSWORD=MySecret123 npm start
```

## Features

- 🏆 **5 pre-loaded leaderboards** – Aaanyottam (🐘 Elephant Race), Poorathon (🚶 Walk it), VallamKalim (🚣 Kerala Boat Race), Vey Raja (🎲 Gamble Away), Election Predictor (🗳️)
- 📅 **Event calendar** – monthly view with coloured event dots; click any day or event for details
- 🖼 **Image uploads** – attach images to events and leaderboard icons (up to 8 MB)
- ⚙️ **Admin panel** – add/edit/delete participants, create new leaderboards, manage events
- 💾 **SQLite database** – data persists across restarts; events older than 30 days are auto-cleaned

## Structure

```
vboard/
├── server.js          Express API server
├── db.js              SQLite setup + seed data
├── package.json
├── vboard.db          Database (auto-created on first run)
├── uploads/           Uploaded images (auto-created)
└── public/
    └── index.html     Single-page React dashboard
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth | – | Verify admin password |
| GET | /api/leaderboards | – | All boards + participants |
| POST | /api/leaderboards | Admin | Create board |
| PUT | /api/leaderboards/:id | Admin | Update board |
| DELETE | /api/leaderboards/:id | Admin | Delete board |
| POST | /api/leaderboards/:id/image | Admin | Upload board image |
| POST | /api/leaderboards/:id/participants | Admin | Add participant |
| PUT | /api/participants/:id | Admin | Edit participant |
| DELETE | /api/participants/:id | Admin | Remove participant |
| GET | /api/events | – | All events |
| POST | /api/events | Admin | Create event + image |
| PUT | /api/events/:id | Admin | Update event + image |
| DELETE | /api/events/:id | Admin | Delete event |

Admin requests require the `x-admin-password` header.

## Deploying to a Web Server

Any Node.js host works (Railway, Render, Fly.io, VPS, etc.):

1. Copy the `vboard/` folder to the server
2. Run `npm install --production`
3. Set `PORT` and `ADMIN_PASSWORD` environment variables
4. Run `npm start` (or use PM2 / systemd for a persistent process)
