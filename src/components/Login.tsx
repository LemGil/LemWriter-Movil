import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else onLogin()
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#1A3A4A', padding: '20px'
    }}>
      <div style={{
        background: '#1E3D4F', border: '1px solid #C9A24A',
        borderRadius: '8px', padding: '40px', width: '100%', maxWidth: '360px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/icon-192x192.png" alt="LemWriter" style={{ width: 80, height: 80, borderRadius: '50%', marginBottom: 16 }} />
          <h1 style={{ color: '#C9A24A', fontFamily: 'serif', fontSize: '24px', margin: 0 }}>LemWriter</h1>
          <p style={{ color: '#888', fontSize: '13px', marginTop: 4 }}>Ministerio Apostólico LemGil</p>
        </div>
        <form onSubmit={handleLogin}>
          <input
            type="email" placeholder="Correo" value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: '100%', padding: '12px', marginBottom: '12px',
              background: '#1A3A4A', border: '1px solid #444', borderRadius: '6px',
              color: '#F5F1E8', fontSize: '16px', boxSizing: 'border-box'
            }}
          />
          <input
            type="password" placeholder="Contraseña" value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              width: '100%', padding: '12px', marginBottom: '16px',
              background: '#1A3A4A', border: '1px solid #444', borderRadius: '6px',
              color: '#F5F1E8', fontSize: '16px', boxSizing: 'border-box'
            }}
          />
          {error && <p style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px', background: '#C9A24A',
            border: 'none', borderRadius: '6px', color: '#1A3A4A',
            fontWeight: 'bold', fontSize: '16px', cursor: 'pointer'
          }}>
            {loading ? 'Entrando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
