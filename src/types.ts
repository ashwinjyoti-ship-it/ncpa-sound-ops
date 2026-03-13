export type Bindings = {
  DB: D1Database
  AI: Ai
  ANTHROPIC_API_KEY?: string   // optional — prefer D1 app_settings
  SHARED_PASSWORD: string
}
