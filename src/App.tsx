import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Proyectos from './components/Proyectos'
import Editor from './components/Editor'
import { OfflineIndicator } from './components/OfflineIndicator'
import { PWAInstallButton } from './components/PWAInstallButton'
import { RespaldoTotalModal } from './components/RespaldoTotalModal'
import { isOfflineGuestSession, setOfflineGuestSession } from './lib/offlineStore'

export interface Proyecto {
  id: string
  title: string
  type: string
  updated_at: string
  created_at?: string
  user_id?: string
  _isOfflineOnly?: boolean
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [isGuest, setIsGuest] = useState<boolean>(() => isOfflineGuestSession())
  const [loading, setLoading] = useState(true)
  const [proyectoActivo, setProyectoActivo] = useState<Proyecto | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [tiposDisponibles, setTiposDisponibles] = useState<string[]>([])
  const [modalRespaldoAbierto, setModalRespaldoAbierto] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        setOfflineGuestSession(false)
        setIsGuest(false)
      }
    })

    const handleSessionChange = () => {
      setIsGuest(isOfflineGuestSession())
    }

    const handleAbrirRespaldo = () => {
      setModalRespaldoAbierto(true)
    }

    window.addEventListener('lw:session-change', handleSessionChange)
    window.addEventListener('lw:abrir-respaldo', handleAbrirRespaldo)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('lw:session-change', handleSessionChange)
      window.removeEventListener('lw:abrir-respaldo', handleAbrirRespaldo)
    }
  }, [])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #1A3A4A 0%, #122834 100%)',
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <img
            src="/icon-192x192.png"
            onError={(e) => {
              // fallback if root icon is missing
              const target = e.currentTarget
              if (!target.src.includes('lemwriter-icons')) {
                target.src = '/lemwriter-icons/icon-192x192.png'
              }
            }}
            alt="LemWriter Logo"
            className="anim-pulse-gold"
            style={{
              width: '92px',
              height: '92px',
              borderRadius: '50%',
              border: '2px solid #C9A24A',
              boxShadow: '0 0 20px rgba(201, 162, 74, 0.45)',
              objectFit: 'cover'
            }}
          />
        </div>
        <h1 style={{
          color: '#C9A24A',
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: '26px',
          fontWeight: 700,
          letterSpacing: '1px',
          marginBottom: '6px'
        }}>
          LemWriter
        </h1>
        <p style={{
          color: '#9BB0BD',
          fontSize: '13px',
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.5px'
        }}>
          Ministerio Apostólico LemGil
        </p>
        <div style={{
          marginTop: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#C9A24A',
          fontSize: '13px',
          fontStyle: 'italic',
          fontFamily: "'Crimson Pro', serif"
        }}>
          <span className="anim-spin" style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid rgba(201, 162, 74, 0.3)',
            borderTopColor: '#C9A24A',
            borderRadius: '50%'
          }} />
          Iniciando santuario de escritura...
        </div>
      </div>
    )
  }

  if (!session && !isGuest) {
    return <Login onLogin={() => setIsGuest(isOfflineGuestSession())} />
  }

  if (proyectoActivo) {
    return (
      <>
        <Editor
          proyecto={proyectoActivo}
          onBack={() => setProyectoActivo(null)}
          onUpdateProyecto={(p) => setProyectoActivo((prev) => prev ? { ...prev, ...p } : null)}
        />
        <OfflineIndicator />
      </>
    )
  }

  const handleNuevoProyectoClick = () => {
    window.dispatchEvent(new CustomEvent('lw:nuevo-proyecto'))
  }

  const TIPO_EMOJIS: Record<string, string> = {
    sermon: '🎤',
    ensenanza: '📖',
    devocional: '🕊️',
    libro: '📚',
    video: '🎬',
    estudio: '🔬',
    revelacion: '✨',
    apostolico: '👑'
  }

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <div style={{
      background: 'linear-gradient(180deg, #1A3A4A 0%, #142C38 100%)',
      minHeight: '100vh',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Indicador de conexión / sincronización */}
      <OfflineIndicator />

      {/* Header Rediseñado */}
      <header style={{
        padding: '14px 18px',
        background: 'rgba(30, 61, 79, 0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(201, 162, 74, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              border: '2px solid #C9A24A',
              boxShadow: '0 0 10px rgba(201, 162, 74, 0.35)',
              objectFit: 'cover'
            }}
          />
          <div>
            <span style={{
              color: '#C9A24A',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              display: 'block',
              lineHeight: 1.1
            }}>
              LemWriter
            </span>
            <span style={{
              color: '#8E9EA7',
              fontSize: '11px',
              fontFamily: "'Inter', sans-serif",
              letterSpacing: '0.3px'
            }}>
              {isGuest ? 'Modo Fuera de Línea' : 'Ministerio LemGil'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setModalRespaldoAbierto(true)}
            title="Copia de Seguridad y Guardar todos como PDF"
            style={{
              background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.22) 0%, rgba(30, 61, 79, 0.7) 100%)',
              border: '1px solid #C9A24A',
              color: '#DFBE72',
              padding: '6px 11px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'Cinzel', serif",
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201, 162, 74, 0.35) 0%, rgba(30, 61, 79, 0.9) 100%)'
              e.currentTarget.style.color = '#FFFFFF'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201, 162, 74, 0.22) 0%, rgba(30, 61, 79, 0.7) 100%)'
              e.currentTarget.style.color = '#DFBE72'
            }}
          >
            <span>📦</span>
            <span>RESPALDO</span>
          </button>
          <PWAInstallButton compact />
          <button
            onClick={() => {
              if (isGuest) {
                setOfflineGuestSession(false)
                setIsGuest(false)
              } else {
                supabase.auth.signOut()
              }
            }}
            title={isGuest ? 'Salir del modo fuera de línea' : 'Cerrar sesión'}
            style={{
              background: 'rgba(20, 43, 55, 0.7)',
              border: '1px solid rgba(201, 162, 74, 0.25)',
              color: '#9BB0BD',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#C9A24A'
              e.currentTarget.style.color = '#F5F1E8'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.25)'
              e.currentTarget.style.color = '#9BB0BD'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            {isGuest ? 'Acceder' : 'Salir'}
          </button>
        </div>
      </header>

      {/* Controles de búsqueda y filtros */}
      <div style={{
        padding: '16px 16px 8px 16px',
        maxWidth: '840px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box'
      }}>
        {/* Barra de Búsqueda Integrada */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <span style={{
            position: 'absolute',
            left: '14px',
            color: '#C9A24A',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            type="text"
            placeholder="Buscar por título de mensaje o sermón..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              padding: '13px 40px 13px 44px',
              background: '#142C38',
              border: '1px solid rgba(201, 162, 74, 0.25)',
              borderRadius: '12px',
              color: '#F5F1E8',
              fontSize: '15px',
              fontFamily: "'Inter', sans-serif",
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#C9A24A'
              e.currentTarget.style.boxShadow = '0 0 12px rgba(201, 162, 74, 0.2)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.25)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              style={{
                position: 'absolute',
                right: '12px',
                background: 'none',
                border: 'none',
                color: '#8E9EA7',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>

        {/* Chips / Pills de filtro por tipo */}
        {tiposDisponibles.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '6px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
            <button
              onClick={() => setFiltroTipo('todos')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: filtroTipo === 'todos' ? '1px solid #C9A24A' : '1px solid rgba(201, 162, 74, 0.15)',
                background: filtroTipo === 'todos' ? 'rgba(201, 162, 74, 0.18)' : '#1E3D4F',
                color: filtroTipo === 'todos' ? '#C9A24A' : '#9BB0BD',
                fontSize: '12px',
                fontWeight: filtroTipo === 'todos' ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease'
              }}
            >
              ✨ Todos
            </button>
            {tiposDisponibles.map((tipo) => {
              const activo = filtroTipo === tipo
              const emoji = TIPO_EMOJIS[tipo.toLowerCase()] || '📝'
              return (
                <button
                  key={tipo}
                  onClick={() => setFiltroTipo(activo ? 'todos' : tipo)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: activo ? '1px solid #C9A24A' : '1px solid rgba(201, 162, 74, 0.15)',
                    background: activo ? 'rgba(201, 162, 74, 0.18)' : '#1E3D4F',
                    color: activo ? '#C9A24A' : '#9BB0BD',
                    fontSize: '12px',
                    fontWeight: activo ? 600 : 400,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {emoji} {capitalize(tipo)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista de proyectos */}
      <main style={{
        flex: 1,
        maxWidth: '840px',
        width: '100%',
        margin: '0 auto',
        padding: '0 16px 80px 16px',
        boxSizing: 'border-box'
      }}>
        <Proyectos
          onSelect={setProyectoActivo}
          busqueda={busqueda}
          filtroTipo={filtroTipo}
          onTiposLoaded={setTiposDisponibles}
          session={session}
        />
      </main>

      {/* Botón Flotante de Nuevo Proyecto (FAB) */}
      <button
        onClick={handleNuevoProyectoClick}
        aria-label="Nuevo Proyecto"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 50%, #9A7727 100%)',
          color: '#122834',
          border: 'none',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 16px rgba(201, 162, 74, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#122834" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      {/* Modal de Respaldo Total y PDF Consolidado */}
      {modalRespaldoAbierto && (
        <RespaldoTotalModal
          onClose={() => setModalRespaldoAbierto(false)}
          onRestauracionExitosa={() => {
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}

