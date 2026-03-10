import { NextRequest, NextResponse } from 'next/server'
import { openRouterChat, parseJsonResponse } from '@/lib/openrouter'

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY is not set in .env.local' }, { status: 500 })
    }

    const body = await request.json()
    const { mode, content, complexity = 50, pacing = 50, scaffolding = 50 } = body

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const complexityLabel = complexity < 33 ? 'basic and accessible' : complexity < 66 ? 'intermediate' : 'advanced and challenging'
    const pacingLabel     = pacing < 33     ? 'slow and thorough'    : pacing < 66     ? 'moderate'     : 'brisk'
    const scaffoldLabel   = scaffolding < 33 ? 'heavily scaffolded'  : scaffolding < 66 ? 'moderately scaffolded' : 'minimal scaffolding'

    const sourceDesc =
      mode === 'url'  ? `the resource at this URL: ${content}` :
      mode === 'text' ? `the following content:\n${content.slice(0, 3000)}` :
      `these learning objectives:\n${content}`

    // ── STEP 1: Extract & Analyze Content ─────────────────────────────
    const extractionPrompt = `You are an expert educational content analyst.

Analyze this source material and extract its key educational components.
Source: ${sourceDesc}

Reply ONLY with a raw JSON object. No markdown, no backticks:

{
  "main_topic": "one-line topic name",
  "key_concepts": ["concept 1", "concept 2", "concept 3", "concept 4", "concept 5"],
  "sub_topics": ["sub-topic 1", "sub-topic 2", "sub-topic 3"],
  "learning_objectives": [
    "Students will be able to [measurable action] [specific topic]",
    "Students will understand [core concept]",
    "Students will apply [skill] to [context]"
  ],
  "key_terms": [
    {"term": "term1", "definition": "clear student-friendly definition", "example": "concrete example"},
    {"term": "term2", "definition": "definition", "example": "example"},
    {"term": "term3", "definition": "definition", "example": "example"},
    {"term": "term4", "definition": "definition", "example": "example"},
    {"term": "term5", "definition": "definition", "example": "example"}
  ],
  "content_richness": {
    "has_processes_or_steps": true,
    "has_comparisons": false,
    "has_visuals_described": true,
    "has_real_world_applications": true,
    "needs_video_demo": false
  },
  "suggested_prerequisites": ["prior knowledge 1", "prior knowledge 2"],
  "tags": ["tag1", "tag2", "tag3"]
}`

    let analysisRaw: string
    try {
      analysisRaw = await openRouterChat({
        messages: [
          { role: 'system', content: 'You are an expert educational content analyst. Reply ONLY with raw JSON, no markdown or backticks.' },
          { role: 'user', content: extractionPrompt },
        ],
        maxTokens: 1000,
        temperature: 0.3,
      })
    } catch (e) {
      throw new Error(`Analysis step failed: ${e instanceof Error ? e.message : String(e)}`)
    }

    let analysis: Record<string, unknown>
    try {
      analysis = parseJsonResponse(analysisRaw)
    } catch {
      // If analysis fails, fall back to a basic analysis
      analysis = {
        main_topic: content.slice(0, 60),
        key_concepts: [],
        learning_objectives: ['Students will understand the core concepts', 'Students will apply key ideas'],
        key_terms: [],
        content_richness: { has_processes_or_steps: false, has_comparisons: false, has_visuals_described: false, has_real_world_applications: true, needs_video_demo: false },
        suggested_prerequisites: [],
        tags: [],
      }
    }

    const richness = analysis.content_richness as Record<string, boolean> ?? {}
    const keyConcepts = Array.isArray(analysis.key_concepts) ? analysis.key_concepts : []
    const objectives  = Array.isArray(analysis.learning_objectives) ? analysis.learning_objectives : []

    // ── STEP 2: Design Framework & Generate Full Lesson ─────────────────
    // Determine which section types to use based on analysis
    const needsVideo   = richness.needs_video_demo || richness.has_processes_or_steps
    const needsImage   = richness.has_visuals_described || richness.has_comparisons
    const needsActivity = richness.has_real_world_applications

    const sectionFrameworkHint = `
The lesson should have 5-6 sections with a MIX of content types. Based on the content analysis:
- Start with a "text" introduction (hook + why it matters)
- Use "text" for concept explanations
${needsImage  ? '- Include at least ONE "image" section for a key visual concept (provide image_search_query and alt_text instead of content)' : ''}
${needsVideo  ? '- Include ONE "video" section for a process/demonstration (provide video_search_query and a recommended YouTube search)' : ''}
${needsActivity ? '- Include ONE "activity" section with hands-on practice' : ''}
- Include ONE "quiz" section mid-lesson
- End with a "text" summary section`

    const fullLessonPrompt = `You are an expert educational content designer creating a ${complexityLabel}, ${pacingLabel}-paced, ${scaffoldLabel} lesson.

CONTENT ANALYSIS:
- Topic: ${analysis.main_topic ?? 'Unknown'}
- Key Concepts: ${keyConcepts.slice(0, 5).join(', ')}
- Learning Objectives: ${objectives.join(' | ')}

SOURCE MATERIAL:
${sourceDesc}

${sectionFrameworkHint}

SECTION CONTENT RULES:
- "text" sections: 2-4 paragraphs of real, specific educational content — never placeholder text
- "image" sections: content field = "IMAGE_PLACEHOLDER|||{image_search_query}|||{caption describing what students should see}"
- "video" sections: content field = "VIDEO_PLACEHOLDER|||{youtube_search_query}|||{caption describing what the video covers}"
- "activity" sections: step-by-step instructions for hands-on practice
- "discussion" sections: thought-provoking open-ended questions
- "quiz" sections: leave content as the quiz title (questions come separately)

QUIZ QUESTION RULES:
- 1 diagnostic question (is_diagnostic: true, tests prerequisite knowledge)
- 1-2 micro-check questions per major section (is_micro_check: true, test understanding of that section)
- 3-4 final quiz questions (is_final_quiz: true, comprehensive test)
- All questions must test actual understanding, not memorization
- Micro-check questions should have a section_hint field naming which section they relate to

Reply ONLY with a raw JSON object:

{
  "title": "Specific, engaging lesson title",
  "description": "2 sentence overview of what students will learn and why it matters",
  "objectives": ${JSON.stringify(objectives.slice(0, 4))},
  "estimated_duration": 45,
  "prerequisites": ${JSON.stringify(Array.isArray(analysis.suggested_prerequisites) ? analysis.suggested_prerequisites : [])},
  "tags": ${JSON.stringify(Array.isArray(analysis.tags) ? analysis.tags : [])},
  "sections": [
    {"title": "Introduction & Hook", "content": "2-3 paragraph intro explaining why this topic matters in real life and what students will discover", "content_type": "text", "duration_minutes": 7},
    {"title": "Core Concept: [specific name]", "content": "2-4 paragraph explanation with definitions, examples, and connections to real life", "content_type": "text", "duration_minutes": 10},
    {"title": "Visual Overview", "content": "IMAGE_PLACEHOLDER|||[specific search query for relevant diagram or image]|||[caption: what this image shows and why it matters]", "content_type": "image", "duration_minutes": 5},
    {"title": "Section Check", "content": "Quick Quiz", "content_type": "quiz", "duration_minutes": 5},
    {"title": "Deeper Dive: [specific concept]", "content": "2-4 paragraphs building on the previous concept with more detail and examples", "content_type": "text", "duration_minutes": 10},
    {"title": "Try It Yourself", "content": "Step-by-step activity instructions for hands-on practice", "content_type": "activity", "duration_minutes": 8},
    {"title": "Summary & Key Takeaways", "content": "Clear summary of all key concepts learned and 2 reflection questions", "content_type": "text", "duration_minutes": 5}
  ],
  "quiz_questions": [
    {"question_text": "Diagnostic: What do you already know about [specific concept]?", "question_type": "multiple_choice", "options": [{"id":"a","text":"specific option","is_correct":false},{"id":"b","text":"correct answer","is_correct":true},{"id":"c","text":"specific option","is_correct":false},{"id":"d","text":"specific option","is_correct":false}], "correct_answer": "b", "explanation": "Specific reason why b is correct relating to the lesson", "difficulty": "beginner", "is_diagnostic": true, "is_micro_check": false, "is_final_quiz": false, "section_hint": ""},
    {"question_text": "Micro-check: Which of the following best describes [concept from section 2]?", "question_type": "multiple_choice", "options": [{"id":"a","text":"option","is_correct":false},{"id":"b","text":"option","is_correct":false},{"id":"c","text":"correct answer","is_correct":true},{"id":"d","text":"option","is_correct":false}], "correct_answer": "c", "explanation": "Specific explanation referencing section content", "difficulty": "intermediate", "is_diagnostic": false, "is_micro_check": true, "is_final_quiz": false, "section_hint": "Section 2"},
    {"question_text": "Micro-check: In the context of [topic], what happens when [specific scenario]?", "question_type": "true_false", "options": [{"id":"true","text":"True","is_correct":true},{"id":"false","text":"False","is_correct":false}], "correct_answer": "true", "explanation": "Explanation of why this is true based on the lesson content", "difficulty": "beginner", "is_diagnostic": false, "is_micro_check": true, "is_final_quiz": false, "section_hint": "Section 3"},
    {"question_text": "Final: Which scenario correctly demonstrates [key concept]?", "question_type": "multiple_choice", "options": [{"id":"a","text":"correct application","is_correct":true},{"id":"b","text":"plausible but wrong","is_correct":false},{"id":"c","text":"common misconception","is_correct":false},{"id":"d","text":"option","is_correct":false}], "correct_answer": "a", "explanation": "Specific explanation of why a is correct", "difficulty": "intermediate", "is_diagnostic": false, "is_micro_check": false, "is_final_quiz": true, "section_hint": ""},
    {"question_text": "Final: A student observes [specific scenario from the lesson]. What is the correct interpretation?", "question_type": "multiple_choice", "options": [{"id":"a","text":"option","is_correct":false},{"id":"b","text":"correct answer","is_correct":true},{"id":"c","text":"option","is_correct":false},{"id":"d","text":"option","is_correct":false}], "correct_answer": "b", "explanation": "Specific explanation", "difficulty": "advanced", "is_diagnostic": false, "is_micro_check": false, "is_final_quiz": true, "section_hint": ""},
    {"question_text": "Final: Fill in the blank: [Key concept] is the process of ___.", "question_type": "fill_blank", "options": [], "correct_answer": "specific answer from lesson", "explanation": "This is covered in the core concept section", "difficulty": "intermediate", "is_diagnostic": false, "is_micro_check": false, "is_final_quiz": true, "section_hint": ""},
    {"question_text": "Final: Explain in your own words why [key concept] matters in [real-world context].", "question_type": "short_answer", "options": [], "correct_answer": "Key points: [point 1], [point 2], [point 3] from the lesson", "explanation": "Students should reference concepts from the lesson", "difficulty": "advanced", "is_diagnostic": false, "is_micro_check": false, "is_final_quiz": true, "section_hint": ""}
  ],
  "glossary_terms": ${JSON.stringify(Array.isArray(analysis.key_terms) ? analysis.key_terms : [])}
}`

    let raw: string
    try {
      raw = await openRouterChat({
        messages: [
          { role: 'system', content: 'You are an expert educational content designer. Reply ONLY with raw JSON, no markdown, no backticks, no explanation.' },
          { role: 'user', content: fullLessonPrompt },
        ],
        maxTokens: 3500,
        temperature: 0.4,
      })
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr)
      console.error('[create-lesson] AI generation error:', msg)
      return NextResponse.json({ error: `AI service error: ${msg}` }, { status: 500 })
    }

    let lesson: Record<string, unknown>
    try {
      lesson = parseJsonResponse(raw)
    } catch (parseErr) {
      console.error('[create-lesson] JSON parse error. Raw:', raw.slice(0, 400))
      return NextResponse.json({ error: `AI returned invalid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` }, { status: 500 })
    }

    // Post-process sections: handle IMAGE_PLACEHOLDER and VIDEO_PLACEHOLDER
    const sections = Array.isArray(lesson.sections) ? lesson.sections : []
    const processedSections = sections.map((s: Record<string, unknown>) => {
      const content = String(s.content ?? '')
      if (content.startsWith('IMAGE_PLACEHOLDER|||')) {
        const parts = content.split('|||')
        return { ...s, content_type: 'image', content: `${parts[1] ?? ''}|||${parts[2] ?? ''}` }
      }
      if (content.startsWith('VIDEO_PLACEHOLDER|||')) {
        const parts = content.split('|||')
        // Format as a YouTube search link
        const query = encodeURIComponent(parts[1] ?? '')
        const videoUrl = `https://www.youtube.com/results?search_query=${query}`
        return { ...s, content_type: 'video', content: `${videoUrl}|||${parts[2] ?? ''}` }
      }
      return s
    })

    return NextResponse.json({
      lesson: {
        title:              String(lesson.title              ?? 'Untitled Lesson'),
        description:        String(lesson.description        ?? ''),
        objectives:         Array.isArray(lesson.objectives)    ? lesson.objectives    : objectives,
        estimated_duration: Number(lesson.estimated_duration ?? 45),
        prerequisites:      Array.isArray(lesson.prerequisites) ? lesson.prerequisites : [],
        tags:               Array.isArray(lesson.tags)           ? lesson.tags           : [],
        sections:           processedSections,
        quiz_questions:     Array.isArray(lesson.quiz_questions) ? lesson.quiz_questions : [],
        glossary_terms:     Array.isArray(lesson.glossary_terms) ? lesson.glossary_terms : [],
      },
      analysis: {
        main_topic:   String(analysis.main_topic ?? ''),
        key_concepts: keyConcepts,
      },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[create-lesson] FATAL:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
