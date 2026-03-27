-- 032: Coach multi-group assignments
-- Allows a coach to be assigned to multiple groupes (classes or full promos)

-- ─── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_groupe_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  groupe_id  uuid NOT NULL REFERENCES groupes(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, groupe_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_cga_coach  ON coach_groupe_assignments(coach_id);
CREATE INDEX IF NOT EXISTS idx_cga_groupe ON coach_groupe_assignments(groupe_id);

-- ─── Migrate existing data ─────────────────────────────────────────────────
-- Insert a row for every coach who currently has a groupe_id set on their profile
INSERT INTO coach_groupe_assignments (coach_id, groupe_id)
SELECT id, groupe_id
FROM profiles
WHERE role = 'coach' AND groupe_id IS NOT NULL
ON CONFLICT (coach_id, groupe_id) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE coach_groupe_assignments ENABLE ROW LEVEL SECURITY;

-- Admins/superadmins: full access
CREATE POLICY "admin_full_access_cga" ON coach_groupe_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Coaches: read their own assignments
CREATE POLICY "coach_read_own_cga" ON coach_groupe_assignments
  FOR SELECT
  USING (coach_id = auth.uid());
