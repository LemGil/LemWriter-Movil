import React, { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  ProyectoConSecciones,
  OpcionesCompendio,
  cargarTodosLosProyectosConSecciones,
  generarHTMLCompendio,
  imprimirOExportarCompendioPDF,
  exportarTodosComoZIP,
  descargarOCompartirBlob,
  exportarCopiaSeguridadJSON,
  restaurarCopiaSeguridadJSON
} from '../utils/exportarTodosPDF'

interface RespaldoTotalModalProps {
  onClose: () => void
  onRestauracionExitosa?: () => void
}

export const RespaldoTotalModal: React.FC<RespaldoTotalModalProps> = ({
  onClose,
  onRestauracionExitosa
}) => {
  const [cargando, setCargando] = useState(true)
  const [progresoCarga, setProgresoCarga] = useState({ actual: 0, total: 0 })
  const [items, setItems] = useState<ProyectoConSecciones[]>([])
  const [opcionActiva, setOpcionActiva] = useState<'compendio' | 'zip' | 'backup'>('compendio')

  // Opciones de configuración de PDF
  const [tamanoLetra, setTamanoLetra] = useState<'normal' | 'grande' | 'pulpito'>('normal')
  const [incluirPortada, setIncluirPortada] = useState(true)
  const [incluirIndice, setIncluirIndice] = useState(true)
  const [incluirSumarios, setIncluirSumarios] = useState(true)
  const [incluirEncabezados, setIncluirEncabezados] = useState(true)
  const [mostrarPreview, setMostrarPreview] = useState(false)

  // Estados de proceso
  const [procesandoZIP, setProcesandoZIP] = useState(false)
  const [progresoZIP, setProgresoZIP] = useState(0)
  const [procesandoJSON, setProcesandoJSON] = useState(false)
  const [restaurando, setRestaurando] = useState(false)

  const inputFileRef = useRef<HTMLInputElement>(null)

  // Cargar todos los proyectos y secciones al abrir el modal
  useEffect(() => {
    let montado = true
    async function cargar() {
      setCargando(true)
      try {
        const datos = await cargarTodosLosProyectosConSecciones((c, t) => {
          if (montado) setProgresoCarga({ actual: c, total: t })
        })
        if (montado) {
          setItems(datos)
        }
      } catch (e) {
        console.error('Error cargando proyectos para respaldo:', e)
        toast.error('No se pudieron cargar todos los mensajes')
      } finally {
        if (montado) setCargando(false)
      }
    }
    cargar()
    return () => {
      montado = false
    }
  }, [])

  const opcionesActuales: OpcionesCompendio = {
    tamanoLetra,
    incluirPortada,
    incluirIndiceGeneral: incluirIndice,
    incluirEncabezados,
    incluirSumarioPorProyecto: incluirSumarios
  }

  // Generar / Guardar PDF Completo
  function handleGenerarPDF() {
    if (items.length === 0) {
      toast.error('No hay mensajes disponibles para exportar')
      return
    }
    toast.loading('Generando documento PDF...', { id: 'pdf-toast' })
    try {
      imprimirOExportarCompendioPDF(items, opcionesActuales)
      toast.success('Documento listo. Usa "Guardar como PDF" en el diálogo de impresión.', {
        id: 'pdf-toast',
        duration: 5000
      })
    } catch (err) {
      toast.error('Error al generar el PDF', { id: 'pdf-toast' })
    }
  }

  // Descargar o Compartir Carpeta ZIP
  async function handleDescargarZIP() {
    if (items.length === 0) {
      toast.error('No hay proyectos para empaquetar')
      return
    }
    setProcesandoZIP(true)
    setProgresoZIP(0)
    const toastId = toast.loading('Empaquetando proyectos en ZIP...', { id: 'zip-toast' })

    try {
      const fechaStr = new Date().toISOString().split('T')[0]
      const zipBlob = await exportarTodosComoZIP(items, opcionesActuales, (p) => setProgresoZIP(p))
      
      await descargarOCompartirBlob(
        zipBlob,
        `LemWriter_Coleccion_PDF_${fechaStr}.zip`,
        'Respaldo Ministerial ZIP'
      )

      toast.success('Carpeta ZIP lista y guardada', { id: toastId })
    } catch (e) {
      console.error(e)
      toast.error('Error al generar la carpeta ZIP', { id: toastId })
    } finally {
      setProcesandoZIP(false)
    }
  }

  // Exportar Copia de Seguridad JSON
  async function handleExportarJSON() {
    if (items.length === 0) {
      toast.error('No hay proyectos para respaldar')
      return
    }
    setProcesandoJSON(true)
    const toastId = toast.loading('Creando archivo de respaldo...', { id: 'json-toast' })
    try {
      await exportarCopiaSeguridadJSON(items)
      toast.success('Respaldo descargado exitosamente', { id: toastId })
    } catch (e) {
      toast.error('No se pudo generar el respaldo', { id: toastId })
    } finally {
      setProcesandoJSON(false)
    }
  }

  // Importar / Restaurar Copia JSON
  async function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setRestaurando(true)
    const toastId = toast.loading('Restaurando proyectos...', { id: 'restore-toast' })

    try {
      const texto = await file.text()
      const { restaurados, totalSecciones } = await restaurarCopiaSeguridadJSON(texto)
      toast.success(
        `Se restauraron ${restaurados} proyectos y ${totalSecciones} secciones exitosamente`,
        { id: 'restore-toast', duration: 5000 }
      )
      if (onRestauracionExitosa) {
        onRestauracionExitosa()
      }
      onClose()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error al procesar el archivo de respaldo', { id: 'restore-toast' })
    } finally {
      setRestaurando(false)
      if (inputFileRef.current) inputFileRef.current.value = ''
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(8, 20, 28, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        zIndex: 150
      }}
      onClick={onClose}
    >
      <div
        className="anim-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #1E3D4F 0%, #132A37 100%)',
          border: '1px solid #C9A24A',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '92vh',
          maxHeight: '92dvh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden'
        }}
      >
        {/* Cabecera Principal */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(16, 36, 47, 0.9)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📦</span>
            <div>
              <h2
                style={{
                  margin: 0,
                  color: '#DFBE72',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '16px',
                  fontWeight: 700,
                  lineHeight: 1.2
                }}
              >
                Copia de Seguridad & Respaldo Total
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#9BB0BD' }}>
                Resguarda todos tus proyectos en tu móvil o nube
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{
              background: 'none',
              border: 'none',
              color: '#8E9EA7',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Selector de Opciones / Pestañas Superiores */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            background: '#122834',
            borderBottom: '1px solid rgba(201, 162, 74, 0.25)',
            padding: '4px 8px',
            gap: '4px'
          }}
        >
          <button
            type="button"
            onClick={() => {
              setOpcionActiva('compendio')
              setMostrarPreview(false)
            }}
            style={{
              padding: '8px 4px',
              background:
                opcionActiva === 'compendio'
                  ? 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(30, 61, 79, 0.8) 100%)'
                  : 'transparent',
              border: 'none',
              borderBottom: opcionActiva === 'compendio' ? '2px solid #C9A24A' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              color: opcionActiva === 'compendio' ? '#DFBE72' : '#8E9EA7',
              fontSize: '11.5px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px'
            }}
          >
            <span>📖</span>
            <span>Compendio PDF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpcionActiva('zip')
              setMostrarPreview(false)
            }}
            style={{
              padding: '8px 4px',
              background:
                opcionActiva === 'zip'
                  ? 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(30, 61, 79, 0.8) 100%)'
                  : 'transparent',
              border: 'none',
              borderBottom: opcionActiva === 'zip' ? '2px solid #C9A24A' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              color: opcionActiva === 'zip' ? '#DFBE72' : '#8E9EA7',
              fontSize: '11.5px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px'
            }}
          >
            <span>📁</span>
            <span>Carpeta ZIP</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpcionActiva('backup')
              setMostrarPreview(false)
            }}
            style={{
              padding: '8px 4px',
              background:
                opcionActiva === 'backup'
                  ? 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(30, 61, 79, 0.8) 100%)'
                  : 'transparent',
              border: 'none',
              borderBottom: opcionActiva === 'backup' ? '2px solid #C9A24A' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              color: opcionActiva === 'backup' ? '#DFBE72' : '#8E9EA7',
              fontSize: '11.5px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px'
            }}
          >
            <span>💾</span>
            <span>Datos JSON</span>
          </button>
        </div>

        {/* Contenido Dinámico */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <span
                className="anim-spin"
                style={{
                  display: 'inline-block',
                  width: '28px',
                  height: '28px',
                  border: '3px solid rgba(201, 162, 74, 0.3)',
                  borderTopColor: '#C9A24A',
                  borderRadius: '50%',
                  marginBottom: '14px'
                }}
              />
              <div
                style={{
                  color: '#DFBE72',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Cargando sermones y secciones...
              </div>
              <div style={{ fontSize: '11px', color: '#8E9EA7', marginTop: '4px' }}>
                {progresoCarga.total > 0
                  ? `Recuperando ${progresoCarga.actual} de ${progresoCarga.total} proyectos`
                  : 'Preparando biblioteca ministerial'}
              </div>
            </div>
          ) : (
            <>
              {/* Tarjeta de Resumen General */}
              <div
                style={{
                  background: 'rgba(18, 40, 52, 0.7)',
                  border: '1px solid rgba(201, 162, 74, 0.25)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#DFBE72', fontSize: '16px' }}>📚</span>
                  <span style={{ color: '#F5F1E8', fontSize: '13px', fontWeight: 600 }}>
                    {items.length} {items.length === 1 ? 'Proyecto' : 'Proyectos'} Registrados
                  </span>
                </div>
                <span
                  style={{
                    background: 'rgba(201, 162, 74, 0.15)',
                    color: '#DFBE72',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  {items.reduce((acc, curr) => acc + curr.secciones.length, 0)} Secciones
                </span>
              </div>

              {/* OPCIÓN 1: COMPENDIO PDF */}
              {opcionActiva === 'compendio' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div
                    style={{
                      background: 'rgba(201, 162, 74, 0.08)',
                      border: '1px solid rgba(201, 162, 74, 0.2)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: '#E8DFCE',
                      lineHeight: 1.4
                    }}
                  >
                    ✨ <strong>PDF Consolidado Ministerial:</strong> Une todos tus sermones en un
                    único documento con portada solemne, tabla de contenidos general y saltos de
                    página por cada mensaje.
                  </div>

                  {/* Configuración de Tipografía */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        color: '#DFBE72',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        marginBottom: '6px'
                      }}
                    >
                      Tamaño de Letra para Impresión / Lectura
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      {[
                        { id: 'normal', label: 'Estándar', desc: '15px' },
                        { id: 'grande', label: 'Grande', desc: '17px' },
                        { id: 'pulpito', label: 'Púlpito', desc: '19px' }
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTamanoLetra(t.id as any)}
                          style={{
                            padding: '8px 4px',
                            background:
                              tamanoLetra === t.id ? 'rgba(201, 162, 74, 0.22)' : '#142C38',
                            border: `1px solid ${
                              tamanoLetra === t.id ? '#C9A24A' : 'rgba(201, 162, 74, 0.2)'
                            }`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          <div
                            style={{
                              color: tamanoLetra === t.id ? '#DFBE72' : '#F5F1E8',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                          >
                            {t.label}
                          </div>
                          <div style={{ color: '#8E9EA7', fontSize: '9.5px' }}>{t.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opciones de Inclusión */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#142C38',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        color: '#F5F1E8'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={incluirPortada}
                        onChange={(e) => setIncluirPortada(e.target.checked)}
                        style={{ accentColor: '#C9A24A' }}
                      />
                      <span>Portada Oficial</span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#142C38',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        color: '#F5F1E8'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={incluirIndice}
                        onChange={(e) => setIncluirIndice(e.target.checked)}
                        style={{ accentColor: '#C9A24A' }}
                      />
                      <span>Índice General</span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#142C38',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        color: '#F5F1E8'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={incluirSumarios}
                        onChange={(e) => setIncluirSumarios(e.target.checked)}
                        style={{ accentColor: '#C9A24A' }}
                      />
                      <span>Esquema por Mensaje</span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#142C38',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        color: '#F5F1E8'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={incluirEncabezados}
                        onChange={(e) => setIncluirEncabezados(e.target.checked)}
                        style={{ accentColor: '#C9A24A' }}
                      />
                      <span>Membrete Ministerial</span>
                    </label>
                  </div>

                  {/* Alternar Previsualización */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setMostrarPreview(!mostrarPreview)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#DFBE72',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>{mostrarPreview ? '🔼 Ocultar Vista Previa' : '👁️ Ver Vista Previa del Compendio'}</span>
                    </button>
                  </div>

                  {mostrarPreview && (
                    <div
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        padding: '12px',
                        height: '240px',
                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)',
                        overflow: 'hidden'
                      }}
                    >
                      <iframe
                        title="Previsualización Compendio"
                        srcDoc={generarHTMLCompendio(items, opcionesActuales)}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          background: '#FFFFFF'
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* OPCIÓN 2: CARPETA ZIP */}
              {opcionActiva === 'zip' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div
                    style={{
                      background: 'rgba(48, 164, 108, 0.1)',
                      border: '1px solid rgba(48, 164, 108, 0.3)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '12px',
                      color: '#E0F2E9',
                      lineHeight: 1.45
                    }}
                  >
                    📁 <strong>Carpeta de Documentos Individuales (.ZIP):</strong> Empaqueta cada uno
                    de tus {items.length} proyectos en un archivo independiente con diseño
                    ministerial, además del compendio general consolidado.
                    <br />
                    <span style={{ color: '#4AE098', fontSize: '11px', marginTop: '6px', display: 'block' }}>
                      ✓ Al descargar en tu móvil, puedes tocar el archivo ZIP para extraer todos los
                      documentos en tu carpeta de "Descargas" o enviártelos a Google Drive o WhatsApp.
                    </span>
                  </div>

                  {procesandoZIP && (
                    <div
                      style={{
                        background: '#142C38',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(201, 162, 74, 0.3)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          color: '#DFBE72',
                          marginBottom: '6px'
                        }}
                      >
                        <span>Empaquetando proyectos en ZIP...</span>
                        <span>{progresoZIP}%</span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: '6px',
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}
                      >
                        <div
                          style={{
                            width: `${progresoZIP}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #DFBE72, #4AE098)',
                            transition: 'width 0.2s ease'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* OPCIÓN 3: RESPALDO Y RESTAURACIÓN JSON */}
              {opcionActiva === 'backup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div
                    style={{
                      background: 'rgba(201, 162, 74, 0.08)',
                      border: '1px solid rgba(201, 162, 74, 0.25)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '12px',
                      color: '#E8DFCE',
                      lineHeight: 1.45
                    }}
                  >
                    💾 <strong>Copia de Seguridad Integral de Datos:</strong> Genera un archivo
                    seguro con todos tus textos, títulos, borradores y secciones para restaurarlos
                    fácilmente si formateas o cambias de dispositivo.
                  </div>

                  {/* Sección Restaurar */}
                  <div
                    style={{
                      background: '#142C38',
                      border: '1px dashed rgba(201, 162, 74, 0.35)',
                      borderRadius: '10px',
                      padding: '14px',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '4px' }}>📥</div>
                    <div
                      style={{
                        color: '#F5F1E8',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        fontFamily: "'Cinzel', serif"
                      }}
                    >
                      ¿Tienes un respaldo guardado?
                    </div>
                    <p style={{ color: '#8E9EA7', fontSize: '11px', margin: '4px 0 10px 0' }}>
                      Selecciona tu archivo <code>.json</code> para recuperar todos tus proyectos.
                    </p>

                    <input
                      ref={inputFileRef}
                      type="file"
                      accept=".json"
                      onChange={handleArchivoSeleccionado}
                      style={{ display: 'none' }}
                    />

                    <button
                      type="button"
                      disabled={restaurando}
                      onClick={() => inputFileRef.current?.click()}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(201, 162, 74, 0.15)',
                        border: '1px solid #C9A24A',
                        color: '#DFBE72',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: restaurando ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {restaurando ? 'Restaurando datos...' : 'Seleccionar Archivo de Respaldo'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie del Modal con Botones Principales */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(201, 162, 74, 0.25)',
            background: 'rgba(16, 36, 47, 0.95)',
            display: 'flex',
            gap: '10px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '11px',
              background: '#142C38',
              border: '1px solid #2E4B5E',
              color: '#9BB0BD',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '12.5px',
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>

          {opcionActiva === 'compendio' && (
            <button
              type="button"
              disabled={cargando || items.length === 0}
              onClick={handleGenerarPDF}
              style={{
                flex: 2,
                padding: '11px 14px',
                background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                color: '#122834',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12.5px',
                fontFamily: "'Cinzel', serif",
                cursor: cargando || items.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(201, 162, 74, 0.3)'
              }}
            >
              <span>📄</span>
              <span>Generar / Guardar PDF Completo</span>
            </button>
          )}

          {opcionActiva === 'zip' && (
            <button
              type="button"
              disabled={cargando || procesandoZIP || items.length === 0}
              onClick={handleDescargarZIP}
              style={{
                flex: 2,
                padding: '11px 14px',
                background: 'linear-gradient(135deg, #4AE098 0%, #30A46C 100%)',
                color: '#0D2318',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12.5px',
                fontFamily: "'Cinzel', serif",
                cursor: cargando || procesandoZIP || items.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(48, 164, 108, 0.35)'
              }}
            >
              <span>{procesandoZIP ? '⏳' : '📁'}</span>
              <span>{procesandoZIP ? 'Empaquetando...' : 'Descargar Carpeta ZIP'}</span>
            </button>
          )}

          {opcionActiva === 'backup' && (
            <button
              type="button"
              disabled={cargando || procesandoJSON || items.length === 0}
              onClick={handleExportarJSON}
              style={{
                flex: 2,
                padding: '11px 14px',
                background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                color: '#122834',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12.5px',
                fontFamily: "'Cinzel', serif",
                cursor: cargando || procesandoJSON || items.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(201, 162, 74, 0.3)'
              }}
            >
              <span>{procesandoJSON ? '⏳' : '💾'}</span>
              <span>{procesandoJSON ? 'Exportando...' : 'Descargar Respaldo JSON'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
