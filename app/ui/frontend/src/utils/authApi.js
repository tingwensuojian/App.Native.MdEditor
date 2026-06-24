export async function fetchAuthStatus() {
  const res = await fetch('/api/auth/me', { credentials: 'include' })
  const data = await res.json().catch(() => ({}))

  if (res.status === 401) {
    return { authenticated: false, user: null }
  }

  if (res.ok && data?.ok) {
    return { authenticated: true, user: data.user || null }
  }
  return { authenticated: false, user: null }
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
