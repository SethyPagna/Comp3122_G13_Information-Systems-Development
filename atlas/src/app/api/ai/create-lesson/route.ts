import { NextRequest, NextResponse } from 'next/server'
import { openRouterChat, parseJsonResponse } from '@/lib/openrouter'

export async function POST(request: NextRequest) {
  try {
    const { mode, content, complexity = 50, pacing = 50, scaffolding = 50 } = await request.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const complexityDesc =
      complexity < 33 ? 'basic and accessible for all learners' :
      complexity < 66 ? 'intermediate and grade-appropriate' :
      'advanced and challenging'

    const pacingDesc =
      pacing < 33 ? 'thorough and slow-paced with extensive explanation' :
      pacing < 66 ? 'moderate, balanced pacing' :
      'brisk pacing for engaged learners'

    const scaffoldingDesc =
      scaffolding < 33 ? 'heavily scaffolded with step-by-step guidance' :
      scaffolding < 66 ? 'moderate scaffolding with some independence' :
      'minimal scaffolding for independent learners'

    const sourceLabel =
      mode === 'url' ? `this URL/resource: ${content}` :
      mode === 'text' ? `this content:\n\n${content}` :
      `these learning objectives:\n\n${content}`

    const systemPrompt = `You are Atlas AI, an expert educational content designer.
Create structured, engaging lessons for an adaptive learning platform.

Lesson settings:
- Complexity: ${complexityDesc}
- Pacing: ${pacingDesc}
- Scaffolding: ${scaffoldingDesc}

CRITICAL: Respond ONLY with a valid JSON object. No markdown fences, no preamble, no text after the JSON.`

    const userPrompt = `Create a complete lesson from ${sourceLabel}.

Return this exact JSON structure (replace ALL placeholder text with real content specific to the topic):

{
  "title": "Compelling lesson title",
  "description": "2-3 sentence overview of what students will learn",
  "objectives": [
    "Students will be able to...",
    "Students will understand...",
    "Students will apply..."
  ],
  "estimated_duration": 45,
  "prerequisites": ["Prior knowledge concept 1", "Prior knowledge concept 2"],
  "tags": ["topic1", "topic2", "topic3"],
  "sections": [
    {
      "title": "Introduction & Real-World Hook",
      "content": "Engaging 3-4 paragraph introduction connecting to students' lives. Why does this matter? What problem does it solve?",
      "content_type": "text",
      "duration_minutes": 5
    },
    {
      "title": "Core Concept 1",
      "content": "Detailed 4-5 paragraph explanation of the first major concept. Include definitions, examples, and analogies.",
      "content_type": "text",
      "duration_minutes": 10
    },
    {
      "title": "Core Concept 2",
      "content": "Second major concept building on the first. Use comparisons, diagrams described in text, and worked examples.",
      "content_type": "text",
      "duration_minutes": 10
    },
    {
      "title": "Practical Application",
      "content": "How to apply this knowledge in real situations. Walk through 2-3 concrete scenarios or worked problems.",
      "content_type": "activity",
      "duration_minutes": 12
    },
    {
      "title": "Summary & Key Takeaways",
      "content": "Concise summary of all key concepts. 3-5 bullet points of what students should remember. Reflection questions.",
      "content_type": "text",
      "duration_minutes": 8
    }
  ],
  "quiz_questions": [
    {
      "question_text": "Diagnostic: Before studying, what do you know about [core concept]?",
      "question_type": "multiple_choice",
      "options": [
        {"id": "a", "text": "Beginner-level incorrect answer", "is_correct": false},
        {"id": "b", "text": "The correct foundational answer", "is_correct": true},
        {"id": "c", "text": "Common misconception", "is_correct": false},
        {"id": "d", "text": "Partially correct but incomplete", "is_correct": false}
      ],
      "correct_answer": "b",
      "explanation": "This is correct because [specific reason tied to the topic].",
      "difficulty": "beginner",
      "is_diagnostic": true,
      "is_micro_check": false,
      "is_final_quiz": false
    },
    {
      "question_text": "Diagnostic: Which statement best describes [related concept]?",
      "question_type": "multiple_choice",
      "options": [
        {"id": "a", "text": "Correct answer", "is_correct": true},
        {"id": "b", "text": "Incorrect option", "is_correct": false},
        {"id": "c", "text": "Incorrect option", "is_correct": false},
        {"id": "d", "text": "Incorrect option", "is_correct": false}
      ],
      "correct_answer": "a",
      "explanation": "Explanation of why this is correct.",
      "difficulty": "intermediate",
      "is_diagnostic": true,
      "is_micro_check": false,
      "is_final_quiz": false
    },
    {
      "question_text": "Quick Check: After the first two sections, which of the following is true about [concept]?",
      "question_type": "multiple_choice",
      "options": [
        {"id": "a", "text": "Option A", "is_correct": false},
        {"id": "b", "text": "Option B", "is_correct": false},
        {"id": "c", "text": "Correct micro-check answer", "is_correct": true},
        {"id": "d", "text": "Option D", "is_correct": false}
      ],
      "correct_answer": "c",
      "explanation": "This was covered in section 2 because...",
      "difficulty": "intermediate",
      "is_diagnostic": false,
      "is_micro_check": true,
      "is_final_quiz": false
    },
    {
      "question_text": "Final: Explain which of the following best demonstrates [key learning objective 1]?",
      "question_type": "multiple_choice",
      "options": [
        {"id": "a", "text": "Correct final quiz answer", "is_correct": true},
        {"id": "b", "text": "Plausible but wrong", "is_correct": false},
        {"id": "c", "text": "Common mistake", "is_correct": false},
        {"id": "d", "text": "Partially right but missing key element", "is_correct": false}
      ],
      "correct_answer": "a",
      "explanation": "This demonstrates mastery of objective 1 because...",
      "difficulty": "intermediate",
      "is_diagnostic": false,
      "is_micro_check": false,
      "is_final_quiz": true
    },
    {
      "question_text": "Final: A student encounters [scenario]. What should they do?",
      "question_type": "multiple_choice",
      "options": [
        {"id": "a", "text": "Option A", "is_correct": false},
        {"id": "b", "text": "Correct application answer", "is_correct": true},
        {"id": "c", "text": "Option C", "is_correct": false},
        {"id": "d", "text": "Option D", "is_correct": false}
      ],
      "correct_answer": "b",
      "explanation": "This is the correct approach because...",
      "difficulty": "intermediate",
      "is_diagnostic": false,
      "is_micro_check": false,
      "is_final_quiz": true
    },
    {
      "question_text": "Final: Which of the following is an advanced application of [topic]?",
      "question_type": "multiple_choice",
      "options": [
        {"id": "a", "text": "Option A", "is_correct": false},
        {"id": "b", "text": "Option B", "is_correct": false},
        {"id": "c", "text": "Option C", "is_correct": false},
        {"id": "d", "text": "Advanced correct answer", "is_correct": true}
      ],
      "correct_answer": "d",
      "explanation": "This shows advanced understanding because...",
      "difficulty": "advanced",
      "is_diagnostic": false,
      "is_micro_check": false,
      "is_final_quiz": true
    }
  ],
  "glossary_terms": [
    {"term": "Key Term 1", "definition": "Clear, student-friendly definition", "example": "Example sentence using this term"},
    {"term": "Key Term 2", "definition": "Clear, student-friendly definition", "example": "Example sentence"},
    {"term": "Key Term 3", "definition": "Clear, student-friendly definition", "example": "Example sentence"},
    {"term": "Key Term 4", "definition": "Clear, student-friendly definition", "example": "Example sentence"},
    {"term": "Key Term 5", "definition": "Clear, student-friendly definition", "example": "Example sentence"}
  ]
}

IMPORTANT: Every single field must contain real, specific content about the topic — not placeholder text.`

    const raw = await openRouterChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 3000, // free model cap — keep under limit
      temperature: 0.5,
    })

    let lesson
    try {
      lesson = parseJsonResponse(raw)
    } catch {
      // Second attempt: try to extract just the JSON object if model added extra text
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Model did not return valid JSON. Try again or simplify your input.')
      lesson = JSON.parse(match[0])
    }

    // Ensure required arrays exist to prevent downstream errors
    if (!lesson.sections) lesson.sections = []
    if (!lesson.quiz_questions) lesson.quiz_questions = []
    if (!lesson.glossary_terms) lesson.glossary_terms = []
    if (!lesson.objectives) lesson.objectives = []
    if (!lesson.tags) lesson.tags = []
    if (!lesson.prerequisites) lesson.prerequisites = []
    if (!lesson.estimated_duration) lesson.estimated_duration = 45

    return NextResponse.json({ lesson })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[create-lesson]', msg)
    return NextResponse.json(
      { error: `Failed to generate lesson: ${msg}` },
      { status: 500 }
    )
  }
}
