'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Lesson } from '@/types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface StudentStat {
  id: string
  name: string
  email: string
  lessonsCompleted: number
  avgScore: number | null
  aiInteractions: number
}

interface LessonStat {
  id: string
  title: string
  studentsStarted: number
  studentsCompleted: number
  avgScore: number | null
}

interface SocraticEntry {
  id: string
  student_name: string
  student_question: string
  created_at: string
  lesson_title?: string
}

export default function TeacherAnalytics() {
  const [selectedLesson, setSelectedLesson] = useState<string>('all')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [tab, setTab] = useState<'overview' | 'students' | 'socratic'>('overview')
  const [lessonStats, setLessonStats] = useState<LessonStat[]>([])
  const [studentStats, setStudentStats] = useState<StudentStat[]>([])
  const [socraticLog, setSocraticLog] = useState<SocraticEntry[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: lessonData } = await supabase
      .from('lessons')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    const myLessons: Lesson[] = lessonData || []
    setLessons(myLessons)

    if (myLessons.length === 0) { setLoading(false); return }

    const lessonIds = myLessons.map(l => l.id)

    const { data: progressData } = await supabase
      .from('student_progress')
      .select('*, profiles!student_id(id, full_name, email)')
      .in('lesson_id', lessonIds)

    const { data: socraticData } = await supabase
      .from('socratic_interactions')
      .select('id, student_question, created_at, student_id, lesson_id, profiles!student_id(full_name)')
      .in('lesson_id', lessonIds)
      .order('created_at', { ascending: false })
      .limit(20)

    const lStats: LessonStat[] = myLessons.map(lesson => {
      const lp = (progressData || []).filter((p: any) => p.lesson_id === lesson.id)
      const scores = lp.map((p: any) => p.score).filter((s: any) => s !== null)
      return {
        id: lesson.id,
        title: lesson.title,
        studentsStarted: lp.filter((p: any) => p.status !== 'not_started').length,
        studentsCompleted: lp.filter((p: any) => p.status === 'completed').length,
        avgScore: scores.length > 0
          ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
          : null,
      }
    })
    setLessonStats(lStats)

    const studentMap = new Map<string, StudentStat>()
    for (const p of (progressData || [])) {
      const profile = (p as any).profiles
      if (!profile) continue
      const existing = studentMap.get(p.student_id) || {
        id: p.student_id, name: profile.full_name || 'Unknown',
        email: profile.email || '', lessonsCompleted: 0, avgScore: null, aiInteractions: 0,
      }
      if (p.status === 'completed') existing.lessonsCompleted++
      if (p.score !== null) {
        existing.avgScore = existing.avgScore === null ? p.score : Math.round((existing.avgScore + p.score) / 2)
      }
      studentMap.set(p.student_id, existing)
    }
    for (const s of (socraticData || [])) {
      const existing = studentMap.get(s.student_id)
      if (existing) { existing.aiInteractions++; studentMap.set(s.student_id, existing) }
    }
    setStudentStats(Array.from(studentMap.values()))

    const titleMap = new Map(myLessons.map(l => [l.id, l.title]))
    setSocraticLog((socraticData || []).map((s: any) => ({
      id: s.id, student_name: s.profiles?.full_name || 'Unknown',
      student_question: s.student_question, created_at: s.created_at,
      lesson_title: titleMap.get(s.lesson_id),
    })))

    setLoading(false)
  }

  const filteredStats = selectedLesson === 'all' ? lessonStats : lessonStats.filter(l => l.id === selectedLesson)
  const totalStudents = studentStats.length
  const scoredStudents = studentStats.filter(s => s.avgScore !== null)
  const avgClassScore = scoredStudents.length > 0
    ? Math.round(scoredStudents.reduce((a, s) => a + (s.avgScore || 0), 0) / scoredStudents.length) : 0
  const needHelp = scoredStudents.filter(s => (s.avgScore || 0) < 60).length
  const totalInteractions = studentStats.reduce((a, s) => a + s.aiInteractions, 0)

  const chartData = filteredStats.map(l => ({
    name: l.title.length > 18 ? l.title.slice(0, 16) + '…' : l.title,
    Started: l.studentsStarted,
    Completed: l.studentsCompleted,
  }))

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">Analytics Dashboard</h1>
          <p className="text-atlas-subtle">Real classroom data from your students</p>
        </div>
        <select value={selectedLesson} onChange={e => setSelectedLesson(e.target.value)} className="atlas-input w-64 py-2">
          <option value="all">All Lessons</option>
          {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Students', value: loading ? '…' : totalStudents, icon: '👥', color: 'blue' },
          { label: 'Class Avg Score', value: loading ? '…' : totalStudents === 0 ? 'N/A' : `${avgClassScore}%`, icon: '🎯', color: 'emerald' },
          { label: 'Need Support (<60%)', value: loading ? '…' : needHelp, icon: '⚠️', color: 'red' },
          { label: 'AI Interactions', value: loading ? '…' : totalInteractions, icon: '💬', color: 'purple' },
        ].map((s, i) => (
          <div key={i} className="atlas-card">
            <span className="text-xl mb-2 block">{s.icon}</span>
            <p className="font-display font-bold text-2xl text-atlas-text">{s.value}</p>
            <p className="text-atlas-subtle text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-6">
        {[
          { key: 'overview', label: '📊 Lesson Overview' },
          { key: 'students', label: '👥 Student Progress' },
          { key: 'socratic', label: '💬 AI Interaction Log' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.key ? 'bg-atlas-blue text-white' : 'bg-atlas-card text-atlas-subtle hover:text-atlas-text border border-atlas-border'
            }`}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-atlas-card rounded-2xl shimmer" />)}</div>
      ) : lessons.length === 0 ? (
        <div className="atlas-card text-center py-16">
          <span className="text-6xl block mb-4">📊</span>
          <h2 className="font-display font-bold text-xl text-atlas-text mb-2">No data yet</h2>
          <p className="text-atlas-subtle">Create lessons and assign them to students to see analytics here.</p>
        </div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="animate-fade-in space-y-6">
              <div className="atlas-card">
                <h2 className="font-display font-semibold text-lg text-atlas-text mb-4">Lesson Completion</h2>
                {chartData.length > 0 && chartData.some(d => d.Started > 0) ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" tick={{ fill: '#8B95A7', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#8B95A7', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 8, color: '#E8EDF5' }} />
                      <Bar dataKey="Started" fill="#4F86F7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Completed" fill="#23D18B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-atlas-subtle text-sm text-center py-8">No student progress recorded yet. Assign lessons to a class to get started.</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStats.map(lesson => (
                  <div key={lesson.id} className="atlas-card">
                    <p className="font-semibold text-atlas-text text-sm mb-3 truncate">{lesson.title}</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-atlas-subtle">Started</span><span className="text-atlas-blue font-medium">{lesson.studentsStarted}</span></div>
                      <div className="flex justify-between"><span className="text-atlas-subtle">Completed</span><span className="text-atlas-emerald font-medium">{lesson.studentsCompleted}</span></div>
                      <div className="flex justify-between"><span className="text-atlas-subtle">Avg Score</span>
                        <span className={`font-medium ${lesson.avgScore === null ? 'text-atlas-subtle' : lesson.avgScore >= 80 ? 'text-atlas-emerald' : lesson.avgScore >= 60 ? 'text-atlas-amber' : 'text-atlas-red'}`}>
                          {lesson.avgScore !== null ? `${lesson.avgScore}%` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'students' && (
            <div className="animate-fade-in atlas-card overflow-x-auto">
              <h2 className="font-display font-semibold text-lg text-atlas-text mb-4">Student Progress</h2>
              {studentStats.length === 0 ? (
                <p className="text-atlas-subtle text-sm text-center py-8">No students have started your lessons yet.</p>
              ) : (
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="text-left border-b border-atlas-border">
                      <th className="text-xs text-atlas-subtle font-medium pb-3 pr-4">Student</th>
                      <th className="text-xs text-atlas-subtle font-medium pb-3 px-3 text-center">Completed</th>
                      <th className="text-xs text-atlas-subtle font-medium pb-3 px-3 text-center">Avg Score</th>
                      <th className="text-xs text-atlas-subtle font-medium pb-3 px-3 text-center">AI Chats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentStats.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)).map(s => (
                      <tr key={s.id} className="border-b border-atlas-border/50 hover:bg-atlas-surface/50">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-atlas-text text-sm">{s.name}</p>
                          <p className="text-xs text-atlas-subtle">{s.email}</p>
                        </td>
                        <td className="py-3 px-3 text-center"><span className="text-atlas-text font-medium text-sm">{s.lessonsCompleted}</span></td>
                        <td className="py-3 px-3 text-center">
                          {s.avgScore !== null
                            ? <span className={`font-bold text-sm ${s.avgScore >= 80 ? 'text-atlas-emerald' : s.avgScore >= 60 ? 'text-atlas-amber' : 'text-atlas-red'}`}>{s.avgScore}%</span>
                            : <span className="text-atlas-subtle text-xs">No score</span>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-sm font-medium ${s.aiInteractions > 0 ? 'text-atlas-purple' : 'text-atlas-subtle'}`}>{s.aiInteractions}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'socratic' && (
            <div className="animate-fade-in atlas-card">
              <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">💬 Student–AI Interactions</h3>
              {socraticLog.length === 0 ? (
                <p className="text-atlas-subtle text-sm text-center py-8">No AI interactions yet. Students can ask Socratic questions while working through lessons.</p>
              ) : (
                <div className="space-y-4">
                  {socraticLog.map(entry => (
                    <div key={entry.id} className="p-4 bg-atlas-surface rounded-xl border border-atlas-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm text-atlas-text">{entry.student_name}</span>
                        <div className="flex items-center gap-2">
                          {entry.lesson_title && <span className="badge bg-atlas-blue/10 text-atlas-blue border-atlas-blue/20 text-xs">{entry.lesson_title}</span>}
                          <span className="text-xs text-atlas-subtle">{new Date(entry.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <p className="text-sm text-atlas-subtle italic">"{entry.student_question}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
