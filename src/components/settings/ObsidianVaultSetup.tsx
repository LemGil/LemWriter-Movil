// src/components/settings/ObsidianVaultSetup.tsx
//
// Sección de Configuración para conectar/desconectar el vault de Obsidian.
// Montar este componente dentro de la pantalla de Configuración existente.

import { useEffect, useState } from 'react';
import {
  getVaultStatus,
  isFileSystemAccessSupported,
  requestAndSaveVaultFolder,
} from '../../services/obsidianFsService';

type VaultStatus = 'checking' | 'connected' | 'disconnected' | 'unsupported';

export function ObsidianVaultSetup() {
  const [status, setStatus] = useState<VaultStatus>('checking');

  // Verificar estado al montar — ¿ya hay carpeta autorizada?
  useEffect(() => {
    if (!isFileSystemAccessSupported()) {
      setStatus('unsupported');
      return;
    }
    getVaultStatus().then(s => setStatus(s));
  }, []);

  const handleConnect = async () => {
    const granted = await requestAndSaveVaultFolder();
    if (granted) setStatus('connected');
    // Si el usuario canceló el picker (granted = false), no cambiar estado
  };

  // ── Render: estado cargando ────────────────────────────────────────────────
  if (status === 'checking') {
    return (
      <div className="obsidian-setup" style={{ padding: '12px 0' }}>
        <p className="obsidian-setup__checking" style={{ color: '#8E9EA7', fontSize: '13px', margin: 0 }}>
          Verificando conexión…
        </p>
      </div>
    );
  }

  // ── Render: browser no soportado ──────────────────────────────────────────
  if (status === 'unsupported') {
    return (
      <div className="obsidian-setup" style={{
        background: 'rgba(20, 43, 55, 0.6)',
        border: '1px solid rgba(201, 162, 74, 0.2)',
        borderRadius: '10px',
        padding: '14px'
      }}>
        <h3 className="obsidian-setup__title" style={{
          color: '#DFBE72',
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: '15px',
          fontWeight: 600,
          margin: '0 0 8px 0'
        }}>
          Exportación a Obsidian
        </h3>
        <p className="obsidian-setup__desc obsidian-setup__desc--warn" style={{
          color: '#D4A373',
          fontSize: '13px',
          lineHeight: '1.4',
          margin: 0
        }}>
          ⚠️ Tu navegador no soporta acceso al sistema de archivos. Usa{' '}
          <strong style={{ color: '#FFF' }}>Chrome o Edge en escritorio</strong> para activar esta función.
        </p>
      </div>
    );
  }

  // ── Render: conectado ─────────────────────────────────────────────────────
  if (status === 'connected') {
    return (
      <div className="obsidian-setup" style={{
        background: 'rgba(20, 43, 55, 0.6)',
        border: '1px solid rgba(46, 204, 113, 0.3)',
        borderRadius: '10px',
        padding: '14px'
      }}>
        <h3 className="obsidian-setup__title" style={{
          color: '#DFBE72',
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: '15px',
          fontWeight: 600,
          margin: '0 0 8px 0'
        }}>
          Exportación a Obsidian
        </h3>
        <p className="obsidian-setup__desc obsidian-setup__desc--ok" style={{
          color: '#2ECC71',
          fontSize: '13px',
          lineHeight: '1.4',
          margin: '0 0 12px 0'
        }}>
          ✅ Vault conectado. Cada autosave actualiza el archivo .md correspondiente
          en <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 5px', borderRadius: '4px', color: '#DFBE72' }}>MinisterioWiki/raw/</code>.
        </p>
        <button
          className="obsidian-setup__btn obsidian-setup__btn--secondary"
          onClick={handleConnect}
          style={{
            background: 'rgba(30, 61, 79, 0.8)',
            border: '1px solid rgba(201, 162, 74, 0.4)',
            color: '#DFBE72',
            padding: '7px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          Cambiar carpeta
        </button>
      </div>
    );
  }

  // ── Render: desconectado (default) ────────────────────────────────────────
  return (
    <div className="obsidian-setup" style={{
      background: 'rgba(20, 43, 55, 0.6)',
      border: '1px solid rgba(201, 162, 74, 0.25)',
      borderRadius: '10px',
      padding: '14px'
    }}>
      <h3 className="obsidian-setup__title" style={{
        color: '#DFBE72',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: '15px',
        fontWeight: 600,
        margin: '0 0 8px 0'
      }}>
        Exportación a Obsidian
      </h3>
      <p className="obsidian-setup__desc" style={{
        color: '#BDC7CC',
        fontSize: '13px',
        lineHeight: '1.4',
        margin: '0 0 12px 0'
      }}>
        Conecta la carpeta <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 5px', borderRadius: '4px', color: '#DFBE72' }}>raw/</code> de MinisterioWiki para que cada
        autosave genere o actualice el archivo .md del proyecto en tu vault.
        Solo necesitas hacerlo una vez — el permiso se recuerda entre sesiones.
      </p>
      <button
        className="obsidian-setup__btn obsidian-setup__btn--primary"
        onClick={handleConnect}
        style={{
          background: 'linear-gradient(135deg, #C9A24A 0%, #A88434 100%)',
          border: 'none',
          color: '#142C38',
          padding: '8px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
        }}
      >
        Conectar carpeta MinisterioWiki/raw
      </button>
    </div>
  );
}
