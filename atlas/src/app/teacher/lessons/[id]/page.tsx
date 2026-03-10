'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Lesson, LessonSection, QuizQuestion, GlossaryTerm, Class, DifficultyLevel, ContentType } from '@/types'
import { getStatusBadge, formatRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'

type Tab = 'overview' | 'sections' | 'questions' | 'glossary' | 'assign'
type QType = 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer' | 'long_answer'

// ─────────────────────────────────────────
// RICH TEXT EDITOR
// ─────────────────────────────────────────
function RichTextEditor({ value, onChange, placeholder = 'Write content here...' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (ref.current && !initialized.current) {
      ref.current.innerHTML = value || ''
      initialized.current = true
    }
  }, [])

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    onChange(ref.current?.innerHTML || '')
  }

  const formatBlock = (tag: string) => exec('formatBlock', tag)
  const fontSize = (size: string) => exec('fontSize', size)

  const toolbarBtn = (label: string, action: () => void, title?: string, active?: boolean) => (
    <button key={label} onMouseDown={e => { e.preventDefault(); action() }} title={title || label}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-atlas-blue text-white' : 'text-atlas-subtle hover:text-atlas-text hover:bg-atlas-muted/30'}`}>
      {label}
    </button>
  )

  return (
    <div className="border border-atlas-border rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-atlas-surface border-b border-atlas-border">
        {/* Format */}
        <select onMouseDown={e => e.preventDefault()} onChange={e => { ref.current?.focus(); document.execCommand('formatBlock', false, e.target.value); onChange(ref.current?.innerHTML || ''); e.target.value = 'p' }}
          className="text-xs bg-atlas-card border border-atlas-border rounded px-1 py-1 text-atlas-subtle mr-1">
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
        </select>

        {/* Font size */}
        <select onMouseDown={e => e.preventDefault()} onChange={e => { exec('fontSize', e.target.value); e.target.value = '3' }}
          className="text-xs bg-atlas-card border border-atlas-border rounded px-1 py-1 text-atlas-subtle mr-1">
          <option value="1">Tiny</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Large</option>
          <option value="5">XL</option>
          <option value="6">XXL</option>
        </select>

        <div className="w-px h-5 bg-atlas-border mx-1" />

        {/* Text style */}
        {toolbarBtn('B',  () => exec('bold'),      'Bold',          false)}
        {toolbarBtn('I',  () => exec('italic'),     'Italic',        false)}
        {toolbarBtn('U',  () => exec('underline'),  'Underline',     false)}
        {toolbarBtn('S',  () => exec('strikeThrough'), 'Strikethrough', false)}

        <div className="w-px h-5 bg-atlas-border mx-1" />

        {/* Alignment */}
        {toolbarBtn('≡L', () => exec('justifyLeft'),   'Align Left')}
        {toolbarBtn('≡C', () => exec('justifyCenter'), 'Center')}
        {toolbarBtn('≡R', () => exec('justifyRight'),  'Align Right')}

        <div className="w-px h-5 bg-atlas-border mx-1" />

        {/* Lists */}
        {toolbarBtn('• List',  () => exec('insertUnorderedList'), 'Bullet List')}
        {toolbarBtn('1. List', () => exec('insertOrderedList'),   'Numbered List')}
        {toolbarBtn('→',  () => exec('indent'),  'Indent')}
        {toolbarBtn('←',  () => exec('outdent'), 'Outdent')}

        <div className="w-px h-5 bg-atlas-border mx-1" />

        {/* Colors */}
        <button onMouseDown={e => e.preventDefault()} title="Text color"
          className="text-xs text-atlas-subtle hover:text-atlas-text px-2 py-1 rounded hover:bg-atlas-muted/30 flex items-center gap-1">
          <input type="color" className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent"
            onChange={e => exec('foreColor', e.target.value)} />
          <span>Color</span>
        </button>

        <div className="w-px h-5 bg-atlas-border mx-1" />

        {/* Misc */}
        {toolbarBtn('― HR', () => exec('insertHorizontalRule'), 'Horizontal Line')}
        {toolbarBtn('Link', () => {
          const url = prompt('Enter URL:')
          if (url) exec('createLink', url)
        }, 'Insert Link')}
        {toolbarBtn('Clear', () => exec('removeFormat'), 'Clear Formatting')}
      </div>

      {/* Editor body */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="rich-editor p-4 min-h-[260px] bg-atlas-card focus:outline-none text-sm"
        onInput={() => onChange(ref.current?.innerHTML || '')}
        onPaste={e => {
          // Paste as plain HTML but strip scripts
          const html = e.clipboardData.getData('text/html')
          if (html) {
            e.preventDefault()
            const clean = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/on\w+="[^"]*"/gi, '')
            document.execCommand('insertHTML', false, clean)
            onChange(ref.current?.innerHTML || '')
          }
        }}
      />

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-atlas-surface border-t border-atlas-border text-xs text-atlas-subtle">
        <span>Rich text editor — use toolbar or Markdown shortcuts</span>
        <span>{(ref.current?.innerText || '').length} chars</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// QUESTION BUILDER (one question row)
// ─────────────────────────────────────────
interface QDraft {
  id?: string
  question_text: string
  question_type: QType
  options: { id: string; text: string; is_correct: boolean }[]
  correct_answer: string
  explanation: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  is_diagnostic: boolean
  is_micro_check: boolean
  is_final_quiz: boolean
  section_id?: string | null
}

const emptyQ = (overrides: Partial<QDraft> = {}): QDraft => ({
  question_text: '', question_type: 'multiple_choice',
  options: [
    { id: 'a', text: '', is_correct: false },
    { id: 'b', text: '', is_correct: false },
    { id: 'c', text: '', is_correct: false },
    { id: 'd', text: '', is_correct: false },
  ],
  correct_answer: '', explanation: '', difficulty: 'intermediate',
  is_diagnostic: false, is_micro_check: false, is_final_quiz: false,
  ...overrides,
})

function QuestionBuilder({ q, onChange, onDelete }: {
  q: QDraft; onChange: (q: QDraft) => void; onDelete: () => void
}) {
  const set = (patch: Partial<QDraft>) => onChange({ ...q, ...patch })

  const setOption = (idx: number, field: 'text' | 'is_correct', val: string | boolean) => {
    const opts = q.options.map((o, i) => i === idx ? { ...o, [field]: val } : (field === 'is_correct' && val ? { ...o, is_correct: false } : o))
    set({ options: opts })
  }

  const typeLabel: Record<QType, string> = {
    multiple_choice: '🔘 Multiple Choice', true_false: '✅ True / False',
    fill_blank: '✏️ Fill in the Blank', short_answer: '📝 Short Answer', long_answer: '📄 Long Answer',
  }

  return (
    <div className="atlas-card border border-atlas-border space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={q.question_type} onChange={e => {
          const t = e.target.value as QType
          const opts = t === 'true_false'
            ? [{ id: 'true', text: 'True', is_correct: false }, { id: 'false', text: 'False', is_correct: false }]
            : q.question_type === 'multiple_choice' ? q.options : [
              { id: 'a', text: '', is_correct: false },{ id: 'b', text: '', is_correct: false },
              { id: 'c', text: '', is_correct: false },{ id: 'd', text: '', is_correct: false },
            ]
          set({ question_type: t, options: opts })
        }} className="atlas-input py-1.5 text-sm w-52">
          {(Object.keys(typeLabel) as QType[]).map(k => <option key={k} value={k}>{typeLabel[k]}</option>)}
        </select>

        <select value={q.difficulty} onChange={e => set({ difficulty: e.target.value as QDraft['difficulty'] })}
          className="atlas-input py-1.5 text-sm w-36">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>

        <div className="flex gap-3 ml-auto text-xs">
          {(['is_diagnostic','is_micro_check','is_final_quiz'] as const).map(k => (
            <label key={k} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={!!q[k]} onChange={e => set({ [k]: e.target.checked } as any)}
                className="rounded border-atlas-border" />
              <span className="text-atlas-subtle">{k === 'is_diagnostic' ? 'Pre-check' : k === 'is_micro_check' ? 'Micro-check' : 'Final quiz'}</span>
            </label>
          ))}
        </div>

        <button onClick={onDelete} className="text-atlas-subtle hover:text-atlas-red text-lg leading-none ml-2">🗑</button>
      </div>

      {/* Question text */}
      <div>
        <label className="block text-xs text-atlas-subtle mb-1">Question *</label>
        <textarea value={q.question_text} onChange={e => set({ question_text: e.target.value })}
          rows={2} className="atlas-textarea text-sm" placeholder="Enter your question..." />
      </div>

      {/* MC / T-F options */}
      {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
        <div>
          <label className="block text-xs text-atlas-subtle mb-2">
            Options — {q.question_type === 'true_false' ? 'mark the correct one' : 'mark correct answer(s)'}
          </label>
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-3">
                <input type="radio" name={`q-correct-${q.id || 'new'}`} checked={opt.is_correct}
                  onChange={() => setOption(i, 'is_correct', true)}
                  className="flex-shrink-0 accent-atlas-emerald" title="Mark as correct" />
                {q.question_type === 'true_false' ? (
                  <span className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium ${opt.is_correct ? 'border-atlas-emerald/50 bg-atlas-emerald/10 text-atlas-emerald' : 'border-atlas-border text-atlas-subtle'}`}>
                    {opt.text}
                  </span>
                ) : (
                  <input value={opt.text} onChange={e => setOption(i, 'text', e.target.value)}
                    className={`atlas-input py-2 flex-1 text-sm ${opt.is_correct ? 'border-atlas-emerald/50 bg-atlas-emerald/5' : ''}`}
                    placeholder={`Option ${opt.id.toUpperCase()}`} />
                )}
                {q.question_type === 'multiple_choice' && q.options.length > 2 && (
                  <button onClick={() => set({ options: q.options.filter((_, j) => j !== i) })}
                    className="text-atlas-subtle hover:text-atlas-red text-sm">×</button>
                )}
              </div>
            ))}
            {q.question_type === 'multiple_choice' && q.options.length < 6 && (
              <button onClick={() => set({ options: [...q.options, { id: String.fromCharCode(97 + q.options.length), text: '', is_correct: false }] })}
                className="text-atlas-blue text-xs hover:underline">+ Add option</button>
            )}
          </div>
        </div>
      )}

      {/* Fill blank */}
      {q.question_type === 'fill_blank' && (
        <div>
          <label className="block text-xs text-atlas-subtle mb-1">Correct Answer (exact match, case-insensitive)</label>
          <input value={q.correct_answer} onChange={e => set({ correct_answer: e.target.value })}
            className="atlas-input py-2 text-sm" placeholder="e.g. photosynthesis" />
          <p className="text-xs text-atlas-subtle mt-1">Tip: use underscores in question text for blank: "Plants use ___ to make food"</p>
        </div>
      )}

      {/* Short / Long answer */}
      {(q.question_type === 'short_answer' || q.question_type === 'long_answer') && (
        <div>
          <label className="block text-xs text-atlas-subtle mb-1">
            {q.question_type === 'short_answer' ? 'Expected Answer / Key Points' : 'Rubric / Grading Criteria'}
          </label>
          <textarea value={q.correct_answer} onChange={e => set({ correct_answer: e.target.value })}
            rows={q.question_type === 'long_answer' ? 4 : 2}
            className="atlas-textarea text-sm"
            placeholder={q.question_type === 'short_answer' ? 'Key points students should mention...' : 'Criteria for a strong response...'} />
        </div>
      )}

      {/* Explanation */}
      <div>
        <label className="block text-xs text-atlas-subtle mb-1">Explanation (shown after student answers)</label>
        <textarea value={q.explanation} onChange={e => set({ explanation: e.target.value })}
          rows={2} className="atlas-textarea text-sm" placeholder="Why is this the correct answer?" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// SECTION EDITORS
// ─────────────────────────────────────────

// Image section
function ImageSectionEditor({ section, onSave, supabase, lessonId }: {
  section: LessonSection; onSave: (id: string, u: Partial<LessonSection>) => Promise<void>
  supabase: any; lessonId: string
}) {
  const [caption, setCaption] = useState('')
  const [imgUrl,  setImgUrl]  = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Parse existing content: "imgUrl|||caption"
    const parts = (section.content || '').split('|||')
    setImgUrl(parts[0] || '')
    setCaption(parts[1] || '')
  }, [section.id])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }
    const ext  = file.name.split('.').pop()
    const path = `${user.id}/${lessonId}/${section.id}.${ext}`
    const { error } = await supabase.storage.from('lesson-thumbnails').upload(path, file, { upsert: true })
    if (error) { toast.error('Upload failed: ' + error.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('lesson-thumbnails').getPublicUrl(path)
    setImgUrl(publicUrl)
    setUploading(false)
    toast.success('Image uploaded!')
    if (fileRef.current) fileRef.current.value = ''
  }

  const save = async () => {
    await onSave(section.id, { content: `${imgUrl}|||${caption}`, metadata: { imgUrl, caption } })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-atlas-subtle mb-2">Image URL</label>
        <div className="flex gap-2">
          <input value={imgUrl} onChange={e => setImgUrl(e.target.value)}
            className="atlas-input py-2 flex-1 text-sm" placeholder="https://... or upload below" />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="btn-secondary text-sm py-2 flex-shrink-0">
            {uploading ? '⏳' : '📁 Upload'}
          </button>
        </div>
      </div>
      {imgUrl && (
        <div className="rounded-xl overflow-hidden border border-atlas-border">
          <img src={imgUrl} alt={caption || 'Section image'} className="w-full max-h-80 object-contain bg-black/20" />
        </div>
      )}
      <div>
        <label className="block text-xs text-atlas-subtle mb-1">Caption (optional)</label>
        <input value={caption} onChange={e => setCaption(e.target.value)}
          className="atlas-input py-2 text-sm" placeholder="Describe this image..." />
      </div>
      <button onClick={save} className="btn-primary text-sm py-2">✓ Save Image Section</button>
    </div>
  )
}

// Video section
function VideoSectionEditor({ section, onSave }: {
  section: LessonSection; onSave: (id: string, u: Partial<LessonSection>) => Promise<void>
}) {
  const [url,     setUrl]     = useState(section.content || '')
  const [caption, setCaption] = useState('')

  useEffect(() => {
    const parts = (section.content || '').split('|||')
    setUrl(parts[0] || '')
    setCaption(parts[1] || '')
  }, [section.id])

  const embedUrl = (raw: string) => {
    const ytMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
    const vmMatch = raw.match(/vimeo\.com\/(\d+)/)
    if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}`
    return raw
  }
  const embed = embedUrl(url)
  const isEmbeddable = embed.includes('youtube.com/embed') || embed.includes('vimeo.com/video')

  const save = async () => {
    await onSave(section.id, { content: `${url}|||${caption}` })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-atlas-subtle mb-1">Video URL (YouTube, Vimeo, or direct link)</label>
        <input value={url} onChange={e => setUrl(e.target.value)}
          className="atlas-input py-2 text-sm" placeholder="https://youtube.com/watch?v=..." />
      </div>
      {url && isEmbeddable && (
        <div className="rounded-xl overflow-hidden border border-atlas-border bg-black aspect-video">
          <iframe src={embed} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; encrypted-media; gyroscope" />
        </div>
      )}
      {url && !isEmbeddable && (
        <div className="p-4 bg-atlas-surface border border-atlas-border rounded-xl">
          <p className="text-atlas-subtle text-sm">🎬 Video link set. Preview not available for this URL format.</p>
        </div>
      )}
      <div>
        <label className="block text-xs text-atlas-subtle mb-1">Caption (optional)</label>
        <input value={caption} onChange={e => setCaption(e.target.value)}
          className="atlas-input py-2 text-sm" placeholder="Describe this video..." />
      </div>
      <button onClick={save} className="btn-primary text-sm py-2">✓ Save Video Section</button>
    </div>
  )
}

// Quiz section (inline questions for this section)
function QuizSectionEditor({ section, lessonId, supabase, onSave }: {
  section: LessonSection; lessonId: string; supabase: any
  onSave: (id: string, u: Partial<LessonSection>) => Promise<void>
}) {
  const [questions, setQuestions] = useState<QDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [title,   setTitle]   = useState(section.content || 'Section Quiz')

  useEffect(() => {
    supabase.from('quiz_questions').select('*')
      .eq('lesson_id', lessonId).eq('section_id', section.id)
      .then(({ data }: any) => {
        if (data?.length) setQuestions(data.map((q: any) => ({ ...q, id: q.id })))
        else setQuestions([emptyQ()])
      })
  }, [section.id])

  const saveAll = async () => {
    setSaving(true)
    await onSave(section.id, { content: title })
    // Delete old, insert new
    await supabase.from('quiz_questions').delete().eq('lesson_id', lessonId).eq('section_id', section.id)
    if (questions.length > 0) {
      await supabase.from('quiz_questions').insert(
        questions.filter(q => q.question_text.trim()).map((q, i) => ({
          lesson_id: lessonId, section_id: section.id,
          question_text: q.question_text, question_type: q.question_type,
          options: q.options.length ? q.options : null,
          correct_answer: q.correct_answer || null,
          explanation: q.explanation || null,
          difficulty: q.difficulty,
          is_diagnostic: q.is_diagnostic, is_micro_check: q.is_micro_check, is_final_quiz: q.is_final_quiz,
          order_index: i,
        }))
      )
    }
    setSaving(false)
    toast.success('Quiz section saved!')
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-atlas-subtle mb-1">Quiz title / instructions</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="atlas-input py-2 text-sm" placeholder="e.g. Check your understanding" />
      </div>
      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionBuilder key={i} q={q}
            onChange={updated => setQuestions(questions.map((x, j) => j === i ? updated : x))}
            onDelete={() => setQuestions(questions.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={() => setQuestions([...questions, emptyQ()])}
          className="btn-secondary text-sm py-2">+ Add Question</button>
        <button onClick={saveAll} disabled={saving}
          className="btn-primary text-sm py-2">{saving ? '⏳ Saving...' : '✓ Save Quiz Section'}</button>
      </div>
    </div>
  )
}

// Activity / Discussion section editor
function ActivitySectionEditor({ section, onSave, type }: {
  section: LessonSection; onSave: (id: string, u: Partial<LessonSection>) => Promise<void>
  type: 'activity' | 'discussion'
}) {
  const [content, setContent] = useState(section.content || '')
  return (
    <div className="space-y-4">
      <RichTextEditor value={content} onChange={setContent}
        placeholder={type === 'activity' ? 'Describe the activity steps, materials, and instructions...' : 'Write your discussion prompt and guiding questions...'} />
      <button onClick={() => onSave(section.id, { content })} className="btn-primary text-sm py-2">✓ Save</button>
    </div>
  )
}

// Full section editor wrapper
function SectionEditor({ section, index, onSave, onDelete, onCancel, supabase, lessonId }: {
  section: LessonSection; index: number
  onSave: (id: string, u: Partial<LessonSection>) => Promise<void>
  onDelete: (id: string) => void; onCancel: () => void
  supabase: any; lessonId: string
}) {
  const [title,       setTitle]       = useState(section.title)
  const [contentType, setContentType] = useState<ContentType>(section.content_type)
  const [content,     setContent]     = useState(section.content || '')
  const [duration,    setDuration]    = useState(section.duration_minutes)
  const [saving,      setSaving]      = useState(false)

  const handleTypeChange = async (t: ContentType) => {
    setContentType(t)
    // Save type immediately to DB
    await supabase.from('lesson_sections').update({ content_type: t, title }).eq('id', section.id)
  }

  const handleSaveText = async () => {
    setSaving(true)
    await onSave(section.id, { title, content, content_type: contentType, duration_minutes: duration })
    setSaving(false)
  }

  const TYPE_ICONS: Record<ContentType, string> = {
    text: '📄', video: '🎬', image: '🖼️', quiz: '❓', activity: '🔬', discussion: '💬',
  }

  return (
    <div className="border-2 border-atlas-blue/40 rounded-2xl overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-atlas-blue/5 border-b border-atlas-blue/20">
        <span className="w-7 h-7 rounded-lg bg-atlas-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{index + 1}</span>
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="atlas-input py-1.5 font-semibold flex-1 text-sm" placeholder="Section title..." />

        {/* Type selector */}
        <div className="flex gap-1 flex-shrink-0">
          {(['text','image','video','quiz','activity','discussion'] as ContentType[]).map(t => (
            <button key={t} onClick={() => handleTypeChange(t)} title={t}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${contentType === t ? 'bg-atlas-blue text-white' : 'bg-atlas-card text-atlas-subtle hover:text-atlas-text border border-atlas-border'}`}>
              {TYPE_ICONS[t]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <input type="number" min={1} max={120} value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="atlas-input py-1.5 w-14 text-xs text-center" title="Duration (minutes)" />
          <span className="text-xs text-atlas-subtle">min</span>
        </div>
        <button onClick={onCancel} className="btn-ghost text-xs py-1 px-3 flex-shrink-0">Close</button>
      </div>

      {/* Content area based on type */}
      <div className="p-4">
        {(contentType === 'text' || contentType === undefined) && (
          <div className="space-y-3">
            <RichTextEditor value={content} onChange={setContent} />
            <div className="flex gap-2">
              <button onClick={handleSaveText} disabled={saving} className="btn-primary text-sm py-2">
                {saving ? '⏳ Saving...' : '✓ Save Section'}
              </button>
              <button onClick={() => { if (confirm('Delete this section?')) onDelete(section.id) }}
                className="btn-ghost text-sm py-2 text-atlas-red">🗑 Delete</button>
            </div>
          </div>
        )}
        {contentType === 'image' && (
          <ImageSectionEditor section={{ ...section, content }} onSave={async (id, u) => { await onSave(id, { ...u, title, content_type: contentType, duration_minutes: duration }); }} supabase={supabase} lessonId={lessonId} />
        )}
        {contentType === 'video' && (
          <VideoSectionEditor section={{ ...section, content }} onSave={async (id, u) => { await onSave(id, { ...u, title, content_type: contentType, duration_minutes: duration }); }} />
        )}
        {contentType === 'quiz' && (
          <QuizSectionEditor section={{ ...section, content, content_type: contentType }} lessonId={lessonId} supabase={supabase} onSave={async (id, u) => { await onSave(id, { ...u, title, content_type: contentType, duration_minutes: duration }); }} />
        )}
        {(contentType === 'activity' || contentType === 'discussion') && (
          <ActivitySectionEditor section={{ ...section, content, content_type: contentType }} type={contentType} onSave={async (id, u) => { await onSave(id, { ...u, title, content_type: contentType, duration_minutes: duration }); }} />
        )}
        {contentType !== 'text' && contentType !== undefined && (
          <div className="mt-3 pt-3 border-t border-atlas-border">
            <button onClick={() => { if (confirm('Delete this section?')) onDelete(section.id) }}
              className="btn-ghost text-sm py-2 text-atlas-red">🗑 Delete Section</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────
export default function TeacherLessonDetail() {
  const params   = useParams()
  const router   = useRouter()
  const lessonId = params.id as string
  const supabase = createClient()

  const [lesson,          setLesson]          = useState<Lesson | null>(null)
  const [sections,        setSections]        = useState<LessonSection[]>([])
  const [questions,       setQuestions]       = useState<QuizQuestion[]>([])
  const [qDrafts,         setQDrafts]         = useState<QDraft[]>([])
  const [glossary,        setGlossary]        = useState<GlossaryTerm[]>([])
  const [myClasses,       setMyClasses]       = useState<Class[]>([])
  const [tab,             setTab]             = useState<Tab>('overview')
  const [loading,         setLoading]         = useState(true)
  const [saving,          setSaving]          = useState(false)
  const [editingSectionId,setEditingSectionId]= useState<string | null>(null)
  const [assignments,     setAssignments]     = useState<{ class_id: string; class_name: string; created_at: string }[]>([])
  const [assignClassId,   setAssignClassId]   = useState('')
  const [assignDueDate,   setAssignDueDate]   = useState('')
  const [assigning,       setAssigning]       = useState(false)

  // Controlled overview
  const [title,        setTitle]        = useState('')
  const [description,  setDescription]  = useState('')
  const [subject,      setSubject]      = useState('')
  const [duration,     setDuration]     = useState(45)
  const [difficulty,   setDifficulty]   = useState<DifficultyLevel>('intermediate')
  const [objectives,   setObjectives]   = useState<string[]>([])
  const [complexity,   setComplexity]   = useState(50)
  const [pacing,       setPacing]       = useState(50)
  const [scaffolding,  setScaffolding]  = useState(50)
  const [overviewDirty,setOverviewDirty]= useState(false)

  // Glossary editing
  const [editingGlossaryId, setEditingGlossaryId] = useState<string | null>(null)
  const [newTerm, setNewTerm] = useState({ term: '', definition: '', example: '' })
  const [addingTerm, setAddingTerm] = useState(false)

  // Questions saving
  const [savingQ, setSavingQ] = useState(false)

  useEffect(() => { loadAll() }, [lessonId])

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [lessonRes, sectionsRes, questionsRes, glossaryRes, classesRes, assignRes] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle(),
      supabase.from('lesson_sections').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('quiz_questions').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('glossary_terms').select('*').eq('lesson_id', lessonId).order('created_at'),
      supabase.from('classes').select('*').eq('teacher_id', user.id).eq('is_active', true).order('name'),
      supabase.from('lesson_assignments').select('class_id, created_at, classes(name)').eq('lesson_id', lessonId).eq('is_active', true),
    ])

    const l = lessonRes.data
    if (l) {
      setLesson(l); setTitle(l.title || ''); setDescription(l.description || '');
      setSubject(l.subject || ''); setDuration(l.estimated_duration || 45);
      setDifficulty(l.difficulty || 'intermediate'); setObjectives(l.objectives || []);
      setComplexity(l.complexity_slider ?? 50); setPacing(l.pacing_slider ?? 50); setScaffolding(l.scaffolding_slider ?? 50);
    }
    setSections(sectionsRes.data || [])
    const qs: QuizQuestion[] = questionsRes.data || []
    setQuestions(qs)
    // Only load non-section questions into the question bank drafts
    setQDrafts(qs.filter((q: any) => !q.section_id || q.section_id === null).map((q: any) => ({ ...q })) as QDraft[])
    setGlossary(glossaryRes.data || [])
    setMyClasses(classesRes.data || [])
    setAssignments((assignRes.data || []).map((a: any) => ({ class_id: a.class_id, class_name: a.classes?.name || '', created_at: a.created_at })))
    setLoading(false)
  }

  const saveOverview = async () => {
    setSaving(true)
    const updates = { title, description, subject, estimated_duration: duration, difficulty, objectives: objectives.filter(Boolean), complexity_slider: complexity, pacing_slider: pacing, scaffolding_slider: scaffolding }
    const { error } = await supabase.from('lessons').update(updates).eq('id', lessonId)
    if (error) toast.error('Save failed: ' + error.message)
    else { setLesson(l => l ? { ...l, ...updates } : l); setOverviewDirty(false); toast.success('Saved!') }
    setSaving(false)
  }

  const changeStatus = async (status: 'draft' | 'published' | 'archived') => {
    await supabase.from('lessons').update({ status }).eq('id', lessonId)
    setLesson(l => l ? { ...l, status } : l)
    toast.success(status === 'published' ? '🚀 Published!' : status === 'draft' ? 'Moved to draft' : 'Archived')
  }

  const saveSection = async (sectionId: string, updates: Partial<LessonSection>) => {
    const { error } = await supabase.from('lesson_sections').update(updates).eq('id', sectionId)
    if (error) { toast.error('Save failed: ' + error.message); return }
    setSections(s => s.map(sec => sec.id === sectionId ? { ...sec, ...updates } : sec))
    setEditingSectionId(null)
    toast.success('Section saved!')
  }

  const addSection = async () => {
    const { data, error } = await supabase.from('lesson_sections').insert({
      lesson_id: lessonId, title: 'New Section', content: '', content_type: 'text',
      order_index: sections.length, duration_minutes: 5,
    }).select().single()
    if (error) { toast.error('Could not add section'); return }
    setSections(s => [...s, data])
    setEditingSectionId(data.id)
  }

  const deleteSection = async (id: string) => {
    await supabase.from('lesson_sections').delete().eq('id', id)
    setSections(s => s.filter(sec => sec.id !== id))
    setEditingSectionId(null)
    toast.success('Section deleted')
  }

  // Glossary ops
  const addGlossaryTerm = async () => {
    if (!newTerm.term.trim() || !newTerm.definition.trim()) { toast.error('Term and definition required'); return }
    const { data, error } = await supabase.from('glossary_terms').insert({ lesson_id: lessonId, ...newTerm }).select().single()
    if (error) { toast.error('Could not add term'); return }
    setGlossary(g => [...g, data])
    setNewTerm({ term: '', definition: '', example: '' })
    setAddingTerm(false)
    toast.success('Term added!')
  }

  const updateGlossaryTerm = async (id: string, updates: Partial<GlossaryTerm>) => {
    await supabase.from('glossary_terms').update(updates).eq('id', id)
    setGlossary(g => g.map(t => t.id === id ? { ...t, ...updates } : t))
    setEditingGlossaryId(null)
    toast.success('Term updated')
  }

  const deleteGlossaryTerm = async (id: string) => {
    await supabase.from('glossary_terms').delete().eq('id', id)
    setGlossary(g => g.filter(t => t.id !== id))
    toast.success('Term removed')
  }

  // Questions save
  const saveQuestions = async () => {
    setSavingQ(true)
    // Delete non-section questions, re-insert
    await supabase.from('quiz_questions').delete().eq('lesson_id', lessonId).is('section_id', null)
    const toInsert = qDrafts.filter(q => q.question_text.trim()).map((q, i) => ({
      lesson_id: lessonId, section_id: null,
      question_text: q.question_text, question_type: q.question_type,
      options: (q.question_type === 'multiple_choice' || q.question_type === 'true_false') ? q.options : null,
      correct_answer: q.correct_answer || null,
      explanation: q.explanation || null,
      difficulty: q.difficulty,
      is_diagnostic: q.is_diagnostic, is_micro_check: q.is_micro_check, is_final_quiz: q.is_final_quiz,
      order_index: i,
    }))
    if (toInsert.length > 0) await supabase.from('quiz_questions').insert(toInsert)
    await loadAll()
    setSavingQ(false)
    toast.success('Questions saved!')
  }

  // Assign
  const assignToClass = async () => {
    if (!assignClassId) { toast.error('Pick a class'); return }
    setAssigning(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAssigning(false); return }
    if (assignments.find(a => a.class_id === assignClassId)) { toast.error('Already assigned'); setAssigning(false); return }
    const { error } = await supabase.from('lesson_assignments').insert({ lesson_id: lessonId, class_id: assignClassId, assigned_by: user.id, due_date: assignDueDate || null, is_active: true })
    if (error) { toast.error('Failed: ' + error.message); setAssigning(false); return }
    const cls = myClasses.find(c => c.id === assignClassId)
    setAssignments(a => [...a, { class_id: assignClassId, class_name: cls?.name || '', created_at: new Date().toISOString() }])
    if (lesson?.status !== 'published') await changeStatus('published')
    setAssignClassId(''); setAssignDueDate('')
    setAssigning(false)
    toast.success(`Assigned to ${cls?.name}!`)
  }

  const unassign = async (classId: string) => {
    await supabase.from('lesson_assignments').update({ is_active: false }).eq('lesson_id', lessonId).eq('class_id', classId)
    setAssignments(a => a.filter(x => x.class_id !== classId))
    toast.success('Assignment removed')
  }

  const TYPE_INFO: Record<string, { icon: string; color: string }> = {
    text: { icon: '📄', color: 'blue' }, image: { icon: '🖼️', color: 'purple' },
    video: { icon: '🎬', color: 'red' }, quiz: { icon: '❓', color: 'amber' },
    activity: { icon: '🔬', color: 'emerald' }, discussion: { icon: '💬', color: 'cyan' },
  }

  if (loading) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="h-10 w-64 bg-atlas-card rounded-xl shimmer mb-6" />
      <div className="h-64 bg-atlas-card rounded-2xl shimmer" />
    </div>
  )

  if (!lesson) return (
    <div className="p-6 text-center">
      <p className="text-atlas-subtle">Lesson not found.</p>
      <button onClick={() => router.push('/teacher/lessons')} className="btn-primary mt-4">Back</button>
    </div>
  )

  const badge = getStatusBadge(lesson.status)

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => router.push('/teacher/lessons')} className="btn-ghost mt-1 flex-shrink-0">←</button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`badge ${badge.className}`}>{badge.label}</span>
              {lesson.ai_generated && <span className="badge bg-atlas-purple/10 text-atlas-purple border-atlas-purple/20">✨ AI</span>}
            </div>
            <h1 className="font-display font-bold text-2xl text-atlas-text">{lesson.title}</h1>
            <p className="text-atlas-subtle text-xs mt-0.5">Updated {formatRelativeTime(lesson.updated_at)} · {sections.length} sections · {questions.filter((q: any) => !q.section_id).length} questions</p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {lesson.status !== 'published' && <button onClick={() => changeStatus('published')} className="btn-primary text-sm py-2">🚀 Publish</button>}
          {lesson.status === 'published' && <button onClick={() => changeStatus('draft')} className="btn-secondary text-sm py-2">Unpublish</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-atlas-border mb-6 overflow-x-auto">
        {([
          { key: 'overview'  as Tab, label: '📋 Overview' },
          { key: 'sections'  as Tab, label: `📚 Sections (${sections.length})` },
          { key: 'questions' as Tab, label: `❓ Questions (${qDrafts.length})` },
          { key: 'glossary'  as Tab, label: `📖 Glossary (${glossary.length})` },
          { key: 'assign'    as Tab, label: `🎯 Assign${assignments.length > 0 ? ` (${assignments.length})` : ''}` },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-all ${tab === t.key ? 'border-atlas-blue text-atlas-blue' : 'border-transparent text-atlas-subtle hover:text-atlas-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="lg:col-span-2 space-y-4">
            <div className="atlas-card">
              <label className="block text-xs font-medium text-atlas-subtle mb-1">Title</label>
              <input value={title} onChange={e => { setTitle(e.target.value); setOverviewDirty(true) }} className="atlas-input font-display font-bold text-xl" />
            </div>
            <div className="atlas-card">
              <label className="block text-xs font-medium text-atlas-subtle mb-1">Description</label>
              <textarea value={description} onChange={e => { setDescription(e.target.value); setOverviewDirty(true) }} rows={3} className="atlas-textarea" placeholder="Overview for students..." />
            </div>
            <div className="atlas-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-atlas-text">📎 Learning Objectives</h3>
                <button onClick={() => { setObjectives(o => [...o, '']); setOverviewDirty(true) }} className="text-atlas-blue text-xs hover:underline">+ Add</button>
              </div>
              <div className="space-y-2">
                {objectives.map((obj, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-atlas-blue font-bold text-sm w-5 flex-shrink-0">{i+1}.</span>
                    <input value={obj} onChange={e => { const o=[...objectives]; o[i]=e.target.value; setObjectives(o); setOverviewDirty(true) }} className="atlas-input py-2 flex-1" placeholder={`Objective ${i+1}...`} />
                    <button onClick={() => { setObjectives(o=>o.filter((_,j)=>j!==i)); setOverviewDirty(true) }} className="text-atlas-subtle hover:text-atlas-red text-lg">×</button>
                  </div>
                ))}
                {objectives.length === 0 && <p className="text-xs text-atlas-subtle">No objectives yet. Click + Add.</p>}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="atlas-card space-y-3">
              <div><label className="block text-xs text-atlas-subtle mb-1">Subject</label><input value={subject} onChange={e => { setSubject(e.target.value); setOverviewDirty(true) }} className="atlas-input py-2" placeholder="e.g. Biology" /></div>
              <div><label className="block text-xs text-atlas-subtle mb-1">Duration (min)</label><input type="number" value={duration} onChange={e => { setDuration(Number(e.target.value)); setOverviewDirty(true) }} className="atlas-input py-2" /></div>
              <div><label className="block text-xs text-atlas-subtle mb-1">Difficulty</label>
                <select value={difficulty} onChange={e => { setDifficulty(e.target.value as DifficultyLevel); setOverviewDirty(true) }} className="atlas-input py-2">
                  <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
            <div className="atlas-card">
              <h3 className="font-semibold text-atlas-text mb-3 text-sm">⚙️ Differentiation</h3>
              {[
                { label: 'Complexity',  val: complexity,  set: (v:number) => { setComplexity(v);  setOverviewDirty(true) }, color: '#4F86F7' },
                { label: 'Pacing',      val: pacing,      set: (v:number) => { setPacing(v);      setOverviewDirty(true) }, color: '#F5A623' },
                { label: 'Scaffolding', val: scaffolding, set: (v:number) => { setScaffolding(v); setOverviewDirty(true) }, color: '#23D18B' },
              ].map(s => (
                <div key={s.label} className="mb-3 last:mb-0">
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-atlas-subtle">{s.label}</span><span style={{color:s.color}} className="font-bold">{s.val}%</span></div>
                  <input type="range" min={0} max={100} value={s.val} onChange={e => s.set(Number(e.target.value))} style={{accentColor:s.color}} className="w-full" />
                </div>
              ))}
            </div>
            {overviewDirty && (
              <button onClick={saveOverview} disabled={saving} className="btn-primary w-full justify-center py-3 glow-blue">
                {saving ? '⏳ Saving...' : '💾 Save Changes'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── SECTIONS ── */}
      {tab === 'sections' && (
        <div className="animate-fade-in space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-atlas-subtle">Click ✏️ Edit to expand the editor. Choose content type with the icon buttons.</p>
            <button onClick={addSection} className="btn-primary text-sm py-2">+ Add Section</button>
          </div>

          {sections.length === 0 && (
            <div className="atlas-card text-center py-12">
              <span className="text-4xl block mb-3">📚</span>
              <p className="text-atlas-text font-medium mb-4">No sections yet</p>
              <button onClick={addSection} className="btn-primary">+ Add First Section</button>
            </div>
          )}

          {sections.map((sec, i) =>
            editingSectionId === sec.id ? (
              <SectionEditor key={sec.id} section={sec} index={i}
                onSave={saveSection} onDelete={deleteSection}
                onCancel={() => setEditingSectionId(null)}
                supabase={supabase} lessonId={lessonId} />
            ) : (
              <div key={sec.id} className="atlas-card border border-atlas-border hover:border-atlas-blue/30 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-atlas-muted/30 text-atlas-subtle text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                  <span className="text-lg flex-shrink-0">{TYPE_INFO[sec.content_type]?.icon || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-atlas-text text-sm">{sec.title}</p>
                    <p className="text-xs text-atlas-subtle mt-0.5">
                      <span className={`badge bg-atlas-${TYPE_INFO[sec.content_type]?.color || 'blue'}/10 text-atlas-${TYPE_INFO[sec.content_type]?.color || 'blue'} border-atlas-${TYPE_INFO[sec.content_type]?.color || 'blue'}/20 mr-2`}>{sec.content_type}</span>
                      {sec.content ? (sec.content.startsWith('<') ? 'Has rich text content' : sec.content.slice(0, 80) + (sec.content.length > 80 ? '…' : '')) : 'Empty — click Edit'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-atlas-subtle">⏱ {sec.duration_minutes}m</span>
                    <button onClick={() => setEditingSectionId(sec.id)} className="btn-ghost text-xs py-1 px-3">✏️ Edit</button>
                  </div>
                </div>
              </div>
            )
          )}

          {sections.length > 0 && editingSectionId === null && (
            <button onClick={addSection} className="w-full py-4 border-2 border-dashed border-atlas-border rounded-2xl text-atlas-subtle hover:border-atlas-blue hover:text-atlas-blue transition-all text-sm">
              + Add Section
            </button>
          )}
        </div>
      )}

      {/* ── QUESTIONS ── */}
      {tab === 'questions' && (
        <div className="animate-fade-in space-y-4">
          <div className="grid grid-cols-3 gap-3 mb-2">
            {[
              { label: '🔍 Pre-check (Diagnostic)', count: qDrafts.filter(q=>q.is_diagnostic).length,  color: 'purple' },
              { label: '⚡ Micro-check',             count: qDrafts.filter(q=>q.is_micro_check).length, color: 'cyan' },
              { label: '🏆 Final Quiz',               count: qDrafts.filter(q=>q.is_final_quiz).length,  color: 'amber' },
            ].map((s,i) => (
              <div key={i} className="atlas-card py-3 px-4">
                <p className="text-xs text-atlas-subtle mb-1">{s.label}</p>
                <p className={`font-display font-bold text-2xl text-atlas-${s.color}`}>{s.count}</p>
              </div>
            ))}
          </div>

          <div className="p-3 bg-atlas-blue/5 border border-atlas-blue/20 rounded-xl text-xs text-atlas-subtle">
            <strong className="text-atlas-text">How it works:</strong> Pre-check questions appear before the lesson starts. Micro-check questions appear after a specific section. Final quiz questions appear at the end. Quiz sections (created in Sections tab) appear inline during the lesson.
          </div>

          {qDrafts.length === 0 && (
            <div className="atlas-card text-center py-10">
              <span className="text-4xl block mb-3">❓</span>
              <p className="text-atlas-text font-medium mb-4">No questions yet. Add pre-checks, micro-checks, or final quiz questions.</p>
            </div>
          )}

          {qDrafts.map((q, i) => (
            <QuestionBuilder key={i} q={q}
              onChange={updated => setQDrafts(qDrafts.map((x,j)=>j===i?updated:x))}
              onDelete={() => setQDrafts(qDrafts.filter((_,j)=>j!==i))}
            />
          ))}

          <div className="flex gap-3 sticky bottom-4">
            <button onClick={() => setQDrafts(d=>[...d, emptyQ({ is_diagnostic: true })])}
              className="btn-secondary text-sm py-2 flex-1 justify-center">+ Pre-check</button>
            <button onClick={() => setQDrafts(d=>[...d, emptyQ({ is_micro_check: true })])}
              className="btn-secondary text-sm py-2 flex-1 justify-center">+ Micro-check</button>
            <button onClick={() => setQDrafts(d=>[...d, emptyQ({ is_final_quiz: true })])}
              className="btn-secondary text-sm py-2 flex-1 justify-center">+ Final Quiz Q</button>
            <button onClick={saveQuestions} disabled={savingQ}
              className="btn-primary text-sm py-2 flex-1 justify-center glow-blue">
              {savingQ ? '⏳ Saving...' : '💾 Save All Questions'}
            </button>
          </div>
        </div>
      )}

      {/* ── GLOSSARY ── */}
      {tab === 'glossary' && (
        <div className="animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg text-atlas-text">📖 Glossary Terms</h2>
            <button onClick={() => setAddingTerm(true)} className="btn-primary text-sm py-2">+ Add Term</button>
          </div>

          {/* Add new term form */}
          {addingTerm && (
            <div className="atlas-card border-2 border-atlas-blue/40 space-y-3">
              <h3 className="font-semibold text-atlas-text text-sm">New Glossary Term</h3>
              <div><label className="block text-xs text-atlas-subtle mb-1">Term *</label>
                <input value={newTerm.term} onChange={e=>setNewTerm(t=>({...t,term:e.target.value}))} className="atlas-input py-2" placeholder="e.g. Photosynthesis" autoFocus /></div>
              <div><label className="block text-xs text-atlas-subtle mb-1">Definition *</label>
                <textarea value={newTerm.definition} onChange={e=>setNewTerm(t=>({...t,definition:e.target.value}))} rows={2} className="atlas-textarea" placeholder="Clear, student-friendly definition..." /></div>
              <div><label className="block text-xs text-atlas-subtle mb-1">Example (optional)</label>
                <input value={newTerm.example} onChange={e=>setNewTerm(t=>({...t,example:e.target.value}))} className="atlas-input py-2" placeholder="e.g. Plants use photosynthesis to turn sunlight into sugar" /></div>
              <div className="flex gap-2">
                <button onClick={() => { setAddingTerm(false); setNewTerm({ term:'',definition:'',example:'' }) }} className="btn-secondary text-sm py-2">Cancel</button>
                <button onClick={addGlossaryTerm} className="btn-primary text-sm py-2">Add Term</button>
              </div>
            </div>
          )}

          {glossary.length === 0 && !addingTerm ? (
            <div className="atlas-card text-center py-12">
              <span className="text-4xl block mb-3">📖</span>
              <p className="text-atlas-text font-medium mb-4">No glossary terms yet</p>
              <button onClick={() => setAddingTerm(true)} className="btn-primary">+ Add First Term</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {glossary.map(term => (
                editingGlossaryId === term.id ? (
                  <GlossaryEditCard key={term.id} term={term} onSave={updateGlossaryTerm} onCancel={() => setEditingGlossaryId(null)} />
                ) : (
                  <div key={term.id} className="atlas-card group relative">
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingGlossaryId(term.id)} className="btn-ghost text-xs py-1 px-2">✏️</button>
                      <button onClick={() => { if (confirm('Delete this term?')) deleteGlossaryTerm(term.id) }} className="btn-ghost text-xs py-1 px-2 text-atlas-red">×</button>
                    </div>
                    <p className="font-display font-bold text-atlas-text pr-14">{term.term}</p>
                    <p className="text-atlas-subtle text-sm mt-1">{term.definition}</p>
                    {term.example && <p className="text-atlas-cyan text-xs mt-2 italic">e.g. {term.example}</p>}
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGN ── */}
      {tab === 'assign' && (
        <div className="animate-fade-in space-y-6">
          {assignments.length > 0 && (
            <div className="atlas-card">
              <h3 className="font-semibold text-atlas-text mb-4">✅ Currently Assigned</h3>
              <div className="space-y-2">
                {assignments.map(a => (
                  <div key={a.class_id} className="flex items-center justify-between p-3 bg-atlas-surface rounded-xl border border-atlas-border">
                    <div className="flex items-center gap-3"><span className="text-xl">🏫</span>
                      <div><p className="font-medium text-atlas-text text-sm">{a.class_name}</p>
                        <p className="text-xs text-atlas-subtle">Assigned {formatRelativeTime(a.created_at)}</p></div>
                    </div>
                    <button onClick={() => { if(confirm('Remove?')) unassign(a.class_id) }} className="text-atlas-subtle hover:text-atlas-red text-xs">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="atlas-card">
            <h3 className="font-semibold text-atlas-text mb-1">🎯 Assign to Class</h3>
            <p className="text-atlas-subtle text-sm mb-4">Students in that class will see this lesson in their dashboard.{lesson.status !== 'published' && <span className="text-atlas-amber"> Lesson auto-publishes on assign.</span>}</p>
            {myClasses.length === 0 ? (
              <div className="text-center py-6"><p className="text-atlas-subtle text-sm mb-3">No classes yet.</p>
                <button onClick={() => router.push('/teacher/students')} className="btn-secondary text-sm">Go create a class →</button></div>
            ) : (
              <div className="space-y-4">
                <div><label className="block text-xs text-atlas-subtle mb-1">Class *</label>
                  <select value={assignClassId} onChange={e => setAssignClassId(e.target.value)} className="atlas-input py-2">
                    <option value="">— Choose a class —</option>
                    {myClasses.filter(c => !assignments.find(a => a.class_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}{c.subject ? ` · ${c.subject}` : ''}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-atlas-subtle mb-1">Due Date (optional)</label>
                  <input type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)} className="atlas-input py-2 w-48" min={new Date().toISOString().split('T')[0]} /></div>
                <button onClick={assignToClass} disabled={assigning || !assignClassId} className="btn-primary py-3 px-8 glow-blue disabled:opacity-40">
                  {assigning ? '⏳ Assigning...' : '✅ Assign Lesson'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Inline glossary edit card
function GlossaryEditCard({ term, onSave, onCancel }: {
  term: GlossaryTerm
  onSave: (id: string, u: Partial<GlossaryTerm>) => Promise<void>
  onCancel: () => void
}) {
  const [t, setT] = useState(term.term)
  const [d, setD] = useState(term.definition)
  const [e, setE] = useState(term.example || '')
  return (
    <div className="atlas-card border-2 border-atlas-blue/40 space-y-2">
      <input value={t} onChange={ev=>setT(ev.target.value)} className="atlas-input py-1.5 font-bold text-sm" placeholder="Term" />
      <textarea value={d} onChange={ev=>setD(ev.target.value)} rows={2} className="atlas-textarea text-sm" placeholder="Definition..." />
      <input value={e} onChange={ev=>setE(ev.target.value)} className="atlas-input py-1.5 text-xs" placeholder="Example..." />
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-ghost text-xs py-1">Cancel</button>
        <button onClick={() => onSave(term.id, { term:t, definition:d, example:e })} className="btn-primary text-xs py-1">Save</button>
      </div>
    </div>
  )
}
