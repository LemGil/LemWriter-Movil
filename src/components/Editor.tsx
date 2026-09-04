import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import toast, { Toaster } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useDictado } from '../hooks/useDictado'
import {
  getOfflineSections,
  saveOfflineSections,
  saveOfflineSectionContent,
  saveOrUpdateOfflineSection,
  deleteOfflineSection,
  generateLocalId,
  addPendingSyncAction,
  getPendingSyncQueue,
  saveOrUpdateOfflineProject
} from '../lib/offlineStore'
import { ExportarPDFModal } from './ExportarPDFModal'
import { ModoLecturaModal, TemaLectura } from './ModoLecturaModal'
import { SugerirTitulosModal } from './SugerirTitulosModal'
import { AudioTranscribeModal } from './AudioTranscribeModal'

export interface Seccion {
  id: string
  project_id: string
  title: string
  content: string
  order_index: number
  created_at?: string
  updated_at?: string
  _isOfflineOnly?: boolean
}

interface EditorProps {
  proyecto: {
    id: string
    title: string
    type?: string
  }
  onBack: () => void
  onUpdateProyecto?: (proyecto: { id: string; title: string; type?: string }) => void
}

function getWordCount(html: string): number {
  if (!html) return 0
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.split(' ').filter(Boolean).length : 0
}

export default function Editor({ proyecto, onBack, onUpdateProyecto }: EditorProps) {
  const [proyectoActual, setProyectoActual] = useState(proyecto)
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [seccionActiva, setSeccionActiva] = useState<Seccion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoExitoso, setGuardadoExitoso] = useState(true)
  
  // Modales y control de Título del Proyecto
  const [editarProyectoModal, setEditarProyectoModal] = useState(false)
  const [nuevoTituloProyecto, setNuevoTituloProyecto] = useState(proyecto.title)
  const [nuevoTipoProyecto, setNuevoTipoProyecto] = useState(proyecto.type || 'sermon')
  const [guardandoProyecto, setGuardandoProyecto] = useState(false)

  // Modales y control de Índice de Secciones
  const [indiceAbierto, setIndiceAbierto] = useState(false)
  const [exportarPDFModalAbierto, setExportarPDFModalAbierto] = useState(false)
  const [busquedaIndice, setBusquedaIndice] = useState('')
  const [nuevaSeccionModal, setNuevaSeccionModal] = useState(false)
  const [nuevaSeccionTitulo, setNuevaSeccionTitulo] = useState('')
  const [renombrarModal, setRenombrarModal] = useState<{ id: string; title: string } | null>(null)
  const [eliminarModal, setEliminarModal] = useState<Seccion | null>(null)

  // Modal de confirmación al intentar salir sin guardar o con cambios no sincronizados
  const [confirmarSalidaModal, setConfirmarSalidaModal] = useState(false)
  const [motivoSalida, setMotivoSalida] = useState('')
  const [guardandoYSalir, setGuardandoYSalir] = useState(false)
  
  // Modo de Lectura Diurna / Nocturna / Sepia y Modo Púlpito
  const [temaEditor, setTemaEditor] = useState<TemaLectura>(() => {
    return (localStorage.getItem('lemwriter_reading_theme') as TemaLectura) || 'nocturno'
  })
  const [modoLecturaAbierto, setModoLecturaAbierto] = useState(false)
  const [sugerirTitulosModalAbierto, setSugerirTitulosModalAbierto] = useState(false)
  const [audioTranscribeModalAbierto, setAudioTranscribeModalAbierto] = useState(false)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)

  const togglePantallaCompleta = async () => {
    const proximo = !pantallaCompleta
    setPantallaCompleta(proximo)

    try {
      if (proximo) {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen().catch(() => {})
        }
        toast.success('Modo Pantalla Completa activado (Presiona Esc para salir)', {
          icon: '⛶',
          duration: 2500
        })
      } else {
        if (document.exitFullscreen && document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {})
        }
        toast.success('Modo normal restaurado', { duration: 1800 })
      }
    } catch {
      // Ignorar restricciones en entornos iframe
    }
  }

  // Listener para salir de Pantalla Completa o cerrar diálogo con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmarSalidaModal) {
          setConfirmarSalidaModal(false)
          return
        }
        if (pantallaCompleta) {
          setPantallaCompleta(false)
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {})
          }
        }
      }
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && pantallaCompleta) {
        // El usuario salió de fullscreen nativo del navegador
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [pantallaCompleta, confirmarSalidaModal])

  const cicloTema = () => {
    const siguienteTema: Record<TemaLectura, TemaLectura> = {
      nocturno: 'diurno',
      diurno: 'sepia',
      sepia: 'nocturno'
    }
    const nuevo = siguienteTema[temaEditor] || 'diurno'
    setTemaEditor(nuevo)
    localStorage.setItem('lemwriter_reading_theme', nuevo)
    toast.success(
      nuevo === 'diurno' ? 'Modo Diurno ☀️ (Luz Solar)' : nuevo === 'sepia' ? 'Modo Sepia 📜 (Pergamino)' : 'Modo Nocturno 🌙 (Púlpito)',
      { duration: 1800 }
    )
  }

  const autoSaveRef = useRef<any>(null)
  const seccionActivaRef = useRef<Seccion | null>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Mantener ref sincronizada para auto-save en closures
  useEffect(() => {
    seccionActivaRef.current = seccionActiva
  }, [seccionActiva])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2]
        }
      }),
      Placeholder.configure({
        placeholder: 'Comienza a escribir tu mensaje…'
      })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setGuardadoExitoso(false)
      setGuardando(true)
      const html = editor.getHTML()
      clearTimeout(autoSaveRef.current)
      autoSaveRef.current = setTimeout(() => {
        guardar(html)
      }, 1000)
    }
  })

  // Auto-scroll de la pestaña activa para que nunca quede escondida fuera de pantalla
  useEffect(() => {
    if (seccionActiva?.id && tabRefs.current[seccionActiva.id]) {
      tabRefs.current[seccionActiva.id]?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      })
    }
  }, [seccionActiva?.id])

  // Sincronizar el contenido del editor cuando se inicializa o cambia la sección activa
  useEffect(() => {
    if (editor && seccionActiva) {
      const currentHtml = editor.getHTML()
      const targetHtml = seccionActiva.content || ''
      if (currentHtml !== targetHtml && (!editor.isFocused || currentHtml === '' || currentHtml === '<p></p>')) {
        editor.commands?.setContent(targetHtml)
      }
    }
  }, [editor, seccionActiva?.id, seccionActiva?.content])

  // Hook de reconocimiento de voz / dictado
  const { dictando, modoExtendido, toggleDictado, toggleExtendido } = useDictado(
    (palabras) => {
      if (editor?.commands) {
        editor.commands.insertContent(' ' + palabras)
        const html = editor.getHTML()
        setGuardadoExitoso(false)
        setGuardando(true)
        clearTimeout(autoSaveRef.current)
        autoSaveRef.current = setTimeout(() => guardar(html), 1000)
      }
    }
  )

  useEffect(() => {
    cargarSecciones()
    return () => {
      clearTimeout(autoSaveRef.current)
    }
  }, [proyecto.id])

  async function cargarSecciones() {
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    if (isOnline && !proyecto.id.startsWith('local_')) {
      try {
        const { data, error } = await supabase
          .from('lw_secciones')
          .select('*')
          .eq('project_id', proyecto.id)
          .order('order_index')

        if (error) throw error

        if (data && data.length > 0) {
          const secs = data as Seccion[]
          saveOfflineSections(proyecto.id, secs)
          setSecciones(secs)
          seleccionarSeccion(secs[0])
          return
        }
      } catch (err: any) {
        console.warn('Fallo cargando secciones online, intentando offline:', err)
      }
    }

    // Modo Offline o fallback
    const offlineSecs = getOfflineSections(proyecto.id) as Seccion[]
    if (offlineSecs && offlineSecs.length > 0) {
      setSecciones(offlineSecs)
      seleccionarSeccion(offlineSecs[0])
    } else {
      // Si no hay ninguna sección en caché local, crear una inicial
      const defaultSec: Seccion = {
        id: generateLocalId('local_sec'),
        project_id: proyecto.id,
        title: 'Introducción',
        order_index: 0,
        content: '',
        _isOfflineOnly: true
      }
      saveOfflineSections(proyecto.id, [defaultSec])
      setSecciones([defaultSec])
      seleccionarSeccion(defaultSec)
    }
  }

  function seleccionarSeccion(sec: Seccion) {
    // Si hay cambios pendientes en la sección anterior, guardar antes de cambiar
    if (editor && seccionActivaRef.current && seccionActivaRef.current.id !== sec.id) {
      const html = editor.getHTML()
      guardar(html, seccionActivaRef.current.id)
    }

    setSeccionActiva(sec)
    if (editor?.commands) {
      editor.commands.setContent(sec.content || '')
      setGuardadoExitoso(true)
    }
  }

  async function guardar(html: string, secId?: string) {
    const targetId = secId || seccionActivaRef.current?.id
    if (!targetId) return

    setGuardando(true)

    // 1. Guardar de forma INMEDIATA en almacenamiento local (nunca se pierde el texto)
    saveOfflineSectionContent(proyecto.id, targetId, html)
    setSecciones((prev) =>
      prev.map((s) => (s.id === targetId ? { ...s, content: html } : s))
    )

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    if (isOnline && !targetId.startsWith('local_') && !proyecto.id.startsWith('local_')) {
      try {
        const { error } = await supabase
          .from('lw_secciones')
          .update({
            content: html,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetId)

        // Actualizar fecha del proyecto
        await supabase
          .from('lw_proyectos')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', proyecto.id)

        if (!error) {
          setGuardadoExitoso(true)
          setGuardando(false)
          return
        }
      } catch (e) {
        console.warn('Error guardando en Supabase, encolando offline:', e)
      }
    }

    // Encolar acción para sincronización cuando regrese la conexión
    addPendingSyncAction('UPDATE_SECTION', { id: targetId, content: html })
    setGuardadoExitoso(true)
    setGuardando(false)
  }

  // Verificación exhaustiva de cambios sin guardar o pendientes de sincronización
  const verificarCambiosSinSincronizar = (): { hayCambios: boolean; motivo: string } => {
    // 1. Verificar si el editor contiene texto modificado respecto a la sección activa guardada
    if (editor && seccionActiva) {
      const htmlActual = editor.getHTML()
      const htmlGuardado = seccionActiva.content || ''
      const actualLimpio = htmlActual === '<p></p>' ? '' : htmlActual.trim()
      const guardadoLimpio = htmlGuardado === '<p></p>' ? '' : htmlGuardado.trim()
      if (actualLimpio !== guardadoLimpio) {
        return {
          hayCambios: true,
          motivo: 'Hay modificaciones recientes en el editor que aún no se han guardado.'
        }
      }
    }

    // 2. Verificar si hay un proceso de guardado o autoguardado en curso
    if (guardando || !guardadoExitoso) {
      return {
        hayCambios: true,
        motivo: 'Se están procesando y persistiendo los cambios del documento.'
      }
    }

    // 3. Verificar si existen acciones en la cola de sincronización para este proyecto
    try {
      const queue = getPendingSyncQueue()
      const sectionIds = new Set(secciones.map((s) => s.id))
      const pendingForProject = queue.filter((action) => {
        if (action.payload?.project_id === proyecto.id || action.payload?.id === proyecto.id) return true
        if (action.payload?.id && sectionIds.has(action.payload.id)) return true
        return false
      })

      if (pendingForProject.length > 0) {
        const count = pendingForProject.length
        return {
          hayCambios: true,
          motivo: `Hay ${count} ${count === 1 ? 'modificación pendiente' : 'modificaciones pendientes'} de sincronización con el servidor.`
        }
      }
    } catch {
      // Si la cola no es accesible, continuar
    }

    return { hayCambios: false, motivo: '' }
  }

  // Interceptar la salida del editor para confirmar solo si hay cambios no sincronizados
  const handleIntentarSalir = () => {
    const { hayCambios, motivo } = verificarCambiosSinSincronizar()
    if (hayCambios) {
      setMotivoSalida(motivo)
      setConfirmarSalidaModal(true)
    } else {
      onBack()
    }
  }

  // Guardar inmediatamente todo el contenido actual y salir
  const handleGuardarYSalir = async () => {
    setGuardandoYSalir(true)
    try {
      if (editor && seccionActiva) {
        await guardar(editor.getHTML())
      }
      setConfirmarSalidaModal(false)
      toast.success('Cambios guardados con éxito', { icon: '💾' })
      onBack()
    } catch (err) {
      console.error('Error al guardar antes de salir:', err)
      toast.error('Ocurrió un error al guardar los cambios')
    } finally {
      setGuardandoYSalir(false)
    }
  }

  // Descartar cambios recientes y salir
  const handleSalirSinGuardar = () => {
    setConfirmarSalidaModal(false)
    onBack()
  }

  // Advertir al usuario si intenta cerrar la pestaña o recargar el navegador con cambios sin sincronizar
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { hayCambios } = verificarCambiosSinSincronizar()
      if (hayCambios) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [editor, seccionActiva, guardando, guardadoExitoso, secciones, proyecto.id])

  async function handleCrearNuevaSeccion(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevaSeccionTitulo.trim()) return

    const nuevoOrden = secciones.length
    const tituloLimpio = nuevaSeccionTitulo.trim()
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    if (isOnline && !proyecto.id.startsWith('local_')) {
      try {
        const { data, error } = await supabase
          .from('lw_secciones')
          .insert([
            {
              project_id: proyecto.id,
              title: tituloLimpio,
              order_index: nuevoOrden,
              content: ''
            }
          ])
          .select()
          .single()

        if (!error && data) {
          const nuevaLista = [...secciones, data as Seccion]
          setSecciones(nuevaLista)
          saveOfflineSections(proyecto.id, nuevaLista)
          seleccionarSeccion(data as Seccion)
          setNuevaSeccionModal(false)
          setNuevaSeccionTitulo('')
          toast.success(`Sección "${data.title}" creada`)
          return
        }
      } catch (err: any) {
        console.warn('Fallo creación online de sección:', err)
      }
    }

    // Fallback Offline
    const nuevaSecOffline: Seccion = {
      id: generateLocalId('local_sec'),
      project_id: proyecto.id,
      title: tituloLimpio,
      order_index: nuevoOrden,
      content: '',
      _isOfflineOnly: true
    }

    const nuevaLista = [...secciones, nuevaSecOffline]
    setSecciones(nuevaLista)
    saveOfflineSections(proyecto.id, nuevaLista)
    addPendingSyncAction('CREATE_SECTION', nuevaSecOffline)
    seleccionarSeccion(nuevaSecOffline)
    setNuevaSeccionModal(false)
    setNuevaSeccionTitulo('')
    toast.success(`Sección "${tituloLimpio}" creada localmente`, { icon: '📡' })
  }

  async function handleCrearSeccionDirecta(titulo: string, contenidoHtml: string) {
    const nuevoOrden = secciones.length
    const tituloLimpio = titulo.trim() || 'Nueva Sección'
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    if (isOnline && !proyecto.id.startsWith('local_')) {
      try {
        const { data, error } = await supabase
          .from('lw_secciones')
          .insert([
            {
              project_id: proyecto.id,
              title: tituloLimpio,
              order_index: nuevoOrden,
              content: contenidoHtml
            }
          ])
          .select()
          .single()

        if (!error && data) {
          const nuevaLista = [...secciones, data as Seccion]
          setSecciones(nuevaLista)
          saveOfflineSections(proyecto.id, nuevaLista)
          seleccionarSeccion(data as Seccion)
          toast.success(`Sección "${data.title}" creada`)
          return
        }
      } catch (err: any) {
        console.warn('Fallo creación online de sección:', err)
      }
    }

    const nuevaSecOffline: Seccion = {
      id: generateLocalId('local_sec'),
      project_id: proyecto.id,
      title: tituloLimpio,
      order_index: nuevoOrden,
      content: contenidoHtml,
      _isOfflineOnly: true
    }

    const nuevaLista = [...secciones, nuevaSecOffline]
    setSecciones(nuevaLista)
    saveOfflineSections(proyecto.id, nuevaLista)
    addPendingSyncAction('CREATE_SECTION', nuevaSecOffline)
    seleccionarSeccion(nuevaSecOffline)
    toast.success(`Sección "${tituloLimpio}" creada localmente`, { icon: '📡' })
  }

  const handleInsertarTextoTranscrito = (texto: string) => {
    if (editor?.commands) {
      const currentHtml = editor.getHTML()
      const isBlank = !currentHtml || currentHtml === '<p></p>'
      const paragraphs = texto
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
        .join('')

      if (isBlank) {
        editor.commands.setContent(paragraphs || `<p>${texto}</p>`)
      } else {
        editor.commands.insertContent(' ' + (paragraphs || texto))
      }

      const newHtml = editor.getHTML()
      setGuardadoExitoso(false)
      setGuardando(true)
      clearTimeout(autoSaveRef.current)
      autoSaveRef.current = setTimeout(() => guardar(newHtml), 1000)
    }
  }

  async function handleGuardarRenombrar(e: React.FormEvent) {
    e.preventDefault()
    if (!renombrarModal || !renombrarModal.title.trim()) return

    const { id, title } = renombrarModal
    const nuevoTitulo = title.trim()

    // Actualizar en memoria y almacenamiento local
    const nuevaLista = secciones.map((s) => (s.id === id ? { ...s, title: nuevoTitulo } : s))
    setSecciones(nuevaLista)
    saveOfflineSections(proyecto.id, nuevaLista)
    if (seccionActiva?.id === id) {
      setSeccionActiva((prev) => (prev ? { ...prev, title: nuevoTitulo } : null))
    }

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine
    if (isOnline && !id.startsWith('local_')) {
      try {
        await supabase
          .from('lw_secciones')
          .update({ title: nuevoTitulo, updated_at: new Date().toISOString() })
          .eq('id', id)
        toast.success('Sección renombrada')
      } catch (err) {
        addPendingSyncAction('UPDATE_SECTION', { id, title: nuevoTitulo })
        toast.success('Renombrada localmente (pendiente de subir)', { icon: '📡' })
      }
    } else {
      addPendingSyncAction('UPDATE_SECTION', { id, title: nuevoTitulo })
      toast.success('Sección renombrada localmente', { icon: '📡' })
    }

    setRenombrarModal(null)
  }

  async function handleGuardarTituloProyecto(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoTituloProyecto.trim()) {
      toast.error('El título no puede estar vacío')
      return
    }

    setGuardandoProyecto(true)
    const tituloLimpio = nuevoTituloProyecto.trim()
    const actualizado = {
      ...proyectoActual,
      title: tituloLimpio,
      type: nuevoTipoProyecto
    }

    // Actualizar de inmediato en memoria y caché local
    setProyectoActual(actualizado)
    saveOrUpdateOfflineProject(actualizado)
    if (onUpdateProyecto) {
      onUpdateProyecto(actualizado)
    }

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine
    if (isOnline && !proyectoActual.id.startsWith('local_')) {
      try {
        await supabase
          .from('lw_proyectos')
          .update({
            title: tituloLimpio,
            type: nuevoTipoProyecto,
            updated_at: new Date().toISOString()
          })
          .eq('id', proyectoActual.id)
        toast.success('Título del proyecto actualizado')
      } catch (err) {
        addPendingSyncAction('UPDATE_PROJECT', {
          id: proyectoActual.id,
          title: tituloLimpio,
          type: nuevoTipoProyecto
        })
        toast.success('Guardado en este dispositivo', { icon: '📡' })
      }
    } else {
      addPendingSyncAction('UPDATE_PROJECT', {
        id: proyectoActual.id,
        title: tituloLimpio,
        type: nuevoTipoProyecto
      })
      toast.success('Título guardado localmente', { icon: '📡' })
    }

    setEditarProyectoModal(false)
    setGuardandoProyecto(false)
  }

  async function handleAplicarTituloSugerido(titulo: string, _subtitulo?: string) {
    const tituloLimpio = titulo.trim()
    if (!tituloLimpio) return

    const actualizado = {
      ...proyectoActual,
      title: tituloLimpio
    }

    setProyectoActual(actualizado)
    setNuevoTituloProyecto(tituloLimpio)
    saveOrUpdateOfflineProject(actualizado)
    if (onUpdateProyecto) {
      onUpdateProyecto(actualizado)
    }

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine
    if (isOnline && !proyectoActual.id.startsWith('local_')) {
      try {
        await supabase
          .from('lw_proyectos')
          .update({
            title: tituloLimpio,
            updated_at: new Date().toISOString()
          })
          .eq('id', proyectoActual.id)
      } catch (err) {
        addPendingSyncAction('UPDATE_PROJECT', {
          id: proyectoActual.id,
          title: tituloLimpio,
          type: proyectoActual.type || 'sermon'
        })
      }
    } else {
      addPendingSyncAction('UPDATE_PROJECT', {
        id: proyectoActual.id,
        title: tituloLimpio,
        type: proyectoActual.type || 'sermon'
      })
    }
  }

  async function handleConfirmarEliminar() {
    if (!eliminarModal) return
    if (secciones.length <= 1) {
      toast.error('El mensaje debe tener al menos una sección')
      setEliminarModal(null)
      return
    }

    const idAEliminar = eliminarModal.id
    const restantes = secciones.filter((s) => s.id !== idAEliminar)
    setSecciones(restantes)
    saveOfflineSections(proyecto.id, restantes)

    if (seccionActiva?.id === idAEliminar) {
      seleccionarSeccion(restantes[0])
    }
    setEliminarModal(null)

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine
    if (isOnline && !idAEliminar.startsWith('local_')) {
      try {
        await supabase.from('lw_secciones').delete().eq('id', idAEliminar)
        toast.success('Sección eliminada')
      } catch (err: any) {
        addPendingSyncAction('DELETE_SECTION', { id: idAEliminar })
        toast.success('Eliminada localmente', { icon: '📡' })
      }
    } else {
      addPendingSyncAction('DELETE_SECTION', { id: idAEliminar })
      toast.success('Sección eliminada')
    }
  }

  async function moverSeccion(index: number, direccion: 'arriba' | 'abajo') {
    const targetIndex = direccion === 'arriba' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= secciones.length) return

    const nuevasSecciones = [...secciones]
    const [movida] = nuevasSecciones.splice(index, 1)
    nuevasSecciones.splice(targetIndex, 0, movida)

    const actualizadas = nuevasSecciones.map((s, idx) => ({ ...s, order_index: idx }))
    setSecciones(actualizadas)
    saveOfflineSections(proyecto.id, actualizadas)

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine
    if (isOnline) {
      try {
        const updates = actualizadas.map((s) =>
          !s.id.startsWith('local_')
            ? supabase.from('lw_secciones').update({ order_index: s.order_index }).eq('id', s.id)
            : Promise.resolve()
        )
        await Promise.all(updates)
        toast.success('Orden actualizado')
      } catch (err) {
        addPendingSyncAction('REORDER_SECTIONS', {
          sections: actualizadas.map((s) => ({ id: s.id, order_index: s.order_index }))
        })
      }
    } else {
      addPendingSyncAction('REORDER_SECTIONS', {
        sections: actualizadas.map((s) => ({ id: s.id, order_index: s.order_index }))
      })
    }
  }

  // Cálculos de navegación
  const indiceActual = secciones.findIndex((s) => s.id === seccionActiva?.id)
  const tieneAnterior = indiceActual > 0
  const tieneSiguiente = indiceActual >= 0 && indiceActual < secciones.length - 1

  function irSeccionAnterior() {
    if (tieneAnterior) {
      seleccionarSeccion(secciones[indiceActual - 1])
    }
  }

  function irSeccionSiguiente() {
    if (tieneSiguiente) {
      seleccionarSeccion(secciones[indiceActual + 1])
    }
  }

  // Filtrado de secciones en el índice
  const seccionesFiltradasIndice = secciones.filter((s) =>
    s.title.toLowerCase().includes(busquedaIndice.toLowerCase())
  )

  const palabrasActuales = seccionActiva ? getWordCount(editor?.getHTML() || '') : 0

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      height: '100dvh',
      background: 'linear-gradient(180deg, #1A3A4A 0%, #122834 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <Toaster position="top-right" toastOptions={{ duration: 2500 }} />

      {/* Top Header en 3 Líneas Organizadas (Oculto en Pantalla Completa) */}
      {!pantallaCompleta && (
        <header
          style={{
            background: 'rgba(30, 61, 79, 0.96)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(201, 162, 74, 0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: 'max(10px, env(safe-area-inset-top, 10px)) 12px 8px 12px',
            zIndex: 20,
            flexShrink: 0
          }}
        >
          {/* LÍNEA 1: Botón Volver + Título Completo del Proyecto y Estado de Guardado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minWidth: 0 }}>
            <button
              onClick={handleIntentarSalir}
              title="Volver a proyectos"
              aria-label="Volver a proyectos"
              style={{
                background: 'rgba(20, 43, 55, 0.8)',
                border: '1px solid rgba(201, 162, 74, 0.35)',
                color: '#C9A24A',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>

            <div
              onClick={() => {
                setNuevoTituloProyecto(proyectoActual.title)
                setNuevoTipoProyecto(proyectoActual.type || 'sermon')
                setEditarProyectoModal(true)
              }}
              title="Clic para editar el título del proyecto"
              style={{
                flex: 1,
                minWidth: 0,
                cursor: 'pointer',
                borderRadius: '8px',
                padding: '2px 6px',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(201, 162, 74, 0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h1 style={{
                  color: '#F5F1E8',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '0.3px',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.25
                }}>
                  {proyectoActual.title}
                </h1>
                <span style={{
                  color: '#DFBE72',
                  fontSize: '12px',
                  opacity: 0.85,
                  flexShrink: 0
                }}>
                  ✏️
                </span>
              </div>
              <div style={{
                fontSize: '11px',
                fontFamily: "'Inter', sans-serif",
                marginTop: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {dictando ? (
                  modoExtendido ? (
                    <span style={{ color: '#FF6B6B', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <span className="anim-dot-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF4444', display: 'inline-block' }} />
                      Grabando sermón...
                    </span>
                  ) : (
                    <span style={{ color: '#DFBE72', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <span className="anim-dot-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C9A24A', display: 'inline-block' }} />
                      Grabando audio...
                    </span>
                  )
                ) : (guardando || !guardadoExitoso) ? (
                  <span
                    id="editor-status-guardando"
                    style={{
                      color: '#DFBE72',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600,
                      fontSize: '10.5px',
                      background: 'rgba(201, 162, 74, 0.16)',
                      padding: '1.5px 7px',
                      borderRadius: '6px',
                      border: '1px solid rgba(201, 162, 74, 0.35)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span
                      className="anim-spin"
                      style={{
                        width: '9px',
                        height: '9px',
                        border: '1.5px solid rgba(201, 162, 74, 0.3)',
                        borderTopColor: '#DFBE72',
                        borderRadius: '50%',
                        display: 'inline-block'
                      }}
                    />
                    Guardando...
                  </span>
                ) : (
                  <span
                    id="editor-status-guardado"
                    style={{
                      color: '#4AE098',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600,
                      fontSize: '10.5px',
                      background: 'rgba(48, 164, 108, 0.16)',
                      padding: '1.5px 7px',
                      borderRadius: '6px',
                      border: '1px solid rgba(48, 164, 108, 0.35)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Cambios guardados
                  </span>
                )}

                <span style={{ color: '#4E6573' }}>·</span>
                <span style={{ color: '#9BB0BD' }}>
                  {palabrasActuales} palabras
                </span>
              </div>
            </div>
          </div>

          {/* LÍNEA 2: Herramientas de Creación e Inteligencia Artificial (3 Botones) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1.15fr',
            gap: '6px',
            width: '100%'
          }}>
            {/* 1. Botón Sugerir Títulos con IA */}
            <button
              onClick={() => setSugerirTitulosModalAbierto(true)}
              title="Sugerir títulos impactantes con IA basados en el contenido escrito"
              aria-label="Sugerir Títulos con IA"
              style={{
                height: '31px',
                padding: '0 6px',
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.22) 0%, rgba(20, 43, 55, 0.95) 100%)',
                border: '1px solid rgba(201, 162, 74, 0.45)',
                color: '#DFBE72',
                borderRadius: '7px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 4px rgba(0,0,0,0.18)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#DFBE72'
                e.currentTarget.style.background = 'rgba(201, 162, 74, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.45)'
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201, 162, 74, 0.22) 0%, rgba(20, 43, 55, 0.95) 100%)'
              }}
            >
              <span style={{ fontSize: '12px' }}>✨</span>
              <span>Títulos IA</span>
            </button>

            {/* 2. Botón Transcribir Audio IA */}
            <button
              onClick={() => setAudioTranscribeModalAbierto(true)}
              title="Transcribir Audio con el modelo Gemini 3.5 Transcribe"
              aria-label="Transcribir Audio con IA"
              style={{
                height: '31px',
                padding: '0 6px',
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.28) 0%, rgba(20, 43, 55, 0.95) 100%)',
                border: '1px solid #C9A24A',
                color: '#FFE885',
                borderRadius: '7px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(201, 162, 74, 0.45)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201, 162, 74, 0.28) 0%, rgba(20, 43, 55, 0.95) 100%)'
              }}
            >
              <span style={{ fontSize: '12px', lineHeight: 1 }}>🎙️</span>
              <span>Audio IA</span>
            </button>

            {/* 3. Botón Organizar Secciones */}
            <button
              onClick={() => setIndiceAbierto(true)}
              title="Organizar, mover de lugar y eliminar secciones del proyecto"
              aria-label="Organizar y reordenar secciones"
              style={{
                height: '31px',
                padding: '0 6px',
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.2) 0%, rgba(30, 61, 79, 0.9) 100%)',
                border: '1px solid #C9A24A',
                color: '#FFE885',
                borderRadius: '7px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(201, 162, 74, 0.35)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201, 162, 74, 0.2) 0%, rgba(30, 61, 79, 0.9) 100%)'
              }}
            >
              <span style={{ fontSize: '12px', lineHeight: 1 }}>📑</span>
              <span>Organizar ({secciones.length})</span>
            </button>
          </div>

          {/* LÍNEA 3: Exportación, Lectura Ministerial y Modos de Visualización (4 Botones) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: '6px',
            width: '100%'
          }}>
            {/* 1. Botón Exportar PDF */}
            <button
              onClick={() => setExportarPDFModalAbierto(true)}
              title="Exportar a PDF Ministerial para Impresión o Púlpito"
              aria-label="Exportar a PDF Ministerial"
              style={{
                height: '29px',
                padding: '0 4px',
                background: 'rgba(20, 43, 55, 0.85)',
                border: '1px solid rgba(201, 162, 74, 0.35)',
                color: '#DFBE72',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(201, 162, 74, 0.25)'
                e.currentTarget.style.borderColor = '#C9A24A'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(20, 43, 55, 0.85)'
                e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.35)'
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              <span>PDF</span>
            </button>

            {/* 2. Conmutador Lectura Diurna / Nocturna / Sepia */}
            <button
              onClick={cicloTema}
              title={
                temaEditor === 'diurno'
                  ? 'Tema Actual: Diurno (Luz solar). Clic para cambiar a Sepia'
                  : temaEditor === 'sepia'
                  ? 'Tema Actual: Sepia (Pergamino). Clic para cambiar a Nocturno'
                  : 'Tema Actual: Nocturno (Púlpito/Noche). Clic para cambiar a Diurno'
              }
              aria-label="Cambiar tema de lectura y edición"
              style={{
                height: '29px',
                padding: '0 4px',
                background:
                  temaEditor === 'diurno'
                    ? 'linear-gradient(135deg, rgba(255, 235, 179, 0.25) 0%, rgba(20, 43, 55, 0.95) 100%)'
                    : temaEditor === 'sepia'
                    ? 'linear-gradient(135deg, rgba(244, 235, 217, 0.25) 0%, rgba(20, 43, 55, 0.95) 100%)'
                    : 'rgba(20, 43, 55, 0.85)',
                border: `1px solid ${temaEditor === 'diurno' ? '#F2C94C' : temaEditor === 'sepia' ? '#D4B37F' : 'rgba(201, 162, 74, 0.35)'}`,
                color: temaEditor === 'diurno' ? '#FFE885' : temaEditor === 'sepia' ? '#F7DFB7' : '#DFBE72',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
              }}
            >
              <span>{temaEditor === 'diurno' ? '☀️' : temaEditor === 'sepia' ? '📜' : '🌙'}</span>
              <span>{temaEditor === 'diurno' ? 'Día' : temaEditor === 'sepia' ? 'Sepia' : 'Noche'}</span>
            </button>

            {/* 3. Botón Modo Lectura Inmersiva / Púlpito */}
            <button
              onClick={() => setModoLecturaAbierto(true)}
              title="Abrir Modo Lectura / Modo Púlpito a pantalla completa"
              aria-label="Abrir Modo Lectura Púlpito"
              style={{
                height: '29px',
                padding: '0 4px',
                background: 'linear-gradient(135deg, rgba(48, 164, 108, 0.25) 0%, rgba(20, 43, 55, 0.95) 100%)',
                border: '1px solid rgba(48, 164, 108, 0.5)',
                color: '#4AE098',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(48, 164, 108, 0.35)'
                e.currentTarget.style.borderColor = '#4AE098'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(48, 164, 108, 0.25) 0%, rgba(20, 43, 55, 0.95) 100%)'
                e.currentTarget.style.borderColor = 'rgba(48, 164, 108, 0.5)'
              }}
            >
              <span style={{ fontSize: '11px', lineHeight: 1 }}>📖</span>
              <span>Leer</span>
            </button>

            {/* 4. Botón Modo Pantalla Completa / Enfoque */}
            <button
              onClick={togglePantallaCompleta}
              title="Alternar Modo Pantalla Completa y Enfoque (Oculta barras y distracciones)"
              aria-label="Alternar Pantalla Completa"
              style={{
                height: '29px',
                padding: '0 4px',
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.22) 0%, rgba(20, 43, 55, 0.95) 100%)',
                border: '1px solid rgba(201, 162, 74, 0.45)',
                color: '#DFBE72',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(201, 162, 74, 0.35)'
                e.currentTarget.style.borderColor = '#C9A24A'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201, 162, 74, 0.22) 0%, rgba(20, 43, 55, 0.95) 100%)'
                e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.45)'
              }}
            >
              <span style={{ fontSize: '11px', lineHeight: 1 }}>⛶</span>
              <span>Enfoque</span>
            </button>
          </div>
        </header>
      )}

      {/* Barra Minimalista Zen Exclusiva de Modo Pantalla Completa - Diseñada para NO apilarse jamás en móviles */}
      {pantallaCompleta && (
        <div
          style={{
            background: 'rgba(18, 38, 49, 0.98)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(201, 162, 74, 0.3)',
            padding: 'max(6px, env(safe-area-inset-top, 6px)) 10px 6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            flexWrap: 'nowrap',
            flexShrink: 0,
            zIndex: 30,
            height: '42px',
            boxSizing: 'border-box'
          }}
        >
          {/* Izquierda: Sección Actual con navegación anterior/siguiente (flexible y truncada para no empujar botones) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            minWidth: 0,
            flex: 1
          }}>
            {/* Botón Sección Anterior */}
            <button
              onClick={irSeccionAnterior}
              disabled={!tieneAnterior}
              title="Sección anterior"
              style={{
                background: 'rgba(30, 61, 79, 0.8)',
                border: '1px solid ' + (tieneAnterior ? 'rgba(201, 162, 74, 0.35)' : 'transparent'),
                color: tieneAnterior ? '#DFBE72' : '#3E5563',
                width: '24px',
                height: '24px',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: tieneAnterior ? 'pointer' : 'default',
                padding: 0,
                flexShrink: 0
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            {/* Título de la Sección Truncado con Elipsis */}
            <span
              title={seccionActiva?.title || 'Sección'}
              style={{
                color: '#F5F1E8',
                fontSize: '11.5px',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1
              }}
            >
              {seccionActiva?.title || 'Sección'}
            </span>

            {/* Botón Sección Siguiente */}
            <button
              onClick={irSeccionSiguiente}
              disabled={!tieneSiguiente}
              title="Sección siguiente"
              style={{
                background: 'rgba(30, 61, 79, 0.8)',
                border: '1px solid ' + (tieneSiguiente ? 'rgba(201, 162, 74, 0.35)' : 'transparent'),
                color: tieneSiguiente ? '#DFBE72' : '#3E5563',
                width: '24px',
                height: '24px',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: tieneSiguiente ? 'pointer' : 'default',
                padding: 0,
                flexShrink: 0
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>

          {/* Derecha: Indicador sutil de guardado + Botón Grabador + Tema + Salir (Unificados en fila estricta) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0
          }}>
            {/* Estado Guardado / Contador Compacto */}
            <div
              title={guardando ? 'Guardando cambios...' : 'Todos los cambios guardados'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 4px',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.04)',
                fontSize: '10px'
              }}
            >
              {(guardando || !guardadoExitoso) ? (
                <span
                  className="anim-spin"
                  style={{
                    width: '8px',
                    height: '8px',
                    border: '1.5px solid rgba(201, 162, 74, 0.3)',
                    borderTopColor: '#DFBE72',
                    borderRadius: '50%',
                    display: 'inline-block'
                  }}
                />
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4AE098" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
              <span style={{ color: '#8E9EA7', fontWeight: 500, fontSize: '10px' }}>
                {palabrasActuales}p
              </span>
            </div>

            {/* Botón Grabador de Voz */}
            <button
              type="button"
              onClick={toggleDictado}
              title={dictando ? 'Detener grabador de voz' : 'Iniciar grabador de voz'}
              style={{
                background: dictando ? '#E5484D' : 'rgba(30, 61, 79, 0.85)',
                border: '1px solid ' + (dictando ? '#FF8588' : 'rgba(201, 162, 74, 0.4)'),
                color: dictando ? '#FFFFFF' : '#DFBE72',
                padding: '3px 7px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                height: '26px',
                boxShadow: dictando ? '0 0 10px rgba(229, 72, 77, 0.5)' : 'none'
              }}
            >
              <span>{dictando ? '⏹' : '🎤'}</span>
              <span className="hidden sm:inline">{dictando ? 'Detener' : 'Grabador'}</span>
            </button>

            {/* Tema Rápido */}
            <button
              type="button"
              onClick={cicloTema}
              title="Cambiar tema de luz (Diurno/Sepia/Nocturno)"
              style={{
                background: 'rgba(30, 61, 79, 0.85)',
                border: '1px solid rgba(201, 162, 74, 0.35)',
                color: '#DFBE72',
                width: '26px',
                height: '26px',
                padding: 0,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {temaEditor === 'diurno' ? '☀️' : temaEditor === 'sepia' ? '📜' : '🌙'}
            </button>

            {/* Salir de Pantalla Completa */}
            <button
              type="button"
              onClick={togglePantallaCompleta}
              title="Salir de Pantalla Completa (o presiona Esc)"
              aria-label="Salir de Pantalla Completa"
              style={{
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.3) 0%, rgba(20, 43, 55, 0.95) 100%)',
                border: '1px solid #C9A24A',
                color: '#DFBE72',
                padding: '0 8px',
                height: '26px',
                borderRadius: '6px',
                fontSize: '10.5px',
                fontWeight: 700,
                fontFamily: "'Cinzel', serif",
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
              }}
            >
              <span>✕</span>
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      )}

      {/* Barra de Secciones Inteligente con Navegación Rápida y Auto-Scroll (Oculta en Pantalla Completa) */}
      {!pantallaCompleta && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#152E3B',
          borderBottom: '1px solid rgba(201, 162, 74, 0.18)',
          padding: '6px 8px',
          gap: '6px',
          flexShrink: 0,
          position: 'relative'
        }}>
          {/* Botón Sección Anterior */}
          <button
            onClick={irSeccionAnterior}
            disabled={!tieneAnterior}
            title="Sección anterior"
            style={{
              background: tieneAnterior ? 'rgba(30, 61, 79, 0.9)' : 'rgba(20, 43, 55, 0.3)',
              border: '1px solid ' + (tieneAnterior ? 'rgba(201, 162, 74, 0.3)' : 'transparent'),
              color: tieneAnterior ? '#DFBE72' : '#3E5563',
              width: '28px',
              height: '32px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: tieneAnterior ? 'pointer' : 'default',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          {/* Contenedor de Pestañas con Scroll Suave */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            flex: 1,
            padding: '2px 0'
          }}>
            {secciones.map((s, index) => {
              const activa = seccionActiva?.id === s.id
              return (
                <button
                  key={s.id}
                  ref={(el) => { tabRefs.current[s.id] = el }}
                  onClick={() => seleccionarSeccion(s)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '14px',
                    border: activa ? '1px solid #C9A24A' : '1px solid rgba(201, 162, 74, 0.15)',
                    background: activa
                      ? 'linear-gradient(135deg, rgba(201, 162, 74, 0.28) 0%, rgba(30, 61, 79, 0.9) 100%)'
                      : '#1E3D4F',
                    color: activa ? '#F5F1E8' : '#9BB0BD',
                    fontSize: '12px',
                    fontWeight: activa ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: activa ? '0 2px 8px rgba(0,0,0,0.3), 0 0 8px rgba(201, 162, 74, 0.2)' : 'none',
                    transition: 'all 0.15s ease',
                    flexShrink: 0
                  }}
                >
                  <span style={{
                    fontSize: '10px',
                    color: activa ? '#C9A24A' : '#738794',
                    fontWeight: 700
                  }}>
                    {index + 1}.
                  </span>
                  <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.title || 'Sección'}
                  </span>
                </button>
              )
            })}

            {/* Botón rápido para agregar sección */}
            <button
              onClick={() => setNuevaSeccionModal(true)}
              title="Añadir nueva sección"
              style={{
                padding: '6px 10px',
                borderRadius: '14px',
                border: '1px dashed rgba(201, 162, 74, 0.4)',
                background: 'rgba(201, 162, 74, 0.08)',
                color: '#DFBE72',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}
            >
              <span>+</span>
              <span>Sección</span>
            </button>
          </div>

          {/* Botón Sección Siguiente */}
          <button
            onClick={irSeccionSiguiente}
            disabled={!tieneSiguiente}
            title="Sección siguiente"
            style={{
              background: tieneSiguiente ? 'rgba(30, 61, 79, 0.9)' : 'rgba(20, 43, 55, 0.3)',
              border: '1px solid ' + (tieneSiguiente ? 'rgba(201, 162, 74, 0.3)' : 'transparent'),
              color: tieneSiguiente ? '#DFBE72' : '#3E5563',
              width: '28px',
              height: '32px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: tieneSiguiente ? 'pointer' : 'default',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          {/* Acciones directas de la sección activa (Mover, Renombrar, Eliminar, Organizar) */}
          {seccionActiva && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
              {/* Mover hacia la izquierda (subir) */}
              <button
                onClick={() => moverSeccion(indiceActual, 'arriba')}
                disabled={indiceActual <= 0}
                title={indiceActual <= 0 ? 'Ya está al inicio' : 'Mover sección hacia la izquierda (antes)'}
                aria-label="Mover sección hacia la izquierda"
                style={{
                  background: indiceActual > 0 ? 'rgba(20, 43, 55, 0.85)' : 'rgba(20, 43, 55, 0.3)',
                  border: '1px solid ' + (indiceActual > 0 ? 'rgba(201, 162, 74, 0.35)' : 'rgba(255,255,255,0.05)'),
                  color: indiceActual > 0 ? '#DFBE72' : '#455964',
                  width: '26px',
                  height: '32px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: indiceActual > 0 ? 'pointer' : 'default',
                  fontSize: '11px',
                  transition: 'all 0.15s ease'
                }}
              >
                ◀
              </button>

              {/* Mover hacia la derecha (bajar) */}
              <button
                onClick={() => moverSeccion(indiceActual, 'abajo')}
                disabled={indiceActual >= secciones.length - 1}
                title={indiceActual >= secciones.length - 1 ? 'Ya está al final' : 'Mover sección hacia la derecha (después)'}
                aria-label="Mover sección hacia la derecha"
                style={{
                  background: indiceActual < secciones.length - 1 ? 'rgba(20, 43, 55, 0.85)' : 'rgba(20, 43, 55, 0.3)',
                  border: '1px solid ' + (indiceActual < secciones.length - 1 ? 'rgba(201, 162, 74, 0.35)' : 'rgba(255,255,255,0.05)'),
                  color: indiceActual < secciones.length - 1 ? '#DFBE72' : '#455964',
                  width: '26px',
                  height: '32px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: indiceActual < secciones.length - 1 ? 'pointer' : 'default',
                  fontSize: '11px',
                  transition: 'all 0.15s ease'
                }}
              >
                ▶
              </button>

              {/* Renombrar título */}
              <button
                onClick={() => setRenombrarModal({ id: seccionActiva.id, title: seccionActiva.title })}
                title="Renombrar esta sección"
                aria-label="Renombrar sección"
                style={{
                  background: 'rgba(20, 43, 55, 0.75)',
                  border: '1px solid rgba(201, 162, 74, 0.3)',
                  color: '#DFBE72',
                  width: '26px',
                  height: '32px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              </button>

              {/* Eliminar sección */}
              <button
                onClick={() => {
                  if (secciones.length <= 1) {
                    toast.error('El proyecto debe tener al menos una sección')
                    return
                  }
                  setEliminarModal(seccionActiva)
                }}
                disabled={secciones.length <= 1}
                title={secciones.length <= 1 ? 'No se puede eliminar la única sección del proyecto' : 'Eliminar esta sección'}
                aria-label="Eliminar sección"
                style={{
                  background: secciones.length > 1 ? 'rgba(229, 72, 77, 0.18)' : 'rgba(20, 43, 55, 0.3)',
                  border: '1px solid ' + (secciones.length > 1 ? 'rgba(229, 72, 77, 0.45)' : 'rgba(255,255,255,0.05)'),
                  color: secciones.length > 1 ? '#FF8588' : '#455964',
                  width: '26px',
                  height: '32px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: secciones.length > 1 ? 'pointer' : 'default',
                  fontSize: '12px',
                  transition: 'all 0.15s ease'
                }}
              >
                🗑️
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toolbar de Formato Tiptap */}
      {editor && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 12px',
          background: '#1E3D4F',
          borderBottom: '1px solid rgba(201, 162, 74, 0.15)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flexShrink: 0
        }}>
          {/* Indicador de sección activa */}
          <div style={{
            fontSize: '11px',
            color: '#C9A24A',
            fontFamily: "'Cinzel', serif",
            fontWeight: 700,
            marginRight: '6px',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span>Sección {indiceActual + 1}/{secciones.length}:</span>
            <span style={{ color: '#F5F1E8', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {seccionActiva?.title}
            </span>
          </div>

          <div style={{ width: '1px', height: '18px', background: 'rgba(201, 162, 74, 0.2)', margin: '0 4px' }} />

          {/* Negrita */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Negrita"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: editor.isActive('bold') ? 'rgba(201, 162, 74, 0.3)' : 'transparent',
              color: editor.isActive('bold') ? '#DFBE72' : '#F5F1E8',
              fontWeight: 'bold',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            B
          </button>

          {/* Cursiva */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Cursiva"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: editor.isActive('italic') ? 'rgba(201, 162, 74, 0.3)' : 'transparent',
              color: editor.isActive('italic') ? '#DFBE72' : '#F5F1E8',
              fontStyle: 'italic',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            I
          </button>

          <div style={{ width: '1px', height: '18px', background: 'rgba(201, 162, 74, 0.2)', margin: '0 4px' }} />

          {/* H1 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Título Principal"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              background: editor.isActive('heading', { level: 1 }) ? 'rgba(201, 162, 74, 0.3)' : 'transparent',
              color: editor.isActive('heading', { level: 1 }) ? '#DFBE72' : '#9BB0BD',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            H1
          </button>

          {/* H2 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Subtítulo"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              background: editor.isActive('heading', { level: 2 }) ? 'rgba(201, 162, 74, 0.3)' : 'transparent',
              color: editor.isActive('heading', { level: 2 }) ? '#DFBE72' : '#9BB0BD',
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            H2
          </button>

          <div style={{ width: '1px', height: '18px', background: 'rgba(201, 162, 74, 0.2)', margin: '0 4px' }} />

          {/* Cita / Blockquote */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Cita Bíblica o Frase"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              background: editor.isActive('blockquote') ? 'rgba(201, 162, 74, 0.3)' : 'transparent',
              color: editor.isActive('blockquote') ? '#DFBE72' : '#9BB0BD',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            &ldquo;Cita&rdquo;
          </button>

          {/* Lista con viñetas */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista de Puntos"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              background: editor.isActive('bulletList') ? 'rgba(201, 162, 74, 0.3)' : 'transparent',
              color: editor.isActive('bulletList') ? '#DFBE72' : '#9BB0BD',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            • Lista
          </button>

          <div style={{ width: '1px', height: '18px', background: 'rgba(201, 162, 74, 0.2)', margin: '0 4px' }} />

          {/* Deshacer */}
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Deshacer"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: editor.can().undo() ? '#9BB0BD' : '#4E6573',
              fontSize: '14px',
              cursor: editor.can().undo() ? 'pointer' : 'default'
            }}
          >
            ↩
          </button>

          {/* Rehacer */}
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Rehacer"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: editor.can().redo() ? '#9BB0BD' : '#4E6573',
              fontSize: '14px',
              cursor: editor.can().redo() ? 'pointer' : 'default'
            }}
          >
            ↪
          </button>

          <div style={{ flex: 1 }} />

          {/* Botón Pantalla Completa en la barra de formato */}
          <button
            type="button"
            onClick={togglePantallaCompleta}
            title={pantallaCompleta ? "Salir de Pantalla Completa (Esc)" : "Pantalla Completa / Modo Enfoque"}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(201, 162, 74, 0.3)',
              background: pantallaCompleta ? 'rgba(201, 162, 74, 0.25)' : 'rgba(20, 43, 55, 0.6)',
              color: '#DFBE72',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>{pantallaCompleta ? '🗗' : '⛶'}</span>
            <span className="hidden sm:inline">{pantallaCompleta ? 'Salir Enfoque' : 'Enfoque'}</span>
          </button>
        </div>
      )}

      {/* Área del Editor Tiptap con click focus y tema dinámico (Diurno, Nocturno, Sepia) */}
      <div
        className={`tiptap-container tiptap-theme-${temaEditor}`}
        onClick={() => {
          if (editor && !editor.isFocused) {
            editor?.commands?.focus('end')
          }
        }}
        style={{
          flex: 1,
          padding: pantallaCompleta ? '24px 20px 60px 20px' : '20px 20px 40px 20px',
          background: temaEditor === 'diurno' ? '#FAF8F5' : temaEditor === 'sepia' ? '#F4EBD9' : '#1A3A4A',
          overflowY: 'auto',
          boxSizing: 'border-box',
          transition: 'background-color 0.25s ease'
        }}
      >
        <div style={{ maxWidth: pantallaCompleta ? '840px' : '760px', margin: '0 auto', minHeight: '100%', transition: 'max-width 0.25s ease' }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Barra Inferior de Audio y Grabador con Safe-Area (Oculta en Pantalla Completa) */}
      {!pantallaCompleta && (
        <div style={{
          paddingTop: '8px',
          paddingLeft: '12px',
          paddingRight: '12px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(30, 61, 79, 0.96)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid rgba(201, 162, 74, 0.3)',
          display: 'flex',
          gap: '8px',
          zIndex: 20
        }}>
          {/* Botón Transcribir con Gemini 3.5 Transcribe */}
          <button
            onClick={() => setAudioTranscribeModalAbierto(true)}
            title="Grabar o subir audio para transcribir con Gemini 3.5 Transcribe"
            aria-label="Transcribir con IA Gemini"
            style={{
              flex: 1.2,
              padding: '11px 10px',
              borderRadius: '10px',
              border: '1px solid #DFBE72',
              background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
              color: '#122834',
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.3px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(201, 162, 74, 0.35)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ fontSize: '15px' }}>✨🎙️</span>
            <span>Transcribir (IA)</span>
          </button>

          {/* Botón Grabador Dictado Web */}
          <button
            onClick={toggleDictado}
            title={dictando && !modoExtendido ? "Detener dictado" : "Dictado directo al cursor"}
            aria-label="Dictado en vivo"
            style={{
              flex: 1,
              padding: '11px 8px',
              borderRadius: '10px',
              border: 'none',
              background: dictando && !modoExtendido
                ? '#E5484D'
                : 'linear-gradient(135deg, #24495C 0%, #173646 100%)',
              color: dictando && !modoExtendido ? '#FFFFFF' : '#DFBE72',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: dictando && !modoExtendido ? '#FF8588' : 'rgba(201, 162, 74, 0.3)',
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: '11.5px',
              letterSpacing: '0.3px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: dictando && !modoExtendido
                ? '0 0 14px rgba(229, 72, 77, 0.5)'
                : '0 2px 6px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {dictando && !modoExtendido ? (
              <>
                <span className="anim-dot-pulse" style={{ fontSize: '14px' }}>⏹</span>
                <span>Detener</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '14px' }}>🎤</span>
                <span>Dictado</span>
              </>
            )}
          </button>

          {/* Botón Grabar Sermón Extendido */}
          <button
            onClick={toggleExtendido}
            title={dictando && modoExtendido ? "Detener sermón continuo" : "Dictado continuo de sermón"}
            aria-label="Dictado extendido"
            style={{
              flex: 1,
              padding: '11px 8px',
              borderRadius: '10px',
              border: dictando && modoExtendido
                ? '1px solid #FF8588'
                : '1px solid rgba(201, 162, 74, 0.25)',
              background: dictando && modoExtendido
                ? '#E5484D'
                : 'linear-gradient(135deg, #1A3745 0%, #102632 100%)',
              color: '#F5F1E8',
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: '11.5px',
              letterSpacing: '0.3px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: dictando && modoExtendido
                ? '0 0 14px rgba(229, 72, 77, 0.5)'
                : '0 2px 6px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {dictando && modoExtendido ? (
              <>
                <span className="anim-dot-pulse" style={{ fontSize: '14px' }}>⏹</span>
                <span>Detener</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '14px' }}>🔊</span>
                <span>Extendido</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* MODAL / DRAWER DE ÍNDICE COMPLETO DE SECCIONES (TABLA DE CONTENIDOS) */}
      {indiceAbierto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 24, 33, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          zIndex: 100
        }}
        onClick={() => setIndiceAbierto(false)}
        >
          <div
            className="slide-up-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #1E3D4F 0%, #142C38 100%)',
              borderTop: '2px solid #C9A24A',
              borderLeft: '1px solid rgba(201, 162, 74, 0.3)',
              borderRight: '1px solid rgba(201, 162, 74, 0.3)',
              borderRadius: '20px 20px 0 0',
              padding: '20px 18px 30px 18px',
              width: '100%',
              maxWidth: '620px',
              boxSizing: 'border-box',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Cabecera del Gestor / Índice */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px', color: '#C9A24A' }}>📑</span>
                  <h2 style={{
                    color: '#C9A24A',
                    fontFamily: "'Cinzel', serif",
                    fontSize: '18px',
                    fontWeight: 700,
                    margin: 0
                  }}>
                    Organizar Secciones
                  </h2>
                </div>
                <div style={{ color: '#8E9EA7', fontSize: '12px', marginTop: '2px' }}>
                  {secciones.length} {secciones.length === 1 ? 'sección' : 'secciones'} • Reordena o elimina secciones
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => {
                    setIndiceAbierto(false)
                    setNuevaSeccionModal(true)
                  }}
                  title="Añadir una nueva sección al proyecto"
                  style={{
                    background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                    color: '#122834',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: "'Cinzel', serif",
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                  }}
                >
                  <span>+</span>
                  <span>Nueva Sección</span>
                </button>
                <button
                  onClick={() => setIndiceAbierto(false)}
                  title="Cerrar organizador"
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
            </div>

            {/* Banner de ayuda e instrucciones */}
            <div style={{
              background: 'rgba(201, 162, 74, 0.08)',
              border: '1px solid rgba(201, 162, 74, 0.2)',
              borderRadius: '8px',
              padding: '7px 10px',
              marginBottom: '12px',
              fontSize: '11.5px',
              color: '#D7E3EB',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ fontSize: '13px' }}>💡</span>
              <span>Usa las flechas <strong>▲</strong> y <strong>▼</strong> para mover de lugar las secciones, o <strong>🗑️</strong> para eliminar.</span>
            </div>

            {/* Buscador de secciones en el índice */}
            {secciones.length > 4 && (
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar sección por nombre..."
                  value={busquedaIndice}
                  onChange={(e) => setBusquedaIndice(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: '#142834',
                    border: '1px solid rgba(201, 162, 74, 0.25)',
                    borderRadius: '8px',
                    color: '#F5F1E8',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            {/* Lista Vertical de Secciones */}
            <div style={{
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px'
            }}>
              {seccionesFiltradasIndice.map((s) => {
                const activa = seccionActiva?.id === s.id
                const palabras = getWordCount(s.content || '')
                const posOriginal = secciones.findIndex((sec) => sec.id === s.id)

                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      seleccionarSeccion(s)
                      setIndiceAbierto(false)
                    }}
                    style={{
                      background: activa ? 'rgba(201, 162, 74, 0.16)' : '#173444',
                      border: activa ? '1.5px solid #C9A24A' : '1px solid rgba(201, 162, 74, 0.18)',
                      borderLeft: activa ? '4px solid #DFBE72' : '3px solid rgba(201, 162, 74, 0.3)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '6px',
                        background: activa ? '#C9A24A' : 'rgba(201, 162, 74, 0.15)',
                        color: activa ? '#122834' : '#DFBE72',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {posOriginal + 1}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: activa ? '#DFBE72' : '#F5F1E8',
                          fontWeight: activa ? 700 : 500,
                          fontSize: '14px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {s.title}
                        </div>
                        <div style={{
                          color: '#8E9EA7',
                          fontSize: '11px',
                          marginTop: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>{palabras} {palabras === 1 ? 'palabra' : 'palabras'}</span>
                          {activa && (
                            <span style={{ color: '#30A46C', fontWeight: 600 }}>• Sección actual</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acciones de sección: Mover arriba/abajo, Renombrar, Eliminar */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Subir */}
                      <button
                        onClick={() => moverSeccion(posOriginal, 'arriba')}
                        disabled={posOriginal === 0}
                        title={posOriginal === 0 ? 'Ya es la primera sección' : 'Mover arriba'}
                        aria-label="Mover sección arriba"
                        style={{
                          background: posOriginal === 0 ? 'rgba(20, 43, 55, 0.3)' : 'rgba(30, 61, 79, 0.9)',
                          border: '1px solid ' + (posOriginal === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(201, 162, 74, 0.35)'),
                          color: posOriginal === 0 ? '#455964' : '#DFBE72',
                          cursor: posOriginal === 0 ? 'default' : 'pointer',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        ▲
                      </button>

                      {/* Bajar */}
                      <button
                        onClick={() => moverSeccion(posOriginal, 'abajo')}
                        disabled={posOriginal === secciones.length - 1}
                        title={posOriginal === secciones.length - 1 ? 'Ya es la última sección' : 'Mover abajo'}
                        aria-label="Mover sección abajo"
                        style={{
                          background: posOriginal === secciones.length - 1 ? 'rgba(20, 43, 55, 0.3)' : 'rgba(30, 61, 79, 0.9)',
                          border: '1px solid ' + (posOriginal === secciones.length - 1 ? 'rgba(255,255,255,0.05)' : 'rgba(201, 162, 74, 0.35)'),
                          color: posOriginal === secciones.length - 1 ? '#455964' : '#DFBE72',
                          cursor: posOriginal === secciones.length - 1 ? 'default' : 'pointer',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        ▼
                      </button>

                      {/* Renombrar */}
                      <button
                        onClick={() => setRenombrarModal({ id: s.id, title: s.title })}
                        title="Renombrar título"
                        aria-label="Renombrar sección"
                        style={{
                          background: 'rgba(201, 162, 74, 0.12)',
                          border: '1px solid rgba(201, 162, 74, 0.3)',
                          color: '#DFBE72',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        ✏️
                      </button>

                      {/* Eliminar */}
                      <button
                        onClick={() => {
                          if (secciones.length <= 1) {
                            toast.error('El proyecto debe tener al menos una sección')
                            return
                          }
                          setEliminarModal(s)
                        }}
                        disabled={secciones.length <= 1}
                        title={secciones.length <= 1 ? 'No se puede eliminar la única sección del proyecto' : 'Eliminar esta sección'}
                        aria-label="Eliminar sección"
                        style={{
                          background: secciones.length > 1 ? 'rgba(229, 72, 77, 0.15)' : 'rgba(20, 43, 55, 0.3)',
                          border: '1px solid ' + (secciones.length > 1 ? 'rgba(229, 72, 77, 0.4)' : 'rgba(255,255,255,0.05)'),
                          color: secciones.length > 1 ? '#FF8588' : '#455964',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          cursor: secciones.length > 1 ? 'pointer' : 'default',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}

              {seccionesFiltradasIndice.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#8E9EA7', fontSize: '13px' }}>
                  No se encontraron secciones con &quot;{busquedaIndice}&quot;
                </div>
              )}
            </div>

            {/* Acciones Rápidas al pie del Índice */}
            <div style={{
              paddingTop: '14px',
              borderTop: '1px solid rgba(201, 162, 74, 0.2)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px'
            }}>
              <button
                onClick={() => {
                  setIndiceAbierto(false)
                  setModoLecturaAbierto(true)
                }}
                style={{
                  padding: '9px 10px',
                  background: 'linear-gradient(135deg, rgba(48, 164, 108, 0.2) 0%, rgba(20, 43, 55, 0.95) 100%)',
                  border: '1px solid rgba(48, 164, 108, 0.4)',
                  color: '#4AE098',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: "'Cinzel', serif",
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px'
                }}
              >
                <span>📖</span>
                <span>Modo Lectura</span>
              </button>

              <button
                onClick={() => {
                  setIndiceAbierto(false)
                  setExportarPDFModalAbierto(true)
                }}
                style={{
                  padding: '9px 10px',
                  background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.2) 0%, rgba(20, 43, 55, 0.95) 100%)',
                  border: '1px solid rgba(201, 162, 74, 0.4)',
                  color: '#DFBE72',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: "'Cinzel', serif",
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px'
                }}
              >
                <span>📄</span>
                <span>Descargar PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Renombrar Sección */}
      {renombrarModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 24, 33, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 110
        }}
        onClick={() => setRenombrarModal(null)}
        >
          <div
            className="anim-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1E3D4F',
              border: '1px solid #C9A24A',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)'
            }}
          >
            <h3 style={{
              color: '#C9A24A',
              fontFamily: "'Cinzel', serif",
              fontSize: '17px',
              margin: '0 0 14px 0'
            }}>
              Renombrar Sección
            </h3>
            <form onSubmit={handleGuardarRenombrar}>
              <input
                type="text"
                autoFocus
                required
                value={renombrarModal.title}
                onChange={(e) => setRenombrarModal({ ...renombrarModal, title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: '#142C38',
                  border: '1px solid rgba(201, 162, 74, 0.3)',
                  borderRadius: '10px',
                  color: '#F5F1E8',
                  fontSize: '15px',
                  marginBottom: '18px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setRenombrarModal(null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#142C38',
                    border: '1px solid #2E4B5E',
                    color: '#9BB0BD',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#C9A24A',
                    color: '#122834',
                    border: 'none',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar Sección */}
      {eliminarModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 24, 33, 0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 120
        }}
        onClick={() => setEliminarModal(null)}
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
              maxWidth: '380px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)'
            }}
          >
            <h3 style={{
              color: '#FF6B6B',
              fontFamily: "'Cinzel', serif",
              fontSize: '17px',
              margin: '0 0 10px 0'
            }}>
              ¿Eliminar Sección?
            </h3>
            <p style={{
              color: '#F5F1E8',
              fontSize: '13px',
              marginBottom: '18px',
              lineHeight: 1.4
            }}>
              Se eliminará permanentemente la sección <strong>&quot;{eliminarModal.title}&quot;</strong> y todo su contenido escrito.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEliminarModal(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#142C38',
                  border: '1px solid #2E4B5E',
                  color: '#9BB0BD',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEliminar}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#E5484D',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Renombrar / Editar Título del Proyecto */}
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
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 120
        }}
        onClick={() => !guardandoProyecto && setEditarProyectoModal(false)}
        >
          <div
            className="anim-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1E3D4F',
              border: '1px solid #C9A24A',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{
                color: '#C9A24A',
                fontFamily: "'Cinzel', serif",
                fontSize: '17px',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>✏️</span>
                <span>Editar Título del Proyecto</span>
              </h3>
              <button
                onClick={() => setEditarProyectoModal(false)}
                disabled={guardandoProyecto}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8E9EA7',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '2px'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarTituloProyecto}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#DFBE72',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '6px'
                }}>
                  Título o Tema del Mensaje
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="Título del proyecto..."
                  value={nuevoTituloProyecto}
                  onChange={(e) => setNuevoTituloProyecto(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: '#142C38',
                    border: '1px solid rgba(201, 162, 74, 0.3)',
                    borderRadius: '10px',
                    color: '#F5F1E8',
                    fontSize: '15px',
                    fontFamily: "'Crimson Pro', Georgia, serif",
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />

                <div style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditarProyectoModal(false)
                      setSugerirTitulosModalAbierto(true)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.15) 0%, rgba(20, 43, 55, 0.9) 100%)',
                      border: '1px dashed #C9A24A',
                      borderRadius: '8px',
                      color: '#DFBE72',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      fontFamily: "'Cinzel', serif",
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <span>✨</span>
                    <span>Sugerir títulos con IA basados en el contenido</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  disabled={guardandoProyecto}
                  onClick={() => setEditarProyectoModal(false)}
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
                  type="submit"
                  disabled={guardandoProyecto}
                  style={{
                    flex: 1,
                    padding: '11px',
                    background: guardandoProyecto ? '#9A7727' : 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                    color: '#122834',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    borderRadius: '8px',
                    cursor: guardandoProyecto ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {guardandoProyecto ? (
                    <>
                      <span className="anim-spin" style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '12px',
                        border: '2px solid rgba(18,40,52,0.3)',
                        borderTopColor: '#122834',
                        borderRadius: '50%'
                      }} />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Nueva Sección */}
      {nuevaSeccionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 24, 33, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 110
        }}
        onClick={() => setNuevaSeccionModal(false)}
        >
          <div
            className="anim-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1E3D4F',
              border: '1px solid #C9A24A',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)'
            }}
          >
            <h3 style={{
              color: '#C9A24A',
              fontFamily: "'Cinzel', serif",
              fontSize: '17px',
              margin: '0 0 14px 0'
            }}>
              Nueva Sección
            </h3>
            <form onSubmit={handleCrearNuevaSeccion}>
              <input
                type="text"
                autoFocus
                required
                placeholder="Ej: Punto I, Aplicación, Conclusión..."
                value={nuevaSeccionTitulo}
                onChange={(e) => setNuevaSeccionTitulo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: '#142C38',
                  border: '1px solid rgba(201, 162, 74, 0.3)',
                  borderRadius: '10px',
                  color: '#F5F1E8',
                  fontSize: '15px',
                  marginBottom: '18px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setNuevaSeccionModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#142C38',
                    border: '1px solid #2E4B5E',
                    color: '#9BB0BD',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#C9A24A',
                    color: '#122834',
                    border: 'none',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Agregar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exportación a PDF Ministerial */}
      {exportarPDFModalAbierto && (
        <ExportarPDFModal
          proyecto={proyectoActual}
          secciones={secciones}
          onClose={() => setExportarPDFModalAbierto(false)}
        />
      )}

      {/* Modal / Vista Inmersiva de Lectura Diurna y Nocturna / Modo Púlpito */}
      {modoLecturaAbierto && (
        <ModoLecturaModal
          proyecto={proyectoActual}
          secciones={secciones}
          seccionInicialId={seccionActiva?.id}
          temaInicial={temaEditor}
          onClose={() => setModoLecturaAbierto(false)}
          onCambiarTemaGlobal={(nuevoTema) => setTemaEditor(nuevoTema)}
        />
      )}

      {/* Modal de Sugerencia de Títulos con IA */}
      {sugerirTitulosModalAbierto && (
        <SugerirTitulosModal
          isOpen={sugerirTitulosModalAbierto}
          onClose={() => setSugerirTitulosModalAbierto(false)}
          onSelectTitle={handleAplicarTituloSugerido}
          currentTitle={proyectoActual.title}
          projectType={proyectoActual.type}
          secciones={secciones}
          seccionActivaId={seccionActiva?.id}
        />
      )}

      {/* Modal de Transcripción de Audio con Gemini 3.5 Transcribe */}
      {audioTranscribeModalAbierto && (
        <AudioTranscribeModal
          contexto="editor"
          onClose={() => setAudioTranscribeModalAbierto(false)}
          onInsertText={handleInsertarTextoTranscrito}
          onCrearNuevaSeccion={(titulo, contenido) => {
            handleCrearSeccionDirecta(titulo, `<p>${contenido.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`)
          }}
        />
      )}

      {/* Modal de Confirmación: Salir con Cambios sin Guardar o sin Sincronizar */}
      {confirmarSalidaModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(10, 24, 33, 0.82)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px',
            zIndex: 160
          }}
          onClick={() => !guardandoYSalir && setConfirmarSalidaModal(false)}
        >
          <div
            className="anim-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1E3D4F',
              border: '1px solid #C9A24A',
              borderRadius: '16px',
              padding: '22px',
              width: '100%',
              maxWidth: '430px',
              boxShadow: '0 20px 48px rgba(0,0,0,0.55)'
            }}
          >
            {/* Cabecera del Diálogo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(201, 162, 74, 0.16)',
                border: '1px solid rgba(201, 162, 74, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0
              }}>
                ⚠️
              </div>
              <div>
                <h3 style={{
                  color: '#DFBE72',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: '17px',
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: '0.4px',
                  lineHeight: 1.2
                }}>
                  ¿Salir sin guardar?
                </h3>
                <span style={{
                  color: '#9BB0BD',
                  fontSize: '12px',
                  fontFamily: "'Inter', sans-serif"
                }}>
                  Existen cambios pendientes de sincronización
                </span>
              </div>
            </div>

            {/* Mensaje Informativo */}
            <p style={{
              color: '#F5F1E8',
              fontSize: '13.5px',
              lineHeight: 1.6,
              margin: '0 0 14px 0',
              fontFamily: "'Inter', sans-serif"
            }}>
              Se han detectado modificaciones recientes en tu proyecto que aún no han terminado de guardarse o sincronizarse. Si sales ahora, podrías perder las últimas líneas redactadas.
            </p>

            {/* Detalle específico del motivo */}
            {motivoSalida && (
              <div style={{
                background: 'rgba(20, 43, 55, 0.92)',
                border: '1px solid rgba(201, 162, 74, 0.3)',
                borderRadius: '8px',
                padding: '9px 12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px' }}>⏳</span>
                <span style={{
                  color: '#DFBE72',
                  fontSize: '12px',
                  lineHeight: 1.4,
                  fontFamily: "'Inter', sans-serif"
                }}>
                  {motivoSalida}
                </span>
              </div>
            )}

            {/* Botones de Acción */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Botón Principal: Guardar y salir */}
              <button
                type="button"
                disabled={guardandoYSalir}
                onClick={handleGuardarYSalir}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: guardandoYSalir
                    ? '#9A7727'
                    : 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                  color: '#122834',
                  border: 'none',
                  borderRadius: '9px',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  fontFamily: "'Cinzel', serif",
                  cursor: guardandoYSalir ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 3px 10px rgba(201, 162, 74, 0.3)',
                  transition: 'all 0.15s ease'
                }}
              >
                {guardandoYSalir ? (
                  <>
                    <span className="anim-spin" style={{
                      display: 'inline-block',
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(18,40,52,0.3)',
                      borderTopColor: '#122834',
                      borderRadius: '50%'
                    }} />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <>
                    <span>💾</span>
                    <span>Guardar y salir</span>
                  </>
                )}
              </button>

              {/* Fila con Seguir editando y Salir sin guardar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  disabled={guardandoYSalir}
                  onClick={() => setConfirmarSalidaModal(false)}
                  style={{
                    padding: '10px 8px',
                    background: 'rgba(20, 43, 55, 0.85)',
                    border: '1px solid rgba(201, 162, 74, 0.4)',
                    color: '#DFBE72',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  <span>✏️</span>
                  <span>Seguir editando</span>
                </button>

                <button
                  type="button"
                  disabled={guardandoYSalir}
                  onClick={handleSalirSinGuardar}
                  style={{
                    padding: '10px 8px',
                    background: 'rgba(229, 72, 77, 0.12)',
                    border: '1px solid rgba(229, 72, 77, 0.35)',
                    color: '#FF8B8E',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  <span>🚪</span>
                  <span>Salir sin guardar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


