// src/services/exportObsidianService.ts
//
// Genera el contenido .md de un proyecto LemWriter en formato Obsidian.
// NO escribe al disco — devuelve { relativePath, content } para que
// obsidianFsService.ts los escriba vía File System Access API.
//
// Estructura de destino en el vault:
//   raw/
//     sermones/
//     ensenanzas/
//     devocionales/
//     estudios/
//     videos/
//     libros/

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ObsidianProject {
  id: string;
  title: string;
  type: string;
  created_at: string;
  status?: string;
}

export interface ObsidianSection {
  title?: string;
  content?: string;
  order_index?: number;
}

export interface ObsidianExportResult {
  relativePath: string; // e.g. "sermones/sermon-la-gracia-2026.md"
  content: string;      // markdown completo listo para escribir
}

// ─── Mapeo de tipos ───────────────────────────────────────────────────────────

const TYPE_TO_FOLDER: Record<string, string> = {
  sermon:     'sermones',
  ensenanza:  'ensenanzas',
  devocional: 'devocionales',
  estudio:    'estudios',
  video:      'videos',
  libro:      'libros',
};

function normalizeType(rawType: string | undefined | null): string | null {
  if (!rawType) return null;
  const t = rawType.toLowerCase().trim();
  if (t === 'enseñanza' || t === 'ensenanza') return 'ensenanza';
  if (t === 'sermón'    || t === 'sermon')    return 'sermon';
  if (t === 'devocional')                     return 'devocional';
  if (t === 'estudio')                        return 'estudio';
  if (t === 'video')                          return 'video';
  if (t === 'libro')                          return 'libro';
  return null; // tipo desconocido — no exportar
}

// ─── Slug ─────────────────────────────────────────────────────────────────────

function toSlug(text: string | undefined | null): string {
  if (!text) return 'sin-titulo';
  return text
    .toLowerCase()
    .normalize('NFD')                    // descompone tildes
    .replace(/[\u0300-\u036f]/g, '')     // elimina diacríticos
    .replace(/[^a-z0-9\s-]/g, '')        // solo letras, números, espacios, guiones
    .trim()
    .replace(/\s+/g, '-')               // espacios → guiones
    .replace(/-+/g, '-')                // guiones múltiples → uno
    .substring(0, 80);                  // máx 80 chars
}

function buildFilename(project: ObsidianProject): { folder: string; filename: string } {
  const type   = normalizeType(project.type);
  const slug   = toSlug(project.title);
  const year   = new Date(project.created_at || Date.now()).getFullYear();
  const folder = TYPE_TO_FOLDER[type ?? ''] ?? 'otros';
  const filename = `${type}-${slug}-${year}.md`;
  return { folder, filename };
}

// ─── HTML → Markdown ──────────────────────────────────────────────────────────
// Cubre los elementos que Tiptap v3 genera: h1-h3, p, strong, em, u,
// ol, ul, li, blockquote. Sin dependencias externas.

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, '');
}

function htmlToMarkdown(html: string | undefined | null): string {
  if (!html) return '';

  let md = html;

  // Blockquotes (antes que párrafos para no interferir)
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_: string, inner: string) => {
    const text = htmlToMarkdown(inner).trim();
    return text.split('\n').map((l: string) => `> ${l}`).join('\n') + '\n\n';
  });

  // Encabezados
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_: string, t: string) => `# ${stripTags(t).trim()}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_: string, t: string) => `## ${stripTags(t).trim()}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_: string, t: string) => `### ${stripTags(t).trim()}\n\n`);

  // Listas ordenadas
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_: string, inner: string) => {
    let i = 0;
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_2: string, item: string) => {
      i++;
      return `${i}. ${stripTags(htmlToMarkdown(item)).trim()}\n`;
    }) + '\n';
  });

  // Listas no ordenadas
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_: string, inner: string) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_2: string, item: string) => {
      return `- ${stripTags(htmlToMarkdown(item)).trim()}\n`;
    }) + '\n';
  });

  // Formato inline
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_: string, t: string) => `**${stripTags(t)}**`);
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi,           (_: string, t: string) => `**${stripTags(t)}**`);
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi,         (_: string, t: string) => `*${stripTags(t)}*`);
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi,           (_: string, t: string) => `*${stripTags(t)}*`);
  md = md.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi,           (_: string, t: string) => `<u>${stripTags(t)}</u>`);

  // Párrafos
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_: string, t: string) => {
    const text = stripTags(t).trim();
    return text ? text + '\n\n' : '';
  });

  // Saltos de línea
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Eliminar cualquier tag HTML restante
  md = md.replace(/<[^>]+>/g, '');

  // Entidades HTML básicas
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g,  '&');
  md = md.replace(/&lt;/g,   '<');
  md = md.replace(/&gt;/g,   '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g,  "'");

  // Limpiar líneas en blanco excesivas (máx 2 consecutivas)
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

// ─── Construcción del archivo .md ─────────────────────────────────────────────

function buildMarkdown(project: ObsidianProject, sections: ObsidianSection[]): string {
  const now         = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const createdDate = project.created_at
    ? new Date(project.created_at).toISOString().split('T')[0]
    : now;

  // Frontmatter YAML — igual al desktop
  const frontmatter = [
    '---',
    `tipo: ${normalizeType(project.type) || project.type}`,
    `titulo: "${(project.title || '').replace(/"/g, '\\"')}"`,
    `fecha_creacion: ${createdDate}`,
    `ultima_actualizacion: ${now}`,
    `estado: ${project.status || 'en_progreso'}`,
    `tags: [${normalizeType(project.type) || 'ministerio'}, lemwriter]`,
    `lemwriter_id: "${project.id}"`,
    '---',
    '',
  ].join('\n');

  const titulo = `# ${project.title || 'Sin título'}\n\n`;

  // Secciones ordenadas por order_index (campo correcto — no usar position)
  const sortedSections = [...(sections || [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  );

  const cuerpo = sortedSections
    .map(section => {
      const parts: string[] = [];
      if (section.title?.trim()) {
        parts.push(`## ${section.title.trim()}\n`);
      }
      if (section.content) {
        parts.push(htmlToMarkdown(section.content));
      }
      return parts.join('\n');
    })
    .filter(Boolean)
    .join('\n\n---\n\n'); // separador visual entre secciones

  return frontmatter + titulo + cuerpo;
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Genera el contenido Obsidian de un proyecto sin escribirlo al disco.
 *
 * @param project  - Objeto proyecto de Supabase (id, title, type, created_at, status)
 * @param sections - Array de secciones del proyecto (title, content, order_index)
 * @returns        - { relativePath, content } o null si tipo desconocido / error
 *
 * Nunca lanza excepción — errores se loguean como warn/error.
 */
export function buildObsidianExport(
  project: ObsidianProject,
  sections: ObsidianSection[]
): ObsidianExportResult | null {
  try {
    const type = normalizeType(project.type);
    if (!type) {
      console.warn(`[Obsidian Export] Tipo desconocido: "${project.type}" — proyecto omitido`);
      return null;
    }

    const { folder, filename } = buildFilename(project);
    const relativePath = `${folder}/${filename}`;
    const content = buildMarkdown(project, sections);

    return { relativePath, content };
  } catch (err) {
    console.error('[Obsidian Export] Error al construir export:', (err as Error).message);
    return null;
  }
}
