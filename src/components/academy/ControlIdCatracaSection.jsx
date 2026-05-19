import React, { useEffect, useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { readControlIdConfig } from '../../../lib/controlidSettings.js';
import { testControlIdConnection, saveControlIdConfig } from '../../lib/controlidApi';

export default function ControlIdCatracaSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [enabled, setEnabled] = useState(false);
  const [ip, setIp] = useState('192.168.1.100');
  const [port, setPort] = useState('80');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [portalId, setPortalId] = useState('1');
  const [portals, setPortals] = useState([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        const cfg = readControlIdConfig(doc.settings);
        setEnabled(cfg.enabled);
        setIp(cfg.ip || '192.168.1.100');
        setPort(String(cfg.port || 80));
        setUsername(cfg.username || 'admin');
        setPortalId(String(cfg.portal_id || 1));
        setHasStoredPassword(Boolean(cfg.passwordEncrypted));
        setPassword('');
      } catch (e) {
        console.error('[ControlIdCatraca]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const test = async () => {
    if (!academyId) return;
    setTesting(true);
    setPortals([]);
    try {
      const data = await testControlIdConnection(academyId, {
        ip,
        port: Number(port) || 80,
        username,
        password: password || undefined,
      });
      if (!data.sucesso) {
        addToast({ type: 'error', message: data.erro || 'Falha na conexão' });
        return;
      }
      const list = Array.isArray(data.portals) ? data.portals : [];
      setPortals(list);
      if (list.length === 1) setPortalId(String(list[0].id));
      addToast({ type: 'success', message: data.message || 'Conexão OK' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const data = await saveControlIdConfig(academyId, {
        enabled,
        ip,
        port: Number(port) || 80,
        username,
        password: password || undefined,
        portal_id: Number(portalId) || 1,
      });
      if (!data.sucesso) throw new Error(data.erro || 'Erro ao salvar');
      setHasStoredPassword(Boolean(password) || hasStoredPassword);
      setPassword('');
      addToast({ type: 'success', message: 'Configuração da catraca salva.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="empresa-section animate-in" style={{ marginTop: 16 }}>
      <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
        <h4 className="navi-section-heading" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <DoorOpen size={18} aria-hidden />
          Catraca Control iD
        </h4>
        <p className="text-small text-muted" style={{ marginBottom: 12, lineHeight: 1.45 }}>
          Reconhecimento facial e liberação de acesso. O Nave na nuvem não alcança a rede local — mantenha{' '}
          <code>npm run start:server</code> na recepção e use{' '}
          <code>VITE_CONTROLID_API_BASE=http://localhost:4000</code> (ou túnel + <code>CONTROLID_RELAY_URL</code> no
          Vercel).
        </p>

        <label className="flex items-center gap-2" style={{ marginBottom: 14, fontSize: 14 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Integração ativa
        </label>

        <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="info-mini-label">IP da catraca</label>
            <input className="form-input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.100" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="info-mini-label">Porta</label>
            <input className="form-input" type="number" min={1} value={port} onChange={(e) => setPort(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="info-mini-label">Usuário</label>
            <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="info-mini-label">Senha</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={hasStoredPassword ? '•••••••• (salva — vazio mantém)' : 'Senha do equipamento'}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="info-mini-label">Portal ID</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={portalId}
              onChange={(e) => setPortalId(e.target.value)}
            />
            {portals.length > 0 && (
              <select
                className="form-input"
                style={{ marginTop: 8 }}
                value={portalId}
                onChange={(e) => setPortalId(e.target.value)}
              >
                {portals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (ID {p.id})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={() => void test()} disabled={testing}>
            {testing ? 'Testando…' : 'Testar conexão'}
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </section>
  );
}
