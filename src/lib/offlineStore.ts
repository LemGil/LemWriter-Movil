import { supabase } from './supabase'
import {
  idbGetAllProjects,
  idbSaveProject,
  idbSaveAllProjects,
  idbDeleteProject,
  idbGetSections,
  idbSaveSections,
  idbGetSyncQueue,
  idbSaveSyncQueue,
  idbGetConflicts,
  idbSaveConflict,
  idbDeleteConflict,
  migrateFromLocalStorageToIndexedDB,
  requestPersistentStorage,
  getStorageQuotaInfo,
  StorageQuotaInfo
} from './indexedDbStore'

export { getStorageQuotaInfo, requestPersistentStorage }
export type { StorageQuotaInfo }

export interface OfflineProyecto {
  id: string
  title: string
  type: string
  updated_at: string
  created_at?: string
  user_id?: string
  _isOfflineOnly?: boolean
}

export interface OfflineSeccion {
  id: string
  project_id: string
  title: string
  content: string
  order_index: number
  created_at?: string
  updated_at?: string
  _isOfflineOnly?: boolean
}

export interface EditConflict {
  id: string
  projectId: string
  projectTitle?: string
  sectionId: string
  sectionTitle: string
  localContent: string
  remoteContent: string
  localUpdatedAt: string
  remoteUpdatedAt: string
  baseUpdatedAt?: string
  detectedAt: string
  status: 'pending' | 'resolved'
}

export type SyncActionType =
  | 'CREATE_PROJECT'
  | 'UPDATE_PROJECT'
  | 'DELETE_PROJECT'
  | 'CREATE_SECTION'
  | 'UPDATE_SECTION'
  | 'DELETE_SECTION'
  | 'REORDER_SECTIONS'

export interface PendingSyncAction {
  id: string
  type: SyncActionType
  payload: any
  timestamp: number
}

const STORAGE_KEYS = {
  PROJECTS: 'lw_offline_proyectos',
  SECTIONS_PREFIX: 'lw_offline_secciones_',
  PENDING_SYNC: 'lw_offline_pending_sync_queue',
  CONFLICTS: 'lw_offline_conflicts',
  OFFLINE_GUEST_SESSION: 'lw_offline_guest_session',
  LAST_SYNC: 'lw_offline_last_sync_time'
}

// -------------------------------------------------------------
// Caché en Memoria para Acceso Síncrono de Cero Latencia
// -------------------------------------------------------------
let memoryProjectsCache: OfflineProyecto[] | null = null
const memorySectionsCache: Map<string, OfflineSeccion[]> = new Map()
let memorySyncQueueCache: PendingSyncAction[] | null = null
let memoryConflictsCache: EditConflict[] | null = null
let idbInitialized = false

// -------------------------------------------------------------
// Utilidades de almacenamiento local seguro (Fallback & Mirror)
// -------------------------------------------------------------
function safeGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`Error reading localStorage key "${key}":`, err)
    return fallback
  }
}

function safeSetJSON(key: string, value: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // Si la cuota de localStorage (~5MB) se satura, IndexedDB retiene la copia completa
    console.warn(`localStorage quota warning on key "${key}" (IndexedDB conserva todos los datos):`, err)
  }
}

// -------------------------------------------------------------
// Inicialización y Migración a IndexedDB
// -------------------------------------------------------------
async function initIndexedDBStorage() {
  if (typeof window === 'undefined' || idbInitialized) return
  idbInitialized = true

  try {
    // 1. Solicitar almacenamiento persistente al navegador
    requestPersistentStorage()

    // 2. Ejecutar migración automática de datos existentes en localStorage
    const migResult = await migrateFromLocalStorageToIndexedDB()

    // 3. Cargar datos de IndexedDB a la memoria
    const idbProjects = await idbGetAllProjects()
    if (idbProjects.length > 0) {
      memoryProjectsCache = idbProjects
    }

    const idbQueue = await idbGetSyncQueue()
    if (idbQueue.length > 0) {
      memorySyncQueueCache = idbQueue
    }

    const idbConflicts = await idbGetConflicts()
    if (idbConflicts.length > 0) {
      memoryConflictsCache = idbConflicts
    }

    // Notificar al sistema que el almacenamiento IndexedDB está listo
    window.dispatchEvent(new CustomEvent('lw:storage-ready', { detail: { migrated: migResult.migrated } }))
  } catch (err) {
    console.warn('Inicialización de IndexedDB en segundo plano completada con advertencias:', err)
  }
}

// Auto-iniciar al cargar el script en el navegador
if (typeof window !== 'undefined') {
  setTimeout(() => {
    initIndexedDBStorage()
  }, 50)
}

// -------------------------------------------------------------
// Gestión de Proyectos en Caché Local e IndexedDB
// -------------------------------------------------------------
export function getOfflineProjects(): OfflineProyecto[] {
  if (memoryProjectsCache !== null) {
    return memoryProjectsCache
  }

  const list = safeGetJSON<OfflineProyecto[]>(STORAGE_KEYS.PROJECTS, [])
  if (list.length === 0) {
    // Si está completamente vacío (primer uso offline sin internet), proporcionar proyecto inicial
    const primerProyecto: OfflineProyecto = {
      id: 'local_proj_inicial',
      title: 'Mi Primer Sermón (Modo Local)',
      type: 'sermon',
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      _isOfflineOnly: true
    }
    const primeraSeccion: OfflineSeccion = {
      id: 'local_sec_inicial',
      project_id: 'local_proj_inicial',
      title: 'Introducción',
      content: '<p>Bienvenido a <strong>LemWriter</strong> con <strong>almacenamiento IndexedDB de alta capacidad</strong>. Puedes escribir, crear esquemas y organizar tus mensajes sin límite de 5MB y sin necesidad de internet. Todo se guardará de forma segura en este dispositivo y se sincronizará cuando te conectes.</p>',
      order_index: 0,
      _isOfflineOnly: true
    }
    saveOfflineProjects([primerProyecto])
    saveOfflineSections('local_proj_inicial', [primeraSeccion])
    memoryProjectsCache = [primerProyecto]
    return [primerProyecto]
  }

  const sorted = list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  memoryProjectsCache = sorted
  return sorted
}

export function saveOfflineProjects(projects: OfflineProyecto[]): void {
  memoryProjectsCache = projects
  safeSetJSON(STORAGE_KEYS.PROJECTS, projects)
  idbSaveAllProjects(projects).catch((e) => console.warn('Fallo guardando proyectos en IDB:', e))
}

export function saveOrUpdateOfflineProject(project: OfflineProyecto): void {
  const current = getOfflineProjects()
  const idx = current.findIndex((p) => p.id === project.id)
  let updated: OfflineProyecto[]
  if (idx >= 0) {
    updated = [...current]
    updated[idx] = { ...updated[idx], ...project, updated_at: new Date().toISOString() }
  } else {
    updated = [project, ...current]
  }
  memoryProjectsCache = updated
  safeSetJSON(STORAGE_KEYS.PROJECTS, updated)
  idbSaveProject(project).catch((e) => console.warn('Fallo guardando proyecto en IDB:', e))
}

export function deleteOfflineProject(projectId: string): void {
  const current = getOfflineProjects()
  const updated = current.filter((p) => p.id !== projectId)
  memoryProjectsCache = updated
  memorySectionsCache.delete(projectId)
  safeSetJSON(STORAGE_KEYS.PROJECTS, updated)
  try {
    localStorage.removeItem(`${STORAGE_KEYS.SECTIONS_PREFIX}${projectId}`)
  } catch {}
  idbDeleteProject(projectId).catch((e) => console.warn('Fallo eliminando proyecto en IDB:', e))
}

// -------------------------------------------------------------
// Gestión de Secciones en Caché Local e IndexedDB
// -------------------------------------------------------------
export function getOfflineSections(projectId: string): OfflineSeccion[] {
  if (memorySectionsCache.has(projectId)) {
    return memorySectionsCache.get(projectId)!
  }

  const list = safeGetJSON<OfflineSeccion[]>(`${STORAGE_KEYS.SECTIONS_PREFIX}${projectId}`, [])
  const sorted = list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  memorySectionsCache.set(projectId, sorted)

  // Cargar de IndexedDB en segundo plano por si contiene más secciones
  idbGetSections(projectId).then((idbSecs) => {
    if (idbSecs.length > 0 && idbSecs.length !== sorted.length) {
      memorySectionsCache.set(projectId, idbSecs)
    }
  }).catch(() => {})

  return sorted
}

export function saveOfflineSections(projectId: string, sections: OfflineSeccion[]): void {
  memorySectionsCache.set(projectId, sections)
  safeSetJSON(`${STORAGE_KEYS.SECTIONS_PREFIX}${projectId}`, sections)
  idbSaveSections(projectId, sections).catch((e) => console.warn('Fallo guardando secciones en IDB:', e))
}

export function saveOfflineSectionContent(projectId: string, sectionId: string, content: string): void {
  const sections = getOfflineSections(projectId)
  const idx = sections.findIndex((s) => s.id === sectionId)
  if (idx >= 0) {
    const nowIso = new Date().toISOString()
    sections[idx] = { ...sections[idx], content, updated_at: nowIso }
    saveOfflineSections(projectId, sections)
    // Actualizar también la fecha del proyecto
    const projects = getOfflineProjects()
    const pIdx = projects.findIndex((p) => p.id === projectId)
    if (pIdx >= 0) {
      projects[pIdx].updated_at = nowIso
      saveOfflineProjects(projects)
    }
  }
}

export function saveOrUpdateOfflineSection(projectId: string, section: OfflineSeccion): void {
  const sections = getOfflineSections(projectId)
  const idx = sections.findIndex((s) => s.id === section.id)
  let updated: OfflineSeccion[]
  if (idx >= 0) {
    updated = [...sections]
    updated[idx] = { ...updated[idx], ...section }
  } else {
    updated = [...sections, section]
  }
  saveOfflineSections(projectId, updated)
}

export function deleteOfflineSection(projectId: string, sectionId: string): void {
  const sections = getOfflineSections(projectId)
  const updated = sections.filter((s) => s.id !== sectionId)
  saveOfflineSections(projectId, updated)
}

// -------------------------------------------------------------
// Cola de Acciones Pendientes de Sincronización (Offline Sync Queue)
// -------------------------------------------------------------
export function getPendingSyncQueue(): PendingSyncAction[] {
  if (memorySyncQueueCache !== null) {
    return memorySyncQueueCache
  }
  const queue = safeGetJSON<PendingSyncAction[]>(STORAGE_KEYS.PENDING_SYNC, [])
  memorySyncQueueCache = queue
  return queue
}

export function addPendingSyncAction(type: SyncActionType, payload: any): void {
  const queue = getPendingSyncQueue()
  const newAction: PendingSyncAction = {
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    type,
    payload,
    timestamp: Date.now()
  }

  // Optimización: Si es UPDATE_SECTION para la misma sección, sobrescribir el último en cola
  if (type === 'UPDATE_SECTION') {
    const existingIdx = queue.findIndex(
      (a) => a.type === 'UPDATE_SECTION' && a.payload.id === payload.id
    )
    if (existingIdx >= 0) {
      queue[existingIdx] = newAction
      memorySyncQueueCache = queue
      safeSetJSON(STORAGE_KEYS.PENDING_SYNC, queue)
      idbSaveSyncQueue(queue).catch(() => {})
      window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
      return
    }
  }

  queue.push(newAction)
  memorySyncQueueCache = queue
  safeSetJSON(STORAGE_KEYS.PENDING_SYNC, queue)
  idbSaveSyncQueue(queue).catch(() => {})
  window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
}

export function removePendingSyncAction(actionId: string): void {
  const queue = getPendingSyncQueue()
  const updated = queue.filter((a) => a.id !== actionId)
  memorySyncQueueCache = updated
  safeSetJSON(STORAGE_KEYS.PENDING_SYNC, updated)
  idbSaveSyncQueue(updated).catch(() => {})
  window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
}

export function clearPendingSyncQueue(): void {
  memorySyncQueueCache = []
  try {
    localStorage.removeItem(STORAGE_KEYS.PENDING_SYNC)
  } catch {}
  idbSaveSyncQueue([]).catch(() => {})
  window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
}

// -------------------------------------------------------------
// Gestión y Resolución de Conflictos de Edición
// -------------------------------------------------------------

export function getPendingConflicts(): EditConflict[] {
  if (memoryConflictsCache !== null) {
    return memoryConflictsCache.filter((c) => c.status === 'pending')
  }
  const list = safeGetJSON<EditConflict[]>(STORAGE_KEYS.CONFLICTS, [])
  memoryConflictsCache = list
  return list.filter((c) => c.status === 'pending')
}

export function saveConflict(conflict: EditConflict): void {
  const all = safeGetJSON<EditConflict[]>(STORAGE_KEYS.CONFLICTS, [])
  const existingIdx = all.findIndex((c) => c.id === conflict.id || (c.sectionId === conflict.sectionId && c.status === 'pending'))
  if (existingIdx >= 0) {
    all[existingIdx] = conflict
  } else {
    all.push(conflict)
  }
  memoryConflictsCache = all
  safeSetJSON(STORAGE_KEYS.CONFLICTS, all)
  idbSaveConflict(conflict).catch(() => {})
  window.dispatchEvent(new CustomEvent('lw:conflicts-change', { detail: { count: all.filter((c) => c.status === 'pending').length } }))
  window.dispatchEvent(new CustomEvent('lw:conflict-detected', { detail: conflict }))
}

export function removeConflict(conflictId: string): void {
  const all = safeGetJSON<EditConflict[]>(STORAGE_KEYS.CONFLICTS, [])
  const filtered = all.filter((c) => c.id !== conflictId)
  memoryConflictsCache = filtered
  safeSetJSON(STORAGE_KEYS.CONFLICTS, filtered)
  idbDeleteConflict(conflictId).catch(() => {})
  window.dispatchEvent(new CustomEvent('lw:conflicts-change', { detail: { count: filtered.filter((c) => c.status === 'pending').length } }))
}

export async function resolveConflict(
  conflictId: string,
  resolution: 'keep_local' | 'keep_remote' | 'keep_both' | 'merge'
): Promise<{ success: boolean; newSectionId?: string }> {
  const conflicts = safeGetJSON<EditConflict[]>(STORAGE_KEYS.CONFLICTS, [])
  const conflict = conflicts.find((c) => c.id === conflictId)
  if (!conflict) return { success: false }

  const isOnline = typeof navigator !== 'undefined' && navigator.onLine
  const nowIso = new Date().toISOString()
  let newSectionId: string | undefined = undefined

  try {
    switch (resolution) {
      case 'keep_local': {
        // La versión local sobrescribe a la nube
        saveOfflineSectionContent(conflict.projectId, conflict.sectionId, conflict.localContent)
        if (isOnline && !conflict.sectionId.startsWith('local_')) {
          await supabase
            .from('lw_secciones')
            .update({ content: conflict.localContent, updated_at: nowIso })
            .eq('id', conflict.sectionId)
          await supabase
            .from('lw_proyectos')
            .update({ updated_at: nowIso })
            .eq('id', conflict.projectId)
        } else {
          addPendingSyncAction('UPDATE_SECTION', {
            id: conflict.sectionId,
            projectId: conflict.projectId,
            projectTitle: conflict.projectTitle,
            title: conflict.sectionTitle,
            content: conflict.localContent,
            base_updated_at: conflict.remoteUpdatedAt,
            client_updated_at: nowIso
          })
        }
        break
      }

      case 'keep_remote': {
        // Se adopta la versión remota en el almacenamiento local
        const sections = getOfflineSections(conflict.projectId)
        const idx = sections.findIndex((s) => s.id === conflict.sectionId)
        if (idx >= 0) {
          sections[idx] = {
            ...sections[idx],
            content: conflict.remoteContent,
            updated_at: conflict.remoteUpdatedAt
          }
          saveOfflineSections(conflict.projectId, sections)
        }
        break
      }

      case 'keep_both': {
        // 1. La sección principal adopta el contenido remoto
        const sections = getOfflineSections(conflict.projectId)
        const idx = sections.findIndex((s) => s.id === conflict.sectionId)
        const currentOrder = idx >= 0 ? (sections[idx].order_index ?? 0) : 0
        if (idx >= 0) {
          sections[idx] = {
            ...sections[idx],
            content: conflict.remoteContent,
            updated_at: conflict.remoteUpdatedAt
          }
        }

        // 2. Crear una nueva sección hermana con la versión local
        const copySecId = generateLocalId('local_sec')
        newSectionId = copySecId
        const newSec: OfflineSeccion = {
          id: copySecId,
          project_id: conflict.projectId,
          title: `${conflict.sectionTitle} (Copia local)`,
          content: conflict.localContent,
          order_index: currentOrder + 1,
          updated_at: nowIso,
          _isOfflineOnly: !isOnline
        }

        sections.splice(idx >= 0 ? idx + 1 : sections.length, 0, newSec)
        saveOfflineSections(conflict.projectId, sections)

        if (isOnline && !conflict.projectId.startsWith('local_')) {
          const { data: created } = await supabase
            .from('lw_secciones')
            .insert([{
              project_id: conflict.projectId,
              title: newSec.title,
              content: newSec.content,
              order_index: currentOrder + 1
            }])
            .select()
            .single()

          if (created) {
            newSectionId = created.id
            const updatedSecs = getOfflineSections(conflict.projectId).map((s) =>
              s.id === copySecId ? { ...created, _isOfflineOnly: false } : s
            )
            saveOfflineSections(conflict.projectId, updatedSecs)
          }
        } else {
          addPendingSyncAction('CREATE_SECTION', {
            id: copySecId,
            project_id: conflict.projectId,
            title: newSec.title,
            content: newSec.content,
            order_index: currentOrder + 1
          })
        }
        break
      }

      case 'merge': {
        const fechaRemota = conflict.remoteUpdatedAt
          ? new Date(conflict.remoteUpdatedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
          : 'otro dispositivo'

        const combinedContent = `${conflict.localContent}
<hr style="margin: 24px 0; border: none; border-top: 2px dashed #C9A24A;" />
<div style="background: rgba(201, 162, 74, 0.08); padding: 14px 16px; border-left: 4px solid #C9A24A; border-radius: 6px; margin: 16px 0;">
  <p style="font-size: 13px; font-weight: bold; color: #DFBE72; margin: 0 0 8px 0; font-family: 'Cinzel', serif;">
    📜 Versión sincronizada desde otro dispositivo (${fechaRemota})
  </p>
  ${conflict.remoteContent}
</div>`

        saveOfflineSectionContent(conflict.projectId, conflict.sectionId, combinedContent)
        if (isOnline && !conflict.sectionId.startsWith('local_')) {
          await supabase
            .from('lw_secciones')
            .update({ content: combinedContent, updated_at: nowIso })
            .eq('id', conflict.sectionId)
          await supabase
            .from('lw_proyectos')
            .update({ updated_at: nowIso })
            .eq('id', conflict.projectId)
        } else {
          addPendingSyncAction('UPDATE_SECTION', {
            id: conflict.sectionId,
            projectId: conflict.projectId,
            projectTitle: conflict.projectTitle,
            title: conflict.sectionTitle,
            content: combinedContent,
            base_updated_at: conflict.remoteUpdatedAt,
            client_updated_at: nowIso
          })
        }
        break
      }
    }

    // Remover conflicto resuelto
    removeConflict(conflictId)
    window.dispatchEvent(new CustomEvent('lw:conflict-resolved', { detail: { conflictId, resolution, newSectionId } }))
    return { success: true, newSectionId }
  } catch (err) {
    console.error('Error al resolver conflicto:', err)
    return { success: false }
  }
}

// -------------------------------------------------------------
// Ejecución de Sincronización cuando hay Conexión
// -------------------------------------------------------------
let isSyncing = false

export async function processOfflineSyncQueue(): Promise<{ syncedCount: number; errors: number }> {
  if (isSyncing || typeof navigator === 'undefined' || !navigator.onLine) {
    return { syncedCount: 0, errors: 0 }
  }

  const queue = getPendingSyncQueue()
  if (queue.length === 0) {
    return { syncedCount: 0, errors: 0 }
  }

  isSyncing = true
  let syncedCount = 0
  let errors = 0

  window.dispatchEvent(new CustomEvent('lw:sync-status', { detail: { syncing: true } }))

  try {
    const user = (await supabase.auth.getUser()).data?.user

    for (const action of queue) {
      try {
        switch (action.type) {
          case 'CREATE_PROJECT': {
            const { id: oldId, title, type, user_id } = action.payload
            const { data: created, error } = await supabase
              .from('lw_proyectos')
              .insert([{ title, type, user_id: user?.id || user_id }])
              .select()
              .single()

            if (!error && created) {
              // Si el ID era temporal (local_), actualizar referencias locales
              if (oldId && oldId.startsWith('local_')) {
                const projects = getOfflineProjects()
                const pIdx = projects.findIndex((p) => p.id === oldId)
                if (pIdx >= 0) {
                  projects[pIdx] = { ...created, _isOfflineOnly: false }
                  saveOfflineProjects(projects)
                }
                const sections = getOfflineSections(oldId)
                if (sections.length > 0) {
                  const updatedSections = sections.map((s) => ({ ...s, project_id: created.id }))
                  saveOfflineSections(created.id, updatedSections)
                  localStorage.removeItem(`${STORAGE_KEYS.SECTIONS_PREFIX}${oldId}`)
                }
              }
              removePendingSyncAction(action.id)
              syncedCount++
            } else {
              errors++
            }
            break
          }

          case 'UPDATE_PROJECT': {
            const { id, title, type } = action.payload
            if (!id.startsWith('local_')) {
              const { error } = await supabase
                .from('lw_proyectos')
                .update({ title, type, updated_at: new Date().toISOString() })
                .eq('id', id)
              if (!error) {
                removePendingSyncAction(action.id)
                syncedCount++
              } else {
                errors++
              }
            } else {
              removePendingSyncAction(action.id)
            }
            break
          }

          case 'DELETE_PROJECT': {
            const { id } = action.payload
            if (!id.startsWith('local_')) {
              await supabase.from('lw_secciones').delete().eq('project_id', id)
              await supabase.from('lw_proyectos').delete().eq('id', id)
            }
            removePendingSyncAction(action.id)
            syncedCount++
            break
          }

          case 'CREATE_SECTION': {
            const { id: secId, project_id, title, content, order_index } = action.payload
            if (!project_id.startsWith('local_')) {
              const { data: createdSec, error } = await supabase
                .from('lw_secciones')
                .insert([{ project_id, title, content, order_index }])
                .select()
                .single()

              if (!error && createdSec) {
                // Actualizar ID local
                if (secId && secId.startsWith('local_')) {
                  const sections = getOfflineSections(project_id)
                  const sIdx = sections.findIndex((s) => s.id === secId)
                  if (sIdx >= 0) {
                    sections[sIdx] = { ...createdSec, _isOfflineOnly: false }
                    saveOfflineSections(project_id, sections)
                  }
                }
                removePendingSyncAction(action.id)
                syncedCount++
              } else {
                errors++
              }
            }
            break
          }

          case 'UPDATE_SECTION': {
            const {
              id,
              content,
              title,
              order_index,
              projectId,
              projectTitle,
              base_updated_at,
              client_updated_at
            } = action.payload

            if (!id.startsWith('local_')) {
              // Verificación preventiva de conflicto con la versión remota
              if (content !== undefined) {
                const { data: remoteSec } = await supabase
                  .from('lw_secciones')
                  .select('id, project_id, title, content, updated_at')
                  .eq('id', id)
                  .single()

                if (remoteSec && remoteSec.updated_at) {
                  const remoteTime = new Date(remoteSec.updated_at).getTime()
                  const baseTime = base_updated_at ? new Date(base_updated_at).getTime() : 0
                  const comparisonTime = baseTime > 0 ? baseTime : (action.timestamp || 0)

                  const cleanText = (str: string) =>
                    (str || '')
                      .replace(/<[^>]*>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()

                  const hayDiferencia = cleanText(remoteSec.content) !== cleanText(content)

                  // Conflicto: la versión en la nube fue modificada después de la versión base local
                  if (comparisonTime > 0 && remoteTime > comparisonTime && hayDiferencia) {
                    console.warn(`[Sync Conflict] Conflicto en sección ${id}: nube ${remoteSec.updated_at} > base ${new Date(comparisonTime).toISOString()}`)

                    const conflict: EditConflict = {
                      id: `conflict_${id}_${Date.now()}`,
                      projectId: remoteSec.project_id || projectId,
                      projectTitle: projectTitle,
                      sectionId: id,
                      sectionTitle: remoteSec.title || title || 'Sección',
                      localContent: content,
                      remoteContent: remoteSec.content,
                      localUpdatedAt: client_updated_at || new Date().toISOString(),
                      remoteUpdatedAt: remoteSec.updated_at,
                      baseUpdatedAt: base_updated_at,
                      detectedAt: new Date().toISOString(),
                      status: 'pending'
                    }

                    saveConflict(conflict)
                    removePendingSyncAction(action.id)
                    continue
                  }
                }
              }

              const updateData: any = { updated_at: new Date().toISOString() }
              if (content !== undefined) updateData.content = content
              if (title !== undefined) updateData.title = title
              if (order_index !== undefined) updateData.order_index = order_index

              const { error } = await supabase
                .from('lw_secciones')
                .update(updateData)
                .eq('id', id)

              if (!error) {
                removePendingSyncAction(action.id)
                syncedCount++
              } else {
                errors++
              }
            } else {
              removePendingSyncAction(action.id)
            }
            break
          }

          case 'DELETE_SECTION': {
            const { id } = action.payload
            if (!id.startsWith('local_')) {
              await supabase.from('lw_secciones').delete().eq('id', id)
            }
            removePendingSyncAction(action.id)
            syncedCount++
            break
          }

          case 'REORDER_SECTIONS': {
            const { sections } = action.payload
            for (const item of sections) {
              if (!item.id.startsWith('local_')) {
                await supabase
                  .from('lw_secciones')
                  .update({ order_index: item.order_index })
                  .eq('id', item.id)
              }
            }
            removePendingSyncAction(action.id)
            syncedCount++
            break
          }
        }
      } catch (e) {
        console.warn('Error processing sync action:', action, e)
        errors++
      }
    }
  } finally {
    isSyncing = false
    safeSetJSON(STORAGE_KEYS.LAST_SYNC, new Date().toISOString())
    window.dispatchEvent(
      new CustomEvent('lw:sync-status', { detail: { syncing: false, syncedCount, errors } })
    )
  }

  return { syncedCount, errors }
}

// -------------------------------------------------------------
// Modo Invitado / Sesión Local Fuera de Línea
// -------------------------------------------------------------
export function isOfflineGuestSession(): boolean {
  return safeGetJSON<boolean>(STORAGE_KEYS.OFFLINE_GUEST_SESSION, false)
}

export function setOfflineGuestSession(enabled: boolean): void {
  safeSetJSON(STORAGE_KEYS.OFFLINE_GUEST_SESSION, enabled)
  window.dispatchEvent(new CustomEvent('lw:session-change'))
}

// -------------------------------------------------------------
// Generador de IDs locales seguros
// -------------------------------------------------------------
export function generateLocalId(prefix: 'local_proj' | 'local_sec'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
