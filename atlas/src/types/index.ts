export type UserRole = 'teacher' | 'student'
export type LessonStatus = 'draft' | 'published' | 'archived'
export type ContentType = 'text' | 'video' | 'image' | 'quiz' | 'activity' | 'discussion'
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'
export type AlertType = 'struggling' | 'intervention' | 'achievement' | 'completion'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  school: string | null
  grade_level: string | null
  subjects: string[] | null
  interests: string[] | null
  preferences: { theme: string; text_size: string }
  achievements: Achievement[]
  total_xp: number
  created_at: string
  updated_at: string
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  earned_at: string
}

export interface Class {
  id: string
  teacher_id: string
  name: string
  description: string | null
  subject: string | null
  grade_level: string | null
  join_code: string
  is_active: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
  enrollment_count?: number
}

export interface Lesson {
  id: string
  teacher_id: string
  class_id: string | null
  title: string
  description: string | null
  objectives: string[]
  subject: string | null
  grade_level: string | null
  status: LessonStatus
  difficulty: DifficultyLevel
  estimated_duration: number
  tags: string[]
  thumbnail_url: string | null
  source_url: string | null
  source_content: string | null
  ai_generated: boolean
  complexity_slider: number
  pacing_slider: number
  scaffolding_slider: number
  prerequisites: string[]
  created_at: string
  updated_at: string
  sections?: LessonSection[]
  progress?: StudentProgress
}

export interface LessonSection {
  id: string
  lesson_id: string
  title: string
  content: string | null
  content_type: ContentType
  order_index: number
  duration_minutes: number
  is_required: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface QuizQuestion {
  id: string
  lesson_id: string
  section_id: string | null
  question_text: string
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'matching'
  options: { id: string; text: string; is_correct: boolean }[] | null
  correct_answer: string | null
  explanation: string | null
  difficulty: DifficultyLevel
  points: number
  is_diagnostic: boolean
  is_micro_check: boolean
  is_final_quiz: boolean
  order_index: number
  created_at: string
}

export interface StudentProgress {
  id: string
  student_id: string
  lesson_id: string
  status: ProgressStatus
  current_section_id: string | null
  sections_completed: string[]
  score: number | null
  time_spent: number
  diagnostic_completed: boolean
  diagnostic_score: number | null
  final_quiz_score: number | null
  knowledge_gaps: string[]
  started_at: string | null
  completed_at: string | null
  last_active: string
}

export interface SocraticInteraction {
  id: string
  student_id: string
  lesson_id: string
  section_id: string | null
  student_question: string
  hint_response: string
  hint_type: 'guiding_question' | 'concept_reminder' | 'step_breakdown'
  conversation_history: ChatMessage[]
  helpful_rating: number | null
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface TeacherAlert {
  id: string
  teacher_id: string
  student_id: string | null
  lesson_id: string | null
  alert_type: AlertType
  title: string
  message: string
  action_suggestion: string | null
  is_read: boolean
  is_dismissed: boolean
  metadata: Record<string, unknown>
  created_at: string
  student?: Profile
  lesson?: Lesson
}

export interface KnowledgeNode {
  id: string
  student_id: string
  lesson_id: string | null
  concept: string
  mastery_level: number
  evidence: unknown[]
  created_at: string
  updated_at: string
}

export interface LessonAnalytics {
  id: string
  lesson_id: string
  teacher_id: string
  total_students: number
  students_started: number
  students_completed: number
  avg_score: number | null
  avg_time_spent: number | null
  concept_mastery: Record<string, number>
  common_mistakes: { question: string; count: number }[]
  struggling_students: string[]
  advanced_students: string[]
  computed_at: string
}

export interface GlossaryTerm {
  id: string
  lesson_id: string
  term: string
  definition: string
  example: string | null
  created_at: string
}

// AI Generation Types
export interface AILessonDraft {
  title: string
  description: string
  objectives: string[]
  sections: {
    title: string
    content: string
    content_type: ContentType
    duration_minutes: number
  }[]
  quiz_questions: {
    question_text: string
    question_type: string
    options: { id: string; text: string; is_correct: boolean }[]
    explanation: string
    difficulty: DifficultyLevel
    is_diagnostic: boolean
    is_micro_check: boolean
    is_final_quiz: boolean
  }[]
  glossary_terms: {
    term: string
    definition: string
    example: string
  }[]
  prerequisites: string[]
  tags: string[]
  estimated_duration: number
}
