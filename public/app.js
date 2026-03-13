// NCPA Sound Ops — Phase 1
// Events tab: calendar view, edit modal, CSV import, iCal export
// Settings: Anthropic API key management

'use strict'

// ═══════════════════ STATE ═══════════════════
const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-indexed
  events: [],           // current month events
  currentEventId: null  // open in edit modal
}

// ═══════════════════ DOM HELPERS ═══════════════════
const $ = id => document.getElementById(id)
const on = (id, evt, fn) => $(id).addEventListener(evt, fn)

// ═══════════════════ API ═══════════════════
async function api(method, path, body) {
  const opts = { method, credentials: 'include', headers: {} }
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const res = await fetch(path, opts)
  if (res.status === 401) { showLogin(); return null }
  return res.json().catch(() => null)
}

const GET  = path       => api('GET',    path)
const POST = (path, b)  => api('POST',   path, b)
const PUT  = (path, b)  => api('PUT',    path, b)
const DEL  = path       => api('DELETE', path)

// ═══════════════════ AUTH ═══════════════════
async function checkAuth() {
  try {
    const r = await fetch('/api/auth/check', { credentials: 'include' })
    return r.ok
  } catch { return false }
}

async function login(password) {
  const r = await fetch('/api/auth/login', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
  return r.json()
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

// ═══════════════════ NAVIGATION ═══════════════════
function switchTab(name) {
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name))
  document.querySelectorAll('.tab-panel').forEach(p => {
    const show = p.id === `tab-${name}`
    p.classList.toggle('active', show)
    p.classList.toggle('hidden', !show)
  })
  location.hash = name
}

// ═══════════════════ CALENDAR HELPERS ═══════════════════
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function padDate(n) { return String(n).padStart(2,'0') }

function monthStr(y, m) { return `${y}-${padDate(m + 1)}` }

function isComplete(ev) {
  return !!(ev.sound_requirements && ev.sound_requirements.trim() &&
            ev.call_time && ev.call_time.trim())
}

function venueCode(venue) {
  if (!venue) return '?'
  const v = venue.toLowerCase()
  if (v.includes('jamshed') || v.includes('jbt')) return 'JBT'
  if (v.includes('tata'))                          return 'TT'
  if (v.includes('experimental'))                  return 'Exp'
  if (v.includes('little'))                        return 'LT'
  if (v.includes('godrej'))                        return 'GDT'
  if (v.includes('library') || v.includes('lib'))  return 'Lib'
  return venue.substring(0, 3).toUpperCase()
}

function todayStr() { return new Date().toISOString().split('T')[0] }

// ═══════════════════ CALENDAR RENDER ═══════════════════
function renderCalendar() {
  const { year, month, events } = state
  $('month-label').textContent = `${MONTHS[month]} ${year}`

  const grid = $('calendar-grid')
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayRaw = new Date(year, month, 1).getDay()    // 0=Sun
  const startPad    = (firstDayRaw + 6) % 7               // Monday-first offset
  const today       = todayStr()

  // Group events by date
  const byDate = {}
  for (const e of events) {
    if (!byDate[e.event_date]) byDate[e.event_date] = []
    byDate[e.event_date].push(e)
  }

  let html = ''

  // Leading empty cells
  for (let i = 0; i < startPad; i++) html += '<div class="cal-cell cal-cell--empty"></div>'

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr   = `${year}-${padDate(month + 1)}-${padDate(d)}`
    const dayEvts   = byDate[dateStr] || []
    const isToday   = dateStr === today
    const dayOfWeek = new Date(year, month, d).getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    let evHtml = ''
    const visible = dayEvts.slice(0, 3)
    for (const e of visible) {
      const cls = isComplete(e) ? 'cal-event--complete' : 'cal-event--pending'
      const vc  = venueCode(e.venue)
      const name = (e.program || '').replace(/</g, '&lt;')
      evHtml += `<div class="cal-event ${cls}" data-id="${e.id}" title="${name}">`
               + `<span class="cal-event-venue">${vc}</span>`
               + `<span class="cal-event-name">${name}</span></div>`
    }
    if (dayEvts.length > 3) {
      evHtml += `<div class="cal-event-more">+${dayEvts.length - 3} more</div>`
    }

    const cellCls = ['cal-cell',
      isToday   ? 'cal-cell--today'   : '',
      isWeekend ? 'cal-cell--weekend' : ''
    ].filter(Boolean).join(' ')

    html += `<div class="${cellCls}" data-date="${dateStr}">`
          + `<div class="cal-cell-date">${d}</div>`
          + evHtml
          + '</div>'
  }

  grid.innerHTML = html

  // Attach click listeners to event items
  grid.querySelectorAll('.cal-event[data-id]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); openEventModal(el.dataset.id) })
  })

  // Also populate hidden table view (code-available, not shown in UI)
  populateTableView(events)
}

// Table view — hidden in UI, data available via code
function populateTableView(events) {
  const tbody = $('events-table-body')
  if (!tbody) return
  tbody.innerHTML = events.map(e => `<tr>
    <td>${e.event_date}</td><td>${e.program||''}</td><td>${e.venue||''}</td>
    <td>${e.team||''}</td><td>${e.sound_requirements||''}</td><td>${e.call_time||''}</td>
  </tr>`).join('')
}

// ═══════════════════ LOAD EVENTS ═══════════════════
async function loadMonth(year, month) {
  $('calendar-grid').innerHTML = '<div class="cal-loading">Loading…</div>'
  const data = await GET(`/api/events?month=${monthStr(year, month)}`)
  if (!data) return
  state.events = Array.isArray(data) ? data : []
  renderCalendar()
}

// ═══════════════════ EVENT EDIT MODAL ═══════════════════
function openEventModal(id) {
  const ev = state.events.find(e => String(e.id) === String(id))
  if (!ev) return
  state.currentEventId = id

  $('modal-program').textContent = ev.program || '—'
  $('modal-meta').textContent    = `${ev.event_date} · ${ev.venue || ''}${ev.team ? ' · ' + ev.team : ''}`
  $('edit-sound').value          = ev.sound_requirements || ''
  $('edit-calltime').value       = ev.call_time || ''
  $('modal-status').textContent  = ''
  $('modal-status').className    = 'save-status'

  $('event-modal').classList.remove('hidden')
  $('edit-sound').focus()
}

function closeEventModal() {
  $('event-modal').classList.add('hidden')
  state.currentEventId = null
}

async function saveEvent() {
  const id = state.currentEventId
  if (!id) return
  const sound = $('edit-sound').value.trim()
  const call  = $('edit-calltime').value.trim()
  const st    = $('modal-status')

  st.textContent = 'Saving…'
  st.className   = 'save-status'

  const result = await PUT(`/api/events/${id}`, {
    sound_requirements: sound,
    call_time: call
  })

  if (result?.success) {
    // Update local state
    const ev = state.events.find(e => String(e.id) === String(id))
    if (ev) { ev.sound_requirements = sound; ev.call_time = call }
    renderCalendar()
    st.textContent = '✓ Saved'
    st.className   = 'save-status save-status--ok'
    setTimeout(closeEventModal, 800)
  } else {
    st.textContent = result?.error || 'Save failed'
    st.className   = 'save-status save-status--err'
  }
}

// ═══════════════════ CSV IMPORT MODAL ═══════════════════
function openImportModal() {
  $('import-csv-input').value = ''
  $('import-result').className = 'import-result hidden'
  $('import-result').textContent = ''
  $('import-modal').classList.remove('hidden')
  $('import-csv-input').focus()
}
function closeImportModal() { $('import-modal').classList.add('hidden') }

async function runImport() {
  const csv = $('import-csv-input').value.trim()
  if (!csv) return

  const btn = $('import-run-btn')
  btn.disabled = true; btn.textContent = 'Importing…'

  const result = await POST('/api/events/import/csv', { csv })
  btn.disabled = false; btn.textContent = 'Import'

  const res = $('import-result')
  if (result?.success !== undefined) {
    const { imported, skipped, errors } = result
    let msg = `Imported: ${imported}`
    if (skipped > 0) msg += ` · Skipped: ${skipped}`
    if (errors > 0)  msg += ` · Errors: ${errors}`
    if (result.details?.errors?.length) msg += '\n' + result.details.errors.join('\n')
    res.textContent = msg
    res.className = errors > 0 ? 'import-result import-result--err' : 'import-result import-result--ok'
    if (imported > 0) loadMonth(state.year, state.month)  // refresh
  } else {
    res.textContent = result?.error || 'Import failed'
    res.className = 'import-result import-result--err'
  }
  res.classList.remove('hidden')
}

// ═══════════════════ EXPORT ═══════════════════
function exportCSV() {
  const m = monthStr(state.year, state.month)
  window.open(`/api/events/export/csv?month=${m}`, '_blank')
}
function exportICal() {
  const m = monthStr(state.year, state.month)
  window.open(`/api/events/export/ical?month=${m}`, '_blank')
}

// ═══════════════════ SETTINGS MODAL ═══════════════════
async function openSettingsModal() {
  $('settings-modal').classList.remove('hidden')
  $('ai-key-input').value = ''
  $('ai-key-msg').style.display = 'none'
  await refreshAIKeyStatus()
}
function closeSettingsModal() { $('settings-modal').classList.add('hidden') }

async function refreshAIKeyStatus() {
  const badge = $('ai-key-status-badge')
  badge.textContent = 'Checking…'
  badge.className   = 'key-status-badge'

  const data = await GET('/api/admin/settings/ai-key-status')
  if (!data) return

  if (data.configured) {
    badge.textContent = '✓ Configured'
    badge.className   = 'key-status-badge key-status-badge--ok'
    $('ai-key-clear-btn').style.display = 'inline-flex'
  } else {
    badge.textContent = 'Not set'
    badge.className   = 'key-status-badge key-status-badge--err'
    $('ai-key-clear-btn').style.display = 'none'
  }
}

async function saveAIKey() {
  const key = $('ai-key-input').value.trim()
  if (!key) return
  const msg = $('ai-key-msg')
  msg.style.display = 'block'
  msg.textContent = 'Saving…'
  msg.className = 'save-status'

  const result = await POST('/api/admin/settings/ai-key', { key })
  if (result?.success) {
    msg.textContent = '✓ API key saved'
    msg.className   = 'save-status save-status--ok'
    $('ai-key-input').value = ''
    await refreshAIKeyStatus()
  } else {
    msg.textContent = result?.error || 'Failed to save'
    msg.className   = 'save-status save-status--err'
  }
}

async function clearAIKey() {
  const result = await DEL('/api/admin/settings/ai-key')
  if (result?.success) await refreshAIKeyStatus()
}

// ═══════════════════ INIT ═══════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth()
  if (authed) {
    showApp()
    const hash = location.hash.replace('#', '')
    if (['events', 'crew', 'quotes'].includes(hash)) switchTab(hash)
    loadMonth(state.year, state.month)
  } else {
    showLogin()
  }

  // ── Login form ──
  on('login-form', 'submit', async e => {
    e.preventDefault()
    const pw  = $('password-input').value
    const btn = e.target.querySelector('button[type=submit]')
    btn.disabled = true; btn.textContent = 'Checking…'
    const r = await login(pw)
    if (r?.success) {
      showApp()
      loadMonth(state.year, state.month)
    } else {
      const err = $('login-error')
      err.textContent = r?.error || 'Invalid password'
      err.classList.remove('hidden')
      btn.disabled = false; btn.textContent = 'Enter'
      $('password-input').focus()
    }
  })

  // ── Nav ──
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.addEventListener('click', () => switchTab(t.dataset.tab)))
  on('logout-btn', 'click', logout)
  on('settings-btn', 'click', openSettingsModal)

  // ── Month navigation ──
  on('prev-month', 'click', () => {
    if (state.month === 0) { state.month = 11; state.year-- }
    else state.month--
    loadMonth(state.year, state.month)
  })
  on('next-month', 'click', () => {
    if (state.month === 11) { state.month = 0; state.year++ }
    else state.month++
    loadMonth(state.year, state.month)
  })

  // ── Export / Import ──
  on('export-csv-btn',  'click', exportCSV)
  on('export-ical-btn', 'click', exportICal)
  on('import-open-btn', 'click', openImportModal)
  on('import-run-btn',  'click', runImport)
  on('import-modal-close',   'click', closeImportModal)
  on('import-modal-backdrop','click', closeImportModal)

  // ── Event modal ──
  on('event-modal-close',    'click', closeEventModal)
  on('event-modal-backdrop', 'click', closeEventModal)
  on('modal-save-btn',       'click', saveEvent)
  on('edit-sound', 'keydown', e => { if (e.ctrlKey && e.key === 'Enter') saveEvent() })

  // ── Settings ──
  on('settings-modal-close',    'click', closeSettingsModal)
  on('settings-modal-backdrop', 'click', closeSettingsModal)
  on('ai-key-save-btn',  'click', saveAIKey)
  on('ai-key-clear-btn', 'click', clearAIKey)
  on('ai-key-input', 'keydown', e => { if (e.key === 'Enter') saveAIKey() })

  // ── Keyboard: Esc closes modals ──
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (!$('event-modal').classList.contains('hidden'))    closeEventModal()
    else if (!$('import-modal').classList.contains('hidden'))   closeImportModal()
    else if (!$('settings-modal').classList.contains('hidden')) closeSettingsModal()
  })
})
