import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import toast, { Toaster } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useDictado } from '../hooks/useDictado'

export default function Editor({ proyecto, onBack }) {
  const [secciones, setSecciones] = useState([])
  const [seccionActiva, setSeccionActiva] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const autoSaveRef = useRef(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      clearTimeout(autoSaveRef.current)
      autoSaveRef.current = setTimeout(() => guardar(html), 2000)
    }
  })

  const { dictando, modoExtendido, toggleDictado, toggleExtendido } = useDictado(
    (palabras) => {
      if (editor) {
        editor.commands.insertContent(' ' + palabras)
        const html = editor.getHTML()
        clearTimeout(autoSaveRef.current)
        autoSaveRef.current = setTimeout(() => guardar(html), 2000)
      }
    }
  )

  useEffect(() => { cargarSecciones() }, [proyecto])

  async function cargarSecciones() {
    const { data } = await supabase
      .from('lw_secciones')
      .select('*')
      .eq('project_id', proyecto.id)
      .order('order_index')
    setSecciones(data || [])
    if (data?.length > 0) seleccionarSeccion(data[0])
  }

  function seleccionarSeccion(sec) {
    setSeccionActiva(sec)
    if (editor) {
      editor.commands.setContent(sec.content || '')
    }
  }

  async function guardar(html) {
    if (!seccionActiva) return
    setGuardando(true)
    const { error } = await supabase
      .from('lw_secciones')
      .update({ content: html, updated_at: new Date().toISOString() })
      .eq('id', seccionActiva.id)
    
    setGuardando(false)
    if (error) {
      toast.error('Error al guardar')
    } else {
      toast.success('Guardado')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1A3A4A' }}>
      <Toaster position="top-right" />
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: '#1E3D4F',
        borderBottom: '1px solid #C9A24A', display: 'flex', alignItems: 'center', gap: 12
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: '#C9A24A', fontSize: 20, cursor: 'pointer'
        }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#F5F1E8', fontWeight: 'bold', fontSize: '14px' }}>{proyecto.title}</div>
          <div style={{ color: '#888', fontSize: '11px' }}>
            {dictando ? (modoExtendido ? '🔴 Grabando sermón...' : '🎤 Dictando...') : guardando ? 'Guardando...' : 'Guardado'}
          </div>
        </div>
      </div>

      {/* Secciones */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 12px',
        overflowX: 'auto', background: '#1A3A4A', borderBottom: '1px solid #333'
      }}>
        {secciones.map(s => (
          <button key={s.id} onClick={() => seleccionarSeccion(s)}
            style={{
              padding: '6px 12px', borderRadius: '16px', border: 'none',
              background: seccionActiva?.id === s.id ? '#C9A24A' : '#1E3D4F',
              color: seccionActiva?.id === s.id ? '#1A3A4A' : '#888',
              fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap'
            }}>
            {s.title || 'Sección'}
          </button>
        ))}
      </div>

      {/* Editor Tiptap */}
      <div className="tiptap-container" style={{
        flex: 1, padding: '16px', background: '#1A3A4A', color: '#F5F1E8',
        overflowY: 'auto', lineHeight: '1.8', fontFamily: 'Georgia, serif'
      }}>
        <EditorContent editor={editor} />
      </div>

      {/* Botones de audio */}
      <div style={{
        padding: '12px 16px', background: '#1E3D4F',
        borderTop: '1px solid #333', display: 'flex', gap: 12
      }}>
        <button onClick={toggleDictado} style={{
          flex: 1, padding: '14px', borderRadius: '8px', border: 'none',
          background: dictando && !modoExtendido ? '#ff4444' : '#C9A24A',
          color: '#1A3A4A', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer'
        }}>
          {dictando && !modoExtendido ? '⏹ Detener' : '🎤 Dictar'}
        </button>
        <button onClick={toggleExtendido} style={{
          flex: 1, padding: '14px', borderRadius: '8px', border: 'none',
          background: dictando && modoExtendido ? '#ff4444' : '#2A5A4A',
          color: '#F5F1E8', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer'
        }}>
          {dictando && modoExtendido ? '⏹ Detener' : '🎙 Grabar sermón'}
        </button>
      </div>
    </div>
  )
}
