'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Lesson, LessonSection, QuizQuestion, StudentProgress, ChatMessage, GlossaryTerm } from '@/types'
import toast from 'react-hot-toast'

type Phase = 'loading' | 'diagnostic' | 'learning' | 'micro_check' | 'final_quiz' | 'complete'

export default function StudentLesson() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string
  const supabase = createClient()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [sections, setSections] = useState<LessonSection[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([])
  const [progress, setProgress] = useState<StudentProgress | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  
  // Socratic chat
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Glossary panel
  const [showGlossary, setShowGlossary] = useState(false)

  // "Why this matters" interest
  const [whyMatters, setWhyMatters] = useState<string>('')

  useEffect(() => { loadLesson() }, [lessonId])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const loadLesson = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [lessonRes, sectionsRes, questionsRes, glossaryRes, progressRes] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', lessonId).single(),
      supabase.from('lesson_sections').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('quiz_questions').select('*').eq('lesson_id', lessonId).order('order_index'),
      supabase.from('glossary_terms').select('*').eq('lesson_id', lessonId),
      supabase.from('student_progress').select('*').eq('student_id', user.id).eq('lesson_id', lessonId).single()
    ])

    setLesson(lessonRes.data)
    setSections(sectionsRes.data || [])
    setQuestions(questionsRes.data || [])
    setGlossary(glossaryRes.data || [])
    
    if (progressRes.data) {
      setProgress(progressRes.data)
      if (progressRes.data.status === 'completed') {
        setPhase('complete')
      } else {
        const diagDone = progressRes.data.diagnostic_completed
        setPhase(diagDone ? 'learning' : 'diagnostic')
      }
    } else {
      // Create progress record
      const { data: newProgress } = await supabase.from('student_progress').insert({
        student_id: user.id,
        lesson_id: lessonId,
        status: 'in_progress',
        sections_completed: [],
        started_at: new Date().toISOString(),
      }).select().single()
      setProgress(newProgress)
      setPhase('diagnostic')
    }

    // Generate "Why This Matters" based on interests
    const { data: prof } = await supabase.from('profiles').select('interests').eq('id', user.id).single()
    if (prof?.interests?.length) {
      setWhyMatters(`This lesson connects to ${prof.interests[0]} in fascinating ways!`)
    }
  }

  const completeDiagnostic = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !progress) return

    const diagQuestions = questions.filter(q => q.is_diagnostic)
    const correct = diagQuestions.filter(q => answers[q.id] === q.correct_answer || 
      q.options?.find(o => o.id === answers[q.id])?.is_correct).length
    const score = diagQuestions.length > 0 ? (correct / diagQuestions.length) * 100 : 100

    await supabase.from('student_progress').update({
      diagnostic_completed: true,
      diagnostic_score: score,
    }).eq('id', progress.id)

    setProgress({ ...progress, diagnostic_completed: true, diagnostic_score: score })
    setAnswers({})
    setSubmitted(false)
    setPhase('learning')
    toast.success(`Diagnostic complete! ${Math.round(score)}% ready`)
  }

  const completeSection = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !progress) return

    const currentSection = sections[currentSectionIdx]
    const newCompleted = [...(progress.sections_completed || []), currentSection.id]
    await supabase.from('student_progress').update({ sections_completed: newCompleted }).eq('id', progress.id)
    setProgress({ ...progress, sections_completed: newCompleted })

    // Check for micro-check questions at this section
    const microChecks = questions.filter(q => q.is_micro_check && q.section_id === currentSection.id)
    if (microChecks.length > 0) {
      setPhase('micro_check')
    } else if (currentSectionIdx < sections.length - 1) {
      setCurrentSectionIdx(currentSectionIdx + 1)
    } else {
      setPhase('final_quiz')
    }
    setAnswers({})
    setSubmitted(false)
  }

  const completeMicroCheck = () => {
    setPhase('learning')
    if (currentSectionIdx < sections.length - 1) {
      setCurrentSectionIdx(currentSectionIdx + 1)
    } else {
      setPhase('final_quiz')
    }
    setAnswers({})
    setSubmitted(false)
  }

  const submitFinalQuiz = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !progress) return

    const finalQuestions = questions.filter(q => q.is_final_quiz)
    const correct = finalQuestions.filter(q => 
      q.options?.find(o => o.id === answers[q.id])?.is_correct || answers[q.id] === q.correct_answer
    ).length
    const score = finalQuestions.length > 0 ? (correct / finalQuestions.length) * 100 : 100

    await supabase.from('student_progress').update({
      status: 'completed',
      final_quiz_score: score,
      score: score,
      completed_at: new Date().toISOString(),
    }).eq('id', progress.id)

    // Award XP via increment_xp SQL function
    const xpEarned = Math.max(10, Math.round(score / 10))
    try {
      const { error: rpcError } = await supabase.rpc('increment_xp', { user_id: user.id, xp: xpEarned })
      if (rpcError) throw rpcError
    } catch {
      // Fallback: direct update if RPC not yet set up
      const { data: prof } = await supabase.from('profiles').select('total_xp').eq('id', user.id).single()
      if (prof) await supabase.from('profiles').update({ total_xp: (prof.total_xp || 0) + xpEarned }).eq('id', user.id)
    }

    setPhase('complete')
    toast.success(`🎉 Lesson complete! Score: ${Math.round(score)}%`)
  }

  const sendSocraticMessage = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput, timestamp: new Date().toISOString() }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)

    try {
      const response = await fetch('/api/ai/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: chatInput,
          lessonTitle: lesson?.title,
          lessonObjectives: lesson?.objectives,
          currentSection: sections[currentSectionIdx]?.title,
          conversationHistory: newMessages.map(m => ({ role: m.role, content: m.content })),
        })
      })
      const data = await response.json()
      const aiMsg: ChatMessage = { role: 'assistant', content: data.hint || 'I\'m here to help you think through this!', timestamp: new Date().toISOString() }
      setChatMessages([...newMessages, aiMsg])

      // Save interaction
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('socratic_interactions').insert({
          student_id: user.id,
          lesson_id: lessonId,
          student_question: chatInput,
          hint_response: aiMsg.content,
          conversation_history: [...newMessages, aiMsg],
        })
      }
    } catch {
      toast.error('Could not get hint right now')
    }
    setChatLoading(false)
  }

  const currentSection = sections[currentSectionIdx]
  const diagnosticQuestions = questions.filter(q => q.is_diagnostic)
  const microCheckQuestions = currentSection ? questions.filter(q => q.is_micro_check && q.section_id === currentSection.id) : []
  const finalQuizQuestions = questions.filter(q => q.is_final_quiz)

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-atlas-blue/30 border-t-atlas-blue rounded-full animate-spin mx-auto mb-4" />
          <p className="text-atlas-subtle">Loading your lesson...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Progress bar */}
      <div className="sticky top-0 z-30 bg-atlas-surface border-b border-atlas-border">
        <div className="flex items-center justify-between px-6 py-3 max-w-4xl mx-auto">
          <button onClick={() => router.push('/student/dashboard')} className="btn-ghost text-sm py-1">← Back</button>
          <div className="flex-1 max-w-xs mx-4">
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${
                phase === 'diagnostic' ? 5 :
                phase === 'learning' ? Math.round(((currentSectionIdx + 1) / Math.max(sections.length, 1)) * 80) :
                phase === 'final_quiz' ? 90 :
                phase === 'complete' ? 100 : 0
              }%` }} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowGlossary(!showGlossary)}
              className="btn-ghost text-xs py-1 px-2">📖 Glossary</button>
            <button onClick={() => setShowChat(!showChat)}
              className="btn-primary text-xs py-1.5 px-3 relative">
              💬 Ask Socratic
              {chatMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-atlas-amber rounded-full text-xs flex items-center justify-center text-black font-bold">
                  {chatMessages.filter(m=>m.role==='assistant').length}
                </span>
              )}
            </button>
          </div>
        </div>
        {lesson && (
          <div className="px-6 pb-2 max-w-4xl mx-auto">
            <p className="text-xs text-atlas-subtle">{lesson.title} · {lesson.subject}</p>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 flex gap-6">
        {/* Main content */}
        <div className="flex-1 animate-fade-in">
          {/* DIAGNOSTIC */}
          {phase === 'diagnostic' && (
            <div>
              <div className="atlas-card mb-6 border-atlas-blue/30 bg-atlas-blue/5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🔍</span>
                  <h2 className="font-display font-bold text-2xl text-atlas-text">Quick Pre-Check</h2>
                </div>
                <p className="text-atlas-subtle">Help us personalize your learning path. Answer a few quick questions!</p>
              </div>
              {whyMatters && (
                <div className="atlas-card mb-6 border-atlas-amber/30 bg-atlas-amber/5">
                  <p className="text-sm text-atlas-amber font-medium">🌟 Why This Matters For You</p>
                  <p className="text-atlas-text mt-1">{whyMatters}</p>
                </div>
              )}
              {diagnosticQuestions.length === 0 ? (
                <div className="atlas-card text-center py-8">
                  <p className="text-atlas-subtle mb-4">No pre-check questions. Jump right in!</p>
                  <button onClick={completeDiagnostic} className="btn-primary mx-auto">Start Lesson →</button>
                </div>
              ) : (
                <QuizSection questions={diagnosticQuestions} answers={answers} setAnswers={setAnswers}
                  submitted={submitted} title="Diagnostic Survey"
                  onSubmit={() => { setSubmitted(true); setTimeout(completeDiagnostic, 800) }} />
              )}
            </div>
          )}

          {/* LEARNING */}
          {phase === 'learning' && currentSection && (
            <div>
              {/* Section navigator */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {sections.map((s, i) => (
                  <div key={s.id} className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-default transition-all ${
                    i < currentSectionIdx ? 'bg-atlas-emerald/20 text-atlas-emerald border border-atlas-emerald/30' :
                    i === currentSectionIdx ? 'bg-atlas-blue text-white shadow-glow-blue' :
                    'bg-atlas-card text-atlas-subtle border border-atlas-border'
                  }`}>{i + 1}</div>
                ))}
              </div>

              <div className="atlas-card mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-atlas-blue">SECTION {currentSectionIdx + 1}/{sections.length}</span>
                </div>
                <h2 className="font-display font-bold text-2xl text-atlas-text mb-4">{currentSection.title}</h2>
                <div className="prose prose-invert max-w-none">
                  <div className="text-atlas-text leading-relaxed whitespace-pre-wrap text-sm">
                    {currentSection.content}
                  </div>
                </div>
                {currentSection.duration_minutes && (
                  <p className="text-xs text-atlas-subtle mt-4">⏱ Estimated: {currentSection.duration_minutes} minutes</p>
                )}
              </div>

              <button onClick={completeSection} className="btn-primary w-full justify-center py-4 text-base">
                {currentSectionIdx < sections.length - 1 ? `Next Section →` : `Proceed to Final Quiz →`}
              </button>
            </div>
          )}

          {/* MICRO CHECK */}
          {phase === 'micro_check' && (
            <div>
              <div className="atlas-card mb-6 border-atlas-cyan/30 bg-atlas-cyan/5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">⚡</span>
                  <h2 className="font-display font-bold text-2xl text-atlas-text">Quick Check</h2>
                </div>
                <p className="text-atlas-subtle">Test your understanding before moving on</p>
              </div>
              <QuizSection questions={microCheckQuestions} answers={answers} setAnswers={setAnswers}
                submitted={submitted} title="Micro-Check"
                onSubmit={() => { setSubmitted(true); setTimeout(completeMicroCheck, 1000) }} />
            </div>
          )}

          {/* FINAL QUIZ */}
          {phase === 'final_quiz' && (
            <div>
              <div className="atlas-card mb-6 border-atlas-amber/30 bg-atlas-amber/5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🏆</span>
                  <h2 className="font-display font-bold text-2xl text-atlas-text">End-of-Lesson Quiz</h2>
                </div>
                <p className="text-atlas-subtle">Show what you've learned! You can use your notes.</p>
              </div>
              {finalQuizQuestions.length === 0 ? (
                <div className="atlas-card text-center py-8">
                  <p className="text-atlas-subtle mb-4">No final quiz. Time to complete!</p>
                  <button onClick={submitFinalQuiz} className="btn-primary mx-auto">Complete Lesson ✓</button>
                </div>
              ) : (
                <QuizSection questions={finalQuizQuestions} answers={answers} setAnswers={setAnswers}
                  submitted={submitted} title="Final Quiz"
                  onSubmit={() => { setSubmitted(true); setTimeout(submitFinalQuiz, 800) }} />
              )}
            </div>
          )}

          {/* COMPLETE */}
          {phase === 'complete' && (
            <div className="text-center py-12 animate-slide-up">
              <div className="w-24 h-24 bg-atlas-emerald/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow-emerald">
                <span className="text-5xl">🎉</span>
              </div>
              <h2 className="font-display font-bold text-4xl text-atlas-text mb-3">Lesson Complete!</h2>
              <p className="text-atlas-subtle text-lg mb-2">Amazing work finishing this lesson.</p>
              {progress?.final_quiz_score !== null && progress?.final_quiz_score !== undefined && (
                <p className="text-6xl font-display font-bold my-6">
                  <span className={progress.final_quiz_score >= 80 ? 'text-atlas-emerald' : progress.final_quiz_score >= 60 ? 'text-atlas-amber' : 'text-atlas-red'}>
                    {Math.round(progress.final_quiz_score)}%
                  </span>
                </p>
              )}
              <div className="flex gap-3 justify-center mt-6">
                <button onClick={() => router.push('/student/dashboard')} className="btn-secondary">
                  ← Back to Lessons
                </button>
                <button onClick={() => { setPhase('learning'); setCurrentSectionIdx(0) }} className="btn-ghost">
                  Review Lesson
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Socratic Chat Sidebar */}
        {showChat && (
          <div className="w-80 flex-shrink-0 sticky top-24 h-[calc(100vh-8rem)] animate-slide-in">
            <div className="atlas-card h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-atlas-border">
                <div>
                  <h3 className="font-display font-semibold text-atlas-text">Ask Socratic 🦉</h3>
                  <p className="text-xs text-atlas-subtle">Guiding questions, not answers</p>
                </div>
                <button onClick={() => setShowChat(false)} className="text-atlas-subtle hover:text-atlas-text text-xl leading-none">×</button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-6">
                    <span className="text-4xl block mb-3">🦉</span>
                    <p className="text-atlas-subtle text-sm">I'm here to help you think, not to give you answers.</p>
                    <p className="text-atlas-subtle text-xs mt-2">Ask me anything about this lesson!</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                    {msg.role === 'assistant' && (
                      <p className="text-xs text-atlas-blue font-medium mb-1">🦉 Socratic</p>
                    )}
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-bubble-ai">
                    <div className="flex gap-1 items-center">
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendSocraticMessage()}
                  placeholder="What are you stuck on?"
                  className="atlas-input flex-1 py-2 text-sm"
                />
                <button onClick={sendSocraticMessage} disabled={chatLoading || !chatInput.trim()}
                  className="btn-primary px-3 py-2">
                  ↑
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Glossary Sidebar */}
        {showGlossary && !showChat && (
          <div className="w-72 flex-shrink-0 sticky top-24 h-[calc(100vh-8rem)] animate-slide-in">
            <div className="atlas-card h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-atlas-border">
                <h3 className="font-display font-semibold text-atlas-text">📖 Glossary</h3>
                <button onClick={() => setShowGlossary(false)} className="text-atlas-subtle hover:text-atlas-text text-xl">×</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3">
                {glossary.length === 0 ? (
                  <p className="text-atlas-subtle text-sm text-center py-8">No glossary terms for this lesson</p>
                ) : glossary.map((term, i) => (
                  <div key={i} className="p-3 bg-atlas-surface rounded-xl border border-atlas-border">
                    <p className="font-semibold text-atlas-text text-sm">{term.term}</p>
                    <p className="text-xs text-atlas-subtle mt-1">{term.definition}</p>
                    {term.example && <p className="text-xs text-atlas-cyan mt-1 italic">e.g. {term.example}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QuizSection({ questions, answers, setAnswers, submitted, title, onSubmit }: {
  questions: QuizQuestion[]
  answers: Record<string, string>
  setAnswers: (a: Record<string, string>) => void
  submitted: boolean
  title: string
  onSubmit: () => void
}) {
  const allAnswered = questions.every(q => answers[q.id])

  return (
    <div className="space-y-6">
      <h3 className="font-display font-semibold text-lg text-atlas-text">{title}</h3>
      {questions.map((q, i) => (
        <div key={q.id} className={`atlas-card transition-all ${
          submitted ? (
            q.options?.find(o => o.id === answers[q.id])?.is_correct ? 'border-atlas-emerald/40' :
            answers[q.id] ? 'border-atlas-red/40' : ''
          ) : ''
        }`}>
          <p className="font-medium text-atlas-text mb-4">
            <span className="text-atlas-blue mr-2">{i + 1}.</span>{q.question_text}
          </p>
          {q.options && (
            <div className="space-y-2">
              {q.options.map(opt => {
                const selected = answers[q.id] === opt.id
                const showResult = submitted && selected
                return (
                  <button key={opt.id}
                    onClick={() => !submitted && setAnswers({ ...answers, [q.id]: opt.id })}
                    disabled={submitted}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                      showResult && opt.is_correct ? 'bg-atlas-emerald/10 border-atlas-emerald text-atlas-emerald' :
                      showResult && !opt.is_correct ? 'bg-atlas-red/10 border-atlas-red text-atlas-red' :
                      submitted && opt.is_correct ? 'bg-atlas-emerald/5 border-atlas-emerald/30 text-atlas-emerald' :
                      selected ? 'bg-atlas-blue/10 border-atlas-blue text-atlas-text' :
                      'bg-atlas-surface border-atlas-border text-atlas-subtle hover:border-atlas-muted hover:text-atlas-text'
                    }`}>
                    <span className="mr-2">{showResult && opt.is_correct ? '✓' : showResult && !opt.is_correct ? '✗' : ''}</span>
                    {opt.text}
                  </button>
                )
              })}
            </div>
          )}
          {submitted && q.explanation && (
            <div className="mt-3 p-3 bg-atlas-blue/5 border border-atlas-blue/20 rounded-xl">
              <p className="text-xs text-atlas-blue font-medium mb-1">💡 Explanation</p>
              <p className="text-xs text-atlas-subtle">{q.explanation}</p>
            </div>
          )}
        </div>
      ))}
      {!submitted && (
        <button onClick={onSubmit} disabled={!allAnswered}
          className="btn-primary w-full justify-center py-4 disabled:opacity-40">
          Submit Answers →
        </button>
      )}
    </div>
  )
}
