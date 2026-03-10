import { NextRequest, NextResponse } from 'next/server'
import { openRouterChat } from '@/lib/openrouter'

export async function POST(request: NextRequest) {
  try {
    const {
      question,
      lessonTitle,
      lessonObjectives,
      currentSection,
      conversationHistory = [],
    } = await request.json()

    if (!question?.trim()) {
      return NextResponse.json({ hint: 'What would you like help thinking through?' })
    }

    const objectivesList = Array.isArray(lessonObjectives)
      ? lessonObjectives.join(', ')
      : lessonObjectives ?? 'Not specified'

    const systemPrompt = `You are Socrates, an AI tutor in the Atlas adaptive learning platform.

Your ONLY rule: never directly answer questions or give away answers. Instead, guide students to discover answers themselves through strategic questioning and hints.

LESSON CONTEXT:
- Lesson: "${lessonTitle ?? 'Unknown'}"
- Current Section: "${currentSection ?? 'Unknown'}"
- Objectives: ${objectivesList}

YOUR TECHNIQUE — pick one per response:
1. Ask what they already know: "What do you already know about X?"
2. Break it down: "Let's start smaller — what does the word X mean to you?"
3. Use analogy: "Think of it like [everyday thing] — how does that compare?"
4. Guide by contradiction: "What would happen if that WASN'T true?"
5. Connect prior knowledge: "Remember when you learned about X? How might that relate?"
6. Visualize: "Can you picture a real-world situation where this would matter?"

HARD RULES:
- Keep your response to 3-5 sentences maximum
- End with exactly one question (never two)
- Never say "The answer is..." or "You should know that..."
- Never write out formulas, solutions, or definitions unprompted
- Be warm, encouraging, and patient
- Vary your approach — don't use the same opening twice in a conversation`

    // Build message history (last 8 messages to stay within context)
    type HistoryMsg = { role: string; content: string }
    const history = (conversationHistory as HistoryMsg[])
      .slice(-8)
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
      maxTokens: 250,
      temperature: 0.75,
    })

    return NextResponse.json({ hint })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[socratic]', msg)
    // Always return a usable hint — never break the student's flow
    return NextResponse.json({
      hint: "That's a great question to sit with! What part feels most confusing right now — and what do you already understand about it?",
    })
  }
}
