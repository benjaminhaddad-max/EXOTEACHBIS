-- Add explanation_image_url to questions for correction images (screenshots of solutions)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS explanation_image_url TEXT;
