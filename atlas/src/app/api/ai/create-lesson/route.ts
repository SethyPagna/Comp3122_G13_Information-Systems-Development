import { NextRequest, NextResponse } from "next/server";
import { openRouterChat, parseJsonResponse } from "@/lib/openrouter";
import type { AILessonDraft } from "@/types";

const MAX_SOURCE_CHARS = 5000;

type FallbackLessonDraft = Omit<AILessonDraft, "quiz_questions"> & {
  quiz_questions: (AILessonDraft["quiz_questions"][number] & {
    correct_answer: "a" | "b" | "c" | "d";
  })[];
};

function truncateSourceInput(source: string, maxChars = MAX_SOURCE_CHARS) {
  if (source.length <= maxChars) {
    return { text: source, wasTruncated: false };
  }

  return {
    text: `${source.slice(0, maxChars)}\n\n[Input truncated to stay within model limits.]`,
    wasTruncated: true,
  };
}

function deriveTopicLabel(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "the requested topic";

  const normalized = firstLine.replace(/^[-*\d.)\s]+/, "").trim();
  if (!normalized) return "the requested topic";

  const words = normalized.split(/\s+/).slice(0, 10).join(" ");
  return words.length > 80 ? `${words.slice(0, 80).trim()}...` : words;
}

function buildLocalFallbackLesson(topic: string): FallbackLessonDraft {
  return {
    title: `Intro to ${topic}`,
    description:
      "This starter lesson was generated locally because the AI provider returned an incomplete response. You can edit and expand each section before publishing.",
    objectives: [
      `Identify the core ideas in ${topic}.`,
      `Explain ${topic} using clear examples.`,
      `Apply ${topic} in a simple scenario.`,
    ],
    estimated_duration: 45,
    prerequisites: [
      "Basic background knowledge",
      "Willingness to explore examples",
    ],
    tags: ["starter", "ai-fallback", "editable"],
    sections: [
      {
        title: "Introduction",
        content: `Introduce ${topic} with a relatable real-world context. Clarify why it matters and what students should focus on first.`,
        content_type: "text",
        duration_minutes: 8,
      },
      {
        title: "Core Concept 1",
        content: `Define the first key idea in ${topic}. Include one clear example and one common misconception to address.`,
        content_type: "text",
        duration_minutes: 9,
      },
      {
        title: "Core Concept 2",
        content: `Build on the first concept with a second related idea. Compare and contrast when appropriate.`,
        content_type: "text",
        duration_minutes: 9,
      },
      {
        title: "Guided Practice",
        content: `Walk through a short practice activity where students apply ${topic} step by step.`,
        content_type: "activity",
        duration_minutes: 11,
      },
      {
        title: "Summary and Reflection",
        content:
          "Summarize the key points and include reflection prompts students can answer to self-check understanding.",
        content_type: "text",
        duration_minutes: 8,
      },
    ],
    quiz_questions: [
      {
        question_text: `Diagnostic: What best describes ${topic}?`,
        question_type: "multiple_choice",
        options: [
          { id: "a", text: "An unrelated idea", is_correct: false },
          { id: "b", text: `A core definition of ${topic}`, is_correct: true },
          { id: "c", text: "A common misconception", is_correct: false },
          { id: "d", text: "A partially correct statement", is_correct: false },
        ],
        correct_answer: "b",
        explanation:
          "The correct answer provides the most accurate foundational definition.",
        difficulty: "beginner",
        is_diagnostic: true,
        is_micro_check: false,
        is_final_quiz: false,
      },
      {
        question_text: `Diagnostic: Which statement about ${topic} is accurate?`,
        question_type: "multiple_choice",
        options: [
          { id: "a", text: "Accurate statement", is_correct: true },
          { id: "b", text: "Incorrect statement", is_correct: false },
          { id: "c", text: "Incorrect statement", is_correct: false },
          { id: "d", text: "Incorrect statement", is_correct: false },
        ],
        correct_answer: "a",
        explanation:
          "The correct option aligns with the concept introduced in the lesson.",
        difficulty: "beginner",
        is_diagnostic: true,
        is_micro_check: false,
        is_final_quiz: false,
      },
      {
        question_text:
          "Quick Check: Which option best applies the concept from section 2?",
        question_type: "multiple_choice",
        options: [
          { id: "a", text: "Incorrect application", is_correct: false },
          { id: "b", text: "Incorrect application", is_correct: false },
          { id: "c", text: "Correct application", is_correct: true },
          { id: "d", text: "Incorrect application", is_correct: false },
        ],
        correct_answer: "c",
        explanation: "This option correctly applies the concept in context.",
        difficulty: "intermediate",
        is_diagnostic: false,
        is_micro_check: true,
        is_final_quiz: false,
      },
      {
        question_text: "Final: Which choice demonstrates solid understanding?",
        question_type: "multiple_choice",
        options: [
          { id: "a", text: "Correct synthesis answer", is_correct: true },
          { id: "b", text: "Plausible but incomplete", is_correct: false },
          { id: "c", text: "Common error", is_correct: false },
          { id: "d", text: "Incorrect", is_correct: false },
        ],
        correct_answer: "a",
        explanation:
          "The correct response shows understanding of both key concepts.",
        difficulty: "intermediate",
        is_diagnostic: false,
        is_micro_check: false,
        is_final_quiz: true,
      },
      {
        question_text:
          "Final: Which action is the best next step in a realistic scenario?",
        question_type: "multiple_choice",
        options: [
          { id: "a", text: "Ineffective action", is_correct: false },
          { id: "b", text: "Effective action", is_correct: true },
          { id: "c", text: "Partially effective action", is_correct: false },
          { id: "d", text: "Incorrect action", is_correct: false },
        ],
        correct_answer: "b",
        explanation: "The correct action applies the lesson method correctly.",
        difficulty: "intermediate",
        is_diagnostic: false,
        is_micro_check: false,
        is_final_quiz: true,
      },
      {
        question_text: "Final: Which option reflects advanced understanding?",
        question_type: "multiple_choice",
        options: [
          { id: "a", text: "Too simplistic", is_correct: false },
          { id: "b", text: "Partly correct", is_correct: false },
          { id: "c", text: "Common misconception", is_correct: false },
          { id: "d", text: "Advanced and correct", is_correct: true },
        ],
        correct_answer: "d",
        explanation: "This option demonstrates deeper transfer and reasoning.",
        difficulty: "advanced",
        is_diagnostic: false,
        is_micro_check: false,
        is_final_quiz: true,
      },
    ],
    glossary_terms: [
      {
        term: "Core idea",
        definition: "A central concept learners must understand.",
        example: "Students explain the core idea in their own words.",
      },
      {
        term: "Application",
        definition: "Using a concept in a practical situation.",
        example: "Students apply the concept in a case study.",
      },
      {
        term: "Misconception",
        definition: "A common but incorrect understanding.",
        example: "The class discusses a misconception and corrects it.",
      },
      {
        term: "Scaffold",
        definition: "Support that helps learners complete complex tasks.",
        example: "A guided checklist acts as a scaffold.",
      },
      {
        term: "Reflection",
        definition: "Thinking about what was learned and why it matters.",
        example: "Students write a short reflection at the end.",
      },
    ],
  };
}

export async function POST(request: NextRequest) {
  try {
    const {
      mode,
      content,
      complexity = 50,
      pacing = 50,
      scaffolding = 50,
    } = await request.json();

    const normalizedContent = typeof content === "string" ? content.trim() : "";

    if (!normalizedContent) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    const sourceCap = mode === "url" ? 800 : MAX_SOURCE_CHARS;
    const { text: safeContent, wasTruncated } = truncateSourceInput(
      normalizedContent,
      sourceCap,
    );

    const complexityDesc =
      complexity < 33
        ? "basic and accessible for all learners"
        : complexity < 66
          ? "intermediate and grade-appropriate"
          : "advanced and challenging";

    const pacingDesc =
      pacing < 33
        ? "thorough and slow-paced with extensive explanation"
        : pacing < 66
          ? "moderate, balanced pacing"
          : "brisk pacing for engaged learners";

    const scaffoldingDesc =
      scaffolding < 33
        ? "heavily scaffolded with step-by-step guidance"
        : scaffolding < 66
          ? "moderate scaffolding with some independence"
          : "minimal scaffolding for independent learners";

    const sourceLabel =
      mode === "url"
        ? `this URL/resource: ${safeContent}`
        : mode === "text"
          ? `this content:\n\n${safeContent}`
          : `these learning objectives:\n\n${safeContent}`;

    const sourceTruncationNote = wasTruncated
      ? "\n- Source input was truncated to stay within model context limits."
      : "";

    const systemPrompt = `You are Atlas AI, an expert educational content designer.
Create structured, engaging lessons for an adaptive learning platform.

Lesson settings:
- Complexity: ${complexityDesc}
- Pacing: ${pacingDesc}
- Scaffolding: ${scaffoldingDesc}

CRITICAL: Respond ONLY with a valid JSON object. No markdown fences, no preamble, no text after the JSON.`;

    const userPrompt = `Create a complete lesson from ${sourceLabel}.

Return ONLY valid JSON with this exact top-level schema and keys:
{
  "title": string,
  "description": string,
  "objectives": string[],
  "estimated_duration": number,
  "prerequisites": string[],
  "tags": string[],
  "sections": [{"title": string, "content": string, "content_type": "text"|"activity", "duration_minutes": number}],
  "quiz_questions": [{"question_text": string, "question_type": "multiple_choice", "options": [{"id": "a"|"b"|"c"|"d", "text": string, "is_correct": boolean}], "correct_answer": "a"|"b"|"c"|"d", "explanation": string, "difficulty": "beginner"|"intermediate"|"advanced", "is_diagnostic": boolean, "is_micro_check": boolean, "is_final_quiz": boolean}],
  "glossary_terms": [{"term": string, "definition": string, "example": string}]
}

Rules:
- Use real topic-specific content only.
- objectives: exactly 3 items.
- sections: exactly 5 items.
- Keep each section content concise (80-140 words) to stay within output limits.
- quiz_questions: exactly 6 multiple-choice questions, 4 options each (a-d), exactly one correct option.
- quiz flags by order: q1-q2 diagnostic, q3 micro-check, q4-q6 final quiz.
- glossary_terms: exactly 5 terms.
- No markdown, no commentary, JSON object only.${sourceTruncationNote}`;

    let raw: string;
    try {
      raw = await openRouterChat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 1800,
        temperature: 0.4,
      });
    } catch (generationError) {
      const generationMsg =
        generationError instanceof Error
          ? generationError.message.toLowerCase()
          : "";

      const shouldRetryCompact =
        generationMsg.includes("empty response") ||
        generationMsg.includes("finish_reason: length");

      if (!shouldRetryCompact) throw generationError;

      // Fallback prompt for token-constrained providers.
      const compactUserPrompt = `${userPrompt}\n\nIf needed, shorten section content to 2-3 sentences and keep explanations brief.`;

      try {
        raw = await openRouterChat({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: compactUserPrompt },
          ],
          maxTokens: 1200,
          temperature: 0.3,
        });
      } catch (compactGenerationError) {
        const compactMsg =
          compactGenerationError instanceof Error
            ? compactGenerationError.message.toLowerCase()
            : "";

        const shouldUseLocalFallback =
          compactMsg.includes("empty response") ||
          compactMsg.includes("finish_reason: length");

        if (!shouldUseLocalFallback) throw compactGenerationError;

        const fallbackTopic = deriveTopicLabel(normalizedContent);
        const fallbackLesson = buildLocalFallbackLesson(fallbackTopic);

        return NextResponse.json({
          lesson: fallbackLesson,
          warning:
            "AI provider response was truncated. Returned a local starter draft so you can continue without retrying.",
        });
      }
    }

    let lesson;
    try {
      lesson = parseJsonResponse(raw);
    } catch (initialParseError) {
      // Ask the model to repair malformed JSON so generation does not fail on minor syntax issues.
      let repairedRaw: string;
      try {
        repairedRaw = await openRouterChat({
          messages: [
            {
              role: "system",
              content:
                "You repair malformed JSON. Return ONLY valid JSON with the same schema and content. Do not add markdown fences or any explanation.",
            },
            {
              role: "user",
              content: `Repair this JSON so it is strictly valid (RFC 8259):\n\n${raw}`,
            },
          ],
          maxTokens: 3000,
          temperature: 0,
        });
      } catch (repairError) {
        const repairMsg =
          repairError instanceof Error ? repairError.message.toLowerCase() : "";

        const shouldUseLocalFallback =
          repairMsg.includes("empty response") ||
          repairMsg.includes("finish_reason: length");

        if (!shouldUseLocalFallback) throw repairError;

        const fallbackTopic = deriveTopicLabel(normalizedContent);
        const fallbackLesson = buildLocalFallbackLesson(fallbackTopic);

        return NextResponse.json({
          lesson: fallbackLesson,
          warning:
            "AI JSON repair was truncated by the provider. Returned a local starter draft so you can continue without retrying.",
        });
      }

      try {
        lesson = parseJsonResponse(repairedRaw);
      } catch {
        // Final attempt: extract just the largest JSON object if extra text was included.
        const match = repairedRaw.match(/\{[\s\S]*\}/);
        if (!match) {
          throw new Error(
            "Model returned malformed JSON and automatic repair failed. Try again with shorter content.",
          );
        }
        try {
          lesson = JSON.parse(match[0]);
        } catch {
          const parseMsg =
            initialParseError instanceof Error
              ? initialParseError.message
              : "Unknown parse error";
          throw new Error(
            `Model returned malformed JSON and automatic repair failed (${parseMsg}). Try again with shorter content.`,
          );
        }
      }
    }

    // Ensure required arrays exist to prevent downstream errors
    if (!lesson.sections) lesson.sections = [];
    if (!lesson.quiz_questions) lesson.quiz_questions = [];
    if (!lesson.glossary_terms) lesson.glossary_terms = [];
    if (!lesson.objectives) lesson.objectives = [];
    if (!lesson.tags) lesson.tags = [];
    if (!lesson.prerequisites) lesson.prerequisites = [];
    if (!lesson.estimated_duration) lesson.estimated_duration = 45;

    return NextResponse.json({ lesson });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[create-lesson]", msg);
    return NextResponse.json(
      { error: `Failed to generate lesson: ${msg}` },
      { status: 500 },
    );
  }
}
