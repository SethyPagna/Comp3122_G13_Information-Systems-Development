'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import type { AILessonDraft, LessonSection, QuizQuestion } from '@/types'

type ImportMode = 'url' | 'text' | 'objectives'
type Step = 'import' | 'generating' | 'customize' | 'preview'

export default function CreateLesson() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>('import')
  const [importMode, setImportMode] = useState<ImportMode>('objectives')
  const [inputText, setInputText] = useState('')
  const [aiDraft, setAiDraft] = useState<AILessonDraft | null>(null)
  const [generatingStep, setGeneratingStep] = useState(0)
  const [complexity, setComplexity] = useState(50)
  const [pacing, setPacing] = useState(50)
  const [scaffolding, setScaffolding] = useState(50)
  const [editedDraft, setEditedDraft] = useState<AILessonDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const generatingSteps = [
    '🔍 Analyzing content...',
    '🧠 Identifying learning objectives...',
    '📐 Structuring lesson flow...',
    '✏️ Generating sections...',
    '❓ Creating quiz questions...',
    '📖 Building glossary...',
    '✅ Finalizing lesson...'
  ]

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      toast.error('Please provide content to generate from')
      return
    }

    setStep('generating')
    let currentStep = 0
    const stepInterval = setInterval(() => {
      currentStep++
      setGeneratingStep(Math.min(currentStep, generatingSteps.length - 1))
    }, 800)

    try {
      const response = await fetch('/api/ai/create-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: importMode, content: inputText, complexity, pacing, scaffolding })
      })
      const data = await response.json()
      clearInterval(stepInterval)
      setGeneratingStep(generatingSteps.length - 1)
      
      if (data.lesson) {
        setTimeout(() => {
          setAiDraft(data.lesson)
          setEditedDraft(data.lesson)
          setStep('customize')
        }, 600)
      } else {
        toast.error('Failed to generate lesson')
        setStep('import')
      }
    } catch {
      clearInterval(stepInterval)
      toast.error('Generation failed. Please try again.')
      setStep('import')
    }
  }

  const handlePublish = async (status: 'draft' | 'published') => {
    if (!editedDraft) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: lesson, error } = await supabase.from('lessons').insert({
      teacher_id: user.id,
      title: editedDraft.title,
      description: editedDraft.description,
      objectives: editedDraft.objectives,
      status,
      estimated_duration: editedDraft.estimated_duration,
      prerequisites: editedDraft.prerequisites,
      tags: editedDraft.tags,
      ai_generated: true,
      complexity_slider: complexity,
      pacing_slider: pacing,
      scaffolding_slider: scaffolding,
    }).select().single()

    if (error || !lesson) {
      toast.error('Failed to save lesson')
      setSaving(false)
      return
    }

    // Insert sections
    await supabase.from('lesson_sections').insert(
      editedDraft.sections.map((s, i) => ({
        lesson_id: lesson.id,
        title: s.title,
        content: s.content,
        content_type: s.content_type,
        order_index: i,
        duration_minutes: s.duration_minutes,
      }))
    )

    // Insert quiz questions
    await supabase.from('quiz_questions').insert(
      editedDraft.quiz_questions.map((q, i) => ({
        lesson_id: lesson.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        explanation: q.explanation,
        difficulty: q.difficulty,
        is_diagnostic: q.is_diagnostic,
        is_micro_check: q.is_micro_check,
        is_final_quiz: q.is_final_quiz,
        order_index: i,
      }))
    )

    // Insert glossary
    await supabase.from('glossary_terms').insert(
      editedDraft.glossary_terms.map(t => ({
        lesson_id: lesson.id,
        term: t.term,
        definition: t.definition,
        example: t.example,
      }))
    )

    toast.success(status === 'published' ? '🎉 Lesson published!' : '💾 Saved as draft')
    router.push(`/teacher/lessons/${lesson.id}`)
  }

  const updateSection = (idx: number, field: string, value: string) => {
    if (!editedDraft) return
    const sections = [...editedDraft.sections]
    sections[idx] = { ...sections[idx], [field]: value }
    setEditedDraft({ ...editedDraft, sections })
  }

  const removeSection = (idx: number) => {
    if (!editedDraft) return
    setEditedDraft({ ...editedDraft, sections: editedDraft.sections.filter((_, i) => i !== idx) })
  }

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="btn-ghost">← Back</button>
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">Lesson Creation Studio</h1>
          <p className="text-atlas-subtle">AI-powered lesson generation with full customization</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['import', 'customize', 'preview'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              step === s || (step === 'generating' && s === 'import')
                ? 'bg-atlas-blue text-white shadow-glow-blue'
                : step === 'customize' && s === 'import' || step === 'preview'
                  ? 'bg-atlas-emerald/20 text-atlas-emerald border border-atlas-emerald/30'
                  : 'bg-atlas-card text-atlas-subtle border border-atlas-border'
            }`}>{i + 1}</div>
            <span className="text-sm text-atlas-subtle capitalize hidden sm:block">{s}</span>
            {i < 2 && <span className="text-atlas-border mx-1">—</span>}
          </div>
        ))}
      </div>

      {/* STEP 1: Import */}
      {step === 'import' && (
        <div className="animate-slide-up">
          <div className="atlas-card mb-6">
            <h2 className="font-display font-bold text-xl text-atlas-text mb-2">Smart Import</h2>
            <p className="text-atlas-subtle mb-6">Tell Atlas what your lesson is about — it'll do the rest.</p>

            {/* Mode selector */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {([
                { mode: 'url' as const, icon: '🔗', label: 'URL', desc: 'Paste a website link' },
                { mode: 'text' as const, icon: '📄', label: 'Document', desc: 'Paste content directly' },
                { mode: 'objectives' as const, icon: '🎯', label: 'Objectives', desc: 'Describe your goals' },
              ]).map(({ mode, icon, label, desc }) => (
                <button key={mode} onClick={() => setImportMode(mode)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    importMode === mode
                      ? 'border-atlas-blue bg-atlas-blue/10'
                      : 'border-atlas-border bg-atlas-surface hover:border-atlas-muted'
                  }`}>
                  <span className="text-2xl block mb-1">{icon}</span>
                  <p className="font-semibold text-sm text-atlas-text">{label}</p>
                  <p className="text-xs text-atlas-subtle">{desc}</p>
                </button>
              ))}
            </div>

            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={
                importMode === 'url' ? 'https://...' :
                importMode === 'text' ? 'Paste your lesson content, article, or document here...' :
                'Example: "Students will understand the water cycle, including evaporation, condensation, and precipitation. They should be able to explain how water moves through ecosystems and connect this to weather patterns."'
              }
              rows={8}
              className="atlas-textarea"
            />
            <p className="text-xs text-atlas-subtle mt-2">{inputText.length} characters</p>
          </div>

          {/* Differentiation Sliders */}
          <div className="atlas-card mb-6">
            <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">Differentiation Settings</h3>
            <div className="space-y-6">
              {[
                { key: 'complexity', value: complexity, set: setComplexity, label: 'Content Complexity', left: 'Basic', right: 'Advanced', color: '#4F86F7' },
                { key: 'pacing', value: pacing, set: setPacing, label: 'Pacing', left: 'Slow & Thorough', right: 'Fast-paced', color: '#F5A623' },
                { key: 'scaffolding', value: scaffolding, set: setScaffolding, label: 'Scaffolding Level', left: 'Heavy Support', right: 'Independent', color: '#23D18B' },
              ].map(({ key, value, set, label, left, right, color }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-atlas-text">{label}</label>
                    <span className="text-sm font-bold" style={{ color }}>{value}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={value}
                    onChange={e => set(Number(e.target.value))}
                    style={{ accentColor: color }}
                  />
                  <div className="flex justify-between text-xs text-atlas-subtle mt-1">
                    <span>{left}</span><span>{right}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleGenerate}
            disabled={!inputText.trim()}
            className="btn-primary w-full justify-center py-4 text-base glow-blue disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
            ✨ Generate Lesson with AI
          </button>
        </div>
      )}

      {/* STEP 2: Generating */}
      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center min-h-64 animate-fade-in">
          <div className="atlas-card p-12 text-center max-w-md w-full">
            <div className="w-20 h-20 rounded-full bg-atlas-blue/10 border-2 border-atlas-blue/30 flex items-center justify-center mx-auto mb-6 animate-pulse-slow">
              <span className="text-4xl">✨</span>
            </div>
            <h2 className="font-display font-bold text-2xl text-atlas-text mb-6">Generating Your Lesson</h2>
            <div className="space-y-3">
              {generatingSteps.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                  i <= generatingStep ? 'text-atlas-text' : 'text-atlas-subtle/30'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                    i < generatingStep ? 'bg-atlas-emerald/20 text-atlas-emerald' :
                    i === generatingStep ? 'bg-atlas-blue/20 text-atlas-blue animate-pulse' :
                    'bg-atlas-card text-atlas-subtle/20'
                  }`}>
                    {i < generatingStep ? '✓' : i === generatingStep ? '●' : '○'}
                  </span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Customize */}
      {step === 'customize' && editedDraft && (
        <div className="animate-slide-up space-y-6">
          {/* Title & Description */}
          <div className="atlas-card">
            <h2 className="font-display font-bold text-xl text-atlas-text mb-4">✅ Lesson Generated! Customize it below.</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-atlas-subtle mb-2">Lesson Title</label>
                <input value={editedDraft.title}
                  onChange={e => setEditedDraft({ ...editedDraft, title: e.target.value })}
                  className="atlas-input font-display font-bold text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-atlas-subtle mb-2">Description</label>
                <textarea value={editedDraft.description}
                  onChange={e => setEditedDraft({ ...editedDraft, description: e.target.value })}
                  rows={3} className="atlas-textarea"
                />
              </div>
            </div>
          </div>

          {/* Objectives */}
          <div className="atlas-card">
            <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">📎 Learning Objectives</h3>
            <div className="space-y-2">
              {editedDraft.objectives.map((obj, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-atlas-blue font-bold text-sm">{i + 1}.</span>
                  <input value={obj}
                    onChange={e => {
                      const objs = [...editedDraft.objectives]
                      objs[i] = e.target.value
                      setEditedDraft({ ...editedDraft, objectives: objs })
                    }}
                    className="atlas-input py-2"
                  />
                  <button onClick={() => setEditedDraft({ ...editedDraft, objectives: editedDraft.objectives.filter((_, j) => j !== i) })}
                    className="text-atlas-subtle hover:text-atlas-red transition-colors flex-shrink-0">×</button>
                </div>
              ))}
              <button onClick={() => setEditedDraft({ ...editedDraft, objectives: [...editedDraft.objectives, ''] })}
                className="text-atlas-blue text-sm hover:underline">+ Add objective</button>
            </div>
          </div>

          {/* Sections */}
          <div className="atlas-card">
            <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">📚 Lesson Sections ({editedDraft.sections.length})</h3>
            <div className="space-y-4">
              {editedDraft.sections.map((section, i) => (
                <div key={i} className="p-4 bg-atlas-surface rounded-xl border border-atlas-border">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-lg bg-atlas-blue/20 text-atlas-blue text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <input value={section.title}
                      onChange={e => updateSection(i, 'title', e.target.value)}
                      className="atlas-input py-2 font-semibold flex-1"
                    />
                    <select value={section.content_type}
                      onChange={e => updateSection(i, 'content_type', e.target.value)}
                      className="atlas-input py-2 w-36 flex-shrink-0">
                      <option value="text">📄 Text</option>
                      <option value="video">🎬 Video</option>
                      <option value="quiz">❓ Quiz</option>
                      <option value="activity">🔬 Activity</option>
                      <option value="discussion">💬 Discussion</option>
                    </select>
                    <button onClick={() => removeSection(i)}
                      className="text-atlas-subtle hover:text-atlas-red transition-colors flex-shrink-0">🗑</button>
                  </div>
                  <textarea value={section.content || ''}
                    onChange={e => updateSection(i, 'content', e.target.value)}
                    rows={4} className="atlas-textarea text-sm"
                    placeholder="Section content..."
                  />
                  <p className="text-xs text-atlas-subtle mt-2">⏱ {section.duration_minutes} minutes</p>
                </div>
              ))}
              <button onClick={() => setEditedDraft({ ...editedDraft, sections: [...editedDraft.sections, { title: 'New Section', content: '', content_type: 'text' as const, duration_minutes: 5 }] })}
                className="w-full py-3 border-2 border-dashed border-atlas-border rounded-xl text-atlas-subtle hover:border-atlas-blue hover:text-atlas-blue transition-all text-sm">
                + Add Section
              </button>
            </div>
          </div>

          {/* Quiz Preview */}
          <div className="atlas-card">
            <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">❓ Quiz Questions ({editedDraft.quiz_questions.length})</h3>
            <div className="space-y-3">
              {editedDraft.quiz_questions.slice(0, 3).map((q, i) => (
                <div key={i} className="p-4 bg-atlas-surface rounded-xl border border-atlas-border">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-atlas-text">{q.question_text}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      {q.is_diagnostic && <span className="badge bg-atlas-purple/10 text-atlas-purple border-atlas-purple/20 text-xs">Diagnostic</span>}
                      {q.is_micro_check && <span className="badge bg-atlas-blue/10 text-atlas-blue border-atlas-blue/20 text-xs">Micro-Check</span>}
                      {q.is_final_quiz && <span className="badge bg-atlas-amber/10 text-atlas-amber border-atlas-amber/20 text-xs">Final</span>}
                    </div>
                  </div>
                  {q.options && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg ${opt.is_correct ? 'bg-atlas-emerald/10 text-atlas-emerald border border-atlas-emerald/20' : 'bg-atlas-muted/20 text-atlas-subtle'}`}>
                          {opt.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {editedDraft.quiz_questions.length > 3 && (
                <p className="text-xs text-atlas-subtle text-center">+{editedDraft.quiz_questions.length - 3} more questions</p>
              )}
            </div>
          </div>

          {/* Glossary */}
          {editedDraft.glossary_terms.length > 0 && (
            <div className="atlas-card">
              <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">📖 Glossary ({editedDraft.glossary_terms.length} terms)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {editedDraft.glossary_terms.map((term, i) => (
                  <div key={i} className="p-3 bg-atlas-surface rounded-xl border border-atlas-border">
                    <p className="font-semibold text-atlas-text text-sm">{term.term}</p>
                    <p className="text-xs text-atlas-subtle mt-1">{term.definition}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Actions */}
          <div className="flex gap-4 sticky bottom-4">
            <button onClick={() => handlePublish('draft')} disabled={saving}
              className="btn-secondary flex-1 justify-center py-3.5">
              💾 Save as Draft
            </button>
            <button onClick={() => handlePublish('published')} disabled={saving}
              className="btn-primary flex-1 justify-center py-3.5 glow-blue">
              {saving ? '⏳ Saving...' : '🚀 Publish Lesson'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
