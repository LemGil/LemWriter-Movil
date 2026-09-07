import { useRef, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

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
  const webSpeechResultadosRef = useRef<string[]>([]);
  const modoActualRef = useRef<'dictado' | 'extendido'>('dictado');

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
        speechRecognitionRef.current.abort();
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

  // Iniciar grabación real de micrófono con fallback a Web Speech y Gemini
  const iniciarGrabacion = async (esExtendido: boolean) => {
    modoActualRef.current = esExtendido ? 'extendido' : 'dictado';
    webSpeechResultadosRef.current = [];
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
      const tuvoTranscripcionEnVivo = webSpeechResultadosRef.current.length > 0;

      liberarRecursos();

      // Si fue dictado corto y ya se transcribió en vivo mediante Web Speech API
      if (modo === 'dictado' && tuvoTranscripcionEnVivo) {
        setDictando(false);
        setModoExtendido(false);
        onStopRef.current?.();
        toast.success('Dictado completado');
        return;
      }

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

    // 4. Iniciar SpeechRecognition como motor complementario de tiempo real en dictado
    if (!esExtendido) {
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          const rec = new SpeechRec();
          rec.lang = 'es-MX';
          rec.continuous = true;
          rec.interimResults = false;

          rec.onresult = (e: any) => {
            let palabras = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) {
                palabras += e.results[i][0].transcript + ' ';
              }
            }
            if (palabras.trim()) {
              webSpeechResultadosRef.current.push(palabras.trim());
              onResultRef.current?.(palabras.trim());
            }
          };

          rec.onerror = (e: any) => {
            console.warn('SpeechRecognition aviso (gestionado por grabador de audio Gemini):', e?.error);
          };

          rec.start();
          speechRecognitionRef.current = rec;
        }
      } catch (e) {
        console.warn('SpeechRecognition no se pudo activar:', e);
      }
    }

    // Iniciar captura en trozos cada 1 segundo para asegurar datos
    try {
      recorder.start(1000);
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
          : '🎙️ Dictado en vivo iniciado. Habla cerca del micrófono.',
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

  // Detener la grabación activa
  const detenerGrabacion = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
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
