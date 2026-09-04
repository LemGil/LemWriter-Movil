import { useRef, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export function useDictado(onResult: (text: string) => void, onStop?: () => void) {
  const [dictando, setDictando] = useState(false);
  const [modoExtendido, setModoExtendido] = useState(false);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  function iniciarReconocimiento(extendido = false) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('El navegador no soporta el grabador de voz');
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'es-MX';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e: any) => {
      const nuevasPalabras = Array.from(e.results)
        .slice(e.resultIndex)
        .map((r: any) => r[0].transcript)
        .join(' ');
      onResultRef.current?.(nuevasPalabras);
    };

    rec.onend = () => {
      if (extendido && recognitionRef.current === rec) {
        try {
          rec.start();
        } catch (e) {}
      } else {
        setDictando(false);
        setModoExtendido(false);
        onStopRef.current?.();
      }
    };

    rec.start();
    recognitionRef.current = rec;
  }

  function toggleDictado() {
    if (dictando) {
      if (recognitionRef.current) recognitionRef.current.stop();
      recognitionRef.current = null;
      setDictando(false);
      setModoExtendido(false);
      return;
    }
    setDictando(true);
    setModoExtendido(false);
    iniciarReconocimiento(false);
  }

  function toggleExtendido() {
    if (dictando && modoExtendido) {
      if (recognitionRef.current) recognitionRef.current.stop();
      recognitionRef.current = null;
      setDictando(false);
      setModoExtendido(false);
      return;
    }
    setDictando(true);
    setModoExtendido(true);
    iniciarReconocimiento(true);
  }

  return { dictando, modoExtendido, toggleDictado, toggleExtendido };
}

