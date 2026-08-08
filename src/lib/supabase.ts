import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const initialHash = new URLSearchParams(window.location.hash.slice(1))
const initialSearch = new URLSearchParams(window.location.search)

export const startedFromPasswordRecovery =
  initialHash.get('type') === 'recovery' || initialSearch.get('type') === 'recovery'

export const initialAuthErrorCode =
  initialHash.get('error_code') || initialSearch.get('error_code')

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null
