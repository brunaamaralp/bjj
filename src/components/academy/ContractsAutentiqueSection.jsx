import React, { useCallback, useEffect, useState } from 'react';
import { FileSignature, Copy, ExternalLink } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { getAutentiqueStatus, saveAutentiqueConfig } from '../../lib/autentiqueApi';

const WEBHOOK_URL =
  typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/api/webhooks/autentique`
    : 'https://www.navefit.com/api/webhooks/autentique';

const AUTENTIQUE_HELP_URL = 'https://ajuda.autentique.com.br/';
const AUTENTIQUE_TOKEN_HELP_URL = 'https://app.autentique.com.br/configuracoes/integracoes';

export default function ContractsAutentiqueSection({ embeddedInLayout = false, academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  const [statusPhase, setStatusPhase] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [configured, setConfigured] = useState(false);
  const [tokenMasked, setTokenMasked] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const hasStoredToken = configured;

  const loadStatus = useCallback(async () => {
    if (!academyId) {
      setStatusPhase('not_configured');
      setConfigured(false);
      setTokenMasked('');
      setAccountEmail('');
      setEditing(true);
      return;
    }

    setStatusPhase('loading');
    setLoadError('');
    try {
      const data = await getAutentiqueStatus(academyId);
      const isConfigured = data.configured === true;
      const emailValue = String(data.account_email || '').trim();
      setConfigured(isConfigured);
      setTokenMasked(String(data.token_masked || '').trim());
      setAccountEmail(emailValue);
      setEmail(emailValue);
      setToken('');
      setEditing(!isConfigured);
      setStatusPhase(isConfigured ? 'configured' : 'not_configured');
    } catch (e) {
      setStatusPhase('error');
      setLoadError(friendlyError(e, 'load'));
    }
  }, [academyId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      addToast({ type: 'success', message: 'URL copiada.' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar. Selecione o texto manualmente.' });
    }
  };

  const save = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const data = await saveAutentiqueConfig(academyId, {
        token: token || undefined,
        account_email: email,
        enabled: true,
      });
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
      setToken('');
      addToast({ type: 'success', message: 'Configuração Autentique salva.' });
      await loadStatus();
      setEditing(false);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const showForm = statusPhase === 'not_configured' || statusPhase === 'error' || editing;

  return (
    <>
      <div className="card" style={{ padding: 16 }}>
        {!embeddedInLayout ? (
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <FileSignature size={18} strokeWidth={1.75} color="var(--v500)" aria-hidden />
            <strong style={{ fontSize: 15 }}>Contratos digitais (Autentique)</strong>
          </div>
        ) : null}
        <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
          Quando um contrato é assinado ou atualizado no Autentique, o Nave recebe a notificação automaticamente
          pelo webhook e atualiza o status em Alunos → Contratos.
        </p>
        <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
          <strong>Auto-assinatura da academia:</strong> configure o token e o e-mail da conta abaixo. No envio, use o
          botão &quot;Usar e-mail da conta Autentique na Contratada&quot; ou iguale manualmente o e-mail da{' '}
          <strong>Contratada</strong> ao da conta — assim a academia assina automaticamente e só o aluno recebe o link.
        </p>
        <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
          No webhook Autentique, inclua eventos de <strong>assinatura</strong> (ex.:{' '}
          <code>signature.accepted</code>, <code>signature.viewed</code>) e de <strong>documento</strong> (
          <code>document.finished</code>).
        </p>
        <p className="text-small" style={{ margin: '0 0 8px', lineHeight: 1.45 }}>
          No painel Autentique, em <strong>Webhooks</strong>, informe esta URL:
        </p>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
          <input
            className="form-input"
            readOnly
            value={WEBHOOK_URL}
            style={{ flex: '1 1 220px', fontSize: 13 }}
            aria-label="URL do webhook para o Autentique"
          />
          <button type="button" className="btn-outline" onClick={() => void copyWebhookUrl()} style={{ whiteSpace: 'nowrap' }}>
            <Copy size={16} style={{ marginRight: 6 }} />
            {copied ? 'Copiado' : 'Copiar URL'}
          </button>
        </div>
        <p className="text-xs text-light" style={{ margin: '8px 0 12px', lineHeight: 1.4 }}>
          Cole a URL no campo de webhook do painel Autentique. Se o suporte Nave enviar outro endereço, use o
          indicado por eles.
        </p>
        <p className="text-small text-muted" style={{ margin: 0, lineHeight: 1.45 }}>
          Enquanto o webhook não estiver ativo, abra um contrato em Alunos → Contratos e use{' '}
          <strong>Sincronizar Autentique</strong> (ou &quot;Atualizar&quot; na lista) para buscar status e assinaturas
          diretamente na Autentique.
        </p>
        <a
          href={AUTENTIQUE_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="edit-link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13, fontWeight: 600 }}
        >
          <ExternalLink size={14} aria-hidden />
          Ajuda do Autentique
        </a>
      </div>

      <section className="empresa-section animate-in" style={{ marginTop: embeddedInLayout ? 12 : 16 }}>
        <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
          {!embeddedInLayout ? (
            <>
              <h3
                className="navi-section-heading"
                style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <FileSignature size={18} color="var(--v500)" aria-hidden />
                Conta Autentique
              </h3>
              <p className="text-small text-muted" style={{ marginBottom: 14, lineHeight: 1.5 }}>
                Token e e-mail da conta usados para enviar e assinar contratos digitais desta academia.
              </p>
            </>
          ) : null}

          {statusPhase === 'loading' ? (
            <p className="text-small text-muted" style={{ margin: 0, lineHeight: 1.45 }}>
              Carregando configuração…
            </p>
          ) : null}

          {statusPhase === 'error' ? (
            <p className="text-small" style={{ margin: '0 0 12px', lineHeight: 1.45, color: 'var(--danger)' }}>
              {loadError || 'Não foi possível carregar a configuração.'}
            </p>
          ) : null}

          {statusPhase !== 'loading' ? (
            <>
              <div className="flex items-center gap-2" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
                {configured ? (
                  <span
                    className="badge-success"
                    style={{ fontSize: 10, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}
                  >
                    Conectado
                  </span>
                ) : (
                  <span
                    className="badge-secondary"
                    style={{ fontSize: 10, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}
                  >
                    Não configurado
                  </span>
                )}
                {configured && !editing ? (
                  <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                    Alterar
                  </button>
                ) : null}
              </div>

              {configured && !editing ? (
                <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginBottom: 14 }}>
                  <div>
                    <span className="info-mini-label">Token API</span>
                    <p className="text-small" style={{ margin: '4px 0 0', lineHeight: 1.45 }}>
                      {tokenMasked || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="info-mini-label">E-mail da conta</span>
                    <p className="text-small" style={{ margin: '4px 0 0', lineHeight: 1.45 }}>
                      {accountEmail || '—'}
                    </p>
                  </div>
                </div>
              ) : null}

              {!configured && statusPhase !== 'error' ? (
                <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
                  Sem configuração, contratos usarão a conta padrão da plataforma.
                </p>
              ) : null}

              {showForm ? (
                <>
                  <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
                    Cole o token da sua conta Autentique e o e-mail usado nos contratos. Deixe o token em branco para
                    manter o token já salvo.
                  </p>

                  <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="info-mini-label">Token API</label>
                      <input
                        className="form-input"
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Cole o token da sua conta Autentique"
                        autoComplete="new-password"
                      />
                      {hasStoredToken ? (
                        <p className="text-xs text-light" style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
                          Token já configurado — deixe em branco para manter o atual. Preencha apenas para alterar.
                        </p>
                      ) : null}
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="info-mini-label">E-mail da conta</label>
                      <input
                        className="form-input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="conta@academia.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
                      {saving ? 'Salvando…' : 'Salvar configuração'}
                    </button>
                    {configured && editing ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditing(false);
                          setToken('');
                          setEmail(accountEmail);
                        }}
                        disabled={saving}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>

                  <a
                    href={AUTENTIQUE_TOKEN_HELP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="edit-link"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 12,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={14} aria-hidden />
                    Como encontrar seu token →
                  </a>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
