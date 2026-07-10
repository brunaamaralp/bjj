import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { mergeSalesIntoSettings, readSalesSettings } from '../../lib/salesSettings';
import { parseAcademySettings } from '../../lib/stockSettings';
import { salesFetch } from '../../lib/salesApi';
import { useAcademyRoleDoc } from '../../hooks/useAcademyRoleDoc.js';
import { useCanManageAcademySales } from '../../lib/canManageStudentPayments.js';

function buildDigest(lockPriceEdit, autoPrintReceipt, requireCashShift) {
  return JSON.stringify({
    lockPriceEdit: lockPriceEdit === true,
    autoPrintReceipt: autoPrintReceipt === true,
    requireCashShift: requireCashShift === true,
  });
}

export default function SalesSettingsSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const academyDoc = useAcademyRoleDoc();
  const canManageSales = useCanManageAcademySales(academyDoc);
  const [loaded, setLoaded] = useState(false);
  const [lockPriceEdit, setLockPriceEdit] = useState(false);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [requireCashShift, setRequireCashShift] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [savedDigest, setSavedDigest] = useState('');

  useEffect(() => {
    if (!academyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        const s = readSalesSettings(doc.settings);
        setLockPriceEdit(s.lockPriceEdit);
        setAutoPrintReceipt(s.autoPrintReceipt);
        setRequireCashShift(s.requireCashShift);
        setSavedDigest(buildDigest(s.lockPriceEdit, s.autoPrintReceipt, s.requireCashShift));
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
      buildDigest(lockPriceEdit, autoPrintReceipt, requireCashShift) !== savedDigest,
    [loaded, lockPriceEdit, autoPrintReceipt, requireCashShift, savedDigest]
  );

  const save = async () => {
    if (!academyId || !hasUnsaved) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = mergeSalesIntoSettings(base, {
        lockPriceEdit,
        autoPrintReceipt,
        requireCashShift,
      });
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setSavedDigest(buildDigest(lockPriceEdit, autoPrintReceipt, requireCashShift));
      addToast({ type: 'success', message: 'Configurações de vendas salvas.' });
    } catch (e) {
      console.error('[SalesSettings] save:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const reconcileMirrors = async () => {
    if (!canManageSales || reconciling) return;
    setReconciling(true);
    try {
      const data = await salesFetch('/api/sales?action=reconcile', { method: 'POST' });
      const repaired = Number(data.repaired_count) || 0;
      const missing = Number(data.missing_count) || 0;
      if (repaired > 0) {
        addToast({
          type: 'success',
          message: `${repaired} espelho(s) de venda criado(s) no Caixa.`,
        });
      } else if (missing === 0) {
        addToast({ type: 'success', message: 'Nenhuma venda concluída sem espelho encontrada.' });
      } else {
        addToast({
          type: 'warning',
          message: `${missing} venda(s) sem espelho — ${repaired} corrigida(s). Verifique o Caixa.`,
        });
      }
    } catch (e) {
      console.error('[SalesSettings] reconcile:', e);
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setReconciling(false);
    }
  };

  return (
    <section className="empresa-section animate-in" style={{ marginTop: 0 }}>
      <h3 className="navi-section-heading mb-2">Configurações de vendas</h3>
      <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
        O comprovante de venda usa o modelo padrão do sistema (texto para WhatsApp e PDF).
      </p>

      <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
        <label className="flex items-center gap-2" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={lockPriceEdit} onChange={(e) => setLockPriceEdit(e.target.checked)} />
          Bloquear edição de preço no carrinho (somente preço do cadastro)
        </label>

        <label className="flex items-center gap-2 mt-2" style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={autoPrintReceipt}
            onChange={(e) => setAutoPrintReceipt(e.target.checked)}
          />
          Imprimir comprovante automaticamente após cada venda (modo PDV)
        </label>

        <label className="flex items-center gap-2 mt-2" style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={requireCashShift}
            onChange={(e) => setRequireCashShift(e.target.checked)}
          />
          Exigir abertura de caixa antes de registrar vendas
        </label>

        {canManageSales ? (
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
            <p className="text-small text-muted mb-2" style={{ lineHeight: 1.45 }}>
              Verifica vendas concluídas sem lançamento espelhado no Caixa e tenta criar o espelho
              automaticamente.
            </p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => void reconcileMirrors()}
              disabled={reconciling}
            >
              {reconciling ? 'Verificando…' : 'Verificar espelhos de vendas'}
            </button>
          </div>
        ) : null}

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
    </section>
  );
}
