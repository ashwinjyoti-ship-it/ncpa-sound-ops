import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

// Valid crew members (from crew assignment engine)
const VALID_CREW_MEMBERS = new Set([
  'Viraj', 'Omkar', 'Akshay', 'Nazar', 'NS', 'Sandeep', 
  'Shridhar', 'OC1', 'Aditya', 'Nikhil', 'Naren', 
  'OC3', 'Coni', 'OC2'
])

function isValidCrewMember(member: string): boolean {
  return VALID_CREW_MEMBERS.has(member)
}

export function setupCrewStatsEndpoints(app: Hono<{ Bindings: Bindings }>) {
  
  // Get crew statistics for current month
  app.get('/api/crew/stats', async (c) => {
    try {
      // Get month parameter (default to current month)
      const monthParam = c.req.query('month')
      
      const today = new Date()
      const year = monthParam ? parseInt(monthParam.split('-')[0]) : today.getFullYear()
      const month = monthParam ? parseInt(monthParam.split('-')[1]) : today.getMonth() + 1
      
      const targetMonth = `${year}-${String(month).padStart(2, '0')}`
      
      // Get all events for the month
      const events = await c.env.DB.prepare(`
        SELECT crew FROM events
        WHERE strftime('%Y-%m', event_date) = ?
          AND crew IS NOT NULL AND crew != ""
      `).bind(targetMonth).all()
      
      // Count crew assignments
      const crewCounts = new Map<string, number>()
      
      events.results.forEach((row: any) => {
        const crewMembers = row.crew.split(',').map((c: string) => c.trim())
        crewMembers.forEach((member: string) => {
          if (isValidCrewMember(member)) {
            crewCounts.set(member, (crewCounts.get(member) || 0) + 1)
          }
        })
      })
      
      // Convert to array and sort by count
      const crewStats = Array.from(crewCounts.entries())
        .map(([crew, count]) => ({ crew, count }))
        .sort((a, b) => b.count - a.count)
      
      // Calculate statistics
      const totalAssignments = crewStats.reduce((sum, c) => sum + c.count, 0)
      const avgAssignments = crewStats.length > 0 
        ? Math.round(totalAssignments / crewStats.length) 
        : 0
      const maxAssignments = crewStats.length > 0 ? crewStats[0].count : 0
      
      // Add status to each crew member
      const crewWithStatus = crewStats.map(item => {
        let status = 'balanced'
        if (item.count > avgAssignments * 1.3) {
          status = 'overloaded'
        } else if (item.count < avgAssignments * 0.7 && avgAssignments > 0) {
          status = 'underutilized'
        }
        
        // Calculate percentage for visual bar
        const percentage = maxAssignments > 0 
          ? Math.round((item.count / maxAssignments) * 100) 
          : 0
        
        return {
          ...item,
          status,
          percentage
        }
      })
      
      return c.json({
        success: true,
        data: {
          month: targetMonth,
          crewStats: crewWithStatus,
          summary: {
            totalAssignments,
            avgAssignments,
            maxAssignments,
            crewCount: crewStats.length,
            overloaded: crewWithStatus.filter(c => c.status === 'overloaded').length,
            underutilized: crewWithStatus.filter(c => c.status === 'underutilized').length
          }
        }
      })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}
