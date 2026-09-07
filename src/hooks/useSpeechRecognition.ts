/**
 * useSpeechRecognition
 * Hook unificado para LemWriter Móvil.
 *
 * - En APK (Capacitor nativo): usa @capacitor-community/speech-recognition
 * - En web / PWA (Cloudflare): usa la Web Speech API del navegador
 *
 * Modos:
 *   - "short"    → sesión única (botón Dictado)
 *   - "extended" → sesiones encadenadas sin límite de tiempo (botón Extendido)
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export type SpeechMode = 'short' | 'extended'
export type SpeechStatus = 'idle' | 'listening' | 'paused' | 'error'

export interface SpeechResult {
  transcript: string
  partial: string
  isFinal: boolean
}

export interface UseSpeechRecognitionOptions {
  language?: string
  mode?: SpeechMode
  onResult: (result: SpeechResult) => void
  onError?: (error: string) => void
  onStatusChange?: (status: SpeechStatus) => void
}

export interface UseSpeechRecognitionReturn {
  status: SpeechStatus
  start: () => Promise<void>
  stop: () => Promise<void>
  toggle: () => Promise<void>
}

const isNative = () => Capacitor.isNativePlatform()

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn {
  const {
    language = 'es-MX',
    mode = 'short',
    onResult,
    onError,
    onStatusChange,
  } = options

  const [status, setStatus] = useState<SpeechStatus>('idle')
  const transcriptRef = useRef<string>('')
  const activeRef = useRef<boolean>(false)

  const updateStatus = useCallback(
    (s: SpeechStatus) => {
      setStatus(s)
      onStatusChange?.(s)
    },
    [onStatusChange]
  )

  const resetTranscript = () => { transcriptRef.current = '' }

  // ── Implementación nativa (Capacitor Android) ──────────────────────────────

  const startNative = useCallback(async () => {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition')
    const { speechRecognition } = await SpeechRecognition.requestPermissions()
    if (speechRecognition !== 'granted') {
      updateStatus('error')
      onError?.('Permiso de micrófono denegado')
      return
    }

    activeRef.current = true
    updateStatus('listening')

    const runSession = async () => {
      if (!activeRef.current) return

      await SpeechRecognition.start({ language, partialResults: true, popup: false })

      SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
        const partial = data.matches?.[0] ?? ''
        onResult({ transcript: transcriptRef.current + partial, partial, isFinal: false })
      })

      SpeechRecognition.addListener('listeningState', async (data: { status: string }) => {
        if (data.status === 'stopped') {
          if (mode === 'extended' && activeRef.current) {
            await new Promise(r => setTimeout(r, 300))
            runSession()
          } else if (!activeRef.current) {
            updateStatus('idle')
          }
        }
      })
    }

    await runSession()
  }, [language, mode, onResult, onError, updateStatus])

  const stopNative = useCallback(async () => {
    activeRef.current = false
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition')
    await SpeechRecognition.stop()
    await SpeechRecognition.removeAllListeners()
    resetTranscript()
    updateStatus('idle')
  }, [updateStatus])

  // ── Implementación web (Web Speech API) ────────────────────────────────────

  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const startWeb = useCallback(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      updateStatus('error')
      onError?.('El navegador no soporta reconocimiento de voz')
      return
    }

    activeRef.current = true
    updateStatus('listening')

    const startSession = () => {
      if (!activeRef.current) return

      const recognition = new SpeechRecognitionAPI()
      recognitionRef.current = recognition
      recognition.lang = language
      recognition.continuous = mode !== 'short'
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let partial = ''
        let sessionFinal = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) sessionFinal += result[0].transcript
          else partial += result[0].transcript
        }
        if (sessionFinal) transcriptRef.current += sessionFinal
        onResult({ transcript: transcriptRef.current + partial, partial, isFinal: !!sessionFinal })
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech' && mode === 'extended' && activeRef.current) return
        if (event.error !== 'aborted') {
          updateStatus('error')
          onError?.(event.error)
        }
      }

      recognition.onend = () => {
        if (mode === 'extended' && activeRef.current) setTimeout(startSession, 200)
        else if (!activeRef.current) updateStatus('idle')
      }

      recognition.start()
    }

    startSession()
  }, [language, mode, onResult, onError, updateStatus])

  const stopWeb = useCallback(() => {
    activeRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    resetTranscript()
    updateStatus('idle')
  }, [updateStatus])

  // ── API pública ────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (status === 'listening') return
    resetTranscript()
    if (isNative()) await startNative()
    else startWeb()
  }, [status, startNative, startWeb])

  const stop = useCallback(async () => {
    if (status === 'idle') return
    if (isNative()) await stopNative()
    else stopWeb()
  }, [status, stopNative, stopWeb])

  const toggle = useCallback(async () => {
    if (status === 'listening') await stop()
    else await start()
  }, [status, start, stop])

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (!isNative()) recognitionRef.current?.abort()
    }
  }, [])

  return { status, start, stop, toggle }
}
