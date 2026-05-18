import React, { useEffect, useState } from 'react';
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

const PLACEHOLDER_HINT =
  '{academy_name}, {sale_id}, {date}, {time}, {channel}, {client_name}, {items_lines}, {total}, {payment}, {footer}';

export default function SalesSettingsSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [receiptTemplate, setReceiptTemplate] = useState(DEFAULT_SALES_RECEIPT_TEMPLATE);
  const [receiptFooter, setReceiptFooter] = useState(DEFAULT_SALES_FOOTER);
  const [lockPriceEdit, setLockPriceEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        const s = readSalesSettings(doc.settings);
        setReceiptTemplate(s.receiptTemplate);
        setReceiptFooter(s.receiptFooter);
        setLockPriceEdit(s.lockPriceEdit);
      } catch (e) {
        console.error('[SalesSettings]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const save = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = mergeSalesIntoSettings(base, {
        receiptTemplate,
        receiptFooter,
        lockPriceEdit,
      });
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
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
      <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
        <h4 className="navi-section-heading" style={{ marginBottom: 6 }}>
          Modelo de comprovante
        </h4>
        <p className="text-small text-muted" style={{ marginBottom: 12, lineHeight: 1.45 }}>
          Texto enviado ao copiar o comprovante para o WhatsApp. Variáveis: {PLACEHOLDER_HINT}
        </p>
        <div className="form-group">
          <label>Modelo</label>
          <textarea
            className="form-input"
            rows={10}
            value={receiptTemplate}
            onChange={(e) => setReceiptTemplate(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>
        <div className="form-group mt-2">
          <label>Rodapé ({'{footer}'})</label>
          <input className="form-input" value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 mt-3" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={lockPriceEdit} onChange={(e) => setLockPriceEdit(e.target.checked)} />
          Bloquear edição de preço no carrinho (somente preço do cadastro)
        </label>
        <div className="flex justify-end mt-3">
          <button type="button" className="btn-secondary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </section>
  );
}
