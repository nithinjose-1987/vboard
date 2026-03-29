/**
 * server.js  –  V Board Express API + static server
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  POST   /api/auth                           verify admin password
 *  GET    /api/leaderboards                   list all boards + participants
 *  POST   /api/leaderboards                   create board          [admin]
 *  PUT    /api/leaderboards/:id               update board          [admin]
 *  DELETE /api/leaderboards/:id               delete board          [admin]
 *  POST   /api/leaderboards/:id/image         upload board image    [admin]
 *  POST   /api/leaderboards/:id/participants  add participant       [admin]
 *  PUT    /api/participants/:id               edit participant      [admin]
 *  DELETE /api/participants/:id               remove participant    [admin]
 *  GET    /api/events                         list all events
 *  POST   /api/events                         create event + image  [admin]
 *  PUT    /api/events/:id                     update event + image  [admin]
 *  DELETE /api/events/:id                     delete event          [admin]
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { db, uid } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ── Directories ───────────────────────────────────────────────
// DATA_DIR is set on Railway to the persistent volume path (e.g. /data)
const DATA_DIR    = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR  = path.join(__dirname, 'public');
[UPLOADS_DIR, PUBLIC_DIR].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));

// ── Core middleware ───────────────────────────────────────────
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Multer (image uploads) ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `img_${Date.now()}_${uid()}${ext}`);
  },
});
const ALLOWED_IMG_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const ALLOWED_FILE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf', '.doc', '.docx']);
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = file.fieldname === 'attachment'
      ? ALLOWED_FILE_EXTS.has(ext)
      : ALLOWED_IMG_EXTS.has(ext);
    cb(ok ? null : new Error('File type not allowed'), ok);
  },
});
const uploadEventFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]);

// ── Auth helpers ──────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (pass === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorised – invalid admin password' });
}

function deleteFile(url) {
  if (!url) return;
  try {
    const p = path.join(DATA_DIR, url);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) { /* ignore */ }
}

// ═════════════════════════════════════════════════════════════
//  AUTH
// ═════════════════════════════════════════════════════════════
app.post('/api/auth', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: 'Invalid password' });
});

// ═════════════════════════════════════════════════════════════
//  LEADERBOARDS
// ═════════════════════════════════════════════════════════════
app.get('/api/leaderboards', (_, res) => {
  const boards = db.prepare('SELECT * FROM leaderboards ORDER BY sort_ord, created_at').all();
  const allP   = db.prepare('SELECT * FROM participants ORDER BY score DESC').all();
  res.json(boards.map(b => ({
    ...b,
    participants: allP.filter(p => p.board_id === b.id),
  })));
});

app.post('/api/leaderboards', requireAdmin, (req, res) => {
  const { name, subtitle, emoji, color, unit } = req.body;
  if (!name || !subtitle) return res.status(400).json({ error: 'name and subtitle are required' });
  const id  = 'lb_' + uid();
  const ord = (db.prepare('SELECT COALESCE(MAX(sort_ord),0) AS m FROM leaderboards').get().m) + 1;
  db.prepare(`INSERT INTO leaderboards (id,name,subtitle,emoji,color,unit,sort_ord) VALUES (?,?,?,?,?,?,?)`)
    .run(id, name, subtitle, emoji || '🏆', color || '#6366F1', unit || 'pts', ord);
  res.status(201).json(db.prepare('SELECT * FROM leaderboards WHERE id=?').get(id));
});

app.put('/api/leaderboards/:id', requireAdmin, (req, res) => {
  const { name, subtitle, emoji, color, unit } = req.body;
  db.prepare(`UPDATE leaderboards SET name=?,subtitle=?,emoji=?,color=?,unit=? WHERE id=?`)
    .run(name, subtitle, emoji, color, unit, req.params.id);
  res.json(db.prepare('SELECT * FROM leaderboards WHERE id=?').get(req.params.id));
});

app.delete('/api/leaderboards/:id', requireAdmin, (req, res) => {
  const board = db.prepare('SELECT image_url FROM leaderboards WHERE id=?').get(req.params.id);
  deleteFile(board?.image_url);
  db.prepare('DELETE FROM leaderboards WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Board image upload ────────────────────────────────────────
app.post('/api/leaderboards/:id/image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  const board = db.prepare('SELECT image_url FROM leaderboards WHERE id=?').get(req.params.id);
  deleteFile(board?.image_url); // remove old image
  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE leaderboards SET image_url=? WHERE id=?').run(url, req.params.id);
  res.json({ image_url: url });
});

// ═════════════════════════════════════════════════════════════
//  PARTICIPANTS
// ═════════════════════════════════════════════════════════════
app.post('/api/leaderboards/:boardId/participants', requireAdmin, (req, res) => {
  const { name, score } = req.body;
  if (!name || score == null) return res.status(400).json({ error: 'name and score are required' });
  const id = 'p_' + uid();
  db.prepare(`INSERT INTO participants (id,board_id,name,score) VALUES (?,?,?,?)`)
    .run(id, req.params.boardId, name.trim(), parseFloat(score));
  res.status(201).json(db.prepare('SELECT * FROM participants WHERE id=?').get(id));
});

app.put('/api/participants/:id', requireAdmin, (req, res) => {
  const { name, score } = req.body;
  db.prepare(`UPDATE participants SET name=?,score=?,updated_at=unixepoch() WHERE id=?`)
    .run(name.trim(), parseFloat(score), req.params.id);
  res.json(db.prepare('SELECT * FROM participants WHERE id=?').get(req.params.id));
});

app.delete('/api/participants/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM participants WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════
//  EVENTS
// ═════════════════════════════════════════════════════════════
app.get('/api/events', (_, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY date, time').all());
});

app.post('/api/events', requireAdmin, uploadEventFiles, (req, res) => {
  const { short_name, description, date, time, timezone, color, link_url } = req.body;
  if (!short_name || !date) return res.status(400).json({ error: 'short_name and date are required' });
  const id  = 'ev_' + uid();
  const img = req.files?.image?.[0]  ? `/uploads/${req.files.image[0].filename}` : null;
  const att = req.files?.attachment?.[0] ? `/uploads/${req.files.attachment[0].filename}` : null;
  db.prepare(`INSERT INTO events (id,short_name,description,date,time,timezone,color,image_url,link_url,attachment_url)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, short_name.trim(), description || '', date, time || '10:00',
         timezone || 'Asia/Kolkata', color || '#6366F1', img, link_url || '', att);
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id=?').get(id));
});

app.put('/api/events/:id', requireAdmin, uploadEventFiles, (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  const { short_name, description, date, time, timezone, color, link_url } = req.body;
  let img = existing.image_url;
  let att = existing.attachment_url;
  if (req.files?.image?.[0]) {
    deleteFile(existing.image_url);
    img = `/uploads/${req.files.image[0].filename}`;
  }
  if (req.files?.attachment?.[0]) {
    deleteFile(existing.attachment_url);
    att = `/uploads/${req.files.attachment[0].filename}`;
  }
  db.prepare(`UPDATE events SET short_name=?,description=?,date=?,time=?,timezone=?,color=?,image_url=?,link_url=?,attachment_url=?,updated_at=unixepoch() WHERE id=?`)
    .run(short_name.trim(), description || '', date, time, timezone, color, img, link_url || '', att, req.params.id);
  res.json(db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id));
});

app.delete('/api/events/:id', requireAdmin, (req, res) => {
  const ev = db.prepare('SELECT image_url, attachment_url FROM events WHERE id=?').get(req.params.id);
  deleteFile(ev?.image_url);
  deleteFile(ev?.attachment_url);
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════
//  PHOTOS  (gallery / album slideshow)
// ═════════════════════════════════════════════════════════════
app.get('/api/photos', (_, res) => {
  res.json(db.prepare('SELECT * FROM photos ORDER BY sort_ord, created_at').all());
});

app.post('/api/photos', requireAdmin, upload.single('image'), (req, res) => {
  const { title, description } = req.body;
  const id  = 'ph_' + uid();
  const img = req.file ? `/uploads/${req.file.filename}` : null;
  const ord = (db.prepare('SELECT COALESCE(MAX(sort_ord),0) AS m FROM photos').get().m) + 1;
  db.prepare(`INSERT INTO photos (id,title,description,image_url,sort_ord) VALUES (?,?,?,?,?)`)
    .run(id, (title||'').trim(), description||'', img, ord);
  res.status(201).json(db.prepare('SELECT * FROM photos WHERE id=?').get(id));
});

app.put('/api/photos/:id', requireAdmin, upload.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM photos WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Photo not found' });
  const { title, description } = req.body;
  let img = existing.image_url;
  if (req.file) { deleteFile(existing.image_url); img = `/uploads/${req.file.filename}`; }
  db.prepare(`UPDATE photos SET title=?,description=?,image_url=? WHERE id=?`)
    .run((title||'').trim(), description||'', img, req.params.id);
  res.json(db.prepare('SELECT * FROM photos WHERE id=?').get(req.params.id));
});

app.delete('/api/photos/:id', requireAdmin, (req, res) => {
  const ph = db.prepare('SELECT image_url FROM photos WHERE id=?').get(req.params.id);
  deleteFile(ph?.image_url);
  db.prepare('DELETE FROM photos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════
//  SPA FALLBACK  –  serve index.html for any unmatched GET
// ═════════════════════════════════════════════════════════════
app.get('*', (_, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯  V Board running at  http://localhost:${PORT}`);
  console.log(`🔐  Admin password    :  ${ADMIN_PASSWORD}`);
  console.log(`📂  Uploads folder    :  ${UPLOADS_DIR}\n`);
});
