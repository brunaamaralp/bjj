import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
import {
  ChevronDown,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  PlusCircle,
  Trash2,
  X,
} from 'lucide-react';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

const EMPTY_FORM = {
  code: '',
  name: '',
  type: 'ativo',
  nature: 'devedora',
  dreGrupo: '',
  dfcClasse: '',
  dfcSubclasse: '',
  cash: false,
  isActive: true,
};

const ACCOUNT_TYPE_LABELS = {
  ativo: 'Ativo',
  passivo: 'Passivo',
  pl: 'PL',
  receita: 'Receita',
  custo: 'Custo',
  despesa: 'Despesa',
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
    isActive: d.is_active !== false,
    createdAt: d.$createdAt || d.created_at || null,
  };
}

function accountToPayload(academyId, form) {
  return {
    academyId,
    code: String(form.code || '').trim(),
    name: String(form.name || '').trim(),
    type: form.type,
    nature: form.nature,
    dreGrupo: String(form.dreGrupo || '').trim(),
    dfcClasse: String(form.dfcClasse || '').trim(),
    dfcSubclasse: String(form.dfcSubclasse || '').trim(),
    cash: Boolean(form.cash),
    is_active: Boolean(form.isActive),
  };
}

function formatCreatedAt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
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

function AccountsActionMenu({ menu, onClose, onEdit, onAddSubconta, onDelete }) {
  if (!menu) return null;

  const protectedRow = isProtectedAccountCode(menu.account.code);

  return createPortal(
    <>
      <div className="accounts-popover-backdrop" role="presentation" onClick={onClose} />
      <div
        className="accounts-popover dropdown-panel"
        style={{ top: menu.top, left: menu.left }}
        role="menu"
      >
        <button type="button" className="dropdown-item" role="menuitem" onClick={() => onEdit(menu.account)}>
          <Pencil size={16} aria-hidden />
          Editar conta
        </button>
        {!protectedRow ? (
          <button type="button" className="dropdown-item" role="menuitem" onClick={() => onAddSubconta(menu.account)}>
            <Plus size={16} aria-hidden />
            Adicionar subconta
          </button>
        ) : null}
        <button
          type="button"
          className="dropdown-item accounts-popover-btn--danger"
          role="menuitem"
          disabled={protectedRow}
          title={protectedRow ? PROTECTED_CODE_DELETE_MESSAGE : undefined}
          onClick={() => onDelete(menu.account)}
        >
          <Trash2 size={16} aria-hidden />
          Excluir
        </button>
      </div>
    </>,
    document.body
  );
}

function AccountsAccountDrawer({
  open,
  mode,
  account,
  usageCount,
  initialForm,
  saving,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, ...initialForm }));
  const [accountingOpen, setAccountingOpen] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const protectedRow = isProtectedAccountCode(form.code);
  const title = mode === 'create' ? 'Nova conta' : 'Editar conta';

  return createPortal(
    <div className="accounts-side-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="accounts-side-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounts-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="accounts-side-drawer-header">
          <div>
            <h2 id="accounts-drawer-title" className="accounts-side-drawer-heading">
              {title}
            </h2>
            {mode === 'edit' && form.code ? (
              <p className="accounts-side-drawer-subtitle">{form.code}</p>
            ) : null}
          </div>
          <button type="button" className="accounts-side-drawer-close" aria-label="Fechar" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="accounts-side-drawer-body">
          <section className="accounts-drawer-section">
            <h3 className="accounts-drawer-section-title">Essencial</h3>
            <div className="form-group">
              <label htmlFor="acc-drawer-code">Código</label>
              <input
                id="acc-drawer-code"
                className="form-input"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              />
              {protectedRow ? (
                <p className="accounts-protected-hint" role="status">
                  <Lock size={12} aria-hidden style={{ marginRight: 6, opacity: 0.8 }} />
                  {PROTECTED_CODE_EDIT_WARNING}
                </p>
              ) : null}
            </div>
            <div className="form-group">
              <label htmlFor="acc-drawer-name">Nome</label>
              <input
                id="acc-drawer-name"
                className="form-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="acc-drawer-type">Tipo</label>
              <AccountTypeSelect
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="acc-drawer-nature">Natureza</label>
              <AccountNatureSelect
                value={form.nature}
                onChange={(e) => setForm((p) => ({ ...p, nature: e.target.value }))}
              />
            </div>
          </section>

          <section className="accounts-drawer-section">
            <button
              type="button"
              className="accounts-drawer-collapse-trigger"
              onClick={() => setAccountingOpen((v) => !v)}
              aria-expanded={accountingOpen}
            >
              <span>DRE / DFC</span>
              <ChevronDown
                size={18}
                aria-hidden
                style={{ transform: accountingOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
              />
            </button>
            {accountingOpen ? (
              <div className="accounts-drawer-collapse-body">
                <div className="form-group">
                  <label htmlFor="acc-drawer-dre">Grupo DRE</label>
                  <input
                    id="acc-drawer-dre"
                    className="form-input"
                    value={form.dreGrupo}
                    onChange={(e) => setForm((p) => ({ ...p, dreGrupo: e.target.value }))}
                    placeholder="Receita Bruta, Deduções…"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="acc-drawer-dfc">Classe DFC</label>
                  <AccountDfcSelect
                    value={form.dfcClasse}
                    onChange={(e) => setForm((p) => ({ ...p, dfcClasse: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="acc-drawer-dfc-sub">Subclasse DFC</label>
                  <input
                    id="acc-drawer-dfc-sub"
                    className="form-input"
                    value={form.dfcSubclasse}
                    onChange={(e) => setForm((p) => ({ ...p, dfcSubclasse: e.target.value }))}
                    placeholder="clientes, fornecedores…"
                  />
                </div>
                <label className="accounts-drawer-checkbox">
                  <input
                    type="checkbox"
                    checked={form.cash}
                    onChange={(e) => setForm((p) => ({ ...p, cash: e.target.checked }))}
                  />
                  Afeta caixa
                </label>
              </div>
            ) : null}
          </section>

          {mode === 'edit' ? (
            <section className="accounts-drawer-section accounts-drawer-section--readonly">
              <h3 className="accounts-drawer-section-title">Informação</h3>
              <dl className="accounts-info-dl">
                <div>
                  <dt>Uso</dt>
                  <dd>{usageCount > 0 ? `${usageCount} lançamento(s) vinculado(s)` : 'Nenhum lançamento'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <label className="accounts-drawer-checkbox accounts-drawer-checkbox--inline">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                      />
                      {form.isActive ? 'Ativa' : 'Inativa'}
                    </label>
                  </dd>
                </div>
                <div>
                  <dt>Criada em</dt>
                  <dd>{formatCreatedAt(account?.createdAt)}</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>

        <footer className="accounts-side-drawer-footer">
          {mode === 'edit' && account ? (
            <button
              type="button"
              className="btn-outline accounts-side-drawer-delete"
              disabled={protectedRow || saving}
              onClick={() => onDelete(account)}
            >
              Excluir conta
            </button>
          ) : (
            <span />
          )}
          <div className="accounts-side-drawer-footer-actions">
            <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={() => onSave(form)} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body
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
  const storageWarning = Boolean(academyId) && !ACCOUNTS_COL;

  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(null);

  const accountUsageByCode = useMemo(() => {
    if (!journal?.length) return {};
    return buildAccountUsageByCode(accounts, journal);
  }, [accounts, journal]);

  const filteredAccounts = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    const list = Array.isArray(accounts) ? [...accounts] : [];
    list.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'pt-BR'));
    if (!q) return list;
    return list.filter((a) => {
      const code = String(a.code || '').toLowerCase();
      const name = String(a.name || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [accounts, search]);

  const drawerInitialForm = useMemo(() => {
    if (!drawer || drawer.mode === 'create') {
      return drawer?.initialCode
        ? { ...EMPTY_FORM, code: drawer.initialCode, name: '' }
        : { ...EMPTY_FORM };
    }
    const acc = drawer.account;
    if (!acc) return { ...EMPTY_FORM };
    return {
      code: acc.code || '',
      name: acc.name || '',
      type: acc.type || 'ativo',
      nature: acc.nature || 'devedora',
      dreGrupo: acc.dreGrupo || '',
      dfcClasse: acc.dfcClasse || '',
      dfcSubclasse: acc.dfcSubclasse || '',
      cash: Boolean(acc.cash),
      isActive: acc.isActive !== false,
    };
  }, [drawer]);

  const drawerUsageCount = drawer?.account ? accountUsageByCode[drawer.account.code] || 0 : 0;

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
            is_active: true,
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
                isActive: true,
              });
            });
          }
        } else {
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

  useEffect(() => {
    if (!menu) return undefined;
    const onDocClick = (e) => {
      if (e.target.closest('.accounts-popover') || e.target.closest('.accounts-menu-btn')) return;
      setMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menu]);

  const openAccountMenu = useCallback((e, acc) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 200;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    let top = rect.bottom + 4;
    if (top + 160 > window.innerHeight) top = Math.max(8, rect.top - 160);
    setMenu({ account: acc, top, left });
  }, []);

  const openNewAccountDrawer = useCallback(() => {
    setDrawer({ mode: 'create', account: null, initialCode: '' });
  }, []);

  const openEditDrawer = useCallback((acc) => {
    setDrawer({ mode: 'edit', account: acc, initialCode: '' });
    setMenu(null);
  }, []);

  const handleAddSubconta = useCallback((parent) => {
    const base = String(parent.code || '').trim();
    const prefix = base ? (base.endsWith('.') ? base : `${base}.`) : '';
    setDrawer({ mode: 'create', account: null, initialCode: prefix });
    setMenu(null);
  }, []);

  const handleDeleteAccount = useCallback(
    async (acc) => {
      if (!acc || isProtectedAccountCode(acc.code)) {
        addToast({ type: 'error', message: PROTECTED_CODE_DELETE_MESSAGE });
        return;
      }
      const id = acc.id;
      if (drawer?.account?.id === id) {
        setDrawer(null);
      }
      if (academyId && ACCOUNTS_COL) {
        try {
          await databases.deleteDocument(DB_ID, ACCOUNTS_COL, id);
        } catch {
          addToast({ type: 'error', message: 'Não foi possível excluir a conta.' });
          return;
        }
      }
      deleteAccount(id);
      addToast({ type: 'success', message: 'Conta excluída.' });
    },
    [academyId, deleteAccount, addToast, drawer?.account?.id]
  );

  const requestDeleteAccount = useCallback(
    (acc) => {
      if (!acc || isProtectedAccountCode(acc.code)) {
        void handleDeleteAccount(acc);
        return;
      }
      setMenu(null);
      setConfirmDeleteAccount(acc);
    },
    [handleDeleteAccount]
  );

  const handleSaveDrawer = useCallback(
    async (form) => {
      if (!String(form.code || '').trim() || !String(form.name || '').trim()) {
        addToast({ type: 'error', message: 'Informe código e nome da conta.' });
        return;
      }
      if (!academyId) return;

      setDrawerSaving(true);
      const payload = accountToPayload(academyId, form);

      try {
        if (drawer?.mode === 'create') {
          const tempId = `temp-${Date.now()}`;
          const optimistic = {
            code: form.code,
            name: form.name,
            type: form.type,
            nature: form.nature,
            dreGrupo: form.dreGrupo,
            dfcClasse: form.dfcClasse,
            dfcSubclasse: form.dfcSubclasse,
            cash: form.cash,
            isActive: form.isActive,
            id: tempId,
            createdAt: new Date().toISOString(),
          };
          addAccount(optimistic);

          if (ACCOUNTS_COL) {
            const doc = await databases.createDocument(DB_ID, ACCOUNTS_COL, ID.unique(), payload);
            const mapped = mapDoc(doc);
            const latest = useAccountingStore.getState().accounts;
            setAccounts(
              latest
                .map((a) => (a.id === tempId ? mapped : a))
                .sort((x, y) => (x.code || '').localeCompare(y.code || '', 'pt-BR'))
            );
          }
          addToast({ type: 'success', message: 'Conta criada.' });
        } else if (drawer?.account) {
          const id = drawer.account.id;
          updateAccount(id, {
            code: form.code,
            name: form.name,
            type: form.type,
            nature: form.nature,
            dreGrupo: form.dreGrupo,
            dfcClasse: form.dfcClasse,
            dfcSubclasse: form.dfcSubclasse,
            cash: form.cash,
            isActive: form.isActive,
          });

          if (ACCOUNTS_COL) {
            await databases.updateDocument(DB_ID, ACCOUNTS_COL, id, payload);
          }
          addToast({ type: 'success', message: 'Conta atualizada.' });
        }
        setDrawer(null);
      } catch {
        addToast({ type: 'error', message: 'Não foi possível salvar a conta.' });
      } finally {
        setDrawerSaving(false);
      }
    },
    [academyId, drawer, addAccount, updateAccount, setAccounts, addToast]
  );

  const renderTypeBadge = (type) => (
    <span className={`accounts-type-badge accounts-type-badge--${type || 'ativo'}`}>
      {ACCOUNT_TYPE_LABELS[type] ?? type}
    </span>
  );

  const renderDesktopTable = () => (
    <div className="finance-table-wrap accounts-table-wrap mt-3">
      <table className="finance-table accounts-table">
        <thead>
          <tr>
            <th className="accounts-th-conta">Conta</th>
            <th className="accounts-th-tipo">Tipo</th>
            <th className="accounts-th-acoes" aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {filteredAccounts.map((acc) => {
            const usage = accountUsageByCode[acc.code] || 0;
            const protectedRow = isProtectedAccountCode(acc.code);
            const inactive = acc.isActive === false;
            return (
              <tr
                key={acc.id}
                className={`accounts-table-row${usage === 0 ? ' accounts-table-row--unused' : ''}${inactive ? ' accounts-table-row--inactive' : ''}`}
              >
                <td className="accounts-cell-conta">
                  <div className="accounts-conta-inner">
                    {protectedRow ? (
                      <span className="accounts-lock" title="Conta do sistema" aria-label="Conta protegida">
                        <Lock size={12} aria-hidden />
                      </span>
                    ) : null}
                    <span className="accounts-code">{acc.code}</span>
                    <span className="accounts-name">{acc.name}</span>
                    {usage > 0 ? (
                      <span className="accounts-usage-badge" title={`${usage} lançamento(s)`}>
                        {usage}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="accounts-cell-tipo">{renderTypeBadge(acc.type)}</td>
                <td className="accounts-cell-acoes">
                  <button
                    type="button"
                    className="accounts-menu-btn"
                    aria-label="Ações da conta"
                    aria-haspopup="menu"
                    aria-expanded={menu?.account?.id === acc.id}
                    onClick={(e) => openAccountMenu(e, acc)}
                  >
                    <MoreHorizontal size={20} aria-hidden />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filteredAccounts.length === 0 ? (
        <p className="accounts-empty text-small text-muted" role="status">
          Nenhuma conta encontrada para a busca.
        </p>
      ) : null}
    </div>
  );

  const renderMobileList = () => (
    <div className="accounts-mobile-list mt-3" aria-label="Plano de contas">
      {filteredAccounts.map((acc) => {
        const usage = accountUsageByCode[acc.code] || 0;
        const protectedRow = isProtectedAccountCode(acc.code);
        return (
          <article
            key={acc.id}
            className={`accounts-mobile-card${usage === 0 ? ' accounts-table-row--unused' : ''}`}
          >
            <div className="accounts-mobile-card__main">
              {protectedRow ? (
                <Lock size={12} className="accounts-mobile-lock" aria-hidden title="Conta do sistema" />
              ) : null}
              <span className="accounts-code">{acc.code}</span>
              <span className="accounts-name">{acc.name}</span>
              {usage > 0 ? (
                <span className="accounts-usage-badge" title={`${usage} lançamento(s)`}>
                  {usage}
                </span>
              ) : null}
            </div>
            <div className="accounts-mobile-card__right">
              {renderTypeBadge(acc.type)}
              <button type="button" className="btn-outline btn-sm" onClick={() => openEditDrawer(acc)}>
                Editar
              </button>
            </div>
          </article>
        );
      })}
      {filteredAccounts.length === 0 ? (
        <p className="accounts-empty text-small text-muted" role="status">
          Nenhuma conta encontrada.
        </p>
      ) : null}
    </div>
  );

  return (
    <section className="accounts-tab mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <div className="accounts-header">
        <h3 className="navi-section-heading accounts-header-title">Plano de Contas</h3>
        <div className="accounts-header-actions">
          <input
            type="search"
            className="form-input accounts-search"
            placeholder="Buscar código ou nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar conta"
          />
          {headingActions}
          <button type="button" className="btn-primary accounts-new-btn" onClick={openNewAccountDrawer}>
            <PlusCircle size={18} aria-hidden />
            Nova conta
          </button>
        </div>
      </div>

      {storageWarning ? (
        <div className="accounts-storage-warning" role="status">
          Plano de contas não está sendo salvo no servidor. Configure ACCOUNTS_COL nas variáveis de ambiente.
        </div>
      ) : null}

      {isMobile ? renderMobileList() : renderDesktopTable()}

      <AccountsActionMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onEdit={openEditDrawer}
        onAddSubconta={handleAddSubconta}
        onDelete={(acc) => requestDeleteAccount(acc)}
      />

      <AccountsAccountDrawer
        key={`acc-drawer-${Boolean(drawer)}-${drawer?.mode || 'create'}-${drawer?.account?.id || drawer?.initialCode || 'new'}`}
        open={Boolean(drawer)}
        mode={drawer?.mode || 'create'}
        account={drawer?.account}
        usageCount={drawerUsageCount}
        initialForm={drawerInitialForm}
        saving={drawerSaving}
        onClose={() => setDrawer(null)}
        onSave={handleSaveDrawer}
        onDelete={(acc) => requestDeleteAccount(acc)}
      />
      <ConfirmDialog
        open={Boolean(confirmDeleteAccount)}
        title="Excluir conta"
        description="Esta conta será removida do plano de contas. A operação não pode ser desfeita. Confirmar?"
        confirmLabel="Excluir"
        confirmVariant="danger"
        onClose={() => setConfirmDeleteAccount(null)}
        onConfirm={async () => {
          if (!confirmDeleteAccount) return;
          await handleDeleteAccount(confirmDeleteAccount);
          setConfirmDeleteAccount(null);
        }}
      />
    </section>
  );
}
