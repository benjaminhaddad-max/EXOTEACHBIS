import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { examApi, folderApi } from '../api.js'
import toast from 'react-hot-toast'

/* ── Icônes ──────────────────────────────────────────────────────────────── */
const IFolder  = ({ open }) => <span style={{fontSize:18}}>{open ? '📂' : '📁'}</span>
const IExam    = () => <span style={{fontSize:16}}>📋</span>
const IBack    = () => <span style={{fontSize:14}}>←</span>
const IDots    = () => <span style={{fontSize:18, lineHeight:1}}>⋯</span>

/* ── Menu contextuel ─────────────────────────────────────────────────────── */
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const MENU_W = 190
  // Ancrer au bord droit du bouton → le menu s'étend vers la gauche
  const left = x - MENU_W

  return (
    <div ref={ref} style={{
      position:'fixed', top:y, left:left, zIndex:1000,
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,.15)',
      minWidth:MENU_W, padding:'4px 0', overflow:'hidden',
    }}>
      {items.map((item, i) =>
        item === 'sep'
          ? <div key={i} style={{height:1, background:'var(--border)', margin:'4px 0'}} />
          : <button key={i} onClick={() => { item.action(); onClose() }}
              style={{
                display:'block', width:'100%', textAlign:'left',
                padding:'9px 16px', background:'none', border:'none',
                cursor:'pointer', fontSize:13,
                color: item.danger ? '#e53e3e' : 'var(--text)',
              }}
              onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background='none'}
            >{item.label}</button>
      )}
    </div>
  )
}

/* ── Modal déplacement ───────────────────────────────────────────────────── */
function MoveModal({ item, isFolder, currentFolderId, onMove, onClose }) {
  const [folders, setFolders]   = useState([])
  const [navId,   setNavId]     = useState(null)
  const [crumbs,  setCrumbs]    = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadLevel(null) }, [])

  async function loadLevel(parentId) {
    setLoading(true)
    try {
      const { data } = await folderApi.list(parentId)
      setFolders(data.filter(f => f.id !== item.id))
      setNavId(parentId)
      if (parentId) {
        const { data: bc } = await folderApi.breadcrumb(parentId)
        setCrumbs(bc)
      } else {
        setCrumbs([])
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.4)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:200,
    }} onClick={onClose}>
      <div style={{
        background:'var(--surface)', borderRadius:16, padding:'28px',
        width:420, boxShadow:'0 20px 60px rgba(0,0,0,.25)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{fontWeight:700, fontSize:16, marginBottom:4}}>
          Déplacer « {item.name || item.title} »
        </div>
        <div style={{fontSize:13, color:'var(--text-muted)', marginBottom:20}}>
          Choisissez la destination
        </div>

        {/* Breadcrumb */}
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:12, fontSize:13}}>
          <span style={{cursor:'pointer', color:'var(--primary)'}} onClick={() => loadLevel(null)}>🏠 Racine</span>
          {crumbs.map((c, i) => (
            <span key={c.id} style={{display:'flex', gap:6}}>
              <span style={{color:'var(--text-muted)'}}>›</span>
              <span style={{cursor:'pointer', color:'var(--primary)'}} onClick={() => loadLevel(c.id)}>{c.name}</span>
            </span>
          ))}
        </div>

        <div style={{
          border:'1px solid var(--border)', borderRadius:10, overflow:'hidden',
          maxHeight:260, overflowY:'auto', marginBottom:20,
        }}>
          {loading
            ? <div style={{padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:13}}>Chargement…</div>
            : folders.length === 0
              ? <div style={{padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:13}}>Dossier vide</div>
              : folders.map(f => (
                  <div key={f.id} style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'10px 16px', cursor:'pointer',
                    borderBottom:'1px solid var(--border)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}
                  >
                    <span style={{fontSize:18, cursor:'pointer'}} onClick={() => loadLevel(f.id)}>📁</span>
                    <span style={{flex:1, fontSize:14, fontWeight:500}}
                      onClick={() => loadLevel(f.id)}>{f.name}</span>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => onMove(f.id)}>Déplacer ici</button>
                  </div>
                ))
          }
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => onMove(navId)}>
            Déplacer ici {navId ? `(${crumbs[crumbs.length-1]?.name})` : '(Racine)'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE — Explorateur
══════════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const navigate = useNavigate()

  const [folderId,  setFolderId]  = useState(null)   // null = racine
  const [crumbs,    setCrumbs]    = useState([])
  const [folders,   setFolders]   = useState([])
  const [exams,     setExams]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [menu,      setMenu]      = useState(null)   // { x, y, items }
  const [moveItem,  setMoveItem]  = useState(null)   // { item, isFolder }
  const [newFolder, setNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [search,    setSearch]    = useState('')
  const [searchResults, setSearchResults] = useState(null)

  useEffect(() => { loadLevel(folderId) }, [folderId])

  async function loadLevel(fid) {
    setLoading(true)
    try {
      const [fRes, eRes] = await Promise.all([
        folderApi.list(fid),
        examApi.list(fid),
      ])
      setFolders(fRes.data)
      setExams(eRes.data)
      if (fid) {
        const { data } = await folderApi.breadcrumb(fid)
        setCrumbs(data)
      } else {
        setCrumbs([])
      }
    } catch { toast.error('Erreur de chargement') }
    finally { setLoading(false) }
  }

  /* ── Recherche ── */
  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return }
    const t = setTimeout(async () => {
      const { data } = await examApi.list(undefined, true)
      const q = search.toLowerCase()
      setSearchResults(data.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.institution.toLowerCase().includes(q)
      ))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  /* ── Nouveau dossier ── */
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    try {
      const { data } = await folderApi.create(newFolderName.trim(), folderId)
      setFolders(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)))
      setNewFolderName(''); setNewFolder(false)
      toast.success(`Dossier « ${data.name} » créé`)
    } catch (err) {
      toast.error(err.response?.status === 409 ? 'Ce nom existe déjà ici' : 'Erreur')
    }
  }

  /* ── Renommer dossier ── */
  async function handleRenameFolder(f) {
    const name = prompt('Nouveau nom :', f.name); if (!name || name === f.name) return
    try {
      await folderApi.rename(f.id, name)
      setFolders(prev => prev.map(x => x.id === f.id ? {...x, name} : x))
      toast.success('Renommé')
    } catch { toast.error('Erreur') }
  }

  /* ── Supprimer dossier ── */
  async function handleDeleteFolder(f) {
    if (!confirm(`Supprimer « ${f.name} » ?\nLes épreuves dedans seront remontées à la racine.`)) return
    try {
      await folderApi.delete(f.id)
      setFolders(prev => prev.filter(x => x.id !== f.id))
      toast.success('Dossier supprimé')
    } catch { toast.error('Erreur') }
  }

  /* ── Supprimer épreuve ── */
  async function handleDeleteExam(e) {
    if (!confirm(`Supprimer l'épreuve « ${e.title} » ?`)) return
    try {
      await examApi.delete(e.id)
      setExams(prev => prev.filter(x => x.id !== e.id))
      toast.success('Épreuve supprimée')
    } catch { toast.error('Erreur') }
  }

  /* ── Déplacer ── */
  async function handleMove(targetFolderId) {
    const { item, isFolder } = moveItem
    try {
      if (isFolder) await folderApi.move(item.id, targetFolderId)
      else          await examApi.move(item.id, targetFolderId)
      toast.success('Déplacé')
      loadLevel(folderId)
    } catch { toast.error('Erreur') }
    setMoveItem(null)
  }

  /* ── Menu contextuel ── */
  function openFolderMenu(e, folder) {
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({
      x: rect.right, y: rect.bottom + 4,
      items: [
        { label: '✎ Renommer', action: () => handleRenameFolder(folder) },
        { label: '↗ Déplacer', action: () => setMoveItem({ item: folder, isFolder: true }) },
        'sep',
        { label: '🗑 Supprimer', action: () => handleDeleteFolder(folder), danger: true },
      ]
    })
  }

  function openExamMenu(e, exam) {
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({
      x: rect.right, y: rect.bottom + 4,
      items: [
        { label: '📋 Ouvrir', action: () => navigate(`/exams/${exam.id}`) },
        { label: '⬇ Télécharger grille', action: () => window.open(examApi.gridUrl(exam.id)) },
        { label: '↗ Déplacer', action: () => setMoveItem({ item: exam, isFolder: false }) },
        'sep',
        { label: '🗑 Supprimer', action: () => handleDeleteExam(exam), danger: true },
      ]
    })
  }

  const isEmpty = !loading && folders.length === 0 && exams.length === 0

  return (
    <>
      {/* Header */}
      <div className="page-header flex items-center justify-between" style={{marginBottom:16}}>
        <div>
          <h1 className="page-title">Épreuves</h1>
          <p className="page-subtitle">{folders.length} dossier{folders.length !== 1 ? 's' : ''} · {exams.length} épreuve{exams.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-secondary" onClick={() => setNewFolder(true)}>📁 Nouveau dossier</button>
          <button className="btn btn-primary" onClick={() => navigate('/exams/new')}>+ Nouvelle épreuve</button>
        </div>
      </div>

      {/* Barre de recherche */}
      <div style={{marginBottom:16}}>
        <input className="form-input" placeholder="🔍 Rechercher une épreuve…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{maxWidth:380}} />
      </div>

      {/* Résultats de recherche */}
      {searchResults !== null ? (
        <div className="card">
          <div style={{fontWeight:600, marginBottom:12, fontSize:14}}>
            {searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''} pour « {search} »
            <button className="btn btn-secondary btn-sm" style={{marginLeft:12}}
              onClick={() => { setSearch(''); setSearchResults(null) }}>✕ Effacer</button>
          </div>
          {searchResults.length === 0
            ? <div className="text-muted text-sm">Aucune épreuve trouvée</div>
            : searchResults.map(exam => (
                <ExamRow key={exam.id} exam={exam} onOpen={() => navigate(`/exams/${exam.id}`)}
                  onMenu={(e) => openExamMenu(e, exam)} showPath />
              ))
          }
        </div>
      ) : (
        <>
          {/* Breadcrumb */}
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:16, fontSize:13, flexWrap:'wrap'}}>
            <span style={{cursor:'pointer', color: folderId ? 'var(--primary)' : 'var(--text)', fontWeight: folderId ? 400 : 600}}
              onClick={() => setFolderId(null)}>🏠 Mes épreuves</span>
            {crumbs.map((c, i) => (
              <span key={c.id} style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{color:'var(--text-muted)'}}>›</span>
                <span style={{
                  cursor: i < crumbs.length-1 ? 'pointer' : 'default',
                  color: i < crumbs.length-1 ? 'var(--primary)' : 'var(--text)',
                  fontWeight: i === crumbs.length-1 ? 600 : 400,
                }}
                  onClick={() => i < crumbs.length-1 && setFolderId(c.id)}>{c.name}</span>
              </span>
            ))}
          </div>

          {/* Nouveau dossier inline */}
          {newFolder && (
            <div style={{
              display:'flex', alignItems:'center', gap:8, marginBottom:12,
              padding:'10px 16px', background:'var(--surface-2)', borderRadius:10,
            }}>
              <span style={{fontSize:18}}>📁</span>
              <input className="form-input" placeholder="Nom du dossier…" autoFocus
                value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setNewFolder(false); setNewFolderName('') } }}
                style={{flex:1, maxWidth:280}} />
              <button className="btn btn-primary btn-sm" onClick={handleCreateFolder}>Créer</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setNewFolder(false); setNewFolderName('') }}>Annuler</button>
            </div>
          )}

          {/* Bouton retour */}
          {folderId && (
            <button className="btn btn-secondary btn-sm" style={{marginBottom:12}}
              onClick={() => setFolderId(crumbs.length > 1 ? crumbs[crumbs.length-2].id : null)}>
              <IBack /> Remonter
            </button>
          )}

          {loading ? (
            <div className="card" style={{padding:'40px', textAlign:'center', color:'var(--text-muted)'}}>Chargement…</div>
          ) : isEmpty ? (
            <div className="card empty-state" style={{padding:'60px 20px'}}>
              <div className="empty-state-icon">📂</div>
              <div>Ce dossier est vide</div>
              <div className="text-muted text-sm" style={{marginTop:6}}>
                Créez un sous-dossier ou ajoutez une épreuve
              </div>
            </div>
          ) : (
            <div className="card" style={{padding:0, overflow:'hidden'}}>
              {/* Dossiers */}
              {folders.map(folder => (
                <div key={folder.id}
                  style={{
                    display:'flex', alignItems:'center', gap:12, padding:'12px 20px',
                    borderBottom:'1px solid var(--border)', cursor:'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}
                  onDoubleClick={() => setFolderId(folder.id)}
                  onClick={() => setFolderId(folder.id)}
                >
                  <IFolder />
                  <span style={{flex:1, fontWeight:600, fontSize:14}}>{folder.name}</span>
                  <span style={{fontSize:12, color:'var(--text-muted)'}}>
                    {folder.child_count > 0 && `${folder.child_count} dossier${folder.child_count > 1 ? 's' : ''} · `}
                    {folder.exam_count} épreuve{folder.exam_count !== 1 ? 's' : ''}
                  </span>
                  <button className="btn btn-secondary btn-sm" style={{padding:'3px 8px'}}
                    onClick={e => openFolderMenu(e, folder)}><IDots /></button>
                </div>
              ))}

              {/* Épreuves */}
              {exams.map(exam => (
                <ExamRow key={exam.id} exam={exam} onOpen={() => navigate(`/exams/${exam.id}`)}
                  onMenu={e => openExamMenu(e, exam)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Menu contextuel */}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}

      {/* Modal déplacement */}
      {moveItem && (
        <MoveModal
          item={moveItem.item}
          isFolder={moveItem.isFolder}
          currentFolderId={folderId}
          onMove={handleMove}
          onClose={() => setMoveItem(null)}
        />
      )}
    </>
  )
}

/* ── Ligne épreuve ───────────────────────────────────────────────────────── */
function ExamRow({ exam, onOpen, onMenu, showPath }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12, padding:'12px 20px',
      borderBottom:'1px solid var(--border)', cursor:'pointer',
    }}
      onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background='none'}
      onClick={onOpen}
    >
      <IExam />
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontWeight:600, fontSize:14}}>{exam.title}</div>
        <div style={{fontSize:12, color:'var(--text-muted)', marginTop:1}}>
          {exam.institution} · {exam.nb_questions} questions
          {showPath && exam.folder && <span> · 📁 {exam.folder.name}</span>}
          {exam.groups?.length > 0 && (
            <span> · {exam.groups.map(g => `👥 ${g.name}`).join(', ')}</span>
          )}
        </div>
      </div>
      <span style={{
        fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:12,
        background: exam.has_pdf ? 'var(--success-light, #e6f9f0)' : 'var(--surface-2)',
        color: exam.has_pdf ? 'var(--success, #22a566)' : 'var(--text-muted)',
      }}>
        {exam.has_pdf ? '✓ Grille' : '⚠ Pas de grille'}
      </span>
      <button className="btn btn-secondary btn-sm" style={{padding:'3px 8px'}}
        onClick={e => { e.stopPropagation(); onMenu(e) }}><IDots /></button>
    </div>
  )
}
