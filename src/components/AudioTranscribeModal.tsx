import React, { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

interface AudioTranscribeModalProps {
  onClose: () => void
  onInsertText?: (text: string) => void
  onCrearNuevaSeccion?: (titulo: string, contenido: string) => void
  onCrearProyectoConTexto?: (titulo: string, tipo: string, contenido: string) => void
  contexto?: 'editor' | 'proyectos'
}

export const AudioTranscribeModal: React.FC<AudioTranscribeModalProps> = ({
  onClose,
  onInsertText,
  onCrearNuevaSeccion,
  onCrearProyectoConTexto,
  contexto = 'editor'
}) => {
  const [modo, setModo] = useState<'microfono' | 'archivo'>('microfono')
  
  // Estados de grabación
  const [grabando, setGrabando] = useState(false)
  const [enPausa, setEnPausa] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioMime, setAudioMime] = useState<string>('audio/webm')
  
  // Archivo subido
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [tamanoArchivo, setTamanoArchivo] = useState<string | null>(null)

  // Estados de transcripción
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [textoTranscrito, setTextoTranscrito] = useState<string>('')
  const [advertencia, setAdvertencia] = useState<string | null>(null)
  
  // Referencias para MediaRecorder y visualizador
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      detenerGrabacionRecursos()
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [])

  function detenerGrabacionRecursos() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }

  // Iniciar temporizador
  const iniciarTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setSegundos((prev) => prev + 1)
    }, 1000)
  }

  const pausarTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
  }

  // Dibujar visualizador de audio en tiempo real
  function iniciarVisualizador(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      const canvas = canvasRef.current
      if (!canvas) return
      const canvasCtx = canvas.getContext('2d')
      if (!canvasCtx) return

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const dibujar = () => {
        if (!analyserRef.current) return
        animationFrameRef.current = requestAnimationFrame(dibujar)

        analyserRef.current.getByteFrequencyData(dataArray)

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
        
        const barWidth = (canvas.width / bufferLength) * 1.5
        let x = 0

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.9

          const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0)
          gradient.addColorStop(0, '#DFBE72')
          gradient.addColorStop(1, '#4AE098')

          canvasCtx.fillStyle = gradient
          canvasCtx.fillRect(x, canvas.height - Math.max(3, barHeight), barWidth - 1, Math.max(3, barHeight))

          x += barWidth + 1
        }
      }

      dibujar()
    } catch (e) {
      console.warn('Visualizador no disponible:', e)
    }
  }

  // 1. Iniciar Grabación con Micrófono
  async function handleIniciarGrabacion() {
    setAudioBlob(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setTextoTranscrito('')
    setAdvertencia(null)
    setSegundos(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Determinar MIME type compatible
      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      } else if (MediaRecorder.isTypeSupported('audio/aac')) {
        mimeType = 'audio/aac'
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg'
      }
      setAudioMime(mimeType)

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        detenerGrabacionRecursos()
      }

      recorder.start(500)
      setGrabando(true)
      setEnPausa(false)
      iniciarTimer()
      iniciarVisualizador(stream)
      toast.success('Micrófono activado. Habla con claridad.', { id: 'mic-toast', duration: 2500 })
    } catch (err: any) {
      console.error('Error accediendo al micrófono:', err)
      toast.error('No se pudo acceder al micrófono. Verifica los permisos.')
    }
  }

  // Pausar / Reanudar
  function handlePausarReanudar() {
    if (!mediaRecorderRef.current) return
    if (enPausa) {
      mediaRecorderRef.current.resume()
      setEnPausa(false)
      iniciarTimer()
    } else {
      mediaRecorderRef.current.pause()
      setEnPausa(true)
      pausarTimer()
    }
  }

  // Detener Grabación
  function handleDetenerGrabacion() {
    if (mediaRecorderRef.current && grabando) {
      mediaRecorderRef.current.stop()
      setGrabando(false)
      setEnPausa(false)
      pausarTimer()
    }
  }

  // Cancelar Grabación
  function handleCancelarGrabacion() {
    if (mediaRecorderRef.current && grabando) {
      mediaRecorderRef.current.stop()
    }
    detenerGrabacionRecursos()
    setGrabando(false)
    setEnPausa(false)
    setSegundos(0)
    setAudioBlob(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    toast('Grabación cancelada')
  }

  // 2. Manejo de Archivo de Audio Subido
  function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|aac|ogg|webm|opus|flac)$/i)) {
      toast.error('Por favor selecciona un archivo de audio válido')
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande (máximo 25 MB)')
      return
    }

    setNombreArchivo(file.name)
    setTamanoArchivo((file.size / (1024 * 1024)).toFixed(2) + ' MB')
    setAudioBlob(file)
    setAudioMime(file.type || 'audio/mp3')
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(URL.createObjectURL(file))
    setTextoTranscrito('')
    setAdvertencia(null)
  }

  // Convertir Blob a Base64
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        resolve(base64String)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  // 3. Transcribir Audio con Gemini 3.5 Transcribe
  async function handleTranscribirAudio() {
    if (!audioBlob) {
      toast.error('No hay ninguna grabación o archivo de audio disponible.')
      return
    }

    setTranscribiendo(true)
    setAdvertencia(null)
    const toastId = toast.loading('Transcribiendo con gemini-3.5-transcribe...', { id: 'transcribe-toast' })

    try {
      const base64Data = await blobToBase64(audioBlob)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio: base64Data,
          mimeType: audioMime || 'audio/webm',
          prompt:
            'Transcribe el siguiente audio en español con la más alta fidelidad. Conserva citas bíblicas, puntuación correcta, nombres propios, versículos y la estructura oratoria de párrafos.'
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al procesar la transcripción.')
      }

      if (data.warning) {
        setAdvertencia(data.warning)
      }

      const texto = data.text || ''
      setTextoTranscrito(texto)

      if (texto) {
        toast.success('¡Transcripción completada con éxito!', { id: toastId })
      } else {
        toast('No se reconoció voz clara en el audio.', { id: toastId, icon: '⚠️' })
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error al comunicarse con el servicio de transcripción.', { id: toastId })
    } finally {
      setTranscribiendo(false)
    }
  }

  // Acciones con el texto
  function handleCopiarTexto() {
    if (!textoTranscrito) return
    navigator.clipboard.writeText(textoTranscrito)
    toast.success('Texto copiado al portapapeles', { icon: '📋' })
  }

  function handleInsertarEnEditor() {
    if (!textoTranscrito) return
    if (onInsertText) {
      onInsertText(textoTranscrito)
      toast.success('Texto insertado en la sección')
      onClose()
    }
  }

  function handleCrearSeccion() {
    if (!textoTranscrito) return
    if (onCrearNuevaSeccion) {
      const primerRenglon = textoTranscrito.split('\n')[0].replace(/<[^>]*>/g, '').trim()
      const tituloSugerido = primerRenglon.slice(0, 35) || 'Nueva Sección'
      onCrearNuevaSeccion(tituloSugerido, textoTranscrito)
      toast.success('Nueva sección creada con la transcripción')
      onClose()
    }
  }

  function handleCrearProyecto() {
    if (!textoTranscrito) return
    if (onCrearProyectoConTexto) {
      const primerRenglon = textoTranscrito.split('\n')[0].replace(/<[^>]*>/g, '').trim()
      const tituloSugerido = primerRenglon.slice(0, 40) || 'Mensaje de Voz'
      onCrearProyectoConTexto(tituloSugerido, 'Sermón', textoTranscrito)
      toast.success('Proyecto creado con el sermón transcrito')
      onClose()
    }
  }

  // Formato mm:ss
  const formatTiempo = (totalSegundos: number) => {
    const mins = Math.floor(totalSegundos / 60)
    const secs = totalSegundos % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(8, 20, 28, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        zIndex: 160
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
          maxWidth: '580px',
          maxHeight: '94vh',
          maxHeight: '94dvh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.75)',
          overflow: 'hidden'
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(16, 36, 47, 0.95)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.3) 0%, rgba(30, 61, 79, 0.9) 100%)',
                border: '1px solid #C9A24A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '17px'
              }}
            >
              🎙️
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  color: '#DFBE72',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '15.5px',
                  fontWeight: 700,
                  lineHeight: 1.2
                }}
              >
                Transcripción de Audio con IA
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span style={{ fontSize: '10px', color: '#9BB0BD' }}>Modelo:</span>
                <span
                  style={{
                    fontSize: '9.5px',
                    color: '#4AE098',
                    background: 'rgba(74, 224, 152, 0.15)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}
                >
                  gemini-3.5-transcribe
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal de transcripción"
            style={{
              background: 'none',
              border: 'none',
              color: '#8E9EA7',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Pestañas: Grabar con Micrófono vs Subir Archivo */}
        {!textoTranscrito && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: '#122834',
              borderBottom: '1px solid rgba(201, 162, 74, 0.2)',
              padding: '4px 8px',
              gap: '6px'
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!grabando) setModo('microfono')
              }}
              style={{
                padding: '8px 6px',
                background:
                  modo === 'microfono'
                    ? 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(30, 61, 79, 0.8) 100%)'
                    : 'transparent',
                border: 'none',
                borderBottom: modo === 'microfono' ? '2px solid #C9A24A' : '2px solid transparent',
                borderRadius: '6px 6px 0 0',
                color: modo === 'microfono' ? '#DFBE72' : '#8E9EA7',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: "'Cinzel', serif",
                cursor: grabando ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <span>🎤</span>
              <span>Grabar Micrófono</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!grabando) setModo('archivo')
              }}
              style={{
                padding: '8px 6px',
                background:
                  modo === 'archivo'
                    ? 'linear-gradient(135deg, rgba(201, 162, 74, 0.25) 0%, rgba(30, 61, 79, 0.8) 100%)'
                    : 'transparent',
                border: 'none',
                borderBottom: modo === 'archivo' ? '2px solid #C9A24A' : '2px solid transparent',
                borderRadius: '6px 6px 0 0',
                color: modo === 'archivo' ? '#DFBE72' : '#8E9EA7',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: "'Cinzel', serif",
                cursor: grabando ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <span>📁</span>
              <span>Subir Audio (.mp3, .m4a, .wav)</span>
            </button>
          </div>
        )}

        {/* Contenido Principal */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* SI YA TENEMOS LA TRANSCRIPCIÓN */}
          {textoTranscrito ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(74, 224, 152, 0.12)',
                  border: '1px solid rgba(74, 224, 152, 0.35)',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#4AE098', fontSize: '14px' }}>✓</span>
                  <span style={{ color: '#E0F2E9', fontSize: '12px', fontWeight: 600 }}>
                    Transcripción Generada ({textoTranscrito.split(/\s+/).filter(Boolean).length} palabras)
                  </span>
                </div>
                <button
                  onClick={handleCopiarTexto}
                  style={{
                    background: 'rgba(201, 162, 74, 0.2)',
                    border: '1px solid #C9A24A',
                    color: '#DFBE72',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Copiar
                </button>
              </div>

              {advertencia && (
                <div
                  style={{
                    background: 'rgba(229, 72, 77, 0.15)',
                    border: '1px solid rgba(229, 72, 77, 0.4)',
                    color: '#FFB4B6',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '11px'
                  }}
                >
                  ⚠️ {advertencia}
                </div>
              )}

              {/* Área de texto editable */}
              <div>
                <label
                  style={{
                    display: 'block',
                    color: '#DFBE72',
                    fontSize: '11px',
                    fontWeight: 600,
                    marginBottom: '4px'
                  }}
                >
                  Texto Transcrito (puedes editar antes de insertar):
                </label>
                <textarea
                  value={textoTranscrito}
                  onChange={(e) => setTextoTranscrito(e.target.value)}
                  rows={8}
                  style={{
                    width: '100%',
                    background: '#122834',
                    border: '1px solid rgba(201, 162, 74, 0.35)',
                    borderRadius: '8px',
                    color: '#F5F1E8',
                    padding: '10px',
                    fontSize: '13.5px',
                    lineHeight: 1.5,
                    fontFamily: "'Inter', sans-serif",
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Botón para volver a grabar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setTextoTranscrito('')
                    setAudioBlob(null)
                    if (audioUrl) URL.revokeObjectURL(audioUrl)
                    setAudioUrl(null)
                    setNombreArchivo(null)
                    setSegundos(0)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9BB0BD',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  ↺ Grabar o subir otro audio
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* MODO 1: MICRÓFONO */}
              {modo === 'microfono' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '10px 0'
                  }}
                >
                  {/* Visualizador de Onda & Temporizador */}
                  <div
                    style={{
                      width: '100%',
                      background: '#122834',
                      border: `1px solid ${grabando ? '#C9A24A' : 'rgba(201, 162, 74, 0.2)'}`,
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      boxShadow: grabando ? '0 0 16px rgba(201, 162, 74, 0.2)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div
                      style={{
                        fontSize: '32px',
                        fontFamily: "'Cinzel', serif",
                        fontWeight: 700,
                        color: grabando ? (enPausa ? '#E59866' : '#4AE098') : '#DFBE72',
                        letterSpacing: '2px',
                        marginBottom: '8px'
                      }}
                    >
                      {formatTiempo(segundos)}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#9BB0BD', marginBottom: '10px' }}>
                      {grabando
                        ? enPausa
                          ? '⏸️ Grabación en pausa'
                          : '🔴 Grabando voz... Habla a tu ritmo'
                        : audioBlob
                        ? '✓ Grabación lista para transcribir'
                        : 'Presiona el botón para comenzar'}
                    </div>

                    {/* Canvas de Ondas de Audio */}
                    <canvas
                      ref={canvasRef}
                      width={280}
                      height={40}
                      style={{
                        width: '100%',
                        maxWidth: '280px',
                        height: '40px',
                        background: 'rgba(16, 36, 47, 0.6)',
                        borderRadius: '6px',
                        display: grabando && !enPausa ? 'block' : 'none'
                      }}
                    />

                    {/* Reproductor de audio grabado para verificación */}
                    {audioUrl && !grabando && (
                      <div style={{ width: '100%', marginTop: '8px' }}>
                        <audio src={audioUrl} controls style={{ width: '100%', height: '36px' }} />
                      </div>
                    )}
                  </div>

                  {/* Controles de Grabación */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                    {!grabando ? (
                      <button
                        type="button"
                        onClick={handleIniciarGrabacion}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                          color: '#122834',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '13.5px',
                          fontFamily: "'Cinzel', serif",
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 12px rgba(201, 162, 74, 0.3)'
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>🎙️</span>
                        <span>{audioBlob ? 'Grabar de Nuevo' : 'Comenzar a Grabar'}</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handlePausarReanudar}
                          style={{
                            flex: 1,
                            padding: '11px',
                            background: '#1E3D4F',
                            border: '1px solid #C9A24A',
                            color: '#DFBE72',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>{enPausa ? '▶️' : '⏸️'}</span>
                          <span>{enPausa ? 'Reanudar' : 'Pausar'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleDetenerGrabacion}
                          style={{
                            flex: 1.5,
                            padding: '11px',
                            background: '#E5484D',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            boxShadow: '0 0 14px rgba(229, 72, 77, 0.4)'
                          }}
                        >
                          <span>⏹</span>
                          <span>Detener y Guardar</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleCancelarGrabacion}
                          style={{
                            padding: '11px',
                            background: 'transparent',
                            border: '1px solid rgba(229, 72, 77, 0.3)',
                            color: '#FF8588',
                            borderRadius: '8px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          title="Cancelar grabación"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* MODO 2: ARCHIVO DE AUDIO */}
              {modo === 'archivo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed rgba(201, 162, 74, 0.35)',
                      borderRadius: '12px',
                      padding: '24px 16px',
                      background: 'rgba(18, 40, 52, 0.6)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files?.[0]
                      if (file) {
                        handleArchivoSeleccionado({ target: { files: [file] } } as any)
                      }
                    }}
                  >
                    <div style={{ fontSize: '28px', marginBottom: '6px' }}>📁</div>
                    <div
                      style={{
                        color: '#F5F1E8',
                        fontSize: '13px',
                        fontWeight: 600,
                        fontFamily: "'Cinzel', serif"
                      }}
                    >
                      {nombreArchivo ? nombreArchivo : 'Haz clic o arrastra tu archivo de audio'}
                    </div>
                    <p style={{ color: '#8E9EA7', fontSize: '11px', margin: '4px 0 0 0' }}>
                      {tamanoArchivo ? `Tamaño: ${tamanoArchivo}` : 'Formatos soportados: MP3, M4A, WAV, AAC, OGG, WEBM (hasta 25 MB)'}
                    </p>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.webm,.opus,.flac"
                      onChange={handleArchivoSeleccionado}
                      style={{ display: 'none' }}
                    />
                  </div>

                  {audioUrl && (
                    <div style={{ background: '#122834', padding: '10px', borderRadius: '8px' }}>
                      <label style={{ display: 'block', color: '#DFBE72', fontSize: '11px', marginBottom: '6px', fontWeight: 600 }}>
                        Escuchar archivo cargado:
                      </label>
                      <audio src={audioUrl} controls style={{ width: '100%', height: '36px' }} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Información del Modelo */}
          <div
            style={{
              background: 'rgba(201, 162, 74, 0.08)',
              border: '1px solid rgba(201, 162, 74, 0.2)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '11px',
              color: '#DFBE72',
              lineHeight: 1.4
            }}
          >
            💡 <strong>Precisión Ministerial:</strong> La IA de <code>gemini-3.5-transcribe</code> transcribe tu voz identificando versículos bíblicos, terminología apostólica y puntuación de sermón.
          </div>
        </div>

        {/* Pie del Modal con Botones Principales */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(201, 162, 74, 0.25)',
            background: 'rgba(16, 36, 47, 0.98)',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              minWidth: '90px',
              padding: '11px',
              background: '#142C38',
              border: '1px solid #2E4B5E',
              color: '#9BB0BD',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>

          {/* Si aún no está transcrito y tenemos audio listo */}
          {!textoTranscrito && (
            <button
              type="button"
              disabled={!audioBlob || grabando || transcribiendo}
              onClick={handleTranscribirAudio}
              style={{
                flex: 2,
                minWidth: '180px',
                padding: '11px 14px',
                background:
                  !audioBlob || grabando || transcribiendo
                    ? '#2A4354'
                    : 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                color: !audioBlob || grabando || transcribiendo ? '#738794' : '#122834',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12.5px',
                fontFamily: "'Cinzel', serif",
                cursor: !audioBlob || grabando || transcribiendo ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: audioBlob && !grabando && !transcribiendo ? '0 4px 12px rgba(201, 162, 74, 0.3)' : 'none'
              }}
            >
              <span>{transcribiendo ? '⏳' : '✨'}</span>
              <span>{transcribiendo ? 'Transcribiendo con Gemini...' : 'Transcribir Audio'}</span>
            </button>
          )}

          {/* Opciones cuando ya tenemos texto transcrito */}
          {textoTranscrito && (
            <>
              {contexto === 'editor' && onInsertText && (
                <button
                  type="button"
                  onClick={handleInsertarEnEditor}
                  style={{
                    flex: 1.5,
                    padding: '11px 12px',
                    background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                    color: '#122834',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '12px',
                    fontFamily: "'Cinzel', serif",
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span>📝</span>
                  <span>Insertar en Sección</span>
                </button>
              )}

              {contexto === 'editor' && onCrearNuevaSeccion && (
                <button
                  type="button"
                  onClick={handleCrearSeccion}
                  style={{
                    flex: 1.5,
                    padding: '11px 12px',
                    background: 'linear-gradient(135deg, #4AE098 0%, #30A46C 100%)',
                    color: '#0D2318',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '12px',
                    fontFamily: "'Cinzel', serif",
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span>➕</span>
                  <span>Nueva Sección</span>
                </button>
              )}

              {onCrearProyectoConTexto && (
                <button
                  type="button"
                  onClick={handleCrearProyecto}
                  style={{
                    flex: 1.5,
                    padding: '11px 12px',
                    background: 'linear-gradient(135deg, #4AE098 0%, #30A46C 100%)',
                    color: '#0D2318',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '12px',
                    fontFamily: "'Cinzel', serif",
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span>📖</span>
                  <span>Crear Nuevo Proyecto</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
