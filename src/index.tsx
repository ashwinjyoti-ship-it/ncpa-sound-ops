import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { setCookie, getCookie } from 'hono/cookie'
import { renderer } from './renderer'
import type { Env } from './types'

// ============================================
// CRYPTO HELPERS - Password Hashing & Encryption
// ============================================
const ENCRYPTION_KEY_DERIVATION = 'NCPA-SOUND-OPS-KEY-2024'

async function hashPassword(password: string, salt?: string): Promise<{ hash: string, salt: string }> {
  const encoder = new TextEncoder()
  const saltBytes = salt ? hexToBytes(salt) : crypto.getRandomValues(new Uint8Array(16))
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  
  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: bytesToHex(saltBytes)
  }
}

async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt)
  return hash === storedHash
}

async function encryptApiKey(apiKey: string, masterPassword: string): Promise<{ encrypted: string, iv: string }> {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(masterPassword + ENCRYPTION_KEY_DERIVATION), 'PBKDF2', false, ['deriveKey']
  )
  
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('ncpa-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  )
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(apiKey)
  )
  
  return {
    encrypted: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv)
  }
}

async function decryptApiKey(encrypted: string, iv: string, masterPassword: string): Promise<string | null> {
  try {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(masterPassword + ENCRYPTION_KEY_DERIVATION), 'PBKDF2', false, ['deriveKey']
    )
    
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode('ncpa-salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    )
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(iv) }, key, hexToBytes(encrypted)
    )
    
    return decoder.decode(decrypted)
  } catch {
    return null
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

function generateJwtSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToHex(bytes)
}

// ============================================
// STYLES - Teenage Engineering Dark Ops Theme
// ============================================
const STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    background: #0a0a0a;
    color: #e5e5e5;
    min-height: 100vh;
  }
  .container { max-width: 1400px; margin: 0 auto; padding: 1rem; }
  .nav { 
    display: flex; gap: 0.5rem; margin-bottom: 1.5rem; 
    border-bottom: 1px solid #262626; padding-bottom: 1rem;
  }
  .nav-link { 
    padding: 0.5rem 1rem; 
    background: #141414; 
    border: 1px solid #262626; 
    color: #e5e5e5; 
    text-decoration: none;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
  }
  .nav-link:hover, .nav-link.active { 
    background: #f59e0b; 
    color: #0a0a0a; 
    border-color: #f59e0b;
  }
  .card { 
    background: #141414; 
    border: 1px solid #262626; 
    padding: 1rem; 
    margin-bottom: 1rem;
  }
  .card-header {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
    color: #f59e0b;
  }
  input, select, textarea { 
    font-family: inherit;
    background: #0a0a0a; 
    border: 1px solid #262626; 
    color: #e5e5e5; 
    padding: 0.5rem; 
    font-size: 0.8rem;
    width: 100%;
  }
  input:focus, select:focus, textarea:focus { 
    outline: none; 
    border-color: #f59e0b; 
  }
  button { 
    font-family: inherit;
    padding: 0.5rem 1rem; 
    background: #262626; 
    border: 1px solid #404040; 
    color: #e5e5e5; 
    cursor: pointer;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  button:hover { background: #404040; }
  button.primary { background: #f59e0b; color: #0a0a0a; border-color: #f59e0b; }
  button.primary:hover { background: #d97706; }
  button.danger { background: #dc2626; border-color: #dc2626; }
  button.danger:hover { background: #b91c1c; }
  .grid { display: grid; gap: 1rem; }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .flex { display: flex; }
  .flex-between { justify-content: space-between; }
  .flex-center { align-items: center; }
  .gap-1 { gap: 0.5rem; }
  .gap-2 { gap: 1rem; }
  .mb-1 { margin-bottom: 0.5rem; }
  .mb-2 { margin-bottom: 1rem; }
  .text-sm { font-size: 0.75rem; }
  .text-muted { color: #737373; }
  .text-accent { color: #f59e0b; }
  .text-success { color: #22c55e; }
  .text-danger { color: #ef4444; }
  table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
  th, td { 
    padding: 0.5rem; 
    text-align: left; 
    border-bottom: 1px solid #262626;
  }
  th { 
    background: #1a1a1a; 
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #737373;
  }
  tr:hover { background: #1a1a1a; }
  .autocomplete { position: relative; }
  .autocomplete-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #141414;
    border: 1px solid #262626;
    border-top: none;
    max-height: 200px;
    overflow-y: auto;
    z-index: 100;
  }
  .autocomplete-item {
    padding: 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .autocomplete-item:hover { background: #262626; }
  .equipment-row {
    display: grid;
    grid-template-columns: 1fr 80px 40px;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    align-items: center;
  }
  .quote-table th { background: #1a3a2a; color: #22c55e; }
  .quote-total { background: #1a3a2a; font-weight: 600; }
  .login-container {
    max-width: 400px;
    margin: 100px auto;
    padding: 2rem;
  }
  .login-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 2rem;
    text-align: center;
    color: #f59e0b;
  }
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    background: #262626;
  }
  .calendar-day {
    background: #141414;
    min-height: 100px;
    padding: 0.25rem;
  }
  .calendar-day-header {
    font-size: 0.65rem;
    color: #737373;
    margin-bottom: 0.25rem;
  }
  .calendar-event {
    font-size: 0.6rem;
    padding: 2px 4px;
    margin-bottom: 2px;
    background: #262626;
    border-left: 2px solid #f59e0b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .today { border: 1px solid #f59e0b; }
  .badge {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    border-radius: 2px;
  }
  .badge-senior { background: #7c3aed; }
  .badge-mid { background: #2563eb; }
  .badge-junior { background: #059669; }
  .badge-hired { background: #737373; }
  .day-off-calendar {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .day-off-cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    background: #141414;
    border: 1px solid #262626;
    cursor: pointer;
  }
  .day-off-cell.unavailable { background: #dc2626; border-color: #dc2626; }
  .day-off-cell.weekend { background: #1a1a1a; }
  .workflow-steps {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    overflow-x: auto;
  }
  .workflow-step {
    padding: 0.5rem 1rem;
    background: #1a1a1a;
    border: 1px solid #262626;
    font-size: 0.7rem;
    white-space: nowrap;
    cursor: pointer;
  }
  .workflow-step.active { background: #f59e0b; color: #0a0a0a; border-color: #f59e0b; }
  .workflow-step.completed { background: #065f46; border-color: #059669; }
  .diff-preview {
    background: #1a2e1a;
    border: 1px solid #22c55e;
    padding: 1rem;
    margin: 1rem 0;
    font-size: 0.75rem;
  }
  .diff-add { color: #22c55e; }
  .diff-remove { color: #ef4444; }
`

const app = new Hono<Env>()

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// ============================================
// JWT AUTH HELPERS
// ============================================
async function createJWT(payload: object, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encoder = new TextEncoder()
  
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '')
  const data = `${headerB64}.${payloadB64}`
  
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  
  return `${data}.${sigB64}`
}

async function verifyJWT(token: string, secret: string): Promise<{ valid: boolean, payload?: any }> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { valid: false }
    
    const [headerB64, payloadB64, sigB64] = parts
    const encoder = new TextEncoder()
    const data = `${headerB64}.${payloadB64}`
    
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(data))
    
    if (!valid) return { valid: false }
    
    const payload = JSON.parse(atob(payloadB64))
    if (payload.exp && Date.now() / 1000 > payload.exp) return { valid: false }
    
    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
async function authMiddleware(c: any, next: () => Promise<void>) {
  const path = new URL(c.req.url).pathname
  
  // Public paths
  if (path === '/login' || path === '/api/auth/login' || path.startsWith('/static')) {
    return next()
  }
  
  const token = getCookie(c, 'auth_token')
  if (!token) {
    if (path.startsWith('/api/')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return c.redirect('/login')
  }
  
  // Get JWT secret from D1 or fallback to env
  let secret = c.env.APP_PASSWORD || 'default-secret-change-me'
  try {
    const settings = await c.env.DB.prepare('SELECT jwt_secret FROM app_settings WHERE id = 1').first() as any
    if (settings && settings.jwt_secret && settings.jwt_secret !== 'NEEDS_INIT') {
      secret = settings.jwt_secret
    }
  } catch (e) {
    // Fallback to env secret if D1 fails
  }
  
  const result = await verifyJWT(token, secret)
  
  if (!result.valid) {
    if (path.startsWith('/api/')) {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
    return c.redirect('/login')
  }
  
  return next()
}

app.use('*', authMiddleware)

// ============================================
// AUTH ROUTES
// ============================================
app.get('/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NCPA Sound Ops - Login</title>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
      <style>${STYLES}</style>
    </head>
    <body>
      <div class="login-container card">
        <h1 class="login-title">NCPA SOUND OPS</h1>
        <form id="loginForm">
          <div class="mb-2">
            <label class="text-sm text-muted">Username</label>
            <input type="text" name="username" required autocomplete="username" />
          </div>
          <div class="mb-2">
            <label class="text-sm text-muted">Password</label>
            <input type="password" name="password" required autocomplete="current-password" />
          </div>
          <div id="error" class="text-danger text-sm mb-2" style="display:none;"></div>
          <button type="submit" class="primary" style="width:100%;">Login</button>
        </form>
      </div>
      <script>
        document.getElementById('loginForm').onsubmit = async (e) => {
          e.preventDefault();
          const form = e.target;
          const error = document.getElementById('error');
          error.style.display = 'none';
          
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: form.username.value,
                password: form.password.value
              })
            });
            const data = await res.json();
            if (data.success) {
              window.location.href = '/';
            } else {
              error.textContent = data.error || 'Login failed';
              error.style.display = 'block';
            }
          } catch (err) {
            error.textContent = 'Network error';
            error.style.display = 'block';
          }
        };
      </script>
    </body>
    </html>
  `)
})

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  
  try {
    // Get settings from D1
    const settings = await c.env.DB.prepare('SELECT * FROM app_settings WHERE id = 1').first() as any
    
    if (!settings) {
      // Fallback to env vars if no settings in DB
      const validUser = c.env.APP_USERNAME || 'admin'
      const validPass = c.env.APP_PASSWORD || 'admin123'
      
      if (username !== validUser || password !== validPass) {
        return c.json({ success: false, error: 'Invalid credentials' }, 401)
      }
      
      const token = await createJWT(
        { user: username, exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) },
        validPass
      )
      
      setCookie(c, 'auth_token', token, {
        httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 8 * 60 * 60, path: '/'
      })
      return c.json({ success: true })
    }
    
    // Check if password needs initialization (first login after migration)
    if (settings.password_hash === 'NEEDS_INIT') {
      // Use fallback credentials for first login
      const validUser = c.env.APP_USERNAME || 'ncpalivesound'
      const validPass = c.env.APP_PASSWORD || 'hangover123'
      
      if (username !== validUser || password !== validPass) {
        return c.json({ success: false, error: 'Invalid credentials' }, 401)
      }
      
      // Initialize the password hash and JWT secret in D1
      const { hash, salt } = await hashPassword(password)
      const jwtSecret = generateJwtSecret()
      await c.env.DB.prepare(
        'UPDATE app_settings SET password_hash = ?, password_salt = ?, jwt_secret = ?, username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
      ).bind(hash, salt, jwtSecret, username).run()
      
      const token = await createJWT(
        { user: username, exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) },
        jwtSecret
      )
      
      setCookie(c, 'auth_token', token, {
        httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 8 * 60 * 60, path: '/'
      })
      return c.json({ success: true })
    }
    
    // Normal login - verify against D1
    if (username !== settings.username) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401)
    }
    
    const passwordValid = await verifyPassword(password, settings.password_hash, settings.password_salt)
    if (!passwordValid) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401)
    }
    
    const token = await createJWT(
      { user: username, exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) },
      settings.jwt_secret
    )
    
    setCookie(c, 'auth_token', token, {
      httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 8 * 60 * 60, path: '/'
    })
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Login error:', error)
    return c.json({ success: false, error: 'Login failed' }, 500)
  }
})

app.post('/api/auth/logout', (c) => {
  setCookie(c, 'auth_token', '', { maxAge: 0, path: '/' })
  return c.json({ success: true })
})

// ============================================
// EVENTS API (Schedule Module)
// ============================================
app.get('/api/events', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM events ORDER BY event_date ASC').all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.get('/api/events/range', async (c) => {
  try {
    const start = c.req.query('start')
    const end = c.req.query('end')
    if (!start || !end) return c.json({ success: false, error: 'Start and end required' }, 400)
    
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM events WHERE event_date >= ? AND event_date <= ? ORDER BY event_date ASC'
    ).bind(start, end).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.get('/api/events/month/:month', async (c) => {
  try {
    const month = c.req.param('month') // YYYY-MM
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM events WHERE strftime('%Y-%m', event_date) = ? ORDER BY event_date ASC"
    ).bind(month).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.get('/api/events/search', async (c) => {
  try {
    const q = c.req.query('q')
    if (!q) return c.json({ success: false, error: 'Query required' }, 400)
    
    const term = `%${q}%`
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM events WHERE program LIKE ? OR venue LIKE ? OR team LIKE ? OR crew LIKE ? 
       ORDER BY event_date DESC LIMIT 50`
    ).bind(term, term, term, term).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.post('/api/events', async (c) => {
  try {
    const event = await c.req.json()
    const { results } = await c.env.DB.prepare(
      `INSERT INTO events (event_date, program, venue, team, sound_requirements, call_time, crew)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(
      event.event_date, event.program, event.venue, event.team || '',
      event.sound_requirements || '', event.call_time || '', event.crew || ''
    ).all()
    return c.json({ success: true, data: results[0] })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.put('/api/events/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const event = await c.req.json()
    await c.env.DB.prepare(
      `UPDATE events SET event_date=?, program=?, venue=?, team=?, sound_requirements=?, 
       call_time=?, crew=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      event.event_date, event.program, event.venue, event.team,
      event.sound_requirements, event.call_time, event.crew, id
    ).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.delete('/api/events/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM events WHERE id=?').bind(id).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Bulk update crew assignments
app.post('/api/events/bulk-update-crew', async (c) => {
  try {
    const { updates } = await c.req.json() // [{ id, crew }]
    const stmt = c.env.DB.prepare('UPDATE events SET crew=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    const batch = updates.map((u: any) => stmt.bind(u.crew, u.id))
    await c.env.DB.batch(batch)
    return c.json({ success: true, updated: updates.length })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// CREW API (Crew Assignment Module)
// ============================================
app.get('/api/crew', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM crew ORDER BY level, name').all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.get('/api/crew/unavailability', async (c) => {
  try {
    const month = c.req.query('month')
    let query = 'SELECT cu.*, c.name as crew_name FROM crew_unavailability cu JOIN crew c ON cu.crew_id = c.id'
    if (month) {
      query += ` WHERE strftime('%Y-%m', cu.unavailable_date) = '${month}'`
    }
    const { results } = await c.env.DB.prepare(query).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.post('/api/crew/unavailability', async (c) => {
  try {
    const { crew_id, unavailable_date, reason } = await c.req.json()
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO crew_unavailability (crew_id, unavailable_date, reason) VALUES (?, ?, ?)'
    ).bind(crew_id, unavailable_date, reason || '').run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.delete('/api/crew/unavailability/:crew_id/:date', async (c) => {
  try {
    const crew_id = c.req.param('crew_id')
    const date = c.req.param('date')
    await c.env.DB.prepare(
      'DELETE FROM crew_unavailability WHERE crew_id=? AND unavailable_date=?'
    ).bind(crew_id, date).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// ASSIGNMENT ENGINE
// ============================================
const VENUE_MAP: Record<string, string> = {
  'JBT': 'JBT', 'Jamshed Bhabha Theatre': 'JBT',
  'TT': 'Tata', 'Tata Theatre': 'Tata', 'TATA': 'Tata', 'Tata': 'Tata',
  'TET': 'Experimental', 'Experimental Theatre': 'Experimental', 'Experimental': 'Experimental',
  'GDT': 'Godrej Dance', 'Godrej Dance Theatre': 'Godrej Dance',
  'LT': 'Little Theatre', 'Little Theatre': 'Little Theatre',
}

const TEAM_TO_VERTICAL: Record<string, string> = {
  'Dr.Swapno/Team': 'Dance', 'Dr.Rao/Team': 'Indian Music',
  'Farrahnaz & Team': 'Intl Music', 'Nooshin/Team': 'Theatre',
  'Bruce/Team': 'Theatre', 'Dr.Sujata/Team': 'Library',
  'Bianca/Team': 'Western Music', 'Marketing': 'Corporate',
}

function normalizeVenue(venue: string): string {
  for (const [key, val] of Object.entries(VENUE_MAP)) {
    if (venue.toLowerCase().includes(key.toLowerCase())) return val
  }
  return 'Others'
}

function getVertical(team: string): string {
  for (const [key, val] of Object.entries(TEAM_TO_VERTICAL)) {
    if (team.toLowerCase().includes(key.toLowerCase())) return val
  }
  return 'Others'
}

app.post('/api/assignments/auto-assign', async (c) => {
  try {
    const { month } = await c.req.json() // YYYY-MM
    
    // Get events for month
    const { results: events } = await c.env.DB.prepare(
      "SELECT * FROM events WHERE strftime('%Y-%m', event_date) = ? ORDER BY event_date"
    ).bind(month).all()
    
    // Get all crew
    const { results: crewList } = await c.env.DB.prepare('SELECT * FROM crew').all()
    
    // Get unavailability
    const { results: unavailable } = await c.env.DB.prepare(
      "SELECT * FROM crew_unavailability WHERE strftime('%Y-%m', unavailable_date) = ?"
    ).bind(month).all()
    
    const unavailMap = new Map<string, Set<number>>()
    unavailable.forEach((u: any) => {
      if (!unavailMap.has(u.unavailable_date)) unavailMap.set(u.unavailable_date, new Set())
      unavailMap.get(u.unavailable_date)!.add(u.crew_id)
    })
    
    // Workload tracking
    const workload = new Map<number, number>()
    crewList.forEach((c: any) => workload.set(c.id, 0))
    
    const assignments: any[] = []
    
    for (const event of events as any[]) {
      const venueNorm = normalizeVenue(event.venue)
      const vertical = getVertical(event.team || '')
      const unavailableCrewIds = unavailMap.get(event.event_date) || new Set()
      
      // Filter available crew
      const available = (crewList as any[]).filter(crew => {
        if (unavailableCrewIds.has(crew.id)) return false
        if (crew.is_outside_crew) return false // OC for stage only
        
        const venuesCaps = JSON.parse(crew.venue_capabilities)
        const vertCaps = JSON.parse(crew.vertical_capabilities)
        
        if (venuesCaps[venueNorm] === 'N') return false
        if (vertCaps[vertical] === 'N') return false
        
        return true
      })
      
      // Sort by: preferred (*), then level, then workload
      available.sort((a, b) => {
        const aVenue = JSON.parse(a.venue_capabilities)[venueNorm]
        const bVenue = JSON.parse(b.venue_capabilities)[venueNorm]
        const aVert = JSON.parse(a.vertical_capabilities)[vertical]
        const bVert = JSON.parse(b.vertical_capabilities)[vertical]
        
        const aPreferred = (aVenue === 'Y*' || aVert === 'Y*') ? 1 : 0
        const bPreferred = (bVenue === 'Y*' || bVert === 'Y*') ? 1 : 0
        if (bPreferred !== aPreferred) return bPreferred - aPreferred
        
        const levels = { 'Senior': 0, 'Mid': 1, 'Junior': 2, 'Hired': 3 }
        if (levels[a.level as keyof typeof levels] !== levels[b.level as keyof typeof levels]) {
          return levels[a.level as keyof typeof levels] - levels[b.level as keyof typeof levels]
        }
        
        return (workload.get(a.id) || 0) - (workload.get(b.id) || 0)
      })
      
      // Assign FOH (first available)
      if (available.length > 0) {
        const foh = available[0]
        assignments.push({
          event_id: event.id,
          crew_id: foh.id,
          crew_name: foh.name,
          role: 'FOH',
          event_date: event.event_date,
          program: event.program,
          venue: event.venue
        })
        workload.set(foh.id, (workload.get(foh.id) || 0) + 1)
      }
      
      // Assign Stage if needed (venue requires it)
      if (['JBT', 'Tata', 'Experimental'].includes(venueNorm) && available.length > 1) {
        const stage = available.find(c => c.can_stage && c !== available[0]) || available[1]
        if (stage) {
          assignments.push({
            event_id: event.id,
            crew_id: stage.id,
            crew_name: stage.name,
            role: 'Stage',
            event_date: event.event_date,
            program: event.program,
            venue: event.venue
          })
          workload.set(stage.id, (workload.get(stage.id) || 0) + 1)
        }
      }
    }
    
    return c.json({ success: true, assignments, workload: Object.fromEntries(workload) })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Push assignments to calendar (update events table)
app.post('/api/assignments/push-to-calendar', async (c) => {
  try {
    const { assignments } = await c.req.json()
    
    // Group by event_id
    const byEvent = new Map<number, string[]>()
    for (const a of assignments) {
      if (!byEvent.has(a.event_id)) byEvent.set(a.event_id, [])
      byEvent.get(a.event_id)!.push(`${a.crew_name} (${a.role})`)
    }
    
    // Update events
    const updates: any[] = []
    for (const [eventId, crewList] of byEvent) {
      const crewStr = crewList.join(', ')
      updates.push({ id: eventId, crew: crewStr })
    }
    
    const stmt = c.env.DB.prepare('UPDATE events SET crew=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    const batch = updates.map(u => stmt.bind(u.crew, u.id))
    await c.env.DB.batch(batch)
    
    return c.json({ success: true, updated: updates.length })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// EQUIPMENT API (Quote Builder Module)
// ============================================
app.get('/api/equipment', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM equipment ORDER BY name').all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.get('/api/equipment/search', async (c) => {
  try {
    const q = c.req.query('q')
    if (!q) return c.json({ success: true, data: [] })
    
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM equipment WHERE name LIKE ? ORDER BY name LIMIT 10'
    ).bind(`%${q}%`).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.post('/api/equipment', async (c) => {
  try {
    const { name, rate } = await c.req.json()
    const { results } = await c.env.DB.prepare(
      'INSERT INTO equipment (name, rate) VALUES (?, ?) RETURNING *'
    ).bind(name, rate).all()
    return c.json({ success: true, data: results[0] })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.put('/api/equipment/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { name, rate } = await c.req.json()
    await c.env.DB.prepare(
      'UPDATE equipment SET name=?, rate=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(name, rate, id).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.delete('/api/equipment/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM equipment WHERE id=?').bind(id).run()
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// SETTINGS API
// ============================================
app.get('/api/settings', async (c) => {
  try {
    const settings = await c.env.DB.prepare('SELECT username, anthropic_api_key, api_key_iv, updated_at FROM app_settings WHERE id = 1').first() as any
    
    if (!settings) {
      return c.json({ success: true, data: { username: 'ncpalivesound', hasApiKey: false } })
    }
    
    return c.json({ 
      success: true, 
      data: { 
        username: settings.username,
        hasApiKey: !!settings.anthropic_api_key && settings.anthropic_api_key !== '',
        updatedAt: settings.updated_at
      } 
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

app.post('/api/settings/update', async (c) => {
  try {
    const { currentPassword, newUsername, newPassword, anthropicApiKey } = await c.req.json()
    
    // Get current settings
    const settings = await c.env.DB.prepare('SELECT * FROM app_settings WHERE id = 1').first() as any
    
    if (!settings) {
      return c.json({ success: false, error: 'Settings not initialized' }, 400)
    }
    
    // Verify current password
    if (settings.password_hash === 'NEEDS_INIT') {
      // First-time setup - use env vars
      const validPass = c.env.APP_PASSWORD || 'hangover123'
      if (currentPassword !== validPass) {
        return c.json({ success: false, error: 'Current password is incorrect' }, 401)
      }
    } else {
      const passwordValid = await verifyPassword(currentPassword, settings.password_hash, settings.password_salt)
      if (!passwordValid) {
        return c.json({ success: false, error: 'Current password is incorrect' }, 401)
      }
    }
    
    // Prepare updates
    const updates: string[] = []
    const values: any[] = []
    
    // Update username if provided
    if (newUsername && newUsername.trim() !== '') {
      updates.push('username = ?')
      values.push(newUsername.trim())
    }
    
    // Update password if provided (also regenerate JWT secret)
    let passwordForEncryption = currentPassword
    if (newPassword && newPassword.trim() !== '') {
      const { hash, salt } = await hashPassword(newPassword)
      const newJwtSecret = generateJwtSecret()
      updates.push('password_hash = ?', 'password_salt = ?', 'jwt_secret = ?')
      values.push(hash, salt, newJwtSecret)
      passwordForEncryption = newPassword
    }
    
    // Update API key if provided
    if (anthropicApiKey !== undefined) {
      if (anthropicApiKey === '' || anthropicApiKey === null) {
        // Clear API key
        updates.push('anthropic_api_key = ?', 'api_key_iv = ?')
        values.push(null, null)
      } else {
        // Encrypt and store API key
        const { encrypted, iv } = await encryptApiKey(anthropicApiKey, passwordForEncryption)
        updates.push('anthropic_api_key = ?', 'api_key_iv = ?')
        values.push(encrypted, iv)
      }
    }
    
    if (updates.length === 0) {
      return c.json({ success: false, error: 'No changes to save' }, 400)
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(1) // for WHERE id = 1
    
    const query = `UPDATE app_settings SET ${updates.join(', ')} WHERE id = ?`
    await c.env.DB.prepare(query).bind(...values).run()
    
    // If password changed, user needs to re-login
    if (newPassword && newPassword.trim() !== '') {
      setCookie(c, 'auth_token', '', { maxAge: 0, path: '/' })
      return c.json({ success: true, message: 'Settings updated. Please login with your new password.', requireRelogin: true })
    }
    
    return c.json({ success: true, message: 'Settings updated successfully' })
  } catch (error: any) {
    console.error('Settings update error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// Get decrypted API key (for internal use)
app.post('/api/settings/get-api-key', async (c) => {
  try {
    const { password } = await c.req.json()
    
    const settings = await c.env.DB.prepare('SELECT * FROM app_settings WHERE id = 1').first() as any
    
    if (!settings || !settings.anthropic_api_key || !settings.api_key_iv) {
      return c.json({ success: false, error: 'No API key configured' }, 404)
    }
    
    // Verify password first
    const passwordValid = await verifyPassword(password, settings.password_hash, settings.password_salt)
    if (!passwordValid) {
      return c.json({ success: false, error: 'Invalid password' }, 401)
    }
    
    const apiKey = await decryptApiKey(settings.anthropic_api_key, settings.api_key_iv, password)
    if (!apiKey) {
      return c.json({ success: false, error: 'Failed to decrypt API key' }, 500)
    }
    
    return c.json({ success: true, apiKey })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================
// MAIN UI
// ============================================
app.get('/', (c) => {
  return c.html(MainApp())
})

app.get('/schedule', (c) => c.html(MainApp('schedule')))
app.get('/crew', (c) => c.html(MainApp('crew')))
app.get('/quotes', (c) => c.html(MainApp('quotes')))
app.get('/equipment', (c) => c.html(MainApp('equipment')))
app.get('/settings', (c) => c.html(MainApp('settings')))

function MainApp(activeTab = 'schedule') {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NCPA Sound Ops</title>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet">
      <style>${STYLES}</style>
    </head>
    <body>
      <div class="container">
        <header class="flex flex-between flex-center mb-2">
          <h1 style="font-size:1rem;color:#f59e0b;font-weight:600;">NCPA SOUND OPS</h1>
          <div class="flex gap-1 flex-center">
            <a href="/settings" class="nav-link ${activeTab === 'settings' ? 'active' : ''}" style="padding:0.4rem 0.75rem;" title="Settings">⚙️</a>
            <button onclick="logout()" class="text-sm">Logout</button>
          </div>
        </header>
        
        <nav class="nav">
          <a href="/schedule" class="nav-link ${activeTab === 'schedule' ? 'active' : ''}">Schedule</a>
          <a href="/crew" class="nav-link ${activeTab === 'crew' ? 'active' : ''}">Crew Assignment</a>
          <a href="/quotes" class="nav-link ${activeTab === 'quotes' ? 'active' : ''}">Quote Builder</a>
          <a href="/equipment" class="nav-link ${activeTab === 'equipment' ? 'active' : ''}">Manage Equipment</a>
        </nav>
        
        <div id="app">Loading...</div>
      </div>
      
      <script>
        const activeTab = '${activeTab}';
        
        async function logout() {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }
        
        // ============================================
        // STATE
        // ============================================
        let state = {
          events: [],
          crew: [],
          equipment: [],
          unavailability: [],
          currentMonth: new Date().toISOString().slice(0, 7),
          assignments: [],
          workflowStep: 0,
          quoteItems: [],
          quoteNotes: '',
          generatedQuote: null,
        };
        
        // ============================================
        // API HELPERS
        // ============================================
        async function api(path, opts = {}) {
          const res = await fetch(path, {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...opts.headers }
          });
          return res.json();
        }
        
        // ============================================
        // SCHEDULE MODULE
        // ============================================
        async function loadSchedule() {
          const [eventsRes, crewRes] = await Promise.all([
            api('/api/events'),
            api('/api/crew')
          ]);
          state.events = eventsRes.data || [];
          state.crew = crewRes.data || [];
          renderSchedule();
        }
        
        function renderSchedule() {
          const month = state.currentMonth;
          const [year, mon] = month.split('-').map(Number);
          const firstDay = new Date(year, mon - 1, 1);
          const lastDay = new Date(year, mon, 0);
          const daysInMonth = lastDay.getDate();
          const startDow = firstDay.getDay();
          
          const monthEvents = state.events.filter(e => e.event_date.startsWith(month));
          const eventsByDate = {};
          monthEvents.forEach(e => {
            if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = [];
            eventsByDate[e.event_date].push(e);
          });
          
          const today = new Date().toISOString().slice(0, 10);
          
          let calendarHtml = '<div class="calendar-grid">';
          ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
            calendarHtml += '<div style="background:#1a1a1a;padding:0.25rem;font-size:0.65rem;text-align:center;color:#737373;">' + d + '</div>';
          });
          
          for (let i = 0; i < startDow; i++) {
            calendarHtml += '<div class="calendar-day" style="background:#0d0d0d;"></div>';
          }
          
          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = month + '-' + String(d).padStart(2, '0');
            const isToday = dateStr === today;
            const dayEvents = eventsByDate[dateStr] || [];
            
            calendarHtml += '<div class="calendar-day' + (isToday ? ' today' : '') + '">';
            calendarHtml += '<div class="calendar-day-header">' + d + '</div>';
            dayEvents.slice(0, 3).forEach(e => {
              calendarHtml += '<div class="calendar-event" title="' + e.program + ' - ' + e.venue + '">' + 
                (e.venue || '').slice(0, 8) + ': ' + (e.program || '').slice(0, 15) + '</div>';
            });
            if (dayEvents.length > 3) {
              calendarHtml += '<div class="text-sm text-muted">+' + (dayEvents.length - 3) + ' more</div>';
            }
            calendarHtml += '</div>';
          }
          calendarHtml += '</div>';
          
          document.getElementById('app').innerHTML = \`
            <div class="card">
              <div class="flex flex-between flex-center mb-2">
                <div class="flex gap-1 flex-center">
                  <button onclick="prevMonth()">◀</button>
                  <input type="month" value="\${month}" onchange="setMonth(this.value)" style="width:150px;" />
                  <button onclick="nextMonth()">▶</button>
                </div>
                <div class="flex gap-1">
                  <input type="text" placeholder="Search events..." id="searchInput" onkeyup="searchEvents(this.value)" style="width:200px;" />
                  <button class="primary" onclick="showAddEvent()">+ Add Event</button>
                </div>
              </div>
              \${calendarHtml}
            </div>
            
            <div class="card">
              <div class="card-header">Events This Month (\${monthEvents.length})</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Program</th>
                    <th>Venue</th>
                    <th>Team</th>
                    <th>Crew</th>
                    <th>Call Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  \${monthEvents.map(e => \`
                    <tr>
                      <td>\${e.event_date}</td>
                      <td>\${e.program || '-'}</td>
                      <td>\${e.venue || '-'}</td>
                      <td>\${e.team || '-'}</td>
                      <td>\${e.crew || '<span class="text-muted">Unassigned</span>'}</td>
                      <td>\${e.call_time || '-'}</td>
                      <td>
                        <button onclick="editEvent(\${e.id})">Edit</button>
                        <button class="danger" onclick="deleteEvent(\${e.id})">×</button>
                      </td>
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          \`;
        }
        
        function prevMonth() {
          const [y, m] = state.currentMonth.split('-').map(Number);
          const d = new Date(y, m - 2, 1);
          state.currentMonth = d.toISOString().slice(0, 7);
          renderSchedule();
        }
        
        function nextMonth() {
          const [y, m] = state.currentMonth.split('-').map(Number);
          const d = new Date(y, m, 1);
          state.currentMonth = d.toISOString().slice(0, 7);
          renderSchedule();
        }
        
        function setMonth(m) {
          state.currentMonth = m;
          renderSchedule();
        }
        
        async function searchEvents(q) {
          if (!q || q.length < 2) {
            loadSchedule();
            return;
          }
          const res = await api('/api/events/search?q=' + encodeURIComponent(q));
          state.events = res.data || [];
          renderSchedule();
        }
        
        function showAddEvent() {
          const html = \`
            <div class="card">
              <div class="card-header">Add New Event</div>
              <form id="eventForm" onsubmit="saveEvent(event)">
                <div class="grid grid-2 gap-2 mb-2">
                  <div>
                    <label class="text-sm text-muted">Date</label>
                    <input type="date" name="event_date" required />
                  </div>
                  <div>
                    <label class="text-sm text-muted">Call Time</label>
                    <input type="text" name="call_time" placeholder="e.g., 10:00 AM" />
                  </div>
                </div>
                <div class="mb-2">
                  <label class="text-sm text-muted">Program</label>
                  <input type="text" name="program" required />
                </div>
                <div class="grid grid-2 gap-2 mb-2">
                  <div>
                    <label class="text-sm text-muted">Venue</label>
                    <input type="text" name="venue" required />
                  </div>
                  <div>
                    <label class="text-sm text-muted">Team</label>
                    <input type="text" name="team" />
                  </div>
                </div>
                <div class="mb-2">
                  <label class="text-sm text-muted">Sound Requirements</label>
                  <textarea name="sound_requirements" rows="2"></textarea>
                </div>
                <div class="mb-2">
                  <label class="text-sm text-muted">Crew</label>
                  <input type="text" name="crew" />
                </div>
                <div class="flex gap-1">
                  <button type="submit" class="primary">Save</button>
                  <button type="button" onclick="loadSchedule()">Cancel</button>
                </div>
              </form>
            </div>
          \`;
          document.getElementById('app').innerHTML = html;
        }
        
        async function saveEvent(e) {
          e.preventDefault();
          const form = e.target;
          const data = {
            event_date: form.event_date.value,
            program: form.program.value,
            venue: form.venue.value,
            team: form.team.value,
            sound_requirements: form.sound_requirements.value,
            call_time: form.call_time.value,
            crew: form.crew.value
          };
          await api('/api/events', { method: 'POST', body: JSON.stringify(data) });
          loadSchedule();
        }
        
        async function editEvent(id) {
          const event = state.events.find(e => e.id === id);
          if (!event) return;
          
          const html = \`
            <div class="card">
              <div class="card-header">Edit Event</div>
              <form id="eventForm" onsubmit="updateEvent(event, \${id})">
                <div class="grid grid-2 gap-2 mb-2">
                  <div>
                    <label class="text-sm text-muted">Date</label>
                    <input type="date" name="event_date" value="\${event.event_date}" required />
                  </div>
                  <div>
                    <label class="text-sm text-muted">Call Time</label>
                    <input type="text" name="call_time" value="\${event.call_time || ''}" />
                  </div>
                </div>
                <div class="mb-2">
                  <label class="text-sm text-muted">Program</label>
                  <input type="text" name="program" value="\${event.program}" required />
                </div>
                <div class="grid grid-2 gap-2 mb-2">
                  <div>
                    <label class="text-sm text-muted">Venue</label>
                    <input type="text" name="venue" value="\${event.venue}" required />
                  </div>
                  <div>
                    <label class="text-sm text-muted">Team</label>
                    <input type="text" name="team" value="\${event.team || ''}" />
                  </div>
                </div>
                <div class="mb-2">
                  <label class="text-sm text-muted">Sound Requirements</label>
                  <textarea name="sound_requirements" rows="2">\${event.sound_requirements || ''}</textarea>
                </div>
                <div class="mb-2">
                  <label class="text-sm text-muted">Crew</label>
                  <input type="text" name="crew" value="\${event.crew || ''}" />
                </div>
                <div class="flex gap-1">
                  <button type="submit" class="primary">Update</button>
                  <button type="button" onclick="loadSchedule()">Cancel</button>
                </div>
              </form>
            </div>
          \`;
          document.getElementById('app').innerHTML = html;
        }
        
        async function updateEvent(e, id) {
          e.preventDefault();
          const form = e.target;
          const data = {
            event_date: form.event_date.value,
            program: form.program.value,
            venue: form.venue.value,
            team: form.team.value,
            sound_requirements: form.sound_requirements.value,
            call_time: form.call_time.value,
            crew: form.crew.value
          };
          await api('/api/events/' + id, { method: 'PUT', body: JSON.stringify(data) });
          loadSchedule();
        }
        
        async function deleteEvent(id) {
          if (!confirm('Delete this event?')) return;
          await api('/api/events/' + id, { method: 'DELETE' });
          loadSchedule();
        }
        
        // ============================================
        // CREW ASSIGNMENT MODULE
        // ============================================
        async function loadCrew() {
          const [crewRes, unavailRes, eventsRes] = await Promise.all([
            api('/api/crew'),
            api('/api/crew/unavailability?month=' + state.currentMonth),
            api('/api/events/month/' + state.currentMonth)
          ]);
          state.crew = crewRes.data || [];
          state.unavailability = unavailRes.data || [];
          state.events = eventsRes.data || [];
          renderCrew();
        }
        
        function renderCrew() {
          const steps = ['Mark Day-offs', 'Import Events', 'Set Requirements', 'Auto-Assign', 'Review & Push'];
          
          document.getElementById('app').innerHTML = \`
            <div class="card">
              <div class="flex flex-between flex-center mb-2">
                <div class="flex gap-1 flex-center">
                  <button onclick="prevMonthCrew()">◀</button>
                  <input type="month" value="\${state.currentMonth}" onchange="setMonthCrew(this.value)" style="width:150px;" />
                  <button onclick="nextMonthCrew()">▶</button>
                </div>
              </div>
              
              <div class="workflow-steps">
                \${steps.map((s, i) => \`
                  <div class="workflow-step \${i === state.workflowStep ? 'active' : ''} \${i < state.workflowStep ? 'completed' : ''}" 
                       onclick="setWorkflowStep(\${i})">\${i + 1}. \${s}</div>
                \`).join('')}
              </div>
              
              <div id="workflowContent"></div>
            </div>
          \`;
          
          renderWorkflowStep();
        }
        
        function setWorkflowStep(step) {
          state.workflowStep = step;
          renderWorkflowStep();
        }
        
        function renderWorkflowStep() {
          const content = document.getElementById('workflowContent');
          switch (state.workflowStep) {
            case 0: renderDayOffs(content); break;
            case 1: renderImportEvents(content); break;
            case 2: renderRequirements(content); break;
            case 3: renderAutoAssign(content); break;
            case 4: renderReviewPush(content); break;
          }
        }
        
        function renderDayOffs(container) {
          const month = state.currentMonth;
          const [year, mon] = month.split('-').map(Number);
          const daysInMonth = new Date(year, mon, 0).getDate();
          
          const unavailByCrewDate = new Map();
          state.unavailability.forEach(u => {
            unavailByCrewDate.set(u.crew_id + '-' + u.unavailable_date, true);
          });
          
          const levelColors = { Senior: 'badge-senior', Mid: 'badge-mid', Junior: 'badge-junior', Hired: 'badge-hired' };
          
          container.innerHTML = \`
            <div class="card-header">Mark Day-offs for \${month}</div>
            <p class="text-sm text-muted mb-2">Click on a date cell to toggle day-off for that crew member.</p>
            <div style="overflow-x:auto;">
              <table style="min-width:800px;">
                <thead>
                  <tr>
                    <th style="width:120px;">Crew</th>
                    \${Array.from({length: daysInMonth}, (_, i) => '<th style="width:30px;text-align:center;">' + (i+1) + '</th>').join('')}
                  </tr>
                </thead>
                <tbody>
                  \${state.crew.map(c => \`
                    <tr>
                      <td>
                        <span class="badge \${levelColors[c.level]}">\${c.level.slice(0,1)}</span>
                        \${c.name}
                      </td>
                      \${Array.from({length: daysInMonth}, (_, i) => {
                        const d = i + 1;
                        const dateStr = month + '-' + String(d).padStart(2, '0');
                        const dow = new Date(year, mon - 1, d).getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        const isUnavail = unavailByCrewDate.has(c.id + '-' + dateStr);
                        return \`<td class="day-off-cell \${isUnavail ? 'unavailable' : ''} \${isWeekend ? 'weekend' : ''}"
                                    onclick="toggleDayOff(\${c.id}, '\${dateStr}')"
                                    title="\${c.name} - \${dateStr}">\${isUnavail ? '×' : ''}</td>\`;
                      }).join('')}
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
            <div class="flex gap-1 mt-2" style="margin-top:1rem;">
              <button class="primary" onclick="setWorkflowStep(1)">Next: Import Events →</button>
            </div>
          \`;
        }
        
        async function toggleDayOff(crewId, date) {
          const key = crewId + '-' + date;
          const existing = state.unavailability.find(u => u.crew_id === crewId && u.unavailable_date === date);
          
          if (existing) {
            await api('/api/crew/unavailability/' + crewId + '/' + date, { method: 'DELETE' });
            state.unavailability = state.unavailability.filter(u => u !== existing);
          } else {
            await api('/api/crew/unavailability', { 
              method: 'POST', 
              body: JSON.stringify({ crew_id: crewId, unavailable_date: date }) 
            });
            state.unavailability.push({ crew_id: crewId, unavailable_date: date });
          }
          renderWorkflowStep();
        }
        
        function renderImportEvents(container) {
          const monthEvents = state.events;
          
          container.innerHTML = \`
            <div class="card-header">Events for \${state.currentMonth}</div>
            <p class="text-sm text-muted mb-2">\${monthEvents.length} events found for this month from the Schedule.</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Program</th>
                  <th>Venue</th>
                  <th>Team</th>
                  <th>Current Crew</th>
                </tr>
              </thead>
              <tbody>
                \${monthEvents.map(e => \`
                  <tr>
                    <td>\${e.event_date}</td>
                    <td>\${e.program || '-'}</td>
                    <td>\${e.venue || '-'}</td>
                    <td>\${e.team || '-'}</td>
                    <td>\${e.crew || '<span class="text-muted">None</span>'}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
            <div class="flex gap-1 mt-2" style="margin-top:1rem;">
              <button onclick="setWorkflowStep(0)">← Back</button>
              <button class="primary" onclick="setWorkflowStep(2)">Next: Set Requirements →</button>
            </div>
          \`;
        }
        
        function renderRequirements(container) {
          container.innerHTML = \`
            <div class="card-header">Set Crew Requirements</div>
            <p class="text-sm text-muted mb-2">Requirements are auto-determined based on venue size. Large venues (JBT, Tata, Experimental) need FOH + Stage crew.</p>
            <div class="grid grid-3 gap-2">
              <div class="card" style="background:#1a1a1a;">
                <div class="text-accent">JBT / Tata Theatre</div>
                <div class="text-sm text-muted">FOH + Stage (2-3 crew)</div>
              </div>
              <div class="card" style="background:#1a1a1a;">
                <div class="text-accent">Experimental Theatre</div>
                <div class="text-sm text-muted">FOH + Stage (2 crew)</div>
              </div>
              <div class="card" style="background:#1a1a1a;">
                <div class="text-accent">Other Venues</div>
                <div class="text-sm text-muted">FOH only (1 crew)</div>
              </div>
            </div>
            <div class="flex gap-1 mt-2" style="margin-top:1rem;">
              <button onclick="setWorkflowStep(1)">← Back</button>
              <button class="primary" onclick="runAutoAssign()">Next: Run Auto-Assign →</button>
            </div>
          \`;
        }
        
        async function runAutoAssign() {
          setWorkflowStep(3);
          const content = document.getElementById('workflowContent');
          content.innerHTML = '<div class="text-accent">Running assignment engine...</div>';
          
          const res = await api('/api/assignments/auto-assign', {
            method: 'POST',
            body: JSON.stringify({ month: state.currentMonth })
          });
          
          if (res.success) {
            state.assignments = res.assignments;
            state.workload = res.workload;
            renderAutoAssign(content);
          } else {
            content.innerHTML = '<div class="text-danger">Error: ' + res.error + '</div>';
          }
        }
        
        function renderAutoAssign(container) {
          const byDate = {};
          state.assignments.forEach(a => {
            if (!byDate[a.event_date]) byDate[a.event_date] = [];
            byDate[a.event_date].push(a);
          });
          
          container.innerHTML = \`
            <div class="card-header">Auto-Assignment Results</div>
            <p class="text-sm text-success mb-2">✓ \${state.assignments.length} assignments generated for \${Object.keys(byDate).length} event days.</p>
            
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Program</th>
                  <th>Venue</th>
                  <th>FOH</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                \${Object.entries(byDate).map(([date, assigns]) => {
                  const foh = assigns.find(a => a.role === 'FOH');
                  const stage = assigns.find(a => a.role === 'Stage');
                  return \`
                    <tr>
                      <td>\${date}</td>
                      <td>\${foh?.program || '-'}</td>
                      <td>\${foh?.venue || '-'}</td>
                      <td>\${foh ? foh.crew_name : '<span class="text-danger">None</span>'}</td>
                      <td>\${stage ? stage.crew_name : '-'}</td>
                    </tr>
                  \`;
                }).join('')}
              </tbody>
            </table>
            
            <div class="card-header" style="margin-top:1rem;">Workload Summary</div>
            <div class="grid grid-3 gap-1">
              \${state.crew.map(c => \`
                <div style="background:#1a1a1a;padding:0.5rem;font-size:0.75rem;">
                  \${c.name}: <span class="text-accent">\${state.workload[c.id] || 0}</span> assignments
                </div>
              \`).join('')}
            </div>
            
            <div class="flex gap-1 mt-2" style="margin-top:1rem;">
              <button onclick="setWorkflowStep(2)">← Back</button>
              <button class="primary" onclick="setWorkflowStep(4)">Next: Review & Push →</button>
            </div>
          \`;
        }
        
        function renderReviewPush(container) {
          // Check which events already have crew assigned
          const eventsWithCrew = state.events.filter(e => e.crew && e.crew.trim() !== '');
          const eventsWithoutCrew = state.events.filter(e => !e.crew || e.crew.trim() === '');
          
          container.innerHTML = \`
            <div class="card-header">Review & Push to Calendar</div>
            
            <div class="diff-preview">
              <div class="text-accent mb-1">Changes Preview:</div>
              <div class="diff-add">+ \${state.assignments.length} crew assignments will be added</div>
              <div class="diff-add">+ \${eventsWithoutCrew.length} events currently have no crew</div>
              \${eventsWithCrew.length > 0 ? \`<div class="diff-remove">⚠ \${eventsWithCrew.length} events already have crew - will be overwritten</div>\` : ''}
            </div>
            
            <p class="text-sm text-muted mb-2">Pushing will update the Schedule with these crew assignments.</p>
            
            <div class="flex gap-1 mt-2" style="margin-top:1rem;">
              <button onclick="setWorkflowStep(3)">← Back</button>
              <button class="primary" onclick="pushToCalendar()">Push to Calendar ✓</button>
            </div>
          \`;
        }
        
        async function pushToCalendar() {
          const content = document.getElementById('workflowContent');
          content.innerHTML = '<div class="text-accent">Pushing assignments to calendar...</div>';
          
          const res = await api('/api/assignments/push-to-calendar', {
            method: 'POST',
            body: JSON.stringify({ assignments: state.assignments })
          });
          
          if (res.success) {
            content.innerHTML = \`
              <div class="text-success" style="font-size:1.2rem;margin-bottom:1rem;">✓ Successfully updated \${res.updated} events!</div>
              <p class="text-sm text-muted">The Schedule tab now reflects the new crew assignments.</p>
              <div class="flex gap-1 mt-2" style="margin-top:1rem;">
                <button onclick="setWorkflowStep(0)">Start New Assignment</button>
                <a href="/schedule" class="nav-link primary">View Schedule →</a>
              </div>
            \`;
          } else {
            content.innerHTML = '<div class="text-danger">Error: ' + res.error + '</div>';
          }
        }
        
        function prevMonthCrew() {
          const [y, m] = state.currentMonth.split('-').map(Number);
          const d = new Date(y, m - 2, 1);
          state.currentMonth = d.toISOString().slice(0, 7);
          state.workflowStep = 0;
          loadCrew();
        }
        
        function nextMonthCrew() {
          const [y, m] = state.currentMonth.split('-').map(Number);
          const d = new Date(y, m, 1);
          state.currentMonth = d.toISOString().slice(0, 7);
          state.workflowStep = 0;
          loadCrew();
        }
        
        function setMonthCrew(m) {
          state.currentMonth = m;
          state.workflowStep = 0;
          loadCrew();
        }
        
        // ============================================
        // QUOTE BUILDER MODULE
        // ============================================
        async function loadQuotes() {
          const res = await api('/api/equipment');
          state.equipment = res.data || [];
          state.quoteItems = [{ equipment_id: null, name: '', rate: 0, qty: 1 }];
          state.generatedQuote = null;
          renderQuotes();
        }
        
        function renderQuotes() {
          if (state.generatedQuote) {
            renderGeneratedQuote();
            return;
          }
          
          document.getElementById('app').innerHTML = \`
            <div class="card">
              <div class="card-header">Equipment Selection</div>
              <div id="quoteItems">
                \${state.quoteItems.map((item, i) => \`
                  <div class="equipment-row">
                    <div class="autocomplete">
                      <input type="text" placeholder="Search equipment..." 
                             value="\${item.name || ''}"
                             oninput="searchEquipment(\${i}, this.value)"
                             onfocus="searchEquipment(\${i}, this.value)" />
                      <div id="autocomplete-\${i}" class="autocomplete-list" style="display:none;"></div>
                    </div>
                    <input type="number" min="1" value="\${item.qty}" 
                           onchange="updateQty(\${i}, this.value)" style="text-align:center;" />
                    <button class="danger" onclick="removeQuoteItem(\${i})">×</button>
                  </div>
                \`).join('')}
              </div>
              <button onclick="addQuoteItem()" style="margin-top:0.5rem;">+ Add Equipment Row</button>
            </div>
            
            <div class="card">
              <div class="card-header">Additional Notes</div>
              <textarea id="quoteNotes" rows="4" placeholder="Enter any additional notes or requirements..."
                        onchange="state.quoteNotes = this.value">\${state.quoteNotes}</textarea>
            </div>
            
            <button class="primary" style="width:100%;padding:1rem;" onclick="createQuote()">CREATE QUOTE</button>
          \`;
        }
        
        let searchTimeout;
        async function searchEquipment(index, query) {
          clearTimeout(searchTimeout);
          const dropdown = document.getElementById('autocomplete-' + index);
          
          if (!query || query.length < 1) {
            dropdown.style.display = 'none';
            return;
          }
          
          searchTimeout = setTimeout(async () => {
            const res = await api('/api/equipment/search?q=' + encodeURIComponent(query));
            const items = res.data || [];
            
            if (items.length === 0) {
              dropdown.style.display = 'none';
              return;
            }
            
            dropdown.innerHTML = items.map(eq => \`
              <div class="autocomplete-item" onclick="selectEquipment(\${index}, \${eq.id}, '\${eq.name.replace(/'/g, "\\\\'")}', \${eq.rate})">
                \${eq.name} - Rs. \${eq.rate}
              </div>
            \`).join('');
            dropdown.style.display = 'block';
          }, 150);
        }
        
        function selectEquipment(index, id, name, rate) {
          state.quoteItems[index] = { equipment_id: id, name, rate, qty: state.quoteItems[index].qty };
          document.getElementById('autocomplete-' + index).style.display = 'none';
          renderQuotes();
        }
        
        function updateQty(index, qty) {
          state.quoteItems[index].qty = parseInt(qty) || 1;
        }
        
        function addQuoteItem() {
          state.quoteItems.push({ equipment_id: null, name: '', rate: 0, qty: 1 });
          renderQuotes();
        }
        
        function removeQuoteItem(index) {
          if (state.quoteItems.length > 1) {
            state.quoteItems.splice(index, 1);
            renderQuotes();
          }
        }
        
        function createQuote() {
          const validItems = state.quoteItems.filter(i => i.equipment_id && i.rate > 0);
          if (validItems.length === 0) {
            alert('Please add at least one equipment item');
            return;
          }
          
          const subtotal = validItems.reduce((sum, i) => sum + (i.rate * i.qty), 0);
          const gst = Math.round(subtotal * 0.18);
          const total = subtotal + gst;
          
          state.generatedQuote = {
            items: validItems,
            subtotal,
            gst,
            total,
            notes: state.quoteNotes
          };
          
          renderGeneratedQuote();
        }
        
        function renderGeneratedQuote() {
          const q = state.generatedQuote;
          
          document.getElementById('app').innerHTML = \`
            <div class="card">
              <div class="flex flex-between flex-center mb-2">
                <div class="card-header" style="margin:0;">Quote</div>
                <div class="flex gap-1">
                  <button onclick="copyQuote()">📋 Copy Quote</button>
                  <button onclick="createNewQuote()">+ Create New Quote</button>
                </div>
              </div>
              
              <table class="quote-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style="text-align:right;">Unit Cost (Rs.)</th>
                    <th style="text-align:center;">Qty</th>
                    <th style="text-align:right;">Total (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  \${q.items.map(i => \`
                    <tr>
                      <td>\${i.name}</td>
                      <td style="text-align:right;">\${i.rate.toFixed(2)}</td>
                      <td style="text-align:center;">\${i.qty}</td>
                      <td style="text-align:right;">\${(i.rate * i.qty).toFixed(2)}</td>
                    </tr>
                  \`).join('')}
                  <tr class="quote-total">
                    <td colspan="3" style="text-align:right;">Subtotal:</td>
                    <td style="text-align:right;">\${q.subtotal.toFixed(2)}</td>
                  </tr>
                  <tr class="quote-total">
                    <td colspan="3" style="text-align:right;">GST (18%):</td>
                    <td style="text-align:right;">\${q.gst.toFixed(2)}</td>
                  </tr>
                  <tr class="quote-total" style="font-size:1rem;">
                    <td colspan="3" style="text-align:right;"><strong>TOTAL:</strong></td>
                    <td style="text-align:right;"><strong>\${q.total.toFixed(2)}</strong></td>
                  </tr>
                </tbody>
              </table>
              
              \${q.notes ? \`
                <div style="margin-top:1rem;">
                  <div class="card-header">Additional Notes:</div>
                  <div class="text-sm">\${q.notes}</div>
                </div>
              \` : ''}
            </div>
          \`;
        }
        
        function copyQuote() {
          const q = state.generatedQuote;
          
          // Build HTML table for rich text copy
          let html = '<table border="1" cellpadding="5" style="border-collapse:collapse;font-family:Arial,sans-serif;">';
          html += '<tr style="background:#f0f0f0;"><th>Item</th><th>Unit Cost (Rs.)</th><th>Qty</th><th>Total (Rs.)</th></tr>';
          q.items.forEach(i => {
            html += \`<tr><td>\${i.name}</td><td align="right">\${i.rate.toFixed(2)}</td><td align="center">\${i.qty}</td><td align="right">\${(i.rate * i.qty).toFixed(2)}</td></tr>\`;
          });
          html += \`<tr style="background:#e8f5e9;"><td colspan="3" align="right"><strong>Subtotal:</strong></td><td align="right">\${q.subtotal.toFixed(2)}</td></tr>\`;
          html += \`<tr style="background:#e8f5e9;"><td colspan="3" align="right"><strong>GST (18%):</strong></td><td align="right">\${q.gst.toFixed(2)}</td></tr>\`;
          html += \`<tr style="background:#c8e6c9;"><td colspan="3" align="right"><strong>TOTAL:</strong></td><td align="right"><strong>\${q.total.toFixed(2)}</strong></td></tr>\`;
          html += '</table>';
          if (q.notes) {
            html += '<br><strong>Additional Notes:</strong><br>' + q.notes;
          }
          
          // Try to copy as HTML
          try {
            const blob = new Blob([html], { type: 'text/html' });
            const item = new ClipboardItem({ 'text/html': blob });
            navigator.clipboard.write([item]);
            alert('Quote copied to clipboard!');
          } catch (e) {
            // Fallback to plain text
            let text = 'EQUIPMENT QUOTE\\n';
            text += '='.repeat(50) + '\\n';
            q.items.forEach(i => {
              text += i.name + ' | Rs.' + i.rate + ' x ' + i.qty + ' = Rs.' + (i.rate * i.qty) + '\\n';
            });
            text += '-'.repeat(50) + '\\n';
            text += 'Subtotal: Rs.' + q.subtotal + '\\n';
            text += 'GST (18%): Rs.' + q.gst + '\\n';
            text += 'TOTAL: Rs.' + q.total + '\\n';
            if (q.notes) text += '\\nNotes: ' + q.notes;
            navigator.clipboard.writeText(text);
            alert('Quote copied to clipboard (plain text)!');
          }
        }
        
        function createNewQuote() {
          state.quoteItems = [{ equipment_id: null, name: '', rate: 0, qty: 1 }];
          state.quoteNotes = '';
          state.generatedQuote = null;
          renderQuotes();
        }
        
        // ============================================
        // EQUIPMENT MANAGEMENT MODULE
        // ============================================
        async function loadEquipment() {
          const res = await api('/api/equipment');
          state.equipment = res.data || [];
          renderEquipment();
        }
        
        function renderEquipment() {
          document.getElementById('app').innerHTML = \`
            <div class="card">
              <div class="card-header">Add New Equipment</div>
              <form id="equipmentForm" onsubmit="addEquipment(event)" class="grid grid-2 gap-2">
                <div>
                  <label class="text-sm text-muted">Equipment Name</label>
                  <input type="text" name="name" placeholder="e.g., SHURE SM58" required />
                </div>
                <div>
                  <label class="text-sm text-muted">Rate (Rs.)</label>
                  <input type="number" name="rate" placeholder="e.g., 300" required />
                </div>
                <div style="grid-column:span 2;">
                  <button type="submit" class="primary">+ Add Equipment</button>
                </div>
              </form>
            </div>
            
            <div class="card">
              <div class="card-header">Equipment List (\${state.equipment.length})</div>
              <div id="equipmentList">
                \${state.equipment.map(eq => \`
                  <div class="flex flex-between flex-center" style="padding:0.75rem;border-bottom:1px solid #262626;">
                    <div>
                      <span class="text-accent">\${eq.name}</span>
                      <span class="text-muted" style="margin-left:1rem;">Rs. \${eq.rate}</span>
                    </div>
                    <div class="flex gap-1">
                      <button onclick="editEquipment(\${eq.id})">✏️ Edit</button>
                      <button class="danger" onclick="deleteEquipment(\${eq.id})">🗑️ Delete</button>
                    </div>
                  </div>
                \`).join('')}
              </div>
            </div>
          \`;
        }
        
        async function addEquipment(e) {
          e.preventDefault();
          const form = e.target;
          await api('/api/equipment', {
            method: 'POST',
            body: JSON.stringify({
              name: form.name.value.toUpperCase(),
              rate: parseInt(form.rate.value)
            })
          });
          form.reset();
          loadEquipment();
        }
        
        function editEquipment(id) {
          const eq = state.equipment.find(e => e.id === id);
          if (!eq) return;
          
          const newName = prompt('Equipment Name:', eq.name);
          if (!newName) return;
          
          const newRate = prompt('Rate (Rs.):', eq.rate);
          if (!newRate) return;
          
          api('/api/equipment/' + id, {
            method: 'PUT',
            body: JSON.stringify({ name: newName.toUpperCase(), rate: parseInt(newRate) })
          }).then(() => loadEquipment());
        }
        
        async function deleteEquipment(id) {
          if (!confirm('Delete this equipment?')) return;
          await api('/api/equipment/' + id, { method: 'DELETE' });
          loadEquipment();
        }
        
        // ============================================
        // SETTINGS MODULE
        // ============================================
        let settingsData = { username: '', hasApiKey: false };
        
        async function loadSettings() {
          const res = await api('/api/settings');
          if (res.success) {
            settingsData = res.data;
          }
          renderSettings();
        }
        
        function renderSettings() {
          document.getElementById('app').innerHTML = \`
            <div class="card" style="max-width:600px;">
              <div class="card-header">⚙️ App Settings</div>
              <p class="text-sm text-muted mb-2">Manage your login credentials and API keys. Changes take effect immediately.</p>
              
              <form id="settingsForm" onsubmit="saveSettings(event)">
                <div class="mb-2">
                  <label class="text-sm text-muted">Username</label>
                  <input type="text" name="newUsername" value="\${settingsData.username || ''}" placeholder="Enter username" />
                </div>
                
                <hr style="border-color:#262626;margin:1.5rem 0;" />
                
                <div class="mb-2">
                  <label class="text-sm text-muted">Current Password <span class="text-danger">*</span></label>
                  <input type="password" name="currentPassword" required placeholder="Required to save changes" autocomplete="current-password" />
                </div>
                
                <div class="mb-2">
                  <label class="text-sm text-muted">New Password <span class="text-muted">(optional)</span></label>
                  <input type="password" name="newPassword" placeholder="Leave blank to keep current" autocomplete="new-password" />
                </div>
                
                <div class="mb-2">
                  <label class="text-sm text-muted">Confirm New Password</label>
                  <input type="password" name="confirmPassword" placeholder="Confirm new password" autocomplete="new-password" />
                </div>
                
                <hr style="border-color:#262626;margin:1.5rem 0;" />
                
                <div class="mb-2">
                  <label class="text-sm text-muted">Anthropic API Key</label>
                  <div class="flex gap-1">
                    <input type="password" name="anthropicApiKey" id="apiKeyInput"
                           placeholder="\${settingsData.hasApiKey ? '••••••••••••••••••••••• (key saved)' : 'sk-ant-...'}" 
                           style="flex:1;" />
                    <button type="button" onclick="toggleApiKeyVisibility()" style="width:80px;">Show</button>
                  </div>
                  <p class="text-sm text-muted" style="margin-top:0.5rem;">
                    \${settingsData.hasApiKey 
                      ? '✅ API key is configured. Leave blank to keep current key, or enter new key to replace.'
                      : '⚠️ No API key configured. Word document AI parsing will not work.'}
                  </p>
                </div>
                
                <div id="settingsError" class="text-danger text-sm mb-2" style="display:none;"></div>
                <div id="settingsSuccess" class="text-success text-sm mb-2" style="display:none;"></div>
                
                <button type="submit" class="primary" style="width:100%;padding:0.75rem;">Save Settings</button>
              </form>
            </div>
            
            <div class="card" style="max-width:600px;margin-top:1rem;">
              <div class="card-header">ℹ️ About Settings</div>
              <ul class="text-sm text-muted" style="list-style:disc;padding-left:1.5rem;line-height:1.8;">
                <li>Credentials are stored securely in the database (passwords are hashed)</li>
                <li>API keys are encrypted before storage</li>
                <li>If you change your password, you'll need to re-login</li>
                <li>The Anthropic API key is required for AI-powered Word document parsing</li>
              </ul>
            </div>
          \`;
        }
        
        function toggleApiKeyVisibility() {
          const input = document.getElementById('apiKeyInput');
          if (input.type === 'password') {
            input.type = 'text';
            event.target.textContent = 'Hide';
          } else {
            input.type = 'password';
            event.target.textContent = 'Show';
          }
        }
        
        async function saveSettings(e) {
          e.preventDefault();
          const form = e.target;
          const errorDiv = document.getElementById('settingsError');
          const successDiv = document.getElementById('settingsSuccess');
          
          errorDiv.style.display = 'none';
          successDiv.style.display = 'none';
          
          const newPassword = form.newPassword.value;
          const confirmPassword = form.confirmPassword.value;
          
          // Validate passwords match
          if (newPassword && newPassword !== confirmPassword) {
            errorDiv.textContent = 'New passwords do not match';
            errorDiv.style.display = 'block';
            return;
          }
          
          // Validate password strength
          if (newPassword && newPassword.length < 6) {
            errorDiv.textContent = 'New password must be at least 6 characters';
            errorDiv.style.display = 'block';
            return;
          }
          
          const data = {
            currentPassword: form.currentPassword.value,
            newUsername: form.newUsername.value,
            newPassword: newPassword || undefined,
            anthropicApiKey: form.anthropicApiKey.value || undefined
          };
          
          // Don't send empty API key if we're not changing it
          if (form.anthropicApiKey.value === '') {
            delete data.anthropicApiKey;
          }
          
          try {
            const res = await api('/api/settings/update', {
              method: 'POST',
              body: JSON.stringify(data)
            });
            
            if (res.success) {
              if (res.requireRelogin) {
                alert(res.message);
                window.location.href = '/login';
              } else {
                successDiv.textContent = res.message;
                successDiv.style.display = 'block';
                form.currentPassword.value = '';
                form.newPassword.value = '';
                form.confirmPassword.value = '';
                form.anthropicApiKey.value = '';
                loadSettings();
              }
            } else {
              errorDiv.textContent = res.error || 'Failed to save settings';
              errorDiv.style.display = 'block';
            }
          } catch (err) {
            errorDiv.textContent = 'Network error';
            errorDiv.style.display = 'block';
          }
        }
        
        // ============================================
        // INIT
        // ============================================
        document.addEventListener('click', (e) => {
          // Close autocomplete dropdowns when clicking outside
          if (!e.target.closest('.autocomplete')) {
            document.querySelectorAll('.autocomplete-list').forEach(el => el.style.display = 'none');
          }
        });
        
        // Load correct module based on tab
        if (activeTab === 'schedule') loadSchedule();
        else if (activeTab === 'crew') loadCrew();
        else if (activeTab === 'quotes') loadQuotes();
        else if (activeTab === 'equipment') loadEquipment();
        else if (activeTab === 'settings') loadSettings();
        else loadSchedule();
      </script>
    </body>
    </html>
  `;
}

export default app
