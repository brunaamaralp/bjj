import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  DEFAULT_SALES_FOOTER,
  DEFAULT_SALES_RECEIPT_TEMPLATE,
  mergeSalesIntoSettings,
  readSalesSettings,
} from '../../lib/salesSettings';
import { parseAcademySettings } from '../../lib/stockSettings';

const TEMPLATE_VARIABLES = [
  { key: 'academy_name', label: 'Nome da academia' },
  { key: 'sale_id', label: 'Número da venda' },
  { key: 'date', label: 'Data' },
  { key: 'time', label: 'Horário' },
  { key: 'channel', label: 'Canal de venda' },
  { key: 'client_name', label: 'Nome do cliente' },
  { key: 'items_lines', label: 'Lista de itens' },
  { key: 'total', label: 'Valor total' },
  { key: 'payment', label: 'Forma de pagamento' },
  { key: 'footer', label: 'Rodapé do comprovante' },
];

function buildDigest(receiptTemplate, receiptFooter, lockPriceEdit, saleIncomeCategory) {
  return JSON.stringify({
    receiptTemplate: String(receiptTemplate || '').trim(),
    receiptFooter: String(receiptFooter || '').trim(),
    lockPriceEdit: lockPriceEdit === true,
    saleIncomeCategory: String(saleIncomeCategory || '').trim(),
  });
}

export default function SalesSettingsSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [loaded, setLoaded] = useState(false);
  const [receiptTemplate, setReceiptTemplate] = useState(DEFAULT_SALES_RECEIPT_TEMPLATE);
  const [receiptFooter, setReceiptFooter] = useState(DEFAULT_SALES_FOOTER);
  const [lockPriceEdit, setLockPriceEdit] = useState(false);
  const [saleIncomeCategory, setSaleIncomeCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedDigest, setSavedDigest] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    if (!academyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        const s = readSalesSettings(doc.settings);
        setReceiptTemplate(s.receiptTemplate);
        setReceiptFooter(s.receiptFooter);
        setLockPriceEdit(s.lockPriceEdit);
        setSaleIncomeCategory(s.saleIncomeCategory || '');
        setSavedDigest(
          buildDigest(s.receiptTemplate, s.receiptFooter, s.lockPriceEdit, s.saleIncomeCategory)
        );
      } catch (e) {
        console.error('[SalesSettings]', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const hasUnsaved = useMemo(
    () =>
      loaded &&
      buildDigest(receiptTemplate, receiptFooter, lockPriceEdit, saleIncomeCategory) !== savedDigest,
    [loaded, receiptTemplate, receiptFooter, lockPriceEdit, saleIncomeCategory, savedDigest]
  );

  const copyVariable = async (key) => {
    const token = `{${key}}`;
    try {
      await navigator.clipboard.writeText(token);
      setCopiedKey(key);
      addToast({ type: 'success', message: `${token} copiado.` });
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar. Selecione o texto manualmente.' });
    }
  };

  const save = async () => {
    if (!academyId || !hasUnsaved) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = mergeSalesIntoSettings(base, {
        receiptTemplate,
        receiptFooter,
        lockPriceEdit,
        saleIncomeCategory,
      });
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setSavedDigest(buildDigest(receiptTemplate, receiptFooter, lockPriceEdit, saleIncomeCategory));
      addToast({ type: 'success', message: 'Configurações de vendas salvas.' });
    } catch (e) {
      console.error('[SalesSettings] save:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="empresa-section animate-in" style={{ marginTop: 16 }}>
      <h3 className="navi-section-heading mb-2">Modelo de comprovante</h3>
      <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
        Texto enviado ao copiar o comprovante para o WhatsApp. Use as variáveis do painel abaixo para montar o
        modelo.
      </p>

      <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Modelo do comprovante</label>
          <textarea
            className="form-input"
            rows={10}
            value={receiptTemplate}
            onChange={(e) => setReceiptTemplate(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
            aria-describedby="sales-template-vars"
          />
        </div>

        <details className="sales-template-vars" id="sales-template-vars">
          <summary className="sales-template-vars__summary">
            <ChevronDown size={16} className="sales-template-vars__chevron" aria-hidden />
            Variáveis disponíveis
          </summary>
          <ul className="sales-template-vars__list">
            {TEMPLATE_VARIABLES.map((v) => (
              <li key={v.key} className="sales-template-vars__item">
                <div className="sales-template-vars__meta">
                  <code className="sales-template-vars__code">{`{${v.key}}`}</code>
                  <span className="text-small text-muted">{v.label}</span>
                </div>
                <button
                  type="button"
                  className="btn-outline sales-template-vars__copy"
                  onClick={() => void copyVariable(v.key)}
                  aria-label={`Copiar variável ${v.key}`}
                >
                  <Copy size={14} aria-hidden />
                  {copiedKey === v.key ? 'Copiado' : 'Copiar'}
                </button>
              </li>
            ))}
          </ul>
        </details>

        <div className="form-group mt-3">
          <label>Rodapé do comprovante</label>
          <input
            className="form-input"
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            placeholder={DEFAULT_SALES_FOOTER}
          />
          <p className="text-xs text-muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
            Texto exibido no final do comprovante. No modelo, use a variável{' '}
            <code style={{ fontSize: '0.85em' }}>{'{footer}'}</code> para inserir este conteúdo.
          </p>
        </div>

        <div className="form-group mt-3">
          <label>Categoria de receita no Caixa (vendas)</label>
          <input
            className="form-input"
            value={saleIncomeCategory}
            onChange={(e) => setSaleIncomeCategory(e.target.value)}
            placeholder="Ex.: Vendas — produtos"
            maxLength={128}
          />
          <p className="text-xs text-muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
            Nome do plano/categoria usado ao espelhar vendas no Caixa. Separado da categoria de compra do
            Estoque.
          </p>
        </div>

        <label className="flex items-center gap-2 mt-3" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={lockPriceEdit} onChange={(e) => setLockPriceEdit(e.target.checked)} />
          Bloquear edição de preço no carrinho (somente preço do cadastro)
        </label>

        <div className="flex justify-end items-center gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
          {hasUnsaved ? (
            <span className="funil-unsaved-pill" role="status">
              Alterações não salvas
            </span>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            onClick={() => void save()}
            disabled={saving || !hasUnsaved}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sales-template-vars {
          margin-top: 12px;
          border: 1px solid var(--border-light);
          border-radius: 8px;
          background: var(--surface);
        }
        .sales-template-vars__summary {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          list-style: none;
          color: var(--text-secondary);
          user-select: none;
        }
        .sales-template-vars__summary::-webkit-details-marker { display: none; }
        .sales-template-vars[open] .sales-template-vars__chevron {
          transform: rotate(180deg);
        }
        .sales-template-vars__chevron {
          transition: transform 0.15s ease;
          flex-shrink: 0;
        }
        .sales-template-vars__list {
          list-style: none;
          margin: 0;
          padding: 0 12px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sales-template-vars__item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: 8px 10px;
          border-radius: 6px;
          background: var(--bg);
          border: 1px solid var(--border-light);
        }
        .sales-template-vars__meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .sales-template-vars__code {
          font-size: 0.8rem;
          font-family: ui-monospace, monospace;
          color: var(--accent);
          font-weight: 600;
        }
        .sales-template-vars__copy {
          min-height: 36px;
          padding: 0 12px;
          font-size: 0.78rem;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
      `,
        }}
      />
    </section>
  );
}
