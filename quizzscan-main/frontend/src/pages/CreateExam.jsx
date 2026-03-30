import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { examApi, groupApi } from '../api.js'
import toast from 'react-hot-toast'

export default function CreateExam() {
  const navigate = useNavigate()
  const [saving,  setSaving]  = useState(false)
  const [groups,  setGroups]  = useState([])
  const [form, setForm] = useState({
    title: '', institution: '',
    nb_questions: 20, nb_choices: 5,
    has_remorse: true, group_ids: [],
  })

  useEffect(() => {
    groupApi.list().then(({ data }) => setGroups(data)).catch(() => {})
  }, [])

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function toggleGroup(id) {
    setForm(p => ({
      ...p,
      group_ids: p.group_ids.includes(id) ? p.group_ids.filter(x => x !== id) : [...p.group_ids, id]
    }))
  }

  async function handleSubmit() {
    if (!form.title.trim())       { toast.error('Titre requis'); return }
    if (!form.institution.trim()) { toast.error('Institution requise'); return }
    const maxQ = form.has_remorse ? 60 : 120
    if (form.nb_questions < 1 || form.nb_questions > maxQ) {
      toast.error(`Maximum ${maxQ} questions ${form.has_remorse ? 'avec' : 'sans'} remord`); return
    }

    setSaving(true)
    try {
      const { data } = await examApi.create({
        ...form,
        nb_questions: Number(form.nb_questions),
        nb_choices:   Number(form.nb_choices),
      })
      toast.success('Épreuve créée !')
      navigate(`/exams/${data.id}`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la création')
    } finally { setSaving(false) }
  }

  const maxQ = form.has_remorse ? 60 : 120

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-header">
        <h1 className="page-title">Nouvelle épreuve</h1>
        <p className="page-subtitle">La grille PDF sera générée automatiquement</p>
      </div>

      <div className="card" style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Titre + Institution */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div className="form-group">
            <label className="form-label">Matière *</label>
            <input className="form-input" placeholder="Maladie génétique" value={form.title}
              onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Institution *</label>
            <input className="form-input" placeholder="LAS3" value={form.institution}
              onChange={e => set('institution', e.target.value)} />
          </div>
        </div>

        {/* Questions + Choix */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
          <div className="form-group">
            <label className="form-label">Nb de questions * <span className="text-muted" style={{fontWeight:400}}>(max {maxQ})</span></label>
            <input className="form-input" type="number" min={1} max={maxQ} value={form.nb_questions}
              onChange={e => set('nb_questions', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Propositions</label>
            <select className="form-input" value={form.nb_choices} onChange={e => set('nb_choices', Number(e.target.value))}>
              <option value={2}>A, B</option>
              <option value={3}>A, B, C</option>
              <option value={4}>A, B, C, D</option>
              <option value={5}>A, B, C, D, E</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Option remord</label>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              {[true, false].map(v => (
                <button key={String(v)}
                  className={`btn btn-sm ${form.has_remorse === v ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => set('has_remorse', v)}>
                  {v ? '✓ Avec remord' : '✗ Sans remord'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Aperçu limite */}
        <div style={{
          background:'var(--surface-2)', borderRadius:10, padding:'12px 16px',
          fontSize:13, color:'var(--text-muted)',
        }}>
          <strong style={{color:'var(--text)'}}>Récapitulatif :</strong>{' '}
          {form.nb_questions} question{form.nb_questions > 1 ? 's' : ''},{' '}
          {form.nb_choices} proposition{form.nb_choices > 1 ? 's' : ''} (A–{"ABCDE"[form.nb_choices-1]}),{' '}
          {form.has_remorse ? 'avec remord' : 'sans remord'} — grille 1 page A4
        </div>

        {/* Groupes */}
        {groups.length > 0 && (
          <div className="form-group">
            <label className="form-label">Groupes d'étudiants concernés</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:6 }}>
              {groups.map(g => {
                const selected = form.group_ids.includes(g.id)
                return (
                  <button key={g.id}
                    className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => toggleGroup(g.id)}>
                    👥 {g.name}
                    <span style={{ marginLeft:5, opacity:.7, fontSize:11 }}>({g.student_count})</span>
                  </button>
                )
              })}
            </div>
            {form.group_ids.length === 0 && (
              <div className="text-muted text-sm" style={{ marginTop:6 }}>
                Aucun groupe sélectionné — vous pourrez en assigner un plus tard
              </div>
            )}
          </div>
        )}

        {groups.length === 0 && (
          <div style={{
            background:'var(--surface-2)', borderRadius:10, padding:'12px 16px',
            fontSize:13, color:'var(--text-muted)',
          }}>
            💡 Créez des groupes dans la section <strong>Étudiants</strong> pour les assigner à cette épreuve
          </div>
        )}

        <button className="btn btn-primary" style={{ alignSelf:'flex-start', padding:'10px 28px' }}
          onClick={handleSubmit} disabled={saving}>
          {saving ? 'Génération en cours…' : '✓ Créer l\'épreuve et générer la grille'}
        </button>
      </div>
    </div>
  )
}
