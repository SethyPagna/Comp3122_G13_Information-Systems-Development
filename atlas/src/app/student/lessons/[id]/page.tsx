'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Lesson, LessonSection, QuizQuestion, StudentProgress, ChatMessage, GlossaryTerm } from '@/types'
import toast from 'react-hot-toast'

type Phase = 'loading' | 'diagnostic' | 'learning' | 'quiz_section' | 'micro_check' | 'final_quiz' | 'complete'

// ── Content renderers ──────────────────────────────────────────

function renderContent(html: string) {
  // If it looks like HTML use dangerouslySetInnerHTML, otherwise treat as plain text
  const isHtml = html.trim().startsWith('<')
  if (isHtml) {
    return <div className="lesson-prose" dangerouslySetInnerHTML={{ __html: html }} />
  }
  // Plain text with line breaks
  return (
    <div className="lesson-prose">
      {html.split('\n\n').map((para, i) => (
        <p key={i} className="mb-3">{para}</p>
      ))}
    </div>
  )
}

function TextContent({ content }: { content: string }) {
  return <div className="py-2">{renderContent(content)}</div>
}

function ImageContent({ content, title }: { content: string; title: string }) {
  const [imgUrl, caption] = content.split('|||')
  if (!imgUrl) return (
    <div className="py-4 text-center text-atlas-subtle">
      <span className="text-4xl block mb-2">🖼️</span>
      <p className="text-sm">Image content — no URL set</p>
    </div>
  )
  return (
    <div className="py-2">
      <img src={imgUrl} alt={caption || title} className="w-full max-h-[500px] object-contain rounded-xl border border-atlas-border" />
      {caption && <p className="text-sm text-atlas-subtle text-center mt-2 italic">{caption}</p>}
    </div>
  )
}

function VideoContent({ content }: { content: string }) {
  const [rawUrl, caption] = content.split('|||')
  const getEmbed = (raw: string) => {
    const ytMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
    const vmMatch = raw.match(/vimeo\.com\/(\d+)/)
    if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}`
    return raw
  }
  const embed = rawUrl ? getEmbed(rawUrl) : ''
  const isEmbeddable = embed.includes('youtube.com/embed') || embed.includes('vimeo.com/video')

  if (!rawUrl) return (
    <div className="py-4 text-center text-atlas-subtle">
      <span className="text-4xl block mb-2">🎬</span><p className="text-sm">No video URL set</p>
    </div>
  )
  return (
    <div className="py-2">
      {isEmbeddable
        ? <div className="aspect-video rounded-xl overflow-hidden border border-atlas-border bg-black">
            <iframe src={embed} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; encrypted-media; gyroscope" />
          </div>
        : <a href={rawUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-atlas-surface border border-atlas-border rounded-xl hover:border-atlas-blue transition-colors">
            <span className="text-3xl">🎬</span>
            <div><p className="font-medium text-atlas-text">Watch Video</p><p className="text-xs text-atlas-subtle truncate">{rawUrl}</p></div>
          </a>
      }
      {caption && <p className="text-sm text-atlas-subtle text-center mt-2 italic">{caption}</p>}
    </div>
  )
}

function ActivityContent({ content }: { content: string }) {
  return (
    <div className="py-2">
      <div className="p-4 bg-atlas-emerald/5 border border-atlas-emerald/20 rounded-xl mb-3">
        <p className="text-xs text-atlas-emerald font-semibold mb-1">🔬 ACTIVITY</p>
      </div>
      {renderContent(content)}
    </div>
  )
}

function DiscussionContent({ content }: { content: string }) {
  const [response, setResponse] = useState('')
  return (
    <div className="py-2">
      <div className="p-4 bg-atlas-purple/5 border border-atlas-purple/20 rounded-xl mb-4">
        <p className="text-xs text-atlas-purple font-semibold mb-2">💬 DISCUSSION PROMPT</p>
        {renderContent(content)}
      </div>
      <div>
        <label className="block text-sm font-medium text-atlas-text mb-2">Your thoughts (optional):</label>
        <textarea value={response} onChange={e => setResponse(e.target.value)}
          rows={4} className="atlas-textarea text-sm" placeholder="Share your thoughts..." />
      </div>
    </div>
  )
}

// ── Answer component for each question type ────────────────────
type AnswerState = { [questionId: string]: string }

function QuestionItem({ q, answers, setAnswers, submitted, index }: {
  q: QuizQuestion; answers: AnswerState
  setAnswers: (a: AnswerState) => void
  submitted: boolean; index: number
}) {
  const ans = answers[q.id] || ''
  const setAns = (val: string) => !submitted && setAnswers({ ...answers, [q.id]: val })

  const isCorrect = () => {
    if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
      return q.options?.find(o => o.id === ans)?.is_correct === true
    }
    if (q.question_type === 'fill_blank') {
      return (q.correct_answer || '').toLowerCase().trim() === ans.toLowerCase().trim()
    }
    return true // short/long answer always "accepted"
  }
  const correct = submitted && isCorrect()
  const wrong   = submitted && !isCorrect() && q.question_type !== 'short_answer' && q.question_type !== 'long_answer'

  return (
    <div className={`atlas-card transition-all ${submitted && correct ? 'border-atlas-emerald/40' : submitted && wrong ? 'border-atlas-red/40' : ''}`}>
      <div className="flex items-start gap-3 mb-4">
        <span className="w-6 h-6 rounded-full bg-atlas-blue/20 text-atlas-blue text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{index + 1}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {q.is_diagnostic  && <span className="badge bg-atlas-purple/10 text-atlas-purple border-atlas-purple/20 text-xs">Pre-check</span>}
            {q.is_micro_check && <span className="badge bg-atlas-cyan/10 text-atlas-cyan border-atlas-cyan/20 text-xs">Check</span>}
            {q.is_final_quiz  && <span className="badge bg-atlas-amber/10 text-atlas-amber border-atlas-amber/20 text-xs">Final</span>}
          </div>
          <p className="font-medium text-atlas-text text-sm leading-relaxed">{q.question_text}</p>
        </div>
        {submitted && (
          <span className={`text-lg flex-shrink-0 ${correct ? 'text-atlas-emerald' : wrong ? 'text-atlas-red' : 'text-atlas-amber'}`}>
            {correct ? '✓' : wrong ? '✗' : '📝'}
          </span>
        )}
      </div>

      {/* Multiple choice */}
      {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && q.options && (
        <div className="space-y-2">
          {q.options.map(opt => {
            const selected = ans === opt.id
            const showCorrect = submitted && opt.is_correct
            const showWrong   = submitted && selected && !opt.is_correct
            return (
              <button key={opt.id} onClick={() => setAns(opt.id)} disabled={submitted}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm flex items-center gap-3 ${
                  showCorrect ? 'bg-atlas-emerald/10 border-atlas-emerald text-atlas-emerald' :
                  showWrong   ? 'bg-atlas-red/10 border-atlas-red text-atlas-red' :
                  selected    ? 'bg-atlas-blue/10 border-atlas-blue text-atlas-text' :
                  submitted   ? 'bg-atlas-surface border-atlas-border text-atlas-subtle cursor-default' :
                  'bg-atlas-surface border-atlas-border text-atlas-subtle hover:border-atlas-muted hover:text-atlas-text'
                }`}>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  showCorrect ? 'border-atlas-emerald bg-atlas-emerald text-white' :
                  showWrong   ? 'border-atlas-red bg-atlas-red text-white' :
                  selected    ? 'border-atlas-blue bg-atlas-blue text-white' :
                  'border-atlas-border'
                }`}>
                  {showCorrect ? '✓' : showWrong ? '✗' : selected ? '●' : opt.id.toUpperCase()}
                </span>
                {opt.text}
              </button>
            )
          })}
        </div>
      )}

      {/* Fill in the blank */}
      {q.question_type === 'fill_blank' && (
        <div>
          <input value={ans} onChange={e => setAns(e.target.value)} disabled={submitted}
            className={`atlas-input py-2 text-sm ${submitted && correct ? 'border-atlas-emerald bg-atlas-emerald/10 text-atlas-emerald' : submitted && !correct ? 'border-atlas-red bg-atlas-red/10 text-atlas-red' : ''}`}
            placeholder="Type your answer..." />
          {submitted && q.correct_answer && (
            <p className="text-xs text-atlas-emerald mt-1">✓ Answer: <span className="font-medium">{q.correct_answer}</span></p>
          )}
        </div>
      )}

      {/* Short answer */}
      {q.question_type === 'short_answer' && (
        <div>
          <textarea value={ans} onChange={e => setAns(e.target.value)} disabled={submitted}
            rows={3} className="atlas-textarea text-sm" placeholder="Write your answer (2-4 sentences)..." />
          {submitted && q.correct_answer && (
            <div className="mt-2 p-3 bg-atlas-blue/5 border border-atlas-blue/20 rounded-xl">
              <p className="text-xs text-atlas-blue font-medium mb-1">💡 Key points</p>
              <p className="text-xs text-atlas-subtle">{q.correct_answer}</p>
            </div>
          )}
        </div>
      )}

      {/* Long answer */}
      {q.question_type === 'long_answer' && (
        <div>
          <textarea value={ans} onChange={e => setAns(e.target.value)} disabled={submitted}
            rows={6} className="atlas-textarea text-sm" placeholder="Write a detailed response..." />
          {submitted && q.correct_answer && (
            <div className="mt-2 p-3 bg-atlas-blue/5 border border-atlas-blue/20 rounded-xl">
              <p className="text-xs text-atlas-blue font-medium mb-1">📋 Rubric / Criteria</p>
              <p className="text-xs text-atlas-subtle">{q.correct_answer}</p>
            </div>
          )}
        </div>
      )}

      {/* Explanation */}
      {submitted && q.explanation && (
        <div className="mt-3 p-3 bg-atlas-muted/20 border border-atlas-border rounded-xl">
          <p className="text-xs font-medium text-atlas-blue mb-0.5">💡 Explanation</p>
          <p className="text-xs text-atlas-subtle">{q.explanation}</p>
        </div>
      )}
    </div>
  )
}

// ── Quiz section renderer ──────────────────────────────────────
function QuizSection({ questions, title, onComplete }: {
  questions: QuizQuestion[]; title: string
  onComplete: (score: number) => void
}) {
  const [answers, setAnswers] = useState<AnswerState>({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState<number | null>(null)

  const allAnswered = questions.every(q => answers[q.id])

  const submit = () => {
    let correct = 0
    questions.forEach(q => {
      if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
        if (q.options?.find(o => o.id === answers[q.id])?.is_correct) correct++
      } else if (q.question_type === 'fill_blank') {
        if ((q.correct_answer || '').toLowerCase().trim() === (answers[q.id] || '').toLowerCase().trim()) correct++
      } else {
        correct++ // short/long always counted
      }
    })
    const sc = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 100
    setScore(sc)
    setSubmitted(true)
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-atlas-amber/5 border border-atlas-amber/20 rounded-xl">
        <p className="text-sm font-semibold text-atlas-amber">❓ {title || 'Quiz'}</p>
      </div>
      {questions.map((q, i) => (
        <QuestionItem key={q.id} q={q} answers={answers} setAnswers={setAnswers} submitted={submitted} index={i} />
      ))}
      {!submitted ? (
        <button onClick={submit} disabled={!allAnswered}
          className="btn-primary w-full justify-center py-3.5 disabled:opacity-40">
          Submit Answers →
        </button>
      ) : (
        <div className="atlas-card text-center py-6">
          <p className="font-display font-bold text-3xl mb-2">
            <span className={score !== null && score >= 80 ? 'text-atlas-emerald' : score !== null && score >= 60 ? 'text-atlas-amber' : 'text-atlas-red'}>{score}%</span>
          </p>
          <p className="text-atlas-subtle text-sm mb-4">{score !== null && score >= 80 ? 'Excellent work!' : score !== null && score >= 60 ? 'Good effort!' : 'Keep practicing!'}</p>
          <button onClick={() => onComplete(score || 0)} className="btn-primary">Continue →</button>
        </div>
      )}
    </div>
  )
}

// ── Main Student Lesson Page ───────────────────────────────────
export default function StudentLesson() {
  const params   = useParams()
  const router   = useRouter()
  const lessonId = params.id as string
  const supabase = createClient()

  const [lesson,     setLesson]     = useState<Lesson | null>(null)
  const [sections,   setSections]   = useState<LessonSection[]>([])
  const [questions,  setQuestions]  = useState<QuizQuestion[]>([])
  const [glossary,   setGlossary]   = useState<GlossaryTerm[]>([])
  const [progress,   setProgress]   = useState<StudentProgress | null>(null)
  const [phase,      setPhase]      = useState<Phase>('loading')
  const [sectionIdx, setSectionIdx] = useState(0)

  const [diagAnswers,  setDiagAnswers]  = useState<AnswerState>({})
  const [diagSubmitted,setDiagSubmitted]= useState(false)
  const [finalAnswers, setFinalAnswers] = useState<AnswerState>({})
  const [finalSubmitted,setFinalSubmitted]= useState(false)
  const [microAnswers, setMicroAnswers] = useState<AnswerState>({})
  const [microSubmitted,setMicroSubmitted]= useState(false)

  const [showGlossary, setShowGlossary] = useState(false)
  const [showChat,     setShowChat]     = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput,    setChatInput]    = useState('')
  const [chatLoading,  setChatLoading]  = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Section quiz state
  const [sectionQs, setSectionQs] = useState<QuizQuestion[]>([])

  useEffect(() => { loadLesson() }, [lessonId])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const loadLesson = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [lessonRes, sectionsRes, questionsRes, glossaryRes, progressRes] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', lessonId).single(),
      supabase.from('lesson_sections').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('quiz_questions').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('glossary_terms').select('*').eq('lesson_id', lessonId).order('term'),
      supabase.from('student_progress').select('*').eq('student_id', user.id).eq('lesson_id', lessonId).maybeSingle(),
    ])

    setLesson(lessonRes.data)
    setSections(sectionsRes.data || [])
    setQuestions(questionsRes.data || [])
    setGlossary(glossaryRes.data || [])

    const p = progressRes.data
    if (p) {
      setProgress(p)
      if (p.status === 'completed') setPhase('complete')
      else {
        // Resume: find which section we left off on
        const completedIds: string[] = p.sections_completed || []
        const nextIdx = (sectionsRes.data || []).findIndex((s: any) => !completedIds.includes(s.id))
        setSectionIdx(nextIdx === -1 ? 0 : nextIdx)
        setPhase(p.diagnostic_completed ? 'learning' : 'diagnostic')
      }
    } else {
      const { data: np } = await supabase.from('student_progress').insert({
        student_id: user.id, lesson_id: lessonId, status: 'in_progress',
        sections_completed: [], started_at: new Date().toISOString(),
      }).select().single()
      setProgress(np)
      setPhase('diagnostic')
    }
  }

  const completeDiagnostic = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !progress) return
    const diagQs = questions.filter(q => q.is_diagnostic)
    let correct = 0
    diagQs.forEach(q => {
      if (q.question_type === 'multiple_choice' || q.question_type === 'true_false')
        { if (q.options?.find(o => o.id === diagAnswers[q.id])?.is_correct) correct++ }
      else if (q.question_type === 'fill_blank')
        { if ((q.correct_answer || '').toLowerCase().trim() === (diagAnswers[q.id] || '').toLowerCase().trim()) correct++ }
      else correct++
    })
    const score = diagQs.length > 0 ? Math.round((correct / diagQs.length) * 100) : 100
    await supabase.from('student_progress').update({ diagnostic_completed: true, diagnostic_score: score }).eq('id', progress.id)
    setProgress(p => p ? { ...p, diagnostic_completed: true, diagnostic_score: score } : p)
    setPhase('learning')
    toast.success(`Pre-check done! ${Math.round(score)}% ready`)
  }

  const checkSectionQuiz = async (sec: LessonSection) => {
    // Look for quiz_questions with this section_id (no is_micro_check flag — it's inline)
    const inlineQs = questions.filter(q => q.section_id === sec.id && !q.is_micro_check && !q.is_final_quiz && !q.is_diagnostic)
    if (inlineQs.length > 0) {
      setSectionQs(inlineQs)
      setPhase('quiz_section')
    } else {
      // Check for micro_check questions for this section
      const microQs = questions.filter(q => q.is_micro_check && q.section_id === sec.id)
      if (microQs.length > 0) {
        setSectionQs(microQs)
        setMicroAnswers({})
        setMicroSubmitted(false)
        setPhase('micro_check')
      } else {
        advanceSection()
      }
    }
  }

  const completeSection = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !progress) return
    const sec = sections[sectionIdx]
    const newCompleted = [...(progress.sections_completed || []), sec.id]
    await supabase.from('student_progress').update({ sections_completed: newCompleted }).eq('id', progress.id)
    setProgress(p => p ? { ...p, sections_completed: newCompleted } : p)
    await checkSectionQuiz(sec)
  }

  const advanceSection = () => {
    if (sectionIdx < sections.length - 1) {
      setSectionIdx(i => i + 1)
      setPhase('learning')
    } else {
      const finalQs = questions.filter(q => q.is_final_quiz)
      if (finalQs.length > 0) setPhase('final_quiz')
      else finishLesson(100)
    }
  }

  const finishLesson = async (score: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !progress) return
    await supabase.from('student_progress').update({ status: 'completed', final_quiz_score: score, score, completed_at: new Date().toISOString() }).eq('id', progress.id)
    const xp = Math.max(10, Math.round(score / 10))
    const { error } = await supabase.rpc('increment_xp', { user_id: user.id, xp })
    if (error) {
      const { data: prof } = await supabase.from('profiles').select('total_xp').eq('id', user.id).single()
      if (prof) await supabase.from('profiles').update({ total_xp: (prof.total_xp || 0) + xp }).eq('id', user.id)
    }
    setProgress(p => p ? { ...p, status: 'completed', final_quiz_score: score, score } : p)
    setPhase('complete')
    toast.success(`🎉 Lesson complete! Score: ${Math.round(score)}%`)
  }

  const submitFinalQuiz = async () => {
    const finalQs = questions.filter(q => q.is_final_quiz)
    let correct = 0
    finalQs.forEach(q => {
      if (q.question_type === 'multiple_choice' || q.question_type === 'true_false')
        { if (q.options?.find(o => o.id === finalAnswers[q.id])?.is_correct) correct++ }
      else if (q.question_type === 'fill_blank')
        { if ((q.correct_answer || '').toLowerCase().trim() === (finalAnswers[q.id] || '').toLowerCase().trim()) correct++ }
      else correct++ // short/long always counted
    })
    const score = finalQs.length > 0 ? Math.round((correct / finalQs.length) * 100) : 100
    setFinalSubmitted(true)
    await finishLesson(score)
  }

  const sendSocratic = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput, timestamp: new Date().toISOString() }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai/socratic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: chatInput,
          lessonTitle: lesson?.title,
          lessonObjectives: lesson?.objectives,
          currentSection: sections[sectionIdx]?.title,
          currentPhase: phase,
          sections: sections.map(s => ({ title: s.title, content: s.content, content_type: s.content_type })),
          glossary: glossary.map(g => ({ term: g.term, definition: g.definition, example: g.example })),
          conversationHistory: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const aiMsg: ChatMessage = { role: 'assistant', content: data.hint || "Great question! Let me guide you through it...", timestamp: new Date().toISOString() }
      setChatMessages([...newMessages, aiMsg])
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('socratic_interactions').insert({
          student_id: user.id, lesson_id: lessonId,
          student_question: chatInput, hint_response: aiMsg.content,
          conversation_history: [...newMessages, aiMsg],
        })
      }
    } catch { toast.error('Could not get hint right now') }
    setChatLoading(false)
  }

  const currentSection = sections[sectionIdx]

  // Progress calculation
  const totalSteps = (questions.filter(q=>q.is_diagnostic).length > 0 ? 1 : 0) + sections.length + (questions.filter(q=>q.is_final_quiz).length > 0 ? 1 : 0)
  const doneSteps = (progress?.diagnostic_completed ? 1 : 0) + (progress?.sections_completed?.length || 0) + (progress?.status === 'completed' ? 1 : 0)
  const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0

  if (phase === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-atlas-blue/30 border-t-atlas-blue rounded-full animate-spin mx-auto mb-4" />
        <p className="text-atlas-subtle">Loading your lesson...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 bg-atlas-surface border-b border-atlas-border">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-5xl mx-auto">
          <button onClick={() => router.push('/student/dashboard')} className="btn-ghost text-sm py-1.5 flex-shrink-0">← Back</button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-atlas-subtle truncate">{lesson?.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1.5 bg-atlas-border rounded-full">
                <div className="h-full bg-atlas-blue rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-xs text-atlas-blue font-medium flex-shrink-0">{progressPct}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {glossary.length > 0 && (
              <button onClick={() => { setShowGlossary(v=>!v); setShowChat(false) }}
                className={`btn-ghost text-xs py-1.5 px-3 ${showGlossary ? 'text-atlas-blue' : ''}`}>📖</button>
            )}
            <button onClick={() => { setShowChat(v=>!v); setShowGlossary(false) }}
              className={`btn-primary text-xs py-1.5 px-3 relative ${showChat ? 'ring-2 ring-white/20' : ''}`}>
              🦉 Ask
              {chatMessages.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-atlas-amber rounded-full text-xs flex items-center justify-center text-black font-bold">{chatMessages.filter(m=>m.role==='assistant').length}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section breadcrumb nav (during learning) ── */}
      {(phase === 'learning' || phase === 'quiz_section' || phase === 'micro_check') && sections.length > 0 && (
        <div className="bg-atlas-surface border-b border-atlas-border px-4 py-2">
          <div className="max-w-5xl mx-auto flex gap-1.5 overflow-x-auto items-center">
            {sections.map((s, i) => {
              const done = (progress?.sections_completed || []).includes(s.id)
              const current = i === sectionIdx
              const canNavigate = done || i < sectionIdx || current
              return (
                <button
                  key={s.id}
                  disabled={!canNavigate}
                  onClick={() => {
                    if (!canNavigate) return
                    setSectionIdx(i)
                    setPhase('learning')
                  }}
                  title={canNavigate ? `Go to: ${s.title}` : 'Complete previous sections first'}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    current ? 'bg-atlas-blue text-white shadow-sm' :
                    done    ? 'bg-atlas-emerald/20 text-atlas-emerald border border-atlas-emerald/30 hover:bg-atlas-emerald/30 cursor-pointer' :
                    canNavigate ? 'bg-atlas-card text-atlas-subtle border border-atlas-border hover:border-atlas-blue hover:text-atlas-blue cursor-pointer' :
                    'bg-atlas-card text-atlas-subtle/40 border border-atlas-border/40 cursor-not-allowed'
                  }`}>
                  {done && !current ? '✓ ' : null}
                  {s.title.length > 18 ? s.title.slice(0, 16) + '…' : s.title}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8 flex gap-6">
        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 min-w-0 animate-fade-in">

          {/* DIAGNOSTIC */}
          {phase === 'diagnostic' && (() => {
            const diagQs = questions.filter(q => q.is_diagnostic)
            return (
              <div>
                <div className="atlas-card mb-6 border-atlas-blue/30 bg-atlas-blue/5">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">🔍</span>
                    <div>
                      <h2 className="font-display font-bold text-xl text-atlas-text">Pre-Check Survey</h2>
                      <p className="text-atlas-subtle text-sm">Helps us personalize your learning. No grade!</p>
                    </div>
                  </div>
                </div>
                {diagQs.length === 0 ? (
                  <div className="atlas-card text-center py-10">
                    <span className="text-4xl block mb-3">🚀</span>
                    <p className="text-atlas-text font-medium mb-4">Ready to start! No pre-check for this lesson.</p>
                    <button onClick={completeDiagnostic} className="btn-primary">Begin Lesson →</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {diagQs.map((q, i) => (
                      <QuestionItem key={q.id} q={q} answers={diagAnswers} setAnswers={setDiagAnswers} submitted={diagSubmitted} index={i} />
                    ))}
                    {!diagSubmitted ? (
                      <button onClick={() => setDiagSubmitted(true)} disabled={!diagQs.every(q => diagAnswers[q.id])}
                        className="btn-primary w-full justify-center py-4 disabled:opacity-40">
                        Submit Pre-Check →
                      </button>
                    ) : (
                      <div className="atlas-card text-center py-6">
                        <p className="text-atlas-emerald font-semibold mb-3">✅ Pre-check submitted!</p>
                        <button onClick={completeDiagnostic} className="btn-primary">Start Lesson →</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* LEARNING */}
          {phase === 'learning' && currentSection && (
            <div>
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-atlas-border">
                <span className="w-8 h-8 rounded-xl bg-atlas-blue flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{sectionIdx + 1}</span>
                <div>
                  <p className="text-xs text-atlas-subtle uppercase tracking-wide font-medium">Section {sectionIdx + 1} of {sections.length}</p>
                  <h2 className="font-display font-bold text-2xl text-atlas-text">{currentSection.title}</h2>
                </div>
                {currentSection.duration_minutes && (
                  <span className="ml-auto text-xs text-atlas-subtle bg-atlas-card border border-atlas-border px-2 py-1 rounded-lg flex-shrink-0">⏱ ~{currentSection.duration_minutes} min</span>
                )}
              </div>

              {/* Content by type */}
              <div className="mb-8">
                {currentSection.content_type === 'text' && <TextContent content={currentSection.content || ''} />}
                {currentSection.content_type === 'image' && <ImageContent content={currentSection.content || ''} title={currentSection.title} />}
                {currentSection.content_type === 'video' && <VideoContent content={currentSection.content || ''} />}
                {currentSection.content_type === 'activity' && <ActivityContent content={currentSection.content || ''} />}
                {currentSection.content_type === 'discussion' && <DiscussionContent content={currentSection.content || ''} />}
                {currentSection.content_type === 'quiz' && (() => {
                  const qsForSection = questions.filter(q => q.section_id === currentSection.id && !q.is_micro_check && !q.is_final_quiz && !q.is_diagnostic)
                  return qsForSection.length > 0
                    ? <QuizSection questions={qsForSection} title={currentSection.content || 'Section Quiz'} onComplete={(score) => { advanceSection() }} />
                    : <p className="text-atlas-subtle text-sm text-center py-8">No quiz questions for this section yet.</p>
                })()}
              </div>

              {currentSection.content_type !== 'quiz' && (
                <div className="flex gap-3">
                  {sectionIdx > 0 && (
                    <button
                      onClick={() => { setSectionIdx(i => i - 1); setPhase('learning') }}
                      className="btn-secondary py-4 px-6 flex-shrink-0">
                      ← Previous
                    </button>
                  )}
                  <button onClick={completeSection} className="btn-primary flex-1 justify-center py-4 text-base">
                    {sectionIdx < sections.length - 1 ? `Next Section →` : questions.filter(q=>q.is_final_quiz).length > 0 ? 'Take Final Quiz →' : 'Complete Lesson →'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* INLINE QUIZ (section quiz phase) */}
          {phase === 'quiz_section' && (
            <div>
              <div className="atlas-card mb-6 border-atlas-amber/30 bg-atlas-amber/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><span className="text-3xl">❓</span>
                    <div><h2 className="font-display font-bold text-xl text-atlas-text">Section Quiz</h2>
                      <p className="text-atlas-subtle text-sm">Answer these questions about what you just learned</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setPhase('learning') }}
                    className="btn-ghost text-sm py-1.5 px-3 flex-shrink-0">
                    ← Back to Review
                  </button>
                </div>
              </div>
              <QuizSection questions={sectionQs} title="Section Quiz" onComplete={(score) => advanceSection()} />
            </div>
          )}

          {/* MICRO CHECK */}
          {phase === 'micro_check' && (
            <div>
              <div className="atlas-card mb-6 border-atlas-cyan/30 bg-atlas-cyan/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><span className="text-3xl">⚡</span>
                    <div><h2 className="font-display font-bold text-xl text-atlas-text">Quick Check</h2>
                      <p className="text-atlas-subtle text-sm">Short check before moving on</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setPhase('learning') }}
                    className="btn-ghost text-sm py-1.5 px-3 flex-shrink-0">
                    ← Back to Review
                  </button>
                </div>
              </div>
              <QuizSection questions={sectionQs} title="Micro-Check" onComplete={(score) => { setPhase('learning'); advanceSection() }} />
            </div>
          )}

          {/* FINAL QUIZ */}
          {phase === 'final_quiz' && (() => {
            const finalQs = questions.filter(q => q.is_final_quiz)
            return (
              <div>
                <div className="atlas-card mb-6 border-atlas-amber/30 bg-atlas-amber/5">
                  <div className="flex items-center gap-3 mb-1"><span className="text-3xl">🏆</span>
                    <div><h2 className="font-display font-bold text-xl text-atlas-text">End-of-Lesson Quiz</h2>
                      <p className="text-atlas-subtle text-sm">Show what you've learned! {finalQs.length} questions</p>
                    </div>
                  </div>
                </div>
                {finalQs.length === 0 ? (
                  <div className="atlas-card text-center py-10">
                    <button onClick={() => finishLesson(100)} className="btn-primary">Complete Lesson ✓</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {finalQs.map((q, i) => (
                      <QuestionItem key={q.id} q={q} answers={finalAnswers} setAnswers={setFinalAnswers} submitted={finalSubmitted} index={i} />
                    ))}
                    {!finalSubmitted ? (
                      <button onClick={submitFinalQuiz} disabled={!finalQs.every(q => finalAnswers[q.id])}
                        className="btn-primary w-full justify-center py-4 disabled:opacity-40">
                        Submit Final Quiz →
                      </button>
                    ) : (
                      <div className="atlas-card text-center py-6">
                        <p className="text-atlas-emerald font-semibold text-lg">Quiz submitted! 🎉</p>
                        <p className="text-atlas-subtle text-sm mt-1">Loading results...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* COMPLETE */}
          {phase === 'complete' && (
            <div className="text-center py-12 animate-slide-up">
              <div className="w-24 h-24 bg-atlas-emerald/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow-emerald">
                <span className="text-5xl">🎉</span>
              </div>
              <h2 className="font-display font-bold text-4xl text-atlas-text mb-3">Lesson Complete!</h2>
              <p className="text-atlas-subtle text-lg mb-4">Amazing work finishing this lesson.</p>
              {progress?.final_quiz_score !== null && progress?.final_quiz_score !== undefined && (
                <p className="font-display font-bold text-6xl mb-6">
                  <span className={progress.final_quiz_score >= 80 ? 'text-atlas-emerald' : progress.final_quiz_score >= 60 ? 'text-atlas-amber' : 'text-atlas-red'}>
                    {Math.round(progress.final_quiz_score)}%
                  </span>
                </p>
              )}
              <div className="flex gap-3 justify-center mt-4">
                <button onClick={() => router.push('/student/dashboard')} className="btn-secondary">← Dashboard</button>
                <button onClick={() => { setPhase('learning'); setSectionIdx(0) }} className="btn-ghost">Review Lesson</button>
              </div>
            </div>
          )}
        </div>

        {/* ── SIDEBARS ── */}
        {showGlossary && !showChat && (
          <div className="w-72 flex-shrink-0 sticky top-28 self-start animate-fade-in">
            <div className="atlas-card max-h-[calc(100vh-10rem)] flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-atlas-border">
                <div><h3 className="font-semibold text-atlas-text">📖 Glossary</h3>
                  <p className="text-xs text-atlas-subtle">{glossary.length} terms</p>
                </div>
                <button onClick={() => setShowGlossary(false)} className="text-atlas-subtle hover:text-atlas-text text-xl">×</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3">
                {glossary.length === 0 ? (
                  <p className="text-atlas-subtle text-sm text-center py-6">No glossary for this lesson</p>
                ) : glossary.map(t => (
                  <div key={t.id} className="p-3 bg-atlas-surface rounded-xl border border-atlas-border">
                    <p className="font-semibold text-atlas-text text-sm">{t.term}</p>
                    <p className="text-xs text-atlas-subtle mt-1">{t.definition}</p>
                    {t.example && <p className="text-xs text-atlas-cyan mt-1 italic">e.g. {t.example}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showChat && (
          <div className="w-80 flex-shrink-0 sticky top-28 self-start animate-fade-in">
            <div className="atlas-card max-h-[calc(100vh-10rem)] flex flex-col">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-atlas-border">
                <div><h3 className="font-semibold text-atlas-text">🦉 Ask Socratic</h3>
                  <p className="text-xs text-atlas-subtle">
                    {['quiz_section', 'micro_check', 'final_quiz', 'diagnostic'].includes(phase)
                      ? '🔒 Quiz mode — hints only, no direct answers'
                      : 'Ask anything about the lesson'}
                  </p>
                </div>
                <button onClick={() => setShowChat(false)} className="text-atlas-subtle hover:text-atlas-text text-xl">×</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-[200px]">
                {chatMessages.length === 0 && (
                  <div className="text-center py-6">
                    <span className="text-4xl block mb-2">🦉</span>
                    <p className="text-atlas-subtle text-sm">I help you think, not just give answers.</p>
                    <p className="text-xs text-atlas-subtle mt-1">Ask me anything about this lesson!</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                    {msg.role === 'assistant' && <p className="text-xs text-atlas-blue font-medium mb-1">🦉 Socratic</p>}
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                ))}
                {chatLoading && <div className="chat-bubble-ai"><div className="flex gap-1"><span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/></div></div>}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2 pt-2 border-t border-atlas-border">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendSocratic()}
                  placeholder="What are you stuck on?" className="atlas-input flex-1 py-2 text-sm" />
                <button onClick={sendSocratic} disabled={chatLoading || !chatInput.trim()} className="btn-primary px-3 py-2">↑</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
