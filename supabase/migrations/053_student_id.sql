-- Add student_id column (unique 6-digit number for students)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_id TEXT UNIQUE;

-- Function to generate a unique 6-digit student ID
CREATE OR REPLACE FUNCTION generate_student_id()
RETURNS TEXT AS $$
DECLARE
  new_id TEXT;
  done BOOLEAN := FALSE;
BEGIN
  WHILE NOT done LOOP
    -- Generate random 6-digit number (100000-999999)
    new_id := LPAD(FLOOR(100000 + RANDOM() * 900000)::INT::TEXT, 6, '0');
    -- Check uniqueness
    done := NOT EXISTS (SELECT 1 FROM profiles WHERE student_id = new_id);
  END LOOP;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-assign student_id to ALL profiles on INSERT or UPDATE
CREATE OR REPLACE FUNCTION assign_student_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.student_id IS NULL OR NEW.student_id = '' THEN
    NEW.student_id := generate_student_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_student_id ON profiles;
CREATE TRIGGER trg_assign_student_id
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_student_id();

-- Backfill: assign student_id to all existing profiles who don't have one
UPDATE profiles
SET student_id = generate_student_id()
WHERE student_id IS NULL OR student_id = '';
