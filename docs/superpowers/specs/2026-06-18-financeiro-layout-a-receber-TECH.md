# Layout A receber — Mensalidades e Cobrança — TECH Spec

**Data:** 2026-06-18  
**PRODUCT:** [2026-06-18-financeiro-layout-a-receber-PRODUCT.md](./2026-06-18-financeiro-layout-a-receber-PRODUCT.md)

---

## 1. Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/finance/finance.css` | Restaurar bloco CSS mensalidades list/mobile; estilos filtros cobrança |
| `src/components/finance/CobrancaPanel.jsx` | Remover KPI duplicado e Atualizar local; `refreshToken` prop |
| `src/components/finance/ReceivablesTab.jsx` | Passar `refreshToken` ao `CobrancaPanel` |
| `src/test/cobrancaPanel.test.jsx` | Ajustar asserções pós-remoção de KPI interno |

---

## 2. Mensalidades — restauração CSS

Migrar para `finance.css` o bloco removido de `index.css` (pré-`71e1b95`), incluindo:

- `.mensal-table-wrap--desktop` + sticky thead
- `.mensal-row--*`, `.mensal-cell-*`, `.mensal-status-badge--*`
- `.mensal-group-*`, `.mensal-th-sort`
- `.mensal-mobile-list { display: none }` + `.mensal-mobile-card*`
- `@media (max-width: 768px)` alternando tabela/cards
- `.mensal-mobile-grid*` (grade e exceções no mobile)

**Sem alteração em JS:** `MensalidadesListTable` já renderiza ambos os layouts; o CSS controla visibilidade (padrão original).

Tokens: reutilizar variáveis existentes (`--border-light`, `--color-primary`, `--finance-color-negative`).

---

## 3. Cobrança — consolidar refresh

```jsx
// ReceivablesTab.jsx
<CobrancaPanel
  academyId={academyId}
  onSectionChange={handleSectionChange}
  refreshToken={refreshToken}
/>
```

```jsx
// CobrancaPanel.jsx
export default function CobrancaPanel({ academyId, onSectionChange, refreshToken = 0 }) {
  // ...
  useEffect(() => {
    void load();
  }, [load, refreshToken]);
  // Remover refreshToken local e botão Atualizar da toolbar
}
```

Evento `navi-student-payment-updated` permanece para refresh automático pós-pagamento.

---

## 4. Cobrança — layout de filtros

Substituir `mensal-collection-dashboard` (métricas + chips) por:

```html
<section class="cobranca-panel__filters card">
  <p class="cobranca-panel__filters-label">Filtrar por etapa da régua</p>
  <div class="cobranca-panel__stage-chips">
    <button class="cobranca-stage-chip">Todos <span class="cobranca-stage-chip__count">N</span></button>
    <!-- D+N chips -->
  </div>
</section>
```

CSS: chips estilo pill (`border`, `padding`, estado `--active` com `--color-primary`).

---

## 5. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Conflito CSS duplicado | Inserir bloco após regras `.mensalidades-page`; não duplicar `--cancelled` já existente |
| Refresh em loop | `refreshToken` é número incrementado pelo pai; `load` estável via `useCallback` |
| Teste quebra em "Inadimplentes" | Assert em "Filtrar por etapa" + linha da tabela |

---

## 6. Verificação

```bash
npm test -- cobrancaPanel
```
