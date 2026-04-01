-- Add sub_offer to the dossier_type CHECK constraint
ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS dossiers_dossier_type_check;
ALTER TABLE dossiers ADD CONSTRAINT dossiers_dossier_type_check
  CHECK (dossier_type = ANY (ARRAY['generic','offer','sub_offer','university','semester','option','period','module','subject']));
