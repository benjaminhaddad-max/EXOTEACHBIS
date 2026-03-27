-- Add groupe_ids to examens_series
-- NULL means the épreuve applies to ALL classes of the exam
-- Non-null array means only the specified groupes are targeted

ALTER TABLE examens_series
  ADD COLUMN IF NOT EXISTS groupe_ids TEXT[];
