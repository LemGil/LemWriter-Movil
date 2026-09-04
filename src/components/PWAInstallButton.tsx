import React, { useState } from 'react'
import { usePWAInstall } from '../hooks/usePWAInstall'

interface PWAInstallButtonProps {
  compact?: boolean
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall()
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  // Si ya está instalado como app nativa / PWA standalone, no se muestra
  if (isInstalled) {
    return null
  }

  // Flujo para Chrome, Android, Edge, Desktop
  if (isInstallable) {
    return (
      <button
        onClick={install}
        title="Instalar LemWriter en tu dispositivo para uso sin conexión"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(201, 162, 74, 0.12) 100%)',
          border: '1px solid #C9A24A',
          color: '#DFBE72',
          padding: compact ? '6px 10px' : '8px 14px',
          borderRadius: '20px',
          fontSize: compact ? '11px' : '12px',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(201, 162, 74, 0.35)'
          e.currentTarget.style.borderColor = '#DFBE72'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(201, 162, 74, 0.12) 100%)'
          e.currentTarget.style.borderColor = '#C9A24A'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>{compact ? 'Instalar App' : 'Instalar para uso Offline'}</span>
      </button>
    )
  }

  // Flujo para iOS Safari (guía de "Agregar a pantalla de inicio")
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          title="Instalar en iPhone / iPad"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(201, 162, 74, 0.15)',
            border: '1px solid rgba(201, 162, 74, 0.4)',
            color: '#DFBE72',
            padding: compact ? '6px 10px' : '8px 12px',
            borderRadius: '20px',
            fontSize: compact ? '11px' : '12px',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <span>Instalar App iOS</span>
        </button>

        {showIOSGuide && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(10, 24, 33, 0.8)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              zIndex: 200
            }}
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="anim-up"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#1E3D4F',
                border: '1px solid #C9A24A',
                borderRadius: '16px',
                padding: '24px',
                width: '100%',
                maxWidth: '360px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.6)'
              }}
            >
              <h3 style={{
                color: '#C9A24A',
                fontFamily: "'Cinzel', serif",
                fontSize: '17px',
                margin: '0 0 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>📱</span>
                <span>Instalar en iPhone / iPad</span>
              </h3>
              <p style={{
                color: '#F5F1E8',
                fontSize: '13px',
                lineHeight: 1.5,
                margin: '0 0 16px 0'
              }}>
                Para usar <strong>LemWriter</strong> sin internet y como app de pantalla completa:
              </p>
              <ol style={{
                color: '#DFBE72',
                fontSize: '13px',
                lineHeight: 1.6,
                paddingLeft: '20px',
                margin: '0 0 20px 0'
              }}>
                <li>Toca el botón <strong>Compartir (Share)</strong> en la barra de Safari.</li>
                <li>Desplázate hacia abajo y selecciona <strong>&quot;Agregar al inicio&quot; (Add to Home Screen)</strong>.</li>
                <li>Toca <strong>Agregar</strong> en la esquina superior derecha.</li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#122834',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return null
}
