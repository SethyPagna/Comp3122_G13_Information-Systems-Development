'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Lesson, TeacherAlert, Class } from '@/types'
import { formatRelativeTime, getAlertColor, getStatusBadge } from '@/lib/utils'

export default function TeacherDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [classes, setClasses] = useState<Class[]>([])
  const [recentLessons, setRecentLessons] = useState<Lesson[]>([])
  const [alerts, setAlerts] = useState<TeacherAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalStudents: 0, activeLesson: 0, avgScore: 0, interactions: 0 })
  const supabase = createClient()

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, classesRes, lessonsRes, alertsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('classes').select('*').eq('teacher_id', user.id).eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('lessons').select('*').eq('teacher_id', user.id).order('updated_at', { ascending: false }).limit(5),
      supabase.from('teacher_alerts').select('*').eq('teacher_id', user.id).eq('is_dismissed', false).order('created_at', { ascending: false }).limit(8),
    ])

    setProfile(profileRes.data)
    setClasses(classesRes.data || [])
    setRecentLessons(lessonsRes.data || [])
    setAlerts(alertsRes.data || [])

    // Compute real stats from actual data
    const classIds = (classesRes.data || []).map((c: any) => c.id)
    let totalStudents = 0
    if (classIds.length > 0) {
      const { count } = await supabase
        .from('class_enrollments')
        .select('id', { count: 'exact', head: true })
        .in('class_id', classIds)
        .eq('is_active', true)
      totalStudents = count || 0
    }

    const publishedLessons = (lessonsRes.data || []).filter((l: any) => l.status === 'published').length

    // Avg score from real student_progress
    const lessonIds = (lessonsRes.data || []).map((l: any) => l.id)
    let avgScore = 0
    let aiInteractions = 0
    if (lessonIds.length > 0) {
      const { data: progressRows } = await supabase
        .from('student_progress')
        .select('score')
        .in('lesson_id', lessonIds)
        .not('score', 'is', null)
      const scores = (progressRows || []).map((p: any) => p.score).filter((s: any) => s !== null)
      avgScore = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0

      const { count: interactionCount } = await supabase
        .from('socratic_interactions')
        .select('id', { count: 'exact', head: true })
        .in('lesson_id', lessonIds)
      aiInteractions = interactionCount || 0
    }

    setStats({
      totalStudents,
      activeLesson: publishedLessons,
      avgScore,
      interactions: aiInteractions,
    })
    setLoading(false)
  }

  const dismissAlert = async (alertId: string) => {
    await supabase.from('teacher_alerts').update({ is_dismissed: true }).eq('id', alertId)
    setAlerts(alerts.filter(a => a.id !== alertId))
  }

  if (loading) return <DashboardSkeleton />

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">
            {greeting}, {profile?.full_name?.split(' ')[0] || 'Teacher'} 👋
          </h1>
          <p className="text-atlas-subtle mt-1">Here's what's happening in your classroom</p>
        </div>
        <Link href="/teacher/lessons/create" className="btn-primary">
          <span>+</span> New Lesson
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Students', value: stats.totalStudents, icon: '👥', color: 'blue' },
          { label: 'Active Lessons', value: stats.activeLesson, icon: '📚', color: 'emerald' },
          { label: 'Avg Score', value: `${stats.avgScore}%`, icon: '📊', color: 'amber' },
          { label: 'AI Interactions', value: stats.interactions, icon: '💬', color: 'purple' },
        ].map((stat, i) => (
          <div key={i} className="atlas-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full bg-atlas-${stat.color}/10 text-atlas-${stat.color} font-medium`}>Live</span>
            </div>
            <p className="font-display font-bold text-3xl text-atlas-text">{stat.value}</p>
            <p className="text-atlas-subtle text-sm mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Lessons */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg text-atlas-text">Recent Lessons</h2>
            <Link href="/teacher/lessons" className="text-atlas-blue text-sm hover:underline">View all →</Link>
          </div>
          <div className="space-y-3">
            {recentLessons.length === 0 ? (
              <EmptyState 
                icon="📝"
                title="No lessons yet"
                subtitle="Create your first AI-powered lesson"
                action={{ label: 'Create Lesson', href: '/teacher/lessons/create' }}
              />
            ) : recentLessons.map(lesson => {
              const badge = getStatusBadge(lesson.status)
              return (
                <Link key={lesson.id} href={`/teacher/lessons/${lesson.id}`}
                  className="atlas-card-hover flex items-center gap-4 py-4 px-5 group">
                  <div className="w-10 h-10 rounded-xl bg-atlas-blue/10 flex items-center justify-center text-xl flex-shrink-0">
                    📖
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-atlas-text truncate">{lesson.title}</p>
                      {lesson.ai_generated && (
                        <span className="badge bg-atlas-purple/10 text-atlas-purple border border-atlas-purple/20 text-xs">AI</span>
                      )}
                    </div>
                    <p className="text-xs text-atlas-subtle mt-0.5">
                      {lesson.subject} · {lesson.estimated_duration}min · Updated {formatRelativeTime(lesson.updated_at)}
                    </p>
                  </div>
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Alerts Panel */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg text-atlas-text">Alerts</h2>
            {alerts.filter(a => !a.is_read).length > 0 && (
              <span className="badge bg-atlas-red/20 text-atlas-red border-atlas-red/30">
                {alerts.filter(a => !a.is_read).length} new
              </span>
            )}
          </div>
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="atlas-card text-center py-8">
                <span className="text-3xl block mb-2">✅</span>
                <p className="text-atlas-subtle text-sm">All caught up! No alerts right now.</p>
              </div>
            ) : alerts.map(alert => (
              <div key={alert.id} className={`atlas-card py-3 px-4 border ${getAlertColor(alert.alert_type)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{alert.title}</p>
                    <p className="text-xs mt-0.5 opacity-80">{alert.message}</p>
                    {alert.action_suggestion && (
                      <p className="text-xs mt-1 italic opacity-70">💡 {alert.action_suggestion}</p>
                    )}
                    <p className="text-xs opacity-50 mt-1">{formatRelativeTime(alert.created_at)}</p>
                  </div>
                  <button onClick={() => dismissAlert(alert.id)}
                    className="text-current opacity-40 hover:opacity-100 flex-shrink-0 text-lg leading-none mt-0.5">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Classes Grid */}
      {classes.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg text-atlas-text">My Classes</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls, i) => (
              <div key={cls.id} className="atlas-card">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg`}
                    style={{ background: `hsl(${(i * 60) % 360}, 60%, 15%)` }}>
                    🏫
                  </div>
                  <div>
                    <p className="font-semibold text-atlas-text">{cls.name}</p>
                    <p className="text-xs text-atlas-subtle">{cls.subject} · {cls.grade_level}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-atlas-subtle pt-3 border-t border-atlas-border">
                  <span>Join Code: <span className="font-mono text-atlas-amber font-bold">{cls.join_code}</span></span>
                  <Link href={`/teacher/students?class=${cls.id}`} className="text-atlas-blue hover:underline">
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, title, subtitle, action }: {
  icon: string; title: string; subtitle: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="atlas-card text-center py-10">
      <span className="text-4xl block mb-3">{icon}</span>
      <p className="font-semibold text-atlas-text">{title}</p>
      <p className="text-atlas-subtle text-sm mt-1">{subtitle}</p>
      {action && (
        <Link href={action.href} className="btn-primary mt-4 inline-flex text-sm py-2">
          {action.label}
        </Link>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="h-10 w-64 bg-atlas-card rounded-xl shimmer mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-atlas-card rounded-2xl shimmer" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 h-64 bg-atlas-card rounded-2xl shimmer" />
        <div className="h-64 bg-atlas-card rounded-2xl shimmer" />
      </div>
    </div>
  )
}
