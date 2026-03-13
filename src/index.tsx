import { Hono } from 'hono'
import { setupAuthEndpoints } from './auth-endpoints'
import { setupCrewEndpoints } from './crew-endpoints'
import { setupParseWordEndpoints } from './parse-word'

type Bindings = {
  DB: D1Database
  AI: Ai
  ANTHROPIC_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Mount API endpoints
setupAuthEndpoints(app as any)
setupCrewEndpoints(app as any)
setupParseWordEndpoints(app as any)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

// ============================================================
// FRONTEND — single-page app served at /
// ============================================================
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NCPA Sound Ops</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d26;
    --surface2: #22263a;
    --border: #2d3250;
    --accent: #6c8ef5;
    --accent2: #a78bfa;
    --green: #22c55e;
    --red: #ef4444;
    --yellow: #f59e0b;
    --text: #e2e8f0;
    --muted: #8892b0;
    --radius: 8px;
    --font: 'Inter', system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; min-height: 100vh; }
  a { color: var(--accent); text-decoration: none; }
  input, select, textarea {
    background: var(--bg); border: 1px solid var(--border); color: var(--text);
    border-radius: var(--radius); padding: 8px 12px; font-size: 14px; width: 100%;
    font-family: var(--font); outline: none;
  }
  input:focus, select:focus, textarea:focus { border-color: var(--accent); }
  button {
    cursor: pointer; border: none; border-radius: var(--radius); padding: 8px 16px;
    font-size: 14px; font-family: var(--font); font-weight: 500; transition: opacity .15s;
  }
  button:hover { opacity: 0.85; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
  .btn-danger { background: var(--red); color: #fff; }
  .btn-success { background: var(--green); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  /* Layout */
  #auth-screen { display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .auth-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 40px; width: 360px; }
  .auth-box h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .auth-box .subtitle { color: var(--muted); margin-bottom: 24px; font-size: 13px; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 5px; font-weight: 500; }
  .auth-toggle { text-align: center; margin-top: 16px; font-size: 13px; color: var(--muted); }

  #app-shell { display: none; flex-direction: column; min-height: 100vh; }
  header {
    background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 0 24px; display: flex; align-items: center; gap: 16px; height: 52px; flex-shrink: 0;
  }
  header .logo { font-weight: 700; font-size: 16px; color: var(--text); letter-spacing: -0.3px; }
  header .logo span { color: var(--accent); }
  nav { display: flex; gap: 2px; flex: 1; }
  nav button {
    background: transparent; color: var(--muted); padding: 6px 14px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
  }
  nav button.active { background: var(--surface2); color: var(--text); }
  .user-info { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
  .user-info .role-badge {
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 12px; padding: 2px 10px; font-size: 11px;
  }
  main { flex: 1; padding: 24px; max-width: 1280px; margin: 0 auto; width: 100%; }

  /* Tab panels */
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* Cards */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
  .card-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

  /* Tables */
  .tbl-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { background: var(--surface2); padding: 8px 12px; text-align: left; font-weight: 600; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--border); }
  tbody td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tbody tr:hover td { background: var(--surface2); }
  tbody tr:last-child td { border-bottom: none; }

  /* Alerts */
  .alert { padding: 10px 14px; border-radius: var(--radius); font-size: 13px; margin-bottom: 14px; }
  .alert-error { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: #fca5a5; }
  .alert-success { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); color: #86efac; }
  .alert-warn { background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.3); color: #fcd34d; }
  .alert-info { background: rgba(108,142,245,.1); border: 1px solid rgba(108,142,245,.3); color: #a5b4fc; }

  /* Badges */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-senior { background: rgba(168,85,247,.2); color: #c084fc; }
  .badge-mid { background: rgba(59,130,246,.2); color: #93c5fd; }
  .badge-junior { background: rgba(34,197,94,.2); color: #86efac; }
  .badge-hired { background: rgba(245,158,11,.2); color: #fcd34d; }
  .badge-foh { background: rgba(108,142,245,.2); color: #a5b4fc; }
  .badge-stage { background: rgba(34,197,94,.2); color: #86efac; }
  .badge-conflict { background: rgba(239,68,68,.2); color: #fca5a5; }
  .badge-manual { background: rgba(245,158,11,.2); color: #fcd34d; }

  /* Upload area */
  .upload-area {
    border: 2px dashed var(--border); border-radius: var(--radius);
    padding: 32px; text-align: center; cursor: pointer; transition: border-color .15s;
  }
  .upload-area:hover { border-color: var(--accent); }
  .upload-area.dragover { border-color: var(--accent); background: rgba(108,142,245,.05); }
  .upload-icon { font-size: 32px; margin-bottom: 8px; }
  .upload-label { color: var(--muted); font-size: 13px; }
  .upload-label strong { color: var(--accent); }

  /* Misc */
  .row { display: flex; gap: 10px; align-items: center; }
  .spacer { flex: 1; }
  .text-muted { color: var(--muted); }
  .text-sm { font-size: 12px; }
  hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty { text-align: center; padding: 40px; color: var(--muted); font-size: 13px; }

  /* Events list */
  .event-card {
    background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 12px 16px; margin-bottom: 8px; display: flex; gap: 12px; align-items: flex-start;
  }
  .event-date { font-size: 11px; color: var(--muted); white-space: nowrap; min-width: 70px; }
  .event-body { flex: 1; }
  .event-name { font-weight: 600; font-size: 13px; }
  .event-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .event-crew { font-size: 12px; margin-top: 4px; }

  /* Assignment result */
  .assign-row {
    background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 10px 14px; margin-bottom: 6px;
  }
  .assign-row.conflict { border-color: rgba(239,68,68,.4); }
  .assign-row.manual { border-color: rgba(245,158,11,.4); }
  .assign-header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .assign-detail { font-size: 12px; color: var(--muted); margin-top: 4px; }

  /* Tabs within cards */
  .inner-tabs { display: flex; gap: 2px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 0; }
  .inner-tab { background: transparent; color: var(--muted); padding: 6px 14px; border-radius: 6px 6px 0 0; font-size: 13px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .inner-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* Calendar grid for unavailability */
  .cal-grid { display: grid; grid-template-columns: auto repeat(31, 1fr); gap: 2px; font-size: 11px; overflow-x: auto; }
  .cal-header { background: var(--surface2); padding: 4px; text-align: center; border-radius: 3px; color: var(--muted); }
  .cal-name { padding: 4px 8px; white-space: nowrap; display: flex; align-items: center; }
  .cal-cell {
    width: 26px; height: 26px; border-radius: 3px; cursor: pointer; border: 1px solid transparent;
    display: flex; align-items: center; justify-content: center; font-size: 10px; transition: all .1s;
    background: var(--bg);
  }
  .cal-cell:hover { border-color: var(--accent); }
  .cal-cell.unavail { background: rgba(239,68,68,.25); border-color: rgba(239,68,68,.5); }
  .cal-cell.empty { background: transparent; cursor: default; border: none; }
  .cal-cell.today { border-color: var(--accent); }
</style>
</head>
<body>

<!-- AUTH SCREEN -->
<div id="auth-screen">
  <div class="auth-box">
    <h1>NCPA <span style="color:var(--accent)">Sound Ops</span></h1>
    <p class="subtitle">Sound crew workflow management</p>
    <div id="auth-error" class="alert alert-error" style="display:none"></div>
    <div id="login-form">
      <div class="field"><label>Email</label><input id="login-email" type="email" placeholder="you@example.com" autocomplete="username"></div>
      <div class="field"><label>Password</label><input id="login-password" type="password" placeholder="••••••••" autocomplete="current-password"></div>
      <button class="btn-primary" style="width:100%;margin-top:4px" onclick="doLogin()">Sign in</button>
      <div class="auth-toggle">No account? <a href="#" onclick="showSignup()">Request access</a></div>
    </div>
    <div id="signup-form" style="display:none">
      <div class="field"><label>Email</label><input id="signup-email" type="email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input id="signup-password" type="password" placeholder="min 8 chars"></div>
      <div class="alert alert-info" style="margin-bottom:14px;font-size:12px">Your account will require admin approval before you can log in.</div>
      <button class="btn-primary" style="width:100%;margin-top:4px" onclick="doSignup()">Request Access</button>
      <div class="auth-toggle">Have an account? <a href="#" onclick="showLogin()">Sign in</a></div>
    </div>
  </div>
</div>

<!-- APP SHELL -->
<div id="app-shell">
  <header>
    <div class="logo">NCPA <span>Sound Ops</span></div>
    <nav>
      <button class="active" onclick="switchTab('sound-manager',this)">Sound Manager</button>
      <button onclick="switchTab('crew-assign',this)">Crew Assignment</button>
      <button onclick="switchTab('crew-mgmt',this)">Crew</button>
      <button onclick="switchTab('workload',this)">Workload</button>
      <button id="admin-nav" onclick="switchTab('admin',this)" style="display:none">Admin</button>
    </nav>
    <div class="user-info">
      <span id="user-email-display"></span>
      <span class="role-badge" id="user-role-display"></span>
      <button class="btn-secondary btn-sm" id="settings-nav" onclick="switchTab('settings',null)">⚙ Settings</button>
      <button class="btn-secondary btn-sm" onclick="doLogout()">Sign out</button>
    </div>
  </header>
  <main>

    <!-- ============ SOUND MANAGER TAB ============ -->
    <div id="tab-sound-manager" class="tab-panel active">
      <div class="row" style="margin-bottom:16px">
        <div>
          <h2 style="font-size:18px;font-weight:700">Sound Manager</h2>
          <p class="text-muted text-sm">Parse NCPA event schedules from Word documents</p>
        </div>
        <div class="spacer"></div>
        <button class="btn-secondary" onclick="loadSoundEvents()">↻ Refresh</button>
      </div>

      <div class="grid-2">
        <!-- Upload card -->
        <div class="card">
          <div class="card-title">📄 Parse Word Document</div>
          <div class="upload-area" id="upload-area" onclick="document.getElementById('file-input').click()" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onFileDrop(event)">
            <div class="upload-icon">📋</div>
            <div class="upload-label">Drop a <strong>.docx</strong> file here or <strong>click to browse</strong></div>
            <div class="text-sm text-muted" style="margin-top:4px">NCPA Sound Crew schedule documents</div>
          </div>
          <input id="file-input" type="file" accept=".docx,.doc,.txt" style="display:none" onchange="onFileSelect(event)">
          <div id="parse-status" style="margin-top:12px;display:none"></div>
          <div id="parsed-preview" style="margin-top:12px"></div>
        </div>

        <!-- Events quick stats -->
        <div class="card">
          <div class="card-title">📊 Recent Batches</div>
          <div id="sound-batches-list"><div class="empty">No batches yet</div></div>
        </div>
      </div>

      <!-- Events table -->
      <div class="card">
        <div class="row" style="margin-bottom:14px">
          <div class="card-title" style="margin-bottom:0">📅 Events</div>
          <div class="spacer"></div>
          <select id="sound-batch-filter" style="width:220px" onchange="loadSoundEventsByBatch()">
            <option value="">All batches</option>
          </select>
        </div>
        <div id="sound-events-table"><div class="empty">Select a batch to view events</div></div>
      </div>
    </div>

    <!-- ============ CREW ASSIGNMENT TAB ============ -->
    <div id="tab-crew-assign" class="tab-panel">
      <div class="row" style="margin-bottom:16px">
        <div>
          <h2 style="font-size:18px;font-weight:700">Crew Assignment</h2>
          <p class="text-muted text-sm">Run the automatic assignment engine on event batches</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">⚡ Run Assignment Engine</div>
          <div class="field">
            <label>Batch</label>
            <select id="assign-batch-select" style="width:100%">
              <option value="">Select a batch…</option>
            </select>
          </div>
          <div class="card-title" style="margin-top:12px;font-size:13px">FOH Preferences (optional)</div>
          <div id="foh-prefs-list"></div>
          <button class="btn-secondary btn-sm" onclick="addFohPref()" style="margin-bottom:12px">+ Add preference</button>
          <hr>
          <button class="btn-primary" style="width:100%" onclick="runAssignment()">Run Assignment Engine</button>
          <div id="assign-run-status" style="margin-top:10px"></div>
        </div>

        <div class="card">
          <div class="card-title">⚠️ Conflicts</div>
          <div id="assign-conflicts"><div class="empty text-sm">Run the engine to see conflicts</div></div>
        </div>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:14px">
          <div class="card-title" style="margin-bottom:0">📋 Assignment Results</div>
          <div class="spacer"></div>
          <select id="assign-view-batch" style="width:220px" onchange="loadAssignments()">
            <option value="">Select batch…</option>
          </select>
          <button class="btn-secondary btn-sm" onclick="exportCSV()">Export CSV</button>
        </div>
        <div id="assign-results"><div class="empty">Run the engine or select a batch to view assignments</div></div>
      </div>
    </div>

    <!-- ============ CREW MGMT TAB ============ -->
    <div id="tab-crew-mgmt" class="tab-panel">
      <div class="row" style="margin-bottom:16px">
        <div>
          <h2 style="font-size:18px;font-weight:700">Crew Management</h2>
          <p class="text-muted text-sm">View crew members and manage day-off / unavailability</p>
        </div>
      </div>

      <div class="inner-tabs">
        <button class="inner-tab active" onclick="switchInnerTab('crew-list-panel','crew-unavail-panel',this)">Crew List</button>
        <button class="inner-tab" onclick="switchInnerTab('crew-unavail-panel','crew-list-panel',this)">Unavailability Calendar</button>
      </div>

      <div id="crew-list-panel">
        <div id="crew-list-content"><div class="empty"><span class="spinner"></span></div></div>
      </div>

      <div id="crew-unavail-panel" style="display:none">
        <div class="card">
          <div class="row" style="margin-bottom:14px">
            <div class="card-title" style="margin-bottom:0">📅 Unavailability Calendar</div>
            <div class="spacer"></div>
            <input type="month" id="unavail-month" style="width:160px" onchange="loadUnavailCalendar()">
          </div>
          <div id="unavail-calendar"><div class="empty">Select a month above</div></div>
        </div>
      </div>
    </div>

    <!-- ============ WORKLOAD TAB ============ -->
    <div id="tab-workload" class="tab-panel">
      <div class="row" style="margin-bottom:16px">
        <div>
          <h2 style="font-size:18px;font-weight:700">Workload Report</h2>
          <p class="text-muted text-sm">Monthly assignment counts per crew member</p>
        </div>
        <div class="spacer"></div>
        <input type="month" id="workload-month" style="width:160px" onchange="loadWorkload()">
        <button class="btn-secondary" onclick="loadWorkload()">↻ Load</button>
      </div>
      <div class="card">
        <div id="workload-content"><div class="empty">Select a month to load report</div></div>
      </div>
    </div>

    <!-- ============ ADMIN TAB ============ -->
    <div id="tab-admin" class="tab-panel">
      <div class="row" style="margin-bottom:16px">
        <div>
          <h2 style="font-size:18px;font-weight:700">Admin Panel</h2>
          <p class="text-muted text-sm">User management and system settings</p>
        </div>
        <div class="spacer"></div>
        <button class="btn-secondary" onclick="loadAdminUsers()">↻ Refresh</button>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">⏳ Pending Approvals</div>
          <div id="pending-users-list"><div class="empty">No pending users</div></div>
        </div>
        <div class="card">
          <div class="card-title">👥 All Users</div>
          <div id="all-users-list"><div class="empty">Loading…</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔧 System</div>
        <div class="row">
          <button class="btn-secondary" onclick="initAuth()">Initialize Auth System</button>
          <span class="text-muted text-sm">Creates default admin if not exists (admin@ncpa / admin123)</span>
        </div>
        <div id="init-status" style="margin-top:10px"></div>
      </div>
    </div>

    <!-- ============ SETTINGS TAB ============ -->
    <div id="tab-settings" class="tab-panel">
      <div class="row" style="margin-bottom:16px">
        <div>
          <h2 style="font-size:18px;font-weight:700">Settings</h2>
          <p class="text-muted text-sm">Manage your account</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">👤 Your Account</div>
          <div class="field"><label>Email</label><input id="settings-email" type="text" disabled style="opacity:.6"></div>
          <div class="field"><label>Role</label><input id="settings-role" type="text" disabled style="opacity:.6"></div>
        </div>

        <div class="card">
          <div class="card-title">🔑 Change Password</div>
          <div id="pw-alert" style="display:none"></div>
          <div class="field"><label>Current Password</label><input id="pw-current" type="password" placeholder="••••••••"></div>
          <div class="field"><label>New Password</label><input id="pw-new" type="password" placeholder="••••••••"></div>
          <div class="field"><label>Confirm New Password</label><input id="pw-confirm" type="password" placeholder="••••••••"></div>
          <button class="btn-primary" onclick="changePassword()">Update Password</button>
        </div>
      </div>
    </div>

  </main>
</div>

<script>
// ============================================================
// STATE
// ============================================================
let currentUser = null
let crewList = []
let allBatches = []
let fohPrefsCount = 0

// ============================================================
// INIT
// ============================================================
async function init() {
  try {
    const res = await api('GET', '/api/auth/me')
    if (res.success) {
      currentUser = res.user
      showApp()
    } else {
      showAuthScreen()
    }
  } catch {
    showAuthScreen()
  }
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex'
  document.getElementById('app-shell').style.display = 'none'
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none'
  document.getElementById('app-shell').style.display = 'flex'
  document.getElementById('user-email-display').textContent = currentUser.email
  document.getElementById('user-role-display').textContent = currentUser.role
  if (currentUser.role === 'admin') document.getElementById('admin-nav').style.display = ''
  loadBatches()
  loadCrewList()
  // Set today's month as default
  const today = new Date()
  const ym = today.toISOString().slice(0,7)
  document.getElementById('workload-month').value = ym
  document.getElementById('unavail-month').value = ym
}

// ============================================================
// NAVIGATION
// ============================================================
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'))
  document.getElementById('tab-' + tab).classList.add('active')
  if (btn) btn.classList.add('active')

  if (tab === 'sound-manager') loadSoundEvents()
  if (tab === 'workload') loadWorkload()
  if (tab === 'admin') loadAdminUsers()
  if (tab === 'crew-mgmt') loadCrewList()
  if (tab === 'settings') loadSettings()
}

function switchInnerTab(show, hide, btn) {
  document.getElementById(show).style.display = ''
  document.getElementById(hide).style.display = 'none'
  document.querySelectorAll('.inner-tab').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
}

// ============================================================
// API HELPER
// ============================================================
async function api(method, path, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(path, opts)
  if (res.status === 204) return {}
  return res.json()
}

function setHtml(id, html) { document.getElementById(id).innerHTML = html }
function show(id) { document.getElementById(id).style.display = '' }
function hide(id) { document.getElementById(id).style.display = 'none' }
function alertHtml(type, msg) { return '<div class="alert alert-' + type + '">' + esc(msg) + '</div>' }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function levelBadge(l) { return '<span class="badge badge-' + (l||'').toLowerCase() + '">' + (l||'') + '</span>' }
function fmt(s) { return s ? s.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_,y,m,d)=>d+'/'+m+'/'+y) : '' }

// ============================================================
// AUTH
// ============================================================
function showLogin() {
  show('login-form'); hide('signup-form'); hide('auth-error')
}
function showSignup() {
  hide('login-form'); show('signup-form'); hide('auth-error')
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  hide('auth-error')
  if (!email || !password) { showError('Email and password required'); return }
  try {
    const res = await api('POST', '/api/auth/login', { email, password })
    if (res.success) { currentUser = res.user; showApp() }
    else showError(res.error || 'Login failed')
  } catch(e) { showError('Network error') }
}

async function doSignup() {
  const email = document.getElementById('signup-email').value.trim()
  const password = document.getElementById('signup-password').value
  hide('auth-error')
  if (!email || !password) { showError('Email and password required'); return }
  try {
    const res = await api('POST', '/api/auth/signup', { email, password })
    if (res.success) {
      setHtml('auth-error', res.message || 'Signup successful! Awaiting admin approval.')
      document.getElementById('auth-error').className = 'alert alert-success'
      show('auth-error')
      showLogin()
    } else showError(res.error || 'Signup failed')
  } catch { showError('Network error') }
}

function showError(msg) {
  const el = document.getElementById('auth-error')
  el.textContent = msg
  el.className = 'alert alert-error'
  el.style.display = ''
}

async function doLogout() {
  await api('POST', '/api/auth/logout')
  currentUser = null
  showAuthScreen()
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('login-form').style.display !== 'none') doLogin()
    else if (document.getElementById('signup-form').style.display !== 'none') doSignup()
  }
})

// ============================================================
// BATCH MANAGEMENT (shared)
// ============================================================
async function loadBatches() {
  try {
    const batches = await api('GET', '/api/crew/events')
    allBatches = Array.isArray(batches) ? batches : []
    populateBatchSelects()
  } catch { allBatches = [] }
}

function populateBatchSelects() {
  const opts = allBatches.map(b =>
    '<option value="' + esc(b.batch_id) + '">' + esc(b.batch_id) + ' (' + (b.event_count||'?') + ' events, from ' + fmt(b.first_date) + ')</option>'
  ).join('')
  const selects = ['sound-batch-filter','assign-batch-select','assign-view-batch']
  selects.forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    const prev = el.value
    el.innerHTML = '<option value="">Select batch…</option>' + opts
    if (prev) el.value = prev
  })
  // Sound manager filter has "All batches" as first
  const sf = document.getElementById('sound-batch-filter')
  if (sf) sf.options[0].text = 'All batches'
}

// ============================================================
// SOUND MANAGER
// ============================================================
async function loadSoundEvents() {
  await loadBatches()
  const batchesHtml = allBatches.length === 0
    ? '<div class="empty">No batches uploaded yet</div>'
    : allBatches.map(b => \`
        <div class="event-card" style="cursor:pointer" onclick="document.getElementById('sound-batch-filter').value='\${esc(b.batch_id)}';loadSoundEventsByBatch()">
          <div>
            <div style="font-weight:600;font-size:13px">\${esc(b.batch_id)}</div>
            <div class="text-muted text-sm">\${b.event_count} events · from \${fmt(b.first_date)}</div>
          </div>
        </div>
      \`).join('')
  setHtml('sound-batches-list', batchesHtml)
}

async function loadSoundEventsByBatch() {
  const batchId = document.getElementById('sound-batch-filter').value
  if (!batchId) { setHtml('sound-events-table', '<div class="empty">Select a batch</div>'); return }
  setHtml('sound-events-table', '<div class="empty"><span class="spinner"></span> Loading…</div>')
  try {
    const events = await api('GET', '/api/crew/events?batch_id=' + encodeURIComponent(batchId))
    if (!events.length) { setHtml('sound-events-table', '<div class="empty">No events in this batch</div>'); return }
    let html = '<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Program</th><th>Venue</th><th>Team</th><th>Sound Requirements</th><th>Call Time</th><th>Crew</th></tr></thead><tbody>'
    events.forEach(e => {
      html += \`<tr>
        <td>\${fmt(e.event_date)}</td>
        <td>\${esc(e.program)}</td>
        <td>\${esc(e.venue)}</td>
        <td>\${esc(e.team||'')}</td>
        <td>\${esc(e.sound_requirements||'')}</td>
        <td>\${esc(e.call_time||'')}</td>
        <td>\${esc(e.crew||'')}</td>
      </tr>\`
    })
    html += '</tbody></table></div>'
    setHtml('sound-events-table', html)
  } catch(e) {
    setHtml('sound-events-table', alertHtml('error', e.message))
  }
}

// ============================================================
// FILE PARSING
// ============================================================
function onDragOver(e) { e.preventDefault(); document.getElementById('upload-area').classList.add('dragover') }
function onDragLeave() { document.getElementById('upload-area').classList.remove('dragover') }
function onFileDrop(e) {
  e.preventDefault()
  document.getElementById('upload-area').classList.remove('dragover')
  const file = e.dataTransfer.files[0]
  if (file) processFile(file)
}
function onFileSelect(e) { const file = e.target.files[0]; if (file) processFile(file) }

async function processFile(file) {
  show('parse-status')
  setHtml('parse-status', '<span class="spinner"></span> Reading file…')
  setHtml('parsed-preview', '')
  try {
    const text = await extractTextFromFile(file)
    setHtml('parse-status', '<span class="spinner"></span> Parsing with AI (' + Math.round(text.length/1000) + 'k chars)…')
    const result = await api('POST', '/api/ai/parse-word', { text, filename: file.name })
    if (!result.success) throw new Error(result.error || 'Parse failed')
    const events = result.events || []
    setHtml('parse-status', alertHtml('success', 'Found ' + events.length + ' events in ' + result.chunks + ' chunk(s). Review and upload below.'))
    renderParsedEvents(events, file.name)
  } catch(e) {
    setHtml('parse-status', alertHtml('error', e.message))
  }
}

async function extractTextFromFile(file) {
  if (file.name.endsWith('.txt')) {
    return file.text()
  }
  // For .docx/.doc: try to extract as text via FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const arr = new Uint8Array(e.target.result)
        // Try to find readable text chunks in the binary
        let text = ''
        let chunk = ''
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i]
          if (c >= 32 && c < 127) {
            chunk += String.fromCharCode(c)
          } else if (c === 10 || c === 13) {
            if (chunk.length > 2) text += chunk + '\\n'
            chunk = ''
          } else {
            if (chunk.length > 2) text += chunk + ' '
            chunk = ''
          }
        }
        if (chunk.length > 2) text += chunk
        // Filter out garbage lines (too many non-word chars)
        const lines = text.split('\\n').filter(l => {
          const words = l.match(/[a-zA-Z]{2,}/g)
          return words && words.length >= 2
        })
        resolve(lines.join('\\n'))
      } catch(err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

let parsedEventsBuffer = []

function renderParsedEvents(events, filename) {
  parsedEventsBuffer = events
  if (!events.length) { setHtml('parsed-preview', '<div class="empty">No events found</div>'); return }
  let html = \`<div style="margin-bottom:10px;display:flex;align-items:center;gap:10px">
    <span class="text-muted text-sm">\${events.length} events ready to upload</span>
    <div class="spacer"></div>
    <button class="btn-primary btn-sm" onclick="uploadParsedEvents()">Upload to Database</button>
  </div>\`
  html += events.slice(0,10).map(e => \`
    <div class="event-card">
      <div class="event-date">\${fmt(e.event_date)}</div>
      <div class="event-body">
        <div class="event-name">\${esc(e.program)}</div>
        <div class="event-meta">\${esc(e.venue)} · \${esc(e.team||'')}</div>
        \${e.sound_requirements ? '<div class="text-sm text-muted" style="margin-top:3px">🔊 ' + esc(e.sound_requirements) + '</div>' : ''}
        \${e.call_time ? '<div class="text-sm text-muted">⏰ ' + esc(e.call_time) + '</div>' : ''}
      </div>
    </div>
  \`).join('')
  if (events.length > 10) html += \`<div class="text-muted text-sm" style="padding:8px">…and \${events.length - 10} more</div>\`
  setHtml('parsed-preview', html)
}

async function uploadParsedEvents() {
  if (!parsedEventsBuffer.length) return
  setHtml('parse-status', '<span class="spinner"></span> Uploading…')
  try {
    const result = await api('POST', '/api/crew/events/upload', { events: parsedEventsBuffer })
    setHtml('parse-status', alertHtml('success', 'Uploaded ' + result.events.length + ' events as batch ' + result.batch_id))
    parsedEventsBuffer = []
    setHtml('parsed-preview', '')
    await loadBatches()
    document.getElementById('sound-batch-filter').value = result.batch_id
    loadSoundEventsByBatch()
  } catch(e) {
    setHtml('parse-status', alertHtml('error', e.message))
  }
}

// ============================================================
// CREW ASSIGNMENT
// ============================================================
function addFohPref() {
  fohPrefsCount++
  const id = 'foh-pref-' + fohPrefsCount
  const div = document.createElement('div')
  div.id = id
  div.className = 'row'
  div.style.marginBottom = '8px'
  div.innerHTML = \`
    <input placeholder="Event name contains…" style="flex:2" id="\${id}-event">
    <input placeholder="Venue (e.g. JBT)" style="flex:1" id="\${id}-venue">
    <select style="flex:1.5" id="\${id}-crew">\${crewList.map(c=>'<option value="'+c.id+'">'+esc(c.name)+' ('+c.level+')</option>').join('')}</select>
    <button class="btn-danger btn-sm" onclick="document.getElementById('\${id}').remove()">✕</button>
  \`
  document.getElementById('foh-prefs-list').appendChild(div)
}

function getFohPrefs() {
  const prefs = []
  document.querySelectorAll('[id^="foh-pref-"]').forEach(div => {
    const id = div.id
    const eventContains = document.getElementById(id + '-event')?.value?.trim()
    const venue = document.getElementById(id + '-venue')?.value?.trim()
    const crewId = parseInt(document.getElementById(id + '-crew')?.value)
    if (eventContains && venue && crewId) prefs.push({ eventContains, venue, crewId })
  })
  return prefs
}

async function runAssignment() {
  const batchId = document.getElementById('assign-batch-select').value
  if (!batchId) { setHtml('assign-run-status', alertHtml('warn', 'Select a batch first')); return }
  setHtml('assign-run-status', '<span class="spinner"></span> Running…')
  setHtml('assign-results', '<div class="empty"><span class="spinner"></span> Running assignment engine…</div>')
  setHtml('assign-conflicts', '<div class="empty"><span class="spinner"></span></div>')
  try {
    const result = await api('POST', '/api/assignments/run', { batch_id: batchId, foh_preferences: getFohPrefs() })
    setHtml('assign-run-status', alertHtml('success', 'Done! ' + result.assignments.length + ' events, ' + result.conflicts.length + ' conflicts.'))
    renderAssignmentResults(result.assignments)
    renderConflicts(result.conflicts)
    document.getElementById('assign-view-batch').value = batchId
  } catch(e) {
    setHtml('assign-run-status', alertHtml('error', e.message))
  }
}

async function loadAssignments() {
  const batchId = document.getElementById('assign-view-batch').value
  if (!batchId) return
  setHtml('assign-results', '<div class="empty"><span class="spinner"></span> Loading…</div>')
  try {
    const rows = await api('GET', '/api/assignments?batch_id=' + encodeURIComponent(batchId))
    if (!rows.length) { setHtml('assign-results', '<div class="empty">No assignments for this batch</div>'); return }
    // Group by event
    const byEvent = {}
    rows.forEach(r => {
      if (!byEvent[r.event_id]) byEvent[r.event_id] = { ...r, foh_name: null, stage_names: [] }
      if (r.role === 'FOH') byEvent[r.event_id].foh_name = r.crew_name
      else byEvent[r.event_id].stage_names.push(r.crew_name)
    })
    renderAssignmentResults(Object.values(byEvent).map(e => ({
      event_id: e.event_id, event_name: e.event_name, event_date: e.event_date,
      venue: e.venue, vertical: e.vertical, foh_name: e.foh_name, stage_names: e.stage_names,
      needs_manual_review: e.needs_manual_review
    })))
  } catch(e) { setHtml('assign-results', alertHtml('error', e.message)) }
}

function renderAssignmentResults(assignments) {
  if (!assignments.length) { setHtml('assign-results', '<div class="empty">No assignments</div>'); return }
  const html = assignments.map(a => {
    const isManual = a.needs_manual_review || a.foh_conflict
    const cls = isManual ? 'assign-row manual' : (a.foh_conflict || a.stage_conflict ? 'assign-row conflict' : 'assign-row')
    return \`<div class="\${cls}">
      <div class="assign-header">
        <span style="font-weight:600;font-size:13px">\${esc(a.event_name)}</span>
        <span class="badge badge-foh">\${fmt(a.event_date)}</span>
        <span class="text-muted text-sm">\${esc(a.venue||'')}</span>
        \${isManual ? '<span class="badge badge-manual">Manual</span>' : ''}
        \${a.foh_conflict && !isManual ? '<span class="badge badge-conflict">FOH Conflict</span>' : ''}
        \${a.stage_conflict ? '<span class="badge badge-conflict">Stage Conflict</span>' : ''}
      </div>
      <div class="assign-detail">
        \${a.foh_name ? '🎧 FOH: <strong>' + esc(a.foh_name) + '</strong>' : '<span style="color:var(--red)">No FOH assigned</span>'}
        \${a.stage_names && a.stage_names.length ? ' &nbsp;·&nbsp; 🔧 Stage: ' + a.stage_names.map(n=>esc(n)).join(', ') : ''}
      </div>
    </div>\`
  }).join('')
  setHtml('assign-results', html)
}

function renderConflicts(conflicts) {
  if (!conflicts.length) { setHtml('assign-conflicts', '<div class="empty text-sm" style="color:var(--green)">✓ No conflicts!</div>'); return }
  const html = conflicts.map(c => \`
    <div class="assign-row conflict" style="margin-bottom:6px">
      <div style="font-weight:600;font-size:13px">\${esc(c.event_name)}</div>
      <div class="text-sm text-muted">\${esc(c.type)}: \${esc(c.reason)}</div>
    </div>
  \`).join('')
  setHtml('assign-conflicts', html)
}

function exportCSV() {
  const batchId = document.getElementById('assign-view-batch').value
  if (!batchId) { alert('Select a batch first'); return }
  window.open('/api/assignments/export/csv?batch_id=' + encodeURIComponent(batchId))
}

// ============================================================
// CREW LIST
// ============================================================
async function loadCrewList() {
  setHtml('crew-list-content', '<div class="empty"><span class="spinner"></span></div>')
  try {
    crewList = await api('GET', '/api/crew')
    if (!crewList.length) { setHtml('crew-list-content', '<div class="empty">No crew members found. Run db:seed.</div>'); return }
    const venues = Object.keys(crewList[0]?.venue_capabilities || {})
    let html = '<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Level</th>'
    venues.forEach(v => { html += '<th>' + esc(v) + '</th>' })
    html += '<th>Special Notes</th></tr></thead><tbody>'
    crewList.forEach(cr => {
      html += '<tr><td>' + esc(cr.name) + '</td><td>' + levelBadge(cr.level) + '</td>'
      venues.forEach(v => {
        const cap = cr.venue_capabilities[v] || 'N'
        const color = cap === 'Y*' ? 'var(--accent2)' : cap === 'Y' ? 'var(--green)' : 'var(--muted)'
        html += '<td style="color:' + color + ';font-weight:' + (cap!=='N'?'600':'400') + '">' + esc(cap) + '</td>'
      })
      html += '<td class="text-muted text-sm">' + esc(cr.special_notes||'') + '</td></tr>'
    })
    html += '</tbody></table></div>'
    setHtml('crew-list-content', html)
  } catch(e) {
    setHtml('crew-list-content', alertHtml('error', e.message))
  }
}

// ============================================================
// UNAVAILABILITY CALENDAR
// ============================================================
let unavailData = {}

async function loadUnavailCalendar() {
  const month = document.getElementById('unavail-month').value
  if (!month) return
  setHtml('unavail-calendar', '<div class="empty"><span class="spinner"></span></div>')
  try {
    if (!crewList.length) crewList = await api('GET', '/api/crew')
    const unavail = await api('GET', '/api/unavailability?month=' + month)
    unavailData = {}
    unavail.forEach(u => {
      if (!unavailData[u.crew_id]) unavailData[u.crew_id] = new Set()
      unavailData[u.crew_id].add(u.unavailable_date)
    })
    renderCalendar(month)
  } catch(e) { setHtml('unavail-calendar', alertHtml('error', e.message)) }
}

function renderCalendar(month) {
  const [year, m] = month.split('-').map(Number)
  const daysInMonth = new Date(year, m, 0).getDate()
  const today = new Date().toISOString().slice(0,10)

  let html = '<div class="cal-grid">'
  // Header row
  html += '<div class="cal-header">Crew</div>'
  for (let d = 1; d <= 31; d++) {
    if (d <= daysInMonth) {
      const date = month + '-' + String(d).padStart(2,'0')
      const dow = new Date(date).toLocaleDateString('en',{weekday:'short'}).slice(0,1)
      html += '<div class="cal-header" title="' + date + '">' + d + '<br><span style="font-size:9px">' + dow + '</span></div>'
    } else {
      html += '<div></div>'
    }
  }

  crewList.forEach(cr => {
    html += '<div class="cal-name">' + esc(cr.name) + ' ' + levelBadge(cr.level) + '</div>'
    for (let d = 1; d <= 31; d++) {
      if (d <= daysInMonth) {
        const date = month + '-' + String(d).padStart(2,'0')
        const isUnavail = unavailData[cr.id]?.has(date)
        const isToday = date === today
        html += '<div class="cal-cell' + (isUnavail?' unavail':'') + (isToday?' today':'') + '" '
             + 'onclick="toggleUnavail(' + cr.id + ',\\'' + date + '\\')" '
             + 'title="' + esc(cr.name) + ' ' + date + '">'
             + (isUnavail ? '✗' : '') + '</div>'
      } else {
        html += '<div class="cal-cell empty"></div>'
      }
    }
  })
  html += '</div>'
  html += '<p class="text-muted text-sm" style="margin-top:10px">Click a cell to toggle unavailability. Red = unavailable.</p>'
  setHtml('unavail-calendar', html)
}

async function toggleUnavail(crewId, date) {
  const isUnavail = unavailData[crewId]?.has(date)
  try {
    if (isUnavail) {
      await api('DELETE', '/api/unavailability', { crew_id: crewId, unavailable_date: date })
      unavailData[crewId]?.delete(date)
    } else {
      await api('POST', '/api/unavailability', { crew_id: crewId, unavailable_date: date })
      if (!unavailData[crewId]) unavailData[crewId] = new Set()
      unavailData[crewId].add(date)
    }
    const month = document.getElementById('unavail-month').value
    renderCalendar(month)
  } catch(e) { alert(e.message) }
}

// ============================================================
// WORKLOAD
// ============================================================
async function loadWorkload() {
  const month = document.getElementById('workload-month').value
  if (!month) return
  setHtml('workload-content', '<div class="empty"><span class="spinner"></span></div>')
  try {
    const data = await api('GET', '/api/crew/workload?month=' + month)
    if (!data.length) { setHtml('workload-content', '<div class="empty">No data for this month</div>'); return }
    const max = Math.max(...data.map(d => d.assignments || 0), 1)
    let html = '<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Level</th><th>Assignments</th><th style="width:200px">Bar</th></tr></thead><tbody>'
    data.forEach(d => {
      const pct = Math.round((d.assignments / max) * 100)
      html += \`<tr>
        <td>\${esc(d.name)}</td>
        <td>\${levelBadge(d.level)}</td>
        <td style="text-align:center;font-weight:700">\${d.assignments}</td>
        <td>
          <div style="background:var(--bg);border-radius:4px;height:14px;overflow:hidden">
            <div style="background:var(--accent);height:100%;width:\${pct}%;transition:width .3s"></div>
          </div>
        </td>
      </tr>\`
    })
    html += '</tbody></table></div>'
    setHtml('workload-content', html)
  } catch(e) { setHtml('workload-content', alertHtml('error', e.message)) }
}

// ============================================================
// ADMIN
// ============================================================
async function loadAdminUsers() {
  try {
    const [pending, all] = await Promise.all([
      api('GET', '/api/admin/pending-users'),
      api('GET', '/api/admin/all-users')
    ])

    if (pending.success && pending.users.length) {
      const html = pending.users.map(u => \`
        <div class="row" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-weight:600">\${esc(u.email)}</div><div class="text-muted text-sm">\${u.created_at}</div></div>
          <div class="spacer"></div>
          <button class="btn-success btn-sm" onclick="approveUser(\${u.id})">Approve</button>
          <button class="btn-danger btn-sm" onclick="rejectUser(\${u.id})">Reject</button>
        </div>
      \`).join('')
      setHtml('pending-users-list', html)
    } else {
      setHtml('pending-users-list', '<div class="empty">No pending users</div>')
    }

    if (all.success && all.users.length) {
      const html = all.users.map(u => \`
        <div class="row" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:600">\${esc(u.email)}</div>
            <div class="text-muted text-sm">\${u.role} · \${u.status}</div>
          </div>
        </div>
      \`).join('')
      setHtml('all-users-list', html)
    } else {
      setHtml('all-users-list', '<div class="empty">No users</div>')
    }
  } catch(e) { console.error(e) }
}

async function approveUser(id) {
  await api('POST', '/api/admin/approve-user/' + id)
  loadAdminUsers()
}
async function rejectUser(id) {
  if (!confirm('Reject this user?')) return
  await api('POST', '/api/admin/reject-user/' + id)
  loadAdminUsers()
}

async function initAuth() {
  const res = await api('POST', '/api/auth/init')
  setHtml('init-status', alertHtml(res.success ? 'success' : 'error', res.message || res.error))
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
  document.getElementById('settings-email').value = currentUser.email
  document.getElementById('settings-role').value = currentUser.role
  document.getElementById('pw-current').value = ''
  document.getElementById('pw-new').value = ''
  document.getElementById('pw-confirm').value = ''
  hide('pw-alert')
}

async function changePassword() {
  const current = document.getElementById('pw-current').value
  const newPw = document.getElementById('pw-new').value
  const confirm = document.getElementById('pw-confirm').value
  const alertEl = document.getElementById('pw-alert')

  if (!current || !newPw || !confirm) {
    alertEl.innerHTML = alertHtml('error', 'All fields are required.')
    show('pw-alert'); return
  }
  if (newPw !== confirm) {
    alertEl.innerHTML = alertHtml('error', 'New passwords do not match.')
    show('pw-alert'); return
  }
  if (newPw.length < 8) {
    alertEl.innerHTML = alertHtml('error', 'New password must be at least 8 characters.')
    show('pw-alert'); return
  }

  try {
    const res = await api('POST', '/api/auth/change-password', { currentPassword: current, newPassword: newPw })
    if (res.success) {
      alertEl.innerHTML = alertHtml('success', 'Password changed successfully.')
      document.getElementById('pw-current').value = ''
      document.getElementById('pw-new').value = ''
      document.getElementById('pw-confirm').value = ''
    } else {
      alertEl.innerHTML = alertHtml('error', res.error || 'Failed to change password.')
    }
    show('pw-alert')
  } catch(e) {
    alertEl.innerHTML = alertHtml('error', 'Network error.')
    show('pw-alert')
  }
}

// ============================================================
// START
// ============================================================
init()
</script>
</body>
</html>`

app.get('/', (c) => c.html(HTML))
app.get('/*', (c) => c.html(HTML))

export default app
