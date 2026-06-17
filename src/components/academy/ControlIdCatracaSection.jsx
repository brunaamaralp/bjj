import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import { testControlIdConnection, saveControlIdConfig } from '../../lib/controlidApi';
import { formatControlIdLastSync } from '../../lib/controlidDisplay.js';
import EmptyState from '../shared/EmptyState.jsx';

function ConfigSubsection({ title, hint, children, first = false }) {
  return (
    <div
      style={{
        marginTop: first ? 0 : 18,
        paddingTop: first ? 0 : 18,
        borderTop: first ? 'none' : '1px solid var(--border-light)',
      }}
    >
      <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</h4>
      {hint ? (
        <p className="text-xs text-light" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
          {hint}
        </p>
      ) : null}
      <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>{children}</div>
    </div>
  );
}

export default function ControlIdCatracaSection({ embeddedInLayout = false, academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const controlId = useAcademyControlId(academyId);

  const [enabled, setEnabled] = useState(false);
  const [ip, setIp] = useState('192.168.1.100');
  const [port, setPort] = useState('80');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [portalId, setPortalId] = useState('1');
  const [relayUrl, setRelayUrl] = useState('');
  const [entryCooldownMinutes, setEntryCooldownMinutes] = useState('0');
  const [blockOverdueAccess, setBlockOverdueAccess] = useState(false);
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
    setRelayUrl(controlId.relay_url || '');
    setEntryCooldownMinutes(String(controlId.entry_cooldown_minutes ?? 0));
    setBlockOverdueAccess(controlId.block_overdue_access === true);
    setPassword('');
  }, [
    controlId.loading,
    controlId.enabled,
    controlId.ip,
    controlId.port,
    controlId.username,
    controlId.portal_id,
    controlId.relay_url,
    controlId.entry_cooldown_minutes,
    controlId.block_overdue_access,
    controlId.configured,
  ]);

  const financeModuleOn = controlId.finance_module === true;
  const canBlockOverdue = financeModuleOn;

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
        relay_url: relayUrl.trim() || undefined,
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
    const cooldown = Math.min(240, Math.max(0, Math.trunc(Number(entryCooldownMinutes) || 0)));
    setSaving(true);
    try {
      const data = await saveControlIdConfig(academyId, {
        enabled,
        ip,
        port: Number(port) || 80,
        username,
        password: password || undefined,
        portal_id: Number(portalId) || 1,
        relay_url: relayUrl.trim(),
        entry_cooldown_minutes: cooldown,
        block_overdue_access: canBlockOverdue ? blockOverdueAccess : false,
      });
      if (!data.sucesso) throw new Error(data.erro || 'Erro ao salvar');
      setPassword('');
      controlId.refresh();
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

            <ConfigSubsection
              title="Servidor local"
              hint="Computador na recepção que executa o relay entre a nuvem e a catraca na rede local."
              first
            >
              <div className="form-group" style={{ margin: 0 }}>
                <label className="info-mini-label">URL do servidor na recepção</label>
                <input
                  className="form-input"
                  value={relayUrl}
                  onChange={(e) => setRelayUrl(e.target.value)}
                  placeholder="http://192.168.18.61:4000"
                />
                <p className="text-xs text-light" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
                  Deixe vazio para usar o servidor padrão da instalação.
                </p>
              </div>
            </ConfigSubsection>

            <ConfigSubsection
              title="Conexão com o equipamento"
              hint="Dados do Control iD na rede da academia. Teste antes de salvar."
            >
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
            </ConfigSubsection>

            <ConfigSubsection
              title="Regras de acesso"
              hint="Controle de presença duplicada e bloqueio financeiro na catraca."
            >
              <div className="form-group" style={{ margin: 0 }}>
                <label className="info-mini-label">Intervalo mínimo entre entradas (min)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={240}
                  value={entryCooldownMinutes}
                  onChange={(e) => setEntryCooldownMinutes(e.target.value)}
                />
                <p className="text-xs text-light" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
                  Use <strong>0</strong> para desligar. Evita registrar nova presença se o mesmo aluno entrou há
                  menos tempo (a porta pode abrir mesmo assim).
                </p>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label
                  className="flex items-center gap-2"
                  style={{
                    fontSize: 14,
                    opacity: canBlockOverdue ? 1 : 0.65,
                    cursor: canBlockOverdue ? 'pointer' : 'not-allowed',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={blockOverdueAccess}
                    disabled={!canBlockOverdue}
                    onChange={(e) => setBlockOverdueAccess(e.target.checked)}
                  />
                  Bloquear inadimplentes na catraca
                </label>
                <p className="text-xs text-light" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
                  {canBlockOverdue ? (
                    <>
                      Remove o acesso no equipamento quando o aluno está marcado como inadimplente e
                      re-sincroniza após quitação.
                    </>
                  ) : (
                    <>
                      Requer módulo financeiro ativo.{' '}
                      <Link to="/financeiro" style={{ color: 'var(--purple)', fontWeight: 600 }}>
                        Abrir Financeiro
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </ConfigSubsection>

            <ConfigSubsection title="Status" hint="Sincronização de rostos dos alunos com o equipamento.">
              <div
                className="form-group"
                style={{ margin: 0, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8 }}
              >
                <label className="info-mini-label" style={{ marginBottom: 4, display: 'block' }}>
                  Última sincronização
                </label>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>
                  {controlId.loading ? 'Carregando…' : formatControlIdLastSync(controlId.last_sync)}
                </p>
                <p className="text-xs text-light" style={{ margin: '6px 0 0', lineHeight: 1.4 }}>
                  Atualizada ao sincronizar alunos (individual ou em massa).{' '}
                  <Link
                    to="/?tab=catraca&section=historico"
                    style={{ color: 'var(--purple)', fontWeight: 600 }}
                  >
                    Sincronizar na recepção
                  </Link>
                </p>
              </div>
            </ConfigSubsection>

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
