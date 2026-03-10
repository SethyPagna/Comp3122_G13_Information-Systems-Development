import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// @supabase/ssr v0.6.x attaches apikey + Authorization headers internally.
// Passing global.headers manually breaks the fetch pipeline → "No API key found".

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[Atlas] Missing Supabase env vars.\n' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local, then restart.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component context — cookie writes are ignored (safe to swallow)
        }
      },
    },
  })
}
