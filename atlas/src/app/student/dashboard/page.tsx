'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Lesson, StudentProgress } from '@/types'
import toast from 'react-hot-toast'
import { getStatusBadge } from '@/lib/utils'

type AssignedLesson = Lesson & { progress?: StudentProgress }

export default function StudentDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [lessons, setLessons] = useState<AssignedLesson[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [joiningClass, setJoiningClass] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    // Get enrolled classes
    const { data: enrollments } = await supabase
      .from('class_enrollments').select('class_id').eq('student_id', user.id)
    const classIds = (enrollments || []).map((e: any) => e.class_id)
    
    // Get assigned lessons
    if (classIds.length > 0) {
      const { data: assignments } = await supabase
        .from('lesson_assignments')
        .select('lesson_id')
        .in('class_id', classIds)
        .eq('is_active', true)
      
      const lessonIds = Array.from(new Set((assignments || []).map((a: any) => a.lesson_id)))
      
      if (lessonIds.length > 0) {
        const { data: lessonData } = await supabase
          .from('lessons').select('*').in('id', lessonIds).eq('status', 'published')
        
        const { data: progressData } = await supabase
          .from('student_progress').select('*').eq('student_id', user.id).in('lesson_id', lessonIds)
        
        const withProgress = (lessonData || []).map(l => ({
          ...l,
          progress: (progressData || []).find(p => p.lesson_id === l.id)
        }))
        setLessons(withProgress)
      }
    }
    setLoading(false)
  }

  const joinClass = async () => {
    if (!joinCode.trim()) return
    setJoiningClass(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setJoiningClass(false); return }
    
    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('id, name')
      .eq('join_code', joinCode.trim().toUpperCase())
      .maybeSingle()

    if (clsErr) {
      toast.error('Error looking up class: ' + clsErr.message)
      setJoiningClass(false)
      return
    }

    if (!cls) {
      toast.error('Invalid join code. Ask your teacher for the correct code.')
      setJoiningClass(false)
      return
    }
    
    const { error } = await supabase
      .from('class_enrollments')
      .upsert({ class_id: cls.id, student_id: user.id }, { onConflict: 'class_id,student_id' })
    
    if (error) {
      toast.error('Could not join class. You may already be enrolled.')
    } else {
      toast.success(`Joined ${cls.name}! 🎉`)
    }
    setJoinCode('')
    setJoiningClass(false)
    loadDashboard()
  }

  const inProgress = lessons.filter(l => l.progress?.status === 'in_progress')
  const notStarted = lessons.filter(l => !l.progress || l.progress.status === 'not_started')
  const completed = lessons.filter(l => l.progress?.status === 'completed')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">
            {greeting}, {profile?.full_name?.split(' ')[0] || 'Learner'} 🌟
          </h1>
          <p className="text-atlas-subtle mt-1">Continue your learning journey</p>
        </div>
        <div className="flex items-center gap-3">
          <input value={joinCode} onChange={e => setJoinCode(e.target.value)}
            placeholder="Join code (e.g. ABC12345)"
            className="atlas-input py-2 w-48 font-mono uppercase"
            onKeyDown={e => e.key === 'Enter' && joinClass()}
          />
          <button onClick={joinClass} disabled={joiningClass || !joinCode.trim()} className="btn-primary py-2">
            Join Class
          </button>
        </div>
      </div>

      {/* XP streak card */}
      {profile && (
        <div className="atlas-card mb-6 bg-gradient-to-r from-atlas-blue/10 to-atlas-purple/10 border-atlas-blue/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display font-bold text-2xl text-atlas-text">{profile.total_xp} XP</p>
              <p className="text-atlas-subtle text-sm mt-1">Keep up the momentum! 🔥</p>
            </div>
            <div className="flex gap-3">
              {[
                { label: 'Completed', value: completed.length, icon: '✅' },
                { label: 'In Progress', value: inProgress.length, icon: '📖' },
              ].map((s, i) => (
                <div key={i} className="text-center px-4 py-2 bg-atlas-surface rounded-xl border border-atlas-border">
                  <p className="text-xl">{s.icon}</p>
                  <p className="font-bold text-atlas-text">{s.value}</p>
                  <p className="text-xs text-atlas-subtle">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-atlas-card rounded-2xl shimmer" />)}
        </div>
      ) : lessons.length === 0 ? (
        <div className="atlas-card text-center py-16">
          <span className="text-6xl block mb-4">🎒</span>
          <h2 className="font-display font-bold text-2xl text-atlas-text mb-2">No lessons yet</h2>
          <p className="text-atlas-subtle mb-6">Join a class using the join code from your teacher</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* In Progress */}
          {inProgress.length > 0 && (
            <section>
              <h2 className="font-display font-semibold text-lg text-atlas-text mb-3">📖 Continue Learning</h2>
              <div className="space-y-3">
                {inProgress.map(lesson => <LessonCard key={lesson.id} lesson={lesson} />)}
              </div>
            </section>
          )}

          {/* Not Started */}
          {notStarted.length > 0 && (
            <section>
              <h2 className="font-display font-semibold text-lg text-atlas-text mb-3">📚 Assigned Lessons</h2>
              <div className="space-y-3">
                {notStarted.map(lesson => <LessonCard key={lesson.id} lesson={lesson} />)}
              </div>
            </section>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <section>
              <h2 className="font-display font-semibold text-lg text-atlas-text mb-3">✅ Completed</h2>
              <div className="space-y-3">
                {completed.map(lesson => <LessonCard key={lesson.id} lesson={lesson} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function LessonCard({ lesson }: { lesson: AssignedLesson }) {
  const progress = lesson.progress
  const pct = progress?.status === 'completed' ? 100 :
    progress?.status === 'in_progress' ? 
      Math.round(((progress.sections_completed?.length || 0) / Math.max(1, 5)) * 100) : 0

  return (
    <Link href={`/student/lessons/${lesson.id}`}
      className="atlas-card-hover flex items-center gap-4 py-4 px-5 group">
      <div className="w-12 h-12 rounded-2xl bg-atlas-blue/10 flex items-center justify-center text-2xl flex-shrink-0">
        {progress?.status === 'completed' ? '✅' : progress?.status === 'in_progress' ? '📖' : '📚'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-atlas-text">{lesson.title}</p>
        <p className="text-xs text-atlas-subtle mt-0.5">{lesson.subject} · {lesson.estimated_duration}min</p>
        {pct > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-atlas-subtle mb-1">
              <span>Progress</span>
              <span className="text-atlas-blue font-medium">{pct}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {progress?.score !== null && progress?.score !== undefined && (
          <span className={`font-bold text-lg ${progress.score >= 80 ? 'text-atlas-emerald' : progress.score >= 60 ? 'text-atlas-amber' : 'text-atlas-red'}`}>
            {Math.round(progress.score)}%
          </span>
        )}
        <span className="text-atlas-blue text-sm opacity-0 group-hover:opacity-100 transition-opacity">
          {progress?.status === 'in_progress' ? 'Continue →' : progress?.status === 'completed' ? 'Review →' : 'Start →'}
        </span>
      </div>
    </Link>
  )
}
