import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, JOURNAL_COL } from '../../lib/appwrite';
import { Query } from 'appwrite';
import { useAccountingStore } from '../../store/useAccountingStore';
import { fmt } from './financeFmt.js';

export default function ReportsTab({ academyId, onGoToLancamentos }) {
  const dre = useAccountingStore((s) => s.dre);
  const dfcIndireto = useAccountingStore((s) => s.dfcIndireto);
  const dfcDireto = useAccountingStore((s) => s.dfcDireto);
  const journal = useAccountingStore((s) => s.journal);
  const setJournal = useAccountingStore((s) => s.setJournal);
  const loadByAcademy = useAccountingStore((s) => s.loadByAcademy);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('indireto');

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
  const dreTotals = new Set(['Receita Líquida', 'Lucro Bruto', 'Resultado Operacional', 'Resultado Líquido']);
  const dreRows = [
    ['Receita Bruta', dreData['Receita Bruta'] || 0],
    ['Deduções', -(Math.abs(dreData['Deduções'] || 0))],
    ['Receita Líquida', dreData['Receita Líquida'] || 0],
    ['CMV/CPV', -(Math.abs(dreData['CMV/CPV'] || 0))],
    ['Lucro Bruto', dreData['Lucro Bruto'] || 0],
    ['Despesas Operacionais', -(Math.abs(dreData['Despesas Operacionais'] || 0))],
    ['Resultado Financeiro', (dreData['Resultado Financeiro'] || 0)],
    ['Resultado Operacional', dreData['Resultado Operacional'] || 0],
    ['Imposto s/ Lucro', -(Math.abs(dreData['Imposto s/ Lucro'] || 0))],
    ['Resultado Líquido', dreData['Resultado Líquido'] || 0],
  ];
  const variacaoCaixa = (dfcData.operacional || 0) + (dfcData.investimento || 0) + (dfcData.financiamento || 0);
  const dfcRows = [
    ['Operacional', dfcData.operacional || 0],
    ['Investimento', dfcData.investimento || 0],
    ['Financiamento', dfcData.financiamento || 0],
    ['Variação de Caixa', variacaoCaixa],
  ];

  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="navi-section-heading mb-2">Relatórios</h3>
      {journal.length === 0 && typeof onGoToLancamentos === 'function' ? (
        <div className="finance-reports-hint" role="status">
          <span>Para ver os relatórios com dados do diário, abra a aba Lançamentos primeiro ou aguarde a sincronização automática.</span>
          <button type="button" className="btn-secondary" style={{ flexShrink: 0 }} onClick={() => onGoToLancamentos()}>
            Ir para Lançamentos
          </button>
        </div>
      ) : null}
      <div className="finance-reports-filters">
        <div className="form-group" style={{ width: 138 }}>
          <label>De</label>
          <input className="form-input navi-date-filter" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ width: 138 }}>
          <label>Até</label>
          <input className="form-input navi-date-filter" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="form-group" style={{ width: 200 }}>
          <label>Método DFC</label>
          <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="indireto">Indireto</option>
            <option value="direto">Direto</option>
          </select>
        </div>
      </div>
      <div className="finance-reports-block">
        <h4>Demonstração do Resultado (DRE)</h4>
        <div>
          {dreRows.map(([k, v]) => (
            <div key={k} className={`finance-reports-row${dreTotals.has(k) ? ' finance-reports-row--total' : ''}`}>
              <span>{k}</span>
              <span style={{ fontWeight: dreTotals.has(k) ? 600 : 500 }}>{fmt(v)}</span>
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
              <span style={{ fontWeight: idx === dfcRows.length - 1 ? 600 : 500 }}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
