import crypto from "crypto";

export interface CacheEntry<T> {
  key: string;
  data: T;
  createdAt: number;
  expiresAt: number;
  hits: number;
  preview?: string;
}

export interface CacheStats {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  hitRatio: string;
  totalSavedRequests: number;
}

export class AICache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxEntries: number;
  private defaultTTL: number;
  private hits: number = 0;
  private misses: number = 0;

  /**
   * @param maxEntries Capacidad máxima antes de desalojar la entrada más antigua (LRU/FIFO)
   * @param defaultTTLMs Tiempo de vida en milisegundos (por defecto 30 minutos)
   */
  constructor(maxEntries = 200, defaultTTLMs = 30 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTTL = defaultTTLMs;

    // Limpieza periódica cada 5 minutos
    const interval = setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
    if (interval.unref) {
      interval.unref();
    }
  }

  /**
   * Genera un hash criptográfico SHA-256 normalizado para las entradas
   */
  public generateKey(params: Record<string, any>): string {
    // Normalizar cadenas para evitar fallas por espacios repetidos o mayúsculas en opciones
    const normalized = Object.keys(params)
      .sort()
      .map((k) => {
        const val = params[k];
        if (typeof val === "string") {
          return `${k}:${val.trim().replace(/\s+/g, " ")}`;
        }
        return `${k}:${JSON.stringify(val)}`;
      })
      .join("|");

    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Obtiene una entrada válida de la caché
   */
  public get(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    entry.hits++;
    this.hits++;

    // Actualizar posición en Map para mantener semántica LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  /**
   * Guarda una respuesta en la caché
   */
  public set(key: string, data: T, ttlMs?: number, preview?: string): void {
    const now = Date.now();
    const ttl = ttlMs || this.defaultTTL;

    // Si excede la capacidad máxima, eliminar la entrada más antigua
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      key,
      data,
      createdAt: now,
      expiresAt: now + ttl,
      hits: 0,
      preview: preview ? preview.slice(0, 100) : undefined,
    });
  }

  /**
   * Elimina una clave específica
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Limpia toda la caché
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Elimina entradas expiradas
   */
  public purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Obtiene métricas estadísticas de la caché
   */
  public getStats(): CacheStats {
    const total = this.hits + this.misses;
    const ratio = total > 0 ? ((this.hits / total) * 100).toFixed(1) + "%" : "0%";

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRatio: ratio,
      totalSavedRequests: this.hits,
    };
  }
}

// Instancia global compartida para llamadas de IA del backend
export const titleSuggestionsCache = new AICache(200, 30 * 60 * 1000);
