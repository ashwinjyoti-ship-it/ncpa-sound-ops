import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
}

// Admin email
const ADMIN_EMAIL = 'ashwinjyoti@gmail.com'

// Simple password hashing (for production, use bcrypt or similar)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Verify password
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
}

// Generate session token
function generateToken(): string {
  return crypto.randomUUID()
}

export function setupAuthEndpoints(app: Hono<{ Bindings: Bindings }>) {
  
  // Initialize database tables
  app.post('/api/auth/init', async (c) => {
    try {
      // Create users table
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          approved_at DATETIME,
          approved_by TEXT
        )
      `).run()
      
      // Create sessions table
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `).run()
      
      // Check if admin exists
      const adminExists = await c.env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      ).bind(ADMIN_EMAIL).first()
      
      // Create admin user if not exists
      if (!adminExists) {
        const adminPassword = await hashPassword('admin123') // Default password
        await c.env.DB.prepare(`
          INSERT INTO users (email, password_hash, role, status, approved_at)
          VALUES (?, ?, 'admin', 'approved', CURRENT_TIMESTAMP)
        `).bind(ADMIN_EMAIL, adminPassword).run()
      }
      
      return c.json({ 
        success: true, 
        message: 'Auth system initialized',
        adminEmail: ADMIN_EMAIL,
        note: 'Default admin password: admin123 - Please change after first login'
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Signup
  app.post('/api/auth/signup', async (c) => {
    try {
      const { email, password } = await c.req.json()
      
      if (!email || !password) {
        return c.json({ success: false, error: 'Email and password required' }, 400)
      }
      
      // Check if user exists
      const existing = await c.env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      ).bind(email).first()
      
      if (existing) {
        return c.json({ success: false, error: 'User already exists' }, 400)
      }
      
      // Hash password
      const passwordHash = await hashPassword(password)
      
      // Create user (pending approval)
      await c.env.DB.prepare(`
        INSERT INTO users (email, password_hash, role, status)
        VALUES (?, ?, 'user', 'pending')
      `).bind(email, passwordHash).run()
      
      return c.json({ 
        success: true, 
        message: 'Signup successful. Awaiting admin approval.' 
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Login
  app.post('/api/auth/login', async (c) => {
    try {
      const { email, password } = await c.req.json()
      
      if (!email || !password) {
        return c.json({ success: false, error: 'Email and password required' }, 400)
      }
      
      // Get user
      const user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(email).first() as any
      
      if (!user) {
        return c.json({ success: false, error: 'Invalid credentials' }, 401)
      }
      
      // Check if approved
      if (user.status !== 'approved') {
        return c.json({ 
          success: false, 
          error: 'Account pending approval. Please contact admin.' 
        }, 403)
      }
      
      // Verify password
      const valid = await verifyPassword(password, user.password_hash)
      if (!valid) {
        return c.json({ success: false, error: 'Invalid credentials' }, 401)
      }
      
      // Create session
      const token = generateToken()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      
      await c.env.DB.prepare(`
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES (?, ?, ?)
      `).bind(user.id, token, expiresAt.toISOString()).run()
      
      // Set cookie with SameSite=None to allow iframe embedding
      setCookie(c, 'session_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'None',  // Required for iframe embedding
        maxAge: 7 * 24 * 60 * 60,
        path: '/'
      })
      
      return c.json({ 
        success: true, 
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Logout
  app.post('/api/auth/logout', async (c) => {
    try {
      const token = getCookie(c, 'session_token')
      
      if (token) {
        await c.env.DB.prepare(
          'DELETE FROM sessions WHERE token = ?'
        ).bind(token).run()
      }
      
      deleteCookie(c, 'session_token')
      
      return c.json({ success: true })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Get current user
  app.get('/api/auth/me', async (c) => {
    try {
      const token = getCookie(c, 'session_token')
      
      if (!token) {
        return c.json({ success: false, error: 'Not authenticated' }, 401)
      }
      
      // Get session
      const session = await c.env.DB.prepare(`
        SELECT s.*, u.email, u.role, u.status
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `).bind(token).first() as any
      
      if (!session) {
        return c.json({ success: false, error: 'Invalid or expired session' }, 401)
      }
      
      return c.json({ 
        success: true, 
        user: {
          id: session.user_id,
          email: session.email,
          role: session.role
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Admin: Get pending users
  app.get('/api/admin/pending-users', async (c) => {
    try {
      const token = getCookie(c, 'session_token')
      
      if (!token) {
        return c.json({ success: false, error: 'Not authenticated' }, 401)
      }
      
      // Verify admin
      const session = await c.env.DB.prepare(`
        SELECT u.role
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `).bind(token).first() as any
      
      if (!session || session.role !== 'admin') {
        return c.json({ success: false, error: 'Admin access required' }, 403)
      }
      
      // Get pending users
      const users = await c.env.DB.prepare(`
        SELECT id, email, created_at
        FROM users
        WHERE status = 'pending'
        ORDER BY created_at DESC
      `).all()
      
      return c.json({ success: true, users: users.results })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Admin: Approve user
  app.post('/api/admin/approve-user/:userId', async (c) => {
    try {
      const token = getCookie(c, 'session_token')
      const userId = c.req.param('userId')
      
      if (!token) {
        return c.json({ success: false, error: 'Not authenticated' }, 401)
      }
      
      // Verify admin
      const session = await c.env.DB.prepare(`
        SELECT u.id, u.email, u.role
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `).bind(token).first() as any
      
      if (!session || session.role !== 'admin') {
        return c.json({ success: false, error: 'Admin access required' }, 403)
      }
      
      // Approve user
      await c.env.DB.prepare(`
        UPDATE users
        SET status = 'approved',
            approved_at = CURRENT_TIMESTAMP,
            approved_by = ?
        WHERE id = ?
      `).bind(session.email, userId).run()
      
      return c.json({ success: true, message: 'User approved' })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Admin: Reject user
  app.post('/api/admin/reject-user/:userId', async (c) => {
    try {
      const token = getCookie(c, 'session_token')
      const userId = c.req.param('userId')
      
      if (!token) {
        return c.json({ success: false, error: 'Not authenticated' }, 401)
      }
      
      // Verify admin
      const session = await c.env.DB.prepare(`
        SELECT u.role
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `).bind(token).first() as any
      
      if (!session || session.role !== 'admin') {
        return c.json({ success: false, error: 'Admin access required' }, 403)
      }
      
      // Delete user
      await c.env.DB.prepare(
        'DELETE FROM users WHERE id = ?'
      ).bind(userId).run()
      
      return c.json({ success: true, message: 'User rejected' })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // Admin: Change password
  app.post('/api/auth/change-password', async (c) => {
    try {
      const token = getCookie(c, 'session_token')
      const { currentPassword, newPassword } = await c.req.json()
      
      if (!token) {
        return c.json({ success: false, error: 'Not authenticated' }, 401)
      }
      
      // Get user
      const session = await c.env.DB.prepare(`
        SELECT u.*
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `).bind(token).first() as any
      
      if (!session) {
        return c.json({ success: false, error: 'Invalid session' }, 401)
      }
      
      // Verify current password
      const valid = await verifyPassword(currentPassword, session.password_hash)
      if (!valid) {
        return c.json({ success: false, error: 'Current password incorrect' }, 401)
      }
      
      // Hash new password
      const newHash = await hashPassword(newPassword)
      
      // Update password
      await c.env.DB.prepare(
        'UPDATE users SET password_hash = ? WHERE id = ?'
      ).bind(newHash, session.id).run()
      
      return c.json({ success: true, message: 'Password changed successfully' })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}
