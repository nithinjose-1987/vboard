/**
 * db.js  –  SQLite via Node.js built-in `node:sqlite` (Node 22+).
 * No native compilation needed.
 */

const { DatabaseSync } = require('node:sqlite');
const path   = require('path');
const crypto = require('crypto');
const fs     = require('fs');

// On Railway, set DATA_DIR env var to the mounted volume path (e.g. /data)
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'vboard.db'));

function uid() { return crypto.randomBytes(6).toString('hex'); }

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS leaderboards (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    subtitle   TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '🏆',
    color      TEXT NOT NULL DEFAULT '#6366F1',
    unit       TEXT NOT NULL DEFAULT 'pts',
    image_url  TEXT,
    sort_ord   INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS participants (
    id         TEXT PRIMARY KEY,
    board_id   TEXT NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    score      REAL NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    short_name  TEXT NOT NULL,
    description TEXT DEFAULT '',
    date        TEXT NOT NULL,
    time        TEXT DEFAULT '10:00',
    timezone    TEXT DEFAULT 'Asia/Kolkata',
    color       TEXT DEFAULT '#6366F1',
    image_url      TEXT,
    link_url       TEXT DEFAULT '',
    attachment_url TEXT,
    created_at  INTEGER DEFAULT (unixepoch()),
    updated_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    image_url   TEXT,
    sort_ord    INTEGER DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS highlights (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    image_url   TEXT,
    sort_ord    INTEGER DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch())
  );
`);

// ── Migrations (safe to run on existing DB) ───────────────────
// Add link_url if upgrading from an older schema
try { db.exec("ALTER TABLE events ADD COLUMN link_url TEXT DEFAULT ''"); } catch (_) {}
// Add attachment_url if upgrading from an older schema
try { db.exec("ALTER TABLE events ADD COLUMN attachment_url TEXT"); } catch (_) {}
// Add photos table if upgrading
try { db.exec(`CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', image_url TEXT, sort_ord INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))`); } catch (_) {}
// Add highlights table if upgrading
try { db.exec(`CREATE TABLE IF NOT EXISTS highlights (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', image_url TEXT, sort_ord INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()))`); } catch (_) {}
try { db.exec(`ALTER TABLE highlights ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch (_) {}
// Fix old spelling of VallamKali
db.exec("UPDATE leaderboards SET name='VallamKali' WHERE name='VallamKalim'");
db.exec("UPDATE leaderboards SET subtitle='Kerala Boat Race' WHERE id='vallamkalim' OR id='vallamkali'");
// Replace placeholder Aaanyottam data with real data (if still placeholder)
{
  const first = db.prepare("SELECT name FROM participants WHERE board_id='aaanyottam' ORDER BY score DESC LIMIT 1").get();
  if (first && first.name === 'Rajesh Kumar') {
    db.exec("DELETE FROM participants WHERE board_id='aaanyottam'");
    const ins = db.prepare("INSERT INTO participants (id,board_id,name,score) VALUES (?,?,?,?)");
    [['ajay',64],['Royal',53],['Dundu',42],['Anna_Kuttu',42],
     ['Jenny',31],['Lechu',30],['m@g',26],['Dew',25],['Vishnu',24],['RoRo',0]
    ].forEach(([n,s]) => ins.run(uid(),'aaanyottam',n,s));
    console.log('✅  Aaanyottam updated with real participant data.');
  }
}

// ── Seed (only when DB is brand new) ─────────────────────────
const boardCount = db.prepare('SELECT COUNT(*) AS c FROM leaderboards').get().c;

if (boardCount === 0) {
  const insBoard = db.prepare(
    `INSERT INTO leaderboards (id,name,subtitle,emoji,color,unit,sort_ord)
     VALUES (?,?,?,?,?,?,?)`
  );
  const insP = db.prepare(
    `INSERT INTO participants (id,board_id,name,score) VALUES (?,?,?,?)`
  );
  const insEvent = db.prepare(
    `INSERT INTO events (id,short_name,description,date,time,timezone,color,link_url)
     VALUES (?,?,?,?,?,?,?,?)`
  );

  const BOARDS = [
    {
      id:'aaanyottam', name:'Aaanyottam', subtitle:'Elephant Race',
      emoji:'🐘', color:'#F97316', unit:'pts', ord:0,
      participants:[
        ['ajay',64],['Royal',53],['Dundu',42],['Anna_Kuttu',42],
        ['Jenny',31],['Lechu',30],['m@g',26],['Dew',25],['Vishnu',24],['RoRo',0],
      ]
    },
    {
      // Measured in steps. No results yet — shows "Coming Soon".
      id:'poorathon', name:'Poorathon', subtitle:'Walk it',
      emoji:'🚶', color:'#22C55E', unit:'steps', ord:1,
      participants:[]
    },
    {
      // Three registered teams; scores updated by admin after races.
      id:'vallamkali', name:'VallamKali', subtitle:'Kerala Boat Race',
      emoji:'🚣', color:'#3B82F6', unit:'pts', ord:2,
      participants:[
        ['Vadakkekkara',  0],
        ['Kizhakkekkara', 0],
        ['Arppookkara',   0],
      ]
    },
    {
      // No results yet — shows "Coming Soon".
      id:'vey-raja', name:'Vey Raja', subtitle:'Gamble Away',
      emoji:'🎲', color:'#A855F7', unit:'pts', ord:3,
      participants:[]
    },
    {
      // No results yet — shows "Coming Soon".
      id:'election-predictor', name:'Election Predictor', subtitle:'Predict!',
      emoji:'🗳️', color:'#F59E0B', unit:'% acc', ord:4,
      participants:[]
    },
  ];

  const EVENTS = [
    ['E-Race Q1',
     'First quarter Aaanyottam Elephant Race. All participants must register before the event starts. Prizes for top 3 finishers.',
     '2026-04-05','10:00','Asia/Kolkata','#F97316',''],
    ['Poorathon Apr',
     'Monthly walkerthon for April. Track your steps using any fitness app and submit by end of month. Top walkers win!',
     '2026-04-15','06:00','Asia/Kolkata','#22C55E',''],
    ['Vallam Finals',
     'VallamKali boat race finals at Punnamada Lake. Teams must arrive 2 hours before start. Spectators welcome!',
     '2026-04-20','09:00','Asia/Kolkata','#3B82F6',''],
    ['VG Annual Meet',
     'Annual gathering of Vadakkekkara Group members. Grand ceremony, cultural events, and prize distribution for all category winners.',
     '2026-05-10','18:00','Asia/Kolkata','#6366F1',''],
  ];

  db.exec('BEGIN');
  try {
    BOARDS.forEach(b => {
      insBoard.run(b.id, b.name, b.subtitle, b.emoji, b.color, b.unit, b.ord);
      b.participants.forEach(([name, score]) => insP.run(uid(), b.id, name, score));
    });
    EVENTS.forEach(([sn, desc, date, time, tz, color, link]) => {
      insEvent.run(uid(), sn, desc, date, time, tz, color, link);
    });
    db.exec('COMMIT');
    console.log('✅  Database seeded with initial data.');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ── 120-day cleanup ───────────────────────────────────────────
const cleaned = db.prepare(`DELETE FROM events WHERE date < date('now','-120 days')`).run();
if (cleaned.changes > 0) console.log(`🧹  Removed ${cleaned.changes} old events.`);

module.exports = { db, uid };
