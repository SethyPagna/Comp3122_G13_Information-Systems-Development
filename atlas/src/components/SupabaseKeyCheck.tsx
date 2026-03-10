'use client'
import { useEffect, useState } from 'react'

/**
 * Renders a prominent banner if the Supabase anon key looks wrong.
 * A valid Supabase anon key is a JWT: three base64 segments separated by dots,
 * starting with "eyJ". The "sb_publishable_..." value is NOT valid.
 */
export default function SupabaseKeyCheck() {
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || url === 'YOUR_SUPABASE_URL_HERE') {
      setProblem('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local')
      return
    }
    if (!key || key === 'YOUR_SUPABASE_ANON_JWT_HERE') {
      setProblem('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.local')
      return
    }
    // Supabase anon keys are JWTs: three dot-separated base64 parts starting with eyJ
    const parts = key.split('.')
    if (parts.length !== 3 || !key.startsWith('eyJ')) {
      setProblem(
        `NEXT_PUBLIC_SUPABASE_ANON_KEY looks wrong (got: "${key.slice(0, 30)}..."). ` +
        'A valid key starts with "eyJ" and has three dot-separated parts. ' +
        'The "sb_publishable_..." value is NOT the anon key.'
      )
    }
  }, [])

  if (!problem) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#7f1d1d', borderTop: '2px solid #ef4444',
      padding: '16px 24px', fontFamily: 'monospace', fontSize: '13px', color: '#fef2f2',
      display: 'flex', gap: '16px', alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</span>
      <div>
        <strong style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
          Supabase configuration error — this is why signup returns 401
        </strong>
        <span>{problem}</span>
        <div style={{ marginTop: '10px', lineHeight: '1.6', color: '#fca5a5' }}>
          <strong>How to fix:</strong><br />
          1. Go to <strong>Supabase Dashboard → Settings → API</strong><br />
          2. Copy the <strong>"anon public"</strong> key — it starts with <code style={{ background: '#991b1b', padding: '1px 4px', borderRadius: '3px' }}>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</code><br />
          3. Paste it as <code style={{ background: '#991b1b', padding: '1px 4px', borderRadius: '3px' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <strong>.env.local</strong><br />
          4. <strong>Restart the dev server</strong> after editing .env.local
        </div>
      </div>
    </div>
  )
}
