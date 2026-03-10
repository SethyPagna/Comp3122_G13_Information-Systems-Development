-- ============================================================
-- ATLAS PATCH: Fix RLS infinite recursion + portal redirect
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- The root cause of all 500 errors:
-- 'classes' RLS checks 'class_enrollments' → 'class_enrollments' RLS checks 'classes'
-- This infinite recursion causes PostgREST to return 500 on any query
-- touching either table. Fix: use SECURITY DEFINER helper functions that
-- bypass RLS, breaking the cycle.

-- ── Step 1: Helper functions (SECURITY DEFINER bypasses RLS) ─────────────────

CREATE OR REPLACE FUNCTION auth_is_teacher_of_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION auth_is_enrolled_in_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE class_id = p_class_id AND student_id = auth.uid() AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION auth_teaches_any_class_with_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    JOIN public.classes c ON c.id = ce.class_id
    WHERE ce.student_id = p_student_id AND c.teacher_id = auth.uid()
  );
$$;

-- ── Step 2: Re-create CLASSES policies (drop old recursive ones) ──────────────

DROP POLICY IF EXISTS "Teachers manage own classes"     ON classes;
DROP POLICY IF EXISTS "Students view enrolled classes"  ON classes;

CREATE POLICY "Teachers manage own classes"
  ON classes FOR ALL
  USING (teacher_id = auth.uid());

CREATE POLICY "Students view enrolled classes"
  ON classes FOR SELECT
  USING (auth_is_enrolled_in_class(id));

-- ── Step 3: Re-create CLASS_ENROLLMENTS policies ──────────────────────────────

DROP POLICY IF EXISTS "Teachers manage enrollments"    ON class_enrollments;
DROP POLICY IF EXISTS "Students view own enrollments"  ON class_enrollments;
DROP POLICY IF EXISTS "Students self-enroll"           ON class_enrollments;

CREATE POLICY "Teachers manage enrollments"
  ON class_enrollments FOR ALL
  USING (auth_is_teacher_of_class(class_id));

CREATE POLICY "Students view own enrollments"
  ON class_enrollments FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students self-enroll"
  ON class_enrollments FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- ── Step 4: Re-create PROFILES policies (remove recursive teacher policy) ─────

DROP POLICY IF EXISTS "Teachers can view student profiles"  ON profiles;
DROP POLICY IF EXISTS "Users can view own profile"          ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"        ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"        ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Teachers can view profiles of their students (uses helper to avoid recursion)
CREATE POLICY "Teachers can view student profiles"
  ON profiles FOR SELECT
  USING (auth_teaches_any_class_with_student(id));

-- ── Step 5: Re-create LESSONS RLS (allow teachers to query their own) ─────────

DROP POLICY IF EXISTS "Teachers manage own lessons"              ON lessons;
DROP POLICY IF EXISTS "Students view published assigned lessons" ON lessons;

CREATE POLICY "Teachers manage own lessons"
  ON lessons FOR ALL
  USING (teacher_id = auth.uid());

CREATE POLICY "Students view published assigned lessons"
  ON lessons FOR SELECT
  USING (
    status = 'published' AND (
      teacher_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM lesson_assignments la
        JOIN class_enrollments ce ON ce.class_id = la.class_id
        WHERE la.lesson_id = lessons.id
          AND ce.student_id = auth.uid()
          AND la.is_active = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM lesson_assignments la
        WHERE la.lesson_id = lessons.id
          AND la.student_id = auth.uid()
          AND la.is_active = TRUE
      )
    )
  );

-- ── Step 6: Ensure the handle_new_user trigger stores role correctly ───────────
-- Also fixes the "login goes to wrong portal" issue — if profile.role was NULL
-- or missing, the trigger now always stores it from signup metadata.

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
  ON CONFLICT (id) DO UPDATE
    SET
      email     = EXCLUDED.email,
      full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
      role      = COALESCE(profiles.role, EXCLUDED.role);
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'handle_new_user failed: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Step 7: Fix any existing profiles that have NULL role ─────────────────────
-- (catches accounts created before this patch was applied)

UPDATE profiles
SET role = COALESCE(
  (
    SELECT (raw_user_meta_data->>'role')::user_role
    FROM auth.users
    WHERE auth.users.id = profiles.id
  ),
  'student'
)
WHERE role IS NULL;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- After running this script:
-- 1. The 500 errors on /rest/v1/lessons, /classes, /profiles will stop
-- 2. Teachers will be correctly redirected to /teacher/dashboard on login
-- 3. Analytics will show real data (no more mock students)
-- 4. Lesson creation finalize will be more robust
