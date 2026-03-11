export type Env = {
  Bindings: {
    DB: D1Database
    AI: any
    VECTORIZE: any
    ANTHROPIC_API_KEY: string
    APP_USERNAME: string
    APP_PASSWORD: string
  }
}

export type Event = {
  id: number
  event_date: string
  program: string
  venue: string
  team: string
  sound_requirements: string
  call_time: string
  crew: string
  requirements_updated: boolean
  created_at: string
  updated_at: string
  batch_id?: string
  venue_normalized?: string
  vertical?: string
  stage_crew_needed?: number
  needs_manual_review?: boolean
  manual_flag_reason?: string
}

export type CrewMember = {
  id: number
  name: string
  level: 'Senior' | 'Mid' | 'Junior' | 'Hired'
  can_stage: boolean
  stage_only_if_urgent: boolean
  is_outside_crew: boolean
  venue_capabilities: Record<string, string>
  vertical_capabilities: Record<string, string>
  special_notes: string
}

export type Equipment = {
  id: number
  name: string
  rate: number
  created_at?: string
  updated_at?: string
}

export type Assignment = {
  id: number
  event_id: number
  crew_id: number
  role: 'FOH' | 'Stage'
  was_engine_suggestion: boolean
  was_manually_overridden: boolean
}

export type DayOff = {
  id: number
  crew_id: number
  unavailable_date: string
  reason?: string
}
