// NCPA Sound Crew - Automatic Crew Assignment Engine
// Learns from historical data to suggest optimal crew assignments
// Considers: Expertise, Workload, Fairness, Availability

import { Hono } from 'hono'
import type { Context } from 'hono'

type Bindings = {
  DB: D1Database;
}

// VALID CREW MEMBERS - Only learn from these crew members
// Ashwin is team head and assigned selectively - excluded from auto-suggestions
const VALID_CREW_MEMBERS = new Set([
  'Naren',
  'Sandeep', 
  'Coni',
  'Nikhil',
  'NS',
  'Aditya',
  'Viraj',
  'Shridhar',
  'Nazar',
  'Omkar',
  'Akshay',
  'OC1',
  'OC2',
  'OC3'
])

// Filter crew member to only include valid crew
function isValidCrewMember(name: string): boolean {
  const trimmedName = name.trim()
  return VALID_CREW_MEMBERS.has(trimmedName)
}

export function setupCrewAssignmentEngine(app: Hono<{ Bindings: Bindings }>) {
  
  // ============================================
  // 1. AUTOMATIC CREW SUGGESTION (Smart Engine)
  // ============================================
  
  app.post('/api/crew/auto-suggest', async (c) => {
    try {
      const body = await c.req.json()
      const { 
        event_date, 
        venue, 
        program,
        event_type, // Optional: Classical, Dance, Theatre, etc.
        crew_size = 2 // How many crew members needed
      } = body
      
      if (!event_date || !venue) {
        return c.json({ success: false, error: 'Event date and venue required' }, 400)
      }
      
      // Step 1: Get crew expertise at this venue
      // Parse comma-separated crew field and get expertise per crew member
      const { results: venueEvents } = await c.env.DB.prepare(`
        SELECT crew, event_date
        FROM events
        WHERE venue = ? AND crew IS NOT NULL AND crew != ""
      `).bind(venue).all()
      
      const expertiseMap = new Map<string, { count: number, lastDate: string }>()
      venueEvents.forEach((row: any) => {
        const crewMembers = row.crew.split(',').map((c: string) => c.trim())
        crewMembers.forEach((member: string) => {
          // Only learn from valid crew members (exclude Ashwin and invalid names)
          if (member && isValidCrewMember(member)) {
            const existing = expertiseMap.get(member)
            if (!existing || row.event_date > existing.lastDate) {
              expertiseMap.set(member, {
                count: (existing?.count || 0) + 1,
                lastDate: row.event_date
              })
            }
          }
        })
      })
      
      const expertiseData = Array.from(expertiseMap.entries()).map(([name, data]) => ({
        crew_name: name,
        assignment_count: data.count,
        last_assignment: data.lastDate
      }))
      
      // Step 2: Get current month workload for fairness
      const month = event_date.substring(0, 7) // YYYY-MM
      const { results: monthEvents } = await c.env.DB.prepare(`
        SELECT crew
        FROM events
        WHERE strftime('%Y-%m', event_date) = ? AND crew IS NOT NULL AND crew != ""
      `).bind(month).all()
      
      const workloadMap = new Map<string, number>()
      monthEvents.forEach((row: any) => {
        const crewMembers = row.crew.split(',').map((c: string) => c.trim())
        crewMembers.forEach((member: string) => {
          // Only track workload for valid crew members
          if (member && isValidCrewMember(member)) {
            workloadMap.set(member, (workloadMap.get(member) || 0) + 1)
          }
        })
      })
      
      const workloadData = Array.from(workloadMap.entries()).map(([name, count]) => ({
        crew_name: name,
        current_workload: count
      }))
      
      // Step 3: Check for conflicts (crew already assigned on this date)
      const { results: conflictData } = await c.env.DB.prepare(`
        SELECT crew
        FROM events
        WHERE event_date = ?
      `).bind(event_date).all()
      
      const busyCrewMembers = new Set<string>()
      conflictData.forEach((row: any) => {
        if (row.crew) {
          row.crew.split(',').forEach((c: string) => {
            const trimmed = c.trim()
            // Only track conflicts for valid crew members
            if (isValidCrewMember(trimmed)) {
              busyCrewMembers.add(trimmed)
            }
          })
        }
      })
      
      // Step 4: Calculate scores for each crew member
      const crewScores: any[] = []
      const expertiseScoreMap = new Map(expertiseData.map((e: any) => [e.crew_name, e.assignment_count]))
      const workloadScoreMap = new Map(workloadData.map((w: any) => [w.crew_name, w.current_workload]))
      
      // Get all unique crew members
      const allCrew = new Set([...expertiseScoreMap.keys(), ...workloadScoreMap.keys()])
      
      for (const crewMember of allCrew) {
        if (busyCrewMembers.has(crewMember)) {
          continue // Skip crew members already assigned on this date
        }
        
        const expertiseCount = expertiseScoreMap.get(crewMember) || 0
        const currentWorkload = workloadScoreMap.get(crewMember) || 0
        
        // Calculate scores (0.0 to 1.0)
        const maxExpertise = Math.max(...Array.from(expertiseScoreMap.values()))
        const maxWorkload = Math.max(...Array.from(workloadScoreMap.values()), 1)
        
        const expertiseScore = maxExpertise > 0 ? expertiseCount / maxExpertise : 0
        const fairnessScore = 1 - (currentWorkload / maxWorkload) // Lower workload = higher score
        
        // Weighted average: 60% expertise, 40% fairness
        const finalScore = (expertiseScore * 0.6) + (fairnessScore * 0.4)
        
        crewScores.push({
          name: crewMember,
          score: Math.round(finalScore * 100),
          expertiseScore: Math.round(expertiseScore * 100),
          fairnessScore: Math.round(fairnessScore * 100),
          venueExperience: expertiseCount,
          currentWorkload: currentWorkload,
          reasoning: generateReasoning(crewMember, expertiseCount, currentWorkload, venue)
        })
      }
      
      // Step 5: Sort by score and return top recommendations
      crewScores.sort((a, b) => b.score - a.score)
      const topRecommendations = crewScores.slice(0, Math.min(crew_size * 2, 10)) // Suggest 2x requested crew
      
      // Step 6: Calculate confidence level based on data availability
      const totalAssignments = expertiseData.reduce((sum: number, e: any) => sum + e.assignment_count, 0)
      const confidenceLevel = calculateConfidence(totalAssignments)
      
      return c.json({
        success: true,
        data: {
          recommendations: topRecommendations,
          requested_crew_size: crew_size,
          confidence_level: confidenceLevel,
          total_assignments_analyzed: totalAssignments,
          busy_crew_members: Array.from(busyCrewMembers),
          insights: generateInsights(topRecommendations, confidenceLevel)
        }
      })
      
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // ============================================
  // 2. WORKLOAD BALANCE ANALYSIS
  // ============================================
  
  app.get('/api/crew/workload-balance', async (c) => {
    try {
      const month = c.req.query('month') || new Date().toISOString().substring(0, 7)
      
      // Get all crew members and their workload
      const { results: rawWorkloadData } = await c.env.DB.prepare(`
        SELECT 
          crew_name,
          COUNT(*) as assignment_count,
          GROUP_CONCAT(DISTINCT venue) as venues_worked
        FROM (
          SELECT 
            TRIM(value) as crew_name,
            venue
          FROM events, json_each('["' || REPLACE(REPLACE(crew, ',', '","'), ' ', '') || '"]')
          WHERE strftime('%Y-%m', event_date) = ?
            AND crew IS NOT NULL 
            AND crew != ""
        )
        GROUP BY crew_name
        ORDER BY assignment_count DESC
      `).bind(month).all()
      
      // Filter to only include valid crew members
      const workloadData = rawWorkloadData.filter((w: any) => isValidCrewMember(w.crew_name))
      
      // Calculate balance metrics
      const assignments = workloadData.map((w: any) => w.assignment_count)
      const avgAssignments = assignments.reduce((a: number, b: number) => a + b, 0) / assignments.length
      const maxAssignments = Math.max(...assignments, 1)
      const minAssignments = Math.min(...assignments, 0)
      
      const balanceScore = 1 - ((maxAssignments - minAssignments) / maxAssignments)
      
      // Flag overloaded and underutilized crew
      const analysis = workloadData.map((w: any) => ({
        crew_name: w.crew_name,
        assignments: w.assignment_count,
        deviation_from_avg: w.assignment_count - avgAssignments,
        status: w.assignment_count > avgAssignments * 1.5 ? 'overloaded' :
                w.assignment_count < avgAssignments * 0.5 ? 'underutilized' : 'balanced',
        venues_worked: w.venues_worked ? w.venues_worked.split(',') : []
      }))
      
      return c.json({
        success: true,
        data: {
          month,
          balance_score: Math.round(balanceScore * 100),
          average_assignments: Math.round(avgAssignments * 10) / 10,
          max_assignments: maxAssignments,
          min_assignments: minAssignments,
          crew_analysis: analysis,
          recommendations: generateBalanceRecommendations(analysis)
        }
      })
      
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // ============================================
  // 3. CREW EXPERTISE REPORT
  // ============================================
  
  app.get('/api/crew/expertise-report', async (c) => {
    try {
      // Get crew expertise by venue
      const { results: expertiseData } = await c.env.DB.prepare(`
        SELECT 
          crew_name,
          venue,
          COUNT(*) as assignments,
          MAX(event_date) as last_assignment,
          MIN(event_date) as first_assignment
        FROM (
          SELECT 
            TRIM(value) as crew_name,
            venue,
            event_date
          FROM events, json_each('["' || REPLACE(REPLACE(crew, ',', '","'), ' ', '') || '"]')
          WHERE crew IS NOT NULL AND crew != ""
        )
        GROUP BY crew_name, venue
        HAVING assignments >= 3
        ORDER BY crew_name, assignments DESC
      `).all()
      
      // Organize by crew member (only valid crew)
      const expertiseByMember: Record<string, any> = {}
      
      expertiseData.forEach((row: any) => {
        // Only include valid crew members
        if (!isValidCrewMember(row.crew_name)) {
          return
        }
        
        if (!expertiseByMember[row.crew_name]) {
          expertiseByMember[row.crew_name] = {
            crew_name: row.crew_name,
            total_assignments: 0,
            venues: [],
            primary_venue: null,
            specialization: null
          }
        }
        
        expertiseByMember[row.crew_name].total_assignments += row.assignments
        expertiseByMember[row.crew_name].venues.push({
          venue: row.venue,
          assignments: row.assignments,
          last_assignment: row.last_assignment,
          experience_days: calculateDays(row.first_assignment, row.last_assignment)
        })
      })
      
      // Determine primary venue and specialization
      Object.values(expertiseByMember).forEach((member: any) => {
        member.venues.sort((a: any, b: any) => b.assignments - a.assignments)
        member.primary_venue = member.venues[0]?.venue
        member.specialization = determineSpecialization(member.venues)
      })
      
      return c.json({
        success: true,
        data: {
          crew_members: Object.values(expertiseByMember),
          total_crew: Object.keys(expertiseByMember).length
        }
      })
      
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  
  // ============================================
  // 4. LEARNING MODEL STATS
  // ============================================
  
  app.get('/api/crew/learning-stats', async (c) => {
    try {
      // Get all events with crew
      const { results: allEvents } = await c.env.DB.prepare(`
        SELECT crew, event_date FROM events WHERE crew IS NOT NULL AND crew != ""
      `).all()
      
      // Count only valid crew assignments
      let totalValidAssignments = 0
      allEvents.forEach((event: any) => {
        const crewMembers = event.crew.split(',').map((c: string) => c.trim())
        crewMembers.forEach((member: string) => {
          if (isValidCrewMember(member)) {
            totalValidAssignments++
          }
        })
      })
      
      // Get date range
      const { results: dateRange } = await c.env.DB.prepare(`
        SELECT 
          MIN(event_date) as first_date,
          MAX(event_date) as last_date
        FROM events
      `).all()
      
      const totalAssignments = totalValidAssignments
      const firstDate = dateRange[0]?.first_date
      const lastDate = dateRange[0]?.last_date
      const daysOfLearning = firstDate && lastDate ? 
        Math.floor((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)) : 0
      
      // Calculate confidence level
      const confidenceLevel = calculateConfidence(totalAssignments)
      
      // Readiness for automatic assignment
      const readiness = {
        ready: totalAssignments >= 100 && daysOfLearning >= 90,
        reason: totalAssignments < 100 ? 
          `Need ${100 - totalAssignments} more assignments (currently ${totalAssignments})` :
          daysOfLearning < 90 ?
          `Need ${90 - daysOfLearning} more days of data (currently ${daysOfLearning} days)` :
          'System ready for automatic assignments!'
      }
      
      return c.json({
        success: true,
        data: {
          total_assignments: totalAssignments,
          days_of_learning: daysOfLearning,
          confidence_level: confidenceLevel,
          readiness,
          first_assignment_date: firstDate,
          last_assignment_date: lastDate,
          recommendation: totalAssignments >= 50 ? 
            'You can start using smart suggestions now!' :
            'Keep assigning crew manually. System will learn from your choices.'
        }
      })
      
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateReasoning(crewName: string, expertiseCount: number, workload: number, venue: string): string {
  const reasons = []
  
  if (expertiseCount > 20) {
    reasons.push(`Expert at ${venue} (${expertiseCount} assignments)`)
  } else if (expertiseCount > 10) {
    reasons.push(`Experienced at ${venue} (${expertiseCount} assignments)`)
  } else if (expertiseCount > 0) {
    reasons.push(`Some experience at ${venue} (${expertiseCount} assignments)`)
  } else {
    reasons.push(`New to ${venue} - good training opportunity`)
  }
  
  if (workload < 5) {
    reasons.push('Light workload this month')
  } else if (workload < 10) {
    reasons.push('Moderate workload')
  } else {
    reasons.push('Heavy workload - consider fairness')
  }
  
  return reasons.join(' • ')
}

function calculateConfidence(totalAssignments: number): number {
  // Confidence increases with data
  // 0-50 assignments: Low confidence (0-50%)
  // 50-100: Medium confidence (50-75%)
  // 100-200: High confidence (75-90%)
  // 200+: Very high confidence (90-100%)
  
  if (totalAssignments < 50) {
    return Math.round((totalAssignments / 50) * 50)
  } else if (totalAssignments < 100) {
    return 50 + Math.round(((totalAssignments - 50) / 50) * 25)
  } else if (totalAssignments < 200) {
    return 75 + Math.round(((totalAssignments - 100) / 100) * 15)
  } else {
    return Math.min(95, 90 + Math.round((totalAssignments - 200) / 100))
  }
}

function generateInsights(recommendations: any[], confidenceLevel: number): string[] {
  const insights = []
  
  if (confidenceLevel < 50) {
    insights.push('⚠️ Low confidence - System is still learning. Manual review recommended.')
  } else if (confidenceLevel < 75) {
    insights.push('📊 Medium confidence - Suggestions are improving with more data.')
  } else {
    insights.push('✅ High confidence - System has learned crew patterns well.')
  }
  
  if (recommendations.length > 0) {
    const topScore = recommendations[0].score
    if (topScore > 80) {
      insights.push(`🎯 Strong recommendation: ${recommendations[0].name} is an excellent match.`)
    } else if (topScore > 60) {
      insights.push(`👍 Good recommendation: ${recommendations[0].name} is a solid choice.`)
    } else {
      insights.push(`🤔 Multiple options available - consider team dynamics.`)
    }
  }
  
  return insights
}

function generateBalanceRecommendations(analysis: any[]): string[] {
  const recommendations = []
  
  const overloaded = analysis.filter(c => c.status === 'overloaded')
  const underutilized = analysis.filter(c => c.status === 'underutilized')
  
  if (overloaded.length > 0) {
    recommendations.push(`⚠️ ${overloaded.map(c => c.crew_name).join(', ')} may be overloaded. Consider redistributing.`)
  }
  
  if (underutilized.length > 0) {
    recommendations.push(`💡 ${underutilized.map(c => c.crew_name).join(', ')} have capacity for more assignments.`)
  }
  
  if (overloaded.length === 0 && underutilized.length === 0) {
    recommendations.push('✅ Workload is well-balanced across all crew members.')
  }
  
  return recommendations
}

function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function determineSpecialization(venues: any[]): string {
  if (venues.length === 0) return 'None'
  
  const totalAssignments = venues.reduce((sum, v) => sum + v.assignments, 0)
  const primaryVenuePercent = (venues[0].assignments / totalAssignments) * 100
  
  if (primaryVenuePercent > 70) {
    return `${venues[0].venue} Specialist`
  } else if (venues.length >= 3) {
    return 'Multi-Venue Expert'
  } else {
    return 'Generalist'
  }
}
