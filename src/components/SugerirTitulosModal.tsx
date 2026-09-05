import React, { useState, useEffect } from 'react'
import { Seccion } from './Editor'
import toast from 'react-hot-toast'

export interface TituloSugerido {
  title: string
  subtitle?: string
  category: string
  bibleVerseSuggestion?: string
  reason: string
}

interface SugerirTitulosModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectTitle: (title: string, subtitle?: string) => Promise<void> | void
  currentTitle: string
  projectType?: string
  secciones: Seccion[]
  seccionActivaId?: string
}

export const SugerirTitulosModal: React.FC<SugerirTitulosModalProps> = ({
  isOpen,
  onClose,
  onSelectTitle,
  currentTitle,
  projectType = 'Sermón',
  secciones,
  seccionActivaId,
}) => {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sugerencias, setSugerencias] = useState<TituloSugerido[]>([])
  const [esRespuestaCache, setEsRespuestaCache] = useState(false)
  const [tonoSeleccionado, setTonoSeleccionado] = useState('Apostólico y Ministerial')
  const [alcance, setAlcance] = useState<'todo' | 'seccion'>('todo')
  const [tituloEditando, setTituloEditando] = useState('')
  const [subtituloEditando, setSubtituloEditando] = useState('')
  const [seleccionadoIndex, setSeleccionadoIndex] = useState<number | null>(null)
  const [aplicando, setAplicando] = useState(false)

  // Extraer texto plano según alcance
  const obtenerContenidoAnalisis = () => {
    if (alcance === 'seccion' && seccionActivaId) {
      const sec = secciones.find((s) => s.id === seccionActivaId)
      if (sec && sec.content) {
        return sec.content
      }
    }
    // Todas las secciones combinadas
    return secciones
      .map((s) => `--- Sección: ${s.title} ---\n${s.content || ''}`)
      .join('\n\n')
  }

  // Generar títulos usando la API de Gemini del servidor (con soporte de caché rápida)
  const generarTitulos = async (forzarRefresco = false) => {
    const rawContent = obtenerContenidoAnalisis()
    const plainText = rawContent
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (plainText.length < 10) {
      setError(
        'El proyecto aún no contiene suficiente texto escrito para que la IA extraiga ideas clave. Escribe o dicta al menos unos párrafos y vuelve a intentarlo.'
      )
      setSugerencias([])
      setEsRespuestaCache(false)
      return
    }

    setCargando(true)
    setError(null)
    setSeleccionadoIndex(null)

    try {
      const response = await fetch('/api/titles/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: rawContent,
          currentTitle: currentTitle || 'Sin título',
          type: projectType,
          tone: tonoSeleccionado,
          forceRefresh: forzarRefresco,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al conectar con el servicio de IA.')
      }

      setEsRespuestaCache(!!data.cached)

      if (data.suggestions && data.suggestions.length > 0) {
        setSugerencias(data.suggestions)
        setSeleccionadoIndex(0)
        setTituloEditando(data.suggestions[0].title)
        setSubtituloEditando(data.suggestions[0].subtitle || '')
      } else {
        setError('No se pudieron generar sugerencias. Intenta nuevamente.')
      }
    } catch (err: any) {
      console.error('Error al generar sugerencias:', err)
      let rawMsg = err?.message || ''
      
      // If the error message is a JSON string, try to parse it
      if (rawMsg.startsWith('{') && rawMsg.endsWith('}')) {
        try {
          const parsed = JSON.parse(rawMsg)
          if (parsed?.error?.message) {
            rawMsg = parsed.error.message
          } else if (parsed?.error) {
            rawMsg = String(parsed.error)
          }
        } catch {
          // ignore json parse error
        }
      }

      let mensajeFinal = 'Ocurrió un inconveniente al generar los títulos. Por favor reintenta en unos instantes.'
      if (rawMsg.includes('high demand') || rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE')) {
        mensajeFinal = 'El servicio de IA está experimentando alta demanda momentánea. Presiona "Reintentar Análisis" en unos segundos.'
      } else if (rawMsg.includes('GEMINI_API_KEY')) {
        mensajeFinal = 'La clave de Gemini no está configurada o no tiene permisos. Verifica tus secretos en Settings.'
      } else if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        mensajeFinal = 'Límite de solicitudes de IA alcanzado temporalmente. Espera unos segundos y vuelve a intentar.'
      } else if (rawMsg.length > 0 && !rawMsg.includes('{') && rawMsg.length < 200) {
        mensajeFinal = rawMsg
      }

      setError(mensajeFinal)
    } finally {
      setCargando(false)
    }
  }

  // Cargar sugerencias automáticamente al abrir el modal si no hay previas
  useEffect(() => {
    if (isOpen) {
      setTituloEditando(currentTitle || '')
      setSubtituloEditando('')
      if (sugerencias.length === 0) {
        generarTitulos()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const handleSeleccionar = (sug: TituloSugerido, index: number) => {
    setSeleccionadoIndex(index)
    setTituloEditando(sug.title)
    setSubtituloEditando(sug.subtitle || '')
  }

  const handleAplicar = async () => {
    if (!tituloEditando.trim()) {
      toast.error('El título no puede estar vacío')
      return
    }

    setAplicando(true)
    try {
      await onSelectTitle(tituloEditando.trim(), subtituloEditando.trim())
      toast.success('¡Título del proyecto actualizado!', {
        icon: '✨',
        duration: 2500,
      })
      onClose()
    } catch (err: any) {
      toast.error('Error al actualizar el título')
    } finally {
      setAplicando(false)
    }
  }

  const handleCopiar = (texto: string) => {
    navigator.clipboard?.writeText(texto)
    toast.success('Título copiado al portapapeles', { duration: 1500 })
  }

  const estilosColoresCategoria: Record<string, { bg: string; text: string; border: string }> = {
    Apostólico: { bg: 'rgba(201, 162, 74, 0.15)', text: '#DFBE72', border: 'rgba(201, 162, 74, 0.4)' },
    Profético: { bg: 'rgba(175, 76, 237, 0.15)', text: '#D18EFF', border: 'rgba(175, 76, 237, 0.4)' },
    Expositivo: { bg: 'rgba(48, 164, 108, 0.15)', text: '#4AE098', border: 'rgba(48, 164, 108, 0.4)' },
    Inspirador: { bg: 'rgba(247, 107, 28, 0.15)', text: '#FF9E66', border: 'rgba(247, 107, 28, 0.4)' },
    Doctrinal: { bg: 'rgba(56, 189, 248, 0.15)', text: '#7DD3FC', border: 'rgba(56, 189, 248, 0.4)' },
    Práctico: { bg: 'rgba(234, 179, 8, 0.15)', text: '#FDE047', border: 'rgba(234, 179, 8, 0.4)' },
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 24, 33, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => !cargando && onClose()}
    >
      <div
        className="anim-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #183645 0%, #122631 100%)',
          border: '1px solid rgba(201, 162, 74, 0.4)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(20, 43, 55, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #C9A24A 0%, #8C6819 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                boxShadow: '0 2px 8px rgba(201, 162, 74, 0.3)',
              }}
            >
              ✨
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontFamily: "'Cinzel', serif",
                  fontWeight: 700,
                  color: '#DFBE72',
                  lineHeight: 1.2,
                }}
              >
                Sugerencias de Título con IA
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#9BB0BD' }}>
                Análisis ministerial de contenido con Gemini
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={cargando}
            aria-label="Cerrar modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9BB0BD',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Opciones de Personalización y Filtro */}
        <div
          style={{
            padding: '12px 20px',
            background: 'rgba(14, 33, 43, 0.6)',
            borderBottom: '1px solid rgba(201, 162, 74, 0.15)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          {/* Selector de Tono/Enfoque */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 200px' }}>
            <label
              htmlFor="select-tono-ia"
              style={{ fontSize: '11px', color: '#DFBE72', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Enfoque:
            </label>
            <select
              id="select-tono-ia"
              value={tonoSeleccionado}
              onChange={(e) => setTonoSeleccionado(e.target.value)}
              disabled={cargando}
              style={{
                flex: 1,
                background: '#142C38',
                border: '1px solid rgba(201, 162, 74, 0.3)',
                color: '#F5F1E8',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              <option value="Apostólico y Ministerial">Apostólico & Ministerial</option>
              <option value="Expositivo y Bíblico">Expositivo & Bíblico</option>
              <option value="Inspirador y Profético">Inspirador & Profético</option>
              <option value="Práctico y Transformacional">Práctico & Transformacional</option>
              <option value="Breve e Impactante">Breve & Contundente</option>
              <option value="Doctrinal Profundo">Doctrinal Profundo</option>
            </select>
          </div>

          {/* Selector de Alcance & Botón Regenerar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                background: '#142C38',
                border: '1px solid rgba(201, 162, 74, 0.3)',
                borderRadius: '6px',
                padding: '2px',
              }}
            >
              <button
                onClick={() => setAlcance('todo')}
                disabled={cargando}
                style={{
                  background: alcance === 'todo' ? '#C9A24A' : 'transparent',
                  color: alcance === 'todo' ? '#122631' : '#9BB0BD',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Todo
              </button>
              <button
                onClick={() => setAlcance('seccion')}
                disabled={cargando}
                style={{
                  background: alcance === 'seccion' ? '#C9A24A' : 'transparent',
                  color: alcance === 'seccion' ? '#122631' : '#9BB0BD',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Sección Actual
              </button>
            </div>

            <button
              onClick={() => generarTitulos(true)}
              disabled={cargando}
              title="Volver a generar sugerencias con IA (fuerza consulta a Gemini)"
              style={{
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(20, 43, 55, 0.9) 100%)',
                border: '1px solid #C9A24A',
                color: '#DFBE72',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                cursor: cargando ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: cargando ? 0.6 : 1,
              }}
            >
              <span>{cargando ? '⏳' : '🔄'}</span>
              <span>{cargando ? 'Generando...' : 'Re-analizar'}</span>
            </button>
          </div>
        </div>

        {/* Cuerpo del Modal con Lista de Sugerencias */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Indicador de entrega desde caché del servidor */}
          {esRespuestaCache && !cargando && sugerencias.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(74, 224, 152, 0.1)',
                border: '1px solid rgba(74, 224, 152, 0.3)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11px',
                color: '#4AE098',
                flexWrap: 'wrap',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚡</span>
                <span>
                  <strong>Caché ultra-rápida:</strong> respuesta instantánea servida desde el backend (&lt;5ms).
                </span>
              </div>
              <button
                type="button"
                onClick={() => generarTitulos(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#DFBE72',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textDecoration: 'underline',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                Generar variaciones nuevas
              </button>
            </div>
          )}

          {cargando ? (
            /* Estado de Carga con Animación */
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
              }}
            >
              <div
                className="anim-spin"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '3px solid rgba(201, 162, 74, 0.2)',
                  borderTopColor: '#C9A24A',
                }}
              />
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontFamily: "'Cinzel', serif",
                    color: '#DFBE72',
                    fontSize: '15px',
                  }}
                >
                  Analizando el Mensaje...
                </h4>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#9BB0BD' }}>
                  Gemini está leyendo el contenido para formular títulos edificantes y bíblicos.
                </p>
              </div>
            </div>
          ) : error ? (
            /* Estado de Error */
            <div
              style={{
                padding: '24px 16px',
                backgroundColor: 'rgba(229, 72, 77, 0.1)',
                border: '1px solid rgba(229, 72, 77, 0.3)',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
              <p style={{ color: '#FF9E9E', fontSize: '13px', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                {error}
              </p>
              <button
                onClick={generarTitulos}
                style={{
                  background: '#C9A24A',
                  color: '#122631',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: "'Cinzel', serif",
                }}
              >
                Reintentar Análisis
              </button>
            </div>
          ) : sugerencias.length > 0 ? (
            /* Lista de Sugerencias Generadas */
            sugerencias.map((sug, index) => {
              const esSeleccionado = seleccionadoIndex === index
              const estiloCat =
                estilosColoresCategoria[sug.category] || {
                  bg: 'rgba(201, 162, 74, 0.15)',
                  text: '#DFBE72',
                  border: 'rgba(201, 162, 74, 0.3)',
                }

              return (
                <div
                  key={index}
                  onClick={() => handleSeleccionar(sug, index)}
                  style={{
                    background: esSeleccionado
                      ? 'linear-gradient(135deg, rgba(201, 162, 74, 0.15) 0%, rgba(30, 61, 79, 0.9) 100%)'
                      : 'rgba(20, 43, 55, 0.5)',
                    border: esSeleccionado
                      ? '1.5px solid #C9A24A'
                      : '1px solid rgba(201, 162, 74, 0.2)',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: esSeleccionado
                      ? '0 4px 16px rgba(201, 162, 74, 0.15)'
                      : 'none',
                  }}
                >
                  {/* Badges de Categoría y Cita Bíblica */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: estiloCat.bg,
                        color: estiloCat.text,
                        border: `1px solid ${estiloCat.border}`,
                      }}
                    >
                      {sug.category}
                    </span>

                    {sug.bibleVerseSuggestion && (
                      <span
                        style={{
                          fontSize: '10.5px',
                          color: '#DFBE72',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>📖</span>
                        <span>{sug.bibleVerseSuggestion}</span>
                      </span>
                    )}
                  </div>

                  {/* Título Principal */}
                  <h3
                    style={{
                      margin: '0 0 4px 0',
                      fontFamily: "'Cinzel', Georgia, serif",
                      fontSize: '15px',
                      fontWeight: 700,
                      color: esSeleccionado ? '#FFFFFF' : '#F5F1E8',
                      lineHeight: 1.3,
                    }}
                  >
                    {sug.title}
                  </h3>

                  {/* Subtítulo si existe */}
                  {sug.subtitle && (
                    <p
                      style={{
                        margin: '0 0 8px 0',
                        fontSize: '12px',
                        fontStyle: 'italic',
                        color: '#DFBE72',
                        lineHeight: 1.35,
                      }}
                    >
                      "{sug.subtitle}"
                    </p>
                  )}

                  {/* Justificación Teológica / Razón */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: '11.5px',
                      color: '#9BB0BD',
                      lineHeight: 1.45,
                    }}
                  >
                    {sug.reason}
                  </p>

                  {/* Botones de acción rápida por sugerencia */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      marginTop: '10px',
                      paddingTop: '8px',
                      borderTop: '1px solid rgba(201, 162, 74, 0.12)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopiar(
                          sug.subtitle ? `${sug.title} - ${sug.subtitle}` : sug.title
                        )
                      }}
                      title="Copiar texto del título"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8E9EA7',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      <span>📋</span>
                      <span>Copiar</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSeleccionar(sug, index)
                      }}
                      style={{
                        background: esSeleccionado ? '#C9A24A' : 'rgba(201, 162, 74, 0.15)',
                        color: esSeleccionado ? '#122631' : '#DFBE72',
                        border: '1px solid rgba(201, 162, 74, 0.3)',
                        borderRadius: '6px',
                        padding: '3px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {esSeleccionado ? '✓ Seleccionado' : 'Elegir'}
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 20px', color: '#9BB0BD' }}>
              No hay sugerencias disponibles. Presiona "Re-analizar" para generar títulos.
            </div>
          )}
        </div>

        {/* Sección de Confirmación y Edición Final del Título Elegido */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: 'rgba(20, 43, 55, 0.95)',
            borderTop: '1px solid rgba(201, 162, 74, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div>
            <label
              htmlFor="input-titulo-final"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#DFBE72',
                marginBottom: '4px',
              }}
            >
              Título a aplicar en el proyecto:
            </label>
            <input
              id="input-titulo-final"
              type="text"
              value={tituloEditando}
              onChange={(e) => setTituloEditando(e.target.value)}
              placeholder="Escribe o personaliza el título..."
              style={{
                width: '100%',
                background: '#142C38',
                border: '1px solid #C9A24A',
                color: '#F5F1E8',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13.5px',
                fontWeight: 600,
                fontFamily: "'Cinzel', Georgia, serif",
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={aplicando}
              style={{
                padding: '8px 14px',
                background: '#142C38',
                border: '1px solid #2E4B5E',
                color: '#9BB0BD',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleAplicar}
              disabled={aplicando || !tituloEditando.trim()}
              style={{
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                color: '#122631',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                cursor: aplicando || !tituloEditando.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(201, 162, 74, 0.3)',
                opacity: aplicando || !tituloEditando.trim() ? 0.6 : 1,
              }}
            >
              <span>{aplicando ? '⏳' : '✨'}</span>
              <span>{aplicando ? 'Guardando...' : 'Aplicar como Título'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
