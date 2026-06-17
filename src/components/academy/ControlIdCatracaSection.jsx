import React, { useEffect, useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import { testControlIdConnection, saveControlIdConfig } from '../../lib/controlidApi';
import EmptyState from '../shared/EmptyState.jsx';

export default function ControlIdCatracaSection({ embeddedInLayout = false, academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const controlId = useAcademyControlId(academyId);

  const [enabled, setEnabled] = useState(false);
  const [ip, setIp] = useState('192.168.1.100');
  const [port, setPort] = useState('80');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [portalId, setPortalId] = useState('1');
  const [portals, setPortals] = useState([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasStoredPassword = controlId.configured;

  useEffect(() => {
    if (controlId.loading) return;
    setEnabled(controlId.enabled);
    setIp(controlId.ip || '192.168.1.100');
    setPort(String(controlId.port || 80));
    setUsername(controlId.username || 'admin');
    setPortalId(String(controlId.portal_id || 1));
    setPassword('');
  }, [
    controlId.loading,
    controlId.enabled,
    controlId.ip,
    controlId.port,
    controlId.username,
    controlId.portal_id,
    controlId.configured,
  ]);

  const canTestWithoutTypingPassword = hasStoredPassword && !String(password || '').trim();

  const test = async () => {
    if (!academyId) return;
    if (!String(password || '').trim() && !hasStoredPassword) {
      addToast({ type: 'warning', message: 'Informe a senha do equipamento para testar a conexão.' });
      return;
    }
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
      setPassword('');
      addToast({ type: 'success', message: 'Configuração da catraca salva.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="empresa-section animate-in" style={{ marginTop: embeddedInLayout ? 0 : 16 }}>
      <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
        {!embeddedInLayout ? (
          <>
            <h3
              className="navi-section-heading"
              style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <DoorOpen size={18} color="var(--v500)" aria-hidden />
              Integração com catraca (Control iD)
            </h3>
            <p className="text-small text-muted" style={{ marginBottom: 14, lineHeight: 1.5 }}>
              Reconhecimento facial e liberação de acesso na recepção. Para ativar a catraca, o servidor local precisa
              estar rodando na recepção. Consulte o responsável técnico ou o suporte Nave.
            </p>
          </>
        ) : null}

        <label className="flex items-center gap-2" style={{ marginBottom: 14, fontSize: 14 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Integração ativa
        </label>

        {!enabled ? (
          <EmptyState
            variant="compact"
            tone="dashed"
            icon={DoorOpen}
            title="Integração com catraca desativada"
            description="Ative acima se você possui o hardware Control iD instalado na recepção."
            role="status"
          />
        ) : (
          <>
            <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
              Use <strong>Testar conexão</strong> para validar IP e credenciais. Depois, <strong>Salvar</strong> para
              aplicar as alterações na academia.
            </p>

            <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="info-mini-label">IP da catraca</label>
                <input
                  className="form-input"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="info-mini-label">Porta</label>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
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
                  placeholder={hasStoredPassword ? 'Deixe em branco para manter a senha salva' : 'Senha do equipamento'}
                  autoComplete="new-password"
                />
                {hasStoredPassword ? (
                  <p className="text-xs text-light" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
                    Senha já configurada — deixe em branco para manter a atual. Preencha apenas para alterar.
                  </p>
                ) : null}
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

            <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void test()}
                disabled={testing}
                title={
                  canTestWithoutTypingPassword
                    ? 'Usará a senha já salva na configuração'
                    : undefined
                }
              >
                {testing ? 'Testando…' : 'Testar conexão'}
              </button>
              <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {canTestWithoutTypingPassword ? (
                <span className="text-xs text-light" style={{ flex: '1 1 200px', lineHeight: 1.35 }}>
                  O teste pode ser feito sem redigitar a senha.
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
