import { supabase } from './supabase'

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
  _isOfflineOnly?: boolean
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
  OFFLINE_GUEST_SESSION: 'lw_offline_guest_session',
  LAST_SYNC: 'lw_offline_last_sync_time'
}

// -------------------------------------------------------------
// Utilidades de almacenamiento local seguro
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
    console.warn(`Error writing localStorage key "${key}":`, err)
  }
}

// -------------------------------------------------------------
// Gestión de Proyectos en Caché Local
// -------------------------------------------------------------
export function getOfflineProjects(): OfflineProyecto[] {
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
      content: '<p>Bienvenido a <strong>LemWriter</strong> en modo fuera de línea. Puedes escribir, crear esquemas y organizar tus mensajes sin necesidad de conexión a internet. Todo se guardará en este dispositivo y se sincronizará automáticamente cuando te conectes.</p>',
      order_index: 0,
      _isOfflineOnly: true
    }
    saveOfflineProjects([primerProyecto])
    saveOfflineSections('local_proj_inicial', [primeraSeccion])
    return [primerProyecto]
  }
  return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

export function saveOfflineProjects(projects: OfflineProyecto[]): void {
  safeSetJSON(STORAGE_KEYS.PROJECTS, projects)
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
  saveOfflineProjects(updated)
}

export function deleteOfflineProject(projectId: string): void {
  const current = getOfflineProjects()
  const updated = current.filter((p) => p.id !== projectId)
  saveOfflineProjects(updated)
  localStorage.removeItem(`${STORAGE_KEYS.SECTIONS_PREFIX}${projectId}`)
}

// -------------------------------------------------------------
// Gestión de Secciones en Caché Local
// -------------------------------------------------------------
export function getOfflineSections(projectId: string): OfflineSeccion[] {
  const list = safeGetJSON<OfflineSeccion[]>(`${STORAGE_KEYS.SECTIONS_PREFIX}${projectId}`, [])
  return list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
}

export function saveOfflineSections(projectId: string, sections: OfflineSeccion[]): void {
  safeSetJSON(`${STORAGE_KEYS.SECTIONS_PREFIX}${projectId}`, sections)
}

export function saveOfflineSectionContent(projectId: string, sectionId: string, content: string): void {
  const sections = getOfflineSections(projectId)
  const idx = sections.findIndex((s) => s.id === sectionId)
  if (idx >= 0) {
    sections[idx] = { ...sections[idx], content }
    saveOfflineSections(projectId, sections)
    // Actualizar también la fecha del proyecto
    const projects = getOfflineProjects()
    const pIdx = projects.findIndex((p) => p.id === projectId)
    if (pIdx >= 0) {
      projects[pIdx].updated_at = new Date().toISOString()
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
  return safeGetJSON<PendingSyncAction[]>(STORAGE_KEYS.PENDING_SYNC, [])
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
      safeSetJSON(STORAGE_KEYS.PENDING_SYNC, queue)
      window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
      return
    }
  }

  queue.push(newAction)
  safeSetJSON(STORAGE_KEYS.PENDING_SYNC, queue)
  window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
}

export function removePendingSyncAction(actionId: string): void {
  const queue = getPendingSyncQueue()
  const updated = queue.filter((a) => a.id !== actionId)
  safeSetJSON(STORAGE_KEYS.PENDING_SYNC, updated)
  window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
}

export function clearPendingSyncQueue(): void {
  localStorage.removeItem(STORAGE_KEYS.PENDING_SYNC)
  window.dispatchEvent(new CustomEvent('lw:pending-sync-change'))
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
            const { id, content, title, order_index } = action.payload
            if (!id.startsWith('local_')) {
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
