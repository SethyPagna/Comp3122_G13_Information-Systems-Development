import { NextRequest, NextResponse } from 'next/server'
import { openRouterChat } from '@/lib/openrouter'

export async function POST(request: NextRequest) {
  try {
    const {
      question,
      lessonTitle,
      lessonObjectives,
      currentSection,
      currentPhase = 'learning',
      sections = [],
      glossary = [],
      conversationHistory = [],
    } = await request.json()

    if (!question?.trim()) {
      return NextResponse.json({ hint: 'What would you like help thinking through?' })
    }

    const objectivesList = Array.isArray(lessonObjectives)
      ? lessonObjectives.map((o: string) => `- ${o}`).join('\n')
      : `- ${lessonObjectives ?? 'Not specified'}`

    const sectionsContext = sections.length > 0
      ? sections.map((s: { title: string; content: string; content_type: string }, i: number) =>
          `[Section ${i + 1}: "${s.title}" | Type: ${s.content_type}]\n${
            s.content ? s.content.replace(/<[^>]+>/g, ' ').slice(0, 600) : '(no text content)'
          }`
        ).join('\n\n---\n\n')
      : '(No section content available)'

    const glossaryContext = glossary.length > 0
      ? glossary.map((g: { term: string; definition: string; example?: string }) =>
          `• ${g.term}: ${g.definition}${g.example ? ` (e.g. ${g.example})` : ''}`
        ).join('\n')
      : '(No glossary terms)'

    const isQuizPhase = ['quiz_section', 'micro_check', 'final_quiz', 'diagnostic'].includes(currentPhase)

    const phaseLabel: Record<string, string> = {
      learning:     'content learning',
      quiz_section: 'section quiz',
      micro_check:  'quick check quiz',
      final_quiz:   'final quiz',
      diagnostic:   'diagnostic pre-check',
    }

    let systemPrompt: string

    if (isQuizPhase) {
      systemPrompt = `You are Socratic, an AI tutor in the Atlas learning platform. The student is currently in a ${phaseLabel[currentPhase] ?? 'quiz'}.

CRITICAL RULE: The student is in an assessment. You MUST NOT reveal correct answers, name correct options, or give away the answer in any way.

FULL LESSON KNOWLEDGE BASE (use this to guide — never quote verbatim as a direct answer):
Lesson: "${lessonTitle ?? 'Unknown'}"
Learning Objectives:
${objectivesList}

Lesson Sections:
${sectionsContext}

Key Vocabulary:
${glossaryContext}

Currently viewing: "${currentSection ?? 'Unknown'}"

YOUR APPROACH FOR QUIZ MODE — pick the best technique:
1. Point to location: "The answer to this is covered in the section about [X]. Re-read that part."
2. Concept nudge: "Think about what [key term] means — how does that apply here?"
3. Eliminate approach: "Consider which options you can rule out. What do you know for sure?"
4. Glossary link: "Check the glossary definition of [term] — it gives a good clue."
5. Analogy hint: "This is similar to [concept from the lesson]. What did that teach you?"
6. Encouragement: "You're close! Think about [related concept from section X]."

ABSOLUTE RULES:
- NEVER state the correct answer
- NEVER say "Option A/B/C/D is correct"
- NEVER say "The answer is..."
- Keep response to 2-4 sentences + one guiding question
- Be warm, patient, and encouraging
- Refer to specific sections or glossary terms by name`

    } else {
      systemPrompt = `You are Socratic, a knowledgeable and friendly AI tutor in the Atlas learning platform. The student is in ${phaseLabel[currentPhase] ?? 'learning'} mode — you can answer directly and teach clearly.

FULL LESSON KNOWLEDGE BASE (your source of truth for this lesson):
Lesson: "${lessonTitle ?? 'Unknown'}"
Learning Objectives:
${objectivesList}

Lesson Sections:
${sectionsContext}

Key Vocabulary:
${glossaryContext}

Currently on: "${currentSection ?? 'Unknown'}"

YOUR APPROACH FOR LEARNING MODE:
1. Answer the student's question clearly and directly using lesson content
2. Explain concepts in simple, relatable terms with examples
3. Reference where in the lesson this is covered ("In the section on X, you'll see that...")
4. Use glossary terms naturally and explain them in context
5. If they seem confused, break it into smaller steps
6. Connect new ideas to earlier parts of the lesson

RULES:
- Keep responses concise: 3-6 sentences
- Be warm, encouraging, and patient
- Use lesson content as your primary source
- End with one thoughtful question to deepen understanding
- Vary your approach across the conversation`
    }

    type HistoryMsg = { role: string; content: string }
    const history = (conversationHistory as HistoryMsg[])
      .slice(-10)
      .map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }))

    const hint = await openRouterChat({
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: question },
      ],
      maxTokens: 300,
      temperature: 0.7,
    })

    return NextResponse.json({ hint })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[socratic]', msg)
    return NextResponse.json({
      hint: "Great question! Which part of the lesson feels most unclear right now — and what do you already understand about it?",
    })
  }
}
