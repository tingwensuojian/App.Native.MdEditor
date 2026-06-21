const crypto = require('crypto')
const { getDb } = require('./db')

const SESSION_COOKIE_NAME = 'md_editor_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 天

function now() {
  return Date.now()
}

function parseCookieHeader(cookieHeader = '') {
  const out = {}
  if (!cookieHeader || typeof cookieHeader !== 'string') return out
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) continue
    out[key] = decodeURIComponent(value)
  }
  return out
}

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16)
  const derived = crypto.scryptSync(String(password || ''), salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false
  const [saltHex, hashHex] = storedHash.split(':')
  const actual = hashPassword(password, saltHex)
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(`${saltHex}:${hashHex}`))
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
}

function getClientUa(req) {
  return req.headers['user-agent'] || ''
}

function getConfiguredAdminUsername() {
  return String(process.env.AUTH_ADMIN_USERNAME || 'admin').trim() || 'admin'
}

function getConfiguredAdminPassword() {
  const explicit = String(process.env.AUTH_ADMIN_PASSWORD || '').trim()
  if (explicit) return explicit
  return String(process.env.AUTH_DEFAULT_ADMIN_PASSWORD || 'admin123456')
}

function ensureDefaultAdmin() {
  const db = getDb()
  const ts = now()
  const targetUsername = getConfiguredAdminUsername()
  const targetPassword = getConfiguredAdminPassword()

  const adminRow = db.prepare(`
    SELECT id, username, password_hash, role, is_active
    FROM users
    WHERE role = 'admin'
    ORDER BY id ASC
    LIMIT 1
  `).get()

  if (!adminRow) {
    const passwordHash = hashPassword(targetPassword)
    db.prepare(`
      INSERT INTO users (username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, 'admin', 1, ?, ?)
    `).run(targetUsername, passwordHash, ts, ts)
    return
  }

  const needsRename = adminRow.username !== targetUsername
  const needsActivate = !adminRow.is_active || adminRow.role !== 'admin'
  const needsResetPassword = process.env.AUTH_ADMIN_PASSWORD !== undefined || process.env.AUTH_DEFAULT_ADMIN_PASSWORD !== undefined

  if (needsRename || needsActivate || needsResetPassword) {
    const nextPasswordHash = needsResetPassword ? hashPassword(targetPassword) : adminRow.password_hash
    db.prepare(`
      UPDATE users
      SET username = ?, password_hash = ?, role = 'admin', is_active = 1, updated_at = ?
      WHERE id = ?
    `).run(targetUsername, nextPasswordHash, ts, adminRow.id)
  }
}

function getUserByUsername(username) {
  const db = getDb()
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
}

function logAuthEvent({ userId = null, username = '', action = '', ip = '', ua = '' }) {
  const db = getDb()
  db.prepare(`
    INSERT INTO auth_audit_logs (user_id, username, action, ip, ua, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, username || '', action || '', ip || '', ua || '', now())
}

function createSession(userId, req) {
  const db = getDb()
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const ts = now()
  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, last_seen_at, ip, ua, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, tokenHash, ts + SESSION_TTL_MS, ts, getClientIp(req), getClientUa(req), ts)
  return token
}

function destroySessionByToken(token) {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

function verifySession(token) {
  if (!token) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT s.id AS session_id, s.user_id, s.expires_at, u.id, u.username, u.role, u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
    LIMIT 1
  `).get(hashToken(token))

  if (!row) return null
  if (!row.is_active) return null
  if (row.expires_at < now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id)
    return null
  }

  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), row.session_id)
  return {
    id: row.id,
    username: row.username,
    role: row.role,
  }
}

function buildSessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
}

function buildClearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  parseCookieHeader,
  hashPassword,
  verifyPassword,
  ensureDefaultAdmin,
  getUserByUsername,
  logAuthEvent,
  createSession,
  verifySession,
  destroySessionByToken,
  buildSessionCookie,
  buildClearSessionCookie,
}
