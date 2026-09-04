import React, { useState, useEffect } from 'react'
import { Seccion } from './Editor'

export type TemaLectura = 'nocturno' | 'diurno' | 'sepia'

interface ModoLecturaModalProps {
  proyecto: { title: string; type?: string; updated_at?: string }
  secciones: Seccion[]
  seccionInicialId?: string
  temaInicial?: TemaLectura
  onClose: () => void
  onCambiarTemaGlobal?: (tema: TemaLectura) => void
}

export const ModoLecturaModal: React.FC<ModoLecturaModalProps> = ({
  proyecto,
  secciones,
  seccionInicialId,
  temaInicial = 'nocturno',
  onClose,
  onCambiarTemaGlobal
}) => {
  const [tema, setTema] = useState<TemaLectura>(() => {
    return (localStorage.getItem('lemwriter_reading_theme') as TemaLectura) || temaInicial
  })
  const [tamanoLetra, setTamanoLetra] = useState<number>(() => {
    const saved = localStorage.getItem('lemwriter_reading_font_size')
    return saved ? parseInt(saved, 10) : 21
  })
  const [vistaCompleta, setVistaCompleta] = useState<boolean>(false)
  const [seccionIndex, setSeccionIndex] = useState<number>(() => {
    if (seccionInicialId) {
      const idx = secciones.findIndex((s) => s.id === seccionInicialId)
      return idx >= 0 ? idx : 0
    }
    return 0
  })
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Guardar tema y notificar cambios
  const handleCambiarTema = (nuevoTema: TemaLectura) => {
    setTema(nuevoTema)
    localStorage.setItem('lemwriter_reading_theme', nuevoTema)
    if (onCambiarTemaGlobal) {
      onCambiarTemaGlobal(nuevoTema)
    }
  }

  // Guardar tamaño de letra
  const cambiarTamanoLetra = (delta: number) => {
    setTamanoLetra((prev) => {
      const nuevo = Math.min(Math.max(prev + delta, 15), 32)
      localStorage.setItem('lemwriter_reading_font_size', nuevo.toString())
      return nuevo
    })
  }

  // Pantalla completa
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Colores según el tema
  const configTema = {
    nocturno: {
      bg: '#122631',
      canvasBg: '#183645',
      text: '#F5F1E8',
      textMuted: '#9BB0BD',
      headerBg: 'rgba(21, 46, 59, 0.95)',
      gold: '#DFBE72',
      border: 'rgba(201, 162, 74, 0.3)',
      cardBg: '#1E3D4F',
      quoteBg: 'rgba(201, 162, 74, 0.08)',
      quoteText: '#D7E3EB',
      buttonBg: 'rgba(20, 43, 55, 0.8)'
    },
    diurno: {
      bg: '#F5F2EC',
      canvasBg: '#FFFFFF',
      text: '#1C2730',
      textMuted: '#576D7C',
      headerBg: 'rgba(240, 235, 226, 0.95)',
      gold: '#997321',
      border: 'rgba(153, 115, 33, 0.3)',
      cardBg: '#F0ECE3',
      quoteBg: '#F4EFE6',
      quoteText: '#2D3E4C',
      buttonBg: 'rgba(230, 224, 212, 0.9)'
    },
    sepia: {
      bg: '#EAE1D0',
      canvasBg: '#F5EEDB',
      text: '#2D2319',
      textMuted: '#6E5C49',
      headerBg: 'rgba(230, 220, 203, 0.95)',
      gold: '#8C631B',
      border: 'rgba(140, 99, 27, 0.3)',
      cardBg: '#E4D8C3',
      quoteBg: '#ECE2CE',
      quoteText: '#443525',
      buttonBg: 'rgba(220, 209, 190, 0.9)'
    }
  }[tema]

  const seccionActual = secciones[seccionIndex] || secciones[0]

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: configTema.bg,
        color: configTema.text,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'background-color 0.25s ease, color 0.25s ease'
      }}
    >
      {/* Barra Superior de Control de Lectura */}
      <header
        style={{
          padding: 'max(10px, env(safe-area-inset-top, 10px)) 14px 10px 14px',
          backgroundColor: configTema.headerBg,
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${configTema.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexShrink: 0,
          zIndex: 10
        }}
      >
        {/* Botón Salir y Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <button
            onClick={onClose}
            title="Salir del modo lectura"
            style={{
              background: configTema.buttonBg,
              border: `1px solid ${configTema.border}`,
              color: configTema.gold,
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: "'Cinzel', serif",
              flexShrink: 0
            }}
          >
            <span>✕</span>
            <span className="hidden sm:inline">Editor</span>
          </button>

          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                color: configTema.gold,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {proyecto.title}
            </h1>
            <div style={{ fontSize: '10px', color: configTema.textMuted, marginTop: '1px' }}>
              Modo Púlpito & Lectura Ministerial
            </div>
          </div>
        </div>

        {/* Controles: Tema Diurno/Nocturno/Sepia + Tamaño Letra + Vista */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          {/* Selector Diurno / Nocturno / Sepia */}
          <div
            style={{
              display: 'flex',
              background: configTema.buttonBg,
              border: `1px solid ${configTema.border}`,
              borderRadius: '8px',
              padding: '2px',
              gap: '2px'
            }}
          >
            <button
              onClick={() => handleCambiarTema('diurno')}
              title="Lectura Diurna (Fondo Claro)"
              style={{
                background: tema === 'diurno' ? configTema.gold : 'transparent',
                color: tema === 'diurno' ? '#FFFFFF' : configTema.textMuted,
                border: 'none',
                borderRadius: '6px',
                padding: '4px 7px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontWeight: tema === 'diurno' ? 700 : 500
              }}
            >
              <span>☀️</span>
              <span className="hidden sm:inline" style={{ fontSize: '11px' }}>Día</span>
            </button>

            <button
              onClick={() => handleCambiarTema('sepia')}
              title="Lectura Sepia (Pergamino Cálido)"
              style={{
                background: tema === 'sepia' ? configTema.gold : 'transparent',
                color: tema === 'sepia' ? '#FFFFFF' : configTema.textMuted,
                border: 'none',
                borderRadius: '6px',
                padding: '4px 7px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontWeight: tema === 'sepia' ? 700 : 500
              }}
            >
              <span>📜</span>
              <span className="hidden sm:inline" style={{ fontSize: '11px' }}>Sepia</span>
            </button>

            <button
              onClick={() => handleCambiarTema('nocturno')}
              title="Lectura Nocturna (Fondo Oscuro / Púlpito)"
              style={{
                background: tema === 'nocturno' ? configTema.gold : 'transparent',
                color: tema === 'nocturno' ? '#122631' : configTema.textMuted,
                border: 'none',
                borderRadius: '6px',
                padding: '4px 7px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontWeight: tema === 'nocturno' ? 700 : 500
              }}
            >
              <span>🌙</span>
              <span className="hidden sm:inline" style={{ fontSize: '11px' }}>Noche</span>
            </button>
          </div>

          {/* Ajuste de Tamaño de Letra A- / A+ */}
          <div
            style={{
              display: 'flex',
              background: configTema.buttonBg,
              border: `1px solid ${configTema.border}`,
              borderRadius: '8px',
              padding: '2px'
            }}
          >
            <button
              onClick={() => cambiarTamanoLetra(-2)}
              title="Reducir tamaño de letra"
              style={{
                background: 'transparent',
                border: 'none',
                color: configTema.gold,
                padding: '4px 7px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              A-
            </button>
            <div style={{ width: '1px', background: configTema.border, margin: '2px 0' }} />
            <button
              onClick={() => cambiarTamanoLetra(2)}
              title="Aumentar tamaño de letra"
              style={{
                background: 'transparent',
                border: 'none',
                color: configTema.gold,
                padding: '4px 7px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              A+
            </button>
          </div>

          {/* Toggle Pantalla Completa */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa para púlpito'}
            style={{
              background: configTema.buttonBg,
              border: `1px solid ${configTema.border}`,
              color: configTema.gold,
              padding: '5px 8px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
        </div>
      </header>

      {/* Selector de modo: Por Sección vs Sermón Completo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          backgroundColor: configTema.cardBg,
          borderBottom: `1px solid ${configTema.border}`,
          fontSize: '12px',
          gap: '8px',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setVistaCompleta(false)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: !vistaCompleta ? `1px solid ${configTema.gold}` : '1px solid transparent',
              background: !vistaCompleta ? configTema.canvasBg : 'transparent',
              color: !vistaCompleta ? configTema.gold : configTema.textMuted,
              fontWeight: !vistaCompleta ? 700 : 500,
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px'
            }}
          >
            Por Secciones
          </button>
          <button
            onClick={() => setVistaCompleta(true)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: vistaCompleta ? `1px solid ${configTema.gold}` : '1px solid transparent',
              background: vistaCompleta ? configTema.canvasBg : 'transparent',
              color: vistaCompleta ? configTema.gold : configTema.textMuted,
              fontWeight: vistaCompleta ? 700 : 500,
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px'
            }}
          >
            Sermón Completo
          </button>
        </div>

        {!vistaCompleta && secciones.length > 0 && (
          <div style={{ color: configTema.textMuted, fontSize: '11px', fontWeight: 600 }}>
            Sección {seccionIndex + 1} de {secciones.length}
          </div>
        )}
      </div>

      {/* Canvas de Lectura Principal */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 16px 80px 16px',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div
          style={{
            maxWidth: '780px',
            margin: '0 auto',
            backgroundColor: configTema.canvasBg,
            borderRadius: '14px',
            padding: '28px 22px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            border: `1px solid ${configTema.border}`,
            transition: 'all 0.25s ease'
          }}
        >
          {vistaCompleta ? (
            /* Vista del Sermón Completo de Inicio a Fin */
            <div>
              <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: `1px solid ${configTema.border}`, paddingBottom: '20px' }}>
                <span style={{ fontSize: '11px', letterSpacing: '2px', color: configTema.gold, fontFamily: "'Cinzel', serif", fontWeight: 700, textTransform: 'uppercase' }}>
                  {proyecto.type || 'Sermón'}
                </span>
                <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: `${tamanoLetra + 6}px`, color: configTema.gold, margin: '8px 0', lineHeight: 1.25 }}>
                  {proyecto.title}
                </h1>
                <p style={{ fontSize: '12px', color: configTema.textMuted, margin: 0 }}>
                  Lectura Ministerial Completa ({secciones.length} secciones)
                </p>
              </div>

              {secciones.map((sec, idx) => (
                <div key={sec.id} style={{ marginBottom: '40px', paddingBottom: '30px', borderBottom: idx < secciones.length - 1 ? `1px dashed ${configTema.border}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: `${tamanoLetra}px`, color: configTema.gold, fontWeight: 700 }}>
                      {idx + 1}.
                    </span>
                    <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: `${tamanoLetra + 2}px`, color: configTema.gold, margin: 0, fontWeight: 600 }}>
                      {sec.title}
                    </h2>
                  </div>

                  <div
                    className={`contenido-lectura tema-${tema}`}
                    style={{
                      fontFamily: "'Crimson Pro', Georgia, serif",
                      fontSize: `${tamanoLetra}px`,
                      lineHeight: 1.85,
                      color: configTema.text
                    }}
                    dangerouslySetInnerHTML={{
                      __html: sec.content || '<p style="font-style: italic; opacity: 0.6;">(Sección sin contenido)</p>'
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            /* Vista por Sección Individual con Navegación Fácil */
            <div>
              {seccionActual ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${configTema.border}`, paddingBottom: '14px', marginBottom: '22px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: configTema.gold, fontFamily: "'Cinzel', serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Sección {seccionIndex + 1} de {secciones.length}
                      </span>
                      <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: `${tamanoLetra + 4}px`, color: configTema.gold, margin: '4px 0 0 0', fontWeight: 700 }}>
                        {seccionActual.title}
                      </h2>
                    </div>
                  </div>

                  <div
                    className={`contenido-lectura tema-${tema}`}
                    style={{
                      fontFamily: "'Crimson Pro', Georgia, serif",
                      fontSize: `${tamanoLetra}px`,
                      lineHeight: 1.85,
                      color: configTema.text,
                      minHeight: '260px'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: seccionActual.content || '<p style="font-style: italic; opacity: 0.6;">(Esta sección aún no tiene contenido escrito)</p>'
                    }}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: configTema.textMuted }}>
                  No hay secciones disponibles en este proyecto.
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Barra Inferior de Navegación entre Secciones (cuando no está en modo continuo) */}
      {!vistaCompleta && secciones.length > 1 && (
        <footer
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: configTema.headerBg,
            backdropFilter: 'blur(10px)',
            borderTop: `1px solid ${configTema.border}`,
            padding: '8px 16px calc(8px + env(safe-area-inset-bottom, 0px)) 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            zIndex: 10
          }}
        >
          <button
            onClick={() => setSeccionIndex((prev) => Math.max(0, prev - 1))}
            disabled={seccionIndex === 0}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              border: `1px solid ${seccionIndex > 0 ? configTema.border : 'transparent'}`,
              background: seccionIndex > 0 ? configTema.buttonBg : 'transparent',
              color: seccionIndex > 0 ? configTema.gold : configTema.textMuted,
              fontWeight: 700,
              fontSize: '12px',
              fontFamily: "'Cinzel', serif",
              cursor: seccionIndex > 0 ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: seccionIndex === 0 ? 0.4 : 1
            }}
          >
            <span>←</span>
            <span>Anterior</span>
          </button>

          <div style={{ textAlign: 'center', minWidth: '80px', fontSize: '11px', color: configTema.textMuted, fontWeight: 600 }}>
            {seccionIndex + 1} / {secciones.length}
          </div>

          <button
            onClick={() => setSeccionIndex((prev) => Math.min(secciones.length - 1, prev + 1))}
            disabled={seccionIndex >= secciones.length - 1}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              border: `1px solid ${seccionIndex < secciones.length - 1 ? configTema.border : 'transparent'}`,
              background: seccionIndex < secciones.length - 1 ? configTema.buttonBg : 'transparent',
              color: seccionIndex < secciones.length - 1 ? configTema.gold : configTema.textMuted,
              fontWeight: 700,
              fontSize: '12px',
              fontFamily: "'Cinzel', serif",
              cursor: seccionIndex < secciones.length - 1 ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: seccionIndex >= secciones.length - 1 ? 0.4 : 1
            }}
          >
            <span>Siguiente</span>
            <span>→</span>
          </button>
        </footer>
      )}
    </div>
  )
}
