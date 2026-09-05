// src/services/obsidianFsService.ts
//
// Gestiona acceso al vault de Obsidian desde el browser vía File System Access API.
//
// Flujo de uso:
//   1. El usuario toca "Conectar carpeta" en Configuración (una sola vez)
//   2. requestAndSaveVaultFolder() abre el picker nativo del OS
//   3. El FileSystemDirectoryHandle se persiste en IndexedDB entre sesiones
//   4. En cada autosave, writeObsidianFile() recupera el handle y escribe el .md
//
// LIMITACIÓN: requiere Chrome o Edge en escritorio.
//   - iOS Safari: no soportado (window.showDirectoryPicker no existe)
//   - Firefox: soportado desde v111 pero con algunas restricciones
//   - isFileSystemAccessSupported() devuelve false en plataformas no soportadas
//     y writeObsidianFile() retorna false silenciosamente — el autosave
//     de Supabase nunca se ve afectado.

const IDB_NAME   = 'lemwriter-mobile-fs';
const IDB_STORE  = 'fs-handles';
const HANDLE_KEY = 'obsidian-root';

// ─── IndexedDB: persistencia del handle entre sesiones ────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror   = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}

// ─── Escritura en disco ───────────────────────────────────────────────────────

/**
 * Escribe content en relativePath dentro de la carpeta raíz autorizada.
 *
 * relativePath puede incluir subcarpetas:
 *   "sermones/sermon-la-gracia-2026.md"
 * Las subcarpetas se crean automáticamente si no existen.
 *
 * @returns true si escribió con éxito, false en cualquier otro caso.
 *
 * NUNCA lanza excepción — el autosave de Supabase no debe verse afectado
 * por fallos de la exportación Obsidian (disco desconectado, permiso revocado, etc.)
 */
export async function writeObsidianFile(
  relativePath: string,
  content: string
): Promise<boolean> {
  try {
    const root = await loadRootHandle();
    if (!root) {
      console.warn('[Obsidian FS] Sin carpeta autorizada. Conecta el vault en Configuración.');
      return false;
    }

    // Verificar que el permiso sigue vigente (puede haberse revocado entre sesiones)
    const perm = await root.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      console.warn('[Obsidian FS] Permiso revocado o expirado — re-autoriza en Configuración');
      return false;
    }

    // Navegar / crear subcarpetas según relativePath
    const parts    = relativePath.split('/');
    const filename = parts.pop()!;
    let   dir: FileSystemDirectoryHandle = root;

    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }

    // Escribir archivo — sobreescribe si ya existe (mismo comportamiento que writeFileSync)
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable   = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    console.log(`[Obsidian FS] ✓ ${relativePath}`);
    return true;

  } catch (err) {
    console.error('[Obsidian FS] Error al escribir:', (err as Error).message);
    return false;
  }
}

// ─── Detección de soporte y autorización ─────────────────────────────────────

/**
 * Devuelve true si el browser soporta File System Access API.
 * Usar para mostrar/ocultar el botón de conexión en Configuración.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Verifica si ya hay una carpeta autorizada y el permiso sigue vigente.
 * Útil para mostrar el estado actual en Configuración al cargar la pantalla.
 *
 * @returns 'connected' | 'disconnected' | 'unsupported'
 */
export async function getVaultStatus(): Promise<'connected' | 'disconnected' | 'unsupported'> {
  if (!isFileSystemAccessSupported()) return 'unsupported';
  try {
    const root = await loadRootHandle();
    if (!root) return 'disconnected';
    const perm = await root.queryPermission({ mode: 'readwrite' });
    return perm === 'granted' ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}

/**
 * Abre el selector nativo de carpeta del OS y guarda el handle.
 *
 * IMPORTANTE: debe llamarse desde un evento de click del usuario.
 * El browser bloquea showDirectoryPicker() si no hay gesto previo del usuario.
 *
 * @returns true si el usuario autorizó, false si canceló o no es soportado.
 */
export async function requestAndSaveVaultFolder(): Promise<boolean> {
  if (!isFileSystemAccessSupported()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    await saveRootHandle(handle);
    console.log('[Obsidian FS] Carpeta autorizada:', handle.name);
    return true;
  } catch (err: unknown) {
    // AbortError = el usuario cerró el picker — no es error real
    if ((err as { name?: string })?.name !== 'AbortError') {
      console.error('[Obsidian FS] Error al solicitar carpeta:', err);
    }
    return false;
  }
}
