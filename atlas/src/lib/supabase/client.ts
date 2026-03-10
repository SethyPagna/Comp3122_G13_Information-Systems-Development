'use client'
import { createBrowserClient } from '@supabase/ssr'

// @supabase/ssr v0.6.x attaches apikey + Authorization headers internally.
// Passing global.headers manually breaks the fetch pipeline → "No API key found".
// Let the library handle headers on its own.

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[Atlas] Missing Supabase env vars.\n' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local, then restart the dev server.'
    )
  }

  return createBrowserClient(url, key)
}
