import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { databases, DB_ID, ACCOUNTS_COL } from '../../lib/appwrite';
import { Query, ID } from 'appwrite';
import { seedAccounts, buildAccountUsageByCode, useAccountingStore } from '../../store/useAccountingStore';
import {
  isProtectedAccountCode,
  PROTECTED_CODE_DELETE_MESSAGE,
  PROTECTED_CODE_EDIT_WARNING,
} from '../../lib/protectedAccountCodes.js';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import { useUiStore } from '../../store/useUiStore';
import { PlusCircle, Trash2, Lock, X } from 'lucide-react';

const PERSIST_DEBOUNCE_MS = 400;
const EMPTY_DRAFT = {
  code: '',
  name: '',
  type: 'ativo',
  nature: 'devedora',
  dreGrupo: '',
  dfcClasse: '',
  dfcSubclasse: '',
  cash: false,
};

function mapDoc(d) {
  return {
    id: d.$id,
    code: d.code || '',
    name: d.name || '',
    type: d.type || 'ativo',
    nature: d.nature || 'devedora',
    dreGrupo: d.dreGrupo || '',
    dfcClasse: d.dfcClasse || '',
    dfcSubclasse: d.dfcSubclasse || '',
    cash: Boolean(d.cash),
  };
}

function useAccountFieldPersist(academyId, updateAccount) {
  const timersRef = useRef({});

  useEffect(() => () => {
    Object.values(timersRef.current).forEach(clearTimeout);
  }, []);

  return useCallback(
    (accountId, patch) => {
      updateAccount(accountId, patch);
      const timerKey = `${accountId}:${Object.keys(patch).sort().join(',')}`;
      clearTimeout(timersRef.current[timerKey]);
      timersRef.current[timerKey] = setTimeout(() => {
        if (academyId && ACCOUNTS_COL) {
          databases.updateDocument(DB_ID, ACCOUNTS_COL, accountId, patch).catch(() => {});
        }
      }, PERSIST_DEBOUNCE_MS);
    },
    [academyId, updateAccount]
  );
}

function AccountTypeSelect({ value, onChange, className = 'form-input' }) {
  return (
    <select className={className} value={value} onChange={onChange}>
      <option value="ativo">Ativo</option>
      <option value="passivo">Passivo</option>
      <option value="pl">PL</option>
      <option value="receita">Receita</option>
      <option value="custo">Custo</option>
      <option value="despesa">Despesa</option>
    </select>
  );
}

function AccountNatureSelect({ value, onChange, className = 'form-input' }) {
  return (
    <select className={className} value={value} onChange={onChange}>
      <option value="devedora">Devedora</option>
      <option value="credora">Credora</option>
    </select>
  );
}

function AccountDfcSelect({ value, onChange, className = 'form-input' }) {
  return (
    <select className={className} value={value} onChange={onChange}>
      <option value="">—</option>
      <option value="Operacional">Operacional</option>
      <option value="Investimento">Investimento</option>
      <option value="Financiamento">Financiamento</option>
      <option value="Caixa">Caixa</option>
    </select>
  );
}

function UsageBadge({ count }) {
  if (!count) {
    return <span className="finance-accounts-usage finance-accounts-usage--empty">—</span>;
  }
  return (
    <span className="finance-accounts-usage finance-accounts-usage--active" title={`${count} lançamento(s) vinculado(s)`}>
      {count}
    </span>
  );
}

function AccountsMobileDrawer({ open, account, onClose, onSave, persistField }) {
  const [local, setLocal] = useState(account || EMPTY_DRAFT);

  useEffect(() => {
    if (open && account) setLocal({ ...EMPTY_DRAFT, ...account });
  }, [open, account]);

  if (!open || !account) return null;

  const protectedRow = isProtectedAccountCode(local.code);

  const patch = (updates) => {
    setLocal((prev) => ({ ...prev, ...updates }));
    persistField(account.id, updates);
  };

  return (
    <div className="finance-accounts-drawer-backdrop" role="presentation" onClick={onClose}>
      <div
        className="finance-accounts-drawer card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounts-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 id="accounts-drawer-title" className="navi-section-heading" style={{ margin: 0 }}>
            Editar conta
          </h4>
          <button type="button" className="btn-ghost" aria-label="Fechar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="form-group">
          <label>Código</label>
          <input
            className="form-input"
            value={local.code}
            onChange={(e) => patch({ code: e.target.value })}
          />
          {protectedRow ? (
            <p className="finance-accounts-protected-hint" role="status">
              ⚠️ {PROTECTED_CODE_EDIT_WARNING}
            </p>
          ) : null}
        </div>
        <div className="form-group mt-2">
          <label>Nome</label>
          <input className="form-input" value={local.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="form-group mt-2">
          <label>Tipo</label>
          <AccountTypeSelect value={local.type} onChange={(e) => patch({ type: e.target.value })} />
        </div>
        <div className="form-group mt-2">
          <label>Natureza</label>
          <AccountNatureSelect value={local.nature} onChange={(e) => patch({ nature: e.target.value })} />
        </div>
        <div className="form-group mt-2">
          <label>Grupo DRE</label>
          <input
            className="form-input"
            value={local.dreGrupo}
            onChange={(e) => patch({ dreGrupo: e.target.value })}
          />
        </div>
        <div className="form-group mt-2">
          <label>Classe DFC</label>
          <AccountDfcSelect value={local.dfcClasse} onChange={(e) => patch({ dfcClasse: e.target.value })} />
        </div>
        <div className="form-group mt-2">
          <label>Subclasse DFC</label>
          <input
            className="form-input"
            value={local.dfcSubclasse}
            onChange={(e) => patch({ dfcSubclasse: e.target.value })}
          />
        </div>
        <div className="form-group mt-2">
          <label>Afeta Caixa</label>
          <select
            className="form-input"
            value={local.cash ? 'sim' : 'nao'}
            onChange={(e) => patch({ cash: e.target.value === 'sim' })}
          >
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        </div>
        <button type="button" className="btn-secondary mt-3" style={{ width: '100%' }} onClick={onSave}>
          Concluir
        </button>
      </div>
    </div>
  );
}

export default function AccountsTab({
  academyId,
  accounts,
  setAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  headingActions,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const journal = useAccountingStore((s) => s.journal);
  const isMobile = useMatchMobile(719);
  const persistField = useAccountFieldPersist(academyId, updateAccount);
  const storageWarning = Boolean(academyId) && !ACCOUNTS_COL;
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [mobileEdit, setMobileEdit] = useState(null);

  const sortedAccounts = useMemo(() => {
    const copy = Array.isArray(accounts) ? [...accounts] : [];
    copy.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'pt-BR'));
    return copy;
  }, [accounts]);

  const accountUsageByCode = useMemo(() => {
    if (!journal?.length) return {};
    return buildAccountUsageByCode(accounts, journal);
  }, [accounts, journal]);

  useEffect(() => {
    if (!academyId || !ACCOUNTS_COL) return;
    let active = true;
    const run = async () => {
      try {
        const res = await databases.listDocuments(DB_ID, ACCOUNTS_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderAsc('code'),
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
        } else if (active) {
          setAccounts(docs.map(mapDoc));
        }
      } catch {
        void 0;
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [academyId, setAccounts, addAccount]);

  const onAdd = () => {
    if (!draft.code || !draft.name) return;
    if (academyId && ACCOUNTS_COL) {
      databases
        .createDocument(DB_ID, ACCOUNTS_COL, 'unique()', {
          academyId,
          code: draft.code,
          name: draft.name,
          type: draft.type,
          nature: draft.nature,
          dreGrupo: draft.dreGrupo || '',
          dfcClasse: draft.dfcClasse || '',
          dfcSubclasse: draft.dfcSubclasse || '',
          cash: Boolean(draft.cash),
        })
        .then((doc) => {
          addAccount({ ...draft, id: doc.$id });
        })
        .catch(() => {
          addAccount(draft);
        });
    } else {
      addAccount(draft);
    }
    setDraft(EMPTY_DRAFT);
  };

  const handleDelete = useCallback(
    (acc) => {
      if (isProtectedAccountCode(acc.code)) {
        addToast({ type: 'error', message: PROTECTED_CODE_DELETE_MESSAGE });
        return;
      }
      const id = acc.id;
      if (academyId && ACCOUNTS_COL) {
        databases.deleteDocument(DB_ID, ACCOUNTS_COL, id).catch(() => {});
      }
      deleteAccount(id);
    },
    [academyId, deleteAccount, addToast]
  );

  const renderNewAccountForm = () => (
    <div className="finance-accounts-form-card">
      <div className="ctx-label" style={{ marginBottom: 10 }}>
        Nova conta
      </div>
      <div className="finance-accounts-form-grid">
        <div className="form-group">
          <label>Código</label>
          <input
            className="form-input"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="1.1.1"
          />
        </div>
        <div className="form-group">
          <label>Nome</label>
          <input
            className="form-input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
      </div>
      <div className="finance-accounts-form-grid finance-accounts-form-grid--row2 mt-2">
        <div className="form-group">
          <label>Tipo</label>
          <AccountTypeSelect value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Natureza</label>
          <AccountNatureSelect
            value={draft.nature}
            onChange={(e) => setDraft({ ...draft, nature: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Grupo DRE</label>
          <input
            className="form-input"
            value={draft.dreGrupo}
            onChange={(e) => setDraft({ ...draft, dreGrupo: e.target.value })}
            placeholder="Receita Bruta, Deduções…"
          />
        </div>
        <div className="form-group">
          <label>Classe DFC</label>
          <AccountDfcSelect
            value={draft.dfcClasse}
            onChange={(e) => setDraft({ ...draft, dfcClasse: e.target.value })}
          />
        </div>
      </div>
      <div className="finance-accounts-form-grid finance-accounts-form-grid--row3 mt-2">
        <div className="form-group">
          <label>Subclasse DFC</label>
          <input
            className="form-input"
            value={draft.dfcSubclasse}
            onChange={(e) => setDraft({ ...draft, dfcSubclasse: e.target.value })}
            placeholder="clientes, fornecedores…"
          />
        </div>
        <div className="form-group">
          <label>Afeta Caixa</label>
          <select
            className="form-input"
            value={draft.cash ? 'sim' : 'nao'}
            onChange={(e) => setDraft({ ...draft, cash: e.target.value === 'sim' })}
          >
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        </div>
        <div className="form-group" style={{ justifyContent: 'flex-end' }}>
          <label style={{ visibility: 'hidden' }} aria-hidden>
            Adicionar
          </label>
          <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={onAdd}>
            <PlusCircle size={18} /> Adicionar
          </button>
        </div>
      </div>
    </div>
  );

  const renderMobileList = () => (
    <div className="navi-mobile-list finance-mobile-list mt-3" aria-label="Plano de contas">
      {sortedAccounts.map((a) => {
        const usage = accountUsageByCode[a.code] || 0;
        const protectedRow = isProtectedAccountCode(a.code);
        return (
          <article
            key={a.id}
            className={`navi-mobile-card finance-mobile-card finance-accounts-mobile-card${usage === 0 ? ' finance-accounts-row--unused' : ''}`}
          >
            <div className="finance-mobile-card__head">
              <span className="finance-mobile-card__date" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {protectedRow ? (
                  <Lock size={14} aria-hidden title="Conta usada pelo espelho contábil automático" />
                ) : null}
                <strong>{a.code}</strong>
              </span>
              <UsageBadge count={usage} />
            </div>
            <div className="finance-mobile-card__name">{a.name}</div>
            <div className="finance-mobile-card__meta text-small text-muted">
              {a.type} · {a.nature}
              {a.dreGrupo ? ` · DRE: ${a.dreGrupo}` : ''}
            </div>
            <div className="navi-mobile-card__actions finance-mobile-card__actions">
              <button
                type="button"
                className="btn-outline"
                style={{ minHeight: 44, flex: 1, justifyContent: 'center' }}
                onClick={() => setMobileEdit(a)}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn-outline"
                style={{ minHeight: 44, flex: 1, justifyContent: 'center' }}
                disabled={protectedRow}
                title={protectedRow ? PROTECTED_CODE_DELETE_MESSAGE : 'Remover conta'}
                onClick={() => handleDelete(a)}
              >
                Excluir
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );

  const renderDesktopTable = () => (
    <div className="finance-table-wrap mt-3">
      <table className="finance-table">
        <thead>
          <tr>
            <th style={{ width: 36 }} aria-label="Protegida" />
            <th style={{ minWidth: 100 }}>Código</th>
            <th style={{ minWidth: 140 }}>Nome</th>
            <th>Tipo</th>
            <th>Natureza</th>
            <th>DRE</th>
            <th>DFC</th>
            <th style={{ minWidth: 100 }}>Subcl. DFC</th>
            <th style={{ textAlign: 'center', width: 72 }}>Caixa</th>
            <th style={{ width: 56, textAlign: 'center' }}>Uso</th>
            <th className="finance-num" style={{ width: 56 }} aria-label="Excluir" />
          </tr>
        </thead>
        <tbody>
          {sortedAccounts.map((a) => {
            const usage = accountUsageByCode[a.code] || 0;
            const protectedRow = isProtectedAccountCode(a.code);
            return (
              <tr
                key={a.id}
                className={`finance-accounts-row${usage === 0 ? ' finance-accounts-row--unused' : ''}`}
              >
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  {protectedRow ? (
                    <span title="Conta usada pelo espelho contábil automático" aria-label="Conta protegida">
                      <Lock size={15} style={{ opacity: 0.65 }} />
                    </span>
                  ) : null}
                </td>
                <td>
                  <input
                    className="form-input"
                    value={a.code}
                    onChange={(e) => persistField(a.id, { code: e.target.value })}
                  />
                  {protectedRow ? (
                    <p className="finance-accounts-protected-hint" role="status">
                      ⚠️ {PROTECTED_CODE_EDIT_WARNING}
                    </p>
                  ) : null}
                </td>
                <td>
                  <input
                    className="form-input"
                    value={a.name}
                    onChange={(e) => persistField(a.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <AccountTypeSelect
                    value={a.type}
                    onChange={(e) => persistField(a.id, { type: e.target.value })}
                  />
                </td>
                <td>
                  <AccountNatureSelect
                    value={a.nature}
                    onChange={(e) => persistField(a.id, { nature: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="form-input"
                    value={a.dreGrupo || ''}
                    onChange={(e) => persistField(a.id, { dreGrupo: e.target.value })}
                  />
                </td>
                <td>
                  <AccountDfcSelect
                    value={a.dfcClasse || ''}
                    onChange={(e) => persistField(a.id, { dfcClasse: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="form-input"
                    value={a.dfcSubclasse || ''}
                    onChange={(e) => persistField(a.id, { dfcSubclasse: e.target.value })}
                    placeholder="clientes…"
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!a.cash}
                    onChange={(e) => persistField(a.id, { cash: e.target.checked })}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <UsageBadge count={usage} />
                </td>
                <td className="finance-num">
                  <button
                    type="button"
                    className="btn-ghost finance-accounts-delete"
                    title={protectedRow ? PROTECTED_CODE_DELETE_MESSAGE : 'Remover conta'}
                    disabled={protectedRow}
                    onClick={() => handleDelete(a)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <div className="flex items-center justify-between gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
        <h3 className="navi-section-heading" style={{ marginBottom: 0 }}>
          Plano de Contas
        </h3>
        {headingActions ? (
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            {headingActions}
          </div>
        ) : null}
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
          Plano de contas não está sendo salvo no servidor. Configure ACCOUNTS_COL nas variáveis de ambiente.
        </div>
      ) : null}
      {!isMobile ? renderNewAccountForm() : null}
      {isMobile ? renderMobileList() : renderDesktopTable()}
      {isMobile ? (
        <>
          <div className="mt-3">{renderNewAccountForm()}</div>
          <AccountsMobileDrawer
            open={Boolean(mobileEdit)}
            account={mobileEdit}
            onClose={() => setMobileEdit(null)}
            onSave={() => setMobileEdit(null)}
            persistField={persistField}
          />
        </>
      ) : null}
    </section>
  );
}
