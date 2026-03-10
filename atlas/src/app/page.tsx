import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LandingPage from './landing'

export default async function RootPage() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      redirect(profile?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')
    }
  } catch {
    // If env vars aren't set yet, just show the landing page
  }

  return <LandingPage />
}
