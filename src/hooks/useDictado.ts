import { useRef, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';

export function useDictado(
  onResult: (text: string) => void,
  onStop?: () => void,
  promptHint?: string
) {
  const [dictando, setDictando] = useState(false);
  const [modoExtendido, setModoExtendido] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [tiempoGrabacion, setTiempoGrabacion] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const modoActualRef = useRef<'dictado' | 'extendido'>('dictado');
  const activeNativeRef = useRef<boolean>(false);
  const dictandoActivoRef = useRef<boolean>(false);
  const interimTranscriptRef = useRef<string>('');

  const onResultRef = useRef(onResult);
  const onStopRef = useRef(onStop);
  const promptHintRef = useRef(promptHint);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  useEffect(() => {
    promptHintRef.current = promptHint;
  }, [promptHint]);

  // Helper para convertir Blob a Base64 sin prefijo data URL
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Detener todos los recursos de audio y animación
  const liberarRecursos = useCallback(() => {
    dictandoActivoRef.current = false;
    interimTranscriptRef.current = '';

    if (Capacitor.isNativePlatform()) {
      activeNativeRef.current = false;
      import('@capacitor-community/speech-recognition').then(({ SpeechRecognition }) => {
        SpeechRecognition.stop().catch(() => {});
        SpeechRecognition.removeAllListeners().catch(() => {});
      }).catch(() => {});
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (e) {}
      });
      audioStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch (e) {}
      audioContextRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }

    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Cleanup al desmontar el hook
  useEffect(() => {
    return () => {
      liberarRecursos();
    };
  }, [liberarRecursos]);

  // Seleccionar MIME type de audio compatible con el navegador actual
  const obtenerMimeTypeCompatible = (): string => {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  // Iniciar reconocimiento de voz Web Speech API (Dictado directo sin Gemini)
  const iniciarWebSpeechDictado = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return false;

    try {
      const rec = new SpeechRec();
      rec.lang = 'es-MX';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      interimTranscriptRef.current = '';

      rec.onresult = (e: any) => {
        let textoFinal = '';
        let textoInterim = '';

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const trans = e.results[i][0]?.transcript || '';
          if (e.results[i].isFinal) {
            textoFinal += trans + ' ';
          } else {
            textoInterim += trans;
          }
        }

        if (textoFinal.trim()) {
          onResultRef.current?.(textoFinal.trim());
          interimTranscriptRef.current = '';
          setAudioLevel(75);
          setTimeout(() => setAudioLevel(20), 300);
        } else if (textoInterim.trim()) {
          interimTranscriptRef.current = textoInterim.trim();
          setAudioLevel(55);
        }
      };

      rec.onerror = (e: any) => {
        console.warn('Web Speech API aviso:', e?.error);
        if (e.error === 'not-allowed') {
          toast.error('Acceso al micrófono denegado en el navegador.');
          detenerGrabacion();
        } else if (e.error !== 'no-speech') {
          console.error('Error Web Speech:', e.error);
        }
      };

      rec.onend = () => {
        // Si el usuario aún no detuvo el dictado manualmente, reconectar
        if (dictandoActivoRef.current && modoActualRef.current === 'dictado') {
          try {
            rec.start();
          } catch {
            // Ya iniciado o detenido
          }
        }
      };

      rec.start();
      speechRecognitionRef.current = rec;
      dictandoActivoRef.current = true;
      setDictando(true);
      setModoExtendido(false);
      setTiempoGrabacion(0);

      // Temporizador de visualización
      timerIntervalRef.current = setInterval(() => {
        setTiempoGrabacion((prev) => prev + 1);
      }, 1000);

      toast('🎙️ Dictado en vivo iniciado. Habla cerca del micrófono.', {
        icon: '🎤',
        duration: 3000
      });

      return true;
    } catch (err) {
      console.warn('No se pudo inicializar Web Speech API:', err);
      return false;
    }
  };

  // Iniciar grabación física con MediaRecorder (Sermón Extendido o fallback sin Web Speech)
  const iniciarGrabacionMediaRecorder = async (esExtendido: boolean) => {
    audioChunksRef.current = [];

    // 1. Solicitar acceso al micrófono
    let stream: MediaStream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Tu navegador no permite captura de audio.');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioStreamRef.current = stream;
    } catch (err: any) {
      console.error('Error al acceder al micrófono:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Acceso al micrófono denegado. Permite el micrófono en tu navegador.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error('No se encontró ningún micrófono conectado.');
      } else {
        toast.error('No se pudo acceder al micrófono: ' + (err.message || 'Error'));
      }
      setDictando(false);
      setModoExtendido(false);
      return;
    }

    // 2. Iniciar vúmetro / analizador de nivel de audio
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const monitorLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 100) * 100)));
          animFrameRef.current = requestAnimationFrame(monitorLevel);
        };
        monitorLevel();
      }
    } catch (e) {
      console.warn('AudioContext no disponible para vúmetro:', e);
    }

    // 3. Iniciar MediaRecorder
    const mimeType = obtenerMimeTypeCompatible();
    let recorder: MediaRecorder;
    try {
      const options = mimeType ? { mimeType } : undefined;
      recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
    } catch (err: any) {
      console.error('Error al inicializar MediaRecorder:', err);
      toast.error('No se pudo iniciar el grabador de audio.');
      liberarRecursos();
      setDictando(false);
      setModoExtendido(false);
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      const modo = modoActualRef.current;
      const chunks = audioChunksRef.current;

      liberarRecursos();

      // Si no hay datos grabados suficientes
      if (chunks.length === 0) {
        setDictando(false);
        setModoExtendido(false);
        onStopRef.current?.();
        return;
      }

      const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });

      // Si el audio es extremadamente corto (< 0.8s) y no hay datos
      if (audioBlob.size < 1200) {
        setDictando(false);
        setModoExtendido(false);
        onStopRef.current?.();
        toast('Audio demasiado breve.', { icon: 'ℹ️' });
        return;
      }

      // Enviar a la API de transcripción con Gemini
      setTranscribiendo(true);
      const loadingToast = toast.loading(
        modo === 'extendido' ? 'Transcribiendo sermón con IA...' : 'Transcribiendo audio con IA...'
      );

      try {
        const base64Audio = await blobToBase64(audioBlob);

        const res = await fetch('/api/audio/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            audio: base64Audio,
            mimeType: audioBlob.type || 'audio/webm',
            mode: modo,
            promptHint: promptHintRef.current
          })
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || 'Error al transcribir el audio.');
        }

        const textoTranscrito = (data.text || '').trim();

        if (textoTranscrito.length > 0) {
          onResultRef.current?.(textoTranscrito);
          toast.success(
            modo === 'extendido' ? '¡Sermón transcrito e insertado!' : 'Dictado transcrito e insertado',
            { id: loadingToast }
          );
        } else {
          toast.dismiss(loadingToast);
          toast('No se detectaron palabras en la grabación.', { icon: 'ℹ️' });
        }
      } catch (err: any) {
        console.error('Error al transcribir audio con IA:', err);
        toast.error(err?.message || 'Error al transcribir audio.', { id: loadingToast });
      } finally {
        setTranscribiendo(false);
        setDictando(false);
        setModoExtendido(false);
        onStopRef.current?.();
      }
    };

    // Iniciar captura en trozos cada 1 segundo para asegurar datos
    try {
      recorder.start(1000);
      dictandoActivoRef.current = true;
      setDictando(true);
      setModoExtendido(esExtendido);
      setTiempoGrabacion(0);

      // Iniciar temporizador
      timerIntervalRef.current = setInterval(() => {
        setTiempoGrabacion((prev) => prev + 1);
      }, 1000);

      toast(
        esExtendido
          ? '🎙️ Grabando sermón continuo... Pulsa Detener al finalizar.'
          : '🎙️ Grabador de audio iniciado.',
        { icon: '🎤', duration: 3000 }
      );
    } catch (err: any) {
      console.error('Error al ejecutar recorder.start:', err);
      toast.error('No se pudo iniciar la grabación de audio.');
      liberarRecursos();
      setDictando(false);
      setModoExtendido(false);
    }
  };

  // Iniciar grabación general
  const iniciarGrabacion = async (esExtendido: boolean) => {
    modoActualRef.current = esExtendido ? 'extendido' : 'dictado';

    // ── 1. Manejo nativo para Capacitor (Android APK) ─────────────────────────
    if (Capacitor.isNativePlatform()) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const perm = await SpeechRecognition.requestPermissions();
        if (perm.speechRecognition !== 'granted') {
          toast.error('Permiso de micrófono denegado en LemWriter');
          setDictando(false);
          setModoExtendido(false);
          return;
        }

        activeNativeRef.current = true;
        dictandoActivoRef.current = true;
        setDictando(true);
        setModoExtendido(esExtendido);
        setTiempoGrabacion(0);

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setTiempoGrabacion((prev) => prev + 1);
          setAudioLevel(Math.floor(40 + Math.random() * 50));
        }, 1000);

        toast(
          esExtendido
            ? '🎙️ Grabando sermón continuo... Pulsa Extendido para detener.'
            : '🎙️ Dictado nativo iniciado. Habla cerca del micrófono.',
          { icon: '🎤', duration: 3000 }
        );

        let previousMatch = '';
        const runNativeSession = async () => {
          if (!activeNativeRef.current) return;
          try {
            await SpeechRecognition.start({ language: 'es-MX', partialResults: true, popup: false });
          } catch (err) {
            console.warn('Error iniciando SpeechRecognition nativo:', err);
          }
        };

        try {
          await SpeechRecognition.removeAllListeners();
        } catch {}

        SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
          const currentMatch = data.matches?.[0] ?? '';
          if (currentMatch && currentMatch !== previousMatch) {
            const delta = currentMatch.startsWith(previousMatch)
              ? currentMatch.slice(previousMatch.length).trim()
              : currentMatch.trim();
            if (delta) {
              onResultRef.current?.(delta);
            }
            previousMatch = currentMatch;
          }
        });

        SpeechRecognition.addListener('listeningState', async (data: { status: string }) => {
          if (data.status === 'stopped') {
            if (modoActualRef.current === 'extendido' && activeNativeRef.current) {
              previousMatch = '';
              await new Promise((r) => setTimeout(r, 300));
              if (activeNativeRef.current) {
                runNativeSession();
              }
            } else if (!activeNativeRef.current) {
              detenerGrabacion();
            }
          }
        });

        await runNativeSession();
        return;
      } catch (err: any) {
        console.error('Error al inicializar SpeechRecognition nativo:', err);
        toast.error('Error al iniciar dictado nativo');
        setDictando(false);
        setModoExtendido(false);
        return;
      }
    }

    // ── 2. Modo Dictado en Web (Web Speech API en vivo y directo) ─────────────
    if (!esExtendido) {
      const iniciado = iniciarWebSpeechDictado();
      if (iniciado) {
        return; // Éxito con Web Speech API directa
      }
      // Si el navegador no soporta Web Speech API (ej. Firefox), continúa abajo con fallback MediaRecorder
    }

    // ── 3. Modo Extendido en Web (o Fallback sin Web Speech API) ─────────────
    await iniciarGrabacionMediaRecorder(esExtendido);
  };

  // Detener la grabación activa
  const detenerGrabacion = () => {
    dictandoActivoRef.current = false;

    // En Capacitor Android
    if (Capacitor.isNativePlatform()) {
      activeNativeRef.current = false;
      import('@capacitor-community/speech-recognition').then(({ SpeechRecognition }) => {
        SpeechRecognition.stop().catch(() => {});
        SpeechRecognition.removeAllListeners().catch(() => {});
      }).catch(() => {});
      liberarRecursos();
      setDictando(false);
      setModoExtendido(false);
      onStopRef.current?.();
      toast.success('Dictado completado');
      return;
    }

    // En Web: Si estábamos en modo Dictado directo con Web Speech API
    if (modoActualRef.current === 'dictado' && speechRecognitionRef.current) {
      // Si había algún fragmento parcial pendiente, insertarlo antes de cerrar
      if (interimTranscriptRef.current.trim()) {
        onResultRef.current?.(interimTranscriptRef.current.trim());
        interimTranscriptRef.current = '';
      }

      liberarRecursos();
      setDictando(false);
      setModoExtendido(false);
      onStopRef.current?.();
      toast.success('Dictado completado');
      return;
    }

    // En Web: Si estábamos grabando audio continuo con MediaRecorder (Modo Extendido)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        liberarRecursos();
        setDictando(false);
        setModoExtendido(false);
      }
    } else {
      liberarRecursos();
      setDictando(false);
      setModoExtendido(false);
    }
  };

  const toggleDictado = () => {
    if (dictando) {
      detenerGrabacion();
      return;
    }
    iniciarGrabacion(false);
  };

  const toggleExtendido = () => {
    if (dictando) {
      detenerGrabacion();
      return;
    }
    iniciarGrabacion(true);
  };

  return {
    dictando,
    modoExtendido,
    transcribiendo,
    tiempoGrabacion,
    audioLevel,
    toggleDictado,
    toggleExtendido,
    detenerTodo: detenerGrabacion
  };
}
