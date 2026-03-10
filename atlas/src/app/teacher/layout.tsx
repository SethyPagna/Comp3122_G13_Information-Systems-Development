'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { generateInitials } from '@/lib/utils'

const navItems = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/teacher/lessons', label: 'Lessons', icon: '📚' },
  { href: '/teacher/students', label: 'Students', icon: '👥' },
  { href: '/teacher/analytics', label: 'Analytics', icon: '📊' },
  { href: '/teacher/reports', label: 'Reports', icon: '📋' },
]

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
          .then(({ data }) => setProfile(data))
      }
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="flex min-h-screen bg-atlas-bg">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-atlas-surface border-r border-atlas-border flex flex-col transition-all duration-300 sticky top-0 h-screen z-40`}>
        {/* Logo */}
        <div className={`flex items-center gap-3 p-4 border-b border-atlas-border ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-atlas-blue to-atlas-cyan flex items-center justify-center flex-shrink-0">
            <span className="text-white font-display font-bold">A</span>
          </div>
          {!collapsed && <span className="font-display font-bold text-lg text-atlas-text">Atlas</span>}
        </div>

        {/* Teacher badge */}
        {!collapsed && (
          <div className="mx-3 mt-3 px-3 py-1.5 bg-atlas-amber/10 border border-atlas-amber/20 rounded-lg">
            <span className="text-xs font-medium text-atlas-amber">Teacher Portal</span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}
                className={`${isActive ? 'nav-item-active' : 'nav-item'} ${collapsed ? 'justify-center px-2' : ''}`}
                title={collapsed ? item.label : undefined}>
                <span className="text-base">{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-atlas-border space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="nav-item w-full"
            title={collapsed ? 'Expand' : 'Collapse'}>
            <span>{collapsed ? '→' : '←'}</span>
            {!collapsed && 'Collapse'}
          </button>
          {profile && (
            <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ${collapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-atlas-blue to-atlas-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {generateInitials(profile.full_name || profile.email)}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-atlas-text truncate">{profile.full_name}</p>
                  <p className="text-xs text-atlas-subtle truncate">{profile.email}</p>
                </div>
              )}
            </div>
          )}
          <button onClick={handleLogout} className="nav-item w-full text-atlas-red hover:text-atlas-red hover:bg-atlas-red/10">
            <span>🚪</span>
            {!collapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-h-screen">
        {children}
      </main>
    </div>
  )
}
