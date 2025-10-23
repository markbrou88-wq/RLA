import { createClient } from '@supabase/supabase-js'

const url = "https://tmodvqenwgxojmjiyknr.supabase.co"
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtb2R2cWVud2d4b2ptaml5a25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDc1NjgsImV4cCI6MjA3NjgyMzU2OH0.Fy3iVihLEPSP58C3Fz5tw3GcJ4iidAXkz_3e8iqFddQ"

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 5 } }
})
