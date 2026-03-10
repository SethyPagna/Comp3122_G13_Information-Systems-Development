'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

// Inner component uses useSearchParams — must be inside Suspense
function SignupForm() {
  const searchParams = useSearchParams()
  const [role, setRole] = useState<'teacher' | 'student'>(
    (searchParams.get('role') as 'teacher' | 'student') || 'student'
  )
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: `${window.location.origin}/auth/login`,
      },
    })

    if (error) {
      // 401 / invalid API key → give a clear developer message
      if (
        error.status === 401 ||
        error.message?.toLowerCase().includes('invalid api key') ||
        error.message?.toLowerCase().includes('apikey')
      ) {
        toast.error(
          '⚠️ Supabase 401: Your anon key is wrong. Check .env.local — the key must start with eyJ... (get it from Supabase Dashboard → Settings → API → anon public)',
          { duration: 10000 }
        )
      } else if (error.message?.toLowerCase().includes('already registered')) {
        toast.error('This email is already registered. Try signing in instead.')
      } else {
        toast.error(error.message)
      }
      setLoading(false)
      return
    }

    // If session is null, Supabase sent a confirmation email
    if (data.user && !data.session) {
      setEmailSent(true)
      setLoading(false)
      return
    }

    // Session exists → logged in immediately (email confirmation is disabled)
    if (data.session) {
      // Ensure profile row exists (trigger may not have fired yet in some edge cases)
      await supabase.from('profiles').upsert({
        id: data.user!.id,
        email,
        full_name: fullName,
        role,
      }, { onConflict: 'id', ignoreDuplicates: true })

      toast.success('Account created! Welcome to Atlas.')
      router.push(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')
      router.refresh()
    }
  }

  if (emailSent) {
    return (
      <div className="atlas-card p-8 text-center">
        <span className="text-5xl block mb-4">📬</span>
        <h2 className="font-display font-bold text-2xl text-atlas-text mb-2">Check your email</h2>
        <p className="text-atlas-subtle mb-4">
          We sent a confirmation link to <span className="text-atlas-blue font-medium">{email}</span>.
          Click it to activate your account.
        </p>
        <p className="text-xs text-atlas-subtle mt-4">
          Want to skip email confirmation?{' '}
          <span className="text-atlas-amber">
            In Supabase Dashboard → Authentication → Settings → disable "Confirm email"
          </span>
        </p>
        <Link href="/auth/login" className="btn-secondary mt-6 inline-flex">← Back to Login</Link>
      </div>
    )
  }

  return (
    <div className="atlas-card p-8">
      {/* Role Selector */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {(['teacher', 'student'] as const).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
              role === r
                ? 'border-atlas-blue bg-atlas-blue/10 text-atlas-text'
                : 'border-atlas-border bg-atlas-surface text-atlas-subtle hover:border-atlas-muted'
            }`}
          >
            <span className="text-2xl block mb-1">{r === 'teacher' ? '👨‍🏫' : '🎒'}</span>
            <span className="font-semibold capitalize text-sm">{r}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSignup} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-atlas-subtle mb-2">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your full name"
            required
            className="atlas-input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-atlas-subtle mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@school.edu"
            required
            className="atlas-input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-atlas-subtle mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            minLength={8}
            required
            className="atlas-input"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3.5">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating account...
            </span>
          ) : `Join as ${role === 'teacher' ? 'Teacher' : 'Student'} →`}
        </button>
      </form>

      <p className="text-center text-atlas-subtle text-sm mt-6">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-atlas-blue hover:underline font-medium">Sign in</Link>
      </p>
    </div>
  )
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-atlas-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-atlas-emerald/8 rounded-full blur-[80px]" />
      <div className="absolute bottom-1/3 left-1/4 w-48 h-48 bg-atlas-blue/10 rounded-full blur-[60px]" />

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-atlas-blue to-atlas-cyan flex items-center justify-center shadow-glow-blue">
              <span className="text-white font-display font-bold text-2xl">A</span>
            </div>
            <span className="font-display font-bold text-3xl text-atlas-text">Atlas</span>
          </Link>
          <h1 className="font-display font-bold text-2xl text-atlas-text">Create your account</h1>
          <p className="text-atlas-subtle mt-1">Start your personalized learning journey</p>
        </div>

        {/* Suspense required for useSearchParams in Next.js 14 App Router */}
        <Suspense fallback={<div className="atlas-card p-8 text-center"><div className="w-8 h-8 border-2 border-atlas-blue/30 border-t-atlas-blue rounded-full animate-spin mx-auto" /></div>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  )
}
