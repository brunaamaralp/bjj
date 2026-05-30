import React, { useState } from 'react';
import { FileSignature, Copy, ExternalLink } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';

const WEBHOOK_URL =
  typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/api/webhooks/autentique`
    : 'https://www.navefit.com/api/webhooks/autentique';

const AUTENTIQUE_HELP_URL = 'https://ajuda.autentique.com.br/';

export default function ContractsAutentiqueSection() {
  const addToast = useUiStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
        <FileSignature size={18} strokeWidth={1.75} color="var(--v500)" aria-hidden />
        <strong style={{ fontSize: 15 }}>Contratos digitais (Autentique)</strong>
      </div>
      <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
        Quando um contrato é assinado ou atualizado no Autentique, o Nave recebe a notificação automaticamente
        pelo webhook e atualiza o status em Alunos → Contratos.
      </p>
      <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
        <strong>Auto-assinatura da academia:</strong> defina <code>AUTENTIQUE_ACCOUNT_EMAIL</code> na Vercel
        com o e-mail da conta do token. No envio do contrato, o e-mail da <strong>Contratada</strong> deve ser
        o mesmo — assim a academia assina automaticamente e só o aluno recebe o link.
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
  );
}
