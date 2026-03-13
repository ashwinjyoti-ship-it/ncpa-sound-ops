export type Bindings = {
  DB: D1Database
  AI: Ai
  ASSETS: Fetcher
  ANTHROPIC_API_KEY?: string   // optional — prefer D1 app_settings
  SHARED_PASSWORD: string
}
