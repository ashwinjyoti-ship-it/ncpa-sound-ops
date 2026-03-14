// NCPA Sound Crew v4.1 - Enhanced Features
// Advanced Filtering, Conflict Detection, Bulk Operations, Dashboard

// ============================================
// STATE MANAGEMENT FOR V4.1 FEATURES
// ============================================

// Make functions globally accessible
window.v41Features = {};

let filterState = {
  venues: [],
  crews: [],
  teams: [],
  dateFrom: null,
  dateTo: null,
  hasRequirements: null,
  sortBy: 'event_date',
  sortOrder: 'ASC'
};

let bulkSelection = new Set(); // Selected event IDs for bulk operations
let conflictCache = {}; // Cache detected conflicts

console.log('🚀 v4.1 Features: Loading...');

// ============================================
// 1. ADVANCED FILTERING UI
// ============================================

function initializeFilters() {
  console.log('🔧 initializeFilters: Starting...');
  
  // Check if already exists
  if (document.getElementById('filterPanel')) {
    console.log('✅ Filter panel already exists');
    return;
  }
  
  // Create filter panel HTML
  const filterPanel = document.createElement('div');
  filterPanel.id = 'filterPanel';
  filterPanel.className = 'bg-white rounded-lg shadow-md p-4 mb-4 hidden';
  filterPanel.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold text-gray-800">
        <i class="fas fa-filter mr-2"></i>Advanced Filters
      </h3>
      <button onclick="closeFilterPanel()" class="text-gray-500 hover:text-gray-700">
        <i class="fas fa-times"></i>
      </button>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Venue Filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Venue</label>
        <select id="filterVenue" multiple class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" style="height: 80px;">
          <option value="">All Venues</option>
        </select>
      </div>
      
      <!-- Crew Filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Crew</label>
        <select id="filterCrew" multiple class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" style="height: 80px;">
          <option value="">All Crew</option>
        </select>
      </div>
      
      <!-- Team Filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Team</label>
        <select id="filterTeam" multiple class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" style="height: 80px;">
          <option value="">All Teams</option>
        </select>
      </div>
      
      <!-- Date Range -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">From Date</label>
        <input type="date" id="filterDateFrom" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      </div>
      
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">To Date</label>
        <input type="date" id="filterDateTo" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      </div>
      
      <!-- Requirements Filter -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Sound Requirements</label>
        <select id="filterRequirements" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All</option>
          <option value="true">Has Requirements</option>
          <option value="false">Missing Requirements</option>
        </select>
      </div>
    </div>
    
    <div class="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
      <button onclick="clearFilters()" class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
        <i class="fas fa-undo mr-1"></i>Clear Filters
      </button>
      <div class="space-x-2">
        <button onclick="applyFilters()" class="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600">
          <i class="fas fa-check mr-1"></i>Apply Filters
        </button>
      </div>
    </div>
    
    <div id="filterResults" class="mt-3 text-sm text-gray-600"></div>
  `;
  
  // Insert after tab navigation - with better error handling
  try {
    const container = document.querySelector('.container.mx-auto');
    if (!container) {
      console.error('❌ Container not found');
      // Fallback: insert at body
      document.body.insertBefore(filterPanel, document.body.firstChild);
      console.log('✅ Filter panel inserted at body (fallback)');
    } else {
      const tabNav = container.querySelector('.flex.justify-between.items-center.mb-6');
      if (!tabNav) {
        console.error('❌ Tab nav not found, trying alternative');
        // Try to insert after the first div
        container.insertBefore(filterPanel, container.children[1]);
        console.log('✅ Filter panel inserted (alternative)');
      } else {
        tabNav.parentNode.insertBefore(filterPanel, tabNav.nextSibling);
        console.log('✅ Filter panel inserted after tab nav');
      }
    }
    
    // Load filter options
    loadFilterOptions();
    console.log('✅ Filter initialization complete');
  } catch (error) {
    console.error('❌ Filter initialization error:', error);
  }
}

async function loadFilterOptions() {
  try {
    const response = await axios.get(`${API_BASE}/events/filter-options`);
    if (response.data.success) {
      const { venues, crews, teams } = response.data.data;
      
      // Populate venue dropdown
      const venueSelect = document.getElementById('filterVenue');
      // Clear existing options except "All Venues"
      while (venueSelect.options.length > 1) {
        venueSelect.remove(1);
      }
      venues.forEach(venue => {
        const option = document.createElement('option');
        option.value = venue;
        option.textContent = venue;
        venueSelect.appendChild(option);
      });
      
      // Populate crew dropdown
      const crewSelect = document.getElementById('filterCrew');
      // Clear existing options except "All Crew"
      while (crewSelect.options.length > 1) {
        crewSelect.remove(1);
      }
      crews.forEach(crew => {
        const option = document.createElement('option');
        option.value = crew;
        option.textContent = crew;
        crewSelect.appendChild(option);
      });
      
      // Populate team dropdown with STATIC standardized options (ignoring API teams)
      const teamSelect = document.getElementById('filterTeam');
      // Clear existing options except "All Teams"
      while (teamSelect.options.length > 1) {
        teamSelect.remove(1);
      }
      const standardTeams = [
        'Bruce/Team',
        'Dr.Rao/Team',
        'Dr.Swapno/Team',
        'Farrahnaz/Team',
        'Bianca/Team',
        'Dr.Sujata/Team',
        'Nooshin/Team',
        'DPAG',
        'DP',
        'Others'
      ];
      
      standardTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        teamSelect.appendChild(option);
      });
      
      console.log('✅ Filter options loaded: Venues:', venues.length, 'Crews:', crews.length, 'Teams: 10 (static)');
    }
  } catch (error) {
    console.error('Error loading filter options:', error);
  }
}

function toggleFilterPanel() {
  console.log('🔘 toggleFilterPanel called');
  const panel = document.getElementById('filterPanel');
  
  if (panel) {
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      console.log('✅ Filter panel opened');
    } else {
      panel.classList.add('hidden');
      console.log('✅ Filter panel closed');
    }
  } else {
    console.warn('⚠️ Filter panel not found! Initializing now...');
    try {
      initializeFilters();
      console.log('✅ Initialization attempted, trying again...');
      setTimeout(() => {
        const panelRetry = document.getElementById('filterPanel');
        if (panelRetry) {
          panelRetry.classList.remove('hidden');
          console.log('✅ Filter panel opened (after init)');
        } else {
          console.error('❌ Still cannot find filter panel after init');
          alert('Filter panel initialization failed. Please refresh the page.');
        }
      }, 100);
    } catch (error) {
      console.error('❌ Error during initialization:', error);
      alert('Error: ' + error.message);
    }
  }
}

// Expose globally
window.toggleFilterPanel = toggleFilterPanel;
console.log('✅ toggleFilterPanel exposed globally');

function closeFilterPanel() {
  document.getElementById('filterPanel').classList.add('hidden');
}

function clearFilters() {
  filterState = {
    venues: [],
    crews: [],
    teams: [],
    dateFrom: null,
    dateTo: null,
    hasRequirements: null,
    sortBy: 'event_date',
    sortOrder: 'ASC'
  };
  
  // Clear UI
  document.getElementById('filterVenue').selectedIndex = -1;
  document.getElementById('filterCrew').selectedIndex = -1;
  document.getElementById('filterTeam').selectedIndex = -1;
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterRequirements').value = '';
  document.getElementById('filterResults').textContent = '';
  
  // Reload all events
  loadEvents();
}

// Helper function to match team patterns
function matchesTeamPattern(eventTeam, selectedTeam) {
  if (!eventTeam) return false;
  const team = eventTeam.toString().trim();
  
  // Pattern matching based on standardized team names
  if (selectedTeam === 'Bruce/Team') {
    return team.startsWith('Bruce/');
  }
  if (selectedTeam === 'Dr.Rao/Team') {
    return team.startsWith('Dr.Rao/') || team.startsWith('Dr Rao/');
  }
  if (selectedTeam === 'Dr.Swapno/Team') {
    return team.startsWith('Dr.Swapno/') || team.startsWith('Dr Swapno/');
  }
  if (selectedTeam === 'Farrahnaz/Team') {
    return team.startsWith('Farrahnaz/');
  }
  if (selectedTeam === 'Bianca/Team') {
    return team.startsWith('Bianca');
  }
  if (selectedTeam === 'Dr.Sujata/Team') {
    // Matches Dr.Sujata/* AND Library
    return team.startsWith('Dr.Sujata/') || team.startsWith('Dr Sujata/') || team.startsWith('Library');
  }
  if (selectedTeam === 'Nooshin/Team') {
    // Matches Nooshin/* AND Corporate/*
    return team.startsWith('Nooshin/') || team.startsWith('Corporate/');
  }
  if (selectedTeam === 'DPAG') {
    return team === 'DPAG';
  }
  if (selectedTeam === 'DP') {
    return team === 'DP';
  }
  if (selectedTeam === 'Others') {
    // None of the above patterns - catch-all
    return !(
      team.startsWith('Bruce/') ||
      team.startsWith('Dr.Rao/') || team.startsWith('Dr Rao/') ||
      team.startsWith('Dr.Swapno/') || team.startsWith('Dr Swapno/') ||
      team.startsWith('Farrahnaz/') ||
      team.startsWith('Bianca') ||
      team.startsWith('Dr.Sujata/') || team.startsWith('Dr Sujata/') || team.startsWith('Library') ||
      team.startsWith('Nooshin/') || team.startsWith('Corporate/') ||
      team === 'DPAG' ||
      team === 'DP'
    );
  }
  
  return false;
}

async function applyFilters() {
  // Read filter values
  const venueSelect = document.getElementById('filterVenue');
  filterState.venues = Array.from(venueSelect.selectedOptions).map(o => o.value);
  
  const crewSelect = document.getElementById('filterCrew');
  filterState.crews = Array.from(crewSelect.selectedOptions).map(o => o.value);
  
  const teamSelect = document.getElementById('filterTeam');
  const selectedTeams = Array.from(teamSelect.selectedOptions).map(o => o.value);
  
  filterState.dateFrom = document.getElementById('filterDateFrom').value || null;
  filterState.dateTo = document.getElementById('filterDateTo').value || null;
  
  const reqValue = document.getElementById('filterRequirements').value;
  filterState.hasRequirements = reqValue === 'true' ? true : (reqValue === 'false' ? false : null);
  
  try {
    // First, get all events with venue/crew/date/requirements filters
    // We'll handle team filtering client-side for pattern matching
    const backendFilterState = {
      venues: filterState.venues,
      crews: filterState.crews,
      teams: [], // Empty - we'll filter client-side
      dateFrom: filterState.dateFrom,
      dateTo: filterState.dateTo,
      hasRequirements: filterState.hasRequirements,
      sortBy: filterState.sortBy,
      sortOrder: filterState.sortOrder
    };
    
    const response = await axios.post(`${API_BASE}/events/filter`, backendFilterState);
    if (response.data.success) {
      let filteredEvents = response.data.data;
      
      // Apply client-side team pattern matching
      if (selectedTeams.length > 0) {
        filteredEvents = filteredEvents.filter(event => {
          return selectedTeams.some(selectedTeam => matchesTeamPattern(event.team, selectedTeam));
        });
      }
      
      allEvents = filteredEvents;
      renderCurrentView();
      
      // Show results message
      document.getElementById('filterResults').textContent = 
        `Found ${filteredEvents.length} event(s) matching filters`;
    }
  } catch (error) {
    console.error('Error applying filters:', error);
    showNotification('Failed to apply filters', 'error');
  }
}

// ============================================
// 2. CONFLICT DETECTION UI
// ============================================

async function checkConflicts() {
  console.log('🔍 Checking conflicts...');
  
  // Get date range for current month view or whole dataset
  const today = new Date();
  const dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const dateTo = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().split('T')[0];
  
  try {
    if (typeof showNotification === 'function') {
      showNotification('Checking for conflicts...', 'info');
    }
    
    const response = await axios.get(`${API_BASE}/conflicts/detect`, {
      params: { from: dateFrom, to: dateTo }
    });
    
    console.log('✅ Conflicts API response:', response.data);
    
    if (response.data.success) {
      const { conflicts, totalEvents, conflictCount } = response.data.data;
      conflictCache = conflicts;
      
      if (conflictCount === 0) {
        if (typeof showNotification === 'function') {
          showNotification('✅ No conflicts detected!', 'success');
        } else {
          alert('✅ No conflicts detected!');
        }
      } else {
        showConflictsModal(conflicts, totalEvents);
      }
    }
  } catch (error) {
    console.error('❌ Error checking conflicts:', error);
    alert('Failed to check conflicts: ' + error.message);
  }
}

// Expose globally
window.checkConflicts = checkConflicts;

// ============================================
// SHORT NOTICE DETECTION
// ============================================

async function checkShortNotice() {
  console.log('⏰ Checking short notice events...');
  
  // Get current month
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  
  // Date range for current month
  const dateFrom = new Date(year, month, 1).toISOString().split('T')[0];
  const dateTo = new Date(year, month + 1, 0).toISOString().split('T')[0];
  
  try {
    if (typeof showNotification === 'function') {
      showNotification('Analyzing short notice events...', 'info');
    }
    
    // Fetch all events for current month
    const response = await axios.post(`${API_BASE}/events/filter`, {
      dateFrom,
      dateTo
    });
    
    console.log('✅ Events fetched:', response.data);
    
    if (response.data.success) {
      const events = response.data.data;
      
      // Analyze short notice events
      const analysis = analyzeShortNotice(events, year, month);
      
      if (analysis.total === 0) {
        if (typeof showNotification === 'function') {
          showNotification('✅ No short notice events found!', 'success');
        } else {
          alert('✅ No short notice events found!');
        }
      } else {
        showShortNoticeModal(analysis, monthStr);
      }
    }
  } catch (error) {
    console.error('❌ Error checking short notice:', error);
    alert('Failed to check short notice: ' + error.message);
  }
}

function analyzeShortNotice(events, year, month) {
  const results = {
    addedAfter5th: [],
    lessThan10Days: [],
    critical: [], // <3 days
    warning: [], // 3-7 days
    total: 0
  };
  
  events.forEach(event => {
    const eventDate = new Date(event.event_date);
    const createdDate = new Date(event.created_at);
    
    // Calculate days difference
    const daysDiff = Math.floor((eventDate - createdDate) / (1000 * 60 * 60 * 24));
    
    // Check if created after 5th
    const createdDay = createdDate.getDate();
    const createdMonth = createdDate.getMonth();
    const eventMonth = eventDate.getMonth();
    
    const isAddedAfter5th = (createdMonth === eventMonth && createdDay > 5);
    
    // Check if less than 10 days notice
    const isShortNotice = daysDiff < 10;
    
    if (isShortNotice || isAddedAfter5th) {
      const eventData = {
        ...event,
        daysDiff,
        createdDay,
        isAddedAfter5th,
        isShortNotice,
        severity: daysDiff < 3 ? 'critical' : (daysDiff < 7 ? 'warning' : 'short')
      };
      
      if (isAddedAfter5th) {
        results.addedAfter5th.push(eventData);
      }
      
      if (isShortNotice) {
        results.lessThan10Days.push(eventData);
        
        if (daysDiff < 3) {
          results.critical.push(eventData);
        } else if (daysDiff < 7) {
          results.warning.push(eventData);
        }
      }
    }
  });
  
  results.total = Math.max(results.addedAfter5th.length, results.lessThan10Days.length);
  
  return results;
}

function showShortNoticeModal(analysis, monthStr) {
  const monthName = new Date(monthStr + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content max-w-5xl">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-yellow-600">
          <i class="fas fa-clock mr-2"></i>
          Short Notice Events - ${monthName}
        </h2>
        <button onclick="this.closest('.modal').remove()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div class="text-2xl font-bold text-red-700">${analysis.critical.length}</div>
          <div class="text-sm text-red-600">Critical (&lt;3 days)</div>
        </div>
        <div class="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
          <div class="text-2xl font-bold text-orange-700">${analysis.warning.length}</div>
          <div class="text-sm text-orange-600">Warning (3-7 days)</div>
        </div>
        <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
          <div class="text-2xl font-bold text-yellow-700">${analysis.lessThan10Days.length}</div>
          <div class="text-sm text-yellow-600">&lt;10 days notice</div>
        </div>
        <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
          <div class="text-2xl font-bold text-blue-700">${analysis.addedAfter5th.length}</div>
          <div class="text-sm text-blue-600">Added after 5th</div>
        </div>
      </div>
      
      <!-- Tabs -->
      <div class="border-b border-gray-300 mb-4">
        <div class="flex space-x-4">
          <button onclick="switchShortNoticeTab('lessThan10')" id="tab-lessThan10" class="px-4 py-2 font-semibold border-b-2 border-yellow-500 text-yellow-600">
            &lt;10 Days Notice (${analysis.lessThan10Days.length})
          </button>
          <button onclick="switchShortNoticeTab('after5th')" id="tab-after5th" class="px-4 py-2 font-semibold text-gray-600 hover:text-gray-800">
            Added After 5th (${analysis.addedAfter5th.length})
          </button>
        </div>
      </div>
      
      <!-- Content -->
      <div id="shortNoticeContent" class="space-y-3 max-h-96 overflow-y-auto">
        ${renderShortNoticeEvents(analysis.lessThan10Days)}
      </div>
      
      <!-- Actions -->
      <div class="flex justify-between mt-6 pt-4 border-t border-gray-200">
        <button onclick="exportShortNotice(${JSON.stringify(analysis).replace(/"/g, '&quot;')}, '${monthStr}')" 
                class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
          <i class="fas fa-file-download mr-2"></i>Export Report
        </button>
        <button onclick="this.closest('.modal').remove()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
          Close
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Store analysis for tab switching
  window.shortNoticeAnalysis = analysis;
}

function renderShortNoticeEvents(events) {
  if (events.length === 0) {
    return '<div class="text-center py-8 text-gray-500">No events found</div>';
  }
  
  return events
    .sort((a, b) => a.daysDiff - b.daysDiff) // Sort by days notice (shortest first)
    .map(event => {
      const severityColor = event.severity === 'critical' ? 'red' : 
                           event.severity === 'warning' ? 'orange' : 'yellow';
      const severityIcon = event.severity === 'critical' ? '🔴' : 
                          event.severity === 'warning' ? '🟠' : '🟡';
      
      return `
        <div class="p-4 rounded-lg bg-${severityColor}-50 border-l-4 border-${severityColor}-500">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">${severityIcon}</span>
                <div>
                  <div class="font-semibold text-lg text-gray-800">${event.program}</div>
                  <div class="text-sm text-gray-600">
                    <i class="fas fa-map-marker-alt mr-1"></i>${event.venue}
                    ${event.crew ? `<span class="ml-3"><i class="fas fa-users mr-1"></i>${event.crew}</span>` : ''}
                  </div>
                </div>
              </div>
              
              <div class="grid grid-cols-3 gap-4 text-sm mt-3">
                <div class="bg-white p-2 rounded">
                  <div class="text-gray-500">Event Date</div>
                  <div class="font-semibold text-gray-800">${new Date(event.event_date).toLocaleDateString()}</div>
                </div>
                <div class="bg-white p-2 rounded">
                  <div class="text-gray-500">Created Date</div>
                  <div class="font-semibold text-gray-800">${new Date(event.created_at).toLocaleDateString()}</div>
                </div>
                <div class="bg-white p-2 rounded">
                  <div class="text-gray-500">Notice Period</div>
                  <div class="font-bold text-${severityColor}-700">${event.daysDiff} days</div>
                </div>
              </div>
              
              ${event.isAddedAfter5th ? `
                <div class="mt-2 text-sm text-blue-700">
                  <i class="fas fa-info-circle mr-1"></i>
                  Added on day ${event.createdDay} of the month
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
}

function switchShortNoticeTab(tab) {
  // Update tab styles
  document.getElementById('tab-lessThan10').className = 'px-4 py-2 font-semibold text-gray-600 hover:text-gray-800';
  document.getElementById('tab-after5th').className = 'px-4 py-2 font-semibold text-gray-600 hover:text-gray-800';
  
  const activeTab = document.getElementById(`tab-${tab}`);
  activeTab.className = 'px-4 py-2 font-semibold border-b-2 border-yellow-500 text-yellow-600';
  
  // Update content
  const content = document.getElementById('shortNoticeContent');
  const analysis = window.shortNoticeAnalysis;
  
  if (tab === 'lessThan10') {
    content.innerHTML = renderShortNoticeEvents(analysis.lessThan10Days);
  } else {
    content.innerHTML = renderShortNoticeEvents(analysis.addedAfter5th);
  }
}

function exportShortNotice(analysis, monthStr) {
  const monthName = new Date(monthStr + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  // Combine all events (deduplicate)
  const allEvents = new Map();
  
  [...analysis.lessThan10Days, ...analysis.addedAfter5th].forEach(event => {
    allEvents.set(event.id, event);
  });
  
  // Create CSV
  const headers = ['Event Date', 'Program', 'Venue', 'Crew', 'Created Date', 'Days Notice', 'Status', 'Added After 5th'];
  const rows = Array.from(allEvents.values())
    .sort((a, b) => a.daysDiff - b.daysDiff)
    .map(event => [
      new Date(event.event_date).toLocaleDateString(),
      event.program,
      event.venue,
      event.crew || 'Not assigned',
      new Date(event.created_at).toLocaleDateString(),
      event.daysDiff + ' days',
      event.severity === 'critical' ? 'Critical' : event.severity === 'warning' ? 'Warning' : 'Short',
      event.isAddedAfter5th ? 'Yes' : 'No'
    ]);
  
  const csv = [headers, ...rows].map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `short-notice-events-${monthStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  if (typeof showNotification === 'function') {
    showNotification('✅ Short notice report exported!', 'success');
  }
}

// Expose globally
window.checkShortNotice = checkShortNotice;
window.switchShortNoticeTab = switchShortNoticeTab;
window.exportShortNotice = exportShortNotice;

function showConflictsModal(conflicts, totalEvents) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content max-w-4xl">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-red-600">
          <i class="fas fa-exclamation-triangle mr-2"></i>
          Conflicts Detected (${conflicts.length})
        </h2>
        <button onclick="this.closest('.modal').remove()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      
      <p class="text-gray-600 mb-4">
        Found ${conflicts.length} conflict(s) in ${totalEvents} events. Review and resolve:
      </p>
      
      <div class="space-y-4 max-h-96 overflow-y-auto">
        ${conflicts.map((conflict, idx) => `
          <div class="p-4 rounded-lg ${conflict.severity === 'error' ? 'bg-red-50 border-l-4 border-red-500' : 'bg-yellow-50 border-l-4 border-yellow-500'}">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="font-semibold text-lg mb-2">
                  ${conflict.severity === 'error' ? '🔴' : '⚠️'} ${conflict.type.replace('_', ' ').toUpperCase()}
                </div>
                <p class="text-gray-700 mb-2">${conflict.message}</p>
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div class="bg-white p-2 rounded">
                    <div class="font-semibold text-gray-800">Event 1:</div>
                    <div class="text-gray-600">${conflict.event1.program}</div>
                    <div class="text-gray-500">${conflict.event1.venue}</div>
                  </div>
                  <div class="bg-white p-2 rounded">
                    <div class="font-semibold text-gray-800">Event 2:</div>
                    <div class="text-gray-600">${conflict.event2.program}</div>
                    <div class="text-gray-500">${conflict.event2.venue}</div>
                  </div>
                </div>
                ${conflict.overlappingCrew ? `
                  <div class="mt-2 text-sm text-gray-700">
                    <strong>Overlapping Crew:</strong> ${conflict.overlappingCrew.join(', ')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="flex justify-end mt-6 pt-4 border-t border-gray-200">
        <button onclick="this.closest('.modal').remove()" class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
          Close
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// ============================================
// 3. BULK OPERATIONS UI
// ============================================

function initializeBulkOperations() {
  // Add bulk action bar to table view
  const bulkBar = document.createElement('div');
  bulkBar.id = 'bulkActionBar';
  bulkBar.className = 'bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 hidden';
  bulkBar.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <span class="text-blue-700 font-semibold">
          <i class="fas fa-check-circle mr-2"></i>
          <span id="bulkSelectedCount">0</span> event(s) selected
        </span>
        <button onclick="clearBulkSelection()" class="text-sm text-blue-600 hover:text-blue-800">
          Clear Selection
        </button>
      </div>
      
      <div class="flex items-center space-x-2">
        <button onclick="bulkAssignCrew()" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <i class="fas fa-users mr-1"></i>Assign Crew
        </button>
        <button onclick="bulkChangeStatus()" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">
          <i class="fas fa-tag mr-1"></i>Change Status
        </button>
        <button onclick="bulkExportSelected()" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
          <i class="fas fa-file-export mr-1"></i>Export Selected
        </button>
        <button onclick="bulkDeleteSelected()" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
          <i class="fas fa-trash mr-1"></i>Delete
        </button>
      </div>
    </div>
  `;
  
  // Insert into table view
  const tableView = document.getElementById('tableView');
  tableView.insertBefore(bulkBar, tableView.firstChild.nextSibling);
  
  // Add select all checkbox to table header
  addBulkSelectCheckboxes();
}

function addBulkSelectCheckboxes() {
  // This will be called when rendering table to add checkboxes
  // Implementation in renderTable modification
}

function toggleBulkSelect(eventId, checked) {
  if (checked) {
    bulkSelection.add(eventId);
  } else {
    bulkSelection.delete(eventId);
  }
  
  updateBulkActionBar();
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionBar');
  const count = document.getElementById('bulkSelectedCount');
  
  if (bulkSelection.size > 0) {
    bar.classList.remove('hidden');
    count.textContent = bulkSelection.size;
  } else {
    bar.classList.add('hidden');
  }
}

function clearBulkSelection() {
  bulkSelection.clear();
  document.querySelectorAll('.bulk-select-checkbox').forEach(cb => cb.checked = false);
  updateBulkActionBar();
}

async function bulkAssignCrew() {
  if (bulkSelection.size === 0) return;
  
  // Get first event to determine venue for smart suggestions
  const firstEventId = Array.from(bulkSelection)[0];
  const firstEvent = allEvents.find(e => e.id === firstEventId);
  
  // Get smart suggestions
  let suggestions = [];
  try {
    const response = await axios.post(`${API_BASE}/crew/suggestions`, {
      venue: firstEvent.venue,
      date: firstEvent.event_date
    });
    
    if (response.data.success) {
      suggestions = response.data.data.suggestions;
    }
  } catch (error) {
    console.error('Error getting crew suggestions:', error);
  }
  
  // Show modal with suggestions
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-gray-800">
          <i class="fas fa-users mr-2"></i>
          Bulk Assign Crew (${bulkSelection.size} events)
        </h2>
        <button onclick="this.closest('.modal').remove()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      
      ${suggestions.length > 0 ? `
        <div class="mb-4 p-4 bg-blue-50 rounded-lg">
          <h3 class="font-semibold text-blue-800 mb-2">
            <i class="fas fa-lightbulb mr-2"></i>Smart Suggestions for ${firstEvent.venue}:
          </h3>
          <div class="grid grid-cols-2 gap-2">
            ${suggestions.map(s => `
              <button onclick="document.getElementById('bulkCrewInput').value='${s.name}'; this.style.background='#10b981'; this.style.color='white';" 
                      class="px-3 py-2 text-left bg-white rounded border border-blue-200 hover:bg-blue-100 transition-all">
                <div class="font-semibold">${s.name}</div>
                <div class="text-xs text-gray-600">
                  ${s.confidence}% confidence • ${s.assignmentCount} past assignments
                </div>
              </button>
            `).join('')}
          </div>
          <p class="text-xs text-blue-600 mt-2">
            <i class="fas fa-info-circle mr-1"></i>
            Click a suggestion to use it, or type custom crew names below
          </p>
        </div>
      ` : ''}
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Crew Assignment (comma-separated for multiple):
        </label>
        <input type="text" id="bulkCrewInput" 
               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
               placeholder="e.g., Ashwin, Naren, Sandeep">
        <p class="text-xs text-gray-500 mt-1">
          This will replace existing crew assignments for all selected events
        </p>
      </div>
      
      <div class="flex justify-end space-x-3">
        <button onclick="this.closest('.modal').remove()" 
                class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
          Cancel
        </button>
        <button onclick="confirmBulkAssign()" 
                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <i class="fas fa-check mr-1"></i>Assign to ${bulkSelection.size} Events
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function confirmBulkAssign() {
  const crew = document.getElementById('bulkCrewInput').value.trim();
  
  if (!crew) {
    showNotification('Please enter crew names', 'error');
    return;
  }
  
  try {
    const response = await axios.post(`${API_BASE}/events/bulk-assign`, {
      eventIds: Array.from(bulkSelection),
      crew: crew
    });
    
    if (response.data.success) {
      showNotification(`✅ Assigned crew to ${response.data.updatedCount} events`, 'success');
      document.querySelector('.modal.active').remove();
      clearBulkSelection();
      loadEvents(); // Reload to see changes
    }
  } catch (error) {
    console.error('Error bulk assigning crew:', error);
    showNotification('Failed to assign crew', 'error');
  }
}

async function bulkChangeStatus() {
  if (bulkSelection.size === 0) return;
  
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-gray-800">
          <i class="fas fa-tag mr-2"></i>
          Change Status (${bulkSelection.size} events)
        </h2>
        <button onclick="this.closest('.modal').remove()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">New Status:</label>
        <select id="bulkStatusSelect" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
          <option value="draft">Draft</option>
          <option value="confirmed" selected>Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      
      <div class="flex justify-end space-x-3">
        <button onclick="this.closest('.modal').remove()" 
                class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
          Cancel
        </button>
        <button onclick="confirmBulkStatus()" 
                class="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
          Update Status
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function confirmBulkStatus() {
  const status = document.getElementById('bulkStatusSelect').value;
  
  try {
    const response = await axios.post(`${API_BASE}/events/update-status`, {
      eventIds: Array.from(bulkSelection),
      status: status
    });
    
    if (response.data.success) {
      showNotification(response.data.message, 'success');
      document.querySelector('.modal.active').remove();
      clearBulkSelection();
      loadEvents();
    }
  } catch (error) {
    console.error('Error changing status:', error);
    showNotification('Failed to change status', 'error');
  }
}

function bulkExportSelected() {
  if (bulkSelection.size === 0) return;
  
  // Export selected events as CSV
  const selectedEvents = allEvents.filter(e => bulkSelection.has(e.id));
  exportEventsToCSV(selectedEvents, 'selected_events');
  showNotification(`Exported ${bulkSelection.size} events`, 'success');
}

async function bulkDeleteSelected() {
  if (bulkSelection.size === 0) return;
  
  if (!confirm(`Are you sure you want to delete ${bulkSelection.size} event(s)? This cannot be undone.`)) {
    return;
  }
  
  try {
    const deletePromises = Array.from(bulkSelection).map(id => 
      axios.delete(`${API_BASE}/events/${id}`)
    );
    
    await Promise.all(deletePromises);
    
    showNotification(`Deleted ${bulkSelection.size} events`, 'success');
    clearBulkSelection();
    loadEvents();
  } catch (error) {
    console.error('Error deleting events:', error);
    showNotification('Failed to delete some events', 'error');
  }
}

// ============================================
// 4. DASHBOARD VIEW
// ============================================

function showDashboard() {
  // Create dashboard tab if it doesn't exist
  let dashboardTab = document.getElementById('dashboardTab');
  if (!dashboardTab) {
    const tabContainer = document.querySelector('.flex.space-x-6.border-b');
    dashboardTab = document.createElement('button');
    dashboardTab.id = 'dashboardTab';
    dashboardTab.className = 'px-4 py-2 font-semibold text-gray-600 hover:text-gray-800 transition-all';
    dashboardTab.innerHTML = '<i class="fas fa-chart-line mr-2"></i>Dashboard';
    dashboardTab.onclick = () => showTab('dashboard');
    tabContainer.insertBefore(dashboardTab, tabContainer.children[2]);
  }
  
  // Create dashboard view if it doesn't exist
  let dashboardView = document.getElementById('dashboardView');
  if (!dashboardView) {
    dashboardView = document.createElement('div');
    dashboardView.id = 'dashboardView';
    dashboardView.className = 'bg-white rounded-lg shadow-lg p-6';
    dashboardView.style.display = 'none';
    
    // Add loading placeholder
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'dashboardLoading';
    dashboardView.appendChild(loadingDiv);
    
    const container = document.querySelector('.container.mx-auto');
    container.appendChild(dashboardView);
  }
  
  // Load dashboard data
  loadDashboardData();
}

async function loadDashboardData(period = 'current_month', venueMonth = null) {
  const dashboardView = document.getElementById('dashboardView');
  const loadingPlaceholder = document.getElementById('dashboardLoading');
  if (loadingPlaceholder) {
    loadingPlaceholder.innerHTML = '<div class="text-center py-12"><i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i></div>';
  }
  
  try {
    const today = new Date();
    let dateFrom, dateTo;
    
    if (period === 'current_month') {
      // Current month only
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      dateFrom = firstOfMonth.toISOString().split('T')[0];
      dateTo = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (period === 'last_3_months') {
      // Last 3 months
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      dateFrom = threeMonthsAgo.toISOString().split('T')[0];
      dateTo = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
    
    // ALWAYS default venue month to current month if not specified
    // This ensures the dropdown always starts at current month
    if (!venueMonth || venueMonth === 'null' || venueMonth === 'undefined') {
      venueMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
    }
    
    // Fetch main dashboard stats
    const statsResponse = await axios.get(`${API_BASE}/dashboard/stats`, {
      params: { from: dateFrom, to: dateTo }
    });
    
    // Fetch venue stats for selected month
    const venueResponse = await axios.get(`${API_BASE}/dashboard/venue-stats`, {
      params: { month: venueMonth }
    });
    
    // Fetch AI confidence data
    const aiConfidenceResponse = await axios.get(`${API_BASE}/crew/ai-confidence`);
    
    if (statsResponse.data.success && venueResponse.data.success && aiConfidenceResponse.data.success) {
      renderDashboard({
        ...statsResponse.data.data,
        venueStats: venueResponse.data.data,
        aiConfidence: aiConfidenceResponse.data.data
      }, period, venueMonth);
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
    if (loadingPlaceholder) {
      loadingPlaceholder.innerHTML = '<div class="text-center py-12 text-red-600">Failed to load dashboard data</div>';
    }
  }
}

function renderDashboard(data, period = 'current_month', venueMonth = null) {
  const dashboardView = document.getElementById('dashboardView');
  const loadingPlaceholder = document.getElementById('dashboardLoading');
  
  // Generate month/year options for venue selector (6 months back, current month only - no future)
  const today = new Date();
  const monthOptions = [];
  for (let i = -6; i <= 0; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const value = date.toISOString().slice(0, 7);
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    monthOptions.push({ value, label, selected: value === (venueMonth || today.toISOString().slice(0, 7)) });
  }
  
  const html = `
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-gray-800">
        <i class="fas fa-chart-line mr-2"></i>Dashboard Overview
      </h2>
      <div>
        <label class="text-sm text-gray-600 mr-2">Crew Workload Period:</label>
        <select id="periodSelector" class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-600">
          <option value="current_month" ${period === 'current_month' ? 'selected' : ''}>Current Month</option>
          <option value="last_3_months" ${period === 'last_3_months' ? 'selected' : ''}>Last 3 Months</option>
        </select>
      </div>
    </div>
    
    <!-- Key Metrics -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-lg shadow-md">
        <div class="text-sm font-semibold mb-1">Total Events</div>
        <div class="text-3xl font-bold">${data.total}</div>
        <div class="text-xs mt-2 opacity-90">This month + 90 days</div>
      </div>
      
      <div class="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg shadow-md">
        <div class="text-sm font-semibold mb-1">Upcoming (7 days)</div>
        <div class="text-3xl font-bold">${data.upcomingEvents.length}</div>
        <div class="text-xs mt-2 opacity-90">Events this week</div>
      </div>
      
      <div class="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white p-6 rounded-lg shadow-md">
        <div class="text-sm font-semibold mb-1">Needs Requirements</div>
        <div class="text-3xl font-bold">${data.needsRequirements}</div>
        <div class="text-xs mt-2 opacity-90">Missing sound setup</div>
      </div>
      
      <div class="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-lg shadow-md">
        <div class="text-sm font-semibold mb-1">Active Venues</div>
        <div class="text-3xl font-bold">${data.venueDistribution.length}</div>
        <div class="text-xs mt-2 opacity-90">With scheduled events</div>
      </div>
    </div>
    
    <!-- Charts -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- Shows Per Venue (with month/year selector) -->
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold text-gray-800">
            <i class="fas fa-map-marker-alt mr-2"></i>Shows Per Venue
          </h3>
          <select id="venueMonthSelector" class="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-yellow-600">
            ${monthOptions.map(opt => `
              <option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.label}</option>
            `).join('')}
          </select>
        </div>
        <div class="space-y-3">
          ${data.venueStats && data.venueStats.venues && data.venueStats.venues.length > 0 ? 
            data.venueStats.venues.slice(0, 7).map((v, idx) => `
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-gray-700 font-medium">${idx + 1}. ${v.venue}</span>
                  <span class="text-gray-600 font-semibold">${v.count} events</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2.5">
                  <div class="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all" style="width: ${v.percentage}%"></div>
                </div>
              </div>
            `).join('') : 
            '<p class="text-gray-500 text-center py-4">No events in selected month</p>'
          }
        </div>
        ${data.venueStats && data.venueStats.total > 0 ? `
          <div class="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
            Total: <span class="font-semibold">${data.venueStats.total} events</span> in ${data.venueStats.month}
          </div>
        ` : ''}
      </div>
      
      <!-- Individual Crew Workload -->
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">
          <i class="fas fa-users mr-2"></i>Individual Crew Workload
        </h3>
        
        <!-- Workload Summary -->
        <div class="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
          <div class="flex justify-between mb-2">
            <span class="text-gray-600">Average:</span>
            <span class="font-semibold">${data.crewWorkloadStats.average} events</span>
          </div>
          ${data.crewWorkloadStats.overloaded.length > 0 ? `
            <div class="flex justify-between mb-1">
              <span class="text-red-600">⚠️ Overloaded:</span>
              <span class="font-medium text-red-600">${data.crewWorkloadStats.overloaded.join(', ')}</span>
            </div>
          ` : ''}
          ${data.crewWorkloadStats.underutilized.length > 0 ? `
            <div class="flex justify-between">
              <span class="text-blue-600">💡 Available:</span>
              <span class="font-medium text-blue-600">${data.crewWorkloadStats.underutilized.join(', ')}</span>
            </div>
          ` : ''}
        </div>
        
        <!-- Individual Crew List -->
        <div class="space-y-2">
          ${data.crewWorkload.slice(0, 10).map((c, idx) => {
            const statusColor = c.status === 'overloaded' ? 'text-red-600' : 
                               c.status === 'underutilized' ? 'text-blue-600' : 
                               'text-green-600';
            const statusIcon = c.status === 'overloaded' ? '⚠️' : 
                              c.status === 'underutilized' ? '💡' : 
                              '✓';
            return `
            <div class="flex justify-between items-center py-2 border-b border-gray-100">
              <span class="text-sm font-medium text-gray-700">
                ${idx + 1}. ${c.crew}
              </span>
              <span class="text-sm font-semibold ${statusColor}">
                ${statusIcon} ${c.count} events
              </span>
            </div>
          `}).join('')}
        </div>
      </div>
    </div>
    
    <!-- Missing Sound Requirements (Next 4 Days) -->
    <div class="bg-white border border-red-100 rounded-lg p-6 mb-6">
      <h3 class="text-lg font-semibold text-red-600 mb-4">
        <i class="fas fa-exclamation-triangle mr-2"></i>
        Missing Sound Requirements (Next 4 Days)
      </h3>
      ${data.missingSoundNext4Days && data.missingSoundNext4Days.length === 0 ? `
        <p class="text-green-600 text-center py-8">
          <i class="fas fa-check-circle mr-2"></i>
          All upcoming events have sound requirements defined
        </p>
      ` : `
        <div class="space-y-3">
          ${data.missingSoundNext4Days.map(e => `
            <div class="bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-red-500 p-4 rounded cursor-pointer hover:shadow-md transition-all" 
                 onclick="openEditModal(${e.id})">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <div class="font-semibold text-gray-800 mb-1">
                    ${formatDate(e.event_date)} - ${e.venue}
                  </div>
                  <div class="text-gray-700">${e.program}</div>
                  ${e.crew ? `<div class="text-sm text-gray-600 mt-1">Crew: ${e.crew}</div>` : ''}
                </div>
                <div class="text-red-600 ml-4">
                  <i class="fas fa-edit text-xl"></i>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <i class="fas fa-info-circle mr-2"></i>
          <strong>${data.missingSoundNext4Days.length} event(s)</strong> need sound requirements urgently. Click to edit.
        </div>
      `}
    </div>
    
    <!-- AI Confidence Section -->
    <div class="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">
        <i class="fas fa-brain mr-2 text-purple-600"></i>
        AI Assignment Confidence
      </h3>
      
      <!-- Overall Confidence -->
      <div class="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
        <div class="flex justify-between items-center mb-2">
          <span class="text-gray-700 font-semibold">Overall System:</span>
          <span class="text-3xl font-bold ${data.aiConfidence.overall.confidence >= 85 ? 'text-green-600' : data.aiConfidence.overall.confidence >= 70 ? 'text-blue-600' : 'text-orange-600'}">
            ${data.aiConfidence.overall.confidence}%
            ${data.aiConfidence.overall.status === 'ready' ? '✅' : data.aiConfidence.overall.status === 'good' ? '👍' : '📚'}
          </span>
        </div>
        <div class="text-sm text-gray-600 space-y-1">
          <div>📊 ${data.aiConfidence.overall.totalAssignments} assignments analyzed</div>
          <div>📅 ${data.aiConfidence.overall.daysOfLearning} days of learning</div>
          <div class="font-medium ${data.aiConfidence.overall.status === 'ready' ? 'text-green-600' : 'text-blue-600'}">
            ${data.aiConfidence.overall.status === 'ready' ? '✅ System ready for automatic assignments!' : '📚 System is learning - use with manual review'}
          </div>
        </div>
      </div>
      
      <!-- Venue-by-Venue Confidence -->
      <div class="space-y-2">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">Confidence by Venue:</h4>
        ${data.aiConfidence.byVenue.map(v => {
          const confidenceColor = v.confidence >= 85 ? 'text-green-600' : 
                                  v.confidence >= 70 ? 'text-blue-600' : 
                                  v.confidence >= 50 ? 'text-yellow-600' : 'text-red-600';
          const icon = v.status === 'ready' ? '✅' : 
                       v.status === 'good' ? '✅' : 
                       v.status === 'learning' ? '⚠️' : '❌';
          const statusText = v.status === 'ready' ? 'Ready' :
                            v.status === 'good' ? 'Good' :
                            v.status === 'learning' ? 'Learning' : 'Needs Data';
          return `
            <div class="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
              <div class="flex items-center">
                <span class="font-medium text-gray-700 mr-2">${v.venue}</span>
                <span class="text-xs text-gray-500">(${v.assignments} assignments)</span>
              </div>
              <div class="flex items-center">
                <span class="text-sm font-semibold ${confidenceColor} mr-2">
                  ${v.confidence}%
                </span>
                <span class="text-sm">${icon}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <!-- Learning Progress -->
      ${data.aiConfidence.nextGoal.remaining > 0 ? `
        <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <div class="flex justify-between items-center mb-2">
            <span class="text-blue-800 font-medium">🎯 Next Goal:</span>
            <span class="text-blue-900 font-semibold">${data.aiConfidence.nextGoal.target} assignments → ${data.aiConfidence.nextGoal.targetConfidence}% confidence</span>
          </div>
          <div class="w-full bg-blue-200 rounded-full h-2">
            <div class="bg-blue-600 h-2 rounded-full transition-all" style="width: ${(data.aiConfidence.nextGoal.current / data.aiConfidence.nextGoal.target * 100)}%"></div>
          </div>
          <div class="text-xs text-blue-700 mt-1">
            ${data.aiConfidence.nextGoal.remaining} more assignments needed
          </div>
        </div>
      ` : ''}
    </div>
    
    <!-- Status Breakdown -->
    ${data.statusBreakdown.length > 0 ? `
      <div class="bg-white border border-gray-200 rounded-lg p-6 mt-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Status Breakdown</h3>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          ${data.statusBreakdown.map(s => `
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-gray-800">${s.count}</div>
              <div class="text-sm text-gray-600 capitalize">${s.status}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
  
  dashboardView.innerHTML = html;
  if (loadingPlaceholder) {
    loadingPlaceholder.style.display = 'none';
  }
  
  // Add event listener for crew workload period selector
  const periodSelector = document.getElementById('periodSelector');
  if (periodSelector) {
    periodSelector.addEventListener('change', (e) => {
      const currentVenueMonth = document.getElementById('venueMonthSelector')?.value;
      loadDashboardData(e.target.value, currentVenueMonth);
    });
  }
  
  // Add event listener for venue month selector
  const venueMonthSelector = document.getElementById('venueMonthSelector');
  if (venueMonthSelector) {
    venueMonthSelector.addEventListener('change', (e) => {
      const currentPeriod = document.getElementById('periodSelector')?.value || 'current_month';
      loadDashboardData(currentPeriod, e.target.value);
    });
  }
}

// Helper function to open edit modal from dashboard
function openEditModal(eventId) {
  if (typeof editEventFromModal === 'function') {
    editEventFromModal(eventId);
  } else {
    console.error('editEventFromModal function not found');
    alert('Please go to Table view to edit this event');
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// ============================================
// 5. ENHANCED EXPORT WITH CHANGE TRACKING
// ============================================

let lastExportChecksum = null;

async function exportWithTracking(format = 'csv') {
  try {
    const response = await axios.post(`${API_BASE}/export/tracked`, {
      eventIds: allEvents.map(e => e.id),
      format: format,
      includeMetadata: true
    });
    
    if (response.data.success) {
      lastExportChecksum = response.data.checksum;
      const events = response.data.data.events;
      
      if (format === 'csv') {
        exportEventsToCSV(events, `ncpa_events_tracked_${new Date().toISOString().split('T')[0]}`);
      } else if (format === 'excel') {
        exportEventsToExcel(events, `ncpa_events_tracked_${new Date().toISOString().split('T')[0]}`);
      }
      
      showNotification(`Exported ${events.length} events with tracking`, 'success');
      
      // Store checksum in localStorage for Google Sheets sync
      localStorage.setItem('lastExportChecksum', lastExportChecksum);
      localStorage.setItem('lastExportDate', new Date().toISOString());
    }
  } catch (error) {
    console.error('Error exporting with tracking:', error);
    showNotification('Export failed', 'error');
  }
}

async function checkExportChanges() {
  const lastChecksum = localStorage.getItem('lastExportChecksum');
  
  if (!lastChecksum) {
    showNotification('No previous export found', 'info');
    return false;
  }
  
  try {
    const response = await axios.post(`${API_BASE}/export/check-changes`, {
      lastChecksum: lastChecksum,
      eventIds: allEvents.map(e => e.id)
    });
    
    if (response.data.success) {
      const { hasChanges, eventCount } = response.data.data;
      
      if (hasChanges) {
        showNotification(`⚠️ ${eventCount} events have changed since last export`, 'warning');
        return true;
      } else {
        showNotification('✅ No changes since last export', 'success');
        return false;
      }
    }
  } catch (error) {
    console.error('Error checking changes:', error);
    return false;
  }
}

// Enhanced CSV export for Google Sheets compatibility
function exportEventsToCSV(events, filename) {
  if (!events || events.length === 0) {
    showNotification('No events to export', 'error');
    return;
  }
  
  // CSV Headers with all fields
  const headers = [
    'ID',
    'Date',
    'Program',
    'Venue',
    'Team',
    'Sound Requirements',
    'Call Time',
    'Crew',
    'Status',
    'Tags',
    'Created At',
    'Updated At'
  ];
  
  // Convert events to CSV rows
  const rows = events.map(event => [
    event.id || '',
    event.event_date || '',
    `"${(event.program || '').replace(/"/g, '""')}"`,
    `"${(event.venue || '').replace(/"/g, '""')}"`,
    `"${(event.team || '').replace(/"/g, '""')}"`,
    `"${(event.sound_requirements || '').replace(/"/g, '""')}"`,
    event.call_time || '',
    `"${(event.crew || '').replace(/"/g, '""')}"`,
    event.status || 'confirmed',
    event.tags || '',
    event.created_at || '',
    event.updated_at || ''
  ]);
  
  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Expose all functions globally
window.toggleFilterPanel = toggleFilterPanel;
window.closeFilterPanel = closeFilterPanel;
window.clearFilters = clearFilters;
window.applyFilters = applyFilters;
window.checkConflicts = checkConflicts;
window.checkShortNotice = checkShortNotice;
window.switchShortNoticeTab = switchShortNoticeTab;
window.exportShortNotice = exportShortNotice;
window.toggleBulkSelect = toggleBulkSelect;
window.clearBulkSelection = clearBulkSelection;
window.bulkAssignCrew = bulkAssignCrew;
window.bulkChangeStatus = bulkChangeStatus;
window.bulkExportSelected = bulkExportSelected;
window.bulkDeleteSelected = bulkDeleteSelected;
window.confirmBulkAssign = confirmBulkAssign;
window.confirmBulkStatus = confirmBulkStatus;
window.loadDashboardData = loadDashboardData;
window.exportWithTracking = exportWithTracking;
window.checkExportChanges = checkExportChanges;

// ============================================
// INITIALIZE V4.1 FEATURES ON PAGE LOAD
// ============================================

function initializeV41Features() {
  console.log('🚀 Initializing v4.1 features...');
  
  try {
    initializeFilters();
    console.log('✅ Filters initialized');
  } catch (e) {
    console.error('❌ Filter init failed:', e);
  }
  
  try {
    initializeBulkOperations();
    console.log('✅ Bulk operations initialized');
  } catch (e) {
    console.error('❌ Bulk ops init failed:', e);
  }
  
  console.log('✅ NCPA Sound Crew v4.1 Features Loaded');
  
  // Check for export changes on load
  const lastExportDate = localStorage.getItem('lastExportDate');
  if (lastExportDate) {
    console.log(`📊 Last export: ${new Date(lastExportDate).toLocaleString()}`);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeV41Features, 200);
  });
} else {
  // DOM already loaded
  setTimeout(initializeV41Features, 200);
}

console.log('✅ v4.1 Features script loaded');
