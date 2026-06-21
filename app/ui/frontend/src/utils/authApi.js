export async function fetchAuthStatus() {
  const res = await fetch('/api/auth/me', { credentials: 'include' })
  const data = await res.json().catch(() => ({}))

  if (res.status === 401) {
    return { enabled: true, authenticated: false, user: null }
  }

  if (res.ok && data?.ok) {
    return { enabled: true, authenticated: true, user: data.user || null }
  }

  // 若接口不存在/后端未启用 auth 路由，视为未启用认证（保持原行为）
  if (res.status === 404) {
    return { enabled: false, authenticated: false, user: null }
  }

  return { enabled: true, authenticated: false, user: null }
}

export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || '登录失败')
  }

  return data.user || null
}

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
}
