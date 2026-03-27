-- Migration 029: Support for short_answer and redaction question types

-- ─── 1. Questions table: allow new types ─────────────────────────────────────

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('qcm_unique', 'qcm_multiple', 'short_answer', 'redaction'));

-- correct_answer for short_answer questions
ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer TEXT;

-- ─── 2. User text answers (short_answer + redaction) ─────────────────────────

CREATE TABLE IF NOT EXISTS user_text_answers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id    UUID NOT NULL REFERENCES serie_attempts(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text   TEXT,
  is_correct    BOOLEAN,        -- NULL for redaction until manually graded
  time_spent_s  INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

ALTER TABLE user_text_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_text_answers" ON user_text_answers
  FOR INSERT WITH CHECK (
    attempt_id IN (SELECT id FROM serie_attempts WHERE user_id = auth.uid())
  );
CREATE POLICY "users_read_own_text_answers" ON user_text_answers
  FOR SELECT USING (
    attempt_id IN (SELECT id FROM serie_attempts WHERE user_id = auth.uid())
  );
CREATE POLICY "admins_read_all_text_answers" ON user_text_answers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── 3. Manual corrections for redaction ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS redaction_corrections (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_text_answer_id   UUID NOT NULL REFERENCES user_text_answers(id) ON DELETE CASCADE,
  corrected_by          UUID REFERENCES profiles(id),
  score_percent         NUMERIC(5,2) CHECK (score_percent >= 0 AND score_percent <= 100),
  comment               TEXT,
  corrected_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_text_answer_id)
);

ALTER TABLE redaction_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_corrections" ON redaction_corrections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "users_read_own_corrections" ON redaction_corrections
  FOR SELECT USING (
    user_text_answer_id IN (
      SELECT uta.id FROM user_text_answers uta
      JOIN serie_attempts sa ON sa.id = uta.attempt_id
      WHERE sa.user_id = auth.uid()
    )
  );

-- ─── 4. Réponse courte config per university ──────────────────────────────────

CREATE TABLE IF NOT EXISTS university_short_answer_config (
  university_dossier_id TEXT NOT NULL PRIMARY KEY,
  points_correct        NUMERIC DEFAULT 1   NOT NULL,
  points_incorrect      NUMERIC DEFAULT 0   NOT NULL,
  case_sensitive        BOOLEAN DEFAULT false NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ─── 5. Rédaction config per university ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS university_redaction_config (
  university_dossier_id TEXT NOT NULL PRIMARY KEY,
  max_points            NUMERIC DEFAULT 20  NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now()
);
