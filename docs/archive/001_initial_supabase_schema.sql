-- ==============================================================================
-- SATARK — SMART CLASSROOM INTEGRITY & FOCUS MANAGEMENT PLATFORM
-- Supabase PostgreSQL Migration 001: Initial Core Schema & RLS Policies
-- Target Database: Supabase Managed PostgreSQL
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. PUBLIC PROFILES (Maps 1:1 with auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index on role & email
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Trigger to handle auth.users signup -> public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role VARCHAR(20) := 'student';
    user_name VARCHAR(120) := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
BEGIN
    -- Prevent client-side spoofing: Only server-side or invited teachers can be 'teacher'
    IF new.raw_user_meta_data->>'role' = 'teacher' AND new.raw_user_meta_data->>'teacher_verified' = 'true' THEN
        assigned_role := 'teacher';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, is_active, created_at, updated_at)
    VALUES (new.id, new.email, user_name, assigned_role, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger cleanly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 3. CORE BUSINESS TABLES
-- ==============================================================================

-- Student Profiles (Academic major/semester details)
CREATE TABLE IF NOT EXISTS public.student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id_number VARCHAR(50) NOT NULL UNIQUE,
    branch_or_major VARCHAR(100),
    semester INTEGER,
    avatar_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Classrooms
CREATE TABLE IF NOT EXISTS public.classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    title VARCHAR(150) NOT NULL,
    subject_code VARCHAR(30),
    description TEXT,
    join_code VARCHAR(8) NOT NULL UNIQUE,
    is_archived BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_join_code ON public.classrooms(join_code);

-- Classroom Enrollments
CREATE TABLE IF NOT EXISTS public.classroom_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_classroom_student UNIQUE (classroom_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_classroom ON public.classroom_enrollments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.classroom_enrollments(student_id);

-- Hardware Devices (Desktop Agent)
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hardware_uuid VARCHAR(100) NOT NULL UNIQUE,
    hostname VARCHAR(120),
    os_type VARCHAR(20) NOT NULL,
    os_version VARCHAR(50),
    agent_version VARCHAR(20) NOT NULL,
    owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_heartbeat_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'offline' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_hardware_uuid ON public.devices(hardware_uuid);
CREATE INDEX IF NOT EXISTS idx_devices_owner ON public.devices(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);

-- Device Sessions (Exam or Focus pairing)
CREATE TABLE IF NOT EXISTS public.device_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    session_id VARCHAR(64) NOT NULL,
    mode VARCHAR(10) NOT NULL CHECK (mode IN ('exam', 'focus')),
    connected_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    disconnected_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dev_sessions_device ON public.device_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_dev_sessions_student ON public.device_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_dev_sessions_session ON public.device_sessions(session_id);

-- Exam Sessions
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE RESTRICT,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    exam_code VARCHAR(10) NOT NULL UNIQUE,
    duration_minutes INTEGER DEFAULT 60 NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'ended')),
    policy_config JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_classroom ON public.exam_sessions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON public.exam_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exam_sessions(status);
CREATE INDEX IF NOT EXISTS idx_exams_code ON public.exam_sessions(exam_code);

-- Focus Sessions
CREATE TABLE IF NOT EXISTS public.focus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
    goal_title VARCHAR(200) NOT NULL,
    planned_duration_minutes INTEGER DEFAULT 25 NOT NULL,
    actual_focus_seconds INTEGER DEFAULT 0 NOT NULL,
    actual_break_seconds INTEGER DEFAULT 0 NOT NULL,
    status VARCHAR(20) DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
    started_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    ended_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_focus_student ON public.focus_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_focus_classroom ON public.focus_sessions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_focus_status ON public.focus_sessions(status);

-- Activity Events
CREATE TABLE IF NOT EXISTS public.activity_events (
    id UUID PRIMARY KEY, -- Idempotent UUIDv4 from agent or web client
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
    session_id VARCHAR(64) NOT NULL,
    mode VARCHAR(10) NOT NULL,
    event_category VARCHAR(30) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    source VARCHAR(20) DEFAULT 'agent' NOT NULL,
    severity VARCHAR(20) DEFAULT 'low' NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON public.activity_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON public.activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_student ON public.activity_events(student_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.activity_events(event_type);

-- Alerts
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    primary_event_id UUID REFERENCES public.activity_events(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    evidence_summary JSONB DEFAULT '{}'::jsonb,
    is_acknowledged BOOLEAN DEFAULT FALSE NOT NULL,
    acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    proctor_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_session ON public.alerts(session_id);
CREATE INDEX IF NOT EXISTS idx_alerts_student ON public.alerts(student_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON public.alerts(is_acknowledged);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(30) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(is_read);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    target_resource VARCHAR(80),
    ip_address VARCHAR(45),
    details JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_user_id);

-- Exam Questions
CREATE TABLE IF NOT EXISTS public.exam_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of 4 answer options
    correct_option_index INTEGER NOT NULL CHECK (correct_option_index BETWEEN 0 AND 3),
    marks INTEGER DEFAULT 1 NOT NULL,
    order_num INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON public.exam_questions(exam_id);

-- Exam Submissions
CREATE TABLE IF NOT EXISTS public.exam_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0 NOT NULL,
    total_marks INTEGER DEFAULT 0 NOT NULL,
    percentage INTEGER DEFAULT 0 NOT NULL,
    status VARCHAR(20) DEFAULT 'submitted' NOT NULL CHECK (status IN ('submitted', 'graded')),
    submitted_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_exam_student_submission UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON public.exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.exam_submissions(student_id);

-- Student Answers
CREATE TABLE IF NOT EXISTS public.student_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES public.exam_submissions(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    selected_option_index INTEGER CHECK (selected_option_index BETWEEN 0 AND 3),
    is_correct BOOLEAN,
    marks_awarded INTEGER DEFAULT 0 NOT NULL,
    answered_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_exam_student_question_answer UNIQUE (exam_id, student_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON public.student_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_answers_student ON public.student_answers(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON public.student_answers(question_id);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current auth user is teacher
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'teacher'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- PROFILES RLS ---
DROP POLICY IF EXISTS "Users can view self profile" ON public.profiles;
CREATE POLICY "Users can view self profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.is_teacher());

DROP POLICY IF EXISTS "Users can update self profile details" ON public.profiles;
CREATE POLICY "Users can update self profile details" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- --- CLASSROOMS RLS ---
DROP POLICY IF EXISTS "Teachers can manage own classrooms" ON public.classrooms;
CREATE POLICY "Teachers can manage own classrooms" ON public.classrooms
    FOR ALL USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Enrolled students can view classrooms" ON public.classrooms;
CREATE POLICY "Enrolled students can view classrooms" ON public.classrooms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classroom_enrollments
            WHERE classroom_enrollments.classroom_id = classrooms.id
            AND classroom_enrollments.student_id = auth.uid()
        )
    );

-- --- ENROLLMENTS RLS ---
DROP POLICY IF EXISTS "Students can view and create own enrollment" ON public.classroom_enrollments;
CREATE POLICY "Students can view and create own enrollment" ON public.classroom_enrollments
    FOR ALL USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can manage enrollments in owned classrooms" ON public.classroom_enrollments;
CREATE POLICY "Teachers can manage enrollments in owned classrooms" ON public.classroom_enrollments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.classrooms
            WHERE classrooms.id = classroom_enrollments.classroom_id
            AND classrooms.teacher_id = auth.uid()
        )
    );

-- --- EXAM SESSIONS RLS ---
DROP POLICY IF EXISTS "Teachers can manage owned exams" ON public.exam_sessions;
CREATE POLICY "Teachers can manage owned exams" ON public.exam_sessions
    FOR ALL USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Students can view scheduled or active exams in enrolled classrooms" ON public.exam_sessions;
CREATE POLICY "Students can view scheduled or active exams in enrolled classrooms" ON public.exam_sessions
    FOR SELECT USING (
        status IN ('scheduled', 'active', 'paused', 'ended')
        AND EXISTS (
            SELECT 1 FROM public.classroom_enrollments
            WHERE classroom_enrollments.classroom_id = exam_sessions.classroom_id
            AND classroom_enrollments.student_id = auth.uid()
        )
    );

-- --- EXAM QUESTIONS RLS ---
DROP POLICY IF EXISTS "Teachers can manage questions for owned exams" ON public.exam_questions;
CREATE POLICY "Teachers can manage questions for owned exams" ON public.exam_questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            WHERE exam_sessions.id = exam_questions.exam_id
            AND exam_sessions.teacher_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Enrolled students can view questions during active exam" ON public.exam_questions;
CREATE POLICY "Enrolled students can view questions during active exam" ON public.exam_questions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            JOIN public.classroom_enrollments ON classroom_enrollments.classroom_id = exam_sessions.classroom_id
            WHERE exam_sessions.id = exam_questions.exam_id
            AND classroom_enrollments.student_id = auth.uid()
            AND exam_sessions.status IN ('active', 'ended')
        )
    );

-- --- EXAM SUBMISSIONS RLS ---
DROP POLICY IF EXISTS "Students can manage own submissions" ON public.exam_submissions;
CREATE POLICY "Students can manage own submissions" ON public.exam_submissions
    FOR ALL USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can view submissions for owned exams" ON public.exam_submissions;
CREATE POLICY "Teachers can view submissions for owned exams" ON public.exam_submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            WHERE exam_sessions.id = exam_submissions.exam_id
            AND exam_sessions.teacher_id = auth.uid()
        )
    );

-- --- STUDENT ANSWERS RLS ---
DROP POLICY IF EXISTS "Students can manage own answers" ON public.student_answers;
CREATE POLICY "Students can manage own answers" ON public.student_answers
    FOR ALL USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can view answers for owned exams" ON public.student_answers;
CREATE POLICY "Teachers can view answers for owned exams" ON public.student_answers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            WHERE exam_sessions.id = student_answers.exam_id
            AND exam_sessions.teacher_id = auth.uid()
        )
    );

-- --- DEVICES RLS ---
DROP POLICY IF EXISTS "Students can manage own devices" ON public.devices;
CREATE POLICY "Students can manage own devices" ON public.devices
    FOR ALL USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Teachers can view devices in their classrooms" ON public.devices;
CREATE POLICY "Teachers can view devices in their classrooms" ON public.devices
    FOR SELECT USING (public.is_teacher());

-- --- FOCUS SESSIONS RLS ---
DROP POLICY IF EXISTS "Students can manage own focus sessions" ON public.focus_sessions;
CREATE POLICY "Students can manage own focus sessions" ON public.focus_sessions
    FOR ALL USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can view focus sessions in owned classrooms" ON public.focus_sessions;
CREATE POLICY "Teachers can view focus sessions in owned classrooms" ON public.focus_sessions
    FOR SELECT USING (
        public.is_teacher() AND (
            classroom_id IS NULL OR EXISTS (
                SELECT 1 FROM public.classrooms
                WHERE classrooms.id = focus_sessions.classroom_id
                AND classrooms.teacher_id = auth.uid()
            )
        )
    );

-- --- ACTIVITY EVENTS & ALERTS RLS ---
DROP POLICY IF EXISTS "Students can view own events" ON public.activity_events;
CREATE POLICY "Students can view own events" ON public.activity_events
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can view events for their sessions" ON public.activity_events;
CREATE POLICY "Teachers can view events for their sessions" ON public.activity_events
    FOR ALL USING (public.is_teacher());

DROP POLICY IF EXISTS "Students can view own alerts" ON public.alerts;
CREATE POLICY "Students can view own alerts" ON public.alerts
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can manage alerts for their exams" ON public.alerts;
CREATE POLICY "Teachers can manage alerts for their exams" ON public.alerts
    FOR ALL USING (public.is_teacher());

-- --- NOTIFICATIONS RLS ---
DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notifications;
CREATE POLICY "Users can manage own notifications" ON public.notifications
    FOR ALL USING (auth.uid() = user_id);

-- --- AUDIT LOGS RLS ---
DROP POLICY IF EXISTS "Teachers can view audit logs" ON public.audit_logs;
CREATE POLICY "Teachers can view audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_teacher());

-- ==============================================================================
-- End of Migration 001
-- ==============================================================================

