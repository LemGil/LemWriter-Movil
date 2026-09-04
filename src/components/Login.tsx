import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { setOfflineGuestSession } from '../lib/offlineStore'

interface LoginProps {
  onLogin: () => void
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Por favor ingresa tu correo y contraseña.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      })

      if (authError) {
        if (
          authError.message.includes('Invalid login credentials') ||
          authError.message.includes('invalid_grant') ||
          authError.message.includes('Email not confirmed')
        ) {
          setError('Correo o contraseña incorrectos. Verifica tus credenciales ministeriales.')
        } else {
          setError(authError.message || 'Error al iniciar sesión. Intenta de nuevo.')
        }
      } else {
        onLogin()
      }
    } catch (err: any) {
      setError(err?.message || 'Error inesperado de conexión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(180deg, #1A3A4A 0%, #10242F 100%)',
      padding: '24px 16px',
      boxSizing: 'border-box'
    }}>
      <div className="anim-up" style={{
        background: 'linear-gradient(180deg, #1E3D4F 0%, #173242 100%)',
        border: '1px solid rgba(201, 162, 74, 0.4)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(201, 162, 74, 0.12)',
        borderRadius: '16px',
        padding: '36px 28px',
        width: '100%',
        maxWidth: '390px',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        {/* Cabecera / Identidad */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '16px' }}>
            <img
              src="/icon-192x192.png"
              onError={(e) => {
                const target = e.currentTarget
                if (!target.src.includes('lemwriter-icons')) {
                  target.src = '/lemwriter-icons/icon-192x192.png'
                }
              }}
              alt="LemWriter"
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                border: '2px solid #C9A24A',
                boxShadow: '0 0 16px rgba(201, 162, 74, 0.35)',
                objectFit: 'cover'
              }}
            />
          </div>
          <h1 style={{
            color: '#C9A24A',
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: '24px',
            fontWeight: 700,
            letterSpacing: '1.2px',
            margin: '0 0 4px 0'
          }}>
            LemWriter
          </h1>
          <p style={{
            color: '#9BB0BD',
            fontSize: '12px',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '0.4px',
            margin: 0
          }}>
            Ministerio Apostólico LemGil
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleLogin}>
          {/* Campo Correo */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              color: '#DFBE72',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              marginBottom: '6px',
              letterSpacing: '0.3px'
            }}>
              Correo Ministerial
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                placeholder="ejemplo@lemgil.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: '#142C38',
                  border: '1px solid rgba(201, 162, 74, 0.25)',
                  borderRadius: '10px',
                  color: '#F5F1E8',
                  fontSize: '15px',
                  fontFamily: "'Inter', sans-serif",
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C9A24A'
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(201, 162, 74, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.25)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          {/* Campo Contraseña */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: '#DFBE72',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              marginBottom: '6px',
              letterSpacing: '0.3px'
            }}>
              Clave de Acceso
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={mostrarPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '12px 42px 12px 14px',
                  background: '#142C38',
                  border: '1px solid rgba(201, 162, 74, 0.25)',
                  borderRadius: '10px',
                  color: '#F5F1E8',
                  fontSize: '15px',
                  fontFamily: "'Inter', sans-serif",
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C9A24A'
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(201, 162, 74, 0.2)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.25)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#9BB0BD',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mensaje de error amigable */}
          {error && (
            <div style={{
              background: 'rgba(229, 72, 77, 0.15)',
              border: '1px solid rgba(229, 72, 77, 0.4)',
              color: '#FF8588',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              lineHeight: 1.4,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '14px' }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Botón de Ingreso con Spinner */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              background: loading
                ? '#9A7727'
                : 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 50%, #9A7727 100%)',
              border: 'none',
              borderRadius: '10px',
              color: '#122834',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: "'Cinzel', Georgia, serif",
              letterSpacing: '0.8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3), 0 0 12px rgba(201, 162, 74, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'opacity 0.2s, transform 0.1s'
            }}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = 'scale(0.98)'
            }}
            onMouseUp={(e) => {
              if (!loading) e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            {loading ? (
              <>
                <span className="anim-spin" style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(18, 40, 52, 0.3)',
                  borderTopColor: '#122834',
                  borderRadius: '50%'
                }} />
                <span>Ingresando...</span>
              </>
            ) : (
              <span>Ingresar</span>
            )}
          </button>

          {/* Botón de acceso sin conexión (Modo Local Offline) */}
          <button
            type="button"
            onClick={() => {
              setOfflineGuestSession(true)
              onLogin()
            }}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '11px',
              background: 'rgba(201, 162, 74, 0.08)',
              border: '1px solid rgba(201, 162, 74, 0.3)',
              borderRadius: '10px',
              color: '#DFBE72',
              fontWeight: 600,
              fontSize: '13px',
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(201, 162, 74, 0.18)'
              e.currentTarget.style.borderColor = '#C9A24A'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(201, 162, 74, 0.08)'
              e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.3)'
            }}
          >
            <span>📡</span>
            <span>Trabajar Fuera de Línea (Sin Internet)</span>
          </button>
        </form>

        {/* Separador decorativo */}
        <div style={{
          margin: '24px 0 16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(201, 162, 74, 0.2)' }} />
          <span style={{ color: '#C9A24A', fontSize: '10px' }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(201, 162, 74, 0.2)' }} />
        </div>

        {/* Pie de página institucional */}
        <p style={{
          color: '#8E9EA7',
          fontSize: '11px',
          textAlign: 'center',
          fontFamily: "'Crimson Pro', Georgia, serif",
          fontStyle: 'italic',
          letterSpacing: '0.4px',
          margin: 0
        }}>
          Descodificando la Luz · Academia del Espíritu
        </p>
      </div>
    </div>
  )
}

