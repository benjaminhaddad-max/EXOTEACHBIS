-- Allow admins to read all user_answers (needed for student detail view in exam results)
CREATE POLICY "Admins read all user_answers"
  ON public.user_answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'prof')));
