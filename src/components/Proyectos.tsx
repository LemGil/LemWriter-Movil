import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const TIPO_ICONS: Record<string, string> = {
  sermon: '🎤', ensenanza: '📖', devocional: '🕊️',
  libro: '📚', video: '🎬', estudio: '🔬'
}

interface Proyecto {
  id: string
  title: string
  type: string
  updated_at: string
}

interface ProyectosProps {
  onSelect: (p: Proyecto) => void
}

export default function Proyectos({ onSelect }: ProyectosProps) {
  const [busqueda, setBusqueda] = useState('')

  const { data: proyectos = [], isLoading: loading } = useQuery({
    queryKey: ['proyectos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lw_proyectos')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as Proyecto[]
    }
  })

  const filtrados = proyectos.filter(p =>
    p.title?.toLowerCase().includes(busqueda.toLowerCase())
  )

  if (loading) return (
    <div style={{ padding: 20, color: '#C9A24A', textAlign: 'center' }}>Cargando proyectos...</div>
  )

  return (
    <div style={{ padding: '16px' }}>
      <input
        placeholder="🔍 Buscar proyecto..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        style={{
          width: '100%', padding: '12px', marginBottom: '16px',
          background: '#1E3D4F', border: '1px solid #444', borderRadius: '8px',
          color: '#F5F1E8', fontSize: '16px', boxSizing: 'border-box'
        }}
      />
      {filtrados.map(p => (
        <div key={p.id} onClick={() => onSelect(p)}
          style={{
            background: '#1E3D4F', border: '1px solid #333',
            borderRadius: '8px', padding: '16px', marginBottom: '12px',
            cursor: 'pointer', borderLeft: '3px solid #C9A24A'
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{TIPO_ICONS[p.type] || '📝'}</span>
            <div>
              <div style={{ color: '#F5F1E8', fontWeight: 'bold', fontSize: '15px' }}>{p.title}</div>
              <div style={{ color: '#888', fontSize: '12px', marginTop: 2 }}>{p.type} · {new Date(p.updated_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      ))}
      {filtrados.length === 0 && (
        <p style={{ color: '#666', textAlign: 'center', marginTop: 40 }}>No hay proyectos</p>
      )}
    </div>
  )
}
