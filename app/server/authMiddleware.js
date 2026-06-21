const {
  SESSION_COOKIE_NAME,
  parseCookieHeader,
  verifySession,
} = require('./authService')

function isAuthEnabled() {
  return String(process.env.ENABLE_AUTH || '').toLowerCase() === 'true'
}

function attachCurrentUser(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '')
  const token = cookies[SESSION_COOKIE_NAME]
  if (!token) {
    req.currentUser = null
    return null
  }
  const user = verifySession(token)
  req.currentUser = user || null
  return req.currentUser
}

function optionalAuth(req) {
  return attachCurrentUser(req)
}

function requireAuth(req, res, sendJson) {
  const user = attachCurrentUser(req)
  if (!user) {
    sendJson(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '请先登录' })
    return false
  }
  return true
}

module.exports = {
  isAuthEnabled,
  optionalAuth,
  requireAuth,
}
