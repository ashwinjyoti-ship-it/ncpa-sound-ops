// NCPA Sound Crew - Frontend Application

// Browser compatibility check
(function() {
  try {
    // Test optional chaining
    const test = {}?.test;
    // Test nullish coalescing  
    const test2 = null ?? 'default';
  } catch (error) {
    alert('⚠️ Browser Not Supported\n\nThis app requires a modern browser.\n\nPlease update Safari to version 14+ or use:\n• Chrome\n• Firefox\n• Edge\n• GenSpark Browser');
    throw new Error('Browser not supported');
  }
})();

// State management
let currentView = 'calendar';
let currentDate = new Date();
let allEvents = [];
let currentEditingCell = null;

// API Base URL
const API_BASE = '/api';

// ============================================
// DISPLAY NORMALIZATION HELPERS
// ============================================

// Normalize venue display (Tata Theatre → TT)
function displayVenue(venue) {
  if (!venue) return '';
  
  const venueStr = venue.toString().trim();
  
  // Normalize all Tata Theatre variations to TT
  if (venueStr.includes('Tata Theatre') || venueStr === 'Tata Theatre') {
    return 'TT';
  }
  
  return venue;
}

// Initialize app on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadEvents();
  renderCalendar();
  
  // Search functionality with debounce
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      handleSearch(e.target.value);
    }, 500);
  });
});

// ============================================
// DATA LOADING
// ============================================

async function loadEvents() {
  try {
    const response = await axios.get(`${API_BASE}/events`);
    if (response.data.success) {
      allEvents = response.data.data;
      renderCurrentView();
    }
  } catch (error) {
    console.error('Error loading events:', error);
    showNotification('Failed to load events', 'error');
  }
}

// ============================================
// VIEW SWITCHING
// ============================================

function showTab(tab) {
  currentView = tab;
  
  // Update tab buttons
  document.getElementById('calendarTab').classList.remove('tab-active');
  document.getElementById('tableTab').classList.remove('tab-active');
  const crewTab = document.getElementById('crewTab');
  if (crewTab) crewTab.classList.remove('tab-active');
  
  // Hide all views
  document.getElementById('calendarView').style.display = 'none';
  document.getElementById('tableView').style.display = 'none';
  const crewView = document.getElementById('crewView');
  if (crewView) crewView.style.display = 'none';
  
  if (tab === 'calendar') {
    document.getElementById('calendarTab').classList.add('tab-active');
    document.getElementById('calendarView').style.display = 'block';
    renderCalendar();
  } else if (tab === 'table') {
    document.getElementById('tableTab').classList.add('tab-active');
    document.getElementById('tableView').style.display = 'block';
    renderTable();
  } else if (tab === 'crew') {
    if (crewTab) crewTab.classList.add('tab-active');
    if (crewView) {
      crewView.style.display = 'block';
      if (typeof loadCrewStats === 'function') {
        loadCrewStats();
      }
    }
  }
}

function renderCurrentView() {
  if (currentView === 'calendar') {
    renderCalendar();
  } else {
    renderTable();
  }
}

// ============================================
// CALENDAR VIEW
// ============================================

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  console.log(`🔧 renderCalendar called:`, {
    currentDateFull: currentDate.toISOString(),
    year: year,
    month: month,
    monthName: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month]
  });
  
  // Update header
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  document.getElementById('currentMonthYear').textContent = `${monthNames[month]} ${year}`;
  
  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  console.log(`🔧 Date calculations:`, {
    firstDay: firstDay,
    daysInMonth: daysInMonth,
    startDateCalc: `new Date(${year}, ${month}, 1)`,
    endDateCalc: `new Date(${year}, ${month}, ${daysInMonth})`
  });
  
  // Get events for this month
  // CRITICAL FIX: Format dates in YYYY-MM-DD WITHOUT timezone conversion
  // Using toISOString() converts to UTC which breaks for non-UTC timezones!
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  
  console.log(`🔧 Actual formatted dates:`, {startDate, endDate});
  
  // Filter events and count unique ones only (by ID)
  const monthEvents = allEvents.filter(event => {
    // Make sure event_date exists and is valid
    if (!event.event_date) return false;
    
    // Ensure we're comparing strings properly
    const eventDate = event.event_date.toString();
    return eventDate >= startDate && eventDate <= endDate;
  });
  
  // Remove any duplicates by ID (shouldn't happen, but just in case)
  const uniqueEventIds = new Set();
  const uniqueMonthEvents = monthEvents.filter(event => {
    if (uniqueEventIds.has(event.id)) {
      console.log(`⚠️ DUPLICATE REMOVED: ID ${event.id} - ${event.program}`);
      return false; // Skip duplicate
    }
    uniqueEventIds.add(event.id);
    return true;
  });
  
  // Update event count display with unique count
  const eventCountEl = document.getElementById('monthEventCount');
  if (eventCountEl) {
    eventCountEl.textContent = `${uniqueMonthEvents.length} events`;
  }
  
  // Check if next month has events when current month is empty
  if (uniqueMonthEvents.length === 0) {
    const nextMonth = month + 1;
    const nextYear = nextMonth > 11 ? year + 1 : year;
    const nextMonthIndex = nextMonth > 11 ? 0 : nextMonth;
    const nextStartDate = new Date(nextYear, nextMonthIndex, 1).toISOString().split('T')[0];
    const nextDaysInMonth = new Date(nextYear, nextMonthIndex + 1, 0).getDate();
    const nextEndDate = new Date(nextYear, nextMonthIndex, nextDaysInMonth).toISOString().split('T')[0];
    
    const nextMonthEvents = allEvents.filter(event => {
      if (!event.event_date) return false;
      const eventDate = event.event_date.toString();
      return eventDate >= nextStartDate && eventDate <= nextEndDate;
    });
    
    if (nextMonthEvents.length > 0 && eventCountEl) {
      eventCountEl.innerHTML = `0 events <span class="text-blue-600 cursor-pointer hover:underline" onclick="changeMonth(1)" title="Click to view ${monthNames[nextMonthIndex]} ${nextYear}">→ ${nextMonthEvents.length} events in ${monthNames[nextMonthIndex]}</span>`;
    }
  }
  
  console.log(`📊 Event Count Debug - Month: ${monthNames[month]} ${year}`);
  console.log(`  - Total allEvents: ${allEvents.length}`);
  console.log(`  - Filtered monthEvents: ${monthEvents.length}`);
  console.log(`  - Unique monthEvents: ${uniqueMonthEvents.length}`);
  console.log(`  - Date range: ${startDate} to ${endDate}`);
  
  // Debug: Check if Jan 31 events are in monthEvents
  if (month === 0 && year === 2026) {
    console.log(`  - Jan 31 in monthEvents:`, monthEvents.filter(e => e.event_date === '2026-01-31').length);
    console.log(`  - Jan 31 in uniqueMonthEvents:`, uniqueMonthEvents.filter(e => e.event_date === '2026-01-31').length);
  }
  
  // SUPER DEBUG: If January 2026, log ALL event dates
  if (month === 0 && year === 2026) {
    console.log(`🚨 JANUARY 2026 SPECIAL DEBUG:`);
    const jan31Events = allEvents.filter(e => {
      if (!e.event_date) return false;
      const date = e.event_date.toString().trim();
      return date.includes('31') && date.includes('01') && date.includes('2026');
    });
    console.log(`  - Events with '31' and '01' and '2026' in date:`, jan31Events.map(e => ({
      id: e.id, 
      date: e.event_date, 
      dateType: typeof e.event_date,
      dateLength: e.event_date ? e.event_date.length : 0,
      program: e.program
    })));
    console.log(`  - Exact match for '2026-01-31':`, 
      allEvents.filter(e => e.event_date === '2026-01-31').map(e => ({id: e.id, program: e.program}))
    );
    console.log(`  - Using includes():`, 
      allEvents.filter(e => e.event_date && e.event_date.includes('2026-01-31')).map(e => ({id: e.id, program: e.program}))
    );
  }
  
  // Group events by date
  const eventsByDate = {};
  
  // CRITICAL DEBUG for January 2026
  if (month === 0 && year === 2026) {
    console.log(`🚨 GROUPING DEBUG - uniqueMonthEvents count: ${uniqueMonthEvents.length}`);
    console.log(`🚨 Events with date containing '31':`, 
      uniqueMonthEvents.filter(e => e.event_date && e.event_date.includes('31')).map(e => ({
        id: e.id,
        date: e.event_date,
        program: e.program
      }))
    );
  }
  
  uniqueMonthEvents.forEach(event => {
    const date = event.event_date;
    if (!eventsByDate[date]) {
      eventsByDate[date] = [];
    }
    eventsByDate[date].push(event);
    
    // Debug: Log day 31 events specifically
    if (date && date.endsWith('-31')) {
      console.log('🔍 Found day 31 event in grouping:', {
        date: date,
        program: event.program,
        venue: event.venue,
        id: event.id,
        crew: event.crew
      });
    }
  });
  
  // Log events by date after grouping
  console.log(`  - Events by date:`, Object.keys(eventsByDate).length > 0 ? Object.keys(eventsByDate) : 'No events');
  
  // CRITICAL DEBUG: Check day 31 specifically for current month
  const day31DateStr = `${year}-${String(month + 1).padStart(2, '0')}-31`;
  if (daysInMonth === 31) {
    console.log(`🎯 DEBUGGING DAY 31 for ${monthNames[month]} ${year}:`);
    console.log(`  - Expected date string: ${day31DateStr}`);
    console.log(`  - Events in eventsByDate[${day31DateStr}]:`, eventsByDate[day31DateStr] || 'NONE');
    console.log(`  - Keys in eventsByDate:`, Object.keys(eventsByDate));
    console.log(`  - allEvents with date ${day31DateStr}:`, 
      allEvents.filter(e => e.event_date === day31DateStr).map(e => ({id: e.id, program: e.program}))
    );
  }
  
  // Render calendar grid
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';
  
  // Add empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day bg-gray-50';
    grid.appendChild(emptyCell);
  }
  
  // Add cells for each day
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    
    // Highlight today's date with a special background
    cell.className = isToday ? 'calendar-day p-2 bg-blue-50 border-2 border-blue-500' : 'calendar-day bg-white p-2';
    
    const dayEvents = eventsByDate[dateStr] || [];
    
    // Debug: Log day 31 specifically
    if (day === 31) {
      console.log(`🔍 Rendering day 31:`, {
        dateStr: dateStr,
        eventsFound: dayEvents.length,
        eventsByDateKeys: Object.keys(eventsByDate),
        hasKey: eventsByDate.hasOwnProperty(dateStr),
        events: dayEvents
      });
    }
    
    // Day number
    const dayNumber = document.createElement('div');
    dayNumber.className = isToday ? 'font-bold text-blue-600 mb-2' : 'font-bold text-gray-700 mb-2';
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);
    
    // Event cards
    dayEvents.forEach(event => {
      const card = document.createElement('div');
      card.className = `text-xs p-2 mb-1 rounded cursor-pointer ${
        event.requirements_updated ? 'event-card-green' : 'event-card-peach'
      }`;
      card.onclick = () => openEventModal(event);
      
      card.innerHTML = `
        <div class="font-semibold truncate">${truncateText(event.program, 30)}</div>
        <div class="text-gray-600 truncate"><i class="fas fa-map-marker-alt mr-1"></i>${displayVenue(event.venue)}</div>
        ${event.crew ? `<div class="text-gray-600 truncate"><i class="fas fa-users mr-1"></i>${event.crew}</div>` : ''}
      `;
      
      cell.appendChild(card);
    });
    
    grid.appendChild(cell);
  }
}

function changeMonth(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendar();
}

// ============================================
// TABLE VIEW
// ============================================

function toggleSelectAll(checked) {
  document.querySelectorAll('.bulk-select-checkbox').forEach(cb => {
    cb.checked = checked;
    const eventId = parseInt(cb.dataset.eventId);
    if (checked) {
      bulkSelection.add(eventId);
    } else {
      bulkSelection.delete(eventId);
    }
  });
  
  if (typeof updateBulkActionBar === 'function') {
    updateBulkActionBar();
  }
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  
  if (allEvents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-500">No events found</td></tr>';
    return;
  }
  
  allEvents.forEach(event => {
    const row = document.createElement('tr');
    row.id = `event-row-${event.id}`; // Add ID for scrolling
    row.className = 'border-b hover:bg-gray-50 transition-colors duration-200';
    
    row.innerHTML = `
      <td class="px-2 py-2 text-center">
        <input type="checkbox" class="bulk-select-checkbox" data-event-id="${event.id}" 
               onchange="toggleBulkSelect(${event.id}, this.checked)">
      </td>
      <td class="px-2 py-2 text-sm">${formatDate(event.event_date)}</td>
      <td class="px-2 py-2 text-sm editable-cell" data-field="program" data-id="${event.id}">${event.program || ''}</td>
      <td class="px-2 py-2 text-sm editable-cell" data-field="venue" data-id="${event.id}">${displayVenue(event.venue) || ''}</td>
      <td class="px-2 py-2 text-sm editable-cell" data-field="team" data-id="${event.id}">${event.team || ''}</td>
      <td class="px-2 py-2 text-sm editable-cell" data-field="sound_requirements" data-id="${event.id}">${event.sound_requirements || ''}</td>
      <td class="px-2 py-2 text-sm editable-cell" data-field="call_time" data-id="${event.id}">${event.call_time || ''}</td>
      <td class="px-2 py-2 text-sm editable-cell" data-field="crew" data-id="${event.id}">${event.crew || ''}</td>
      <td class="px-2 py-2 text-center">
        <button onclick="deleteEvent(${event.id})" class="text-red-600 hover:text-red-800">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    tbody.appendChild(row);
  });
  
  // Add click handlers for editable cells
  document.querySelectorAll('.editable-cell').forEach(cell => {
    cell.addEventListener('click', handleCellEdit);
  });
}

function handleCellEdit(e) {
  const cell = e.currentTarget;
  
  // If already editing this cell, return
  if (currentEditingCell === cell) return;
  
  // Save any previous edit
  if (currentEditingCell) {
    saveCell(currentEditingCell);
  }
  
  currentEditingCell = cell;
  const currentValue = cell.textContent;
  const field = cell.dataset.field;
  
  // Create input based on field type
  let input;
  if (field === 'sound_requirements') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else {
    input = document.createElement('input');
    input.type = 'text';
  }
  
  input.value = currentValue;
  input.className = cell.querySelector('input, textarea')?.className || '';
  
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  
  // Save on blur
  input.addEventListener('blur', () => {
    saveCell(cell);
  });
  
  // Save on Enter (for input, not textarea)
  if (field !== 'sound_requirements') {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      }
    });
  }
}

async function saveCell(cell) {
  const input = cell.querySelector('input, textarea');
  if (!input) return;
  
  const newValue = input.value;
  const field = cell.dataset.field;
  const id = cell.dataset.id;
  
  // Get the full event data
  const event = allEvents.find(e => e.id == id);
  if (!event) return;
  
  // Update the event object
  event[field] = newValue;
  
  try {
    const response = await axios.put(`${API_BASE}/events/${id}`, event);
    
    if (response.data.success) {
      cell.textContent = newValue;
      currentEditingCell = null;
      
      // Reload to get updated requirements_updated flag
      await loadEvents();
      showNotification('Updated successfully', 'success');
    }
  } catch (error) {
    console.error('Error updating event:', error);
    cell.textContent = event[field]; // Revert to original value
    showNotification('Failed to update', 'error');
  }
}

// ============================================
// EVENT MODAL
// ============================================

function openEventModal(event) {
  const modal = document.getElementById('eventModal');
  const content = document.getElementById('eventModalContent');
  
  // Check if user is authenticated (currentUser is set by auth.js)
  const isAuthenticated = typeof currentUser !== 'undefined' && currentUser !== null;
  
  // Format sound requirements with clickable links
  const soundReqsFormatted = event.sound_requirements 
    ? formatLinksInText(event.sound_requirements) 
    : 'Not specified';
  
  // Show action buttons only for authenticated users
  const actionButtons = isAuthenticated ? `
    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
      <button onclick="editEventFromModal(${event.id})" 
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center">
        <i class="fas fa-edit mr-2"></i>Edit
      </button>
      <button onclick="deleteEventFromModal(${event.id})" 
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all flex items-center">
        <i class="fas fa-trash mr-2"></i>Delete
      </button>
    </div>
  ` : `
    <div class="mt-6 pt-4 border-t border-gray-200">
      <p class="text-center text-gray-500 text-sm">
        <i class="fas fa-lock mr-2"></i>
        Please <a href="#" onclick="closeEventModal(); openLoginModal(); return false;" class="text-orange-500 hover:text-orange-600 font-semibold">login</a> to edit events
      </p>
    </div>
  `;
  
  content.innerHTML = `
    <div class="space-y-4">
      <div>
        <label class="font-semibold text-gray-700">Date:</label>
        <p class="text-gray-900">${formatDate(event.event_date)}</p>
      </div>
      <div>
        <label class="font-semibold text-gray-700">Program/Event:</label>
        <p class="text-gray-900">${event.program}</p>
      </div>
      <div>
        <label class="font-semibold text-gray-700">Venue:</label>
        <p class="text-gray-900">${displayVenue(event.venue)}</p>
      </div>
      <div>
        <label class="font-semibold text-gray-700">Team (curator):</label>
        <p class="text-gray-900">${event.team || 'Not specified'}</p>
      </div>
      <div>
        <label class="font-semibold text-gray-700">Sound Requirements:</label>
        <p class="text-gray-900 whitespace-pre-wrap">${soundReqsFormatted}</p>
      </div>
      <div>
        <label class="font-semibold text-gray-700">Call Time:</label>
        <p class="text-gray-900">${event.call_time || 'Not specified'}</p>
      </div>
      <div>
        <label class="font-semibold text-gray-700">Crew (sound team):</label>
        <p class="text-gray-900">${event.crew || 'Not assigned'}</p>
      </div>
      <div>
        <label class="font-semibold text-gray-700">Created:</label>
        <p class="text-gray-600 text-sm">${formatDateTime(event.created_at)}</p>
      </div>
      
      ${actionButtons}
    </div>
  `;
  
  modal.classList.add('active');
}

function closeEventModal() {
  document.getElementById('eventModal').classList.remove('active');
}

// Delete event from modal with confirmation
async function deleteEventFromModal(eventId) {
  // Close modal first
  closeEventModal();
  
  // Show confirmation
  if (!confirm('Are you sure you want to delete?')) {
    return;
  }
  
  try {
    const response = await axios.delete(`${API_BASE}/events/${eventId}`);
    
    if (response.data.success) {
      showNotification('✅ Event deleted successfully', 'success');
      await loadEvents();
      renderCalendar(); // Refresh calendar view
    }
  } catch (error) {
    console.error('Error deleting event:', error);
    showNotification('❌ Failed to delete event', 'error');
  }
}

// ============================================
// ADD SHOW MODAL
// ============================================

function openAddShowModal() {
  // Check authentication
  const isAuthenticated = typeof currentUser !== 'undefined' && currentUser !== null;
  
  if (!isAuthenticated) {
    // Show login modal instead
    openLoginModal();
    showNotification('⚠️ Please login to add events', 'warning');
    return;
  }
  
  document.getElementById('addShowModal').classList.add('active');
  document.getElementById('addShowForm').reset();
}

function closeAddShowModal() {
  document.getElementById('addShowModal').classList.remove('active');
  
  // Reset the form
  document.getElementById('addShowForm').reset();
  
  // Uncheck all crew checkboxes
  document.querySelectorAll('.add-crew-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Clear custom crew input
  const customCrewInput = document.getElementById('addCrewCustom');
  if (customCrewInput) {
    customCrewInput.value = '';
  }
}

function toggleDateFields() {
  const dateType = document.querySelector('input[name="dateType"]:checked').value;
  const singleDateField = document.getElementById('singleDateField');
  const multipleDateFields = document.getElementById('multipleDateFields');
  const singleDate = document.getElementById('singleDate');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  
  if (dateType === 'single') {
    singleDateField.style.display = 'block';
    multipleDateFields.style.display = 'none';
    singleDate.required = true;
    startDate.required = false;
    endDate.required = false;
  } else {
    singleDateField.style.display = 'none';
    multipleDateFields.style.display = 'block';
    singleDate.required = false;
    startDate.required = true;
    endDate.required = true;
  }
}

async function handleAddShow(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());
  const dateType = data.dateType;
  
  // Collect selected crew from checkboxes
  const selectedCrew = [];
  document.querySelectorAll('.add-crew-checkbox:checked').forEach(checkbox => {
    selectedCrew.push(checkbox.value);
  });
  
  // Add custom crew if provided
  const customCrewInput = document.getElementById('addCrewCustom');
  if (customCrewInput && customCrewInput.value.trim()) {
    const customCrew = customCrewInput.value.split(',').map(c => c.trim()).filter(c => c);
    selectedCrew.push(...customCrew);
  }
  
  const crewString = selectedCrew.length > 0 ? selectedCrew.join(', ') : null;
  
  try {
    if (dateType === 'single') {
      // Single date event
      const response = await axios.post(`${API_BASE}/events`, {
        event_date: data.event_date,
        program: data.program,
        venue: data.venue,
        team: data.team || null,
        sound_requirements: data.sound_requirements || null,
        call_time: data.call_time || null,
        crew: crewString
      });
      
      if (response.data.success) {
        showNotification('Show added successfully', 'success');
        closeAddShowModal();
        await loadEvents();
        
        // Navigate to the month of the added show
        const eventDate = new Date(data.event_date);
        currentDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
        renderCalendar();
      }
    } else {
      // Multiple dates (date range)
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      
      if (startDate > endDate) {
        showNotification('Start date must be before or equal to end date', 'error');
        return;
      }
      
      // Generate array of events for all dates in range
      const events = [];
      const currentDateIter = new Date(startDate);
      
      while (currentDateIter <= endDate) {
        events.push({
          event_date: currentDateIter.toISOString().split('T')[0],
          program: data.program,
          venue: data.venue,
          team: data.team || null,
          sound_requirements: data.sound_requirements || null,
          call_time: data.call_time || null,
          crew: crewString
        });
        currentDateIter.setDate(currentDateIter.getDate() + 1);
      }
      
      // Upload all events at once using bulk API
      showNotification(`Creating ${events.length} events...`, 'info');
      const response = await axios.post(`${API_BASE}/events/bulk`, { events });
      
      if (response.data.success) {
        const stats = response.data.stats || {};
        const inserted = stats.inserted || 0;
        const skipped = stats.skipped || 0;
        
        let message = `${inserted} events created`;
        if (skipped > 0) {
          message += ` (${skipped} duplicates skipped)`;
        }
        
        showNotification(message, 'success');
        closeAddShowModal();
        await loadEvents();
        
        // Navigate to the month of the first date
        currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        renderCalendar();
      }
    }
  } catch (error) {
    console.error('Error adding show:', error);
    showNotification('Failed to add show: ' + (error.response?.data?.error || error.message), 'error');
  }
}

// ============================================
// EDIT EVENT
// ============================================

function toggleEditDateFields() {
  const dateType = document.querySelector('input[name="editDateType"]:checked').value;
  const singleDateField = document.getElementById('editSingleDateField');
  const multipleDateFields = document.getElementById('editMultipleDateFields');
  const singleDate = document.getElementById('editSingleDate');
  const startDate = document.getElementById('editStartDate');
  const endDate = document.getElementById('editEndDate');
  
  if (dateType === 'single') {
    singleDateField.style.display = 'block';
    multipleDateFields.style.display = 'none';
    singleDate.required = true;
    startDate.required = false;
    endDate.required = false;
  } else {
    singleDateField.style.display = 'none';
    multipleDateFields.style.display = 'block';
    singleDate.required = false;
    startDate.required = true;
    endDate.required = true;
    // Pre-fill start date with current event date
    if (singleDate.value) {
      startDate.value = singleDate.value;
    }
  }
}

async function editEventFromModal(eventId) {
  // Close event detail modal
  closeEventModal();
  
  // Fetch event details
  try {
    const response = await axios.get(`${API_BASE}/events/${eventId}`);
    if (response.data.success) {
      const event = response.data.data;
      
      // Populate form
      document.getElementById('editEventId').value = event.id;
      document.getElementById('editSingleDate').value = event.event_date;
      document.getElementById('editProgram').value = event.program;
      document.getElementById('editVenue').value = event.venue;
      document.getElementById('editTeam').value = event.team || '';
      document.getElementById('editSoundReq').value = event.sound_requirements || '';
      document.getElementById('editCallTime').value = event.call_time || '';
      
      // Handle multiple crew selection (checkboxes)
      const crewList = event.crew ? event.crew.split(',').map(c => c.trim()) : [];
      const crewCheckboxes = document.querySelectorAll('.crew-checkbox');
      crewCheckboxes.forEach(checkbox => {
        checkbox.checked = crewList.includes(checkbox.value);
      });
      
      // Handle custom crew input
      const customCrewInput = document.getElementById('editCustomCrew');
      if (customCrewInput) {
        const predefinedCrew = ['Ashwin', 'Naren', 'Sandeep', 'Coni', 'Nikhil', 'NS', 'Aditya', 'Viraj', 'Shridhar', 'Nazar', 'Omkar', 'Akshay', 'OC1', 'OC2', 'OC3'];
        const customCrew = crewList.filter(c => !predefinedCrew.includes(c));
        customCrewInput.value = customCrew.join(', ');
      }
      
      // Reset to single date mode
      document.querySelector('input[name="editDateType"][value="single"]').checked = true;
      toggleEditDateFields();
      
      // Open edit modal
      document.getElementById('editEventModal').classList.add('active');
    }
  } catch (error) {
    console.error('Error fetching event:', error);
    showNotification('Failed to load event details', 'error');
  }
}

function closeEditEventModal() {
  document.getElementById('editEventModal').classList.remove('active');
}

async function handleEditEvent(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());
  const dateType = data.editDateType;
  const eventId = data.event_id;
  
  // Collect selected crew from checkboxes
  const selectedCrew = [];
  document.querySelectorAll('.crew-checkbox:checked').forEach(checkbox => {
    selectedCrew.push(checkbox.value);
  });
  
  // Add custom crew if provided
  const customCrewInput = document.getElementById('editCustomCrew');
  if (customCrewInput && customCrewInput.value.trim()) {
    const customCrew = customCrewInput.value.split(',').map(c => c.trim()).filter(c => c);
    selectedCrew.push(...customCrew);
  }
  
  const crewString = selectedCrew.length > 0 ? selectedCrew.join(', ') : null;
  
  try {
    if (dateType === 'single') {
      // Simple update for single date
      const response = await axios.put(`${API_BASE}/events/${eventId}`, {
        event_date: data.event_date,
        program: data.program,
        venue: data.venue,
        team: data.team || null,
        sound_requirements: data.sound_requirements || null,
        call_time: data.call_time || null,
        crew: crewString
      });
      
      if (response.data.success) {
        showNotification('Event updated successfully', 'success');
        closeEditEventModal();
        await loadEvents();
        renderCalendar();
      }
    } else {
      // Multiple dates - update original and create copies for additional dates
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      
      if (startDate > endDate) {
        showNotification('Start date must be before or equal to end date', 'error');
        return;
      }
      
      // Update original event to start date
      await axios.put(`${API_BASE}/events/${eventId}`, {
        event_date: data.start_date,
        program: data.program,
        venue: data.venue,
        team: data.team || null,
        sound_requirements: data.sound_requirements || null,
        call_time: data.call_time || null,
        crew: crewString
      });
      
      // Create copies for remaining dates
      const events = [];
      const currentDateIter = new Date(startDate);
      currentDateIter.setDate(currentDateIter.getDate() + 1); // Start from day after start date
      
      while (currentDateIter <= endDate) {
        events.push({
          event_date: currentDateIter.toISOString().split('T')[0],
          program: data.program,
          venue: data.venue,
          team: data.team || null,
          sound_requirements: data.sound_requirements || null,
          call_time: data.call_time || null,
          crew: crewString
        });
        currentDateIter.setDate(currentDateIter.getDate() + 1);
      }
      
      if (events.length > 0) {
        await axios.post(`${API_BASE}/events/bulk`, { events });
      }
      
      const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      showNotification(`Event extended to ${totalDays} dates`, 'success');
      closeEditEventModal();
      await loadEvents();
      renderCalendar();
    }
  } catch (error) {
    console.error('Error updating event:', error);
    showNotification('Failed to update event: ' + (error.response?.data?.error || error.message), 'error');
  }
}

// ============================================
// CSV UPLOAD
// ============================================

function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  showNotification('Parsing CSV file...', 'info');
  
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      console.log('CSV parsed, total rows:', results.data.length);
      console.log('CSV headers:', Object.keys(results.data[0] || {}));
      console.log('First row sample:', results.data[0]);
      
      const allParsed = results.data.map((row, index) => {
        const parsed = {
          row: index + 1,
          event_date: parseDate(row['Date'] || row['date'] || row['EVENT DATE'] || row['Event Date']),
          original_date: row['Date'] || row['date'] || row['EVENT DATE'] || row['Event Date'],
          program: row['Program'] || row['program'] || row['Program/Event'] || row['Event'] || '',
          venue: row['Venue'] || row['venue'] || '',
          team: row['Team'] || row['team'] || row['Curator'] || '',
          sound_requirements: row['Sound Requirements'] || row['sound_requirements'] || row['Sound Requirement'] || row['sound_requirement'] || '',
          call_time: row['Call Time'] || row['call_time'] || row['CallTime'] || '',
          crew: row['Crew'] || row['crew'] || row['Sound Crew'] || ''
        };
        return parsed;
      });
      
      const validEvents = allParsed.filter(event => event.event_date && event.program && event.venue);
      const invalidEvents = allParsed.filter(event => !event.event_date || !event.program || !event.venue);
      
      console.log('Valid events:', validEvents.length);
      console.log('Invalid/skipped events:', invalidEvents.length);
      
      if (invalidEvents.length > 0) {
        console.log('Invalid events details:', invalidEvents);
      }
      
      if (validEvents.length === 0) {
        showNotification(`No valid events found. ${results.data.length} rows in CSV, but all missing required fields (Date, Program, or Venue)`, 'error');
        return;
      }
      
      // Remove the metadata fields before sending
      const eventsToUpload = validEvents.map(e => ({
        event_date: e.event_date,
        program: e.program,
        venue: e.venue,
        team: e.team,
        sound_requirements: e.sound_requirements,
        call_time: e.call_time,
        crew: e.crew
      }));
      
      try {
        showNotification(`Uploading ${eventsToUpload.length} events...`, 'info');
        const response = await axios.post(`${API_BASE}/events/bulk`, { events: eventsToUpload });
        
        if (response.data.success) {
          const stats = response.data.stats || {};
          const uploaded = stats.inserted || response.data.data.length;
          const duplicates = stats.skipped || 0;
          const invalid = stats.invalid || 0;
          
          let message = `✓ ${uploaded} new events added`;
          if (duplicates > 0) {
            message += `, ${duplicates} duplicates skipped`;
          }
          if (invalid > 0 || invalidEvents.length > 0) {
            message += `, ${invalid + invalidEvents.length} invalid entries ignored`;
          }
          
          showNotification(message, 'success');
          await loadEvents();
        } else {
          showNotification(`Upload failed: ${response.data.error || 'Unknown error'}`, 'error');
        }
      } catch (error) {
        console.error('Error uploading CSV:', error);
        showNotification(`Failed to upload CSV: ${error.response?.data?.error || error.message}`, 'error');
      }
    },
    error: (error) => {
      console.error('Error parsing CSV:', error);
      showNotification(`Failed to parse CSV file: ${error.message}`, 'error');
    }
  });
  
  // Reset file input
  e.target.value = '';
}

// ============================================
// WORD DOCUMENT UPLOAD
// ============================================

async function handleWordUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Show persistent progress notification
  const progressNotification = showPersistentNotification('📄 Extracting text from Word document...', 'info');
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Extract raw text from Word document
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    console.log('Word document extracted:', text.length, 'characters');
    
    // Extract month/year from filename for navigation
    const monthMatch = file.name.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i);
    const yearMatch = file.name.match(/20\d{2}/);
    let uploadedMonth = null;
    let uploadedYear = null;
    
    if (monthMatch && yearMatch) {
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      uploadedMonth = monthNames.indexOf(monthMatch[0].toLowerCase());
      uploadedYear = parseInt(yearMatch[0]);
    }
    
    // Estimate processing time based on document size
    const estimatedChunks = Math.ceil(text.length / 12000);
    const estimatedTime = estimatedChunks * 15; // ~15 seconds per chunk
    
    if (estimatedChunks > 1) {
      updatePersistentNotification(progressNotification, `🤖 AI is analyzing document in ${estimatedChunks} chunks... (this may take ~${estimatedTime}s)`, 'info');
    } else {
      updatePersistentNotification(progressNotification, '🤖 AI is analyzing the document...', 'info');
    }
    
    // Use AI to parse the document intelligently with chunked processing
    const response = await axios.post(`${API_BASE}/ai/parse-word`, {
      text: text,
      filename: file.name
    }, {
      timeout: 180000 // 3 minutes timeout for large documents
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'AI parsing failed');
    }
    
    const events = response.data.events;
    const chunks = response.data.chunks || 1;
    const totalEvents = response.data.totalEvents || events.length;
    const uniqueEvents = response.data.uniqueEvents || events.length;
    
    if (events.length === 0) {
      updatePersistentNotification(progressNotification, '❌ No events found in document. AI could not identify any event entries.', 'error');
      setTimeout(() => removePersistentNotification(progressNotification), 8000);
      return;
    }
    
    console.log(`✅ AI parsed ${uniqueEvents} unique events from ${chunks} chunks (${totalEvents} total found)`);
    console.log('Sample events:', events.slice(0, 3));
    
    // Update progress
    updatePersistentNotification(progressNotification, `⬆️ Uploading ${uniqueEvents} events to database...`, 'info');
    
    // Upload events
    const uploadResponse = await axios.post(`${API_BASE}/events/bulk`, { events });
    
    if (uploadResponse.data.success) {
      const stats = uploadResponse.data.stats || {};
      const uploaded = stats.inserted || uploadResponse.data.data.length;
      const duplicates = stats.skipped || 0;
      const invalid = stats.invalid || 0;
      
      // Reload events first
      await loadEvents();
      
      // Navigate to the uploaded month if we could detect it
      if (uploadedMonth !== null && uploadedYear !== null) {
        currentDate = new Date(uploadedYear, uploadedMonth, 1);
        renderCalendar();
      }
      
      // Show detailed success message
      let message = `✅ Upload complete! ${uploaded} new events added`;
      if (duplicates > 0) {
        message += `, ${duplicates} duplicates skipped (already exist)`;
      }
      if (invalid > 0) {
        message += `, ${invalid} invalid entries ignored`;
      }
      
      // Show success even if some were skipped (this is expected behavior)
      const notificationType = uploaded > 0 ? 'success' : (duplicates > 0 ? 'info' : 'warning');
      updatePersistentNotification(progressNotification, message, notificationType);
      setTimeout(() => removePersistentNotification(progressNotification), 6000);
      
    } else {
      updatePersistentNotification(progressNotification, `❌ Upload failed: ${uploadResponse.data.error || 'Unknown error'}`, 'error');
      setTimeout(() => removePersistentNotification(progressNotification), 8000);
    }
    
  } catch (error) {
    console.error('Error parsing Word document:', error);
    
    // Better error messages
    let errorMessage = 'Failed to parse Word document';
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorMessage = 'Document is very large and processing timed out. Please try CSV upload instead.';
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    updatePersistentNotification(progressNotification, `❌ ${errorMessage}`, 'error');
    setTimeout(() => removePersistentNotification(progressNotification), 8000);
  } finally {
    // Always reset file input so user can try again
    e.target.value = '';
  }
}


function parseEventLine(text) {
  let program = '';
  let venue = '';
  let sound_requirements = '';
  let call_time = '';
  let crew = '';
  
  // Extract venue
  if (text.includes('TET')) venue = 'Tata Theatre';
  else if (text.includes('Experimental')) venue = 'Experimental Theatre';
  else if (text.includes('Jamshed')) venue = 'Jamshed Bhabha Theatre';
  else if (text.includes('Little')) venue = 'Little Theatre';
  
  // Extract program (text before venue or before requirements keywords)
  const venueIndex = venue ? text.indexOf(venue) : -1;
  if (venueIndex > 0) {
    program = text.substring(0, venueIndex).trim();
  } else {
    const reqIndex = text.search(/(?:Stage|Sound|Light|AC|Projector|requirement|setup)/i);
    if (reqIndex > 0) {
      program = text.substring(0, reqIndex).trim();
    } else {
      program = text.substring(0, Math.min(150, text.length)).trim();
    }
  }
  
  // Remove curator team from program (in square brackets)
  program = program.replace(/\[.*?\]/g, '').trim();
  
  // Extract sound requirements
  const reqStartIndex = text.search(/(?:Stage|Sound|Light|AC|Projector|requirement|setup|technician)/i);
  if (reqStartIndex > 0) {
    sound_requirements = text.substring(reqStartIndex).trim();
  } else if (venueIndex > 0) {
    const afterVenue = text.substring(venueIndex + venue.length).trim();
    sound_requirements = afterVenue;
  }
  
  // Extract call time
  call_time = extractCallTime(sound_requirements);
  
  // Extract crew names
  const crewMatch = sound_requirements.match(/(?:Ashwin|Raj|Amit|Gawde|crew)/gi);
  if (crewMatch) {
    crew = [...new Set(crewMatch)].join(', ');
  }
  
  return { program, venue, sound_requirements, call_time, crew };
}

function extractCallTime(requirementsText) {
  if (!requirementsText) return '';
  
  // Priority 1: Sound-specific times
  const soundPatterns = [
    /sound\s+(?:at|by|from|setup|check|ready)\s+(?:by\s+)?(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/gi,
    /sound\s+requirements?.*?(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/gi,
    /(?:ashwin|crew|sound team).*?(?:at|by|from)\s+(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/gi
  ];
  
  for (const pattern of soundPatterns) {
    const match = requirementsText.match(pattern);
    if (match) {
      const timeMatch = match[0].match(/(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/i);
      if (timeMatch) {
        return normalizeTime(timeMatch[1]) + ' (Sound)';
      }
    }
  }
  
  // Priority 2: General technical times
  const techPatterns = [
    /(?:ready|setup|technicians?)\s+(?:at|by|from)\s+(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/gi,
    /(?:technical|tech).*?(?:at|by|from)\s+(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/gi
  ];
  
  for (const pattern of techPatterns) {
    const match = requirementsText.match(pattern);
    if (match) {
      const timeMatch = match[0].match(/(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/i);
      if (timeMatch) {
        return normalizeTime(timeMatch[1]) + ' (Tech)';
      }
    }
  }
  
  // Priority 3: Utility times
  const utilityPatterns = [
    /AC\s+(?:at|by|from)\s+(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/gi,
    /light(?:s|ing)?\s+(?:at|by|from)\s+(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/gi
  ];
  
  for (const pattern of utilityPatterns) {
    const match = requirementsText.match(pattern);
    if (match) {
      const timeMatch = match[0].match(/(\d{1,2}(?::\d{2})?\.?\d{0,2}\s*(?:am|pm))/i);
      if (timeMatch) {
        const timeValue = normalizeTime(timeMatch[1]);
        if (/AC/i.test(match[0])) return timeValue + ' (AC)';
        else if (/light/i.test(match[0])) return timeValue + ' (Lights)';
      }
    }
  }
  
  return '';
}

function normalizeTime(timeStr) {
  timeStr = timeStr.trim();
  timeStr = timeStr.replace(/\./g, ':');
  timeStr = timeStr.replace(/(\d)([ap]m)/i, '$1 $2');
  timeStr = timeStr.replace(/am/i, 'AM').replace(/pm/i, 'PM');
  return timeStr;
}

function parseMonthName(monthStr) {
  const months = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
  };
  
  return months[monthStr.toLowerCase()] || null;
}

// ============================================
// SEARCH
// ============================================

async function handleSearch(query) {
  if (!query || query.trim() === '') {
    loadEvents();
    return;
  }
  
  try {
    const response = await axios.get(`${API_BASE}/events/search?q=${encodeURIComponent(query)}`);
    
    if (response.data.success) {
      allEvents = response.data.data;
      
      // Show notification if no results found
      if (allEvents.length === 0) {
        showNotification(`No events found for "${query}". Clear search to see all events.`, 'info');
      }
      
      renderCurrentView();
    }
  } catch (error) {
    console.error('Error searching:', error);
    showNotification('Search failed', 'error');
  }
}

// ============================================
// DELETE EVENT
// ============================================

async function deleteEvent(id) {
  if (!confirm('Are you sure you want to delete?')) {
    return;
  }
  
  try {
    const response = await axios.delete(`${API_BASE}/events/${id}`);
    
    if (response.data.success) {
      showNotification('Event deleted successfully', 'success');
      await loadEvents();
    }
  } catch (error) {
    console.error('Error deleting event:', error);
    showNotification('Failed to delete event', 'error');
  }
}

// Bulk delete events by month
async function bulkDeleteEvents() {
  const month = document.getElementById('bulkDeleteMonth').value;
  const year = document.getElementById('bulkDeleteYear').value;
  
  if (!month || !year) {
    showNotification('Please select both month and year', 'error');
    return;
  }
  
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[parseInt(month)];
  
  if (!confirm(`Are you sure you want to delete ALL events from ${monthName} ${year}?\n\nThis action cannot be undone.`)) {
    return;
  }
  
  const statusDiv = document.getElementById('bulkDeleteStatus');
  statusDiv.textContent = 'Deleting...';
  statusDiv.className = 'text-sm text-blue-600';
  
  try {
    const response = await axios.post(`${API_BASE}/events/bulk-delete`, {
      month: parseInt(month),
      year: parseInt(year)
    });
    
    if (response.data.success) {
      const deleted = response.data.deleted;
      showNotification(`✅ Deleted ${deleted} events from ${monthName} ${year}`, 'success');
      statusDiv.textContent = `Last action: Deleted ${deleted} events`;
      statusDiv.className = 'text-sm text-green-600';
      
      // Reload events
      await loadEvents();
      
      // Reset dropdowns
      document.getElementById('bulkDeleteMonth').value = '';
      document.getElementById('bulkDeleteYear').value = '';
    }
  } catch (error) {
    console.error('Error bulk deleting events:', error);
    showNotification('Failed to delete events', 'error');
    statusDiv.textContent = 'Error deleting events';
    statusDiv.className = 'text-sm text-red-600';
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Remove any whitespace
  dateStr = dateStr.trim();
  
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Try DD/MM/YYYY format with SLASH (international standard - most common from Google Sheets)
  // This MUST come before any JavaScript Date parsing to avoid MM/DD confusion
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    
    // Always treat slash format as DD/MM/YYYY (international standard)
    return `${year}-${month}-${day}`;
  }
  
  // Try DD-MM-YYYY format (with dashes)
  const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashMatch) {
    let day = dashMatch[1].padStart(2, '0');
    let month = dashMatch[2].padStart(2, '0');
    let year = dashMatch[3];
    
    // Handle 2-digit year (25 -> 2025)
    if (year.length === 2) {
      year = '20' + year;
    }
    
    return `${year}-${month}-${day}`;
  }
  
  // Try YYYY/MM/DD format (already in correct order)
  const isoSlashMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoSlashMatch) {
    const year = isoSlashMatch[1];
    const month = isoSlashMatch[2].padStart(2, '0');
    const day = isoSlashMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Last resort: Try parsing as Date (but this often gets DD/MM wrong)
  // We only reach here if none of the explicit patterns matched
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function formatLinksInText(text) {
  if (!text) return '';
  
  // Pattern to match URLs (http, https, www, drive.google.com, etc.)
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|drive\.google\.com[^\s]+)/gi;
  
  // Replace URLs with clickable links
  return text.replace(urlPattern, (url) => {
    // Ensure the URL has a protocol
    let href = url;
    if (!url.match(/^https?:\/\//i)) {
      href = 'https://' + url;
    }
    
    // Create a shortened display text for long URLs
    const displayText = url.length > 50 ? url.substring(0, 47) + '...' : url;
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline hover:text-blue-800" title="${url}"><i class="fas fa-link"></i> ${displayText}</a>`;
  });
}

function showNotification(message, type = 'info') {
  // Simple notification using alert for now
  // Can be enhanced with a toast library later
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  console.log(`${icon} ${message}`);
  
  // Create a simple toast
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 max-w-md ${
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Error messages stay longer (8 seconds) so users can read them
  const duration = type === 'error' ? 8000 : 3000;
  
  setTimeout(() => {
    toast.remove();
  }, duration);
}

// Persistent notification for long-running operations
function showPersistentNotification(message, type = 'info') {
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  console.log(`${icon} ${message}`);
  
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 max-w-md ${
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'
  }`;
  toast.textContent = message;
  toast.setAttribute('data-persistent', 'true');
  document.body.appendChild(toast);
  
  return toast; // Return reference so it can be updated
}

// Update an existing persistent notification
function updatePersistentNotification(toast, message, type = 'info') {
  if (!toast) return;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  console.log(`${icon} ${message}`);
  
  toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 max-w-md ${
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'
  }`;
  toast.textContent = message;
}

// Remove a persistent notification
function removePersistentNotification(toast) {
  if (toast && toast.parentNode) {
    toast.remove();
  }
}

// Close modals when clicking outside
window.onclick = function(event) {
  const eventModal = document.getElementById('eventModal');
  const addShowModal = document.getElementById('addShowModal');
  const editEventModal = document.getElementById('editEventModal');
  const deleteConfirmModal = document.getElementById('deleteConfirmModal');
  const whatsappModal = document.getElementById('whatsappExportModal');
  const csvModal = document.getElementById('csvExportModal');
  const aiModal = document.getElementById('aiAssistantModal');
  
  if (event.target === eventModal) {
    closeEventModal();
  }
  if (event.target === addShowModal) {
    closeAddShowModal();
  }
  if (event.target === editEventModal) {
    closeEditEventModal();
  }
  if (event.target === deleteConfirmModal) {
    closeDeleteConfirm();
  }
  if (event.target === whatsappModal) {
    closeWhatsAppExportModal();
  }
  if (event.target === csvModal) {
    closeCSVExportModal();
  }
  if (event.target === aiModal) {
    closeAIAssistant();
  }
}

// ============================================
// WHATSAPP EXPORT
// ============================================

function openWhatsAppExportModal() {
  document.getElementById('whatsappExportModal').classList.add('active');
  document.getElementById('exportPreview').style.display = 'none';
  document.getElementById('customDatePicker').style.display = 'none';
}

function closeWhatsAppExportModal() {
  document.getElementById('whatsappExportModal').classList.remove('active');
}

function exportTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  
  generateWhatsAppExport(dateStr, dateStr, `Tomorrow (${formatDate(dateStr)})`);
}

function exportThisWeek() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Calculate start of week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  
  // Calculate end of week (Saturday)
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - dayOfWeek));
  
  const startStr = startOfWeek.toISOString().split('T')[0];
  const endStr = endOfWeek.toISOString().split('T')[0];
  
  generateWhatsAppExport(startStr, endStr, `This Week (${formatDate(startStr)} - ${formatDate(endStr)})`);
}

function exportNextWeek() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Calculate start of next week (next Sunday)
  const startOfNextWeek = new Date(today);
  startOfNextWeek.setDate(today.getDate() + (7 - dayOfWeek));
  
  // Calculate end of next week (next Saturday)
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
  
  const startStr = startOfNextWeek.toISOString().split('T')[0];
  const endStr = endOfNextWeek.toISOString().split('T')[0];
  
  generateWhatsAppExport(startStr, endStr, `Next Week (${formatDate(startStr)} - ${formatDate(endStr)})`);
}

function exportCustomDate() {
  document.getElementById('customDatePicker').style.display = 'block';
  document.getElementById('exportPreview').style.display = 'none';
  
  // Set default to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('customDateInput').value = tomorrow.toISOString().split('T')[0];
}

function exportSelectedDate() {
  const dateInput = document.getElementById('customDateInput').value;
  if (!dateInput) {
    showNotification('Please select a date', 'error');
    return;
  }
  
  generateWhatsAppExport(dateInput, dateInput, formatDate(dateInput));
}

function generateWhatsAppExport(startDate, endDate, title) {
  // Filter events for the date range
  const filteredEvents = allEvents.filter(event => 
    event.event_date >= startDate && event.event_date <= endDate
  ).sort((a, b) => a.event_date.localeCompare(b.event_date));
  
  if (filteredEvents.length === 0) {
    showNotification('No events found for the selected date range', 'error');
    return;
  }
  
  // Generate WhatsApp message format - crisp and bold headers
  let message = `📅 *Events for ${title}*\n\n`;
  
  filteredEvents.forEach((event, index) => {
    message += `🎭 *Event ${index + 1}*\n`;
    
    // Program name - extract main name only (before NCPA, before organizer, first 60 chars)
    let programName = event.program;
    // Remove organizer info in brackets/square brackets
    programName = programName.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '');
    // Remove "NCPA &" or "NCPA and" prefix
    programName = programName.replace(/NCPA\s+(&|and)\s+/gi, '');
    // Trim and limit to 60 characters for WhatsApp
    programName = programName.trim().substring(0, 60);
    if (event.program.length > 60) programName += '...';
    
    message += `*Program:* ${programName}\n`;
    message += `*Venue:* ${event.venue}\n`;
    
    if (event.call_time) {
      message += `*Call Time:* ${event.call_time}\n`;
    }
    
    if (event.crew && event.crew.trim() !== '') {
      message += `*Crew:* ${event.crew}\n`;
    }
    
    if (event.sound_requirements && event.sound_requirements.trim() !== '') {
      // Extract sound-specific requirements only
      let soundReqs = event.sound_requirements;
      
      // Remove HTML tags
      soundReqs = soundReqs.replace(/<[^>]*>/g, '');
      
      // Try to extract sound-related info only
      const soundKeywords = /sound|audio|mic|speaker|amp|mixer|stage|setup|rider|crew/gi;
      const sentences = soundReqs.split(/[.!]\s+/);
      const soundSentences = sentences.filter(s => soundKeywords.test(s));
      
      if (soundSentences.length > 0) {
        soundReqs = soundSentences.join('. ').trim();
        // Limit to 150 chars for WhatsApp
        if (soundReqs.length > 150) {
          soundReqs = soundReqs.substring(0, 147) + '...';
        }
      } else {
        // No sound-specific info, use first 150 chars of full requirements
        soundReqs = soundReqs.substring(0, 150);
        if (event.sound_requirements.length > 150) soundReqs += '...';
      }
      
      message += `*Sound:* ${soundReqs}\n`;
    }
    
    message += `\n`;
  });
  
  message += `---\n`;
  message += `Total: ${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''}`;
  
  // Show preview
  document.getElementById('exportText').value = message;
  document.getElementById('exportPreview').style.display = 'block';
  document.getElementById('customDatePicker').style.display = 'none';
}

function copyToClipboard() {
  const textarea = document.getElementById('exportText');
  textarea.select();
  textarea.setSelectionRange(0, 99999); // For mobile devices
  
  try {
    document.execCommand('copy');
    showNotification('Copied to clipboard! Paste in WhatsApp.', 'success');
    
    // Close modal after short delay
    setTimeout(() => {
      closeWhatsAppExportModal();
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy. Please copy manually.', 'error');
  }
}

// ============================================
// CSV EXPORT
// ============================================

function openCSVExportModal() {
  const modal = document.getElementById('csvExportModal');
  modal.classList.add('active');
  
  // Set current month and year as defaults
  const now = new Date();
  document.getElementById('csvExportMonth').value = now.getMonth() + 1;
  document.getElementById('csvExportYear').value = now.getFullYear();
}

function closeCSVExportModal() {
  document.getElementById('csvExportModal').classList.remove('active');
}

async function generateCSVExport() {
  const month = document.getElementById('csvExportMonth').value;
  const year = document.getElementById('csvExportYear').value;
  
  if (!month || !year) {
    showNotification('Please select month and year', 'error');
    return;
  }
  
  try {
    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    // Fetch events for this month
    showNotification('Fetching events...', 'info');
    const response = await axios.get(`${API_BASE}/events/range?start=${startDate}&end=${endDate}`);
    
    if (!response.data.success || !response.data.data || response.data.data.length === 0) {
      showNotification('No events found for this month', 'warning');
      return;
    }
    
    const events = response.data.data;
    
    // Convert to CSV format
    const csvContent = convertEventsToCSV(events);
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[parseInt(month) - 1];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `NCPA_Events_${monthName}_${year}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`✅ Downloaded ${events.length} events for ${monthName} ${year}`, 'success');
    closeCSVExportModal();
    
  } catch (error) {
    console.error('CSV export error:', error);
    showNotification(`Failed to export CSV: ${error.message}`, 'error');
  }
}

function convertEventsToCSV(events) {
  // CSV headers
  const headers = ['Date', 'Program', 'Venue', 'Team', 'Sound Requirements', 'Call Time', 'Crew'];
  
  // Convert events to CSV rows
  const rows = events.map(event => {
    return [
      event.event_date || '',
      `"${(event.program || '').replace(/"/g, '""')}"`, // Escape quotes
      `"${(event.venue || '').replace(/"/g, '""')}"`,
      `"${(event.team || '').replace(/"/g, '""')}"`,
      `"${(event.sound_requirements || '').replace(/"/g, '""')}"`,
      event.call_time || '',
      `"${(event.crew || '').replace(/"/g, '""')}"`
    ].join(',');
  });
  
  // Combine headers and rows
  return [headers.join(','), ...rows].join('\n');
}

// ============================================
// iCALENDAR EXPORT FOR CALENDAR APPS
// ============================================

function convertEventsToICalendar(events) {
  // iCalendar header
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NCPA Sound Crew//Event Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:NCPA Sound Crew Events',
    'X-WR-TIMEZONE:Asia/Kolkata'
  ];
  
  // Convert each event to VEVENT
  events.forEach(event => {
    const eventDate = event.event_date; // Format: YYYY-MM-DD
    const callTime = event.call_time || '09:00'; // Default to 9 AM if no call time
    
    // Parse date and time
    const [year, month, day] = eventDate.split('-');
    const [hours, minutes] = callTime.split(':');
    
    // Create datetime stamps (iCalendar format: YYYYMMDDTHHmmss)
    const dtStart = `${year}${month}${day}T${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;
    const dtEnd = `${year}${month}${day}T${(parseInt(hours) + 2).toString().padStart(2, '0')}${minutes.padStart(2, '0')}00`; // +2 hours duration
    
    // Create unique ID
    const uid = `${event.id}-${eventDate}@ncpa-sound.pages.dev`;
    
    // Create timestamp (now)
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    // Build description
    let description = [];
    if (event.venue) description.push(`Venue: ${event.venue}`);
    if (event.team) description.push(`Team: ${event.team}`);
    if (event.crew) description.push(`Crew: ${event.crew}`);
    if (event.sound_requirements) description.push(`Sound Requirements: ${event.sound_requirements}`);
    if (event.call_time) description.push(`Call Time: ${event.call_time}`);
    
    const descText = description.join('\\n').replace(/,/g, '\\,');
    
    // Build VEVENT
    icsLines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${timestamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${event.program.replace(/,/g, '\\,')}`,
      `DESCRIPTION:${descText}`,
      `LOCATION:${(event.venue || '').replace(/,/g, '\\,')}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  });
  
  // iCalendar footer
  icsLines.push('END:VCALENDAR');
  
  return icsLines.join('\r\n');
}

async function generateICalendarExport() {
  const month = document.getElementById('csvExportMonth').value;
  const year = document.getElementById('csvExportYear').value;
  
  if (!month || !year) {
    showNotification('Please select month and year', 'error');
    return;
  }
  
  try {
    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    // Fetch events for this month
    showNotification('Fetching events for calendar...', 'info');
    const response = await axios.get(`${API_BASE}/events/range?start=${startDate}&end=${endDate}`);
    
    if (!response.data.success || !response.data.data || response.data.data.length === 0) {
      showNotification('No events found for this month', 'warning');
      return;
    }
    
    const events = response.data.data;
    
    // Convert to iCalendar format
    const icsContent = convertEventsToICalendar(events);
    
    // Create download link
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[parseInt(month) - 1];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `NCPA_Events_${monthName}_${year}.ics`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`✅ Downloaded ${events.length} events as calendar file (.ics)`, 'success');
    closeCSVExportModal();
    
  } catch (error) {
    console.error('iCalendar export error:', error);
    showNotification(`Failed to export calendar: ${error.message}`, 'error');
  }
}

// Expose iCalendar export globally
window.generateICalendarExport = generateICalendarExport;

// ============================================
// EXCEL EXPORT
// ============================================

async function generateExcelExport() {
  const month = document.getElementById('csvExportMonth').value;
  const year = document.getElementById('csvExportYear').value;
  
  if (!month || !year) {
    showNotification('Please select month and year', 'error');
    return;
  }
  
  // Check if XLSX library is loaded
  if (typeof XLSX === 'undefined') {
    showNotification('Excel library not loaded. Please refresh the page and try again.', 'error');
    console.error('XLSX library is not loaded');
    return;
  }
  
  try {
    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    // Fetch events for this month
    showNotification('Fetching events...', 'info');
    const response = await axios.get(`${API_BASE}/events/range?start=${startDate}&end=${endDate}`);
    
    if (!response.data.success || !response.data.data || response.data.data.length === 0) {
      showNotification('No events found for this month', 'warning');
      return;
    }
    
    const events = response.data.data;
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const worksheetData = [
      ['Date', 'Program', 'Venue', 'Team', 'Sound Requirements', 'Call Time', 'Crew']
    ];
    
    events.forEach(event => {
      worksheetData.push([
        event.event_date || '',
        event.program || '',
        event.venue || '',
        event.team || '',
        event.sound_requirements || '',
        event.call_time || '',
        event.crew || ''
      ]);
    });
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 },  // Date
      { wch: 50 },  // Program
      { wch: 10 },  // Venue
      { wch: 20 },  // Team
      { wch: 30 },  // Sound Requirements
      { wch: 10 },  // Call Time
      { wch: 20 }   // Crew
    ];
    
    // Add worksheet to workbook
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[parseInt(month) - 1];
    
    XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${year}`);
    
    // Generate Excel file and download
    XLSX.writeFile(wb, `NCPA_Events_${monthName}_${year}.xlsx`);
    
    showNotification(`✅ Downloaded ${events.length} events for ${monthName} ${year}`, 'success');
    closeCSVExportModal();
    
  } catch (error) {
    console.error('Excel export error:', error);
    showNotification(`Failed to export Excel: ${error.message}`, 'error');
  }
}

// ============================================
// AI ASSISTANT
// ============================================

function toggleAIAssistant() {
  const modal = document.getElementById('aiAssistantModal');
  if (modal.classList.contains('active')) {
    closeAIAssistant();
  } else {
    openAIAssistant();
  }
}

function openAIAssistant() {
  document.getElementById('aiAssistantModal').classList.add('active');
  document.getElementById('aiQueryInput').focus();
}

function closeAIAssistant() {
  document.getElementById('aiAssistantModal').classList.remove('active');
}

// Session management for context memory
let aiSessionId = localStorage.getItem('ai_session_id');
if (!aiSessionId) {
  aiSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  localStorage.setItem('ai_session_id', aiSessionId);
}

async function askAI(predefinedQuery) {
  const input = document.getElementById('aiQueryInput');
  const query = predefinedQuery || input.value.trim();
  
  if (!query) {
    showNotification('Please enter a question', 'error');
    return;
  }
  
  // Show loading
  document.getElementById('aiResponse').style.display = 'block';
  document.getElementById('aiLoading').style.display = 'inline-block';
  document.getElementById('aiExplanation').textContent = 'Thinking...';
  document.getElementById('aiResultsContainer').innerHTML = '';
  
  try {
    // Use the new RAG endpoint for better responses
    const response = await axios.post(`${API_BASE}/ai/rag`, { 
      query,
      session_id: aiSessionId
    });
    
    if (response.data.success) {
      const { answer, events, insights, recommendations, follow_up_suggestions } = response.data;
      
      // Hide loading
      document.getElementById('aiLoading').style.display = 'none';
      
      // Show natural language answer
      document.getElementById('aiExplanation').innerHTML = answer || 'Here are the results:';
      
      // Display results
      let resultsHTML = '';
      
      // Show events if any
      if (events && events.length > 0) {
        resultsHTML += '<div class="space-y-3 mb-4">';
        events.forEach(event => {
          resultsHTML += `
            <div class="bg-white border border-orange-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                  <div class="text-sm text-orange-600 font-semibold">${formatDate(event.event_date)}</div>
                  <div class="text-lg font-bold text-gray-800 mt-1">${event.program}</div>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 text-sm mt-3">
                <div><span class="text-gray-600">Venue:</span> <span class="font-medium">${event.venue || 'N/A'}</span></div>
                <div><span class="text-gray-600">Crew:</span> <span class="font-medium">${event.crew || 'N/A'}</span></div>
                <div><span class="text-gray-600">Call Time:</span> <span class="font-medium">${event.call_time || 'N/A'}</span></div>
                <div><span class="text-gray-600">Team:</span> <span class="font-medium">${event.team || 'N/A'}</span></div>
              </div>
              ${event.sound_requirements ? `<div class="mt-3 text-sm"><span class="text-gray-600">Sound Requirements:</span> <div class="mt-1 text-gray-700">${formatLinksInText(event.sound_requirements)}</div></div>` : ''}
            </div>
          `;
        });
        resultsHTML += '</div>';
      }
      // Note: Don't show "No events found" for aggregation queries
      // The answer already contains the count/summary
      
      // Show insights
      if (insights && Object.keys(insights).length > 0) {
        resultsHTML += '<div class="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4"><h4 class="font-semibold text-orange-800 mb-2">📊 Insights</h4><ul class="space-y-1 text-sm">';
        for (const [key, value] of Object.entries(insights)) {
          resultsHTML += `<li><span class="text-gray-600">${key}:</span> <span class="font-medium text-gray-800">${value}</span></li>`;
        }
        resultsHTML += '</ul></div>';
      }
      
      // Show recommendations
      if (recommendations && recommendations.length > 0) {
        resultsHTML += '<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4"><h4 class="font-semibold text-blue-800 mb-2">💡 Recommendations</h4><ul class="space-y-1 text-sm list-disc list-inside">';
        recommendations.forEach(rec => {
          resultsHTML += `<li class="text-gray-700">${rec}</li>`;
        });
        resultsHTML += '</ul></div>';
      }
      
      // Show follow-up suggestions
      if (follow_up_suggestions && follow_up_suggestions.length > 0) {
        resultsHTML += '<div class="mt-4"><h4 class="text-sm font-semibold text-gray-700 mb-2">💬 Try asking:</h4><div class="flex flex-wrap gap-2">';
        follow_up_suggestions.forEach(suggestion => {
          resultsHTML += `<button onclick="askAI('${suggestion.replace(/'/g, "\\'")}')"; class="text-xs bg-white border border-gray-300 rounded-full px-3 py-1 hover:bg-orange-50 hover:border-orange-300 transition-colors">${suggestion}</button>`;
        });
        resultsHTML += '</div></div>';
      }
      
      document.getElementById('aiResultsContainer').innerHTML = resultsHTML;
      
      // Clear input after successful query
      input.value = '';
      
    } else {
      throw new Error(response.data.error || 'AI query failed');
    }
    
  } catch (error) {
    console.error('AI query error:', error);
    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('aiExplanation').textContent = 'Sorry, I encountered an error processing your question.';
    document.getElementById('aiResultsContainer').innerHTML = `<p class="text-red-600 text-sm">${error.response?.data?.error || error.message}</p>`;
    showNotification('AI query failed', 'error');
  }
}

// ============================================
// TOOLBAR DROPDOWN MENU
// ============================================

function toggleActionsDropdown() {
  const dropdown = document.getElementById('actionsDropdown');
  dropdown.classList.toggle('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('actionsDropdown');
  const button = e.target.closest('button[onclick*="toggleActionsDropdown"]');
  
  if (dropdown && !dropdown.contains(e.target) && !button) {
    dropdown.classList.add('hidden');
  }
});

// Expose globally
window.toggleActionsDropdown = toggleActionsDropdown;
