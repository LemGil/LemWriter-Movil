import { OfflineProyecto, OfflineSeccion, PendingSyncAction, EditConflict } from './offlineStore'

const DB_NAME = 'LemWriter_Ministerial_DB'
const DB_VERSION = 2

export const IDB_STORES = {
  PROJECTS: 'proyectos',
  SECTIONS: 'secciones',
  SYNC_QUEUE: 'sync_queue',
  CONFLICTS: 'conflictos',
  META: 'meta'
} as const

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * Abre o crea la base de datos IndexedDB con los almacenes de objetos e índices necesarios
 */
export function openIndexedDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB no está soportado en este entorno.'))
  }

  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 1. Almacén de Proyectos
      if (!db.objectStoreNames.contains(IDB_STORES.PROJECTS)) {
        const projectStore = db.createObjectStore(IDB_STORES.PROJECTS, { keyPath: 'id' })
        projectStore.createIndex('updated_at', 'updated_at', { unique: false })
        projectStore.createIndex('title', 'title', { unique: false })
      }

      // 2. Almacén de Secciones
      if (!db.objectStoreNames.contains(IDB_STORES.SECTIONS)) {
        const sectionStore = db.createObjectStore(IDB_STORES.SECTIONS, { keyPath: 'id' })
        sectionStore.createIndex('project_id', 'project_id', { unique: false })
        sectionStore.createIndex('order_index', 'order_index', { unique: false })
      }

      // 3. Almacén de Cola de Sincronización
      if (!db.objectStoreNames.contains(IDB_STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(IDB_STORES.SYNC_QUEUE, { keyPath: 'id' })
        syncStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // 4. Almacén de Conflictos de Edición
      if (!db.objectStoreNames.contains(IDB_STORES.CONFLICTS)) {
        const conflictStore = db.createObjectStore(IDB_STORES.CONFLICTS, { keyPath: 'id' })
        conflictStore.createIndex('projectId', 'projectId', { unique: false })
        conflictStore.createIndex('sectionId', 'sectionId', { unique: false })
        conflictStore.createIndex('status', 'status', { unique: false })
      }

      // 5. Almacén de Metadatos y Preferencias
      if (!db.objectStoreNames.contains(IDB_STORES.META)) {
        db.createObjectStore(IDB_STORES.META, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      console.error('Error al abrir IndexedDB:', request.error)
      reject(request.error)
    }
  })

  return dbPromise
}

/**
 * Función genérica para ejecutar una transacción en IndexedDB
 */
async function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<any> | void
): Promise<T> {
  const db = await openIndexedDB()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)

    let req: IDBRequest<any> | void
    try {
      req = callback(store)
    } catch (err) {
      reject(err)
      return
    }

    if (req) {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    } else {
      tx.oncomplete = () => resolve(undefined as unknown as T)
      tx.onerror = () => reject(tx.error)
    }
  })
}

// -------------------------------------------------------------
// OPERACIONES DE PROYECTOS (IndexedDB)
// -------------------------------------------------------------

export async function idbGetAllProjects(): Promise<OfflineProyecto[]> {
  try {
    const list = await runTransaction<OfflineProyecto[]>(
      IDB_STORES.PROJECTS,
      'readonly',
      (store) => store.getAll()
    )
    return (list || []).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  } catch (err) {
    console.warn('Fallo leyendo proyectos de IndexedDB:', err)
    return []
  }
}

export async function idbSaveProject(project: OfflineProyecto): Promise<void> {
  try {
    await runTransaction(IDB_STORES.PROJECTS, 'readwrite', (store) => {
      store.put(project)
    })
  } catch (err) {
    console.warn('Fallo guardando proyecto en IndexedDB:', err)
  }
}

export async function idbSaveAllProjects(projects: OfflineProyecto[]): Promise<void> {
  try {
    const db = await openIndexedDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORES.PROJECTS, 'readwrite')
      const store = tx.objectStore(IDB_STORES.PROJECTS)
      store.clear()
      for (const p of projects) {
        store.put(p)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Fallo guardando lista de proyectos en IndexedDB:', err)
  }
}

export async function idbDeleteProject(projectId: string): Promise<void> {
  try {
    const db = await openIndexedDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([IDB_STORES.PROJECTS, IDB_STORES.SECTIONS], 'readwrite')
      const projStore = tx.objectStore(IDB_STORES.PROJECTS)
      const secStore = tx.objectStore(IDB_STORES.SECTIONS)

      // Borrar el proyecto
      projStore.delete(projectId)

      // Borrar todas las secciones vinculadas
      const index = secStore.index('project_id')
      const req = index.openCursor(IDBKeyRange.only(projectId))
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Fallo eliminando proyecto en IndexedDB:', err)
  }
}

// -------------------------------------------------------------
// OPERACIONES DE SECCIONES (IndexedDB)
// -------------------------------------------------------------

export async function idbGetSections(projectId: string): Promise<OfflineSeccion[]> {
  try {
    const db = await openIndexedDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORES.SECTIONS, 'readonly')
      const store = tx.objectStore(IDB_STORES.SECTIONS)
      const index = store.index('project_id')
      const req = index.getAll(IDBKeyRange.only(projectId))

      req.onsuccess = () => {
        const list: OfflineSeccion[] = req.result || []
        list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        resolve(list)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn(`Fallo leyendo secciones de proyecto ${projectId} en IndexedDB:`, err)
    return []
  }
}

export async function idbSaveSections(projectId: string, sections: OfflineSeccion[]): Promise<void> {
  try {
    const db = await openIndexedDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORES.SECTIONS, 'readwrite')
      const store = tx.objectStore(IDB_STORES.SECTIONS)
      const index = store.index('project_id')

      // Limpiar las secciones previas de este proyecto
      const req = index.openCursor(IDBKeyRange.only(projectId))
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          // Insertar la nueva lista de secciones
          for (const sec of sections) {
            store.put(sec)
          }
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Fallo guardando secciones en IndexedDB:', err)
  }
}

export async function idbDeleteSection(sectionId: string): Promise<void> {
  try {
    await runTransaction(IDB_STORES.SECTIONS, 'readwrite', (store) => {
      store.delete(sectionId)
    })
  } catch (err) {
    console.warn('Fallo eliminando sección en IndexedDB:', err)
  }
}

// -------------------------------------------------------------
// OPERACIONES DE COLA DE SINCRONIZACIÓN (IndexedDB)
// -------------------------------------------------------------

export async function idbGetSyncQueue(): Promise<PendingSyncAction[]> {
  try {
    const list = await runTransaction<PendingSyncAction[]>(
      IDB_STORES.SYNC_QUEUE,
      'readonly',
      (store) => store.getAll()
    )
    return (list || []).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  } catch (err) {
    console.warn('Fallo obteniendo cola de sincronización de IndexedDB:', err)
    return []
  }
}

export async function idbSaveSyncQueue(queue: PendingSyncAction[]): Promise<void> {
  try {
    const db = await openIndexedDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORES.SYNC_QUEUE, 'readwrite')
      const store = tx.objectStore(IDB_STORES.SYNC_QUEUE)
      store.clear()
      for (const item of queue) {
        store.put(item)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Fallo guardando cola de sincronización en IndexedDB:', err)
  }
}

// -------------------------------------------------------------
// GESTIÓN DE CONFLICTOS DE EDICIÓN (IndexedDB)
// -------------------------------------------------------------

export async function idbGetConflicts(): Promise<EditConflict[]> {
  try {
    const list = await runTransaction<EditConflict[]>(
      IDB_STORES.CONFLICTS,
      'readonly',
      (store) => store.getAll()
    )
    return list || []
  } catch (err) {
    console.warn('Fallo leyendo conflictos de IndexedDB:', err)
    return []
  }
}

export async function idbSaveConflict(conflict: EditConflict): Promise<void> {
  try {
    await runTransaction(IDB_STORES.CONFLICTS, 'readwrite', (store) => {
      store.put(conflict)
    })
  } catch (err) {
    console.warn('Fallo guardando conflicto en IndexedDB:', err)
  }
}

export async function idbDeleteConflict(conflictId: string): Promise<void> {
  try {
    await runTransaction(IDB_STORES.CONFLICTS, 'readwrite', (store) => {
      store.delete(conflictId)
    })
  } catch (err) {
    console.warn('Fallo eliminando conflicto en IndexedDB:', err)
  }
}

export async function idbClearConflicts(): Promise<void> {
  try {
    await runTransaction(IDB_STORES.CONFLICTS, 'readwrite', (store) => {
      store.clear()
    })
  } catch (err) {
    console.warn('Fallo limpiando conflictos en IndexedDB:', err)
  }
}

// -------------------------------------------------------------
// METADATOS Y PREFERENCIAS (IndexedDB)
// -------------------------------------------------------------

export async function idbGetMeta<T>(key: string, fallback: T): Promise<T> {
  try {
    const record = await runTransaction<{ key: string; value: T } | undefined>(
      IDB_STORES.META,
      'readonly',
      (store) => store.get(key)
    )
    if (!record || record.value === undefined) return fallback
    return record.value
  } catch {
    return fallback
  }
}

export async function idbSetMeta(key: string, value: any): Promise<void> {
  try {
    await runTransaction(IDB_STORES.META, 'readwrite', (store) => {
      store.put({ key, value })
    })
  } catch (err) {
    console.warn(`Fallo guardando meta ${key} en IndexedDB:`, err)
  }
}

// -------------------------------------------------------------
// MIGRACIÓN AUTOMÁTICA DESDE localStorage A IndexedDB
// -------------------------------------------------------------

export async function migrateFromLocalStorageToIndexedDB(): Promise<{
  migrated: boolean
  projectsCount: number
  sectionsCount: number
}> {
  if (typeof window === 'undefined') {
    return { migrated: false, projectsCount: 0, sectionsCount: 0 }
  }

  try {
    const yaMigrado = await idbGetMeta<boolean>('migrado_desde_localstorage_v1', false)
    if (yaMigrado) {
      return { migrated: false, projectsCount: 0, sectionsCount: 0 }
    }

    // Verificar si hay datos en localStorage
    const rawProjects = localStorage.getItem('lw_offline_proyectos')
    let projectsCount = 0
    let sectionsCount = 0

    if (rawProjects) {
      const projects: OfflineProyecto[] = JSON.parse(rawProjects)
      if (Array.isArray(projects) && projects.length > 0) {
        await idbSaveAllProjects(projects)
        projectsCount = projects.length

        // Migrar secciones de cada proyecto
        for (const p of projects) {
          const rawSec = localStorage.getItem(`lw_offline_secciones_${p.id}`)
          if (rawSec) {
            const sections: OfflineSeccion[] = JSON.parse(rawSec)
            if (Array.isArray(sections) && sections.length > 0) {
              await idbSaveSections(p.id, sections)
              sectionsCount += sections.length
            }
          }
        }
      }
    }

    // Migrar cola de sincronización si existe
    const rawQueue = localStorage.getItem('lw_offline_pending_sync_queue')
    if (rawQueue) {
      const queue: PendingSyncAction[] = JSON.parse(rawQueue)
      if (Array.isArray(queue) && queue.length > 0) {
        await idbSaveSyncQueue(queue)
      }
    }

    // Marcar migración como completada
    await idbSetMeta('migrado_desde_localstorage_v1', true)
    await idbSetMeta('fecha_migracion_idb', new Date().toISOString())

    console.log(
      `[IndexedDB] Migración exitosa: ${projectsCount} proyectos y ${sectionsCount} secciones transferidas a IndexedDB.`
    )

    return { migrated: true, projectsCount, sectionsCount }
  } catch (err) {
    console.error('Error durante migración de localStorage a IndexedDB:', err)
    return { migrated: false, projectsCount: 0, sectionsCount: 0 }
  }
}

// -------------------------------------------------------------
// ESTIMACIÓN DE CUOTA Y ALMACENAMIENTO PERSISTENTE
// -------------------------------------------------------------

export interface StorageQuotaInfo {
  supported: boolean
  isPersisted: boolean
  usageMB: number
  quotaMB: number
  percentUsed: number
  motor: string
}

export async function getStorageQuotaInfo(): Promise<StorageQuotaInfo> {
  const result: StorageQuotaInfo = {
    supported: false,
    isPersisted: false,
    usageMB: 0,
    quotaMB: 0,
    percentUsed: 0,
    motor: 'IndexedDB (Capacidad Ilimitada)'
  }

  if (typeof navigator === 'undefined' || !navigator.storage) {
    return result
  }

  result.supported = true

  try {
    if (navigator.storage.persisted) {
      result.isPersisted = await navigator.storage.persisted()
    }

    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      const usage = estimate.usage || 0
      const quota = estimate.quota || 0

      result.usageMB = Math.round((usage / (1024 * 1024)) * 100) / 100
      result.quotaMB = Math.round(quota / (1024 * 1024))
      if (quota > 0) {
        result.percentUsed = Math.round((usage / quota) * 1000) / 10
      }
    }
  } catch (e) {
    console.warn('Error estimando cuota de almacenamiento:', e)
  }

  return result
}

/**
 * Solicita al navegador que no borre los datos de IndexedDB durante limpieza automática
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const granted = await navigator.storage.persist()
      return granted
    } catch {
      return false
    }
  }
  return false
}
