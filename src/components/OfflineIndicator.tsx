import React from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export const OfflineIndicator: React.FC = () => {
  const { isOnline, isSyncing, pendingCount, syncNow } = useOnlineStatus()

  // Si está online y no hay elementos pendientes ni sincronización activa, no estorba
  if (isOnline && !isSyncing && pendingCount === 0) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: isOnline ? '#1A3A4A' : '#7C2D12',
        border: `1px solid ${isOnline ? '#C9A24A' : '#F97316'}`,
        color: '#F5F1E8',
        padding: '7px 12px',
        borderRadius: '20px',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
        fontSize: '12px',
        fontFamily: "'Inter', sans-serif",
        backdropFilter: 'blur(8px)',
        cursor: isOnline && pendingCount > 0 ? 'pointer' : 'default',
        transition: 'all 0.2s ease'
      }}
      onClick={() => {
        if (isOnline && pendingCount > 0 && !isSyncing) {
          syncNow()
        }
      }}
      title={isOnline && pendingCount > 0 ? 'Clic para sincronizar con la nube ahora' : undefined}
    >
      {!isOnline ? (
        <>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#F97316',
              display: 'inline-block',
              boxShadow: '0 0 8px #F97316'
            }}
          />
          <span style={{ fontWeight: 600 }}>Sin Internet</span>
          <span style={{ opacity: 0.85 }}>· Guardando en este dispositivo</span>
          {pendingCount > 0 && (
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: 700
              }}
            >
              {pendingCount}
            </span>
          )}
        </>
      ) : isSyncing ? (
        <>
          <span
            className="anim-spin"
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              border: '2px solid rgba(201, 162, 74, 0.3)',
              borderTopColor: '#C9A24A',
              borderRadius: '50%'
            }}
          />
          <span style={{ color: '#DFBE72' }}>Sincronizando cambios...</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#C9A24A',
              display: 'inline-block'
            }}
          />
          <span>{pendingCount} pendientes por subir</span>
          <span
            style={{
              color: '#DFBE72',
              textDecoration: 'underline',
              fontWeight: 600,
              fontSize: '11px',
              marginLeft: '2px'
            }}
          >
            Sincronizar
          </span>
        </>
      ) : null}
    </div>
  )
}
