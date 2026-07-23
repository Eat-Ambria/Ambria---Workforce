import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey || anonKey === 'your-anon-public-key-here') {
  // Helpful warning during development
  // eslint-disable-next-line no-console
  console.warn(
    '[Ambria Ops] Supabase env vars missing. Copy .env.example to .env and set ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Supabase Dashboard -> Settings -> API).'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false }, // app uses custom username/password login, not Supabase Auth
})

// Storage bucket used for all photo uploads
export const PHOTO_BUCKET = 'photos'
