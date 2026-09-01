import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

export function useDictado(onResult: (text: string) => void, onStop?: () => void) {
  const [dictando, setDictando] = useState(false);
  const [modoExtendido, setModoExtendido] = useState(false);
  const recognitionRef = useRef<any>(null);

  function iniciarReconocimiento(extendido = false) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Navegador no soporta dictado');
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
      onResult(nuevasPalabras);
    };

    rec.onend = () => {
      if (extendido && recognitionRef.current === rec) {
        try {
          rec.start();
        } catch (e) {}
      } else {
        setDictando(false);
        setModoExtendido(false);
        if (onStop) onStop();
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

