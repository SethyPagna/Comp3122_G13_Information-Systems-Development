'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Lesson } from '@/types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatRelativeTime } from '@/lib/utils'

interface StudentStat {
  id: string; name: string; email: string
  lessonsCompleted: number; avgScore: number | null; aiInteractions: number
  status: 'on_track' | 'at_risk' | 'advanced'
}

interface LessonStat {
  id: string; title: string
  studentsStarted: number; studentsCompleted: number; avgScore: number | null
  knowledgeGaps: string[]
}

interface SocraticEntry {
  id: string; student_name: string; student_question: string; created_at: string; lesson_title?: string
}

type Tab = 'overview' | 'heatmap' | 'students' | 'socratic' | 'interventions'

export default function TeacherAnalytics() {
  const [lessons,        setLessons]        = useState<Lesson[]>([])
  const [lessonStats,    setLessonStats]    = useState<LessonStat[]>([])
  const [studentStats,   setStudentStats]   = useState<StudentStat[]>([])
  const [socraticLog,    setSocraticLog]    = useState<SocraticEntry[]>([])
  const [tab,            setTab]            = useState<Tab>('overview')
  const [selectedLesson, setSelectedLesson] = useState<string>('all')
  const [loading,        setLoading]        = useState(true)
  const [aiSuggestions,  setAiSuggestions]  = useState<string[]>([])
  const [gettingSuggestions, setGettingSuggestions] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: lessonData } = await supabase
      .from('lessons').select('*').eq('teacher_id', user.id).order('created_at', { ascending: false })

    const myLessons: Lesson[] = lessonData || []
    setLessons(myLessons)

    if (myLessons.length === 0) { setLoading(false); return }

    const lessonIds = myLessons.map(l => l.id)

    const { data: progressData } = await supabase
      .from('student_progress').select('*').in('lesson_id', lessonIds)

    const { data: socraticData } = await supabase
      .from('socratic_interactions').select('id, student_question, created_at, student_id, lesson_id')
      .in('lesson_id', lessonIds).order('created_at', { ascending: false }).limit(30)

    // Student IDs for profile lookup
    const allStudentIds = Array.from(new Set([
      ...(progressData || []).map((p: any) => p.student_id),
      ...(socraticData  || []).map((s: any) => s.student_id),
    ]))

    const profileMap = new Map<string, { full_name: string; email: string }>()
    if (allStudentIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles').select('id, full_name, email').in('id', allStudentIds)
      ;(profileData || []).forEach((p: any) => profileMap.set(p.id, { full_name: p.full_name, email: p.email }))
    }

    // Build lesson stats
    const lStats: LessonStat[] = myLessons.map(lesson => {
      const lp = (progressData || []).filter((p: any) => p.lesson_id === lesson.id)
      const scores = lp.filter((p: any) => p.score !== null).map((p: any) => p.score)
      const gaps = lp.flatMap((p: any) => p.knowledge_gaps || [])
      const gapCounts: Record<string, number> = {}
      gaps.forEach((g: string) => { gapCounts[g] = (gapCounts[g] || 0) + 1 })
      const topGaps = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g)
      return {
        id: lesson.id, title: lesson.title,
        studentsStarted:    lp.filter((p: any) => p.status !== 'not_started').length,
        studentsCompleted:  lp.filter((p: any) => p.status === 'completed').length,
        avgScore: scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null,
        knowledgeGaps: topGaps,
      }
    })
    setLessonStats(lStats)

    // Build student stats
    const studentMap = new Map<string, StudentStat>()
    for (const p of (progressData || [])) {
      const prof = profileMap.get(p.student_id)
      const existing = studentMap.get(p.student_id) ?? {
        id: p.student_id, name: prof?.full_name || 'Unknown', email: prof?.email || '',
        lessonsCompleted: 0, avgScore: null, aiInteractions: 0, status: 'on_track' as const,
      }
      if (p.status === 'completed') existing.lessonsCompleted++
      if (p.score !== null) {
        existing.avgScore = existing.avgScore === null ? p.score : Math.round((existing.avgScore + p.score) / 2)
      }
      studentMap.set(p.student_id, existing)
    }
    for (const s of (socraticData || [])) {
      const e = studentMap.get(s.student_id)
      if (e) { e.aiInteractions++; studentMap.set(s.student_id, e) }
    }
    // Classify status
    const students = Array.from(studentMap.values()).map(s => ({
      ...s,
      status: (s.avgScore === null ? 'on_track' : s.avgScore >= 80 ? 'advanced' : s.avgScore < 60 ? 'at_risk' : 'on_track') as StudentStat['status'],
    }))
    setStudentStats(students)

    // Socratic log
    const titleMap = new Map(myLessons.map(l => [l.id, l.title]))
    setSocraticLog((socraticData || []).map((s: any) => ({
      id: s.id, student_name: profileMap.get(s.student_id)?.full_name || 'Unknown',
      student_question: s.student_question, created_at: s.created_at, lesson_title: titleMap.get(s.lesson_id),
    })))

    setLoading(false)
  }

  const getInterventions = async () => {
    setGettingSuggestions(true)
    try {
      const res  = await fetch('/api/ai/analytics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentStats, lessonStats }),
      })
      const data = await res.json()
      if (data.suggestions) setAiSuggestions(data.suggestions)
      else setAiSuggestions(['No specific interventions needed at this time.'])
    } catch {
      setAiSuggestions(['Could not load AI suggestions. Check your OpenRouter API key.'])
    }
    setGettingSuggestions(false)
  }

  const filteredLessonStats = selectedLesson === 'all' ? lessonStats : lessonStats.filter(l => l.id === selectedLesson)
  const atRisk    = studentStats.filter(s => s.status === 'at_risk')
  const advanced  = studentStats.filter(s => s.status === 'advanced')
  const onTrack   = studentStats.filter(s => s.status === 'on_track')
  const avgScore  = studentStats.filter(s => s.avgScore !== null).length > 0
    ? Math.round(studentStats.filter(s => s.avgScore !== null).reduce((a, s) => a + (s.avgScore || 0), 0) / studentStats.filter(s => s.avgScore !== null).length) : 0
  const allGaps   = lessonStats.flatMap(l => l.knowledgeGaps)
  const gapCounts: Record<string, number> = {}
  allGaps.forEach(g => { gapCounts[g] = (gapCounts[g] || 0) + 1 })
  const topGaps   = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const chartData = filteredLessonStats.map(l => ({
    name: l.title.length > 16 ? l.title.slice(0, 14) + '…' : l.title,
    Started: l.studentsStarted, Completed: l.studentsCompleted, Score: l.avgScore ?? 0,
  }))

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',      label: '📊 Overview' },
    { key: 'heatmap',       label: '🌡️ Heat Map' },
    { key: 'students',      label: '👥 Students' },
    { key: 'interventions', label: '💡 Interventions' },
    { key: 'socratic',      label: '💬 Socratic Log' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">Analytics Dashboard</h1>
          <p className="text-atlas-subtle">Real-time classroom insights</p>
        </div>
        <select value={selectedLesson} onChange={e => setSelectedLesson(e.target.value)} className="atlas-input w-56 py-2">
          <option value="all">All Lessons</option>
          {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Students',    value: loading ? '…' : studentStats.length,                                          icon: '👥', color: 'blue'    },
          { label: 'Class Avg Score',   value: loading ? '…' : studentStats.length === 0 ? 'N/A' : `${avgScore}%`,           icon: '🎯', color: 'emerald' },
          { label: 'At Risk (<60%)',    value: loading ? '…' : atRisk.length,                                                  icon: '⚠️', color: 'red'     },
          { label: 'AI Interactions',   value: loading ? '…' : studentStats.reduce((a, s) => a + s.aiInteractions, 0),        icon: '💬', color: 'purple'  },
        ].map((s, i) => (
          <div key={i} className="atlas-card">
            <span className="text-xl block mb-2">{s.icon}</span>
            <p className="font-display font-bold text-2xl text-atlas-text">{s.value}</p>
            <p className="text-atlas-subtle text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key ? 'bg-atlas-blue text-white' : 'bg-atlas-card text-atlas-subtle hover:text-atlas-text border border-atlas-border'
            }`}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-atlas-card rounded-2xl shimmer" />)}</div>
      ) : lessons.length === 0 ? (
        <div className="atlas-card text-center py-16">
          <span className="text-5xl block mb-4">📊</span>
          <h2 className="font-display font-bold text-xl text-atlas-text mb-2">No data yet</h2>
          <p className="text-atlas-subtle">Create and assign lessons to students to see analytics.</p>
        </div>
      ) : (
        <>
          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="animate-fade-in space-y-6">
              <div className="atlas-card">
                <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">Lesson Completion</h3>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" tick={{ fill: '#8B95A7', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#8B95A7', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 8, color: '#E8EDF5' }} />
                      <Bar dataKey="Started"   fill="#4F86F7" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Completed" fill="#23D18B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-atlas-subtle text-sm text-center py-8">No student progress recorded yet.</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLessonStats.map(lesson => (
                  <div key={lesson.id} className="atlas-card">
                    <p className="font-semibold text-atlas-text text-sm mb-3 truncate">{lesson.title}</p>
                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between"><span className="text-atlas-subtle">Started</span><span className="text-atlas-blue font-medium">{lesson.studentsStarted}</span></div>
                      <div className="flex justify-between"><span className="text-atlas-subtle">Completed</span><span className="text-atlas-emerald font-medium">{lesson.studentsCompleted}</span></div>
                      <div className="flex justify-between"><span className="text-atlas-subtle">Avg Score</span>
                        <span className={`font-bold ${lesson.avgScore === null ? 'text-atlas-subtle' : lesson.avgScore >= 80 ? 'text-atlas-emerald' : lesson.avgScore >= 60 ? 'text-atlas-amber' : 'text-atlas-red'}`}>
                          {lesson.avgScore !== null ? `${lesson.avgScore}%` : 'N/A'}
                        </span>
                      </div>
                    </div>
                    {lesson.knowledgeGaps.length > 0 && (
                      <div className="pt-2 border-t border-atlas-border">
                        <p className="text-xs text-atlas-subtle mb-1">Top Gaps</p>
                        <div className="flex flex-wrap gap-1">
                          {lesson.knowledgeGaps.map(g => (
                            <span key={g} className="badge bg-atlas-red/10 text-atlas-red border-atlas-red/20 text-xs">{g}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── HEAT MAP ── */}
          {tab === 'heatmap' && (
            <div className="animate-fade-in space-y-6">
              {/* Class readiness */}
              <div className="atlas-card">
                <h3 className="font-display font-semibold text-lg text-atlas-text mb-2">🌡️ Classroom Readiness Map</h3>
                <p className="text-atlas-subtle text-sm mb-5">Color-coded view of student understanding across concepts</p>
                {studentStats.length === 0 ? (
                  <p className="text-atlas-subtle text-sm text-center py-8">No student data yet. Assign lessons to get started.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b border-atlas-border">
                          <th className="text-left text-xs text-atlas-subtle font-medium pb-3 pr-4">Student</th>
                          {filteredLessonStats.slice(0, 5).map(l => (
                            <th key={l.id} className="text-center text-xs text-atlas-subtle font-medium pb-3 px-2 max-w-[100px]">
                              <span className="block truncate">{l.title.slice(0, 14)}{l.title.length > 14 ? '…' : ''}</span>
                            </th>
                          ))}
                          <th className="text-center text-xs text-atlas-subtle font-medium pb-3 px-2">Overall</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentStats.map(student => (
                          <tr key={student.id} className="border-b border-atlas-border/50 hover:bg-atlas-surface/50">
                            <td className="py-3 pr-4">
                              <p className="text-sm font-medium text-atlas-text">{student.name}</p>
                              <p className="text-xs text-atlas-subtle">{student.email}</p>
                            </td>
                            {filteredLessonStats.slice(0, 5).map(l => {
                              const score = l.avgScore
                              return (
                                <td key={l.id} className="py-3 px-2 text-center">
                                  <div className={`w-8 h-8 rounded-lg mx-auto flex items-center justify-center text-xs font-bold ${
                                    score === null ? 'bg-atlas-muted/20 text-atlas-subtle' :
                                    score >= 80 ? 'bg-atlas-emerald/20 text-atlas-emerald border border-atlas-emerald/30' :
                                    score >= 60 ? 'bg-atlas-amber/20 text-atlas-amber border border-atlas-amber/30' :
                                    'bg-atlas-red/20 text-atlas-red border border-atlas-red/30'
                                  }`}>
                                    {score !== null ? `${score}` : '—'}
                                  </div>
                                </td>
                              )
                            })}
                            <td className="py-3 px-2 text-center">
                              <span className={`font-bold text-sm ${
                                student.status === 'advanced' ? 'text-atlas-emerald' :
                                student.status === 'at_risk'  ? 'text-atlas-red' : 'text-atlas-amber'
                              }`}>
                                {student.avgScore !== null ? `${student.avgScore}%` : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex gap-4 mt-4 text-xs text-atlas-subtle">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-atlas-emerald/20 border border-atlas-emerald/30 inline-block" /> ≥80% Mastered</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-atlas-amber/20 border border-atlas-amber/30 inline-block" /> 60–79% Developing</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-atlas-red/20 border border-atlas-red/30 inline-block" /> &lt;60% At Risk</span>
                </div>
              </div>

              {/* Knowledge gap summary */}
              {topGaps.length > 0 && (
                <div className="atlas-card">
                  <h3 className="font-display font-semibold text-lg text-atlas-text mb-2">📍 Class-Wide Knowledge Gaps</h3>
                  <p className="text-atlas-subtle text-sm mb-4">Concepts where multiple students are struggling</p>
                  <div className="space-y-3">
                    {topGaps.map(([gap, count]) => (
                      <div key={gap} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-atlas-text font-medium">{gap}</span>
                            <span className="text-atlas-red text-xs font-bold">{count} student{count > 1 ? 's' : ''}</span>
                          </div>
                          <div className="h-2 bg-atlas-muted/20 rounded-full">
                            <div className="h-full bg-atlas-red/50 rounded-full" style={{ width: `${Math.min(100, (count / Math.max(1, studentStats.length)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STUDENTS ── */}
          {tab === 'students' && (
            <div className="animate-fade-in space-y-4">
              <div className="grid grid-cols-3 gap-4 mb-2">
                {[
                  { label: '🚀 Advanced', count: advanced.length, color: 'emerald', items: advanced },
                  { label: '📖 On Track', count: onTrack.length,  color: 'blue',    items: onTrack },
                  { label: '⚠️ At Risk',  count: atRisk.length,   color: 'red',     items: atRisk },
                ].map((group, i) => (
                  <div key={i} className="atlas-card py-3 px-4">
                    <p className="text-xs text-atlas-subtle mb-1">{group.label}</p>
                    <p className={`font-display font-bold text-2xl text-atlas-${group.color}`}>{group.count}</p>
                  </div>
                ))}
              </div>
              <div className="atlas-card overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="text-left border-b border-atlas-border">
                      <th className="text-xs text-atlas-subtle font-medium pb-3 pr-4">Student</th>
                      <th className="text-xs text-atlas-subtle font-medium pb-3 px-3 text-center">Status</th>
                      <th className="text-xs text-atlas-subtle font-medium pb-3 px-3 text-center">Completed</th>
                      <th className="text-xs text-atlas-subtle font-medium pb-3 px-3 text-center">Avg Score</th>
                      <th className="text-xs text-atlas-subtle font-medium pb-3 px-3 text-center">AI Chats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentStats.length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-atlas-subtle text-sm">No students have started your lessons yet.</td></tr>
                    ) : studentStats.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)).map(s => (
                      <tr key={s.id} className="border-b border-atlas-border/50 hover:bg-atlas-surface/50">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-atlas-text text-sm">{s.name}</p>
                          <p className="text-xs text-atlas-subtle">{s.email}</p>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`badge text-xs ${
                            s.status === 'advanced' ? 'bg-atlas-emerald/10 text-atlas-emerald border-atlas-emerald/20' :
                            s.status === 'at_risk'  ? 'bg-atlas-red/10 text-atlas-red border-atlas-red/20' :
                            'bg-atlas-blue/10 text-atlas-blue border-atlas-blue/20'
                          }`}>{s.status === 'at_risk' ? 'At Risk' : s.status === 'advanced' ? 'Advanced' : 'On Track'}</span>
                        </td>
                        <td className="py-3 px-3 text-center text-sm text-atlas-text font-medium">{s.lessonsCompleted}</td>
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
              </div>
            </div>
          )}

          {/* ── INTERVENTIONS ── */}
          {tab === 'interventions' && (
            <div className="animate-fade-in space-y-6">
              <div className="atlas-card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display font-semibold text-lg text-atlas-text">💡 AI Intervention Suggestions</h3>
                    <p className="text-atlas-subtle text-sm mt-1">Personalized action recommendations based on your class data</p>
                  </div>
                  <button onClick={getInterventions} disabled={gettingSuggestions}
                    className="btn-primary text-sm py-2 flex-shrink-0">
                    {gettingSuggestions ? '⏳ Analyzing...' : '✨ Get Suggestions'}
                  </button>
                </div>
                {aiSuggestions.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="text-4xl block mb-3">🤖</span>
                    <p className="text-atlas-subtle text-sm">Click "Get Suggestions" to have Atlas AI analyze your class data and recommend specific actions.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aiSuggestions.map((s, i) => (
                      <div key={i} className="flex gap-3 p-4 bg-atlas-blue/5 border border-atlas-blue/20 rounded-xl">
                        <span className="text-atlas-blue font-bold text-sm flex-shrink-0 mt-0.5">{i + 1}.</span>
                        <p className="text-atlas-text text-sm">{s}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* At-risk students quick view */}
              {atRisk.length > 0 && (
                <div className="atlas-card">
                  <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">⚠️ Students Needing Support</h3>
                  <div className="space-y-3">
                    {atRisk.map(s => (
                      <div key={s.id} className="flex items-center gap-4 p-3 bg-atlas-red/5 border border-atlas-red/20 rounded-xl">
                        <div className="w-9 h-9 rounded-full bg-atlas-red/20 text-atlas-red flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-atlas-text text-sm">{s.name}</p>
                          <p className="text-xs text-atlas-subtle">{s.email}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-atlas-red">{s.avgScore}%</p>
                          <p className="text-xs text-atlas-subtle">{s.aiInteractions} AI chats</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced students */}
              {advanced.length > 0 && (
                <div className="atlas-card">
                  <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">🚀 Advanced Students</h3>
                  <p className="text-atlas-subtle text-sm mb-3">Consider enrichment activities or peer tutoring assignments for these students.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {advanced.map(s => (
                      <div key={s.id} className="p-3 bg-atlas-emerald/5 border border-atlas-emerald/20 rounded-xl text-center">
                        <p className="font-medium text-atlas-text text-sm">{s.name}</p>
                        <p className="font-bold text-atlas-emerald">{s.avgScore}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SOCRATIC LOG ── */}
          {tab === 'socratic' && (
            <div className="animate-fade-in atlas-card">
              <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">💬 Student–AI Interactions</h3>
              {socraticLog.length === 0 ? (
                <p className="text-atlas-subtle text-sm text-center py-8">No AI interactions yet. Students can use "Ask Socratic" while working through lessons.</p>
              ) : (
                <div className="space-y-3">
                  {socraticLog.map(entry => (
                    <div key={entry.id} className="p-4 bg-atlas-surface rounded-xl border border-atlas-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm text-atlas-text">{entry.student_name}</span>
                        <div className="flex gap-2 items-center">
                          {entry.lesson_title && <span className="badge bg-atlas-blue/10 text-atlas-blue border-atlas-blue/20 text-xs">{entry.lesson_title.slice(0, 20)}{entry.lesson_title.length > 20 ? '…' : ''}</span>}
                          <span className="text-xs text-atlas-subtle">{formatRelativeTime(entry.created_at)}</span>
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
