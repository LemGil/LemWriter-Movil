import JSZip from 'jszip'
import { Proyecto } from '../types'
import { Seccion } from '../components/Editor'
import { supabase } from '../lib/supabase'
import { getOfflineProjects, getOfflineSections, saveOrUpdateOfflineProject, saveOfflineSections } from '../lib/offlineStore'
import { generarHTMLMinisterial } from './exportarPDF'

export interface ProyectoConSecciones {
  proyecto: Proyecto
  secciones: Seccion[]
}

export interface OpcionesCompendio {
  tamanoLetra: 'normal' | 'grande' | 'pulpito'
  incluirPortada: boolean
  incluirIndiceGeneral: boolean
  incluirEncabezados: boolean
  incluirSumarioPorProyecto: boolean
}

/**
 * Obtiene todos los proyectos y sus respectivas secciones desde Supabase o Caché local
 */
export async function cargarTodosLosProyectosConSecciones(
  onProgreso?: (cargados: number, total: number) => void
): Promise<ProyectoConSecciones[]> {
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine

  let listaProyectos: Proyecto[] = []

  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from('lw_proyectos')
        .select('*')
        .order('updated_at', { ascending: false })

      if (!error && data && data.length > 0) {
        listaProyectos = data as Proyecto[]
      }
    } catch (e) {
      console.warn('Error obteniendo proyectos de supabase:', e)
    }
  }

  if (listaProyectos.length === 0) {
    listaProyectos = getOfflineProjects() as Proyecto[]
  }

  const resultado: ProyectoConSecciones[] = []
  const total = listaProyectos.length

  for (let i = 0; i < total; i++) {
    const p = listaProyectos[i]
    let secciones: Seccion[] = []

    if (isOnline && !p.id.startsWith('local_')) {
      try {
        const { data: secData, error: secError } = await supabase
          .from('lw_secciones')
          .select('*')
          .eq('project_id', p.id)
          .order('order_index', { ascending: true })

        if (!secError && secData) {
          secciones = secData as Seccion[]
        }
      } catch (e) {
        console.warn(`Error al cargar secciones online para ${p.id}:`, e)
      }
    }

    if (secciones.length === 0) {
      secciones = getOfflineSections(p.id) as Seccion[]
    }

    // Si aún así no tiene secciones, crear al menos una dummy para visualización
    if (secciones.length === 0) {
      secciones = [
        {
          id: `sec_${p.id}_default`,
          project_id: p.id,
          title: 'Contenido General',
          content: '<p class="sin-contenido"><em>[Sin contenido registrado]</em></p>',
          order_index: 0
        }
      ]
    }

    resultado.push({ proyecto: p, secciones })
    if (onProgreso) {
      onProgreso(i + 1, total)
    }
  }

  return resultado
}

/**
 * Genera el documento HTML completo del Compendio / Libro de todos los sermones y proyectos
 */
export function generarHTMLCompendio(
  items: ProyectoConSecciones[],
  opciones: OpcionesCompendio = {
    tamanoLetra: 'normal',
    incluirPortada: true,
    incluirIndiceGeneral: true,
    incluirEncabezados: true,
    incluirSumarioPorProyecto: true
  }
): string {
  const fechaHoy = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date())

  const fontSizeMap = {
    normal: { body: '15px', h1: '24px', h2: '19px', line: '1.65' },
    grande: { body: '17px', h1: '27px', h2: '21px', line: '1.7' },
    pulpito: { body: '19px', h1: '30px', h2: '24px', line: '1.75' }
  }

  const fs = fontSizeMap[opciones.tamanoLetra] || fontSizeMap.normal

  const tipoEtiqueta: Record<string, string> = {
    sermon: 'Sermón',
    estudio: 'Estudio Bíblico',
    devocional: 'Devocional Pastoral',
    ensenanza: 'Enseñanza Doctrinal',
    conferencia: 'Conferencia',
    libro: 'Tratado / Libro',
    revelacion: 'Revelación',
    apostolico: 'Apostólico'
  }

  // Generar HTML de cada proyecto
  const proyectosHTML = items
    .map((item, pIdx) => {
      const p = item.proyecto
      const secs = item.secciones
      const tipoTexto = tipoEtiqueta[p.type?.toLowerCase() || 'sermon'] || 'Documento Ministerial'
      const fechaP = new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(new Date(p.updated_at || Date.now()))

      const seccionesBloque = secs
        .map((sec, sIdx) => {
          const numRomano = aNumeroRomano(sIdx + 1)
          return `
          <section class="seccion-bloque" id="proj-${p.id}-sec-${sec.id}">
            <div class="seccion-encabezado">
              <span class="seccion-numero">${numRomano}</span>
              <h2 class="seccion-titulo">${sec.title}</h2>
            </div>
            <div class="seccion-contenido">
              ${sec.content && sec.content.trim() ? sec.content : '<p class="sin-contenido"><em>[Sección sin contenido escrito]</em></p>'}
            </div>
          </section>
        `
        })
        .join('')

      const sumarioP = opciones.incluirSumarioPorProyecto && secs.length > 1
        ? `
        <div class="sumario-container">
          <h4 class="sumario-titulo">Esquema del Mensaje</h4>
          <ol class="sumario-lista">
            ${secs.map((s, i) => `
              <li class="sumario-item">
                <span class="sumario-item-num">${aNumeroRomano(i + 1)}.</span>
                <span class="sumario-item-nombre">${s.title}</span>
              </li>
            `).join('')}
          </ol>
        </div>
      `
        : ''

      return `
      <article class="proyecto-documento" id="proyecto-${p.id}">
        <header class="header-ministerial">
          <div class="ministerio-nombre">Ministerio Apostólico LemGil</div>
          <div class="tipo-documento">${tipoTexto} • Mensaje ${pIdx + 1} de ${items.length}</div>
          <h1 class="titulo-principal">${p.title}</h1>
          <div class="meta-linea">
            <span>Fecha: ${fechaP}</span>
            <span>•</span>
            <span>${secs.length} ${secs.length === 1 ? 'Sección' : 'Secciones'}</span>
          </div>
        </header>

        ${sumarioP}

        <div class="secciones-contenedor">
          ${seccionesBloque}
        </div>

        <footer class="footer-ministerial">
          <span>Ministerio Apostólico LemGil — Compendio Ministerial</span>
          <span>${p.title}</span>
        </footer>
      </article>
    `
    })
    .join('')

  // Portada
  const portadaHTML = opciones.incluirPortada
    ? `
    <div class="portada-compendio">
      <div class="portada-cruz">✠</div>
      <div class="portada-institucion">Ministerio Apostólico LemGil</div>
      <h1 class="portada-titulo">COMPENDIO MINISTERIAL</h1>
      <div class="portada-subtitulo">Colección Completa de Sermones, Enseñanzas y Tratados Doctrinales</div>
      <div class="portada-divisor"></div>
      
      <div class="portada-detalles">
        <div class="portada-dato">
          <span class="portada-dato-label">Total de Documentos</span>
          <span class="portada-dato-val">${items.length} Mensajes</span>
        </div>
        <div class="portada-dato">
          <span class="portada-dato-label">Fecha de Compilación</span>
          <span class="portada-dato-val">${fechaHoy}</span>
        </div>
        <div class="portada-dato">
          <span class="portada-dato-label">Herramienta</span>
          <span class="portada-dato-val">LemWriter Ministerial</span>
        </div>
      </div>

      <div class="portada-pie">
        «Edificados sobre el fundamento de los apóstoles y profetas, siendo la principal piedra del ángulo Jesucristo mismo.»
        <br><em>Efesios 2:20</em>
      </div>
    </div>
  `
    : ''

  // Índice General
  const indiceHTML = opciones.incluirIndiceGeneral
    ? `
    <div class="indice-general-hoja">
      <h2 class="indice-general-titulo">Tabla General de Contenidos</h2>
      <div class="indice-general-sub">Índice estructurado de todos los proyectos incluidos</div>
      
      <div class="indice-general-lista">
        ${items.map((item, idx) => {
          const t = tipoEtiqueta[item.proyecto.type?.toLowerCase() || 'sermon'] || 'Sermón'
          return `
            <div class="indice-general-fila">
              <span class="indice-num">${idx + 1}.</span>
              <div class="indice-info">
                <span class="indice-titulo">${item.proyecto.title}</span>
                <span class="indice-meta">${t} • ${item.secciones.length} secciones</span>
              </div>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Compendio Ministerial LemWriter — ${fechaHoy}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800&family=Crimson+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600&display=swap');

    @page {
      size: letter portrait;
      margin: 18mm 18mm 20mm 18mm;
      @bottom-right {
        content: counter(page);
      }
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Crimson Pro', Georgia, serif;
      font-size: ${fs.body};
      line-height: ${fs.line};
      color: #1A1A1A;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
    }

    /* PORTADA */
    .portada-compendio {
      min-height: 92vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px 20px;
      page-break-after: always;
      border: 3px double #C9A24A;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .portada-cruz {
      font-size: 38px;
      color: #C9A24A;
      margin-bottom: 16px;
    }

    .portada-institucion {
      font-family: 'Cinzel', serif;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 4px;
      color: #8C6D23;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .portada-titulo {
      font-family: 'Cinzel', serif;
      font-size: 32px;
      font-weight: 800;
      color: #10242F;
      letter-spacing: 2px;
      margin: 0 0 12px 0;
      line-height: 1.2;
    }

    .portada-subtitulo {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: #555555;
      max-width: 460px;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .portada-divisor {
      width: 120px;
      height: 2px;
      background: linear-gradient(90deg, transparent, #C9A24A, transparent);
      margin: 0 auto 30px auto;
    }

    .portada-detalles {
      display: flex;
      gap: 30px;
      justify-content: center;
      margin-bottom: 40px;
      background: #FAF8F2;
      border: 1px solid #E2D7BE;
      padding: 14px 24px;
      border-radius: 8px;
    }

    .portada-dato {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .portada-dato-label {
      font-family: 'Inter', sans-serif;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #777777;
    }

    .portada-dato-val {
      font-family: 'Cinzel', serif;
      font-size: 13px;
      font-weight: 700;
      color: #10242F;
    }

    .portada-pie {
      font-family: 'Crimson Pro', serif;
      font-style: italic;
      font-size: 14px;
      color: #666666;
      max-width: 480px;
      margin-top: 20px;
      line-height: 1.5;
    }

    /* ÍNDICE GENERAL */
    .indice-general-hoja {
      page-break-after: always;
      padding: 10px 0;
      margin-bottom: 30px;
    }

    .indice-general-titulo {
      font-family: 'Cinzel', serif;
      font-size: 22px;
      font-weight: 700;
      color: #10242F;
      text-align: center;
      border-bottom: 2px solid #C9A24A;
      padding-bottom: 8px;
      margin-bottom: 4px;
    }

    .indice-general-sub {
      text-align: center;
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      color: #777777;
      margin-bottom: 24px;
    }

    .indice-general-lista {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .indice-general-fila {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 8px 12px;
      background: #FAF8F2;
      border-radius: 6px;
      border: 1px solid #EAE3D2;
    }

    .indice-num {
      font-family: 'Cinzel', serif;
      font-weight: 700;
      color: #8C6D23;
      font-size: 13px;
      min-width: 24px;
    }

    .indice-info {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex: 1;
      gap: 10px;
    }

    .indice-titulo {
      font-family: 'Cinzel', serif;
      font-weight: 700;
      font-size: 14px;
      color: #10242F;
    }

    .indice-meta {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      color: #666666;
    }

    /* DOCUMENTO / PROYECTO INDIVIDUAL */
    .proyecto-documento {
      page-break-before: always;
      margin-bottom: 40px;
    }

    .header-ministerial {
      text-align: center;
      padding-bottom: 16px;
      margin-bottom: 20px;
      border-bottom: 2px solid #C9A24A;
    }

    .header-ministerial::after {
      content: '✠ ✠ ✠';
      display: block;
      color: #C9A24A;
      font-size: 11px;
      letter-spacing: 6px;
      margin-top: 6px;
    }

    .ministerio-nombre {
      font-family: 'Cinzel', serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2.5px;
      color: #8C6D23;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .tipo-documento {
      font-family: 'Inter', sans-serif;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #555555;
      background: #F4EEDC;
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      border: 1px solid #DFBE72;
      margin-bottom: 10px;
    }

    .titulo-principal {
      font-family: 'Cinzel', serif;
      font-size: ${fs.h1};
      font-weight: 700;
      color: #10242F;
      margin: 4px 0 8px 0;
      line-height: 1.25;
    }

    .meta-linea {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      color: #666666;
      display: flex;
      justify-content: center;
      gap: 10px;
    }

    /* Sumario */
    .sumario-container {
      background: #FAF8F2;
      border-left: 3.5px solid #C9A24A;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 22px;
      page-break-inside: avoid;
    }

    .sumario-titulo {
      font-family: 'Cinzel', serif;
      font-size: 12px;
      font-weight: 700;
      color: #8C6D23;
      text-transform: uppercase;
      margin: 0 0 6px 0;
    }

    .sumario-lista {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 4px 12px;
    }

    .sumario-item {
      font-size: 12px;
      color: #2D3748;
      display: flex;
      gap: 4px;
    }

    .sumario-item-num {
      font-weight: 700;
      color: #8C6D23;
    }

    /* Secciones */
    .seccion-bloque {
      margin-bottom: 24px;
      page-break-inside: auto;
    }

    .seccion-encabezado {
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #DFBE72;
      padding-bottom: 4px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }

    .seccion-numero {
      font-family: 'Cinzel', serif;
      font-weight: 700;
      font-size: 13px;
      color: #FFFFFF;
      background: #1E3D4F;
      border: 1px solid #C9A24A;
      min-width: 26px;
      height: 26px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .seccion-titulo {
      font-family: 'Cinzel', serif;
      font-size: ${fs.h2};
      font-weight: 700;
      color: #10242F;
      margin: 0;
    }

    .seccion-contenido p {
      margin: 0 0 10px 0;
      text-align: justify;
      text-justify: inter-word;
    }

    .seccion-contenido blockquote {
      margin: 12px 0;
      padding: 8px 14px;
      background: #FAF7EF;
      border-left: 3.5px solid #C9A24A;
      font-style: italic;
      color: #2C3E50;
      border-radius: 0 4px 4px 0;
      page-break-inside: avoid;
    }

    .seccion-contenido h1,
    .seccion-contenido h2,
    .seccion-contenido h3 {
      font-family: 'Cinzel', serif;
      color: #10242F;
      margin: 14px 0 6px 0;
      page-break-after: avoid;
    }

    .sin-contenido {
      color: #888888;
      font-size: 12px;
    }

    .footer-ministerial {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #E2D7BE;
      display: flex;
      justify-content: space-between;
      font-family: 'Inter', sans-serif;
      font-size: 10px;
      color: #718096;
      page-break-inside: avoid;
    }

    @media print {
      body {
        background: transparent !important;
      }
      .proyecto-documento {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <div class="compendio-wrapper">
    ${portadaHTML}
    ${indiceHTML}
    <main>
      ${proyectosHTML}
    </main>
  </div>
</body>
</html>`
}

function aNumeroRomano(num: number): string {
  const romanos: [number, string][] = [
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ]
  let resultado = ''
  for (const [valor, simbolo] of romanos) {
    while (num >= valor) {
      resultado += simbolo
      num -= valor
    }
  }
  return resultado || 'I'
}

/**
 * Lanza la impresión / Guardar como PDF del Compendio Consolidado
 */
export function imprimirOExportarCompendioPDF(
  items: ProyectoConSecciones[],
  opciones: OpcionesCompendio
): void {
  const html = generarHTMLCompendio(items, opciones)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(html)
  doc.close()

  iframe.contentWindow?.focus()
  setTimeout(() => {
    try {
      iframe.contentWindow?.print()
    } catch (e) {
      console.warn('Error imprimiendo compendio:', e)
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 4000)
    }
  }, 500)
}

/**
 * Empaqueta todos los proyectos como PDFs/HTMLs individuales en un archivo ZIP descargable o compartible
 */
export async function exportarTodosComoZIP(
  items: ProyectoConSecciones[],
  opciones: OpcionesCompendio,
  onProgreso?: (porcentaje: number) => void
): Promise<Blob> {
  const zip = new JSZip()
  const folder = zip.folder('LemWriter_Proyectos_PDF') || zip

  const fechaStr = new Date().toISOString().split('T')[0]

  // 1. Añadir el compendio consolidado completo
  const compendioHTML = generarHTMLCompendio(items, opciones)
  folder.file(`00_COMPENDIO_GENERAL_${fechaStr}.html`, compendioHTML)

  // 2. Añadir cada proyecto individual en formato imprimible/PDF
  items.forEach((item, index) => {
    const p = item.proyecto
    const num = String(index + 1).padStart(2, '0')
    const safeTitle = (p.title || 'Proyecto')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim()
      .substring(0, 50)

    const individualHTML = generarHTMLMinisterial(p, item.secciones, {
      tamanoLetra: opciones.tamanoLetra,
      incluirSumario: true,
      incluirEncabezadoMinisterial: opciones.incluirEncabezados,
      incluirNotasAlPie: true
    })

    folder.file(`${num}_${safeTitle}.html`, individualHTML)
  })

  // 3. Generar el archivo ZIP
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    (metadata) => {
      if (onProgreso) {
        onProgreso(Math.round(metadata.percent))
      }
    }
  )

  return zipBlob
}

/**
 * Descarga o comparte un archivo Blob de forma nativa en móviles y escritorios
 */
export async function descargarOCompartirBlob(
  blob: Blob,
  nombreArchivo: string,
  tituloShare: string = 'Respaldo LemWriter'
): Promise<void> {
  const file = new File([blob], nombreArchivo, { type: blob.type })

  // Intentar compartir con Web Share API (ideal para móviles: WhatsApp, Drive, Archivos)
  if (
    typeof navigator !== 'undefined' &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: tituloShare,
        text: `Respaldo de LemWriter Ministerial (${nombreArchivo})`
      })
      return
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Fallo Web Share API, descargando directamente:', err)
      } else {
        return // Usuario canceló compartir
      }
    }
  }

  // Fallback estándar de descarga por enlace <a>
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Genera y descarga el archivo JSON de respaldo total
 */
export async function exportarCopiaSeguridadJSON(items: ProyectoConSecciones[]): Promise<void> {
  const fechaStr = new Date().toISOString().split('T')[0]
  const backupData = {
    version: '1.0.0',
    exportado_el: new Date().toISOString(),
    total_proyectos: items.length,
    sistema: 'LemWriter Ministerial',
    proyectos: items.map((i) => ({
      proyecto: i.proyecto,
      secciones: i.secciones
    }))
  }

  const jsonStr = JSON.stringify(backupData, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
  await descargarOCompartirBlob(
    blob,
    `LemWriter_Respaldo_Total_${fechaStr}.json`,
    'Respaldo de Datos LemWriter'
  )
}

/**
 * Restaura datos desde un objeto JSON de respaldo a la base local y sincronización
 */
export async function restaurarCopiaSeguridadJSON(
  jsonText: string
): Promise<{ restaurados: number; totalSecciones: number }> {
  const data = JSON.parse(jsonText)
  if (!data.proyectos || !Array.isArray(data.proyectos)) {
    throw new Error('El archivo no tiene el formato de respaldo válido de LemWriter.')
  }

  let totalProyectos = 0
  let totalSecciones = 0

  for (const item of data.proyectos) {
    if (item.proyecto) {
      saveOrUpdateOfflineProject(item.proyecto)
      totalProyectos++
      if (item.secciones && Array.isArray(item.secciones)) {
        saveOfflineSections(item.proyecto.id, item.secciones)
        totalSecciones += item.secciones.length
      }
    }
  }

  return { restaurados: totalProyectos, totalSecciones }
}
