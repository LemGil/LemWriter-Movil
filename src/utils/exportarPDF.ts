import { Proyecto } from '../types'
import { Seccion } from '../components/Editor'

interface OpcionesExportacionPDF {
  tamanoLetra: 'normal' | 'grande' | 'pulpito'
  incluirSumario: boolean
  incluirEncabezadoMinisterial: boolean
  incluirNotasAlPie: boolean
}

export function generarHTMLMinisterial(
  proyecto: { title: string; type?: string; updated_at?: string },
  secciones: Seccion[],
  opciones: OpcionesExportacionPDF = {
    tamanoLetra: 'normal',
    incluirSumario: true,
    incluirEncabezadoMinisterial: true,
    incluirNotasAlPie: true
  }
): string {
  const tipoEtiqueta: Record<string, string> = {
    sermon: 'Sermón Ministerial',
    estudio: 'Estudio Bíblico',
    devocional: 'Devocional Pastoral',
    ensenanza: 'Enseñanza Doctrinal',
    conferencia: 'Conferencia & Discipulado'
  }

  const tipoTexto = tipoEtiqueta[proyecto.type || 'sermon'] || 'Documento Ministerial'
  const fechaFormateada = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(proyecto.updated_at || Date.now()))

  const fontSizeMap = {
    normal: { body: '15px', h1: '24px', h2: '19px', line: '1.65' },
    grande: { body: '17px', h1: '27px', h2: '21px', line: '1.7' },
    pulpito: { body: '19px', h1: '30px', h2: '24px', line: '1.75' }
  }

  const fs = fontSizeMap[opciones.tamanoLetra] || fontSizeMap.normal

  // Generar HTML de cada sección
  const seccionesHTML = secciones
    .map((sec, idx) => {
      const numRomano = aNumeroRomano(idx + 1)
      return `
      <section class="seccion-bloque" id="sec-${sec.id}">
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

  // Sumario opcional
  const sumarioHTML = opciones.incluirSumario
    ? `
    <div class="sumario-container">
      <h3 class="sumario-titulo">Esquema del Mensaje</h3>
      <ol class="sumario-lista">
        ${secciones
          .map(
            (sec, i) => `
          <li class="sumario-item">
            <span class="sumario-item-num">${aNumeroRomano(i + 1)}.</span>
            <span class="sumario-item-nombre">${sec.title}</span>
          </li>
        `
          )
          .join('')}
      </ol>
    </div>
  `
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${proyecto.title} — LemWriter Ministerial</title>
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

    .documento-wrapper {
      max-width: 100%;
      margin: 0 auto;
    }

    /* Encabezado Ministerial Principal */
    .header-ministerial {
      text-align: center;
      padding-bottom: 18px;
      margin-bottom: 22px;
      border-bottom: 2px solid #C9A24A;
      position: relative;
    }

    .header-ministerial::after {
      content: '✠ ✠ ✠';
      display: block;
      color: #C9A24A;
      font-size: 11px;
      letter-spacing: 6px;
      margin-top: 8px;
    }

    .ministerio-nombre {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2.5px;
      color: #8C6D23;
      text-transform: uppercase;
      margin: 0 0 4px 0;
    }

    .tipo-documento {
      font-family: 'Inter', sans-serif;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #555555;
      background: #F4EEDC;
      display: inline-block;
      padding: 3px 12px;
      border-radius: 12px;
      border: 1px solid #DFBE72;
      margin-bottom: 12px;
    }

    .titulo-principal {
      font-family: 'Cinzel', Georgia, serif;
      font-size: ${fs.h1};
      font-weight: 700;
      color: #10242F;
      line-height: 1.25;
      margin: 6px 0 10px 0;
      letter-spacing: 0.5px;
    }

    .meta-linea {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      color: #666666;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
    }

    /* Sumario / Esquema */
    .sumario-container {
      background: #FAF8F2;
      border: 1px solid #E2D7BE;
      border-left: 4px solid #C9A24A;
      border-radius: 4px;
      padding: 14px 18px;
      margin-bottom: 26px;
      page-break-inside: avoid;
    }

    .sumario-titulo {
      font-family: 'Cinzel', serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #8C6D23;
      text-transform: uppercase;
      margin: 0 0 8px 0;
    }

    .sumario-lista {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 6px 14px;
    }

    .sumario-item {
      font-size: 13px;
      color: #2D3748;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .sumario-item-num {
      font-weight: 700;
      color: #8C6D23;
      font-size: 12px;
      min-width: 20px;
    }

    .sumario-item-nombre {
      font-weight: 500;
    }

    /* Secciones del Documento */
    .seccion-bloque {
      margin-bottom: 28px;
      page-break-inside: auto;
    }

    .seccion-encabezado {
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #DFBE72;
      padding-bottom: 6px;
      margin-bottom: 14px;
      page-break-after: avoid;
    }

    .seccion-numero {
      font-family: 'Cinzel', serif;
      font-weight: 700;
      font-size: 14px;
      color: #FFFFFF;
      background: #1E3D4F;
      border: 1px solid #C9A24A;
      min-width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .seccion-titulo {
      font-family: 'Cinzel', Georgia, serif;
      font-size: ${fs.h2};
      font-weight: 700;
      color: #10242F;
      margin: 0;
      letter-spacing: 0.3px;
    }

    /* Tipografía interna del editor */
    .seccion-contenido p {
      margin: 0 0 12px 0;
      text-align: justify;
      text-justify: inter-word;
    }

    .seccion-contenido blockquote {
      margin: 14px 0;
      padding: 10px 18px;
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
      margin: 18px 0 8px 0;
      page-break-after: avoid;
    }

    .seccion-contenido ul, 
    .seccion-contenido ol {
      margin: 8px 0 14px 20px;
      padding: 0;
    }

    .seccion-contenido li {
      margin-bottom: 5px;
    }

    .seccion-contenido strong {
      color: #0A1922;
      font-weight: 600;
    }

    .seccion-contenido hr {
      border: 0;
      height: 1px;
      background: #E2D7BE;
      margin: 20px 0;
    }

    .sin-contenido {
      color: #888888;
      font-size: 13px;
    }

    /* Pie de página ministerial */
    .footer-ministerial {
      margin-top: 36px;
      padding-top: 12px;
      border-top: 1px solid #E2D7BE;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Inter', sans-serif;
      font-size: 10px;
      color: #718096;
      page-break-inside: avoid;
    }

    @media print {
      body {
        background: transparent !important;
      }
      .seccion-bloque {
        page-break-inside: auto;
      }
    }
  </style>
</head>
<body>
  <div class="documento-wrapper">
    ${
      opciones.incluirEncabezadoMinisterial
        ? `
      <header class="header-ministerial">
        <div class="ministerio-nombre">Ministerio Apostólico LemGil</div>
        <div class="tipo-documento">${tipoTexto}</div>
        <h1 class="titulo-principal">${proyecto.title}</h1>
        <div class="meta-linea">
          <span>Fecha: ${fechaFormateada}</span>
          <span>•</span>
          <span>LemWriter Ministerial</span>
        </div>
      </header>
    `
        : `
      <div style="margin-bottom: 20px;">
        <h1 style="font-family: 'Cinzel', serif; font-size: ${fs.h1}; margin: 0 0 6px 0; color: #10242F;">${proyecto.title}</h1>
        <div style="font-size: 11px; color: #666; font-family: 'Inter', sans-serif;">${tipoTexto} • ${fechaFormateada}</div>
      </div>
    `
    }

    ${sumarioHTML}

    <main>
      ${seccionesHTML}
    </main>

    ${
      opciones.incluirNotasAlPie
        ? `
      <footer class="footer-ministerial">
        <span>Ministerio Apostólico LemGil — Edificación y Proclamación</span>
        <span>${proyecto.title}</span>
      </footer>
    `
        : ''
    }
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

export function imprimirOExportarPDF(
  proyecto: { title: string; type?: string; updated_at?: string },
  secciones: Seccion[],
  opciones: OpcionesExportacionPDF
): void {
  const html = generarHTMLMinisterial(proyecto, secciones, opciones)

  // Crear iframe oculto para impresión/guardar como PDF directo
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
      console.warn('Error launching print dialog:', e)
    } finally {
      // Limpiar el iframe luego de unos segundos
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 3000)
    }
  }, 400)
}
