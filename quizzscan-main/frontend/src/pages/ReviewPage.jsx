import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { scanApi } from '../api.js'
import toast from 'react-hot-toast'

export default function ReviewPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [pending, setPending] = useState([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editAnswers, setEditAnswers] = useState({})
  const [editStudentId, setEditStudentId] = useState('')
  const [nbChoices, setNbChoices] = useState(5)

  useEffect(() => { loadPending() }, [sessionId])

  async function loadPending() {
    try {
      const { data } = await scanApi.getPendingReview(sessionId)
      setPending(data)
      if (data.length > 0) {
        initEdit(data[0])
        // Deviner nb_choices depuis les réponses
        const allLetters = Object.values(data[0].answers || {}).join('')
        const maxLetter = allLetters.split('').sort().pop()
        if (maxLetter) setNbChoices(Math.max(2, 'ABCDE'.indexOf(maxLetter) + 1))
      }
    } catch {
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  function initEdit(result) {
    setEditStudentId(result.student_id || '')
    setEditAnswers({ ...result.answers })
  }

  function toggleChoice(qNum, letter) {
    setEditAnswers(prev => {
      const cur = prev[qNum] || ''
      const letters = cur.split('').filter(Boolean)
      const idx = letters.indexOf(letter)
      const updated = idx >= 0
        ? letters.filter(l => l !== letter).sort().join('')
        : [...letters, letter].sort().join('')
      return { ...prev, [qNum]: updated }
    })
  }

  async function saveAndNext() {
    const result = pending[current]
    setSaving(true)
    try {
      await scanApi.updateReview(result.id, {
        student_id: editStudentId || null,
        answers: editAnswers,
        reviewed: true,
      })

      if (current + 1 < pending.length) {
        const next = pending[current + 1]
        setCurrent(current + 1)
        initEdit(next)
        toast.success(`Copie ${current + 1} validée`)
      } else {
        toast.success('Toutes les copies révisées !')
        navigate(-1)
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-muted" style={{ padding: 40 }}>Chargement…</div>

  if (pending.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">✅</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Aucune copie à réviser</div>
      <p className="text-muted" style={{ marginTop: 8 }}>Tout a déjà été validé.</p>
      <button className="btn btn-secondary mt-4" onClick={() => navigate(-1)}>← Retour</button>
    </div>
  )

  const result = pending[current]
  const letters = 'ABCDE'.slice(0, nbChoices)
  const questions = Object.keys(result.answers || {}).map(Number).sort((a, b) => a - b)
  const imageUrl = result.page_number
    ? scanApi.pageImageUrl(sessionId, result.page_number)
    : null

  return (
    <>
      <div className="page-header flex items-center justify-between">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 10 }}>
            ← Retour
          </button>
          <h1 className="page-title">Révision manuelle</h1>
          <p className="page-subtitle">
            Copie {current + 1} sur {pending.length} · Page {result.page_number}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="text-muted text-sm">{pending.length - current - 1} restante{pending.length - current - 1 !== 1 ? 's' : ''}</div>
          <div style={{ width: 120 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(current / pending.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="review-grid">
        {/* Aperçu scan */}
        <div>
          <div className="card" style={{ padding: 0 }}>
            <div className="scan-preview">
              {imageUrl ? (
                <img src={imageUrl} alt={`Page ${result.page_number}`} />
              ) : (
                <div className="text-muted" style={{ padding: 40 }}>Image non disponible</div>
              )}
            </div>
          </div>
          {result.doubtful_cases && Object.keys(result.doubtful_cases).length > 0 && (
            <div className="card mt-4" style={{ background: 'var(--warning-light)', border: '1px solid #FCD34D' }}>
              <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 8 }}>
                ⚠ Cases douteuses détectées
              </div>
              {Object.entries(result.doubtful_cases).map(([q, cases]) => (
                <div key={q} className="text-sm" style={{ marginTop: 4 }}>
                  Q{q} : {cases.join(', ')} — taux de remplissage ambigu
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panneau de correction */}
        <div>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
              Numéro étudiant
              {result.student_id_confidence !== 'ok' && (
                <span className="badge badge-red" style={{ marginLeft: 8 }}>
                  {result.student_id_confidence === 'unreadable' ? 'Illisible' : 'Douteux'}
                </span>
              )}
            </div>
            <input
              className="form-input"
              placeholder="Numéro étudiant"
              value={editStudentId}
              onChange={e => setEditStudentId(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2 }}
            />
          </div>

          <div className="card mt-4" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
              Réponses
              <span className="text-muted text-sm" style={{ fontWeight: 400, marginLeft: 8 }}>
                Cliquer pour activer/désactiver
              </span>
            </div>

            <div className="answer-grid">
              {/* Header colonnes */}
              <div />
              <div className="q-choices" style={{ marginBottom: 4 }}>
                {letters.split('').map(l => (
                  <div key={l} style={{ width: 30, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>
                    {l}
                  </div>
                ))}
              </div>

              {questions.map(q => {
                const cur = editAnswers[q] || ''
                const isDoubtful = result.doubtful_cases?.[q]?.length > 0
                return (
                  <>
                    <div key={`n-${q}`} className="q-num" style={{ color: isDoubtful ? 'var(--warning)' : undefined }}>
                      {q}{isDoubtful ? '⚠' : ''}
                    </div>
                    <div key={`c-${q}`} className="q-choices">
                      {letters.split('').map(l => (
                        <button
                          key={l}
                          className={`choice-btn ${cur.includes(l) ? 'selected' : ''} ${result.doubtful_cases?.[q]?.includes(l) ? 'doubt' : ''}`}
                          onClick={() => toggleChoice(String(q), l)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </>
                )
              })}
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              onClick={saveAndNext}
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : current + 1 < pending.length ? 'Valider → Suivant' : 'Valider et terminer ✓'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
