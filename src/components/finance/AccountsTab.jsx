import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, ACCOUNTS_COL } from '../../lib/appwrite';
import { Query, ID } from 'appwrite';
import { seedAccounts } from '../../store/useAccountingStore';
import { PlusCircle, Trash2 } from 'lucide-react';
export default function AccountsTab({
  academyId,
  accounts,
  setAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  headingActions,
}) {
  const storageWarning = Boolean(academyId) && !ACCOUNTS_COL;
  const [draft, setDraft] = useState({ code: '', name: '', type: 'ativo', nature: 'devedora', dreGrupo: '', dfcClasse: '', dfcSubclasse: '', cash: false });
  const sortedAccounts = useMemo(() => {
    const copy = Array.isArray(accounts) ? [...accounts] : [];
    copy.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    return copy;
  }, [accounts]);
  useEffect(() => {
    if (!academyId || !ACCOUNTS_COL) return;
    let active = true;
    const mapDoc = (d) => ({
      id: d.$id,
      code: d.code || '',
      name: d.name || '',
      type: d.type || 'ativo',
      nature: d.nature || 'devedora',
      dreGrupo: d.dreGrupo || '',
      dfcClasse: d.dfcClasse || '',
      dfcSubclasse: d.dfcSubclasse || '',
      cash: Boolean(d.cash),
    });
    const run = async () => {
      try {
        const res = await databases.listDocuments(DB_ID, ACCOUNTS_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderAsc('code')
        ]);
        if (!active) return;
        const docs = res.documents || [];
        if (docs.length === 0) {
          const seeds = seedAccounts();
          const payloads = seeds.map((s) => ({
            academyId,
            code: s.code,
            name: s.name,
            type: s.type,
            nature: s.nature,
            dreGrupo: s.dreGrupo || '',
            dfcClasse: s.dfcClasse || '',
            dfcSubclasse: s.dfcSubclasse || '',
            cash: Boolean(s.cash),
          }));
          const results = await Promise.allSettled(
            payloads.map((payload) =>
              databases.createDocument(DB_ID, ACCOUNTS_COL, ID.unique(), payload)
            )
          );
          const created = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => mapDoc(r.value));
          if (!active) return;
          if (created.length > 0) {
            setAccounts(created);
          } else {
            seeds.forEach((s) => {
              addAccount({
                code: s.code,
                name: s.name,
                type: s.type,
                nature: s.nature,
                dreGrupo: s.dreGrupo || '',
                dfcClasse: s.dfcClasse || '',
                dfcSubclasse: s.dfcSubclasse || '',
                cash: Boolean(s.cash),
              });
            });
          }
        } else {
          if (active) setAccounts(docs.map(mapDoc));
        }
      } catch (e) { const _ = e; }
    };
    run();
    return () => { active = false; };
  }, [academyId, setAccounts, addAccount]);
  const onAdd = () => {
    if (!draft.code || !draft.name) return;
    if (academyId && ACCOUNTS_COL) {
      databases.createDocument(DB_ID, ACCOUNTS_COL, 'unique()', {
        academyId,
        code: draft.code,
        name: draft.name,
        type: draft.type,
        nature: draft.nature,
        dreGrupo: draft.dreGrupo || '',
        dfcClasse: draft.dfcClasse || '',
        dfcSubclasse: draft.dfcSubclasse || '',
        cash: Boolean(draft.cash),
      }).then((doc) => {
        addAccount({ ...draft, id: doc.$id });
      }).catch(() => {
        addAccount(draft);
      });
    } else {
      addAccount(draft);
    }
    setDraft({ code: '', name: '', type: 'ativo', nature: 'devedora', dreGrupo: '', dfcClasse: '', dfcSubclasse: '', cash: false });
  };
  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <div className="flex items-center justify-between gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
        <h3 className="navi-section-heading" style={{ marginBottom: 0 }}>Plano de Contas</h3>
        {headingActions ? <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>{headingActions}</div> : null}
      </div>
      {storageWarning ? (
        <div
          style={{
            background: '#FEF3C7',
            border: '0.5px solid #F5A623',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#B45309',
            marginBottom: 12,
          }}
        >
          Plano de contas não está sendo salvo no servidor.
          Configure ACCOUNTS_COL nas variáveis de ambiente.
        </div>
      ) : null}
      <div className="finance-accounts-form-card">
        <div className="ctx-label" style={{ marginBottom: 10 }}>Nova conta</div>
        <div className="finance-accounts-form-grid">
          <div className="form-group">
            <label>Código</label>
            <input className="form-input" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="1.1.1" />
          </div>
          <div className="form-group">
            <label>Nome</label>
            <input className="form-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
        </div>
        <div className="finance-accounts-form-grid finance-accounts-form-grid--row2 mt-2">
          <div className="form-group">
            <label>Tipo</label>
            <select className="form-input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option value="ativo">Ativo</option>
              <option value="passivo">Passivo</option>
              <option value="pl">PL</option>
              <option value="receita">Receita</option>
              <option value="custo">Custo</option>
              <option value="despesa">Despesa</option>
            </select>
          </div>
          <div className="form-group">
            <label>Natureza</label>
            <select className="form-input" value={draft.nature} onChange={(e) => setDraft({ ...draft, nature: e.target.value })}>
              <option value="devedora">Devedora</option>
              <option value="credora">Credora</option>
            </select>
          </div>
          <div className="form-group">
            <label>Grupo DRE</label>
            <input className="form-input" value={draft.dreGrupo} onChange={(e) => setDraft({ ...draft, dreGrupo: e.target.value })} placeholder="Receita Bruta, Deduções…" />
          </div>
          <div className="form-group">
            <label>Classe DFC</label>
            <select className="form-input" value={draft.dfcClasse} onChange={(e) => setDraft({ ...draft, dfcClasse: e.target.value })}>
              <option value="">—</option>
              <option value="Operacional">Operacional</option>
              <option value="Investimento">Investimento</option>
              <option value="Financiamento">Financiamento</option>
              <option value="Caixa">Caixa</option>
            </select>
          </div>
        </div>
        <div className="finance-accounts-form-grid finance-accounts-form-grid--row3 mt-2">
          <div className="form-group">
            <label>Subclasse DFC</label>
            <input className="form-input" value={draft.dfcSubclasse} onChange={(e) => setDraft({ ...draft, dfcSubclasse: e.target.value })} placeholder="clientes, fornecedores…" />
          </div>
          <div className="form-group">
            <label>Afeta Caixa</label>
            <select className="form-input" value={draft.cash ? 'sim' : 'nao'} onChange={(e) => setDraft({ ...draft, cash: e.target.value === 'sim' })}>
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label style={{ visibility: 'hidden' }} aria-hidden>Adicionar</label>
            <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={onAdd}><PlusCircle size={18} /> Adicionar</button>
          </div>
        </div>
      </div>
      <div className="finance-table-wrap mt-3">
        <table className="finance-table">
          <thead>
            <tr>
              <th style={{ minWidth: 100 }}>Código</th>
              <th style={{ minWidth: 140 }}>Nome</th>
              <th>Tipo</th>
              <th>Natureza</th>
              <th>DRE</th>
              <th>DFC</th>
              <th style={{ textAlign: 'center', width: 72 }}>Caixa</th>
              <th className="finance-num" style={{ width: 56 }} aria-label="Excluir" />
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.map((a) => (
              <tr key={a.id} className="finance-accounts-row">
                <td>
                  <input className="form-input" value={a.code} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { code: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { code: val }).catch(() => {});
                  }} />
                </td>
                <td>
                  <input className="form-input" value={a.name} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { name: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { name: val }).catch(() => {});
                  }} />
                </td>
                <td>
                  <select className="form-input" value={a.type} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { type: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { type: val }).catch(() => {});
                  }}>
                    <option value="ativo">Ativo</option>
                    <option value="passivo">Passivo</option>
                    <option value="pl">PL</option>
                    <option value="receita">Receita</option>
                    <option value="custo">Custo</option>
                    <option value="despesa">Despesa</option>
                  </select>
                </td>
                <td>
                  <select className="form-input" value={a.nature} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { nature: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { nature: val }).catch(() => {});
                  }}>
                    <option value="devedora">Devedora</option>
                    <option value="credora">Credora</option>
                  </select>
                </td>
                <td>
                  <input className="form-input" value={a.dreGrupo || ''} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { dreGrupo: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { dreGrupo: val }).catch(() => {});
                  }} />
                </td>
                <td>
                  <select className="form-input" value={a.dfcClasse || ''} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { dfcClasse: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { dfcClasse: val }).catch(() => {});
                  }}>
                    <option value="">—</option>
                    <option value="Operacional">Operacional</option>
                    <option value="Investimento">Investimento</option>
                    <option value="Financiamento">Financiamento</option>
                    <option value="Caixa">Caixa</option>
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={!!a.cash} onChange={(e) => {
                    const val = e.target.checked;
                    updateAccount(a.id, { cash: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { cash: val }).catch(() => {});
                  }} />
                </td>
                <td className="finance-num">
                  <button
                    type="button"
                    className="btn-ghost finance-accounts-delete"
                    title="Remover conta"
                    onClick={() => {
                      const id = a.id;
                      if (academyId && ACCOUNTS_COL) databases.deleteDocument(DB_ID, ACCOUNTS_COL, id).catch(() => {});
                      deleteAccount(id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
