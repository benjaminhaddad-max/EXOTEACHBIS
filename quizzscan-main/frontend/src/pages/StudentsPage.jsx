import { useState, useEffect, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { studentApi, groupApi } from '../api.js'
import toast from 'react-hot-toast'

/* ─── Icônes inline ──────────────────────────────────────────────────────── */
const IconGroup   = () => <span style={{fontSize:18}}>👥</span>
const IconPlus    = () => <span style={{fontSize:15}}>＋</span>
const IconTrash   = () => <span style={{fontSize:13}}>✕</span>
const IconEdit    = () => <span style={{fontSize:13}}>✎</span>
const IconImport  = () => <span style={{fontSize:15}}>⬆</span>

/* ═══════════════════════════════════════════════════════════════════════════
   PANEL GROUPE (droite)
══════════════════════════════════════════════════════════════════════════ */
function GroupPanel({ group, allStudents, onClose, onStudentChange }) {
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  useEffect(() => { loadMembers() }, [group.id])

  async function loadMembers() {
    setLoading(true)
    try { const { data } = await groupApi.getStudents(group.id); setMembers(data) }
    finally { setLoading(false) }
  }

  async function handleAdd(student) {
    try {
      await groupApi.addStudent(group.id, student.id)
      setMembers(prev => [...prev, student].sort((a,b) => a.last_name.localeCompare(b.last_name)))
      onStudentChange?.()
    } catch { toast.error("Erreur") }
  }

  async function handleRemove(student) {
    try {
      await groupApi.removeStudent(group.id, student.id)
      setMembers(prev => prev.filter(m => m.id !== student.id))
      onStudentChange?.()
    } catch { toast.error("Erreur") }
  }

  async function handleImportCsv(e) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    try {
      const { data } = await groupApi.importCsv(group.id, file)
      toast.success(`${data.created} créés, ${data.added_to_group} ajoutés au groupe`)
      loadMembers(); onStudentChange?.()
    } catch { toast.error("Erreur import") }
    finally { setImporting(false); e.target.value = '' }
  }

  const memberIds = new Set(members.map(m => m.id))
  const filtered  = (allStudents || []).filter(s =>
    !memberIds.has(s.id) &&
    (s.last_name.toLowerCase().includes(search.toLowerCase()) ||
     s.first_name.toLowerCase().includes(search.toLowerCase()) ||
     s.student_number.includes(search))
  )

  return (
    <div style={{
      position:'fixed', right:0, top:0, bottom:0, width:420,
      background:'var(--surface)', boxShadow:'-4px 0 24px rgba(0,0,0,.12)',
      display:'flex', flexDirection:'column', zIndex:100, borderLeft:'1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
        <IconGroup />
        <div style={{flex:1}}>
          <div style={{fontWeight:700, fontSize:16}}>{group.name}</div>
          <div style={{fontSize:12, color:'var(--text-muted)'}}>{members.length} étudiant{members.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
      </div>

      <div style={{flex:1, overflow:'auto', padding:'16px 24px', display:'flex', flexDirection:'column', gap:20}}>

        {/* Import CSV */}
        <div>
          <div style={{fontWeight:600, marginBottom:8, fontSize:13}}>Importer un CSV dans ce groupe</div>
          <input type="file" accept=".csv" ref={fileRef} style={{display:'none'}} onChange={handleImportCsv} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            <IconImport /> {importing ? 'Import…' : 'Choisir un fichier CSV'}
          </button>
        </div>

        {/* Membres actuels */}
        <div>
          <div style={{fontWeight:600, marginBottom:8, fontSize:13}}>Membres ({members.length})</div>
          {loading ? <div className="text-muted text-sm">Chargement…</div>
          : members.length === 0
            ? <div className="text-muted text-sm">Aucun membre dans ce groupe</div>
            : <div style={{display:'flex', flexDirection:'column', gap:4, maxHeight:220, overflow:'auto'}}>
                {members.map(s => (
                  <div key={s.id} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                    background:'var(--surface-2)', borderRadius:8,
                  }}>
                    <span style={{fontFamily:'monospace', fontSize:12, color:'var(--text-muted)', minWidth:70}}>{s.student_number}</span>
                    <span style={{flex:1, fontSize:13, fontWeight:500}}>{s.last_name} {s.first_name}</span>
                    <button className="btn btn-danger btn-sm" style={{padding:'2px 6px'}} onClick={() => handleRemove(s)}><IconTrash /></button>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Ajouter depuis la liste globale */}
        <div>
          <div style={{fontWeight:600, marginBottom:8, fontSize:13}}>Ajouter des étudiants</div>
          <input className="form-input" placeholder="Rechercher…" value={search}
            onChange={e => setSearch(e.target.value)} style={{marginBottom:8}} />
          {filtered.length === 0
            ? <div className="text-muted text-sm">{search ? 'Aucun résultat' : 'Tous les étudiants sont déjà membres'}</div>
            : <div style={{display:'flex', flexDirection:'column', gap:4, maxHeight:240, overflow:'auto'}}>
                {filtered.slice(0,50).map(s => (
                  <div key={s.id} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                    background:'var(--surface-2)', borderRadius:8, cursor:'pointer',
                  }} onClick={() => handleAdd(s)}>
                    <span style={{fontFamily:'monospace', fontSize:12, color:'var(--text-muted)', minWidth:70}}>{s.student_number}</span>
                    <span style={{flex:1, fontSize:13}}>{s.last_name} {s.first_name}</span>
                    <span style={{color:'var(--primary)', fontSize:18}}><IconPlus /></span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
══════════════════════════════════════════════════════════════════════════ */
export default function StudentsPage() {
  const [students,    setStudents]    = useState([])
  const [groups,      setGroups]      = useState([])
  const [activeGroup, setActiveGroup] = useState(null)   // groupe ouvert dans le panel
  const [search,      setSearch]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [importing,   setImporting]   = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroup, setEditingGroup] = useState(null)
  const [form, setForm] = useState({ student_number:'', last_name:'', first_name:'', email:'' })

  useEffect(() => { loadAll() }, [])
  useEffect(() => {
    const t = setTimeout(() => loadStudents(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  async function loadAll() {
    await Promise.all([loadStudents(''), loadGroups()])
  }

  async function loadStudents(q = '') {
    setLoading(true)
    try { const { data } = await studentApi.list(q); setStudents(data) }
    catch { toast.error('Erreur de chargement') }
    finally { setLoading(false) }
  }

  async function loadGroups() {
    try { const { data } = await groupApi.list(); setGroups(data) }
    catch {}
  }

  /* ── Import CSV global ── */
  const onDrop = useCallback(async (files) => {
    const file = files[0]; if (!file) return
    setImporting(true)
    try {
      const { data } = await studentApi.importCsv(file)
      toast.success(`${data.created} créés, ${data.updated} mis à jour`)
      loadStudents(search)
    } catch { toast.error("Erreur lors de l'import") }
    finally { setImporting(false) }
  }, [search])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'] }, maxFiles: 1, disabled: importing,
  })

  /* ── CRUD étudiants ── */
  async function handleCreate() {
    if (!form.student_number.trim() || !form.last_name.trim() || !form.first_name.trim()) {
      toast.error('Numéro, nom et prénom requis'); return
    }
    try {
      const { data } = await studentApi.create(form)
      setStudents(prev => [...prev, data].sort((a,b) => a.last_name.localeCompare(b.last_name)))
      setForm({ student_number:'', last_name:'', first_name:'', email:'' })
      setShowAdd(false); toast.success('Étudiant ajouté')
    } catch (err) {
      toast.error(err.response?.status === 409 ? 'Numéro déjà existant' : "Erreur")
    }
  }

  async function handleDeleteStudent(id, name) {
    if (!confirm(`Supprimer ${name} ?`)) return
    try {
      await studentApi.delete(id)
      setStudents(prev => prev.filter(s => s.id !== id))
      toast.success('Supprimé')
    } catch { toast.error('Erreur') }
  }

  /* ── CRUD groupes ── */
  async function handleCreateGroup() {
    if (!newGroupName.trim()) return
    try {
      const { data } = await groupApi.create(newGroupName.trim())
      setGroups(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)))
      setNewGroupName(''); toast.success(`Groupe "${data.name}" créé`)
    } catch (err) {
      toast.error(err.response?.status === 409 ? 'Ce nom existe déjà' : 'Erreur')
    }
  }

  async function handleRenameGroup(g) {
    const name = prompt('Nouveau nom :', g.name); if (!name || name === g.name) return
    try {
      await groupApi.rename(g.id, name)
      setGroups(prev => prev.map(x => x.id === g.id ? { ...x, name } : x))
      if (activeGroup?.id === g.id) setActiveGroup(prev => ({ ...prev, name }))
      toast.success('Renommé')
    } catch { toast.error('Erreur') }
  }

  async function handleDeleteGroup(g) {
    if (!confirm(`Supprimer le groupe "${g.name}" ?`)) return
    try {
      await groupApi.delete(g.id)
      setGroups(prev => prev.filter(x => x.id !== g.id))
      if (activeGroup?.id === g.id) setActiveGroup(null)
      toast.success('Groupe supprimé')
    } catch { toast.error('Erreur') }
  }

  return (
    <>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Étudiants & Groupes</h1>
          <p className="page-subtitle">{students.length} étudiant{students.length !== 1 ? 's' : ''} · {groups.length} groupe{groups.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <a href={studentApi.exportUrl()} className="btn btn-secondary">⬇ CSV</a>
          <button className="btn btn-danger btn-sm"
            onClick={async () => { if (!confirm(`Supprimer tous les étudiants (${students.length}) ?`)) return; await studentApi.deleteAll(); setStudents([]); toast.success('Base vidée') }}
            disabled={!students.length}>Vider</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? '✕ Annuler' : '+ Ajouter'}
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20, alignItems:'start' }}>

        {/* ── Colonne gauche : Groupes ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card" style={{ padding:'16px' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Groupes</div>

            {groups.length === 0
              ? <div className="text-muted text-sm" style={{ marginBottom:12 }}>Aucun groupe</div>
              : <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
                  {groups.map(g => (
                    <div key={g.id}
                      onClick={() => setActiveGroup(activeGroup?.id === g.id ? null : g)}
                      style={{
                        display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                        borderRadius:8, cursor:'pointer',
                        background: activeGroup?.id === g.id ? 'var(--primary)' : 'var(--surface-2)',
                        color: activeGroup?.id === g.id ? '#fff' : 'inherit',
                        transition:'background .15s',
                      }}>
                      <span style={{ fontSize:14 }}>👥</span>
                      <span style={{ flex:1, fontWeight:500, fontSize:13 }}>{g.name}</span>
                      <span style={{ fontSize:12, opacity:.7 }}>{g.student_count}</span>
                      <button
                        className="btn btn-sm"
                        style={{ padding:'2px 5px', background:'transparent', opacity:.7 }}
                        onClick={e => { e.stopPropagation(); handleRenameGroup(g) }}><IconEdit /></button>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ padding:'2px 5px' }}
                        onClick={e => { e.stopPropagation(); handleDeleteGroup(g) }}><IconTrash /></button>
                    </div>
                  ))}
                </div>
            }

            {/* Créer un groupe */}
            <div style={{ display:'flex', gap:6 }}>
              <input className="form-input" placeholder="Nom du groupe…"
                value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                style={{ fontSize:13 }} />
              <button className="btn btn-primary btn-sm" onClick={handleCreateGroup}>＋</button>
            </div>
          </div>
        </div>

        {/* ── Colonne droite : Étudiants ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Import CSV */}
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:12 }}>Importer depuis un fichier CSV</div>
            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`} style={{ padding:'20px' }}>
              <input {...getInputProps()} />
              <div style={{ fontSize:24, marginBottom:6 }}>📊</div>
              {importing ? <div>Import en cours…</div>
              : isDragActive ? <div className="dropzone-text">Déposez ici</div>
              : <>
                  <div className="dropzone-text">Glissez un fichier CSV ou cliquez</div>
                  <div className="dropzone-sub" style={{ marginTop:4 }}>
                    Colonnes : <code>numero</code> <code>nom</code> <code>prenom</code> <code>email</code> (opt.)
                  </div>
                </>}
            </div>
          </div>

          {/* Ajout manuel */}
          {showAdd && (
            <div className="card">
              <div style={{ fontWeight:600, marginBottom:14 }}>Ajouter manuellement</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1.5fr', gap:12, alignItems:'end' }}>
                {[['N° étudiant *','student_number','21405678'],['Nom *','last_name','DUPONT'],
                  ['Prénom *','first_name','Marie'],['Email','email','marie@univ.fr']].map(([label, key, ph]) => (
                  <div key={key} className="form-group" style={{ margin:0 }}>
                    <label className="form-label">{label}</label>
                    <input className="form-input" placeholder={ph} value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: key === 'last_name' ? e.target.value.toUpperCase() : e.target.value }))} />
                  </div>
                ))}
              </div>
              <button className="btn btn-primary mt-4" onClick={handleCreate}>Ajouter</button>
            </div>
          )}

          {/* Tableau */}
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom:14 }}>
              <input className="form-input" placeholder="🔍 Nom, prénom ou numéro…"
                value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth:320 }} />
              <span className="text-sm text-muted">{students.length} résultat{students.length !== 1 ? 's' : ''}</span>
            </div>
            {loading
              ? <div className="text-muted text-sm" style={{ padding:'20px 0' }}>Chargement…</div>
              : students.length === 0
                ? <div className="empty-state" style={{ padding:'32px 0' }}>
                    <div className="empty-state-icon">👤</div>
                    <div>{search ? 'Aucun résultat' : 'Aucun étudiant'}</div>
                  </div>
                : <div className="table-wrapper">
                    <table>
                      <thead><tr><th>N°</th><th>Nom</th><th>Prénom</th><th>Email</th><th>Groupes</th><th></th></tr></thead>
                      <tbody>
                        {students.map(s => (
                          <tr key={s.id}>
                            <td style={{ fontFamily:'monospace', fontWeight:600, fontSize:12 }}>{s.student_number}</td>
                            <td style={{ fontWeight:500 }}>{s.last_name}</td>
                            <td>{s.first_name}</td>
                            <td className="text-muted text-sm">{s.email || '—'}</td>
                            <td>
                              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                                {(s.groups || []).map(g => (
                                  <span key={g.id} style={{
                                    background:'var(--primary-light, #e8f4ff)', color:'var(--primary)',
                                    borderRadius:12, padding:'1px 8px', fontSize:11, fontWeight:600,
                                  }}>{g.name}</span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <button className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteStudent(s.id, `${s.first_name} ${s.last_name}`)}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            }
          </div>
        </div>
      </div>

      {/* Panel latéral groupe */}
      {activeGroup && (
        <GroupPanel
          group={activeGroup}
          allStudents={students}
          onClose={() => setActiveGroup(null)}
          onStudentChange={() => { loadStudents(search); loadGroups() }}
        />
      )}
    </>
  )
}
