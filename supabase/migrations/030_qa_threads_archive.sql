-- Archive « soft » des conversations Q&A + suppression par les profs sur leurs matières

ALTER TABLE qa_threads
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN qa_threads.archived_at IS 'Renseigné quand un admin/prof archive : masqué par défaut pour l’élève et dans la liste admin.';

CREATE INDEX IF NOT EXISTS idx_qa_threads_archived_at ON qa_threads(archived_at);

-- Les élèves ne voient plus les fils archivés
DROP POLICY IF EXISTS "Students see own threads" ON qa_threads;
CREATE POLICY "Students see own threads" ON qa_threads
  FOR SELECT USING (auth.uid() = student_id AND archived_at IS NULL);

-- Professeurs : suppression des fils rattachés à une de leurs matières
DROP POLICY IF EXISTS "Profs delete threads for their matieres" ON qa_threads;
CREATE POLICY "Profs delete threads for their matieres" ON qa_threads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM prof_matieres pm
      WHERE pm.prof_id = auth.uid() AND pm.matiere_id = qa_threads.matiere_id
    )
  );
