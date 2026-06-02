import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DateInputField } from '../DateInput';
import { databases, DB_ID, JOURNAL_COL } from '../../lib/appwrite';
import { Query } from 'appwrite';
import { useAccountingStore } from '../../store/useAccountingStore';
import { fmt } from './financeFmt.js';
import { BarChart3 } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import FinanceRegimeToggle from './FinanceRegimeToggle.jsx';
import { getFinanceRegime, financeRegimeLabel, FINANCE_REGIME } from '../../lib/financeCompetence.js';
import { buildDreDisplayRows } from '../../lib/financeCategories.js';

function downloadCSV(prefix, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')
    )
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsTab({
  academyId,
  onGoToLancamentos,
  periodFrom,
  periodTo,
  embedded = false,
}) {
  const dre = useAccountingStore((s) => s.dre);
  const dfcIndireto = useAccountingStore((s) => s.dfcIndireto);
  const dfcDireto = useAccountingStore((s) => s.dfcDireto);
  const journal = useAccountingStore((s) => s.journal);
  const setJournal = useAccountingStore((s) => s.setJournal);
  const loadByAcademy = useAccountingStore((s) => s.loadByAcademy);

  const [fromLocal, setFromLocal] = useState('');
  const [toLocal, setToLocal] = useState('');
  const from = embedded && periodFrom != null ? periodFrom : fromLocal;
  const to = embedded && periodTo != null ? periodTo : toLocal;
  const [method, setMethod] = useState('indireto');
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : FINANCE_REGIME.CASH));

  useEffect(() => {
    if (academyId) setRegime(getFinanceRegime(academyId));
  }, [academyId]);

  useEffect(() => {
    if (academyId) loadByAcademy(academyId);
  }, [academyId, loadByAcademy]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !JOURNAL_COL) return;
      const cur = useAccountingStore.getState().journal;
      if (cur.length > 0) return;
      try {
        const res = await databases.listDocuments(DB_ID, JOURNAL_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderDesc('date'),
        ]);
        if (!active) return;
        const list = res.documents.map((d) => ({
          id: d.$id,
          date: d.date,
          memo: d.memo || '',
          lines: (() => { try { return JSON.parse(d.lines || '[]'); } catch { return []; } })(),
        }));
        setJournal(list);
      } catch (e) {
        console.error('[ReportsTab] falha ao carregar diário:', e);
      }
    };
    run();
    return () => { active = false; };
  }, [academyId, setJournal]);

  const dreData = useMemo(() => dre(from, to), [from, to, dre]);
  const dfcData = useMemo(() => (method === 'indireto' ? dfcIndireto(from, to) : dfcDireto(from, to)), [method, from, to, dfcIndireto, dfcDireto]);
  const dreRows = useMemo(() => buildDreDisplayRows(dreData), [dreData]);
  const variacaoCaixa = (dfcData.operacional || 0) + (dfcData.investimento || 0) + (dfcData.financiamento || 0);
  const dfcRows = [
    ['Operacional', dfcData.operacional || 0],
    ['Investimento', dfcData.investimento || 0],
    ['Financiamento', dfcData.financiamento || 0],
    ['Variação de Caixa', variacaoCaixa],
  ];

  const hasMovement =
    dreRows.some((r) => Number(r.value) !== 0) ||
    dfcRows.some(([, v]) => Number(v) !== 0);

  const exportDRE_CSV = useCallback(() => {
    const headers = ['Grupo', 'Valor (R$)'];
    const rows = dreRows.map((r) => [
      r.group,
      Number(r.value || 0).toFixed(2).replace('.', ','),
    ]);
    downloadCSV('dre', headers, rows);
  }, [dreRows]);

  const exportDFC_CSV = useCallback(() => {
    const headers = ['Classificação', 'Valor (R$)'];
    const rows = dfcRows.map(([label, value]) => [
      label,
      Number(value || 0).toFixed(2).replace('.', ','),
    ]);
    downloadCSV('dfc', headers, rows);
  }, [dfcRows]);

  const showPeriodEmpty = journal.length > 0 && !hasMovement;

  return (
    <section
      className={
        embedded ? 'mt-4 finance-reports-tab finance-reports-tab--embedded' : 'mt-4 animate-in finance-reports-tab finance-reports-tab--delayed'
      }
    >
      {!embedded ? <h3 className="navi-section-heading mb-2">Relatórios</h3> : null}
      {journal.length === 0 && typeof onGoToLancamentos === 'function' ? (
        <div className="finance-reports-hint" role="status">
          <span>Para ver os relatórios com dados do diário, abra a aba Lançamentos primeiro ou aguarde a sincronização automática.</span>
          <button type="button" className="btn-secondary finance-reports-hint__btn" onClick={() => onGoToLancamentos()}>
            Ir para Lançamentos
          </button>
        </div>
      ) : null}
      <div className="finance-reports-filters">
        {academyId ? (
          <FinanceRegimeToggle
            academyId={academyId}
            value={regime}
            onChange={setRegime}
            className="mb-2"
          />
        ) : null}
        <p className="text-xs text-muted finance-reports-filters__regime-note" role="status">
          DRE pelo livro razão · regime {financeRegimeLabel(regime).toLowerCase()}
          {regime === FINANCE_REGIME.COMPETENCE
            ? ' (lançamentos sem competência usam data de pagamento no razão)'
            : ''}
        </p>
        {!embedded ? (
          <>
            <div className="form-group finance-reports-date-field">
              <label>De</label>
              <DateInputField className="form-input navi-date-filter" type="date" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
            </div>
            <div className="form-group finance-reports-date-field">
              <label>Até</label>
              <DateInputField className="form-input navi-date-filter" type="date" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
            </div>
          </>
        ) : null}
        <div className="form-group finance-reports-method-field">
          <label>Método DFC</label>
          <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="indireto">Indireto</option>
            <option value="direto">Direto</option>
          </select>
        </div>
        <div className="flex gap-2 finance-reports-actions">
          <button type="button" className="btn-action-ghost" onClick={exportDRE_CSV}>
            ↓ Exportar DRE
          </button>
          <button type="button" className="btn-action-ghost" onClick={exportDFC_CSV}>
            ↓ Exportar DFC
          </button>
        </div>
      </div>
      {showPeriodEmpty ? (
        <EmptyState
          variant="default"
          tone="dashed"
          icon={BarChart3}
          title="Nenhum movimento no período"
          description="Selecione um período com lançamentos registrados."
          role="status"
        />
      ) : (
        <>
          <div className="finance-reports-block">
            <h4>Demonstração do Resultado (DRE)</h4>
            <div>
              {dreRows.map((row) => (
                <div
                  key={row.group}
                  className={`finance-reports-row${row.isTotal ? ' finance-reports-row--total' : ''}`}
                >
                  <span className="finance-reports-row__label">
                    {row.group}
                    {row.warn ? (
                      <span
                        className="badge badge-warning finance-reports-unclassified-badge"
                        title="Há lançamentos com categoria não mapeada no plano fixo"
                      >
                        não classificado
                      </span>
                    ) : null}
                  </span>
                  <span className="finance-reports-row__value">{fmt(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="finance-reports-block">
            <h4>Demonstração do Fluxo de Caixa (DFC)</h4>
            <div>
              {dfcRows.map(([k, v], idx) => (
                <div
                  key={k}
                  className={`finance-reports-row${idx === dfcRows.length - 1 ? ' finance-reports-row--total' : ''}`}
                >
                  <span>{k}</span>
                  <span className="finance-reports-row__value">{fmt(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
