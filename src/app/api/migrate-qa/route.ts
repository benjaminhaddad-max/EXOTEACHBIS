import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SQL = `
-- =============================================
-- Q&A System: prof_matieres, qa_threads, qa_messages
-- =============================================

CREATE TABLE IF NOT EXISTS prof_matieres (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prof_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  matiere_id UUID NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(prof_id, matiere_id)
);
CREATE INDEX IF NOT EXISTS idx_prof_matieres_prof ON prof_matieres(prof_id);
CREATE INDEX IF NOT EXISTS idx_prof_matieres_matiere ON prof_matieres(matiere_id);

CREATE TABLE IF NOT EXISTS qa_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN ('dossier','matiere','cours','qcm_question','qcm_option')),
  dossier_id UUID REFERENCES dossiers(id) ON DELETE SET NULL,
  matiere_id UUID REFERENCES matieres(id) ON DELETE SET NULL,
  cours_id UUID REFERENCES cours(id) ON DELETE SET NULL,
  question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  option_id UUID REFERENCES options(id) ON DELETE SET NULL,
  serie_id UUID REFERENCES series(id) ON DELETE SET NULL,
  context_label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ai_pending' CHECK (status IN ('ai_pending','ai_answered','escalated','prof_answered','resolved')),
  assigned_prof_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_threads_student ON qa_threads(student_id);
CREATE INDEX IF NOT EXISTS idx_qa_threads_matiere ON qa_threads(matiere_id);
CREATE INDEX IF NOT EXISTS idx_qa_threads_status ON qa_threads(status);
CREATE INDEX IF NOT EXISTS idx_qa_threads_assigned ON qa_threads(assigned_prof_id);
CREATE INDEX IF NOT EXISTS idx_qa_threads_created ON qa_threads(created_at DESC);

CREATE TABLE IF NOT EXISTS qa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES qa_threads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('student','ai','prof')),
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','voice','image','video')),
  content TEXT,
  media_url TEXT,
  media_duration_s INT,
  read_by_student BOOLEAN DEFAULT false,
  read_by_prof BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_messages_thread ON qa_messages(thread_id, created_at);

-- RLS
ALTER TABLE prof_matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_messages ENABLE ROW LEVEL SECURITY;

-- prof_matieres policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prof_matieres' AND policyname='Admins manage prof_matieres') THEN
    CREATE POLICY "Admins manage prof_matieres" ON prof_matieres FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prof_matieres' AND policyname='Profs see own assignments') THEN
    CREATE POLICY "Profs see own assignments" ON prof_matieres FOR SELECT USING (prof_id = auth.uid());
  END IF;
END $$;

-- qa_threads policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_threads' AND policyname='Students see own threads') THEN
    CREATE POLICY "Students see own threads" ON qa_threads FOR SELECT USING (auth.uid() = student_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_threads' AND policyname='Students create own threads') THEN
    CREATE POLICY "Students create own threads" ON qa_threads FOR INSERT WITH CHECK (auth.uid() = student_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_threads' AND policyname='Students update own threads') THEN
    CREATE POLICY "Students update own threads" ON qa_threads FOR UPDATE USING (auth.uid() = student_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_threads' AND policyname='Profs see threads for their matieres') THEN
    CREATE POLICY "Profs see threads for their matieres" ON qa_threads FOR SELECT USING (
      EXISTS (SELECT 1 FROM prof_matieres pm WHERE pm.prof_id = auth.uid() AND pm.matiere_id = qa_threads.matiere_id)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_threads' AND policyname='Profs update threads for their matieres') THEN
    CREATE POLICY "Profs update threads for their matieres" ON qa_threads FOR UPDATE USING (
      EXISTS (SELECT 1 FROM prof_matieres pm WHERE pm.prof_id = auth.uid() AND pm.matiere_id = qa_threads.matiere_id)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_threads' AND policyname='Admins full access qa_threads') THEN
    CREATE POLICY "Admins full access qa_threads" ON qa_threads FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin'))
    );
  END IF;
END $$;

-- qa_messages policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_messages' AND policyname='Thread participants see messages') THEN
    CREATE POLICY "Thread participants see messages" ON qa_messages FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM qa_threads t WHERE t.id = qa_messages.thread_id AND (
          t.student_id = auth.uid()
          OR t.assigned_prof_id = auth.uid()
          OR EXISTS (SELECT 1 FROM prof_matieres pm WHERE pm.prof_id = auth.uid() AND pm.matiere_id = t.matiere_id)
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin'))
        )
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_messages' AND policyname='Students insert messages in own threads') THEN
    CREATE POLICY "Students insert messages in own threads" ON qa_messages FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM qa_threads t WHERE t.id = qa_messages.thread_id AND t.student_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_messages' AND policyname='Profs insert messages in their threads') THEN
    CREATE POLICY "Profs insert messages in their threads" ON qa_messages FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM qa_threads t WHERE t.id = qa_messages.thread_id
        AND EXISTS (SELECT 1 FROM prof_matieres pm WHERE pm.prof_id = auth.uid() AND pm.matiere_id = t.matiere_id)
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_messages' AND policyname='Admins full access qa_messages') THEN
    CREATE POLICY "Admins full access qa_messages" ON qa_messages FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_messages' AND policyname='Update read status qa_messages') THEN
    CREATE POLICY "Update read status qa_messages" ON qa_messages FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM qa_threads t WHERE t.id = qa_messages.thread_id AND (
          t.student_id = auth.uid()
          OR EXISTS (SELECT 1 FROM prof_matieres pm WHERE pm.prof_id = auth.uid() AND pm.matiere_id = t.matiere_id)
        )
      )
    );
  END IF;
END $$;

-- Update notifications constraint to support new types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('annonce','forum_reply','nouveau_cours','examen','qa_escalated','qa_prof_replied','qa_ai_replied'));

-- Enable Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE qa_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE qa_threads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Use pg-meta endpoint (same approach as /api/migrate)
  const resp = await fetch(`${url}/rest/v1/rpc/exec_migration`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (!resp.ok) {
    // Fallback: pg-meta
    const pgResp = await fetch(
      `${url.replace(".supabase.co", ".supabase.co")}/pg-meta/v1/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pg-meta-db": "postgres",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ query: SQL }),
      }
    );

    if (!pgResp.ok) {
      const text = await pgResp.text();
      return NextResponse.json(
        {
          ok: false,
          error: text,
          instruction:
            "Run the SQL in supabase/migrations/011_qa_system.sql manually in Supabase Dashboard > SQL Editor",
        },
        { status: 500 }
      );
    }
    const data = await pgResp.json();
    return NextResponse.json({ ok: true, method: "pg-meta", data });
  }

  const data = await resp.json();
  return NextResponse.json({ ok: true, method: "rpc", data });
}
