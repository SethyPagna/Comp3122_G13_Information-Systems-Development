import { NextRequest, NextResponse } from 'next/server'
import { openRouterChat, parseJsonResponse } from '@/lib/openrouter'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { lessonId } = await request.json()
    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch all data in parallel
    const [lessonRes, progressRes, interactionsRes] = await Promise.all([
      supabase.from('lessons').select('title, subject, objectives').eq('id', lessonId).maybeSingle(),
      supabase
        .from('student_progress')
        .select('student_id, status, score, diagnostic_score, time_spent, knowledge_gaps')
        .eq('lesson_id', lessonId),
      supabase
        .from('socratic_interactions')
        .select('student_question, hint_type')
        .eq('lesson_id', lessonId)
        .limit(20),
    ])

    const lesson = lessonRes.data
    const progress = progressRes.data ?? []
    const interactions = interactionsRes.data ?? []

    const total = progress.length
    const completed = progress.filter(p => p.status === 'completed').length
    const avgScore = total > 0
      ? Math.round(progress.reduce((s, p) => s + (p.score ?? 0), 0) / total)
      : 0
    const struggling = progress.filter(p => p.score !== null && (p.score ?? 0) < 60)
    const advanced = progress.filter(p => p.score !== null && (p.score ?? 0) >= 85)

    const prompt = `You are an expert teacher coach analyzing classroom data. Provide actionable recommendations.

LESSON: ${lesson?.title ?? 'Unknown'} (${lesson?.subject ?? ''})
OBJECTIVES: ${(lesson?.objectives ?? []).join('; ')}

STUDENT DATA:
- Total students: ${total}
- Completed: ${completed}/${total}
- Average score: ${avgScore}%
- Struggling (<60%): ${struggling.length} students
- Advanced (≥85%): ${advanced.length} students

SOCRATIC INTERACTIONS (most recent questions students asked):
${interactions.slice(0, 8).map(i => `- "${i.student_question}"`).join('\n') || '- None recorded yet'}

Based on this data, provide 3 specific, actionable intervention recommendations.

Respond ONLY with valid JSON, no other text:
{
  "interventions": [
    {
      "type": "struggling",
      "title": "Short action title",
      "description": "Specific 1-2 sentence action the teacher should take",
      "priority": "high"
    },
    {
      "type": "whole_class",
      "title": "Short action title",
      "description": "Specific 1-2 sentence whole-class strategy",
      "priority": "medium"
    },
    {
      "type": "advanced",
      "title": "Short action title",
      "description": "Extension activity or enrichment for advanced students",
      "priority": "low"
    }
  ],
  "readiness_summary": "One sentence describing overall class readiness based on the data.",
  "top_misconception": "The most likely misconception based on the Socratic questions asked."
}`

    const raw = await openRouterChat({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
      temperature: 0.4,
    })

    const analysis = parseJsonResponse(raw)
    return NextResponse.json(analysis)

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[analytics]', msg)
    return NextResponse.json(
      { error: `Failed to generate analytics: ${msg}` },
      { status: 500 }
    )
  }
}
