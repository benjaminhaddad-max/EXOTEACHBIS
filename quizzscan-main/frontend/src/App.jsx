import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import CreateExam from './pages/CreateExam.jsx'
import ExamDetail from './pages/ExamDetail.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import StudentsPage from './pages/StudentsPage.jsx'

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: '⊞', exact: true },
  { to: '/students', label: 'Étudiants', icon: '👤' },
  { to: '/create', label: 'Nouvelle épreuve', icon: '+' },
]

export default function App() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">Quizz<span>Scan</span></div>
        <nav className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>
          {NAV.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span style={{ fontSize: 16, minWidth: 18 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '0 24px 8px', fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
          v1.0.0
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateExam />} />
          <Route path="/exam/:id" element={<ExamDetail />} />
          <Route path="/students" element={<StudentsPage />} />
        </Routes>
      </main>
    </div>
  )
}
