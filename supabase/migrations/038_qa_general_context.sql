-- Add 'general' context_type for student-to-admin general questions
alter table public.qa_threads drop constraint if exists qa_threads_context_type_check;
alter table public.qa_threads add constraint qa_threads_context_type_check
  check (context_type in ('dossier','matiere','cours','qcm_question','qcm_option','coaching','general'));
