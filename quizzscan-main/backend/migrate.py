"""
Script de migration simple — à exécuter au démarrage si nécessaire.
Ajoute les colonnes et tables manquantes sans toucher aux données existantes.
"""
from sqlalchemy import text
from database import engine

def run():
    with engine.connect() as conn:
        # Créer la table folders si elle n'existe pas
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS folders (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))

        # Ajouter folder_id sur exams si elle n'existe pas
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='exams' AND column_name='folder_id'
                ) THEN
                    ALTER TABLE exams ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
                END IF;
            END $$;
        """))

        # Créer la table groups si elle n'existe pas
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS groups (
                id SERIAL PRIMARY KEY,
                name VARCHAR UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))

        # Tables d'association
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS student_groups (
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                group_id   INTEGER REFERENCES groups(id)   ON DELETE CASCADE,
                PRIMARY KEY (student_id, group_id)
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS exam_groups (
                exam_id  INTEGER REFERENCES exams(id)  ON DELETE CASCADE,
                group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
                PRIMARY KEY (exam_id, group_id)
            )
        """))

        conn.commit()
    print("Migration OK")

if __name__ == "__main__":
    run()
