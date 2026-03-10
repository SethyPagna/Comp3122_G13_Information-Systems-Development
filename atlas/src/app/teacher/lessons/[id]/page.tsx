'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Lesson, LessonSection, QuizQuestion, GlossaryTerm } from '@/types'
import { getStatusBadge, formatRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'

type Tab = 'overview' | 'sections' | 'questions' | 'glossary' | 'analytics'

export default function TeacherLessonDetail() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string
  const supabase = createClient()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [sections, setSections] = useState<LessonSection[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingSection, setEditingSection] = useState<string | null>(null)

  useEffect(() => { loadLesson() }, [lessonId])

  const loadLesson = async () => {
    const [lessonRes, sectionsRes, questionsRes, glossaryRes] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle(),
      supabase.from('lesson_sections').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('quiz_questions').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('glossary_terms').select('*').eq('lesson_id', lessonId),
    ])
    setLesson(lessonRes.data)
    setSections(sectionsRes.data || [])
    setQuestions(questionsRes.data || [])
    setGlossary(glossaryRes.data || [])
    setLoading(false)
  }

  const updateLesson = async (updates: Partial<Lesson>) => {
    setSaving(true)
    const updated = { ...lesson, ...updates } as Lesson
    setLesson(updated)
    await supabase.from('lessons').update(updates).eq('id', lessonId)
    setSaving(false)
    toast.success('Saved')
  }

  const publishLesson = async () => {
    await updateLesson({ status: 'published' })
    toast.success('🚀 Lesson published! Students can now access it.')
  }

  const updateSection = async (sectionId: string, updates: Partial<LessonSection>) => {
    await supabase.from('lesson_sections').update(updates).eq('id', sectionId)
    setSections(sections.map(s => s.id === sectionId ? { ...s, ...updates } : s))
    setEditingSection(null)
    toast.success('Section updated')
  }

  const addSection = async () => {
    const { data } = await supabase.from('lesson_sections').insert({
      lesson_id: lessonId,
      title: 'New Section',
      content: '',
      content_type: 'text',
      order_index: sections.length,
      duration_minutes: 5,
    }).select().single()
    if (data) {
      setSections([...sections, data])
      setEditingSection(data.id)
    }
  }

  const deleteSection = async (id: string) => {
    await supabase.from('lesson_sections').delete().eq('id', id)
    setSections(sections.filter(s => s.id !== id))
    toast.success('Section removed')
  }

  if (loading) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="h-12 w-72 bg-atlas-card rounded-xl shimmer mb-6" />
      <div className="h-64 bg-atlas-card rounded-2xl shimmer" />
    </div>
  )

  if (!lesson) return (
    <div className="p-6 text-center">
      <p className="text-atlas-subtle">Lesson not found</p>
      <button onClick={() => router.push('/teacher/lessons')} className="btn-primary mt-4">Back to Lessons</button>
    </div>
  )

  const badge = getStatusBadge(lesson.status)

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <button onClick={() => router.push('/teacher/lessons')} className="btn-ghost mt-1">←</button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className={`badge ${badge.className}`}>{badge.label}</span>
              {lesson.ai_generated && <span className="badge bg-atlas-purple/10 text-atlas-purple border-atlas-purple/20">✨ AI Generated</span>}
            </div>
            <h1 className="font-display font-bold text-3xl text-atlas-text">{lesson.title}</h1>
            <p className="text-atlas-subtle mt-1">Updated {formatRelativeTime(lesson.updated_at)}</p>
          </div>
        </div>
        <div className="flex gap-3">
          {lesson.status === 'draft' && (
            <button onClick={publishLesson} className="btn-primary glow-blue">
              🚀 Publish
            </button>
          )}
          {lesson.status === 'published' && (
            <button onClick={() => updateLesson({ status: 'draft' })} className="btn-secondary">
              Unpublish
            </button>
          )}
          {saving && <span className="text-atlas-subtle text-sm self-center">Saving...</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-atlas-border pb-0 overflow-x-auto">
        {([
          { key: 'overview', label: '📋 Overview' },
          { key: 'sections', label: `📚 Sections (${sections.length})` },
          { key: 'questions', label: `❓ Questions (${questions.length})` },
          { key: 'glossary', label: `📖 Glossary (${glossary.length})` },
          { key: 'analytics', label: '📊 Analytics' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={`px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? 'border-atlas-blue text-atlas-blue' : 'border-transparent text-atlas-subtle hover:text-atlas-text'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="lg:col-span-2 space-y-4">
            <div className="atlas-card">
              <label className="block text-sm font-medium text-atlas-subtle mb-2">Title</label>
              <input defaultValue={lesson.title}
                onBlur={e => updateLesson({ title: e.target.value })}
                className="atlas-input font-display font-bold text-xl"
              />
            </div>
            <div className="atlas-card">
              <label className="block text-sm font-medium text-atlas-subtle mb-2">Description</label>
              <textarea defaultValue={lesson.description || ''}
                onBlur={e => updateLesson({ description: e.target.value })}
                rows={3} className="atlas-textarea"
              />
            </div>
            <div className="atlas-card">
              <h3 className="font-semibold text-atlas-text mb-3">Learning Objectives</h3>
              <div className="space-y-2">
                {(lesson.objectives || []).map((obj, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-atlas-blue font-bold text-sm w-5">{i+1}.</span>
                    <input defaultValue={obj}
                      onBlur={e => {
                        const objectives = [...(lesson.objectives || [])]
                        objectives[i] = e.target.value
                        updateLesson({ objectives })
                      }}
                      className="atlas-input py-2 flex-1"
                    />
                  </div>
                ))}
                <button onClick={() => updateLesson({ objectives: [...(lesson.objectives || []), ''] })}
                  className="text-atlas-blue text-sm hover:underline">+ Add objective</button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Sliders */}
            <div className="atlas-card">
              <h3 className="font-semibold text-atlas-text mb-4">Differentiation</h3>
              {[
                { key: 'complexity_slider', label: 'Complexity', value: lesson.complexity_slider, color: '#4F86F7' },
                { key: 'pacing_slider', label: 'Pacing', value: lesson.pacing_slider, color: '#F5A623' },
                { key: 'scaffolding_slider', label: 'Scaffolding', value: lesson.scaffolding_slider, color: '#23D18B' },
              ].map(({ key, label, value, color }) => (
                <div key={key} className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-atlas-subtle">{label}</span>
                    <span className="font-bold" style={{ color }}>{value}%</span>
                  </div>
                  <input type="range" min={0} max={100} defaultValue={value}
                    onMouseUp={e => updateLesson({ [key]: Number((e.target as HTMLInputElement).value) })}
                    style={{ accentColor: color }}
                  />
                </div>
              ))}
            </div>

            {/* Meta */}
            <div className="atlas-card space-y-3">
              <div>
                <label className="block text-xs text-atlas-subtle mb-1">Subject</label>
                <input defaultValue={lesson.subject || ''}
                  onBlur={e => updateLesson({ subject: e.target.value })}
                  className="atlas-input py-2" placeholder="e.g. Biology"
                />
              </div>
              <div>
                <label className="block text-xs text-atlas-subtle mb-1">Duration (minutes)</label>
                <input type="number" defaultValue={lesson.estimated_duration}
                  onBlur={e => updateLesson({ estimated_duration: Number(e.target.value) })}
                  className="atlas-input py-2"
                />
              </div>
              <div>
                <label className="block text-xs text-atlas-subtle mb-1">Difficulty</label>
                <select defaultValue={lesson.difficulty}
                  onChange={e => updateLesson({ difficulty: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
                  className="atlas-input py-2">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>

            {/* Assign to class */}
            <div className="atlas-card">
              <h3 className="font-semibold text-atlas-text mb-2">Quick Assign</h3>
              <p className="text-xs text-atlas-subtle mb-3">Assign this lesson to a class</p>
              <button onClick={() => toast('Go to Students page to manage class assignments')} className="btn-secondary w-full justify-center text-sm py-2">
                Assign to Class →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTIONS TAB */}
      {tab === 'sections' && (
        <div className="animate-fade-in space-y-4">
          {sections.map((section, i) => (
            <div key={section.id} className="atlas-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-atlas-blue/20 text-atlas-blue text-xs font-bold flex items-center justify-center">{i+1}</span>
                  {editingSection === section.id ? (
                    <input defaultValue={section.title}
                      onBlur={e => updateSection(section.id, { title: e.target.value })}
                      className="atlas-input py-1.5 font-semibold"
                      autoFocus
                    />
                  ) : (
                    <h3 className="font-semibold text-atlas-text">{section.title}</h3>
                  )}
                  <span className="badge bg-atlas-muted/30 text-atlas-subtle text-xs">{section.content_type}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingSection(editingSection === section.id ? null : section.id)}
                    className="btn-ghost text-xs py-1">
                    {editingSection === section.id ? 'Close' : '✏️ Edit'}
                  </button>
                  <button onClick={() => deleteSection(section.id)}
                    className="btn-ghost text-xs py-1 text-atlas-red hover:text-atlas-red">🗑</button>
                </div>
              </div>
              {editingSection === section.id ? (
                <textarea defaultValue={section.content || ''}
                  onBlur={e => updateSection(section.id, { content: e.target.value })}
                  rows={8} className="atlas-textarea text-sm"
                />
              ) : (
                <p className="text-atlas-subtle text-sm line-clamp-3">{section.content || 'No content yet'}</p>
              )}
              <p className="text-xs text-atlas-subtle mt-2">⏱ {section.duration_minutes} min</p>
            </div>
          ))}
          <button onClick={addSection}
            className="w-full py-4 border-2 border-dashed border-atlas-border rounded-2xl text-atlas-subtle hover:border-atlas-blue hover:text-atlas-blue transition-all">
            + Add Section
          </button>
        </div>
      )}

      {/* QUESTIONS TAB */}
      {tab === 'questions' && (
        <div className="animate-fade-in space-y-4">
          <div className="flex gap-3 mb-4">
            {[
              { label: '🔍 Diagnostic', count: questions.filter(q=>q.is_diagnostic).length, color: 'purple' },
              { label: '⚡ Micro-Check', count: questions.filter(q=>q.is_micro_check).length, color: 'cyan' },
              { label: '🏆 Final Quiz', count: questions.filter(q=>q.is_final_quiz).length, color: 'amber' },
            ].map((stat, i) => (
              <div key={i} className="atlas-card flex-1 py-3 px-4">
                <p className="text-xs text-atlas-subtle">{stat.label}</p>
                <p className={`font-display font-bold text-2xl text-atlas-${stat.color}`}>{stat.count}</p>
              </div>
            ))}
          </div>
          {questions.map((q, i) => (
            <div key={q.id} className="atlas-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {q.is_diagnostic && <span className="badge bg-atlas-purple/10 text-atlas-purple border-atlas-purple/20 text-xs">Diagnostic</span>}
                    {q.is_micro_check && <span className="badge bg-atlas-cyan/10 text-atlas-cyan border-atlas-cyan/20 text-xs">Micro-Check</span>}
                    {q.is_final_quiz && <span className="badge bg-atlas-amber/10 text-atlas-amber border-atlas-amber/20 text-xs">Final Quiz</span>}
                    <span className={`badge bg-atlas-muted/30 text-xs ${
                      q.difficulty === 'beginner' ? 'text-atlas-emerald' :
                      q.difficulty === 'intermediate' ? 'text-atlas-amber' : 'text-atlas-red'
                    }`}>{q.difficulty}</span>
                  </div>
                  <p className="font-medium text-atlas-text text-sm">{i+1}. {q.question_text}</p>
                </div>
              </div>
              {q.options && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {q.options.map(opt => (
                    <div key={opt.id} className={`text-xs px-3 py-2 rounded-lg ${opt.is_correct ? 'bg-atlas-emerald/10 text-atlas-emerald border border-atlas-emerald/20' : 'bg-atlas-muted/20 text-atlas-subtle'}`}>
                      {opt.is_correct && '✓ '}{opt.text}
                    </div>
                  ))}
                </div>
              )}
              {q.explanation && (
                <p className="text-xs text-atlas-subtle mt-3 italic">💡 {q.explanation}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* GLOSSARY TAB */}
      {tab === 'glossary' && (
        <div className="animate-fade-in grid grid-cols-1 sm:grid-cols-2 gap-4">
          {glossary.map((term, i) => (
            <div key={term.id} className="atlas-card">
              <p className="font-display font-bold text-atlas-text">{term.term}</p>
              <p className="text-atlas-subtle text-sm mt-1">{term.definition}</p>
              {term.example && <p className="text-atlas-cyan text-xs mt-2 italic">Example: {term.example}</p>}
            </div>
          ))}
          {glossary.length === 0 && (
            <div className="col-span-2 text-center py-8 atlas-card">
              <p className="text-atlas-subtle">No glossary terms yet. AI will add them when generating lessons.</p>
            </div>
          )}
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && (
        <div className="animate-fade-in">
          <div className="atlas-card text-center py-12">
            <span className="text-5xl block mb-4">📊</span>
            <h3 className="font-display font-bold text-xl text-atlas-text mb-2">Analytics Coming Soon</h3>
            <p className="text-atlas-subtle mb-4">Publish the lesson and assign it to students to see real-time analytics</p>
            {lesson.status === 'draft' && (
              <button onClick={publishLesson} className="btn-primary inline-flex">🚀 Publish Lesson</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
