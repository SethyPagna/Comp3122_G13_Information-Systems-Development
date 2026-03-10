'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { generateInitials } from '@/lib/utils'

const navItems = [
  { href: '/student/dashboard', label: 'My Lessons', icon: '📚' },
  { href: '/student/profile', label: 'Profile', icon: '👤' },
]

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="flex min-h-screen bg-atlas-bg">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-atlas-surface border-r border-atlas-border flex flex-col sticky top-0 h-screen z-40">
        <div className="flex items-center gap-3 p-4 border-b border-atlas-border">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-atlas-blue to-atlas-cyan flex items-center justify-center flex-shrink-0">
            <span className="text-white font-display font-bold">A</span>
          </div>
          <span className="font-display font-bold text-lg text-atlas-text">Atlas</span>
        </div>
        
        {/* Student badge */}
        <div className="mx-3 mt-3 px-3 py-1.5 bg-atlas-emerald/10 border border-atlas-emerald/20 rounded-lg">
          <span className="text-xs font-medium text-atlas-emerald">Student Portal</span>
        </div>

        {profile && (
          <div className="mx-3 mt-3 p-3 bg-atlas-card rounded-xl border border-atlas-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-atlas-emerald to-atlas-cyan flex items-center justify-center text-white text-sm font-bold">
                {generateInitials(profile.full_name || profile.email)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-atlas-text truncate">{profile.full_name}</p>
                <p className="text-xs text-atlas-subtle">{profile.total_xp} XP</p>
              </div>
            </div>
            {/* XP bar */}
            <div className="mt-2 progress-bar">
              <div className="progress-bar-fill" style={{ width: `${(profile.total_xp % 100)}%` }} />
            </div>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map(item => {
            const isActive = pathname === item.href || (item.href !== '/student/dashboard' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}
                className={isActive ? 'nav-item-active' : 'nav-item'}>
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-atlas-border">
          <button onClick={handleLogout} className="nav-item w-full text-atlas-red hover:text-atlas-red hover:bg-atlas-red/10">
            <span>🚪</span>Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-h-screen">
        {children}
      </main>
    </div>
  )
}
