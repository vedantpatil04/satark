-- ==============================================================================
-- SATARK — SMART CLASSROOM INTEGRITY & FOCUS MANAGEMENT PLATFORM
-- Supabase PostgreSQL Migration 002: Question Bank, Exam Snapshots & WebRTC Media Monitoring
-- ==============================================================================

-- 1. Question Banks
CREATE TABLE IF NOT EXISTS public.question_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(100),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_banks_teacher ON public.question_banks(teacher_id);
CREATE INDEX IF NOT EXISTS idx_question_banks_subject ON public.question_banks(subject);

-- 2. Question Bank Items
CREATE TABLE IF NOT EXISTS public.question_bank_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
    external_id VARCHAR(50),
    question_type VARCHAR(20) DEFAULT 'mcq' NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_option_index INTEGER NOT NULL,
    marks INTEGER DEFAULT 1 NOT NULL,
    negative_marks INTEGER DEFAULT 0 NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'medium' NOT NULL,
    topic VARCHAR(100),
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_items_bank ON public.question_bank_items(bank_id);
CREATE INDEX IF NOT EXISTS idx_bank_items_external ON public.question_bank_items(external_id);

-- 3. Exam Question Snapshots (Immutable archive of questions for an exam)
CREATE TABLE IF NOT EXISTS public.exam_question_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    snapshot_data JSONB NOT NULL,
    total_questions INTEGER NOT NULL,
    total_marks INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_exam ON public.exam_question_snapshots(exam_id);

-- 4. Exam Media Sessions (LiveKit Room Binding)
CREATE TABLE IF NOT EXISTS public.exam_media_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL UNIQUE REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    room_name VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_media_sessions_exam ON public.exam_media_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_media_sessions_room ON public.exam_media_sessions(room_name);

-- 5. Media Share Requests (Screen Sharing Consent Protocol)
CREATE TABLE IF NOT EXISTS public.media_share_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    requested_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_media_requests_exam ON public.media_share_requests(exam_id);
CREATE INDEX IF NOT EXISTS idx_media_requests_student ON public.media_share_requests(student_id);

-- 6. Media Session Participants (Active monitoring telemetry)
CREATE TABLE IF NOT EXISTS public.media_session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    is_sharing_screen BOOLEAN DEFAULT FALSE NOT NULL,
    is_camera_on BOOLEAN DEFAULT FALSE NOT NULL,
    connection_status VARCHAR(20) DEFAULT 'connected' NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    left_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_participants_exam ON public.media_session_participants(exam_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON public.media_session_participants(user_id);

-- Enable RLS
ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_question_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_media_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_share_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_session_participants ENABLE ROW LEVEL SECURITY;

-- Question Banks RLS
DROP POLICY IF EXISTS "Teachers can manage own question banks" ON public.question_banks;
CREATE POLICY "Teachers can manage own question banks" ON public.question_banks
    FOR ALL USING (auth.uid() = teacher_id);

-- Question Bank Items RLS
DROP POLICY IF EXISTS "Teachers can manage own bank items" ON public.question_bank_items;
CREATE POLICY "Teachers can manage own bank items" ON public.question_bank_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.question_banks
            WHERE question_banks.id = question_bank_items.bank_id
            AND question_banks.teacher_id = auth.uid()
        )
    );

-- Snapshots RLS
DROP POLICY IF EXISTS "Teachers can manage exam snapshots" ON public.exam_question_snapshots;
CREATE POLICY "Teachers can manage exam snapshots" ON public.exam_question_snapshots
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            WHERE exam_sessions.id = exam_question_snapshots.exam_id
            AND exam_sessions.teacher_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Students can view exam snapshots for enrolled exams" ON public.exam_question_snapshots;
CREATE POLICY "Students can view exam snapshots for enrolled exams" ON public.exam_question_snapshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            JOIN public.classroom_enrollments ON classroom_enrollments.classroom_id = exam_sessions.classroom_id
            WHERE exam_sessions.id = exam_question_snapshots.exam_id
            AND classroom_enrollments.student_id = auth.uid()
            AND exam_sessions.status IN ('active', 'ended')
        )
    );

-- Media Sessions RLS
DROP POLICY IF EXISTS "Teachers can manage owned exam media sessions" ON public.exam_media_sessions;
CREATE POLICY "Teachers can manage owned exam media sessions" ON public.exam_media_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            WHERE exam_sessions.id = exam_media_sessions.exam_id
            AND exam_sessions.teacher_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Students can view media sessions for enrolled active exams" ON public.exam_media_sessions;
CREATE POLICY "Students can view media sessions for enrolled active exams" ON public.exam_media_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            JOIN public.classroom_enrollments ON classroom_enrollments.classroom_id = exam_sessions.classroom_id
            WHERE exam_sessions.id = exam_media_sessions.exam_id
            AND classroom_enrollments.student_id = auth.uid()
            AND exam_sessions.status = 'active'
        )
    );

-- Media Requests RLS
DROP POLICY IF EXISTS "Teachers can manage share requests" ON public.media_share_requests;
CREATE POLICY "Teachers can manage share requests" ON public.media_share_requests
    FOR ALL USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Students can manage own share requests" ON public.media_share_requests;
CREATE POLICY "Students can manage own share requests" ON public.media_share_requests
    FOR ALL USING (auth.uid() = student_id);

-- Media Participants RLS
DROP POLICY IF EXISTS "Teachers can manage participants in owned exams" ON public.media_session_participants;
CREATE POLICY "Teachers can manage participants in owned exams" ON public.media_session_participants
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.exam_sessions
            WHERE exam_sessions.id = media_session_participants.exam_id
            AND exam_sessions.teacher_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Students can manage own participant record" ON public.media_session_participants;
CREATE POLICY "Students can manage own participant record" ON public.media_session_participants
    FOR ALL USING (auth.uid() = user_id);

