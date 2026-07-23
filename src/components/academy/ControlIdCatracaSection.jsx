import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import { testControlIdConnection, saveControlIdConfig } from '../../lib/controlidApi';
import { formatControlIdLastSync } from '../../lib/controlidDisplay.js';
import EmptyState from '../shared/EmptyState.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import {
  CONTROLID_SETUP_STEP_CONNECT,
  CONTROLID_SETUP_STEP_PORTAL,
  CONTROLID_SETUP_STEP_RULES,
  nextControlIdSetupStep,
  visibleControlIdSetupSections,
} from '../../lib/controlidSetupWizard.js';
import {
  isControlIdConfigDirty,
  snapshotControlIdConfigForm,
} from '../../lib/controlidSetupDirty.js';

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

function Field({ id, label, hint, children }) {
  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="info-mini-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-light" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
          {hint}
        </p>
      ) : null}
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
  const [wizardStep, setWizardStep] = useState(CONTROLID_SETUP_STEP_CONNECT);
  const [baseline, setBaseline] = useState(null);

  const hasStoredPassword = controlId.configured;
  const editMode = hasStoredPassword;
  const sections = visibleControlIdSetupSections(wizardStep, { editMode });

  const formState = {
    enabled,
    ip,
    port,
    username,
    password,
    portalId,
    relayUrl,
    entryCooldownMinutes,
    blockOverdueAccess,
  };
  const dirty = Boolean(baseline) && isControlIdConfigDirty(formState, baseline);

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
    setWizardStep(controlId.configured ? CONTROLID_SETUP_STEP_RULES : CONTROLID_SETUP_STEP_CONNECT);
    setPortals([]);
    setBaseline(
      snapshotControlIdConfigForm({
        enabled: controlId.enabled,
        ip: controlId.ip || '192.168.1.100',
        port: String(controlId.port || 80),
        username: controlId.username || 'admin',
        password: '',
        portalId: String(controlId.portal_id || 1),
        relayUrl: controlId.relay_url || '',
        entryCooldownMinutes: String(controlId.entry_cooldown_minutes ?? 0),
        blockOverdueAccess: controlId.block_overdue_access === true,
      })
    );
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

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

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
      setWizardStep((prev) => nextControlIdSetupStep(prev, { tested: true }));
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
      setBaseline(
        snapshotControlIdConfigForm({
          enabled,
          ip,
          port,
          username,
          password: '',
          portalId,
          relayUrl,
          entryCooldownMinutes: String(cooldown),
          blockOverdueAccess: canBlockOverdue ? blockOverdueAccess : false,
        })
      );
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
              Hardware na porta da academia. O servidor local precisa estar rodando na recepção — peça ajuda ao
              responsável técnico ou ao suporte Nave se for a primeira instalação.
            </p>
          </>
        ) : null}

        <label className="flex items-center gap-2" style={{ marginBottom: 14, fontSize: 14 }} htmlFor="controlid-enabled">
          <input
            id="controlid-enabled"
            name="controlid_enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Integração ativa
        </label>

        {dirty ? (
          <StatusBanner variant="warning" className="reception-section">
            Alterações não salvas na configuração da catraca.
          </StatusBanner>
        ) : null}

        {dirty && !enabled ? (
          <div className="flex gap-2" style={{ marginBottom: 14 }}>
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        ) : null}

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
            {!editMode ? (
              <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }} role="status">
                Passo {wizardStep} de 3 —{' '}
                {wizardStep === CONTROLID_SETUP_STEP_CONNECT
                  ? 'conectar o equipamento'
                  : wizardStep === CONTROLID_SETUP_STEP_PORTAL
                    ? 'escolher a porta'
                    : 'definir regras e salvar'}
              </p>
            ) : (
              <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
                Use <strong>Testar conexão</strong> para validar IP e credenciais. Depois, <strong>Salvar</strong> para
                aplicar as alterações.
              </p>
            )}

            {sections.connect ? (
              <>
                <ConfigSubsection
                  title="1. Conectar"
                  hint="Servidor na recepção e dados do equipamento na rede da academia."
                  first
                >
                  <Field
                    id="controlid-relay-url"
                    label="URL do servidor na recepção"
                    hint="Deixe vazio para usar o servidor padrão da instalação."
                  >
                    <input
                      id="controlid-relay-url"
                      name="controlid_relay_url"
                      className="form-input"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={relayUrl}
                      onChange={(e) => setRelayUrl(e.target.value)}
                      placeholder="http://192.168.18.61:4000…"
                    />
                  </Field>
                  <Field id="controlid-ip" label="IP da catraca">
                    <input
                      id="controlid-ip"
                      name="controlid_ip"
                      className="form-input"
                      autoComplete="off"
                      spellCheck={false}
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      placeholder="192.168.1.100…"
                    />
                  </Field>
                  <Field id="controlid-port" label="Porta">
                    <input
                      id="controlid-port"
                      name="controlid_port"
                      className="form-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      autoComplete="off"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                    />
                  </Field>
                  <Field id="controlid-username" label="Usuário">
                    <input
                      id="controlid-username"
                      name="controlid_username"
                      className="form-input"
                      autoComplete="username"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </Field>
                  <Field
                    id="controlid-password"
                    label="Senha"
                    hint={
                      hasStoredPassword
                        ? 'Senha já configurada — deixe em branco para manter a atual.'
                        : undefined
                    }
                  >
                    <input
                      id="controlid-password"
                      name="controlid_password"
                      className="form-input"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        hasStoredPassword ? 'Deixe em branco para manter a senha salva…' : 'Senha do equipamento…'
                      }
                    />
                  </Field>
                </ConfigSubsection>

                <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void test()}
                    disabled={testing}
                    title={
                      canTestWithoutTypingPassword ? 'Usará a senha já salva na configuração' : undefined
                    }
                  >
                    {testing ? 'Testando…' : 'Testar conexão'}
                  </button>
                  {canTestWithoutTypingPassword ? (
                    <span className="text-xs text-light" style={{ flex: '1 1 200px', lineHeight: 1.35 }}>
                      O teste pode ser feito sem redigitar a senha.
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}

            {sections.portal ? (
              <ConfigSubsection
                title="2. Escolher porta"
                hint="Portal do Control iD liberado na recepção. Prefira a lista após o teste."
              >
                {portals.length > 0 ? (
                  <Field id="controlid-portal-select" label="Portal">
                    <select
                      id="controlid-portal-select"
                      name="controlid_portal_id"
                      className="form-input"
                      value={portalId}
                      onChange={(e) => setPortalId(e.target.value)}
                    >
                      {portals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (ID {p.id})
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field
                    id="controlid-portal-id"
                    label="Portal ID"
                    hint="Teste a conexão para listar os portais disponíveis."
                  >
                    <input
                      id="controlid-portal-id"
                      name="controlid_portal_id"
                      className="form-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      autoComplete="off"
                      value={portalId}
                      onChange={(e) => setPortalId(e.target.value)}
                    />
                  </Field>
                )}
                {!editMode && wizardStep === CONTROLID_SETUP_STEP_PORTAL ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setWizardStep(nextControlIdSetupStep(CONTROLID_SETUP_STEP_PORTAL))}
                  >
                    Continuar para regras
                  </button>
                ) : null}
              </ConfigSubsection>
            ) : null}

            {sections.rules ? (
              <ConfigSubsection
                title="3. Regras de acesso"
                hint="Evita presença duplicada e bloqueia inadimplentes no equipamento."
              >
                <Field
                  id="controlid-cooldown"
                  label="Intervalo mínimo entre entradas (min)"
                  hint={
                    <>
                      Use <strong>0</strong> para desligar. Evita registrar nova presença se o mesmo aluno entrou há
                      menos tempo (a porta pode abrir mesmo assim).
                    </>
                  }
                >
                  <input
                    id="controlid-cooldown"
                    name="controlid_entry_cooldown_minutes"
                    className="form-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={240}
                    autoComplete="off"
                    value={entryCooldownMinutes}
                    onChange={(e) => setEntryCooldownMinutes(e.target.value)}
                  />
                </Field>
                <div className="form-group" style={{ margin: 0 }}>
                  <label
                    className="flex items-center gap-2"
                    htmlFor="controlid-block-overdue"
                    style={{
                      fontSize: 14,
                      opacity: canBlockOverdue ? 1 : 0.65,
                      cursor: canBlockOverdue ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <input
                      id="controlid-block-overdue"
                      name="controlid_block_overdue_access"
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
                        Remove o acesso no equipamento quando o aluno está marcado como inadimplente e re-sincroniza
                        após quitação.
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
            ) : null}

            {sections.status ? (
              <ConfigSubsection title="Status" hint="Sincronização de rostos dos alunos com o equipamento.">
                <div
                  className="form-group"
                  style={{ margin: 0, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8 }}
                >
                  <span className="info-mini-label" style={{ marginBottom: 4, display: 'block' }}>
                    Última sincronização
                  </span>
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
            ) : null}

            {sections.rules ? (
              <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
