import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import {
  getOfflineProjects,
  saveOfflineProjects,
  saveOrUpdateOfflineProject,
  deleteOfflineProject,
  generateLocalId,
  addPendingSyncAction,
  saveOfflineSections,
  getPendingConflicts,
  EditConflict
} from '../lib/offlineStore'
import { SwipeableProjectCard } from './SwipeableProjectCard'
import { ConflictoResolucionModal } from './ConflictoResolucionModal'

export interface Proyecto {
  id: string
  title: string
  type: string
  updated_at: string
  created_at?: string
  user_id?: string
  _isOfflineOnly?: boolean
}

interface ProyectosProps {
  onSelect: (p: Proyecto) => void
  busqueda?: string
  filtroTipo?: string
  onTiposLoaded?: (tipos: string[]) => void
  session?: any
}

const TIPO_CONFIG: Record<string, { icon: string; label: string; desc: string }> = {
  sermon: { icon: '🎤', label: 'Sermón', desc: 'Mensaje dominical y prédicas' },
  ensenanza: { icon: '📖', label: 'Enseñanza', desc: 'Discipulado y doctrina' },
  devocional: { icon: '🕊️', label: 'Devocional', desc: 'Meditaciones y clamor' },
  libro: { icon: '📚', label: 'Libro', desc: 'Capítulos y tratados' },
  video: { icon: '🎬', label: 'Video', desc: 'Guiones y transmisiones' },
  estudio: { icon: '🔬', label: 'Estudio', desc: 'Investigación bíblica profunda' },
  revelacion: { icon: '✨', label: 'Revelación', desc: 'Palabra profética y visión' },
  apostolico: { icon: '👑', label: 'Apostólico', desc: 'Directrices y gobierno' }
}

function formatFechaRelativa(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const fecha = new Date(dateStr)
    const ahora = new Date()
    const diffMs = ahora.getTime() - fecha.getTime()
    const diffSeg = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSeg / 60)
    const diffHoras = Math.floor(diffMin / 60)
    const diffDias = Math.floor(diffHoras / 24)

    if (diffMin < 1) return 'hace un momento'
    if (diffMin < 60) return `hace ${diffMin} min`
    if (diffHoras < 24) return `hace ${diffHoras} ${diffHoras === 1 ? 'hora' : 'horas'}`
    if (diffDias === 1) return 'ayer'
    if (diffDias < 7) return `hace ${diffDias} días`
    if (diffDias < 30) return `hace ${Math.floor(diffDias / 7)} sem`
    return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  } catch (e) {
    return dateStr
  }
}

export default function Proyectos({
  onSelect,
  busqueda = '',
  filtroTipo = 'todos',
  onTiposLoaded,
  session
}: ProyectosProps) {
  const queryClient = useQueryClient()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [nuevoTitulo, setNuevoTitulo] = useState('')
  const [nuevoTipo, setNuevoTipo] = useState('sermon')
  const [creando, setCreando] = useState(false)

  // Estados para Edición y Eliminación de Proyectos
  const [editarProyectoModal, setEditarProyectoModal] = useState<Proyecto | null>(null)
  const [editandoTitulo, setEditandoTitulo] = useState('')
  const [editandoTipo, setEditandoTipo] = useState('sermon')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [eliminarProyectoModal, setEliminarProyectoModal] = useState<Proyecto | null>(null)
  const [eliminandoProyecto, setEliminandoProyecto] = useState(false)

  // Estados para Conflictos de Edición
  const [conflictos, setConflictos] = useState<EditConflict[]>(() => getPendingConflicts())
  const [conflictoModal, setConflictoModal] = useState<EditConflict | null>(null)

  // Escuchar evento del FAB en App.tsx y la inicialización de IndexedDB / Conflictos
  useEffect(() => {
    const handleNuevo = () => setModalAbierto(true)
    const handleStorageReady = () => {
      queryClient.invalidateQueries({ queryKey: ['proyectos'] })
      setConflictos(getPendingConflicts())
    }
    const handleConflicts = () => {
      setConflictos(getPendingConflicts())
    }

    window.addEventListener('lw:nuevo-proyecto', handleNuevo)
    window.addEventListener('lw:storage-ready', handleStorageReady)
    window.addEventListener('lw:conflicts-change', handleConflicts)
    window.addEventListener('lw:conflict-detected', handleConflicts)
    window.addEventListener('lw:conflict-resolved', handleConflicts)

    return () => {
      window.removeEventListener('lw:nuevo-proyecto', handleNuevo)
      window.removeEventListener('lw:storage-ready', handleStorageReady)
      window.removeEventListener('lw:conflicts-change', handleConflicts)
      window.removeEventListener('lw:conflict-detected', handleConflicts)
      window.removeEventListener('lw:conflict-resolved', handleConflicts)
    }
  }, [queryClient])

  const { data: proyectos = [], isLoading: loading } = useQuery({
    queryKey: ['proyectos'],
    queryFn: async () => {
      // Si estamos sin conexión o en modo offline, retornar caché local
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getOfflineProjects() as Proyecto[]
      }

      try {
        const { data, error } = await supabase
          .from('lw_proyectos')
          .select('*')
          .order('updated_at', { ascending: false })

        if (error) throw error

        const listaProyectos = (data || []) as Proyecto[]
        // Guardar en caché local para acceso sin internet
        saveOfflineProjects(listaProyectos)
        return listaProyectos
      } catch (err) {
        console.warn('Usando proyectos locales por fallo de red:', err)
        return getOfflineProjects() as Proyecto[]
      }
    }
  })

  // Actualizar lista de tipos únicos disponibles para los pills del App
  useEffect(() => {
    if (proyectos.length > 0 && onTiposLoaded) {
      const tiposUnicos = Array.from(
        new Set(proyectos.map((p) => (p.type || 'sermon').toLowerCase()))
      )
      onTiposLoaded(tiposUnicos)
    }
  }, [proyectos, onTiposLoaded])

  // Filtrado compuesto por búsqueda y tipo
  const filtrados = proyectos.filter((p) => {
    const coincideTexto = p.title?.toLowerCase().includes(busqueda.toLowerCase())
    const coincideTipo =
      filtroTipo === 'todos' || (p.type || 'sermon').toLowerCase() === filtroTipo.toLowerCase()
    return coincideTexto && coincideTipo
  })

  // Crear nuevo proyecto (Online y Offline)
  async function handleCrearProyecto(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoTitulo.trim()) {
      toast.error('Ingresa un título para el proyecto')
      return
    }

    setCreando(true)
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    if (isOnline) {
      try {
        const userId = session?.user?.id || (await supabase.auth.getUser()).data?.user?.id

        const { data: proyectoData, error: projError } = await supabase
          .from('lw_proyectos')
          .insert([
            {
              title: nuevoTitulo.trim(),
              type: nuevoTipo,
              user_id: userId,
              updated_at: new Date().toISOString()
            }
          ])
          .select()
          .single()

        if (projError) throw projError

        if (proyectoData?.id) {
          // Crear sección inicial 'Introducción' por defecto
          await supabase.from('lw_secciones').insert([
            {
              project_id: proyectoData.id,
              title: 'Introducción',
              order_index: 0,
              content: ''
            }
          ])

          saveOrUpdateOfflineProject(proyectoData as Proyecto)
          saveOfflineSections(proyectoData.id, [
            {
              id: `sec_${Date.now()}`,
              project_id: proyectoData.id,
              title: 'Introducción',
              order_index: 0,
              content: ''
            }
          ])

          toast.success('Proyecto creado')
          queryClient.invalidateQueries({ queryKey: ['proyectos'] })
          setModalAbierto(false)
          setNuevoTitulo('')
          setNuevoTipo('sermon')
          onSelect(proyectoData as Proyecto)
          return
        }
      } catch (err: any) {
        console.warn('Fallo creación online, recurriendo a modo offline:', err)
      }
    }

    // Modo Offline / Fallback local
    try {
      const localProjId = generateLocalId('local_proj')
      const localSecId = generateLocalId('local_sec')
      const now = new Date().toISOString()

      const nuevoProjOffline: Proyecto = {
        id: localProjId,
        title: nuevoTitulo.trim(),
        type: nuevoTipo,
        updated_at: now,
        created_at: now,
        _isOfflineOnly: true
      }

      const nuevaSecOffline = {
        id: localSecId,
        project_id: localProjId,
        title: 'Introducción',
        order_index: 0,
        content: '',
        _isOfflineOnly: true
      }

      saveOrUpdateOfflineProject(nuevoProjOffline)
      saveOfflineSections(localProjId, [nuevaSecOffline])
      addPendingSyncAction('CREATE_PROJECT', nuevoProjOffline)
      addPendingSyncAction('CREATE_SECTION', nuevaSecOffline)

      toast.success('Proyecto creado localmente (sin conexión)', { icon: '📡' })
      queryClient.invalidateQueries({ queryKey: ['proyectos'] })
      setModalAbierto(false)
      setNuevoTitulo('')
      setNuevoTipo('sermon')
      onSelect(nuevoProjOffline)
    } catch (err: any) {
      toast.error('No se pudo crear el proyecto')
    } finally {
      setCreando(false)
    }
  }

  function abrirEditarModal(p: Proyecto, e: React.MouseEvent) {
    e.stopPropagation()
    setEditarProyectoModal(p)
    setEditandoTitulo(p.title || '')
    setEditandoTipo(p.type || 'sermon')
  }

  async function handleGuardarEdicion(e: React.FormEvent) {
    e.preventDefault()
    if (!editarProyectoModal || !editandoTitulo.trim()) {
      toast.error('El título no puede estar vacío')
      return
    }

    setGuardandoEdicion(true)
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    // Actualizar de inmediato en almacenamiento local
    saveOrUpdateOfflineProject({
      ...editarProyectoModal,
      title: editandoTitulo.trim(),
      type: editandoTipo,
      updated_at: new Date().toISOString()
    })

    if (isOnline && !editarProyectoModal.id.startsWith('local_')) {
      try {
        const { error } = await supabase
          .from('lw_proyectos')
          .update({
            title: editandoTitulo.trim(),
            type: editandoTipo,
            updated_at: new Date().toISOString()
          })
          .eq('id', editarProyectoModal.id)

        if (error) throw error
        toast.success('Proyecto actualizado')
      } catch (err: any) {
        addPendingSyncAction('UPDATE_PROJECT', {
          id: editarProyectoModal.id,
          title: editandoTitulo.trim(),
          type: editandoTipo
        })
        toast.success('Guardado en este dispositivo (se sincronizará)', { icon: '📡' })
      }
    } else {
      addPendingSyncAction('UPDATE_PROJECT', {
        id: editarProyectoModal.id,
        title: editandoTitulo.trim(),
        type: editandoTipo
      })
      toast.success('Guardado localmente', { icon: '📡' })
    }

    queryClient.invalidateQueries({ queryKey: ['proyectos'] })
    setEditarProyectoModal(null)
    setGuardandoEdicion(false)
  }

  async function handleConfirmarEliminarProyecto() {
    if (!eliminarProyectoModal) return
    setEliminandoProyecto(true)

    // Eliminar de caché local
    deleteOfflineProject(eliminarProyectoModal.id)

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine
    if (isOnline && !eliminarProyectoModal.id.startsWith('local_')) {
      try {
        await supabase.from('lw_secciones').delete().eq('project_id', eliminarProyectoModal.id)
        await supabase.from('lw_proyectos').delete().eq('id', eliminarProyectoModal.id)
        toast.success('Proyecto eliminado')
      } catch (err: any) {
        addPendingSyncAction('DELETE_PROJECT', { id: eliminarProyectoModal.id })
        toast.success('Eliminado localmente (pendiente de sincronizar)', { icon: '📡' })
      }
    } else {
      addPendingSyncAction('DELETE_PROJECT', { id: eliminarProyectoModal.id })
      toast.success('Proyecto eliminado localmente')
    }

    queryClient.invalidateQueries({ queryKey: ['proyectos'] })
    setEliminarProyectoModal(null)
    setEditarProyectoModal(null)
    setEliminandoProyecto(false)
  }

  // Esqueleto de carga animado (3 placeholders)
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
        {[1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="anim-pulse-gold"
            style={{
              background: '#1E3D4F',
              borderRadius: '12px',
              height: '84px',
              border: '1px solid rgba(201, 162, 74, 0.15)',
              borderLeft: '3px solid rgba(201, 162, 74, 0.4)',
              opacity: 0.7
            }}
          />
        ))}
      </div>
    )
  }

  const tipoLabel = filtroTipo !== 'todos' ? TIPO_CONFIG[filtroTipo.toLowerCase()]?.label || filtroTipo : ''

  return (
    <div style={{ marginTop: '8px' }}>
      {/* 1. Línea Superior: Conteo de Mensajes y Filtro Activo */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        padding: '0 4px'
      }}>
        <div style={{
          color: '#8E9EA7',
          fontSize: '12px',
          fontFamily: "'Inter', sans-serif",
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '4px'
        }}>
          <span style={{ fontWeight: 600, color: '#D7E3EB' }}>
            {filtrados.length} {filtrados.length === 1 ? 'mensaje' : 'mensajes'}
          </span>
          {filtroTipo !== 'todos' && (
            <span style={{ color: '#DFBE72' }}>
              · {tipoLabel}
            </span>
          )}
          {busqueda && (
            <span style={{ color: '#9BB0BD' }}>
              · &quot;{busqueda}&quot;
            </span>
          )}
        </div>

        <div style={{
          fontSize: '11px',
          color: '#8E9EA7',
          fontFamily: "'Inter', sans-serif"
        }}>
          <span>Desliza 🗑️ para borrar</span>
        </div>
      </div>

      {/* 2. Línea de Acciones Rápidas (Barra de Botones Táctiles Espaciada) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '8px',
        marginBottom: '14px'
      }}>
        {/* Botón Principal: + Nuevo */}
        <button
          onClick={() => setModalAbierto(true)}
          title="Crear un nuevo proyecto o mensaje"
          style={{
            background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
            color: '#122834',
            border: 'none',
            borderRadius: '8px',
            padding: '9px 10px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            fontFamily: "'Cinzel', serif",
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            whiteSpace: 'nowrap',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 10px rgba(201, 162, 74, 0.35)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)'
          }}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
          <span>Nuevo</span>
        </button>

        {/* Botón: Respaldo */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('lw:abrir-respaldo'))}
          title="Guardar todos como PDF o descargar copia de seguridad"
          style={{
            background: 'rgba(20, 43, 55, 0.8)',
            border: '1px solid rgba(201, 162, 74, 0.35)',
            color: '#DFBE72',
            fontSize: '11.5px',
            fontWeight: 600,
            padding: '9px 8px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            fontFamily: "'Cinzel', serif",
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(201, 162, 74, 0.2)'
            e.currentTarget.style.borderColor = '#C9A24A'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(20, 43, 55, 0.8)'
            e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.35)'
          }}
        >
          <span style={{ fontSize: '13px', lineHeight: 1 }}>📦</span>
          <span>Respaldo</span>
        </button>
      </div>

      {/* Banner de Conflictos de Edición si existen */}
      {conflictos.length > 0 && (
        <div
          onClick={() => setConflictoModal(conflictos[0])}
          style={{
            background: 'linear-gradient(135deg, rgba(124, 45, 18, 0.9) 0%, rgba(26, 58, 74, 0.85) 100%)',
            border: '1px solid #DFBE72',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
            transition: 'transform 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.01)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '22px', lineHeight: 1 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#FFF9E6', fontSize: '13px' }}>
                {conflictos.length === 1
                  ? 'Hay 1 conflicto de edición con la nube'
                  : `Hay ${conflictos.length} conflictos de edición con la nube`}
              </div>
              <div style={{ fontSize: '11.5px', color: '#DFBE72', marginTop: '2px', lineHeight: 1.3 }}>
                Se detectaron cambios simultáneos o sin conexión. Haz clic aquí para comparar y resolverlos.
              </div>
            </div>
          </div>
          <button
            type="button"
            style={{
              background: '#DFBE72',
              color: '#122834',
              fontWeight: 700,
              fontSize: '11px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            Resolver
          </button>
        </div>
      )}

      {/* Lista de Tarjetas con soporte Swipe-to-Delete */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtrados.map((p) => {
          const tipoInfo = TIPO_CONFIG[p.type?.toLowerCase()] || {
            icon: '📝',
            label: p.type || 'Escrito',
            desc: ''
          }
          const fechaRelativa = formatFechaRelativa(p.updated_at)

          return (
            <SwipeableProjectCard
              key={p.id}
              proyecto={p}
              tipoInfo={tipoInfo}
              fechaRelativa={fechaRelativa}
              onSelect={onSelect}
              onEdit={abrirEditarModal}
              onDelete={(proj) => setEliminarProyectoModal(proj)}
            />
          )
        })}
      </div>

      {/* Estado Vacío Ilustrado */}
      {filtrados.length === 0 && (
        <div className="anim-up" style={{
          textAlign: 'center',
          padding: '48px 20px',
          background: 'rgba(30, 61, 79, 0.4)',
          border: '1px dashed rgba(201, 162, 74, 0.25)',
          borderRadius: '16px',
          marginTop: '16px'
        }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>
            {busqueda || filtroTipo !== 'todos' ? '🔍' : '📜'}
          </div>
          <h2 style={{
            color: '#DFBE72',
            fontFamily: "'Cinzel', serif",
            fontSize: '18px',
            marginBottom: '6px'
          }}>
            {busqueda || filtroTipo !== 'todos'
              ? 'No se encontraron mensajes'
              : 'El altar de revelación está listo'}
          </h2>
          <p style={{
            color: '#8E9EA7',
            fontSize: '13px',
            fontFamily: "'Crimson Pro', serif",
            fontStyle: 'italic',
            maxWidth: '320px',
            margin: '0 auto 18px auto'
          }}>
            {busqueda || filtroTipo !== 'todos'
              ? 'Intenta con otro término o desactiva los filtros activos.'
              : 'Comienza tu primer sermón, estudio o tratado ministerial presionando el botón abajo.'}
          </p>
          <button
            onClick={() => setModalAbierto(true)}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
              color: '#122834',
              border: 'none',
              borderRadius: '8px',
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
          >
            + Crear Primer Mensaje
          </button>
        </div>
      )}

      {/* Modal / Bottom Sheet de Nuevo Proyecto */}
      {modalAbierto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 24, 33, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          zIndex: 100
        }}
        onClick={() => !creando && setModalAbierto(false)}
        >
          <div
            className="slide-up-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #1E3D4F 0%, #152E3B 100%)',
              borderTop: '2px solid #C9A24A',
              borderLeft: '1px solid rgba(201, 162, 74, 0.3)',
              borderRight: '1px solid rgba(201, 162, 74, 0.3)',
              borderRadius: '20px 20px 0 0',
              padding: '24px 20px 32px 20px',
              width: '100%',
              maxWidth: '600px',
              boxSizing: 'border-box',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            {/* Cabecera del modal */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#C9A24A', fontSize: '20px' }}>✦</span>
                <h2 style={{
                  color: '#C9A24A',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '19px',
                  fontWeight: 700,
                  margin: 0
                }}>
                  Nuevo Mensaje Ministerial
                </h2>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                disabled={creando}
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

            <form onSubmit={handleCrearProyecto}>
              {/* Campo de Título */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{
                  display: 'block',
                  color: '#DFBE72',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px'
                }}>
                  Título o Tema del Mensaje
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej: La Gloria Postrera, El Poder del Pacto..."
                  value={nuevoTitulo}
                  onChange={(e) => setNuevoTitulo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 14px',
                    background: '#142C38',
                    border: '1px solid rgba(201, 162, 74, 0.3)',
                    borderRadius: '10px',
                    color: '#F5F1E8',
                    fontSize: '16px',
                    fontFamily: "'Crimson Pro', Georgia, serif",
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Grid visual de tipos */}
              <div style={{ marginBottom: '22px' }}>
                <label style={{
                  display: 'block',
                  color: '#DFBE72',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '8px'
                }}>
                  Tipo de Documento
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '8px'
                }}>
                  {Object.entries(TIPO_CONFIG).map(([key, config]) => {
                    const seleccionado = nuevoTipo === key
                    return (
                      <div
                        key={key}
                        onClick={() => setNuevoTipo(key)}
                        style={{
                          background: seleccionado ? 'rgba(201, 162, 74, 0.22)' : '#142C38',
                          border: seleccionado ? '1.5px solid #C9A24A' : '1px solid rgba(201, 162, 74, 0.15)',
                          borderRadius: '10px',
                          padding: '10px 8px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontSize: '22px', marginBottom: '4px' }}>{config.icon}</div>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: seleccionado ? 700 : 500,
                          color: seleccionado ? '#C9A24A' : '#F5F1E8',
                          fontFamily: "'Inter', sans-serif"
                        }}>
                          {config.label}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={creando}
                  style={{
                    flex: 1,
                    padding: '13px',
                    background: '#142C38',
                    border: '1px solid #2E4B5E',
                    borderRadius: '10px',
                    color: '#9BB0BD',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creando}
                  style={{
                    flex: 2,
                    padding: '13px',
                    background: creando
                      ? '#9A7727'
                      : 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#122834',
                    fontFamily: "'Cinzel', serif",
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: creando ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {creando ? (
                    <>
                      <span className="anim-spin" style={{
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        border: '2px solid rgba(18,40,52,0.3)',
                        borderTopColor: '#122834',
                        borderRadius: '50%'
                      }} />
                      <span>Creando...</span>
                    </>
                  ) : (
                    <span>Comenzar a Escribir</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Bottom Sheet para Editar Título y Detalles del Proyecto */}
      {editarProyectoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 24, 33, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          zIndex: 100
        }}
        onClick={() => !guardandoEdicion && setEditarProyectoModal(null)}
        >
          <div
            className="slide-up-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #1E3D4F 0%, #152E3B 100%)',
              borderTop: '2px solid #C9A24A',
              borderLeft: '1px solid rgba(201, 162, 74, 0.3)',
              borderRight: '1px solid rgba(201, 162, 74, 0.3)',
              borderRadius: '20px 20px 0 0',
              padding: '24px 20px 32px 20px',
              width: '100%',
              maxWidth: '600px',
              boxSizing: 'border-box',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            {/* Cabecera del modal */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#C9A24A', fontSize: '20px' }}>✏️</span>
                <h2 style={{
                  color: '#C9A24A',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '19px',
                  fontWeight: 700,
                  margin: 0
                }}>
                  Editar Proyecto
                </h2>
              </div>
              <button
                onClick={() => setEditarProyectoModal(null)}
                disabled={guardandoEdicion}
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

            <form onSubmit={handleGuardarEdicion}>
              {/* Campo de Título */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{
                  display: 'block',
                  color: '#DFBE72',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px'
                }}>
                  Título o Tema del Mensaje
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editandoTitulo}
                  onChange={(e) => setEditandoTitulo(e.target.value)}
                  placeholder="Título del proyecto..."
                  style={{
                    width: '100%',
                    padding: '13px 14px',
                    background: '#142C38',
                    border: '1px solid rgba(201, 162, 74, 0.3)',
                    borderRadius: '10px',
                    color: '#F5F1E8',
                    fontSize: '16px',
                    fontFamily: "'Crimson Pro', Georgia, serif",
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Grid visual de tipos */}
              <div style={{ marginBottom: '22px' }}>
                <label style={{
                  display: 'block',
                  color: '#DFBE72',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '8px'
                }}>
                  Tipo de Documento
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '8px'
                }}>
                  {Object.entries(TIPO_CONFIG).map(([key, config]) => {
                    const seleccionado = editandoTipo.toLowerCase() === key
                    return (
                      <div
                        key={key}
                        onClick={() => setEditandoTipo(key)}
                        style={{
                          background: seleccionado ? 'rgba(201, 162, 74, 0.22)' : '#142C38',
                          border: seleccionado ? '1.5px solid #C9A24A' : '1px solid rgba(201, 162, 74, 0.15)',
                          borderRadius: '10px',
                          padding: '10px 8px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontSize: '22px', marginBottom: '4px' }}>{config.icon}</div>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: seleccionado ? 700 : 500,
                          color: seleccionado ? '#C9A24A' : '#F5F1E8',
                          fontFamily: "'Inter', sans-serif"
                        }}>
                          {config.label}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Botones de acción: Cancelar, Guardar y Eliminar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setEditarProyectoModal(null)}
                    disabled={guardandoEdicion}
                    style={{
                      flex: 1,
                      padding: '13px',
                      background: '#142C38',
                      border: '1px solid #2E4B5E',
                      borderRadius: '10px',
                      color: '#9BB0BD',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoEdicion}
                    style={{
                      flex: 2,
                      padding: '13px',
                      background: guardandoEdicion
                        ? '#9A7727'
                        : 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#122834',
                      fontFamily: "'Cinzel', serif",
                      fontWeight: 700,
                      fontSize: '15px',
                      cursor: guardandoEdicion ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {guardandoEdicion ? (
                      <>
                        <span className="anim-spin" style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '14px',
                          border: '2px solid rgba(18,40,52,0.3)',
                          borderTopColor: '#122834',
                          borderRadius: '50%'
                        }} />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <span>Guardar Cambios</span>
                    )}
                  </button>
                </div>

                {/* Botón Eliminar Proyecto */}
                <button
                  type="button"
                  onClick={() => setEliminarProyectoModal(editarProyectoModal)}
                  disabled={guardandoEdicion}
                  style={{
                    padding: '10px',
                    background: 'rgba(229, 72, 77, 0.08)',
                    border: '1px solid rgba(229, 72, 77, 0.3)',
                    borderRadius: '10px',
                    color: '#FF6B6B',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '6px'
                  }}
                >
                  <span>🗑️</span>
                  <span>Eliminar este proyecto</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar Proyecto */}
      {eliminarProyectoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 24, 33, 0.82)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 120
        }}
        onClick={() => !eliminandoProyecto && setEliminarProyectoModal(null)}
        >
          <div
            className="anim-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1E3D4F',
              border: '1px solid #E5484D',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '390px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.55)'
            }}
          >
            <h3 style={{
              color: '#FF6B6B',
              fontFamily: "'Cinzel', serif",
              fontSize: '18px',
              margin: '0 0 10px 0'
            }}>
              ¿Eliminar Proyecto?
            </h3>
            <p style={{
              color: '#F5F1E8',
              fontSize: '13px',
              marginBottom: '18px',
              lineHeight: 1.4
            }}>
              Se eliminará permanentemente el proyecto <strong>&quot;{eliminarProyectoModal.title}&quot;</strong> junto con todas sus secciones escritas. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                disabled={eliminandoProyecto}
                onClick={() => setEliminarProyectoModal(null)}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: '#142C38',
                  border: '1px solid #2E4B5E',
                  color: '#9BB0BD',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={eliminandoProyecto}
                onClick={handleConfirmarEliminarProyecto}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: '#E5484D',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  borderRadius: '8px',
                  cursor: eliminandoProyecto ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {eliminandoProyecto ? (
                  <>
                    <span className="anim-spin" style={{
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#FFFFFF',
                      borderRadius: '50%'
                    }} />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <span>Eliminar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Resolución de Conflicto de Edición */}
      {conflictoModal && (
        <ConflictoResolucionModal
          conflicto={conflictoModal}
          onClose={() => setConflictoModal(null)}
          onResolved={() => {
            setConflictoModal(null)
            setConflictos(getPendingConflicts())
            queryClient.invalidateQueries({ queryKey: ['proyectos'] })
          }}
        />
      )}
    </div>
  )
}

