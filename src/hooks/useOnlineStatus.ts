import { useState, useEffect, useCallback } from 'react'
import {
  getPendingSyncQueue,
  processOfflineSyncQueue,
  isOfflineGuestSession,
  getPendingConflicts,
  EditConflict
} from '../lib/offlineStore'
import toast from 'react-hot-toast'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingSyncQueue().length)
  const [conflicts, setConflicts] = useState<EditConflict[]>(() => getPendingConflicts())
  const [isGuestMode, setIsGuestMode] = useState<boolean>(() => isOfflineGuestSession())

  // Actualizar contador de pendientes y conflictos
  const refreshPendingCount = useCallback(() => {
    setPendingCount(getPendingSyncQueue().length)
  }, [])

  const refreshConflicts = useCallback(() => {
    setConflicts(getPendingConflicts())
  }, [])

  // Disparar sincronización
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return
    setIsSyncing(true)
    try {
      const { syncedCount, errors } = await processOfflineSyncQueue()
      refreshPendingCount()
      refreshConflicts()
      if (syncedCount > 0) {
        toast.success(`Sincronizados ${syncedCount} cambios con la nube`, {
          icon: '☁️',
          duration: 3000
        })
      }
      if (errors > 0) {
        console.warn('Algunos cambios no se pudieron sincronizar aún')
      }
    } catch (err) {
      console.warn('Error during manual sync:', err)
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, refreshPendingCount, refreshConflicts])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Conexión restablecida', { icon: '🟢', duration: 2500 })
      syncNow()
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast('Sin conexión. Trabajando en modo local.', { icon: '📡', duration: 3500 })
    }

    const handlePendingChange = () => {
      refreshPendingCount()
    }

    const handleConflictsChange = () => {
      refreshConflicts()
    }

    const handleSyncStatus = (e: any) => {
      if (e.detail?.syncing !== undefined) {
        setIsSyncing(e.detail.syncing)
      }
      refreshPendingCount()
      refreshConflicts()
    }

    const handleSessionChange = () => {
      setIsGuestMode(isOfflineGuestSession())
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('lw:pending-sync-change', handlePendingChange)
    window.addEventListener('lw:conflicts-change', handleConflictsChange)
    window.addEventListener('lw:conflict-detected', handleConflictsChange)
    window.addEventListener('lw:conflict-resolved', handleConflictsChange)
    window.addEventListener('lw:sync-status', handleSyncStatus)
    window.addEventListener('lw:session-change', handleSessionChange)

    // Si ya estamos online y hay pendientes, sincronizar en arranque
    if (navigator.onLine && getPendingSyncQueue().length > 0) {
      syncNow()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('lw:pending-sync-change', handlePendingChange)
      window.removeEventListener('lw:conflicts-change', handleConflictsChange)
      window.removeEventListener('lw:conflict-detected', handleConflictsChange)
      window.removeEventListener('lw:conflict-resolved', handleConflictsChange)
      window.removeEventListener('lw:sync-status', handleSyncStatus)
      window.removeEventListener('lw:session-change', handleSessionChange)
    }
  }, [syncNow, refreshPendingCount, refreshConflicts])

  return {
    isOnline,
    isSyncing,
    pendingCount,
    conflicts,
    conflictsCount: conflicts.length,
    isGuestMode,
    syncNow,
    refreshConflicts
  }
}
