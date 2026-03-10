'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import type { AILessonDraft, ContentType, DifficultyLevel } from '@/types'

// ─── Types ────────────────────────────────────────────────────
type CreationMode = 'ai_collab' | 'ai_full' | 'manual'
type ImportMode   = 'objectives' | 'text' | 'url' | 'file'
type Step         = 'choose' | 'import' | 'generating' | 'edit'

type DraftSection = { title: string; content: string; content_type: ContentType; duration_minutes: number }
type DraftQuestion = {
  question_text: string; question_type: string
  options: { id: string; text: string; is_correct: boolean }[]
  explanation: string; difficulty: DifficultyLevel
  is_diagnostic: boolean; is_micro_check: boolean; is_final_quiz: boolean
}
type DraftGlossary = { term: string; definition: string; example: string }

type Draft = {
  title: string; description: string; objectives: string[]
  estimated_duration: number; prerequisites: string[]; tags: string[]
  sections: DraftSection[]; quiz_questions: DraftQuestion[]; glossary_terms: DraftGlossary[]
  difficulty: DifficultyLevel; subject: string
}

const emptyDraft = (): Draft => ({
  title: '', description: '', objectives: ['', '', ''],
  estimated_duration: 45, prerequisites: [], tags: [],
  sections: [
    { title: 'Introduction', content: '', content_type: 'text', duration_minutes: 8 },
    { title: 'Core Content', content: '', content_type: 'text', duration_minutes: 20 },
    { title: 'Summary', content: '', content_type: 'text', duration_minutes: 7 },
  ],
  quiz_questions: [], glossary_terms: [],
  difficulty: 'intermediate', subject: '',
})

const GENERATION_STEPS = [
  '🔍 Extracting key concepts from your content...',
  '🎯 Identifying learning objectives...',
  '📐 Designing lesson framework & section types...',
  '✏️ Writing section content (text, video, image)...',
  '❓ Generating quiz questions (diagnostic, micro-checks, final)...',
  '📖 Building glossary from key terms...',
  '✅ Organizing and finalizing lesson...'
]

// ─── Main Component ───────────────────────────────────────────
export default function CreateLesson() {
  const router  = useRouter()
  const supabase = createClient()

  const [creationMode, setCreationMode] = useState<CreationMode>('ai_collab')
  const [importMode,   setImportMode]   = useState<ImportMode>('objectives')
  const [step,         setStep]         = useState<Step>('choose')
  const [inputText,    setInputText]    = useState('')
  const [draft,        setDraft]        = useState<Draft>(emptyDraft())
  const [complexity,   setComplexity]   = useState(50)
  const [pacing,       setPacing]       = useState(50)
  const [scaffolding,  setScaffolding]  = useState(50)
  const [genStep,      setGenStep]      = useState(0)
  const [saving,       setSaving]       = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [activeTab,    setActiveTab]    = useState<'overview' | 'sections' | 'questions' | 'glossary'>('overview')
  const [analysisInfo, setAnalysisInfo] = useState<{ main_topic?: string; key_concepts?: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── File Upload ──────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    const reader = new FileReader()
    reader.onerror = () => toast.error('Could not read file')

    if (file.type === 'application/pdf') {
      // PDFs: extract text via FileReader (binary fallback) and pass what we can
      // For proper PDF text extraction a server-side PDF library would be used;
      // here we provide the filename + any readable text segments
      reader.onload = (ev) => {
        const raw = ev.target?.result as string
        // Attempt to grab readable ASCII runs from the binary data
        const readable = (raw || '').replace(/[^\x20-\x7E\n\r]/g, ' ')
          .replace(/\s{3,}/g, '\n').slice(0, 3000)
        const desc = readable.trim().length > 100
          ? `PDF Document: "${file.name}"\n\nExtracted content:\n${readable}`
          : `PDF Document: "${file.name}"\nTopic: ${file.name.replace(/\.(pdf|docx?|txt)$/i, '').replace(/[-_]/g, ' ')}\n(Please generate a comprehensive lesson covering the key concepts in this document.)`
        setInputText(desc)
        toast.success(`📎 "${file.name}" loaded — ready to generate`)
      }
      reader.readAsBinaryString(file)
    } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      // Word docs: read as text (will be garbled but contains some readable content)
      reader.onload = (ev) => {
        const raw = ev.target?.result as string
        const readable = (raw || '').replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s{3,}/g, '\n').slice(0, 3000)
        setInputText(`Word Document: "${file.name}"\n\nExtracted content:\n${readable}`)
        toast.success(`📎 "${file.name}" loaded`)
      }
      reader.readAsBinaryString(file)
    } else {
      // Plain text, markdown, CSV, etc.
      reader.onload = (ev) => {
        setInputText(ev.target?.result as string)
        toast.success(`📎 "${file.name}" loaded`)
      }
      reader.readAsText(file)
    }
  }

  // ── AI Generation ────────────────────────────────────────────
  const handleGenerate = async () => {
    const content = inputText.trim()
    if (!content) { toast.error('Please provide content first'); return }

    setStep('generating')
    setGenStep(0)
    // Stagger the steps: analysis takes ~3s, generation takes ~10s
    const stepTimings = [0, 1200, 2800, 4500, 7000, 9000, 11000]
    const timers: ReturnType<typeof setTimeout>[] = []
    stepTimings.forEach((delay, i) => {
      timers.push(setTimeout(() => setGenStep(i), delay))
    })

    try {
      const res  = await fetch('/api/ai/create-lesson', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: importMode === 'file' ? 'text' : importMode, content, complexity, pacing, scaffolding }),
      })
      const data = await res.json()
      timers.forEach(t => clearTimeout(t))
      setGenStep(GENERATION_STEPS.length - 1)

      if (!data.lesson) {
        toast.error(data.error || 'Generation failed', { duration: 8000 })
        setStep('import'); return
      }

      // Store analysis metadata for display
      if (data.analysis) setAnalysisInfo(data.analysis)

      const ai = data.lesson as AILessonDraft
      setTimeout(() => {
        setDraft({
          title:              ai.title || '',
          description:        ai.description || '',
          objectives:         ai.objectives?.length ? ai.objectives : ['', '', ''],
          estimated_duration: ai.estimated_duration || 45,
          prerequisites:      ai.prerequisites || [],
          tags:               ai.tags || [],
          sections:           ai.sections?.length ? ai.sections : emptyDraft().sections,
          quiz_questions:     ai.quiz_questions || [],
          glossary_terms:     ai.glossary_terms || [],
          difficulty:         'intermediate',
          subject:            '',
        })
        setStep('edit')
      }, 400)
    } catch (err) {
      timers.forEach(t => clearTimeout(t))
      toast.error('Network error: ' + (err instanceof Error ? err.message : String(err)), { duration: 8000 })
      setStep('import')
    }
  }

  // ── Save to Supabase ─────────────────────────────────────────
  const save = async (status: 'draft' | 'published') => {
    if (!draft.title.trim()) { toast.error('Please add a title'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { data: lesson, error } = await supabase.from('lessons').insert({
      teacher_id:         user.id,
      title:              draft.title,
      description:        draft.description,
      objectives:         draft.objectives.filter(Boolean),
      status,
      estimated_duration: draft.estimated_duration,
      prerequisites:      draft.prerequisites.filter(Boolean),
      tags:               draft.tags.filter(Boolean),
      subject:            draft.subject || null,
      difficulty:         draft.difficulty,
      ai_generated:       creationMode !== 'manual',
      complexity_slider:  complexity,
      pacing_slider:      pacing,
      scaffolding_slider: scaffolding,
    }).select().single()

    if (error || !lesson) {
      toast.error('Failed to save: ' + (error?.message ?? 'unknown'))
      setSaving(false); return
    }

    if (draft.sections.length > 0) {
      await supabase.from('lesson_sections').insert(
        draft.sections.filter(s => s.title.trim()).map((s, idx) => ({
          lesson_id: lesson.id, title: s.title, content: s.content,
          content_type: s.content_type, order_index: idx, duration_minutes: s.duration_minutes,
        }))
      )
    }
    if (draft.quiz_questions.length > 0) {
      await supabase.from('quiz_questions').insert(
        draft.quiz_questions.map((q, idx) => ({
          lesson_id: lesson.id, question_text: q.question_text,
          question_type: q.question_type, options: q.options,
          explanation: q.explanation, difficulty: q.difficulty,
          is_diagnostic: q.is_diagnostic, is_micro_check: q.is_micro_check,
          is_final_quiz: q.is_final_quiz, order_index: idx,
        }))
      )
    }
    if (draft.glossary_terms.length > 0) {
      await supabase.from('glossary_terms').insert(
        draft.glossary_terms.map(t => ({
          lesson_id: lesson.id, term: t.term, definition: t.definition, example: t.example,
        }))
      )
    }

    toast.success(status === 'published' ? '🚀 Lesson published!' : '💾 Saved as draft')
    router.push(`/teacher/lessons/${lesson.id}`)
  }

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => step === 'choose' ? router.back() : setStep(step === 'edit' ? (creationMode === 'manual' ? 'choose' : 'import') : 'choose')}
          className="btn-ghost">← Back</button>
        <div>
          <h1 className="font-display font-bold text-3xl text-atlas-text">Lesson Creation Studio</h1>
          <p className="text-atlas-subtle text-sm">
            {step === 'choose' ? 'Choose how you want to create your lesson' :
             step === 'import' ? 'Provide your source material' :
             step === 'generating' ? 'AI is building your lesson...' :
             'Review and edit your lesson'}
          </p>
        </div>
      </div>

      {/* Step pill tracker */}
      {step !== 'choose' && (
        <div className="flex items-center gap-2 mb-6 text-xs">
          {[
            { key: 'mode',      label: creationMode === 'manual' ? '✍️ Manual' : creationMode === 'ai_full' ? '🤖 Full AI' : '🤝 AI Collab' },
            ...(creationMode !== 'manual' ? [{ key: 'import', label: '📥 Import' }] : []),
            { key: 'edit',      label: '✏️ Edit' },
          ].map((pill, i) => (
            <span key={pill.key} className={`px-3 py-1 rounded-full font-medium ${
              (step === 'import' && i <= 1) || (step === 'edit' && i <= 2) || (step === 'generating' && i === 1)
                ? 'bg-atlas-blue text-white' : 'bg-atlas-card text-atlas-subtle border border-atlas-border'
            }`}>{pill.label}</span>
          ))}
        </div>
      )}

      {/* ── STEP: CHOOSE MODE ── */}
      {step === 'choose' && (
        <div className="space-y-4 animate-slide-up">
          <p className="text-atlas-text font-medium mb-6">How would you like to create this lesson?</p>
          {[
            {
              mode: 'ai_collab' as const,
              icon: '🤝',
              title: 'AI + Teacher Collaboration',
              desc: 'AI generates a structured lesson draft. You review, edit, and refine every section to make it yours.',
              badge: 'Recommended',
              badgeColor: 'bg-atlas-blue/10 text-atlas-blue border-atlas-blue/20',
            },
            {
              mode: 'ai_full' as const,
              icon: '🤖',
              title: 'Fully AI-Generated',
              desc: 'AI creates a complete, ready-to-publish lesson. Review and approve before going live.',
              badge: 'Fastest',
              badgeColor: 'bg-atlas-purple/10 text-atlas-purple border-atlas-purple/20',
            },
            {
              mode: 'manual' as const,
              icon: '✍️',
              title: 'Create from Scratch',
              desc: 'Build your lesson entirely yourself. Full creative control with no AI involvement.',
              badge: 'Full Control',
              badgeColor: 'bg-atlas-emerald/10 text-atlas-emerald border-atlas-emerald/20',
            },
          ].map(opt => (
            <button key={opt.mode}
              onClick={() => {
                setCreationMode(opt.mode)
                if (opt.mode === 'manual') { setDraft(emptyDraft()); setStep('edit') }
                else setStep('import')
              }}
              className={`w-full p-5 rounded-2xl border-2 text-left transition-all hover:shadow-card-hover hover:-translate-y-0.5 ${
                creationMode === opt.mode ? 'border-atlas-blue bg-atlas-blue/5' : 'border-atlas-border bg-atlas-card hover:border-atlas-muted'
              }`}>
              <div className="flex items-start gap-4">
                <span className="text-3xl">{opt.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display font-bold text-atlas-text">{opt.title}</span>
                    <span className={`badge text-xs ${opt.badgeColor}`}>{opt.badge}</span>
                  </div>
                  <p className="text-atlas-subtle text-sm">{opt.desc}</p>
                </div>
                <span className="text-atlas-blue text-lg mt-1">→</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── STEP: IMPORT ── */}
      {step === 'import' && (
        <div className="animate-slide-up space-y-6">
          {/* Source type picker */}
          <div className="atlas-card">
            <h2 className="font-display font-bold text-xl text-atlas-text mb-2">
              {creationMode === 'ai_collab' ? '🤝 Give AI a starting point' : '🤖 What should the AI base your lesson on?'}
            </h2>
            <p className="text-atlas-subtle text-sm mb-5">AI will use this to generate your lesson structure.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { mode: 'objectives' as const, icon: '🎯', label: 'Objectives',  desc: 'Describe what students learn' },
                { mode: 'text'       as const, icon: '📄', label: 'Paste Text',  desc: 'Article, notes, or content' },
                { mode: 'url'        as const, icon: '🔗', label: 'URL',         desc: 'Paste a web link' },
                { mode: 'file'       as const, icon: '📎', label: 'Upload File', desc: '.txt, .pdf, .docx' },
              ].map(opt => (
                <button key={opt.mode} onClick={() => { setImportMode(opt.mode); if (opt.mode === 'file') fileRef.current?.click() }}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    importMode === opt.mode ? 'border-atlas-blue bg-atlas-blue/10' : 'border-atlas-border bg-atlas-surface hover:border-atlas-muted'
                  }`}>
                  <span className="text-2xl block mb-1">{opt.icon}</span>
                  <p className="font-semibold text-sm text-atlas-text">{opt.label}</p>
                  <p className="text-xs text-atlas-subtle">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Hidden file input */}
            <input ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx,.md"
              onChange={handleFileUpload} className="hidden" />

            {uploadedFile && (
              <div className="flex items-center gap-3 p-3 bg-atlas-emerald/5 border border-atlas-emerald/20 rounded-xl mb-4">
                <span className="text-xl">📎</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-atlas-text truncate">{uploadedFile.name}</p>
                  <p className="text-xs text-atlas-subtle">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => { setUploadedFile(null); setInputText('') }}
                  className="text-atlas-subtle hover:text-atlas-red text-lg">×</button>
              </div>
            )}

            {importMode !== 'file' && (
              <>
                <textarea value={inputText} onChange={e => setInputText(e.target.value)}
                  placeholder={
                    importMode === 'objectives' ? 'e.g. "Students will understand photosynthesis including light-dependent and light-independent reactions. They should be able to explain how plants convert sunlight to energy and identify the role of chlorophyll."' :
                    importMode === 'text'        ? 'Paste your article, notes, textbook excerpt, or any content here...' :
                    'https://example.com/article-to-use-as-lesson-basis'
                  }
                  rows={8} className="atlas-textarea" />
                <p className="text-xs text-atlas-subtle mt-1">{inputText.length} characters</p>
              </>
            )}
          </div>

          {/* Differentiation sliders */}
          <div className="atlas-card">
            <h3 className="font-display font-semibold text-lg text-atlas-text mb-4">⚙️ Differentiation Settings</h3>
            <div className="space-y-5">
              {[
                { key: 'complexity',  val: complexity,  set: setComplexity,  label: 'Complexity',  left: 'Basic',  right: 'Advanced', color: '#4F86F7' },
                { key: 'pacing',      val: pacing,      set: setPacing,      label: 'Pacing',      left: 'Slow',   right: 'Brisk',    color: '#F5A623' },
                { key: 'scaffolding', val: scaffolding, set: setScaffolding, label: 'Scaffolding', left: 'Heavy',  right: 'Independent', color: '#23D18B' },
              ].map(s => (
                <div key={s.key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-atlas-text">{s.label}</span>
                    <span className="text-sm font-bold" style={{ color: s.color }}>{s.val}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={s.val}
                    onChange={e => s.set(Number(e.target.value))} style={{ accentColor: s.color }} className="w-full" />
                  <div className="flex justify-between text-xs text-atlas-subtle"><span>{s.left}</span><span>{s.right}</span></div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleGenerate}
            disabled={!inputText.trim() && !uploadedFile}
            className="btn-primary w-full justify-center py-4 text-base glow-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
            ✨ Generate Lesson with AI
          </button>
        </div>
      )}

      {/* ── STEP: GENERATING ── */}
      {step === 'generating' && (
        <div className="flex items-center justify-center min-h-64 animate-fade-in">
          <div className="atlas-card p-12 text-center max-w-sm w-full">
            <div className="w-20 h-20 rounded-full bg-atlas-blue/10 border-2 border-atlas-blue/30 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <span className="text-4xl">✨</span>
            </div>
            <h2 className="font-display font-bold text-2xl text-atlas-text mb-2">Building Your Lesson</h2>
            <p className="text-atlas-subtle text-xs mb-6">AI is running in two passes — extracting knowledge, then generating rich content</p>
            <div className="space-y-2.5">
              {GENERATION_STEPS.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 text-sm transition-all ${i <= genStep ? 'text-atlas-text' : 'text-atlas-subtle/30'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                    i < genStep  ? 'bg-atlas-emerald/20 text-atlas-emerald' :
                    i === genStep ? 'bg-atlas-blue/20 text-atlas-blue animate-pulse' : 'bg-atlas-card'
                  }`}>{i < genStep ? '✓' : i === genStep ? '●' : '○'}</span>
                  {s}
                </div>
              ))}
            </div>
            {genStep >= 2 && (
              <div className="mt-5 pt-4 border-t border-atlas-border">
                <p className="text-xs text-atlas-subtle">
                  {genStep < 4 ? '⏳ Phase 1: Content analysis complete, generating sections...' : '⚡ Phase 2: Writing quiz questions and glossary...'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP: EDIT ── */}
      {step === 'edit' && (
        <div className="animate-slide-up space-y-6">
          {creationMode !== 'manual' && (
            <div className="p-3 bg-atlas-emerald/5 border border-atlas-emerald/20 rounded-xl text-sm text-atlas-emerald flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">✅</span>
              <div className="flex-1">
                <span className="font-medium">Lesson generated!</span> Review and customize below, then save or publish.
                {analysisInfo?.main_topic && (
                  <p className="text-atlas-emerald/70 text-xs mt-1">
                    Topic detected: <strong>{analysisInfo.main_topic}</strong>
                    {analysisInfo.key_concepts?.length ? ` · Key concepts: ${analysisInfo.key_concepts.slice(0, 4).join(', ')}` : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 border-b border-atlas-border pb-0 overflow-x-auto">
            {[
              { key: 'overview'   as const, label: '📋 Overview' },
              { key: 'sections'   as const, label: `📚 Sections (${draft.sections.length})` },
              { key: 'questions'  as const, label: `❓ Questions (${draft.quiz_questions.length})` },
              { key: 'glossary'   as const, label: `📖 Glossary (${draft.glossary_terms.length})` },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-all ${
                  activeTab === t.key ? 'border-atlas-blue text-atlas-blue' : 'border-transparent text-atlas-subtle hover:text-atlas-text'
                }`}>{t.label}</button>
            ))}
          </div>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-4">
                <div className="atlas-card">
                  <label className="block text-xs text-atlas-subtle mb-1 font-medium">Lesson Title *</label>
                  <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
                    className="atlas-input font-display font-bold text-lg" placeholder="Enter lesson title..." />
                </div>
                <div className="atlas-card">
                  <label className="block text-xs text-atlas-subtle mb-1 font-medium">Description</label>
                  <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
                    rows={3} className="atlas-textarea" placeholder="Brief overview for students..." />
                </div>
                <div className="atlas-card">
                  <h3 className="font-semibold text-atlas-text mb-3">📎 Learning Objectives</h3>
                  <div className="space-y-2">
                    {draft.objectives.map((obj, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-atlas-blue font-bold text-sm w-5">{i + 1}.</span>
                        <input value={obj} onChange={e => { const o = [...draft.objectives]; o[i] = e.target.value; setDraft({ ...draft, objectives: o }) }}
                          className="atlas-input py-2 flex-1" placeholder={`Objective ${i + 1}...`} />
                        <button onClick={() => setDraft({ ...draft, objectives: draft.objectives.filter((_, j) => j !== i) })}
                          className="text-atlas-subtle hover:text-atlas-red text-lg flex-shrink-0">×</button>
                      </div>
                    ))}
                    <button onClick={() => setDraft({ ...draft, objectives: [...draft.objectives, ''] })}
                      className="text-atlas-blue text-sm hover:underline">+ Add objective</button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="atlas-card space-y-3">
                  <div>
                    <label className="block text-xs text-atlas-subtle mb-1">Subject</label>
                    <input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })}
                      className="atlas-input py-2" placeholder="e.g. Biology" />
                  </div>
                  <div>
                    <label className="block text-xs text-atlas-subtle mb-1">Duration (minutes)</label>
                    <input type="number" value={draft.estimated_duration}
                      onChange={e => setDraft({ ...draft, estimated_duration: Number(e.target.value) })}
                      className="atlas-input py-2" />
                  </div>
                  <div>
                    <label className="block text-xs text-atlas-subtle mb-1">Difficulty</label>
                    <select value={draft.difficulty} onChange={e => setDraft({ ...draft, difficulty: e.target.value as DifficultyLevel })}
                      className="atlas-input py-2">
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-atlas-subtle mb-1">Tags (comma-separated)</label>
                    <input value={draft.tags.join(', ')}
                      onChange={e => setDraft({ ...draft, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                      className="atlas-input py-2" placeholder="biology, cells, photosynthesis" />
                  </div>
                </div>
                {/* Differentiation sliders (read-only preview) */}
                {creationMode !== 'manual' && (
                  <div className="atlas-card">
                    <h3 className="font-semibold text-atlas-text mb-3 text-sm">⚙️ Differentiation</h3>
                    {[
                      { label: 'Complexity',  val: complexity,  color: '#4F86F7' },
                      { label: 'Pacing',      val: pacing,      color: '#F5A623' },
                      { label: 'Scaffolding', val: scaffolding, color: '#23D18B' },
                    ].map(s => (
                      <div key={s.label} className="mb-2">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-atlas-subtle">{s.label}</span>
                          <span style={{ color: s.color }}>{s.val}%</span>
                        </div>
                        <div className="h-1.5 bg-atlas-muted/20 rounded-full">
                          <div className="h-full rounded-full" style={{ width: `${s.val}%`, background: s.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTIONS */}
          {activeTab === 'sections' && (
            <div className="space-y-4">
              {draft.sections.map((sec, i) => (
                <div key={i} className="atlas-card">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-lg bg-atlas-blue/20 text-atlas-blue text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <input value={sec.title}
                      onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], title: e.target.value }; setDraft({ ...draft, sections: ss }) }}
                      className="atlas-input py-2 flex-1 font-semibold" placeholder="Section title..." />
                    <select value={sec.content_type}
                      onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], content_type: e.target.value as ContentType }; setDraft({ ...draft, sections: ss }) }}
                      className="atlas-input py-2 w-36 text-sm flex-shrink-0">
                      <option value="text">📄 Text</option>
                      <option value="image">🖼️ Image</option>
                      <option value="video">🎬 Video</option>
                      <option value="quiz">❓ Quiz</option>
                      <option value="activity">🔬 Activity</option>
                      <option value="discussion">💬 Discussion</option>
                    </select>
                    <input type="number" value={sec.duration_minutes} min={1}
                      onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], duration_minutes: Number(e.target.value) }; setDraft({ ...draft, sections: ss }) }}
                      className="atlas-input py-2 w-20 text-sm flex-shrink-0" placeholder="min" title="Duration (minutes)" />
                    <button onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== i) })}
                      className="text-atlas-subtle hover:text-atlas-red text-lg flex-shrink-0">🗑</button>
                  </div>
                  {/* Smart content editor per type */}
                  {sec.content_type === 'image' ? (() => {
                    const [imgUrl, imgCaption] = (sec.content || '').split('|||')
                    return (
                      <div className="space-y-2">
                        <div className="p-3 bg-atlas-blue/5 border border-atlas-blue/20 rounded-xl text-xs text-atlas-blue">
                          🖼️ <strong>Image Section</strong> — Paste an image URL, or use the search term below to find one
                        </div>
                        <input
                          value={imgUrl || ''}
                          onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], content: `${e.target.value}|||${imgCaption || ''}` }; setDraft({ ...draft, sections: ss }) }}
                          className="atlas-input py-2 text-sm" placeholder="https://... (image URL)" />
                        <input
                          value={imgCaption || ''}
                          onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], content: `${imgUrl || ''}|||${e.target.value}` }; setDraft({ ...draft, sections: ss }) }}
                          className="atlas-input py-2 text-sm" placeholder="Caption / description for students..." />
                        {imgUrl && imgUrl.startsWith('http') && (
                          <img src={imgUrl} alt="Preview" className="w-full max-h-48 object-contain rounded-xl border border-atlas-border mt-1" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                      </div>
                    )
                  })() : sec.content_type === 'video' ? (() => {
                    const [vidUrl, vidCaption] = (sec.content || '').split('|||')
                    const ytMatch = (vidUrl || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/)
                    const ytId = ytMatch?.[1]
                    return (
                      <div className="space-y-2">
                        <div className="p-3 bg-atlas-purple/5 border border-atlas-purple/20 rounded-xl text-xs text-atlas-purple">
                          🎬 <strong>Video Section</strong> — Paste a YouTube/Vimeo URL
                        </div>
                        <input
                          value={vidUrl || ''}
                          onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], content: `${e.target.value}|||${vidCaption || ''}` }; setDraft({ ...draft, sections: ss }) }}
                          className="atlas-input py-2 text-sm" placeholder="https://youtube.com/watch?v=..." />
                        <input
                          value={vidCaption || ''}
                          onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], content: `${vidUrl || ''}|||${e.target.value}` }; setDraft({ ...draft, sections: ss }) }}
                          className="atlas-input py-2 text-sm" placeholder="What this video covers..." />
                        {ytId && (
                          <div className="aspect-video rounded-xl overflow-hidden border border-atlas-border bg-black mt-1">
                            <iframe src={`https://www.youtube.com/embed/${ytId}`} className="w-full h-full" allowFullScreen />
                          </div>
                        )}
                        {vidUrl && !ytId && vidUrl.includes('youtube.com/results') && (
                          <a href={vidUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-atlas-blue hover:underline block mt-1">
                            🔍 Search YouTube for this topic →
                          </a>
                        )}
                      </div>
                    )
                  })() : (
                    <textarea value={sec.content || ''}
                      onChange={e => { const ss = [...draft.sections]; ss[i] = { ...ss[i], content: e.target.value }; setDraft({ ...draft, sections: ss }) }}
                      rows={6} className="atlas-textarea text-sm" placeholder={
                        sec.content_type === 'quiz' ? 'Quiz title (questions are managed in the Questions tab)...' :
                        sec.content_type === 'activity' ? 'Step-by-step activity instructions...' :
                        sec.content_type === 'discussion' ? 'Discussion prompt or open-ended question...' :
                        'Write your section content here...'
                      } />
                  )}
                </div>
              ))}
              <button onClick={() => setDraft({ ...draft, sections: [...draft.sections, { title: 'New Section', content: '', content_type: 'text', duration_minutes: 5 }] })}
                className="w-full py-4 border-2 border-dashed border-atlas-border rounded-2xl text-atlas-subtle hover:border-atlas-blue hover:text-atlas-blue transition-all text-sm">
                + Add Section
              </button>
            </div>
          )}

          {/* QUESTIONS */}
          {activeTab === 'questions' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '🔍 Diagnostic', count: draft.quiz_questions.filter(q => q.is_diagnostic).length,  color: 'purple' },
                  { label: '⚡ Micro-Check', count: draft.quiz_questions.filter(q => q.is_micro_check).length, color: 'cyan' },
                  { label: '🏆 Final Quiz',  count: draft.quiz_questions.filter(q => q.is_final_quiz).length,  color: 'amber' },
                ].map((stat, i) => (
                  <div key={i} className="atlas-card py-3 px-4">
                    <p className="text-xs text-atlas-subtle">{stat.label}</p>
                    <p className={`font-display font-bold text-2xl text-atlas-${stat.color}`}>{stat.count}</p>
                  </div>
                ))}
              </div>
              {draft.quiz_questions.map((q, i) => (
                <div key={i} className="atlas-card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex gap-2 flex-wrap">
                      {q.is_diagnostic  && <span className="badge bg-atlas-purple/10 text-atlas-purple border-atlas-purple/20 text-xs">Diagnostic</span>}
                      {q.is_micro_check && <span className="badge bg-atlas-cyan/10 text-atlas-cyan border-atlas-cyan/20 text-xs">Micro-Check</span>}
                      {q.is_final_quiz  && <span className="badge bg-atlas-amber/10 text-atlas-amber border-atlas-amber/20 text-xs">Final Quiz</span>}
                    </div>
                    <button onClick={() => setDraft({ ...draft, quiz_questions: draft.quiz_questions.filter((_, j) => j !== i) })}
                      className="text-atlas-subtle hover:text-atlas-red">🗑</button>
                  </div>
                  <p className="font-medium text-atlas-text text-sm mb-3">{i + 1}. {q.question_text}</p>
                  {q.options && (
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map(opt => (
                        <div key={opt.id} className={`text-xs px-3 py-2 rounded-lg ${opt.is_correct ? 'bg-atlas-emerald/10 text-atlas-emerald border border-atlas-emerald/20' : 'bg-atlas-muted/20 text-atlas-subtle'}`}>
                          {opt.is_correct && '✓ '}{opt.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.explanation && <p className="text-xs text-atlas-subtle mt-2 italic">💡 {q.explanation}</p>}
                </div>
              ))}
              {draft.quiz_questions.length === 0 && (
                <div className="atlas-card text-center py-8">
                  <p className="text-atlas-subtle text-sm">No questions yet. {creationMode !== 'manual' ? 'Re-generate with AI or add manually.' : 'Add questions below.'}</p>
                </div>
              )}
              <button onClick={() => setDraft({
                ...draft,
                quiz_questions: [...draft.quiz_questions, {
                  question_text: 'New question', question_type: 'multiple_choice',
                  options: [
                    { id: 'a', text: 'Option A', is_correct: false },
                    { id: 'b', text: 'Option B (correct)', is_correct: true },
                    { id: 'c', text: 'Option C', is_correct: false },
                    { id: 'd', text: 'Option D', is_correct: false },
                  ],
                  explanation: '', difficulty: 'intermediate',
                  is_diagnostic: false, is_micro_check: false, is_final_quiz: true,
                }]
              })} className="w-full py-3 border-2 border-dashed border-atlas-border rounded-2xl text-atlas-subtle hover:border-atlas-blue hover:text-atlas-blue transition-all text-sm">
                + Add Question
              </button>
            </div>
          )}

          {/* GLOSSARY */}
          {activeTab === 'glossary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {draft.glossary_terms.map((term, i) => (
                  <div key={i} className="atlas-card">
                    <div className="flex items-start justify-between mb-2">
                      <input value={term.term}
                        onChange={e => { const gt = [...draft.glossary_terms]; gt[i] = { ...gt[i], term: e.target.value }; setDraft({ ...draft, glossary_terms: gt }) }}
                        className="atlas-input py-1.5 font-bold text-atlas-text flex-1 mr-2" placeholder="Term..." />
                      <button onClick={() => setDraft({ ...draft, glossary_terms: draft.glossary_terms.filter((_, j) => j !== i) })}
                        className="text-atlas-subtle hover:text-atlas-red text-lg flex-shrink-0">×</button>
                    </div>
                    <textarea value={term.definition}
                      onChange={e => { const gt = [...draft.glossary_terms]; gt[i] = { ...gt[i], definition: e.target.value }; setDraft({ ...draft, glossary_terms: gt }) }}
                      rows={2} className="atlas-textarea text-xs mb-2" placeholder="Definition..." />
                    <input value={term.example}
                      onChange={e => { const gt = [...draft.glossary_terms]; gt[i] = { ...gt[i], example: e.target.value }; setDraft({ ...draft, glossary_terms: gt }) }}
                      className="atlas-input py-1.5 text-xs" placeholder="Example usage..." />
                  </div>
                ))}
              </div>
              <button onClick={() => setDraft({ ...draft, glossary_terms: [...draft.glossary_terms, { term: '', definition: '', example: '' }] })}
                className="w-full py-3 border-2 border-dashed border-atlas-border rounded-2xl text-atlas-subtle hover:border-atlas-blue hover:text-atlas-blue transition-all text-sm">
                + Add Term
              </button>
            </div>
          )}

          {/* Save Actions — sticky bottom */}
          <div className="flex gap-4 sticky bottom-4 pt-4 border-t border-atlas-border bg-atlas-bg">
            <button onClick={() => save('draft')} disabled={saving || !draft.title.trim()}
              className="btn-secondary flex-1 justify-center py-3.5 disabled:opacity-40">
              💾 Save as Draft
            </button>
            <button onClick={() => save('published')} disabled={saving || !draft.title.trim()}
              className="btn-primary flex-1 justify-center py-3.5 glow-blue disabled:opacity-40">
              {saving ? '⏳ Saving...' : '🚀 Publish Lesson'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
