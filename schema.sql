SET row_security = off;

-- ----------------------------------------------------------------------
-- 1) exams: الامتحانات
-- ----------------------------------------------------------------------
CREATE TABLE public.exams (
    id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                  text NOT NULL,
    slug                  text NOT NULL UNIQUE,
    description           text,
    stage                 text,                         -- المرحلة (اختياري، يظهر بجانب اسم الامتحان)
    duration_seconds      integer NOT NULL DEFAULT 1800, -- مدة الامتحان بالثواني
    pass_threshold        integer NOT NULL DEFAULT 50,   -- نسبة النجاح %
    is_open               boolean NOT NULL DEFAULT true, -- مفتوح / مقفول (دخول الطالب للامتحان نفسه)
    lookup_hidden         boolean NOT NULL DEFAULT false, -- إخفاء الامتحان من قائمة صفحة "الاستعلام عن النتيجة" فقط (منفصل عن فتح/قفل الامتحان)
    result_visibility     text NOT NULL DEFAULT 'immediate' CHECK (result_visibility IN ('immediate','lookup_only')), -- إظهار النتيجة فور التسليم أو بالاستعلام فقط
    closed_message        text,                          -- رسالة مخصصة تظهر لو الامتحان مقفول (اختياري، فيه نص افتراضي لو فاضي)
    not_found_announcement text,                         -- الإعلان اللي بيظهر في صفحة الاستعلام لو الرقم مش موجود لهذا الامتحان
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- 2) questions: أسئلة كل امتحان
-- ----------------------------------------------------------------------
CREATE TABLE public.questions (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_id        integer NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    order_index    integer NOT NULL DEFAULT 0,      -- ترتيب ظهور السؤال
    type           text NOT NULL CHECK (type IN ('true_false','multiple_choice','fill_in_the_blank','essay')),
    question       text NOT NULL,                   -- نص السؤال (فراغات إكمال تُكتب بثلاث نقاط متتالية "...")
    options        jsonb,                           -- صح/غلط أو اختيار من متعدد: مصفوفة نصوص. غير مستخدم لباقي الأنواع
    correct_answer jsonb,                            -- صح/غلط أو اختيار: نص. إكمال: مصفوفة إجابات مقبولة لكل فراغ. مقالي: null
    score          numeric(6,2) NOT NULL DEFAULT 1,  -- درجة السؤال (تقبل كسور عشرية: 0.5, 0.25, 1.5 ...)
    blank_scores   numeric(6,2)[],                   -- لإكمال الفراغ فقط: درجة كل فراغ على حدة (تقبل كسور عشرية)
    images         jsonb NOT NULL DEFAULT '[]'::jsonb, -- صور السؤال (اختياري): مصفوفة صور (Data URLs) بترتيب ظهورها 1..N
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_exam ON public.questions USING btree (exam_id, order_index);

-- ----------------------------------------------------------------------
-- 3) attempts: محاولات الطلاب
-- ----------------------------------------------------------------------
CREATE TABLE public.attempts (
    id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_id             integer NOT NULL REFERENCES public.exams(id),
    user_name           text NOT NULL,
    user_phone          text NOT NULL,
    start_time          timestamp without time zone DEFAULT now() NOT NULL,
    exam_started_at     timestamp without time zone,
    end_time            timestamp without time zone,
    status              text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','submitted','graded'])),
    total_score         numeric(6,2) DEFAULT 0,
    total_possible      numeric(6,2) DEFAULT 0,
    percentage          numeric(5,2) DEFAULT 0.00,
    grade_text          text,
    pass_fail           text CHECK (pass_fail = ANY (ARRAY['pass','fail'])),
    certificate_issued  boolean DEFAULT false,
    created_at          timestamp without time zone DEFAULT now()
);

CREATE INDEX idx_exam_phone ON public.attempts USING btree (exam_id, user_phone);
CREATE INDEX idx_attempts_status ON public.attempts USING btree (status);

-- ----------------------------------------------------------------------
-- 4) answers: إجابات كل سؤال داخل كل محاولة
-- ----------------------------------------------------------------------
CREATE TABLE public.answers (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id     integer NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
    question_id    integer REFERENCES public.questions(id) ON DELETE SET NULL,
    question_index integer NOT NULL,
    question_type  text NOT NULL,
    user_answer    text,
    correct_answer text,
    auto_graded    boolean DEFAULT true,
    is_correct     boolean DEFAULT false,
    score          numeric(6,2) DEFAULT 0,
    max_score      numeric(6,2) DEFAULT 1,
    graded_by      text NOT NULL DEFAULT 'auto' CHECK (graded_by = ANY (ARRAY['auto','admin'])),
    UNIQUE (attempt_id, question_index)
);

CREATE INDEX idx_answers_attempt ON public.answers USING btree (attempt_id);

-- ----------------------------------------------------------------------
-- 5) settings: إعدادات عامة (مفتاح/قيمة)
--    تُستخدم لباسورد الأدمن، واسم/شعار الموقع، وأي إعداد إضافي مستقبلاً
-- ----------------------------------------------------------------------
CREATE TABLE public.settings (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    setting_key   text UNIQUE,
    setting_value text
);

-- ======================================================================
-- Row Level Security + Policies
-- ملاحظة أمان مهمة: زي التصميم الأصلي، الموقع بيتكلم مع Supabase مباشرة
-- من المتصفح بمفتاح anon، وباسورد الأدمن هو حماية على مستوى الواجهة فقط
-- (مش حماية حقيقية على قاعدة البيانات). عشان كده الصلاحيات هنا مفتوحة
-- (USING true) لكل الجداول عشان لوحة الأدمن تقدر تشتغل من المتصفح.
-- ======================================================================

ALTER TABLE public.exams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings            ENABLE ROW LEVEL SECURITY;

-- exams
CREATE POLICY "public read exams"   ON public.exams FOR SELECT USING (true);
CREATE POLICY "public insert exams" ON public.exams FOR INSERT WITH CHECK (true);
CREATE POLICY "public update exams" ON public.exams FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete exams" ON public.exams FOR DELETE USING (true);

-- questions
CREATE POLICY "public read questions"   ON public.questions FOR SELECT USING (true);
CREATE POLICY "public insert questions" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "public update questions" ON public.questions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete questions" ON public.questions FOR DELETE USING (true);

-- attempts
CREATE POLICY "public read attempts"   ON public.attempts FOR SELECT USING (true);
CREATE POLICY "public insert attempts" ON public.attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "public update attempts" ON public.attempts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete attempts" ON public.attempts FOR DELETE USING (true);

-- answers
CREATE POLICY "public read answers"   ON public.answers FOR SELECT USING (true);
CREATE POLICY "public insert answers" ON public.answers FOR INSERT WITH CHECK (true);
CREATE POLICY "public update answers" ON public.answers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete answers" ON public.answers FOR DELETE USING (true);

-- settings
CREATE POLICY "public read settings"   ON public.settings FOR SELECT USING (true);
CREATE POLICY "public insert settings" ON public.settings FOR INSERT WITH CHECK (true);
CREATE POLICY "public update settings" ON public.settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete settings" ON public.settings FOR DELETE USING (true);

-- ======================================================================
-- Grants (لازمة عشان PostgREST/الـ API يقدر يوصل للجداول)
-- ======================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ======================================================================
-- ترقية لقاعدة بيانات شغّلت schema.sql قديم قبل ده (اختياري ومهم جداً لو
-- كانت قاعدة بياناتك شغالة بالفعل بالنسخة القديمة اللي فيها كنائس/بكدجات/طباعة):
-- شغّل الأسطر دي لوحدها في SQL Editor (بعد ما تاخد نسخة احتياطية لو حابب):
--
-- ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
-- ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS lookup_hidden boolean NOT NULL DEFAULT false;
--
-- -- إزالة كل ما يخص الكنائس والبكدجات/الأنشطة والطباعة نهائياً (لو موجودة من نسخة قديمة):
-- ALTER TABLE public.attempts DROP COLUMN IF EXISTS user_church;
-- ALTER TABLE public.attempts DROP COLUMN IF EXISTS packages_confirmed;
-- DROP TABLE IF EXISTS public.attempt_packages;
-- DROP TABLE IF EXISTS public.package_items;
-- DROP TABLE IF EXISTS public.package_categories;
-- DROP TABLE IF EXISTS public.exam_churches;
-- DROP TABLE IF EXISTS public.churches;
-- ======================================================================

-- ======================================================================
-- باسورد لوحة الأدمن (محفوظ في قاعدة البيانات نفسها، لا يوجد في أي كود JS)
-- تقدر تغيّره في أي وقت من أيقونة "الترس ⚙️" في أعلى لوحة التحكم، أو بتنفيذ:
-- UPDATE public.settings SET setting_value = 'باسورد-جديد' WHERE setting_key = 'admin_password';
-- ======================================================================
INSERT INTO public.settings (setting_key, setting_value)
VALUES ('admin_password', 'Miketalaat213510##')
ON CONFLICT (setting_key) DO NOTHING;

-- ======================================================================
-- اسم وشعار الموقع (يظهر للطالب في كل شاشات الامتحان) - تقدر تتحكم فيهم من
-- أيقونة "الترس ⚙️" في أعلى لوحة التحكم. فاضيين افتراضياً (بدون اسم/شعار).
-- ======================================================================
INSERT INTO public.settings (setting_key, setting_value)
VALUES ('site_name', '')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.settings (setting_key, setting_value)
VALUES ('site_logo', '')
ON CONFLICT (setting_key) DO NOTHING;

-- ======================================================================
-- بيانات تجريبية اختيارية (احذف هذا الجزء لو مش عايزه)
-- ======================================================================

-- امتحان تجريبي فاضي تقدر تعدل عليه من لوحة الأدمن مباشرة
-- INSERT INTO public.exams (name, slug, duration_seconds, pass_threshold, is_open)
-- VALUES ('امتحان تجريبي', 'demo-exam', 1800, 50, true);
