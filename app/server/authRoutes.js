const {
  ensureDefaultAdmin,
  getUserByUsername,
  verifyPassword,
  createSession,
  destroySessionByToken,
  logAuthEvent,
  buildSessionCookie,
  buildClearSessionCookie,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
} = require('./authService')
const { optionalAuth } = require('./authMiddleware')

function handleAuthRoutes(req, res, parsed, sendJson, readJsonBody) {
  if (!parsed.pathname.startsWith('/api/auth/')) return false

  ensureDefaultAdmin()

  if (parsed.pathname === '/api/auth/login' && req.method === 'POST') {
    ;(async () => {
      try {
        const body = await readJsonBody(req, res, 1024 * 16)
        const username = String(body?.username || '').trim()
        const password = String(body?.password || '')

        if (!username || !password) {
          sendJson(res, 400, { ok: false, code: 'INVALID_PARAMS', message: '用户名和密码不能为空' })
          return
        }

        const user = getUserByUsername(username)
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
        const ua = req.headers['user-agent'] || ''

        // 单账号模式：仅允许管理员账号登录（账号名可由配置向导修改）
        if (
          !user ||
          user.role !== 'admin' ||
          !verifyPassword(password, user.password_hash) ||
          !user.is_active
        ) {
          logAuthEvent({ userId: user?.id || null, username, action: 'login_failed', ip, ua })
          sendJson(res, 401, { ok: false, code: 'INVALID_CREDENTIALS', message: '用户名或密码错误' })
          return
        }

        const token = createSession(user.id, req)
        logAuthEvent({ userId: user.id, username: user.username, action: 'login_success', ip, ua })

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': buildSessionCookie(token),
        })
        res.end(JSON.stringify({
          ok: true,
          user: { id: user.id, username: user.username, role: user.role },
        }))
      } catch (e) {
        if (e.message === 'PAYLOAD_TOO_LARGE' || e.message === 'INVALID_JSON') return
        sendJson(res, 500, { ok: false, code: 'LOGIN_ERROR', message: '登录失败' })
      }
    })()
    return true
  }

  if (parsed.pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookies = parseCookieHeader(req.headers.cookie || '')
    const token = cookies[SESSION_COOKIE_NAME]
    if (token) {
      destroySessionByToken(token)
      optionalAuth(req)
      if (req.currentUser) {
        logAuthEvent({
          userId: req.currentUser.id,
          username: req.currentUser.username,
          action: 'logout',
          ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
          ua: req.headers['user-agent'] || '',
        })
      }
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': buildClearSessionCookie(),
    })
    res.end(JSON.stringify({ ok: true }))
    return true
  }

  if (parsed.pathname === '/api/auth/me' && req.method === 'GET') {
    optionalAuth(req)
    if (!req.currentUser) {
      sendJson(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '未登录' })
      return true
    }
    if (req.currentUser.role !== 'admin') {
      sendJson(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '账号无效' })
      return true
    }
    sendJson(res, 200, { ok: true, user: req.currentUser })
    return true
  }

  sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '认证接口不存在' })
  return true
}

module.exports = {
  handleAuthRoutes,
}
