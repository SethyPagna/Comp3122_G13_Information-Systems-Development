-- ================================================================
-- ATLAS — FULL RESET & REBUILD
-- Run this once in Supabase SQL Editor → Run
-- WARNING: This deletes ALL existing Atlas data permanently.
-- ================================================================

-- ── 1. STORAGE BUCKETS ──────────────────────────────────────────
-- Empty then delete each bucket using the Storage API
-- (Direct DELETE on storage tables is blocked by Supabase)
DO $$
DECLARE
  b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['avatars','lesson-files','lesson-thumbnails','student-uploads']
  LOOP
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = b) THEN
      PERFORM storage.empty_bucket(b);
      PERFORM storage.delete_bucket(b);
    END IF;
  END LOOP;
END;
$$;

-- ── 2. DROP TABLES (leaf → root) ────────────────────────────────
DROP TABLE IF EXISTS interest_connections   CASCADE;
DROP TABLE IF EXISTS prerequisite_modules   CASCADE;
DROP TABLE IF EXISTS glossary_terms         CASCADE;
DROP TABLE IF EXISTS lesson_analytics       CASCADE;
DROP TABLE IF EXISTS teacher_alerts         CASCADE;
DROP TABLE IF EXISTS knowledge_nodes        CASCADE;
DROP TABLE IF EXISTS socratic_interactions  CASCADE;
DROP TABLE IF EXISTS quiz_attempts          CASCADE;
DROP TABLE IF EXISTS student_progress       CASCADE;
DROP TABLE IF EXISTS lesson_assignments     CASCADE;
DROP TABLE IF EXISTS quiz_questions         CASCADE;
DROP TABLE IF EXISTS lesson_sections        CASCADE;
DROP TABLE IF EXISTS lessons                CASCADE;
DROP TABLE IF EXISTS class_enrollments      CASCADE;
DROP TABLE IF EXISTS classes                CASCADE;
DROP TABLE IF EXISTS profiles               CASCADE;

-- ── 3. DROP FUNCTIONS ───────────────────────────────────────────
DROP FUNCTION IF EXISTS student_has_lesson_access(UUID)  CASCADE;
DROP FUNCTION IF EXISTS teacher_owns_lesson(UUID)        CASCADE;
DROP FUNCTION IF EXISTS teacher_has_student(UUID)        CASCADE;
DROP FUNCTION IF EXISTS is_enrolled_in(UUID)             CASCADE;
DROP FUNCTION IF EXISTS is_teacher_of_class(UUID)        CASCADE;
DROP FUNCTION IF EXISTS increment_xp(UUID, INTEGER)      CASCADE;
DROP FUNCTION IF EXISTS get_class_readiness(UUID, UUID)  CASCADE;
DROP FUNCTION IF EXISTS update_updated_at()              CASCADE;
DROP FUNCTION IF EXISTS handle_new_user()                CASCADE;

-- ── 4. DROP TYPES ───────────────────────────────────────────────
DROP TYPE IF EXISTS alert_type       CASCADE;
DROP TYPE IF EXISTS hint_type        CASCADE;
DROP TYPE IF EXISTS progress_status  CASCADE;
DROP TYPE IF EXISTS difficulty_level CASCADE;
DROP TYPE IF EXISTS content_type     CASCADE;
DROP TYPE IF EXISTS lesson_status    CASCADE;
DROP TYPE IF EXISTS user_role        CASCADE;

-- ================================================================
-- REBUILD
-- ================================================================

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────
CREATE TYPE user_role        AS ENUM ('teacher', 'student');
CREATE TYPE lesson_status    AS ENUM ('draft', 'published', 'archived');
CREATE TYPE content_type     AS ENUM ('text', 'video', 'image', 'quiz', 'activity', 'discussion');
CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE progress_status  AS ENUM ('not_started', 'in_progress', 'completed');
CREATE TYPE hint_type        AS ENUM ('guiding_question', 'concept_reminder', 'step_breakdown');
CREATE TYPE alert_type       AS ENUM ('struggling', 'intervention', 'achievement', 'completion');

-- ── PROFILES ────────────────────────────────────────────────────
CREATE TABLE profiles (
  id           UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT         NOT NULL,
  full_name    TEXT,
  avatar_url   TEXT,
  role         user_role    NOT NULL DEFAULT 'student',
  school       TEXT,
  grade_level  TEXT,
  subjects     TEXT[],
  interests    TEXT[],
  preferences  JSONB        DEFAULT '{"theme":"dark","text_size":"medium"}',
  achievements JSONB        DEFAULT '[]',
  total_xp     INTEGER      DEFAULT 0,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ── CLASSES ─────────────────────────────────────────────────────
CREATE TABLE classes (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id  UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  description TEXT,
  subject     TEXT,
  grade_level TEXT,
  join_code   TEXT         UNIQUE DEFAULT UPPER(SUBSTRING(md5(random()::text), 1, 8)),
  is_active   BOOLEAN      DEFAULT TRUE,
  settings    JSONB        DEFAULT '{}',
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── CLASS ENROLLMENTS ───────────────────────────────────────────
CREATE TABLE class_enrollments (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID         NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  student_id  UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ  DEFAULT NOW(),
  is_active   BOOLEAN      DEFAULT TRUE,
  UNIQUE(class_id, student_id)
);

-- ── LESSONS ─────────────────────────────────────────────────────
CREATE TABLE lessons (
  id                  UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id          UUID             NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id            UUID             REFERENCES classes(id) ON DELETE SET NULL,
  title               TEXT             NOT NULL,
  description         TEXT,
  objectives          TEXT[],
  subject             TEXT,
  grade_level         TEXT,
  status              lesson_status    DEFAULT 'draft',
  difficulty          difficulty_level DEFAULT 'intermediate',
  estimated_duration  INTEGER          DEFAULT 45,
  tags                TEXT[],
  thumbnail_url       TEXT,
  source_url          TEXT,
  source_content      TEXT,
  ai_generated        BOOLEAN          DEFAULT FALSE,
  complexity_slider   INTEGER          DEFAULT 50 CHECK (complexity_slider  BETWEEN 0 AND 100),
  pacing_slider       INTEGER          DEFAULT 50 CHECK (pacing_slider      BETWEEN 0 AND 100),
  scaffolding_slider  INTEGER          DEFAULT 50 CHECK (scaffolding_slider BETWEEN 0 AND 100),
  prerequisites       TEXT[],
  created_at          TIMESTAMPTZ      DEFAULT NOW(),
  updated_at          TIMESTAMPTZ      DEFAULT NOW()
);

-- ── LESSON SECTIONS ─────────────────────────────────────────────
CREATE TABLE lesson_sections (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id        UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title            TEXT         NOT NULL,
  content          TEXT,
  content_type     content_type DEFAULT 'text',
  order_index      INTEGER      NOT NULL,
  duration_minutes INTEGER      DEFAULT 5,
  is_required      BOOLEAN      DEFAULT TRUE,
  metadata         JSONB        DEFAULT '{}',
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- ── QUIZ QUESTIONS ──────────────────────────────────────────────
CREATE TABLE quiz_questions (
  id             UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id      UUID             NOT NULL REFERENCES lessons(id)         ON DELETE CASCADE,
  section_id     UUID             REFERENCES lesson_sections(id)          ON DELETE SET NULL,
  question_text  TEXT             NOT NULL,
  question_type  TEXT             DEFAULT 'multiple_choice',
  options        JSONB,
  correct_answer TEXT,
  explanation    TEXT,
  difficulty     difficulty_level DEFAULT 'intermediate',
  points         INTEGER          DEFAULT 1,
  is_diagnostic  BOOLEAN          DEFAULT FALSE,
  is_micro_check BOOLEAN          DEFAULT FALSE,
  is_final_quiz  BOOLEAN          DEFAULT FALSE,
  order_index    INTEGER          DEFAULT 0,
  created_at     TIMESTAMPTZ      DEFAULT NOW()
);

-- ── LESSON ASSIGNMENTS ──────────────────────────────────────────
CREATE TABLE lesson_assignments (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id   UUID         NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  class_id    UUID         REFERENCES classes(id)           ON DELETE CASCADE,
  student_id  UUID         REFERENCES profiles(id)          ON DELETE CASCADE,
  assigned_by UUID         NOT NULL REFERENCES profiles(id),
  due_date    TIMESTAMPTZ,
  is_active   BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── STUDENT PROGRESS ────────────────────────────────────────────
CREATE TABLE student_progress (
  id                   UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id           UUID            NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  lesson_id            UUID            NOT NULL REFERENCES lessons(id)         ON DELETE CASCADE,
  status               progress_status DEFAULT 'not_started',
  current_section_id   UUID            REFERENCES lesson_sections(id)         ON DELETE SET NULL,
  sections_completed   UUID[]          DEFAULT '{}',
  score                DECIMAL(5,2),
  time_spent           INTEGER         DEFAULT 0,
  diagnostic_completed BOOLEAN         DEFAULT FALSE,
  diagnostic_score     DECIMAL(5,2),
  final_quiz_score     DECIMAL(5,2),
  knowledge_gaps       TEXT[]          DEFAULT '{}',
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  last_active          TIMESTAMPTZ     DEFAULT NOW(),
  metadata             JSONB           DEFAULT '{}',
  UNIQUE(student_id, lesson_id)
);

-- ── QUIZ ATTEMPTS ───────────────────────────────────────────────
CREATE TABLE quiz_attempts (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID         NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  lesson_id      UUID         NOT NULL REFERENCES lessons(id)        ON DELETE CASCADE,
  question_id    UUID         NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  answer         TEXT,
  is_correct     BOOLEAN,
  time_taken     INTEGER,
  attempt_number INTEGER      DEFAULT 1,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ── SOCRATIC INTERACTIONS ───────────────────────────────────────
CREATE TABLE socratic_interactions (
  id                   UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id           UUID       NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  lesson_id            UUID       NOT NULL REFERENCES lessons(id)         ON DELETE CASCADE,
  section_id           UUID       REFERENCES lesson_sections(id)         ON DELETE SET NULL,
  student_question     TEXT       NOT NULL,
  hint_response        TEXT       NOT NULL,
  hint_type            hint_type  DEFAULT 'guiding_question',
  conversation_history JSONB      DEFAULT '[]',
  helpful_rating       INTEGER    CHECK (helpful_rating BETWEEN 1 AND 5),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── KNOWLEDGE NODES ─────────────────────────────────────────────
CREATE TABLE knowledge_nodes (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id     UUID         REFERENCES lessons(id)           ON DELETE CASCADE,
  concept       TEXT         NOT NULL,
  mastery_level DECIMAL(3,2) DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 1),
  evidence      JSONB        DEFAULT '[]',
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(student_id, concept)
);

-- ── TEACHER ALERTS ──────────────────────────────────────────────
CREATE TABLE teacher_alerts (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id        UUID        REFERENCES profiles(id)          ON DELETE CASCADE,
  lesson_id         UUID        REFERENCES lessons(id)           ON DELETE CASCADE,
  alert_type        alert_type  NOT NULL,
  title             TEXT        NOT NULL,
  message           TEXT        NOT NULL,
  action_suggestion TEXT,
  is_read           BOOLEAN     DEFAULT FALSE,
  is_dismissed      BOOLEAN     DEFAULT FALSE,
  metadata          JSONB       DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── LESSON ANALYTICS ────────────────────────────────────────────
CREATE TABLE lesson_analytics (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id          UUID         NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  teacher_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_students     INTEGER      DEFAULT 0,
  students_started   INTEGER      DEFAULT 0,
  students_completed INTEGER      DEFAULT 0,
  avg_score          DECIMAL(5,2),
  avg_time_spent     INTEGER,
  concept_mastery    JSONB        DEFAULT '{}',
  common_mistakes    JSONB        DEFAULT '[]',
  struggling_students UUID[],
  advanced_students   UUID[],
  computed_at        TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(lesson_id)
);

-- ── GLOSSARY TERMS ──────────────────────────────────────────────
CREATE TABLE glossary_terms (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id  UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  term       TEXT         NOT NULL,
  definition TEXT         NOT NULL,
  example    TEXT,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ── PREREQUISITE MODULES ────────────────────────────────────────
CREATE TABLE prerequisite_modules (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id      UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  concept        TEXT         NOT NULL,
  content        TEXT         NOT NULL,
  quiz_questions JSONB        DEFAULT '[]',
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ── INTEREST CONNECTIONS ────────────────────────────────────────
CREATE TABLE interest_connections (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id       UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  interest_tag    TEXT         NOT NULL,
  connection_text TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ================================================================
-- INDEXES
-- ================================================================
CREATE INDEX idx_profiles_role             ON profiles(role);
CREATE INDEX idx_classes_teacher           ON classes(teacher_id);
CREATE INDEX idx_classes_join_code         ON classes(join_code);
CREATE INDEX idx_enrollments_class         ON class_enrollments(class_id);
CREATE INDEX idx_enrollments_student       ON class_enrollments(student_id);
CREATE INDEX idx_lessons_teacher           ON lessons(teacher_id);
CREATE INDEX idx_lessons_status            ON lessons(status);
CREATE INDEX idx_sections_lesson           ON lesson_sections(lesson_id, order_index);
CREATE INDEX idx_questions_lesson          ON quiz_questions(lesson_id);
CREATE INDEX idx_assignments_lesson        ON lesson_assignments(lesson_id);
CREATE INDEX idx_assignments_class         ON lesson_assignments(class_id);
CREATE INDEX idx_progress_student          ON student_progress(student_id);
CREATE INDEX idx_progress_lesson           ON student_progress(lesson_id);
CREATE INDEX idx_attempts_student          ON quiz_attempts(student_id, lesson_id);
CREATE INDEX idx_socratic_student_lesson   ON socratic_interactions(student_id, lesson_id);
CREATE INDEX idx_knowledge_student         ON knowledge_nodes(student_id);
CREATE INDEX idx_alerts_teacher            ON teacher_alerts(teacher_id, is_read);
CREATE INDEX idx_glossary_lesson           ON glossary_terms(lesson_id);

-- ================================================================
-- SECURITY DEFINER HELPERS
-- (Run as owner — bypasses RLS to break cross-table policy loops)
-- ================================================================

CREATE OR REPLACE FUNCTION is_teacher_of_class(p_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes WHERE id = p_class_id AND teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_enrolled_in(p_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE class_id = p_class_id AND student_id = auth.uid() AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION teacher_has_student(p_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    JOIN public.classes c ON c.id = ce.class_id
    WHERE ce.student_id = p_student_id AND c.teacher_id = auth.uid() AND ce.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION teacher_owns_lesson(p_lesson_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION student_has_lesson_access(p_lesson_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lesson_assignments la
    JOIN public.class_enrollments ce ON ce.class_id = la.class_id
    WHERE la.lesson_id = p_lesson_id AND ce.student_id = auth.uid() AND la.is_active = TRUE
  )
  OR EXISTS (
    SELECT 1 FROM public.lesson_assignments la
    WHERE la.lesson_id = p_lesson_id AND la.student_id = auth.uid() AND la.is_active = TRUE
  );
$$;

-- ================================================================
-- TRIGGERS
-- ================================================================

-- Auto-create profile when a user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'student')
  )
  ON CONFLICT (id) DO UPDATE SET
    email     = EXCLUDED.email,
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
    role      = COALESCE(profiles.role, EXCLUDED.role);
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'handle_new_user failed: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER upd_profiles  BEFORE UPDATE ON profiles        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_lessons   BEFORE UPDATE ON lessons         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_classes   BEFORE UPDATE ON classes         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER upd_knowledge BEFORE UPDATE ON knowledge_nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Increment XP helper
CREATE OR REPLACE FUNCTION increment_xp(user_id UUID, xp INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles SET total_xp = total_xp + xp WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_sections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE socratic_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_analytics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE glossary_terms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prerequisite_modules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_connections  ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "profiles: own"
  ON profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles: teacher sees students"
  ON profiles FOR SELECT USING (teacher_has_student(id));

-- CLASSES
CREATE POLICY "classes: teacher owns"
  ON classes FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "classes: any authenticated can look up"
  ON classes FOR SELECT USING (auth.uid() IS NOT NULL);

-- CLASS ENROLLMENTS
CREATE POLICY "enrollments: teacher manages"
  ON class_enrollments FOR ALL
  USING (is_teacher_of_class(class_id)) WITH CHECK (is_teacher_of_class(class_id));
CREATE POLICY "enrollments: student sees own"
  ON class_enrollments FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "enrollments: student self-enroll"
  ON class_enrollments FOR INSERT WITH CHECK (student_id = auth.uid());

-- LESSONS
CREATE POLICY "lessons: teacher owns"
  ON lessons FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "lessons: student access"
  ON lessons FOR SELECT
  USING (status = 'published' AND (teacher_id = auth.uid() OR student_has_lesson_access(id)));

-- LESSON SECTIONS
CREATE POLICY "sections: teacher owns"
  ON lesson_sections FOR ALL
  USING (teacher_owns_lesson(lesson_id)) WITH CHECK (teacher_owns_lesson(lesson_id));
CREATE POLICY "sections: student reads published"
  ON lesson_sections FOR SELECT
  USING (EXISTS (SELECT 1 FROM lessons WHERE id = lesson_sections.lesson_id AND status = 'published'));

-- QUIZ QUESTIONS
CREATE POLICY "questions: teacher owns"
  ON quiz_questions FOR ALL
  USING (teacher_owns_lesson(lesson_id)) WITH CHECK (teacher_owns_lesson(lesson_id));
CREATE POLICY "questions: student reads published"
  ON quiz_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM lessons WHERE id = quiz_questions.lesson_id AND status = 'published'));

-- LESSON ASSIGNMENTS
CREATE POLICY "assignments: teacher manages"
  ON lesson_assignments FOR ALL
  USING (assigned_by = auth.uid()) WITH CHECK (assigned_by = auth.uid());
CREATE POLICY "assignments: student sees own"
  ON lesson_assignments FOR SELECT
  USING (student_id = auth.uid() OR is_enrolled_in(class_id));

-- STUDENT PROGRESS
CREATE POLICY "progress: student owns"
  ON student_progress FOR ALL
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "progress: teacher reads"
  ON student_progress FOR SELECT USING (teacher_owns_lesson(lesson_id));

-- QUIZ ATTEMPTS
CREATE POLICY "attempts: student owns"
  ON quiz_attempts FOR ALL
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "attempts: teacher reads"
  ON quiz_attempts FOR SELECT USING (teacher_owns_lesson(lesson_id));

-- SOCRATIC INTERACTIONS
CREATE POLICY "socratic: student owns"
  ON socratic_interactions FOR ALL
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "socratic: teacher reads"
  ON socratic_interactions FOR SELECT USING (teacher_owns_lesson(lesson_id));

-- KNOWLEDGE NODES
CREATE POLICY "knowledge: student owns"
  ON knowledge_nodes FOR ALL
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "knowledge: teacher reads"
  ON knowledge_nodes FOR SELECT USING (teacher_has_student(student_id));

-- TEACHER ALERTS
CREATE POLICY "alerts: teacher owns"
  ON teacher_alerts FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- LESSON ANALYTICS
CREATE POLICY "analytics: teacher owns"
  ON lesson_analytics FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- GLOSSARY TERMS
CREATE POLICY "glossary: public read"
  ON glossary_terms FOR SELECT USING (TRUE);
CREATE POLICY "glossary: teacher manages"
  ON glossary_terms FOR ALL
  USING (teacher_owns_lesson(lesson_id)) WITH CHECK (teacher_owns_lesson(lesson_id));

-- PREREQUISITE MODULES
CREATE POLICY "prereqs: public read"
  ON prerequisite_modules FOR SELECT USING (TRUE);
CREATE POLICY "prereqs: teacher manages"
  ON prerequisite_modules FOR ALL
  USING (teacher_owns_lesson(lesson_id)) WITH CHECK (teacher_owns_lesson(lesson_id));

-- INTEREST CONNECTIONS
CREATE POLICY "interests: public read"
  ON interest_connections FOR SELECT USING (TRUE);
CREATE POLICY "interests: teacher manages"
  ON interest_connections FOR ALL
  USING (teacher_owns_lesson(lesson_id)) WITH CHECK (teacher_owns_lesson(lesson_id));

-- ================================================================
-- STORAGE BUCKETS
-- ================================================================

-- avatars — user profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
);

-- lesson-files — teacher uploads for lesson source material (PDFs, docs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-files', 'lesson-files', false,
  20971520,  -- 20 MB
  ARRAY['application/pdf','text/plain','text/markdown',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- lesson-thumbnails — cover images for lessons
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-thumbnails', 'lesson-thumbnails', true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp']
);

-- student-uploads — files students attach to responses
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-uploads', 'student-uploads', false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/plain']
);

-- ── Storage RLS policies ────────────────────────────────────────

-- avatars: anyone can read, owner can upload/delete
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- lesson-files: teacher owns their folder
CREATE POLICY "lesson-files: teacher upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lesson-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "lesson-files: teacher read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "lesson-files: teacher delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'lesson-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- lesson-thumbnails: public read, teacher upload
CREATE POLICY "lesson-thumbnails: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-thumbnails');

CREATE POLICY "lesson-thumbnails: teacher upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lesson-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "lesson-thumbnails: teacher delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'lesson-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

-- student-uploads: student owns their folder, teacher can read
CREATE POLICY "student-uploads: student upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'student-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "student-uploads: student read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "student-uploads: student delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'student-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ================================================================
-- FIX EXISTING ACCOUNTS
-- Sync role from auth metadata for any users already in the DB
-- ================================================================
UPDATE public.profiles p
SET role = COALESCE(
  (SELECT (u.raw_user_meta_data->>'role')::user_role FROM auth.users u WHERE u.id = p.id),
  'student'
);

-- ================================================================
-- DONE ✓
-- Tables:   profiles, classes, class_enrollments, lessons,
--           lesson_sections, quiz_questions, lesson_assignments,
--           student_progress, quiz_attempts, socratic_interactions,
--           knowledge_nodes, teacher_alerts, lesson_analytics,
--           glossary_terms, prerequisite_modules, interest_connections
--
-- Buckets:  avatars (public, 2MB images)
--           lesson-files (private, 20MB PDFs/docs)
--           lesson-thumbnails (public, 5MB images)
--           student-uploads (private, 10MB files)
--
-- Next steps:
--   1. Auth → Settings → disable "Confirm email" (for local dev)
--   2. Verify NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
--   3. Restart dev server: Ctrl+C → npm run dev
-- ================================================================
