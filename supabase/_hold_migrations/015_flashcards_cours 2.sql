-- =============================================
-- Add cours_id to flashcard_decks
-- Allows decks to be attached to a specific course/chapter
-- =============================================

ALTER TABLE flashcard_decks ADD COLUMN IF NOT EXISTS cours_id UUID REFERENCES cours(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_cours ON flashcard_decks(cours_id);
