import React, { useState } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { EditConflict } from '../lib/offlineStore'
import { ConflictoResolucionModal } from './ConflictoResolucionModal'

export const OfflineIndicator: React.FC = () => {
  const { isOnline, isSyncing, pendingCount, conflicts, conflictsCount, syncNow } = useOnlineStatus()
  const [conflictoActivo, setConflictoActivo] = useState<EditConflict | null>(null)

  // Si está online y no hay elementos pendientes, ni sincronización, ni conflictos, no estorba
  if (isOnline && !isSyncing && pendingCount === 0 && conflictsCount === 0) {
    return null
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '16px',
          zIndex: 90,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-start'
        }}
      >
        {/* Banner de Conflictos si existen */}
        {conflictsCount > 0 && (
          <div
            onClick={() => setConflictoActivo(conflicts[0])}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, rgba(124, 45, 18, 0.95) 0%, rgba(201, 162, 74, 0.95) 100%)',
              border: '1px solid #DFBE72',
              color: '#FFF9E6',
              padding: '7px 14px',
              borderRadius: '20px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55), 0 0 12px rgba(223, 190, 114, 0.35)',
              fontSize: '12px',
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              animation: 'pulse 2s infinite ease-in-out',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
            title="Haz clic para resolver las diferencias entre este dispositivo y la nube"
          >
            <span style={{ fontSize: '14px' }}>⚠️</span>
            <span style={{ fontWeight: 700 }}>
              {conflictsCount === 1 ? '1 Conflicto de edición' : `${conflictsCount} Conflictos de edición`}
            </span>
            <span
              style={{
                background: '#122834',
                color: '#DFBE72',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 600,
                marginLeft: '4px'
              }}
            >
              Resolver
            </span>
          </div>
        )}

        {/* Indicador de Estado de Conexión / Sincronización */}
        {(!isOnline || isSyncing || pendingCount > 0) && (
          <div
            style={{
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
        )}
      </div>

      {/* Modal de Resolución de Conflicto */}
      {conflictoActivo && (
        <ConflictoResolucionModal
          conflicto={conflictoActivo}
          onClose={() => setConflictoActivo(null)}
          onResolved={() => {
            setConflictoActivo(null)
          }}
        />
      )}
    </>
  )
}
