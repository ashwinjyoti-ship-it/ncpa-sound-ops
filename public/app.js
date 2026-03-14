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
      const cls  = isComplete(e) ? 'cal-event--complete' : 'cal-event--pending'
      const vc   = venueCode(e.venue)
      const name = (e.program || '').replace(/</g, '&lt;')
      const crewDisplay = (e.crew || '').replace(/</g, '&lt;')
      evHtml += `<div class="cal-event ${cls}" data-id="${e.id}" title="${name}">`
              + `<div class="cal-event-program">${name}</div>`
              + `<div class="cal-event-meta"><i class="fas fa-map-marker-alt"></i>${vc}</div>`
              + (crewDisplay ? `<div class="cal-event-meta"><i class="fas fa-users"></i>${crewDisplay}</div>` : '')
              + `</div>`
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

// ═══════════════════ EVENT VIEW MODAL (read-only) ═══════════════════
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`
}

function viewRow(label, value, empty) {
  const val = value ? `<div class="event-view-value">${value}</div>`
                    : `<div class="event-view-value event-view-value--empty">${empty || 'Not specified'}</div>`
  return `<div class="event-view-row"><div class="event-view-label">${label}</div>${val}</div>`
}

function openEventModal(id) {
  const ev = state.events.find(e => String(e.id) === String(id))
  if (!ev) return
  state.currentEventId = id

  let html = viewRow('Date', fmtDate(ev.event_date))
           + viewRow('Program / Event', ev.program)
           + viewRow('Venue', ev.venue)
           + viewRow('Team (curator)', ev.team)
           + viewRow('Sound Requirements', ev.sound_requirements ? ev.sound_requirements.replace(/\n/g,'<br>') : '')
           + viewRow('Call Time', ev.call_time)
           + viewRow('Crew (sound team)', ev.crew)
  if (ev.rider)  html += viewRow('Rider', ev.rider.replace(/\n/g,'<br>'))
  if (ev.notes)  html += viewRow('Notes', ev.notes.replace(/\n/g,'<br>'))

  $('event-view-body').innerHTML = html
  $('event-modal').classList.remove('hidden')

  // Fetch assigned crew and append
  GET(`/api/events/${id}/assignments`).then(crew => {
    if (!Array.isArray(crew) || !crew.length) return
    const foh   = crew.filter(c => c.role === 'FOH').map(c => c.name).join(', ')
    const stage = crew.filter(c => c.role === 'Stage').map(c => c.name).join(', ')
    let crewHtml = ''
    if (foh)   crewHtml += `<span class="crew-badge crew-badge--foh">FOH: ${foh}</span> `
    if (stage) crewHtml += `<span class="crew-badge">Stage: ${stage}</span>`
    if (crewHtml) {
      $('event-view-body').innerHTML += viewRow('Assigned Crew', crewHtml)
    }
  }).catch(() => {})
}

function closeEventModal() {
  $('event-modal').classList.add('hidden')
  state.currentEventId = null
}

// ═══════════════════ EVENT EDIT MODAL ═══════════════════
function openEditModal(id) {
  const ev = state.events.find(e => String(e.id) === String(id || state.currentEventId))
  if (!ev) return
  state.currentEventId = String(ev.id)

  $('edit-program').value  = ev.program || ''
  $('edit-date').value     = ev.event_date || ''
  $('edit-venue').value    = ev.venue || ''
  // team is a select — try to match option value
  const sel = $('edit-team')
  sel.value = ev.team || ''
  if (!sel.value) sel.value = ''
  $('edit-sound').value    = ev.sound_requirements || ''
  $('edit-calltime').value = ev.call_time || ''
  $('edit-rider').value    = ev.rider || ''
  $('edit-notes').value    = ev.notes || ''
  $('modal-status').textContent = ''
  $('modal-status').className   = 'save-status'

  // Populate crew checkboxes from comma-separated crew field
  const crewNames = (ev.crew || '').split(',').map(s => s.trim()).filter(Boolean)
  const knownCrew = new Set(crewNames)
  document.querySelectorAll('.crew-cb').forEach(cb => {
    cb.checked = knownCrew.has(cb.value)
    knownCrew.delete(cb.value)
  })
  // Any crew not in the checkbox list go to custom field
  $('edit-crew-custom').value = [...knownCrew].join(', ')

  $('event-modal').classList.add('hidden') // close view modal
  $('edit-modal').classList.remove('hidden')
  $('edit-program').focus()
}

function closeEditModal() {
  $('edit-modal').classList.add('hidden')
}

async function saveEvent() {
  const id = state.currentEventId
  if (!id) return
  const program = $('edit-program').value.trim()
  const date    = $('edit-date').value.trim()
  const venue   = $('edit-venue').value.trim()
  const team    = $('edit-team').value
  const sound   = $('edit-sound').value.trim()
  const call    = $('edit-calltime').value.trim()
  const rider   = $('edit-rider').value.trim() || null
  const notes   = $('edit-notes').value.trim() || null
  const st      = $('modal-status')

  // Collect crew from checkboxes + custom input
  const checkedCrew = [...document.querySelectorAll('.crew-cb:checked')].map(cb => cb.value)
  const customCrew  = $('edit-crew-custom').value.split(',').map(s => s.trim()).filter(Boolean)
  const crew = [...new Set([...checkedCrew, ...customCrew])].join(', ')

  st.textContent = 'Saving…'
  st.className   = 'save-status'

  const result = await PUT(`/api/events/${id}`, {
    program, event_date: date, venue, team,
    sound_requirements: sound, call_time: call, rider, notes, crew
  })

  if (result?.success) {
    const ev = state.events.find(e => String(e.id) === String(id))
    if (ev) { ev.program = program; ev.event_date = date; ev.venue = venue; ev.team = team; ev.sound_requirements = sound; ev.call_time = call; ev.rider = rider; ev.notes = notes; ev.crew = crew }
    renderCalendar()
    st.textContent = '✓ Saved'
    st.className   = 'save-status save-status--ok'
    setTimeout(closeEditModal, 800)
  } else {
    st.textContent = result?.error || 'Save failed'
    st.className   = 'save-status save-status--err'
  }
}

async function deleteEvent() {
  const id = state.currentEventId
  if (!id) return
  if (!confirm('Delete this event? This cannot be undone.')) return
  const result = await DEL(`/api/events/${id}`)
  if (result?.success !== false) {
    state.events = state.events.filter(e => String(e.id) !== String(id))
    renderCalendar()
    closeEventModal()
    closeEditModal()
  }
}

// ═══════════════════ CSV IMPORT MODAL ═══════════════════
function openImportModal() {
  $('import-csv-input').value = ''
  $('import-file-input').value = ''
  $('import-file-name').textContent = 'No file chosen'
  $('import-result').className = 'import-result hidden'
  $('import-result').textContent = ''
  $('import-modal').classList.remove('hidden')
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

async function runDeduplicate() {
  const btn = $('dedup-run-btn')
  const res  = $('import-result')
  btn.disabled = true; btn.textContent = 'Working…'
  res.className = 'import-result hidden'

  const result = await POST('/api/events/deduplicate', {})
  btn.disabled = false; btn.textContent = 'Remove Duplicates'

  if (result?.success) {
    res.textContent = result.deleted > 0
      ? `✓ Removed ${result.deleted} duplicate rows (${result.groups} groups)`
      : '✓ No duplicates found'
    res.className = 'import-result import-result--ok'
    if (result.deleted > 0) loadMonth(state.year, state.month)
  } else {
    res.textContent = result?.error || 'Deduplication failed'
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
  on('dedup-run-btn',   'click', runDeduplicate)
  on('import-modal-close',   'click', closeImportModal)
  on('import-modal-backdrop','click', closeImportModal)

  // ── File pickers ──
  on('import-file-btn', 'click', () => $('import-file-input').click())
  $('import-file-input').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return
    $('import-file-name').textContent = file.name
    const r = new FileReader(); r.onload = ev => { $('import-csv-input').value = ev.target.result }; r.readAsText(file)
  })
  on('upload-file-btn', 'click', () => $('upload-file-input').click())
  $('upload-file-input').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return
    $('upload-file-name').textContent = file.name
    const r = new FileReader(); r.onload = ev => { $('upload-csv-input').value = ev.target.result }; r.readAsText(file)
  })

  // ── Event view modal ──
  on('event-modal-close',    'click', closeEventModal)
  on('event-modal-backdrop', 'click', closeEventModal)
  on('modal-delete-btn',     'click', deleteEvent)
  on('modal-edit-btn',       'click', () => openEditModal())

  // ── Event edit modal ──
  on('edit-modal-close',     'click', closeEditModal)
  on('edit-modal-backdrop',  'click', closeEditModal)
  on('edit-modal-cancel',    'click', closeEditModal)
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
    if (!$('edit-modal').classList.contains('hidden'))         closeEditModal()
    else if (!$('event-modal').classList.contains('hidden'))   closeEventModal()
    else if (!$('import-modal').classList.contains('hidden'))  closeImportModal()
    else if (!$('settings-modal').classList.contains('hidden')) closeSettingsModal()
  })
})

// ═══════════════════════════════════════════════
// PHASE 2 — Crew Assignment Tab
// ═══════════════════════════════════════════════

const crew2 = {
  allCrew: [],
  batches: [],
  selectedBatchId: null,
  batchEvents: [],
  assignments: [],  // grouped by event_id
  overrideEventId: null,
  availYear: new Date().getFullYear(),
  availMonth: new Date().getMonth(),
  unavailability: [],
  wlYear: new Date().getFullYear(),
  wlMonth: new Date().getMonth()
}

// ── Sub-nav switching ──
function switchCrewSub(name) {
  document.querySelectorAll('.crew-sub-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.sub === name))
  document.querySelectorAll('.crew-sub-panel').forEach(p => {
    const show = p.id === `crew-${name}`
    p.classList.toggle('active', show)
  })
  if (name === 'availability' && !crew2.unavailability.length) {
    loadAvailability(crew2.availYear, crew2.availMonth)
  }
  if (name === 'workload') {
    loadWorkload(crew2.wlYear, crew2.wlMonth)
  }
}

// ── Load crew roster ──
async function loadCrewRoster() {
  const data = await GET('/api/crew')
  if (data) crew2.allCrew = data
}

// ════════════════ ASSIGNMENTS ════════════════

async function loadBatches() {
  const data = await GET('/api/crew/events')
  if (!data) return
  crew2.batches = data
  renderBatchList()
}

function renderBatchList() {
  const el = $('batch-list')
  if (!crew2.batches.length) {
    el.innerHTML = '<div class="batch-empty">No batches yet.<br>Upload events to start.</div>'
    return
  }
  el.innerHTML = crew2.batches.map(b => {
    const label = b.first_date ? b.first_date.substring(0,7) : b.batch_id
    const active = b.batch_id === crew2.selectedBatchId ? ' active' : ''
    return `<div class="batch-item${active}" data-batch="${b.batch_id}">
      <div class="batch-item-month">${fmtMonthLabel(label)}</div>
      <div class="batch-item-count">${b.event_count} events</div>
    </div>`
  }).join('')
  el.querySelectorAll('.batch-item').forEach(el =>
    el.addEventListener('click', () => selectBatch(el.dataset.batch)))
}

function fmtMonthLabel(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m)-1]} ${y}`
}

async function selectBatch(batchId) {
  crew2.selectedBatchId = batchId
  renderBatchList()
  $('assignment-empty').classList.add('hidden')
  $('assignment-content').classList.remove('hidden')
  await loadBatchAssignments(batchId)
}

async function loadBatchAssignments(batchId) {
  $('assignment-tbody').innerHTML = '<tr><td colspan="7" class="loading-cell">Loading…</td></tr>'
  $('assignment-conflicts').classList.add('hidden')

  const [eventsData, assignData] = await Promise.all([
    GET(`/api/crew/events?batch_id=${batchId}`),
    GET(`/api/assignments?batch_id=${batchId}`)
  ])

  crew2.batchEvents = eventsData || []
  // Group assignments by event_id
  const grouped = {}
  for (const row of (assignData || [])) {
    if (!grouped[row.event_id]) {
      grouped[row.event_id] = {
        event_id: row.event_id, event_name: row.event_name,
        event_date: row.event_date, venue: row.venue, venue_normalized: row.venue_normalized,
        vertical: row.vertical, needs_manual_review: row.needs_manual_review,
        manual_flag_reason: row.manual_flag_reason,
        foh: null, stage: [], has_override: false
      }
    }
    const g = grouped[row.event_id]
    if (row.role === 'FOH') g.foh = { id: row.crew_id, name: row.crew_name, level: row.crew_level, manual: !!row.was_manually_overridden }
    else g.stage.push({ id: row.crew_id, name: row.crew_name, level: row.crew_level, manual: !!row.was_manually_overridden })
    if (row.was_manually_overridden) g.has_override = true
  }
  crew2.assignments = grouped

  const batch = crew2.batches.find(b => b.batch_id === batchId)
  const label = batch?.first_date ? fmtMonthLabel(batch.first_date.substring(0,7)) : batchId
  $('batch-info').innerHTML = `<strong>${label}</strong> &nbsp;·&nbsp; ${crew2.batchEvents.length} events`

  renderAssignmentTable()
}

function renderAssignmentTable() {
  const tbody = $('assignment-tbody')
  if (!crew2.batchEvents.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No events in this batch</td></tr>'
    return
  }

  const conflicts = []
  let html = ''

  for (const ev of crew2.batchEvents) {
    const asgn = crew2.assignments[ev.id]
    const isManual = !!ev.needs_manual_review
    const hasFOH   = asgn?.foh
    const fohConflict = !hasFOH && !isManual
    const hasOverride = asgn?.has_override

    let rowCls = 'assignment-row--clean'
    if (isManual) rowCls = 'assignment-row--manual'
    else if (fohConflict) rowCls = 'assignment-row--conflict'
    else if (hasOverride) rowCls = 'assignment-row--override'

    // FOH cell
    let fohHtml = ''
    if (isManual) {
      fohHtml = `<span class="crew-badge crew-badge--manual crew-badge--foh">Manual</span>`
      conflicts.push(`${ev.event_date} ${ev.program}: ${ev.manual_flag_reason || 'Manual review required'}`)
    } else if (hasFOH) {
      fohHtml = `<span class="crew-badge crew-badge--foh${asgn.foh.manual ? ' crew-badge--manual' : ''}"
                        data-event="${ev.id}">
        <span class="level-dot level-dot--${asgn.foh.level?.toLowerCase()}"></span>
        ${asgn.foh.name}</span>`
    } else {
      fohHtml = `<span class="crew-badge crew-badge--empty" data-event="${ev.id}">⚠ Unassigned</span>`
      conflicts.push(`${ev.event_date} ${ev.program}: No FOH assigned`)
    }

    // Stage cell
    let stageHtml = '<div class="stage-badges">'
    if (asgn?.stage?.length) {
      for (const s of asgn.stage) {
        stageHtml += `<span class="crew-badge crew-badge--stage${s.manual ? ' crew-badge--manual' : ''}"
                            data-event="${ev.id}">
          <span class="level-dot level-dot--${s.level?.toLowerCase()}"></span>${s.name}</span>`
      }
    } else if (!isManual) {
      stageHtml += `<span style="font-size:11px;color:var(--txt-3)">—</span>`
    }
    stageHtml += '</div>'

    const flagHtml = isManual ? `<span class="flag-icon" title="${ev.manual_flag_reason || ''}">⚠</span>` : ''

    html += `<tr class="${rowCls}" data-event="${ev.id}">
      <td style="font-family:monospace;font-size:12px">${ev.event_date}</td>
      <td>${(ev.program||'').replace(/</g,'&lt;')}</td>
      <td style="font-size:12px">${venueCode(ev.venue||'')}</td>
      <td style="font-size:11px;color:var(--txt-3)">${ev.vertical||'—'}</td>
      <td>${fohHtml}</td>
      <td>${stageHtml}</td>
      <td class="col-flag">${flagHtml}</td>
    </tr>`
  }

  tbody.innerHTML = html

  // Show conflicts banner
  const banner = $('assignment-conflicts')
  if (conflicts.length) {
    banner.innerHTML = `<div><strong>⚠ ${conflicts.length} issue${conflicts.length>1?'s':''}</strong>
      <ul>${conflicts.map(c=>`<li>${c}</li>`).join('')}</ul></div>`
    banner.classList.remove('hidden')
  } else {
    banner.classList.add('hidden')
  }

  // Crew badge click → override
  tbody.querySelectorAll('[data-event]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation()
      openOverrideModal(el.dataset.event)
    })
  })
}

// ── Run engine ──
async function runEngine() {
  if (!crew2.selectedBatchId) return
  const btn = $('run-engine-btn')
  btn.disabled = true; btn.textContent = 'Running…'
  const result = await POST('/api/assignments/run', { batch_id: crew2.selectedBatchId })
  btn.disabled = false; btn.textContent = '▶ Run Engine'
  if (result) await loadBatchAssignments(crew2.selectedBatchId)
}

// ── Override modal ──
function openOverrideModal(eventId) {
  const ev = crew2.batchEvents.find(e => String(e.id) === String(eventId))
  if (!ev) return
  crew2.overrideEventId = eventId

  $('override-event-name').textContent = ev.program || '—'
  $('override-event-meta').textContent = `${ev.event_date} · ${ev.venue||''} · ${ev.vertical||''}`

  // FOH select
  const fohSel = $('override-foh-select')
  const curFOH = crew2.assignments[eventId]?.foh?.id || ''
  fohSel.innerHTML = '<option value="">— Unassigned —</option>' +
    crew2.allCrew
      .filter(c => c.level !== 'Hired')
      .map(c => `<option value="${c.id}" ${c.id==curFOH?'selected':''}>${c.name} (${c.level})</option>`)
      .join('')

  // Stage checklist
  const curStage = (crew2.assignments[eventId]?.stage || []).map(s => s.id)
  const stageList = $('override-stage-list')
  stageList.innerHTML = crew2.allCrew
    .filter(c => c.can_stage)
    .map(c => `<label class="stage-check-row">
      <input type="checkbox" value="${c.id}" ${curStage.includes(c.id)?'checked':''}>
      <span>${c.name}</span>
      <span class="crew-level-tag">${c.level}</span>
    </label>`).join('')

  $('override-status').textContent = ''
  $('override-status').className = 'save-status'
  $('override-modal').classList.remove('hidden')
}

function closeOverrideModal() { $('override-modal').classList.add('hidden') }

async function saveOverride() {
  const eventId = crew2.overrideEventId
  if (!eventId) return
  const fohId   = parseInt($('override-foh-select').value) || null
  const stageIds = Array.from($('override-stage-list').querySelectorAll('input:checked'))
                        .map(el => parseInt(el.value))

  const st = $('override-status')
  st.textContent = 'Saving…'; st.className = 'save-status'

  const result = await PUT(`/api/assignments/${eventId}`, { foh_id: fohId, stage_ids: stageIds })
  if (result?.success) {
    st.textContent = '✓ Saved'; st.className = 'save-status save-status--ok'
    await loadBatchAssignments(crew2.selectedBatchId)
    setTimeout(closeOverrideModal, 700)
  } else {
    st.textContent = 'Save failed'; st.className = 'save-status save-status--err'
  }
}

// ── Upload batch ──
function openUploadModal() {
  $('upload-csv-input').value = ''
  $('upload-file-input').value = ''
  $('upload-file-name').textContent = 'No file chosen'
  $('upload-result').classList.add('hidden')
  $('upload-modal').classList.remove('hidden')
}
function closeUploadModal() { $('upload-modal').classList.add('hidden') }

async function runBatchUpload() {
  const csv = $('upload-csv-input').value.trim()
  if (!csv) return
  const btn = $('upload-run-btn')
  btn.disabled = true; btn.textContent = 'Uploading…'

  // Parse CSV client-side
  const lines = csv.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.toLowerCase().trim().replace(/\s+/g,'_'))
  const events = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim() })
    let dateStr = row['date'] || row['event_date'] || ''
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(dateStr)) {
      const sep = dateStr.includes('/') ? '/' : '-'
      const [dd, mm, yyyy] = dateStr.split(sep)
      dateStr = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
    }
    if (!dateStr || !row['program']) continue
    events.push({
      event_date: dateStr,
      program: row['program'] || row['event'] || '',
      venue: row['venue'] || '',
      team: row['team'] || '',
      sound_requirements: row['sound_requirements'] || '',
      call_time: row['call_time'] || row['call time'] || ''
    })
  }

  const res = $('upload-result')
  if (!events.length) {
    res.textContent = 'No valid events found in CSV'
    res.className = 'import-result import-result--err'
    res.classList.remove('hidden')
    btn.disabled = false; btn.textContent = 'Upload Batch'
    return
  }

  const result = await POST('/api/crew/events/upload', { events })
  btn.disabled = false; btn.textContent = 'Upload Batch'

  if (result?.batch_id) {
    res.textContent = `✓ Uploaded ${result.events.length} events (batch: ${result.batch_id.substring(0,20)}…)`
    res.className = 'import-result import-result--ok'
    res.classList.remove('hidden')
    await loadBatches()
    setTimeout(() => { closeUploadModal(); selectBatch(result.batch_id) }, 1200)
  } else {
    res.textContent = result?.error || 'Upload failed'
    res.className = 'import-result import-result--err'
    res.classList.remove('hidden')
  }
}

// Reuse parseCSVLine from events tab (defined in original app.js)
function parseCSVLine(line) {
  const result = [], char = (i) => line[i]
  let current = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    if (char(i) === '"') { if (inQ && char(i+1) === '"') { current += '"'; i++ } else inQ = !inQ }
    else if (char(i) === ',' && !inQ) { result.push(current.trim()); current = '' }
    else current += char(i)
  }
  result.push(current.trim())
  return result
}

// ════════════════ AVAILABILITY ════════════════

async function loadAvailability(year, month) {
  if (!crew2.allCrew.length) await loadCrewRoster()
  $('avail-month-label').textContent = `${MONTHS[month]} ${year}`
  const monthStr = `${year}-${padDate(month+1)}`
  $('avail-grid').innerHTML = '<div class="avail-loading">Loading…</div>'
  const data = await GET(`/api/unavailability?month=${monthStr}`)
  crew2.unavailability = data || []
  renderAvailabilityGrid(year, month)
}

function renderAvailabilityGrid(year, month) {
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const today = todayStr()
  const monthStr = `${year}-${padDate(month+1)}`

  // Build lookup: "crewId:date" → true
  const offSet = new Set(crew2.unavailability.map(u => `${u.crew_id}:${u.unavailable_date}`))

  let html = ''

  // Day number header row
  html += '<div class="avail-header-row"><div class="avail-crew-cell"></div>'
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthStr}-${padDate(d)}`
    const dow = new Date(year, month, d).getDay()
    const isWe = dow === 0 || dow === 6
    html += `<div class="avail-day-header${isWe?' weekend':''}">${d}</div>`
  }
  html += '</div>'

  // Crew rows
  for (const cr of crew2.allCrew) {
    html += `<div class="avail-data-row">
      <div class="avail-crew-cell" title="${cr.name}">${cr.name}<span class="avail-crew-level">${cr.level[0]}</span></div>`
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthStr}-${padDate(d)}`
      const isOff = offSet.has(`${cr.id}:${dateStr}`)
      const isToday = dateStr === today
      html += `<div class="avail-cell${isOff?' off':''}${isToday?' today':''}"
                    data-crew="${cr.id}" data-date="${dateStr}"></div>`
    }
    html += '</div>'
  }

  const grid = $('avail-grid')
  grid.innerHTML = html

  // Toggle on click
  grid.querySelectorAll('.avail-cell').forEach(cell => {
    cell.addEventListener('click', () => toggleAvailability(cell))
  })
}

async function toggleAvailability(cell) {
  const crewId = parseInt(cell.dataset.crew)
  const date = cell.dataset.date
  const key = `${crewId}:${date}`
  const isOff = cell.classList.contains('off')

  // Optimistic UI
  cell.classList.toggle('off', !isOff)

  if (isOff) {
    // Remove unavailability
    crew2.unavailability = crew2.unavailability.filter(
      u => !(u.crew_id === crewId && u.unavailable_date === date))
    await DEL_BODY('/api/unavailability', { crew_id: crewId, unavailable_date: date })
  } else {
    // Add unavailability
    crew2.unavailability.push({ crew_id: crewId, unavailable_date: date })
    await POST('/api/unavailability', { crew_id: crewId, unavailable_date: date })
  }
}

// DELETE with body (not standard, so use POST-style DELETE via fetch)
async function DEL_BODY(path, body) {
  await fetch(path, {
    method: 'DELETE', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

// ════════════════ WORKLOAD ════════════════

async function loadWorkload(year, month) {
  $('wl-month-label').textContent = `${MONTHS[month]} ${year}`
  const monthStr = `${year}-${padDate(month+1)}`
  $('workload-tbody').innerHTML = '<tr><td colspan="3" class="loading-cell">Loading…</td></tr>'
  const data = await GET(`/api/crew/workload?month=${monthStr}`)
  if (!data) return
  const max = Math.max(...data.map(d => d.assignments), 1)
  $('workload-tbody').innerHTML = data.map(d => `
    <tr>
      <td>${d.name}</td>
      <td><span class="level-pill level-pill--${d.level}">${d.level}</span></td>
      <td>
        <div class="wl-count-bar">
          <span style="font-size:13px;font-weight:600;width:24px;text-align:right">${d.assignments}</span>
          <div class="wl-bar-bg"><div class="wl-bar" style="width:${Math.round(d.assignments/max*100)}%"></div></div>
        </div>
      </td>
    </tr>`).join('')
}

// ════════════════ INIT — Phase 2 ════════════════

// Called when Crew tab becomes active
async function initCrewTab() {
  if (!crew2.allCrew.length) await loadCrewRoster()
  await loadBatches()
}

// Patch the tab switch to init crew tab on first visit
const _origSwitchTab = switchTab
window._crewInited = false
// Override switchTab to lazy-init crew tab
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-tab').forEach(t => {
    // Re-add listener that also inits crew tab
    t.addEventListener('click', async () => {
      if (t.dataset.tab === 'crew' && !window._crewInited) {
        window._crewInited = true
        await initCrewTab()
      }
      if (t.dataset.tab === 'quotes' && !window._quotesInited) {
        window._quotesInited = true
        initQuotes()
      }
    })
  })

  // Crew sub-nav
  document.querySelectorAll('.crew-sub-tab').forEach(t =>
    t.addEventListener('click', () => switchCrewSub(t.dataset.sub)))

  // Batch actions
  on('new-batch-btn',    'click', openUploadModal)
  on('run-engine-btn',   'click', runEngine)
  on('export-crew-csv-btn', 'click', () => {
    if (crew2.selectedBatchId) window.open(`/api/assignments/export/csv?batch_id=${crew2.selectedBatchId}`, '_blank')
  })

  // Upload modal
  on('upload-modal-backdrop', 'click', closeUploadModal)
  on('upload-modal-close',    'click', closeUploadModal)
  on('upload-run-btn',        'click', runBatchUpload)

  // Override modal
  on('override-modal-backdrop', 'click', closeOverrideModal)
  on('override-modal-close',    'click', closeOverrideModal)
  on('override-save-btn',       'click', saveOverride)

  // Availability nav
  on('avail-prev-month', 'click', () => {
    if (crew2.availMonth === 0) { crew2.availMonth = 11; crew2.availYear-- }
    else crew2.availMonth--
    loadAvailability(crew2.availYear, crew2.availMonth)
  })
  on('avail-next-month', 'click', () => {
    if (crew2.availMonth === 11) { crew2.availMonth = 0; crew2.availYear++ }
    else crew2.availMonth++
    loadAvailability(crew2.availYear, crew2.availMonth)
  })

  // Workload nav
  on('wl-prev-month', 'click', () => {
    if (crew2.wlMonth === 0) { crew2.wlMonth = 11; crew2.wlYear-- }
    else crew2.wlMonth--
    loadWorkload(crew2.wlYear, crew2.wlMonth)
  })
  on('wl-next-month', 'click', () => {
    if (crew2.wlMonth === 11) { crew2.wlMonth = 0; crew2.wlYear++ }
    else crew2.wlMonth++
    loadWorkload(crew2.wlYear, crew2.wlMonth)
  })
})

// ═══════════════════════════════════════════════════════════════
// Phase 3 — Quote Builder
// Equipment catalog (CRUD) + live quote builder (export only)
// ═══════════════════════════════════════════════════════════════

const q3 = {
  catalog: [],      // [{id,name,category,rate_per_item}]
  lines: [],        // [{id,name,category,rate,qty,days}]
  editingEqId: null // null = new, number = editing
}

// ── Format rupees ──
const rupees = n => '₹' + Math.round(n).toLocaleString('en-IN')

// ── Load catalog from API ──
async function loadCatalog() {
  const tbody = $('catalog-tbody')
  tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">Loading…</td></tr>'
  const data = await GET('/api/equipment')
  if (!data) return
  q3.catalog = data
  renderCatalog()
  buildCategoryFilter()
}

// ── Build category dropdown ──
function buildCategoryFilter() {
  const sel = $('eq-category-filter')
  const existing = new Set([...sel.options].map(o => o.value).filter(Boolean))
  const cats = [...new Set(q3.catalog.map(e => e.category).filter(Boolean))].sort()
  cats.forEach(cat => {
    if (!existing.has(cat)) {
      const o = document.createElement('option')
      o.value = cat; o.textContent = cat; sel.appendChild(o)
    }
  })
}

// ── Render catalog table with current filter/search ──
function renderCatalog() {
  const search = ($('eq-search').value || '').toLowerCase()
  const catF   = $('eq-category-filter').value
  const list = q3.catalog.filter(e => {
    if (catF && e.category !== catF) return false
    if (search && !e.name.toLowerCase().includes(search) && !(e.category||'').toLowerCase().includes(search)) return false
    return true
  })
  const tbody = $('catalog-tbody')
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No items found</td></tr>'
    return
  }
  tbody.innerHTML = list.map(e => `
    <tr data-eq-id="${e.id}">
      <td>${escHtml(e.name)}</td>
      <td><span class="cat-pill">${escHtml(e.category || 'General')}</span></td>
      <td class="col-rate">${rupees(e.rate_per_item)}</td>
      <td class="col-actions">
        <div class="btn-row">
          <button class="btn btn-ghost btn-xs" onclick="addToQuote(${e.id})">+ Quote</button>
          <button class="btn btn-ghost btn-xs" onclick="openEqModal(${e.id})">Edit</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="deleteEquipment(${e.id})">Del</button>
        </div>
      </td>
    </tr>`).join('')
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Open add/edit modal ──
function openEqModal(id = null) {
  q3.editingEqId = id
  $('eq-modal-title').textContent = id ? 'Edit Equipment' : 'Add Equipment'
  $('eq-modal-status').textContent = ''
  if (id) {
    const item = q3.catalog.find(e => e.id === id)
    if (!item) return
    $('eq-name-input').value     = item.name
    $('eq-category-input').value = item.category || ''
    $('eq-rate-input').value     = item.rate_per_item
  } else {
    $('eq-name-input').value     = ''
    $('eq-category-input').value = ''
    $('eq-rate-input').value     = ''
  }
  $('eq-modal').classList.remove('hidden')
  setTimeout(() => $('eq-name-input').focus(), 50)
}

function closeEqModal() { $('eq-modal').classList.add('hidden') }

// ── Save equipment (POST or PUT) ──
async function saveEquipment() {
  const name     = $('eq-name-input').value.trim()
  const category = $('eq-category-input').value.trim() || 'General'
  const rate     = parseFloat($('eq-rate-input').value)
  if (!name || isNaN(rate)) {
    $('eq-modal-status').textContent = 'Name and rate are required.'
    return
  }
  $('eq-modal-status').textContent = 'Saving…'
  const body = { name, category, rate_per_item: rate }
  const res = q3.editingEqId
    ? await PUT(`/api/equipment/${q3.editingEqId}`, body)
    : await POST('/api/equipment', body)
  if (res && res.success !== false && !res.error) {
    closeEqModal()
    await loadCatalog()
  } else {
    $('eq-modal-status').textContent = res?.error || 'Error saving.'
  }
}

// ── Delete equipment ──
async function deleteEquipment(id) {
  const item = q3.catalog.find(e => e.id === id)
  if (!item) return
  if (!confirm(`Delete "${item.name}"?`)) return
  await DEL(`/api/equipment/${id}`)
  await loadCatalog()
}

// ── Add item to quote ──
function addToQuote(id) {
  const item = q3.catalog.find(e => e.id === id)
  if (!item) return
  const existing = q3.lines.find(l => l.id === id)
  if (existing) { existing.qty++; }
  else {
    q3.lines.push({ id: item.id, name: item.name, category: item.category, rate: item.rate_per_item, qty: 1, days: 1 })
  }
  renderQuoteLines()
}

// ── Render quote lines ──
function renderQuoteLines() {
  const tbody = $('quote-lines-tbody')
  const empty = $('quote-empty')
  const table = $('quote-lines-table')
  if (!q3.lines.length) {
    empty.style.display = ''; table.style.display = 'none'
    recalcTotals(); return
  }
  empty.style.display = 'none'; table.style.display = ''
  tbody.innerHTML = q3.lines.map((l, i) => {
    const amt = l.rate * l.qty * l.days
    return `<tr>
      <td>${escHtml(l.name)}</td>
      <td class="col-days"><input class="ql-num" type="number" min="1" value="${l.days}" onchange="updateLine(${i},'days',this.value)"></td>
      <td class="col-qty"><input class="ql-num" type="number" min="1" value="${l.qty}" onchange="updateLine(${i},'qty',this.value)"></td>
      <td class="col-rate">${rupees(l.rate)}</td>
      <td class="col-amount">${rupees(amt)}</td>
      <td class="col-del"><button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="removeLine(${i})">&#10005;</button></td>
    </tr>`
  }).join('')
  recalcTotals()
}

function updateLine(i, field, val) {
  const n = Math.max(1, parseInt(val) || 1)
  q3.lines[i][field] = n
  renderQuoteLines()
}

function removeLine(i) {
  q3.lines.splice(i, 1)
  renderQuoteLines()
}

// ── Recalculate totals ──
function recalcTotals() {
  const subtotal = q3.lines.reduce((s, l) => s + l.rate * l.qty * l.days, 0)
  const gst      = $('gst-toggle').checked ? subtotal * 0.18 : 0
  const total    = subtotal + gst
  $('qt-subtotal').textContent = rupees(subtotal)
  $('qt-gst').textContent      = rupees(gst)
  $('qt-total').textContent    = rupees(total)
}

// ── Export / Print ──
function exportQuote() {
  if (!q3.lines.length) { alert('Add items to the quote first.'); return }
  const client   = $('quote-client').value.trim() || 'NCPA Quote'
  const gstOn    = $('gst-toggle').checked
  const subtotal = q3.lines.reduce((s, l) => s + l.rate * l.qty * l.days, 0)
  const gst      = gstOn ? subtotal * 0.18 : 0
  const total    = subtotal + gst
  const date     = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })

  const rows = q3.lines.map(l => `
    <tr>
      <td>${escHtml(l.name)}</td>
      <td>${escHtml(l.category||'')}</td>
      <td style="text-align:center">${l.days}</td>
      <td style="text-align:center">${l.qty}</td>
      <td style="text-align:right">₹${l.rate.toLocaleString('en-IN')}</td>
      <td style="text-align:right; font-weight:600">₹${Math.round(l.rate*l.qty*l.days).toLocaleString('en-IN')}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(client)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; color: #222; padding: 40px; max-width: 900px; margin: auto; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 28px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f0f0f0; padding: 8px 12px; text-align: left; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid #ddd; }
    td { padding: 7px 12px; border-bottom: 1px solid #eee; }
    .totals { margin-left: auto; width: 280px; }
    .totals td { border: none; padding: 5px 12px; }
    .grand { font-size: 16px; font-weight: 700; border-top: 2px solid #333 !important; padding-top: 8px !important; }
    .footer { margin-top: 40px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 20px; } }
  </style></head><body>
  <h1>${escHtml(client)}</h1>
  <div class="meta">NCPA Sound Operations &nbsp;·&nbsp; Generated ${date}</div>
  <table>
    <thead><tr><th>Item</th><th>Category</th><th style="text-align:center">Days</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">₹${Math.round(subtotal).toLocaleString('en-IN')}</td></tr>
    ${gstOn ? `<tr><td>GST (18%)</td><td style="text-align:right">₹${Math.round(gst).toLocaleString('en-IN')}</td></tr>` : ''}
    <tr class="grand"><td>Grand Total</td><td style="text-align:right">₹${Math.round(total).toLocaleString('en-IN')}</td></tr>
  </table>
  <div class="footer">NCPA Sound Operations · Quote for internal use only. Not a tax invoice.</div>
  <script>window.onload=()=>{window.print()}<\/script>
  </body></html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
}

// ── Init Quote tab ──
function initQuotes() {
  loadCatalog()

  on('eq-add-btn',           'click', () => openEqModal(null))
  on('eq-modal-backdrop',    'click', closeEqModal)
  on('eq-modal-close',       'click', closeEqModal)
  on('eq-modal-save',        'click', saveEquipment)
  on('eq-name-input',        'keydown', e => { if (e.key === 'Enter') saveEquipment() })
  on('quote-clear-btn',      'click', () => { q3.lines = []; renderQuoteLines() })
  on('quote-print-btn',      'click', exportQuote)
  on('gst-toggle',           'change', recalcTotals)
  on('eq-search',            'input',  renderCatalog)
  on('eq-category-filter',   'change', renderCatalog)

  // Init display
  $('quote-lines-table').style.display = 'none'
  recalcTotals()
}
