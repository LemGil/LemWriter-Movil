import React, { useState } from 'react'
import { Seccion } from './Editor'
import { generarHTMLMinisterial, imprimirOExportarPDF } from '../utils/exportarPDF'

interface ExportarPDFModalProps {
  proyecto: { title: string; type?: string; updated_at?: string }
  secciones: Seccion[]
  onClose: () => void
}

export const ExportarPDFModal: React.FC<ExportarPDFModalProps> = ({
  proyecto,
  secciones,
  onClose
}) => {
  const [tamanoLetra, setTamanoLetra] = useState<'normal' | 'grande' | 'pulpito'>('normal')
  const [incluirSumario, setIncluirSumario] = useState(true)
  const [incluirEncabezado, setIncluirEncabezado] = useState(true)
  const [incluirPie, setIncluirPie] = useState(true)
  const [tabVista, setTabVista] = useState<'config' | 'preview'>('config')

  const previewHTML = generarHTMLMinisterial(proyecto, secciones, {
    tamanoLetra,
    incluirSumario,
    incluirEncabezadoMinisterial: incluirEncabezado,
    incluirNotasAlPie: incluirPie
  })

  function handleGenerarPDF() {
    imprimirOExportarPDF(proyecto, secciones, {
      tamanoLetra,
      incluirSumario,
      incluirEncabezadoMinisterial: incluirEncabezado,
      incluirNotasAlPie: incluirPie
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(10, 24, 33, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 150
      }}
      onClick={onClose}
    >
      <div
        className="anim-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1E3D4F',
          border: '1px solid #C9A24A',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          overflow: 'hidden'
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(18, 40, 52, 0.7)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>📄</span>
            <div>
              <h3
                style={{
                  margin: 0,
                  color: '#DFBE72',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '16px',
                  fontWeight: 700
                }}
              >
                Exportar Documento PDF Ministerial
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#9BB0BD' }}>
                Formato optimizado para púlpito e impresión ministerial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8E9EA7',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Pestañas de Vista */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(201, 162, 74, 0.2)',
            background: '#142C38',
            padding: '4px 16px',
            gap: '8px'
          }}
        >
          <button
            onClick={() => setTabVista('config')}
            style={{
              padding: '8px 14px',
              background: tabVista === 'config' ? 'rgba(201, 162, 74, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: tabVista === 'config' ? '2px solid #C9A24A' : '2px solid transparent',
              color: tabVista === 'config' ? '#DFBE72' : '#8E9EA7',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>⚙️</span>
            <span>Opciones de Impresión</span>
          </button>
          <button
            onClick={() => setTabVista('preview')}
            style={{
              padding: '8px 14px',
              background: tabVista === 'preview' ? 'rgba(201, 162, 74, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: tabVista === 'preview' ? '2px solid #C9A24A' : '2px solid transparent',
              color: tabVista === 'preview' ? '#DFBE72' : '#8E9EA7',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>👁️</span>
            <span>Previsualización</span>
          </button>
        </div>

        {/* Contenido según pestaña */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {tabVista === 'config' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Resumen del Proyecto */}
              <div
                style={{
                  background: '#142C38',
                  border: '1px solid rgba(201, 162, 74, 0.25)',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <div
                  style={{
                    background: '#1E3D4F',
                    border: '1px solid #C9A24A',
                    borderRadius: '8px',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#DFBE72',
                    fontSize: '18px',
                    flexShrink: 0
                  }}
                >
                  📜
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: '#F5F1E8',
                      fontFamily: "'Cinzel', serif",
                      fontSize: '14px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {proyecto.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9BB0BD', marginTop: '2px' }}>
                    {secciones.length} secciones organizadas • Formato Ministerial
                  </div>
                </div>
              </div>

              {/* Tamaño de Fuente / Modo Púlpito */}
              <div>
                <label
                  style={{
                    display: 'block',
                    color: '#DFBE72',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  Tamaño de Tipografía
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'normal', label: 'Estándar (15px)', desc: 'Impresión habitual' },
                    { id: 'grande', label: 'Grande (17px)', desc: 'Lectura cómoda' },
                    { id: 'pulpito', label: 'Púlpito (19px)', desc: 'Predicación en atril' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTamanoLetra(t.id as any)}
                      style={{
                        padding: '10px 8px',
                        background:
                          tamanoLetra === t.id ? 'rgba(201, 162, 74, 0.2)' : '#142C38',
                        border: `1px solid ${
                          tamanoLetra === t.id ? '#C9A24A' : 'rgba(201, 162, 74, 0.2)'
                        }`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease'
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
                      <div style={{ color: '#8E9EA7', fontSize: '10px', marginTop: '2px' }}>
                        {t.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Opciones de Inclusión */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label
                  style={{
                    color: '#DFBE72',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  Elementos del Documento
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#142C38',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#F5F1E8'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={incluirEncabezado}
                    onChange={(e) => setIncluirEncabezado(e.target.checked)}
                    style={{ accentColor: '#C9A24A', width: '16px', height: '16px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Encabezado & Sello Ministerial</div>
                    <div style={{ fontSize: '11px', color: '#8E9EA7' }}>
                      Incluye el membrete oficial del Ministerio LemGil y fecha
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#142C38',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#F5F1E8'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={incluirSumario}
                    onChange={(e) => setIncluirSumario(e.target.checked)}
                    style={{ accentColor: '#C9A24A', width: '16px', height: '16px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Esquema General / Sumario</div>
                    <div style={{ fontSize: '11px', color: '#8E9EA7' }}>
                      Resumen de puntos con numeración romana en la primera página
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#142C38',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#F5F1E8'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={incluirPie}
                    onChange={(e) => setIncluirPie(e.target.checked)}
                    style={{ accentColor: '#C9A24A', width: '16px', height: '16px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Pie de Página con Título del Mensaje</div>
                    <div style={{ fontSize: '11px', color: '#8E9EA7' }}>
                      Muestra el lema ministerial y nombre del documento en el pie
                    </div>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '8px',
                padding: '16px',
                height: '340px',
                overflowY: 'auto',
                boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)'
              }}
            >
              <iframe
                title="Previsualización Ministerial"
                srcDoc={previewHTML}
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

        {/* Pie del Modal con Botones */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(201, 162, 74, 0.25)',
            background: 'rgba(18, 40, 52, 0.8)',
            display: 'flex',
            gap: '10px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              background: '#142C38',
              border: '1px solid #2E4B5E',
              color: '#9BB0BD',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerarPDF}
            style={{
              flex: 2,
              padding: '12px',
              background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
              color: '#122834',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '13px',
              fontFamily: "'Cinzel', serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(201, 162, 74, 0.3)'
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 14h12v8H6z" />
            </svg>
            <span>Generar / Imprimir PDF</span>
          </button>
        </div>
      </div>
    </div>
  )
}
