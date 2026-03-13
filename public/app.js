// NCPA Sound Ops — Phase 0 App Shell
// Auth check + Tab routing only. Feature tabs filled in Phase 1+.

const $ = id => document.getElementById(id)

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/check', { credentials: 'include' })
    return res.ok
  } catch {
    return false
  }
}

async function login(password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
  return res.json()
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  showLogin()
}

function showLogin() {
  $('app').classList.add('hidden')
  $('login-screen').classList.remove('hidden')
  $('password-input').value = ''
  $('login-error').classList.add('hidden')
}

function showApp() {
  $('login-screen').classList.add('hidden')
  $('app').classList.remove('hidden')
}

// Tab switching
function switchTab(tabName) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName)
  })
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabName}`)
    p.classList.toggle('hidden', p.id !== `tab-${tabName}`)
  })
  location.hash = tabName
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth()
  if (authed) {
    showApp()
    const hash = location.hash.replace('#', '')
    if (['events', 'crew', 'quotes'].includes(hash)) switchTab(hash)
  } else {
    showLogin()
  }

  // Login form
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault()
    const pw = $('password-input').value.trim()
    if (!pw) return
    const btn = e.target.querySelector('button[type=submit]')
    btn.disabled = true
    btn.textContent = 'Checking…'

    const result = await login(pw)
    if (result.success) {
      showApp()
    } else {
      const err = $('login-error')
      err.textContent = result.error || 'Invalid password'
      err.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Enter'
      $('password-input').focus()
    }
  })

  // Logout
  $('logout-btn').addEventListener('click', logout)

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab))
  })
})
