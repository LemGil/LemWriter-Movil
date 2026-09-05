import React, { useState } from 'react'
import { EditConflict, resolveConflict } from '../lib/offlineStore'
import toast from 'react-hot-toast'

interface ConflictoResolucionModalProps {
  conflicto: EditConflict
  onClose: () => void
  onResolved?: (resolution: 'keep_local' | 'keep_remote' | 'keep_both' | 'merge', newSectionId?: string) => void
}

export const ConflictoResolucionModal: React.FC<ConflictoResolucionModalProps> = ({
  conflicto,
  onClose,
  onResolved
}) => {
  const [resolviendo, setResolviendo] = useState(false)
  const [vistaActiva, setVistaActiva] = useState<'comparativa' | 'local' | 'remota'>('comparativa')

  const contarPalabras = (html: string) => {
    const texto = (html || '').replace(/<[^>]*>/g, ' ').trim()
    return texto ? texto.split(/\s+/).length : 0
  }

  const formatoFecha = (fechaIso?: string) => {
    if (!fechaIso) return 'Desconocida'
    try {
      const d = new Date(fechaIso)
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return fechaIso
    }
  }

  const palabrasLocal = contarPalabras(conflicto.localContent)
  const palabrasRemota = contarPalabras(conflicto.remoteContent)

  const ejecutarResolucion = async (
    resolucion: 'keep_local' | 'keep_remote' | 'keep_both' | 'merge'
  ) => {
    if (resolviendo) return
    setResolviendo(true)

    try {
      const res = await resolveConflict(conflicto.id, resolucion)
      if (res.success) {
        const mensajes: Record<string, string> = {
          keep_local: 'Se conservó tu versión local y se actualizó la nube.',
          keep_remote: 'Se adoptó la versión más reciente de la nube.',
          keep_both: 'Se crearon dos secciones para conservar ambos textos.',
          merge: 'Se combinaron ambas versiones en esta sección.'
        }
        toast.success(mensajes[resolucion] || 'Conflicto resuelto con éxito', {
          icon: '✨',
          duration: 3500
        })
        onResolved?.(resolucion, res.newSectionId)
        onClose()
      } else {
        toast.error('No se pudo resolver el conflicto automáticamente.')
      }
    } catch (err) {
      console.error('Error resolviendo conflicto:', err)
      toast.error('Ocurrió un error al procesar la resolución.')
    } finally {
      setResolviendo(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 12, 18, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !resolviendo) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '850px',
          maxHeight: '92vh',
          backgroundColor: '#0F212E',
          border: '1px solid rgba(201, 162, 74, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 30px rgba(201, 162, 74, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(26, 58, 74, 0.4) 0%, rgba(15, 33, 46, 0.9) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(201, 162, 74, 0.15)',
                border: '1px solid rgba(201, 162, 74, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                color: '#DFBE72'
              }}
            >
              ⚠️
            </div>
            <div>
              <h2
                style={{
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#F5F1E8',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Conflicto de Edición Detectado
              </h2>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '12px',
                  color: '#9BB0C1',
                  margin: '3px 0 0 0'
                }}
              >
                {conflicto.projectTitle ? `${conflicto.projectTitle} · ` : ''}Sección: <strong>{conflicto.sectionTitle}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={resolviendo}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8A9BA8',
              fontSize: '20px',
              cursor: resolviendo ? 'not-allowed' : 'pointer',
              padding: '6px',
              lineHeight: 1,
              borderRadius: '6px'
            }}
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Explicación Concisa */}
        <div
          style={{
            padding: '12px 24px',
            background: 'rgba(201, 162, 74, 0.08)',
            borderBottom: '1px solid rgba(201, 162, 74, 0.15)',
            fontSize: '13px',
            color: '#E6D7B8',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <span style={{ fontSize: '18px' }}>💡</span>
          <span>
            Esta sección se editó en dos dispositivos diferentes o se realizaron cambios sin conexión que entraron en conflicto con la nube.
            Selecciona qué acción deseas realizar para conciliar ambas versiones de forma segura:
          </span>
        </div>

        {/* Resumen de Versiones y Pestañas de Vista */}
        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#0C1B26'
          }}
        >
          {/* Ficha Local */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(30, 65, 85, 0.45)',
              border: '1px solid rgba(155, 176, 193, 0.2)',
              fontSize: '12px'
            }}
          >
            <span style={{ fontSize: '15px' }}>📱</span>
            <div>
              <span style={{ color: '#DFBE72', fontWeight: 600 }}>Este Dispositivo: </span>
              <span style={{ color: '#F5F1E8' }}>{palabrasLocal} palabras</span>
              <span style={{ color: '#8A9BA8', marginLeft: '6px' }}>({formatoFecha(conflicto.localUpdatedAt)})</span>
            </div>
          </div>

          {/* Ficha Nube */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(201, 162, 74, 0.1)',
              border: '1px solid rgba(201, 162, 74, 0.3)',
              fontSize: '12px'
            }}
          >
            <span style={{ fontSize: '15px' }}>☁️</span>
            <div>
              <span style={{ color: '#DFBE72', fontWeight: 600 }}>Nube / Otro Equipo: </span>
              <span style={{ color: '#F5F1E8' }}>{palabrasRemota} palabras</span>
              <span style={{ color: '#8A9BA8', marginLeft: '6px' }}>({formatoFecha(conflicto.remoteUpdatedAt)})</span>
            </div>
          </div>

          {/* Selector de Pestañas */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(10, 22, 30, 0.8)', padding: '3px', borderRadius: '8px' }}>
            <button
              onClick={() => setVistaActiva('comparativa')}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: vistaActiva === 'comparativa' ? '#1E4155' : 'transparent',
                color: vistaActiva === 'comparativa' ? '#F5F1E8' : '#8A9BA8',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: vistaActiva === 'comparativa' ? 600 : 400
              }}
            >
              Lado a lado
            </button>
            <button
              onClick={() => setVistaActiva('local')}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: vistaActiva === 'local' ? '#1E4155' : 'transparent',
                color: vistaActiva === 'local' ? '#F5F1E8' : '#8A9BA8',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: vistaActiva === 'local' ? 600 : 400
              }}
            >
              Solo Local
            </button>
            <button
              onClick={() => setVistaActiva('remota')}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: vistaActiva === 'remota' ? '#1E4155' : 'transparent',
                color: vistaActiva === 'remota' ? '#F5F1E8' : '#8A9BA8',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: vistaActiva === 'remota' ? 600 : 400
              }}
            >
              Solo Nube
            </button>
          </div>
        </div>

        {/* Área de Visualización y Comparación de Texto */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
            maxHeight: '380px',
            backgroundColor: '#09151E'
          }}
        >
          {vistaActiva === 'comparativa' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px'
              }}
            >
              {/* Columna Local */}
              <div
                style={{
                  background: 'rgba(15, 33, 46, 0.7)',
                  border: '1px solid rgba(155, 176, 193, 0.15)',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#9BB0C1',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>📱 Tu Versión en este dispositivo</span>
                  <span style={{ fontSize: '11px', color: '#DFBE72' }}>{palabrasLocal} palabras</span>
                </div>
                <div
                  style={{
                    color: '#E0E6ED',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    maxHeight: '260px',
                    overflowY: 'auto',
                    paddingRight: '6px'
                  }}
                  dangerouslySetInnerHTML={{ __html: conflicto.localContent || '<p><em>(Sección vacía)</em></p>' }}
                />
              </div>

              {/* Columna Remota */}
              <div
                style={{
                  background: 'rgba(15, 33, 46, 0.7)',
                  border: '1px solid rgba(201, 162, 74, 0.25)',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#DFBE72',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>☁️ Versión en la Nube / Otro Dispositivo</span>
                  <span style={{ fontSize: '11px', color: '#DFBE72' }}>{palabrasRemota} palabras</span>
                </div>
                <div
                  style={{
                    color: '#E0E6ED',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    maxHeight: '260px',
                    overflowY: 'auto',
                    paddingRight: '6px'
                  }}
                  dangerouslySetInnerHTML={{ __html: conflicto.remoteContent || '<p><em>(Sección vacía)</em></p>' }}
                />
              </div>
            </div>
          ) : vistaActiva === 'local' ? (
            <div
              style={{
                background: 'rgba(15, 33, 46, 0.7)',
                border: '1px solid rgba(155, 176, 193, 0.2)',
                borderRadius: '10px',
                padding: '18px',
                color: '#E0E6ED',
                fontSize: '14px',
                lineHeight: 1.7
              }}
              dangerouslySetInnerHTML={{ __html: conflicto.localContent || '<p><em>(Sección vacía)</em></p>' }}
            />
          ) : (
            <div
              style={{
                background: 'rgba(15, 33, 46, 0.7)',
                border: '1px solid rgba(201, 162, 74, 0.3)',
                borderRadius: '10px',
                padding: '18px',
                color: '#E0E6ED',
                fontSize: '14px',
                lineHeight: 1.7
              }}
              dangerouslySetInnerHTML={{ __html: conflicto.remoteContent || '<p><em>(Sección vacía)</em></p>' }}
            />
          )}
        </div>

        {/* Opciones de Resolución (4 Estrategias Claras) */}
        <div
          style={{
            padding: '16px 24px 20px',
            backgroundColor: '#0F212E',
            borderTop: '1px solid rgba(201, 162, 74, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#DFBE72',
              textTransform: 'uppercase',
              letterSpacing: '0.6px'
            }}
          >
            Elige una opción para resolver este conflicto:
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px'
            }}
          >
            {/* Opción 1: Conservar ambas (Recomendada) */}
            <button
              onClick={() => ejecutarResolucion('keep_both')}
              disabled={resolviendo}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(26, 58, 74, 0.8) 100%)',
                border: '1px solid #C9A24A',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#F5F1E8',
                cursor: resolviendo ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = '#DFBE72'
              }}
              onMouseLeave={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = '#C9A24A'
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }}>📑</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#F5F1E8' }}>
                  Conservar Ambas Versiones
                </div>
                <div style={{ fontSize: '11px', color: '#DFBE72', marginTop: '2px', lineHeight: 1.3 }}>
                  Mantiene la versión remota y crea una copia con tu texto local. ¡Cero pérdida!
                </div>
              </div>
            </button>

            {/* Opción 2: Combinar contenidos */}
            <button
              onClick={() => ejecutarResolucion('merge')}
              disabled={resolviendo}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                background: 'rgba(26, 58, 74, 0.5)',
                border: '1px solid rgba(201, 162, 74, 0.3)',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#F5F1E8',
                cursor: resolviendo ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = '#C9A24A'
              }}
              onMouseLeave={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.3)'
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }}>🔀</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#F5F1E8' }}>
                  Combinar Ambas en una
                </div>
                <div style={{ fontSize: '11px', color: '#9BB0C1', marginTop: '2px', lineHeight: 1.3 }}>
                  Une ambos textos separados con un divisor para que puedas editarlos juntos.
                </div>
              </div>
            </button>

            {/* Opción 3: Conservar mi versión local */}
            <button
              onClick={() => ejecutarResolucion('keep_local')}
              disabled={resolviendo}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                background: 'rgba(26, 58, 74, 0.35)',
                border: '1px solid rgba(155, 176, 193, 0.2)',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#F5F1E8',
                cursor: resolviendo ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = 'rgba(155, 176, 193, 0.4)'
              }}
              onMouseLeave={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = 'rgba(155, 176, 193, 0.2)'
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }}>🌟</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#F5F1E8' }}>
                  Conservar Solo Mi Versión Local
                </div>
                <div style={{ fontSize: '11px', color: '#9BB0C1', marginTop: '2px', lineHeight: 1.3 }}>
                  Sobrescribe la nube con el contenido que editaste en este dispositivo.
                </div>
              </div>
            </button>

            {/* Opción 4: Aceptar versión de la nube */}
            <button
              onClick={() => ejecutarResolucion('keep_remote')}
              disabled={resolviendo}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                background: 'rgba(26, 58, 74, 0.35)',
                border: '1px solid rgba(155, 176, 193, 0.2)',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#F5F1E8',
                cursor: resolviendo ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = 'rgba(155, 176, 193, 0.4)'
              }}
              onMouseLeave={(e) => {
                if (!resolviendo) e.currentTarget.style.borderColor = 'rgba(155, 176, 193, 0.2)'
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }}>☁️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#F5F1E8' }}>
                  Aceptar Versión de la Nube
                </div>
                <div style={{ fontSize: '11px', color: '#9BB0C1', marginTop: '2px', lineHeight: 1.3 }}>
                  Descarta los cambios locales y adopta el texto del otro dispositivo.
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
