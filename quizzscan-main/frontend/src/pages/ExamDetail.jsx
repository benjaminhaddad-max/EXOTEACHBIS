import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { examApi, scanApi } from '../api.js'
import toast from 'react-hot-toast'

const STATUS_LABELS = {
  pending: { label: 'En attente', cls: 'badge-yellow' },
  processing: { label: 'Traitement…', cls: 'badge-yellow' },
  review: { label: 'À réviser', cls: 'badge-red' },
  done: { label: 'Terminé', cls: 'badge-green' },
}

function StatusDot({ status }) {
  if (status === 'processing') return <span className="status-dot status-processing" />
  if (status === 'review') return <span className="status-dot status-review" />
  if (status === 'done') return <span className="status-dot status-done" />
  return <span className="status-dot" style={{ background: 'var(--border)' }} />
}

export default function ExamDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [sessions, setSessions] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const pollRef = useRef(null)

  useEffect(() => {
    loadData()
    return () => clearInterval(pollRef.current)
  }, [id])

  async function loadData() {
    try {
      const [{ data: ex }, { data: sess }] = await Promise.all([
        examApi.get(id),
        scanApi.getSessions(id),
      ])
      setExam(ex)
      setSessions(sess)
      // Poll si une session est en cours
      if (sess.some(s => s.status === 'processing')) {
        pollRef.current = setInterval(loadSessions, 2500)
      }
    } catch {
      toast.error('Épreuve introuvable')
      navigate('/')
    }
  }

  async function loadSessions() {
    try {
      const { data } = await scanApi.getSessions(id)
      setSessions(data)
      if (!data.some(s => s.status === 'processing')) {
        clearInterval(pollRef.current)
      }
    } catch {}
  }

  const onDrop = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    if (!file.name.endsWith('.pdf')) { toast.error('Seuls les PDF sont acceptés'); return }

    setUploading(true)
    setProgress(0)
    try {
      const { data } = await scanApi.upload(id, file, setProgress)
      toast.success('PDF uploadé — traitement OMR lancé')
      loadSessions()
      // Démarrer le polling
      pollRef.current = setInterval(loadSessions, 2500)
    } catch {
      toast.error("Erreur lors de l'upload")
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [id])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading,
  })

  if (!exam) return <div className="text-muted" style={{ padding: 40 }}>Chargement…</div>

  const CHOICES = 'ABCDE'.slice(0, exam.nb_choices)

  return (
    <>
      <div className="page-header">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 12 }}>
          ← Toutes les épreuves
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">{exam.title}</h1>
            <p className="page-subtitle">
              {exam.institution} · {exam.nb_questions} questions · {CHOICES}
              {exam.has_remorse ? ' · Remord activé' : ''}
            </p>
          </div>
          {exam.has_pdf && (
            <a
              href={examApi.gridUrl(exam.id)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              ⬇ Télécharger la grille vierge
            </a>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>
          Importer des copies scannées
        </div>
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="dropzone-icon">📄</div>
          {uploading ? (
            <>
              <div className="dropzone-text">Upload en cours…</div>
              <div style={{ width: '100%', maxWidth: 300, margin: '12px auto 0' }}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 6, textAlign: 'center' }}>
                  {progress}%
                </div>
              </div>
            </>
          ) : isDragActive ? (
            <div className="dropzone-text">Déposez le PDF ici</div>
          ) : (
            <>
              <div className="dropzone-text">Glissez-déposez le PDF scanné</div>
              <div className="dropzone-sub">ou cliquez pour parcourir · PDF multi-pages accepté</div>
            </>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>
          Historique des scans
          <span className="badge badge-blue" style={{ marginLeft: 10 }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="text-muted text-sm" style={{ padding: '20px 0' }}>
            Aucun scan importé pour l'instant.
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fichier</th>
                  <th>Date</th>
                  <th>Copies</th>
                  <th>À réviser</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(sess => {
                  const statusInfo = STATUS_LABELS[sess.status] || { label: sess.status, cls: 'badge-yellow' }
                  return (
                    <tr key={sess.id}>
                      <td style={{ fontWeight: 500 }}>{sess.filename}</td>
                      <td className="text-muted text-sm">
                        {new Date(sess.uploaded_at).toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td>{sess.total_students}</td>
                      <td>
                        {sess.pending_review > 0 ? (
                          <span className="badge badge-red">{sess.pending_review} ⚠</span>
                        ) : sess.total_students > 0 ? (
                          <span className="badge badge-green">✓</span>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`badge ${statusInfo.cls}`}>
                          <StatusDot status={sess.status} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {sess.pending_review > 0 && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => navigate(`/review/${sess.id}`)}
                            >
                              ✎ Réviser
                            </button>
                          )}
                          {sess.status === 'done' || sess.pending_review === 0 && sess.total_students > 0 ? (
                            <a
                              href={scanApi.exportUrl(sess.id)}
                              className="btn btn-primary btn-sm"
                            >
                              ⬇ Excel
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
