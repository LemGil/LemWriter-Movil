import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Proyectos from './components/Proyectos'
import Editor from './components/Editor'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [proyectoActivo, setProyectoActivo] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#1A3A4A'
    }}>
      <div style={{ color: '#C9A24A', fontSize: 18 }}>Cargando...</div>
    </div>
  )

  if (!session) return <Login onLogin={() => {}} />

  if (proyectoActivo) return (
    <Editor proyecto={proyectoActivo} onBack={() => setProyectoActivo(null)} />
  )

  return (
    <div style={{ background: '#1A3A4A', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '16px', background: '#1E3D4F',
        borderBottom: '1px solid #C9A24A',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/icon-192x192.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
          <span style={{ color: '#C9A24A', fontFamily: 'serif', fontSize: '18px', fontWeight: 'bold' }}>LemWriter</span>
        </div>
        <button onClick={() => supabase.auth.signOut()}
          style={{ background: 'none', border: '1px solid #444', color: '#888', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          Salir
        </button>
      </div>

      {/* Lista de proyectos */}
      <Proyectos onSelect={setProyectoActivo} />
    </div>
  )
}
