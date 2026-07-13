# Relatório Financeiro — Layout & Hierarquia Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir hierarquia visual, ruído de texto e densidade do painel **Resumo financeiro** em `/reports?tab=financeiro`, sem alterar dados ou APIs.

**Architecture:** Mudanças puramente de UI em `ReportsFinancePanel` + `ReportKpiCard` + `reports.css`. Reutilizar padrões já existentes no módulo Relatórios (`reports-section-footer-links-row`, `reports-drill-modal` flex, `hintStyle="tooltip"` do `FinanceRegimeToggle`). Três PRs encadeados (P0 → P1 → P2) para revisão incremental.

**Tech Stack:** React 19, CSS tokens (`reports.css`, `modal-shell-variants.css`), Vitest + Testing Library.

**Specs relacionadas:**
- [PRODUCT — evolução UX](../specs/2026-07-12-relatorio-financeiro-ux-evolucao-PRODUCT.md) (fases 1–3 já implementadas)
- [TECH — evolução UX](../specs/2026-07-12-relatorio-financeiro-ux-evolucao-TECH.md)
- Fluxo: [relatorios-indicadores.md](../../flows/analise/relatorios-indicadores.md)

---

## Diagnóstico (baseline)

| Problema | Causa no código |
|----------|-----------------|
| Toggle de regime “solto” | `FinanceRegimeToggle` com `hintStyle` default `inline`; `finance.css` não carregado em Relatórios |
| Texto duplicado | Subtítulo da seção + `reports-panel-note` repetem “Movimentações liquidadas” |
| Atalhos sem separação | `FinanceReportLinks` usa `.reports-finance-links`; padrão canônico é `.reports-section-footer-links-row` |
| Sem respiro vertical | Filhos diretos em `ReportsPanelSection` sem wrapper com `gap` |
| Trend de despesas “vermelho” quando caiu | `ReportKpiCard`: `isUp = trend >= 0` para todas as métricas |
| “vs. período anterior” 3× | `trendLabel` repetido em cada card |
| “A RECEBER (JUL…)” estranho | `.report-kpi-card__label { text-transform: uppercase }` global |
| KPIs apertados em 4 colunas | `@container (min-width: 720px)` + `clamp(1.6rem, 2vw, 2rem)` no valor |

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/components/reports/ReportsFinancePanel.jsx` | Composição do painel, toggle, KPIs, atalhos |
| `src/components/reports/shared/ReportKpiCard.jsx` | Trend polarity, label variant, trend label opcional |
| `src/components/reports/reports.css` | Grid breakpoints, tokens de valor KPI, seção financeira, footer links |
| `src/components/finance/FinanceRegimeToggle.jsx` | (somente leitura) — já suporta `hintStyle="tooltip"` |
| `src/test/reportsFinancePanel.test.jsx` | Asserts de estrutura DOM e classes |
| `src/test/reportKpiCard.test.jsx` | **Criar** — trend polarity e label variant |
| `docs/flows/analise/relatorios-indicadores.md` | Checklist Seção A |
| `docs/flows/VALIDATION.md` | Evidências de QA |

**Não tocar:** APIs, `reportsLightHandler`, drill dialog (scroll já corrigido em `ca08e5e0`).

---

## Estratégia de PRs

| PR | Escopo | Risco | Estimativa |
|----|--------|-------|------------|
| **PR-A (P0)** | Regime tooltip, remover nota duplicada, footer links, gap | Baixo | ~80 LOC |
| **PR-B (P1)** | Trend polarity, footnote única, label sentence-case | Médio | ~120 LOC |
| **PR-C (P2)** | Grid 900px + token valor KPI | Baixo | ~40 LOC |

Cada PR deve passar: `npm test -- reportsFinancePanel reportKpiCard`

---

## PR-A — P0 Quick wins

### Task 1: Regime em tooltip (sem importar `finance.css`)

**Files:**
- Modify: `src/components/reports/ReportsFinancePanel.jsx`
- Modify: `src/components/reports/reports.css`

- [ ] **Step 1:** Em `ReportsFinancePanel`, passar ao toggle:

```jsx
<FinanceRegimeToggle
  academyId={academyId}
  value={regime}
  onChange={setRegime}
  hintStyle="tooltip"
  className="reports-finance-regime"
/>
```

Referência: `TransacoesTab.jsx` linha ~1400 já usa `hintStyle="tooltip"`.

- [ ] **Step 2:** Adicionar em `reports.css`:

```css
.reports-finance-regime {
  margin-bottom: 0;
}

.reports-finance-regime.finance-regime-toggle {
  align-items: center;
  gap: var(--space-2, 8px);
}
```

> **Decisão:** Não importar `finance.css` inteiro em Relatórios (evita vazamento de estilos do hub Financeiro). O estado ativo `.finance-regime-active` já funciona via `btn-outline` global; se o botão ativo ficar sem destaque roxo, copiar **apenas** `.finance-regime-active` (~4 linhas) para `reports.css`.

- [ ] **Step 3:** Teste — painel gestor não renderiza `.finance-regime-toggle__hint` (parágrafo inline):

```jsx
expect(container.querySelector('.finance-regime-toggle__hint')).toBeNull();
expect(container.querySelector('.finance-regime-toggle__hint-icon')).toBeTruthy();
```

- [ ] **Step 4:** Commit `fix(reports): regime financeiro em tooltip na aba Financeiro`

---

### Task 2: Remover `reports-panel-note` redundante

**Files:**
- Modify: `src/components/reports/ReportsFinancePanel.jsx`

- [ ] **Step 1:** Remover o bloco `<p className="reports-panel-note">` para gestores (`!isLimited`).

- [ ] **Step 2:** Manter nota **somente** em `scope: basic`:

```jsx
{isLimited ? (
  <p className="reports-panel-note" role="status">
    Resumo operacional do período (valores liquidados no Caixa).
  </p>
) : null}
```

- [ ] **Step 3:** Subtítulo da seção permanece fonte única do período:

```jsx
subtitle={`Movimentações liquidadas · ${from} — ${to}`}
```

- [ ] **Step 4:** Atualizar teste se assertava texto “regime caixa”.

- [ ] **Step 5:** Commit `refactor(reports): remover nota duplicada no resumo financeiro`

---

### Task 3: Atalhos no footer canônico

**Files:**
- Modify: `src/components/reports/ReportsFinancePanel.jsx` (`FinanceReportLinks`)
- Modify: `src/components/reports/reports.css`

- [ ] **Step 1:** Trocar wrapper:

```jsx
<nav className="reports-section-footer-links-row" aria-label="Atalhos financeiros">
  {/* links com className="reports-inline-link" */}
</nav>
```

- [ ] **Step 2:** Remover ou depreciar `.reports-finance-links` se não houver outros usos (grep antes de deletar).

- [ ] **Step 3:** Teste — links dentro de `.reports-section-footer-links-row`:

```jsx
const footer = screen.getByRole('navigation', { name: /Atalhos financeiros/i });
expect(footer).toHaveClass('reports-section-footer-links-row');
```

- [ ] **Step 4:** Commit `style(reports): atalhos financeiros com footer padronizado`

---

### Task 4: Gap vertical no corpo da seção

**Files:**
- Modify: `src/components/reports/ReportsFinancePanel.jsx`
- Modify: `src/components/reports/reports.css`

- [ ] **Step 1:** Envolver conteúdo abaixo do heading em:

```jsx
<div className="reports-finance-section-body">
  {/* banner basic, toggle, truncated warning, kpi grid, links */}
</div>
```

- [ ] **Step 2:** CSS:

```css
.reports-finance-section-body {
  display: flex;
  flex-direction: column;
  gap: var(--reports-gap-md, 16px);
}
```

- [ ] **Step 3:** Remover `className="mb-2"` do toggle e banners onde o gap substitui margin ad hoc.

- [ ] **Step 4:** Verificação visual — espaço uniforme entre toggle → grid → footer.

- [ ] **Step 5:** Commit `style(reports): gap vertical no corpo do resumo financeiro`

---

### PR-A — Checklist de aceite

- [ ] Gestor: uma linha de período no subtítulo; regime só no toggle com ícone `(i)`
- [ ] Membro basic: banner info + nota curta (sem toggle)
- [ ] Atalhos com `border-top` separando do grid
- [ ] `npm test -- reportsFinancePanel` verde
- [ ] Atualizar `docs/flows/VALIDATION.md` item “Financeiro layout P0”

---

## PR-B — P1 Hierarquia

### Task 5: Trend com cor por métrica

**Files:**
- Modify: `src/components/reports/shared/ReportKpiCard.jsx`
- Modify: `src/components/reports/ReportsFinancePanel.jsx`
- Create: `src/test/reportKpiCard.test.jsx`
- Modify: `src/lib/reportsFinanceKpiTrend.js` (opcional — helper puro)

- [ ] **Step 1:** Adicionar prop `trendDirection = 'higher'` (`'higher' | 'lower'`):

```jsx
// higher: trend positivo = bom (verde)
// lower: trend negativo = bom (verde) — ex.: despesas caíram
const trendIsGood =
  trendDirection === 'lower' ? trend < 0 : trend > 0;
const trendIsNeutral = trend === 0;
// classes: is-good | is-bad | is-neutral (substituir is-up/is-down cego)
```

- [ ] **Step 2:** CSS em `reports.css`:

```css
.report-kpi-card__trend.is-good { color: var(--success-text, ...); }
.report-kpi-card__trend.is-bad { color: var(--danger, ...); }
.report-kpi-card__trend.is-neutral { color: var(--color-text-secondary); }
```

Manter `is-up`/`is-down` como fallback quando `trendDirection` omitido (retrocompat Funil/Alunos).

- [ ] **Step 3:** Em `ReportsFinancePanel`:

| KPI | `trendDirection` |
|-----|------------------|
| Recebido | `higher` |
| Despesas | `lower` |
| Saldo | `higher` |

- [ ] **Step 4:** Testes unitários `reportKpiCard.test.jsx`:

```jsx
it('despesas: trend -20% com direction lower renderiza is-good', ...);
it('recebido: trend -20% com direction higher renderiza is-bad', ...);
```

- [ ] **Step 5:** Commit `feat(reports): trend semantico por metrica no KPI card`

---

### Task 6: Footnote única “vs. período anterior”

**Files:**
- Modify: `src/components/reports/ReportsFinancePanel.jsx`
- Modify: `src/components/reports/reports.css`

- [ ] **Step 1:** Remover `trendLabel` de todos os `ReportKpiCard` do painel financeiro.

- [ ] **Step 2:** Após `</div>` do `.reports-kpi-grid`, renderizar condicional:

```jsx
{hasPrev && (receivedTrend != null || expensesTrend != null || balanceTrend != null) ? (
  <p className="reports-kpi-grid-footnote" role="note">
    Variação percentual vs. período anterior ({prev.from} — {prev.to}).
  </p>
) : null}
```

Calcular `prev` via `previousPeriodRange(preset, { from, to })` em `useMemo` (já existe lógica de fetch).

- [ ] **Step 3:** CSS:

```css
.reports-kpi-grid-footnote {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}
```

- [ ] **Step 4:** Teste — no máximo **um** elemento com texto “vs. período anterior” no painel.

- [ ] **Step 5:** Commit `style(reports): footnote unica de comparacao no grid financeiro`

**Alternativa rejeitada:** esconder label só no hover — pior para acessibilidade e mobile.

---

### Task 7: Label “A receber” sem uppercase

**Files:**
- Modify: `src/components/reports/shared/ReportKpiCard.jsx`
- Modify: `src/components/reports/reports.css`
- Modify: `src/components/reports/ReportsFinancePanel.jsx`

- [ ] **Step 1:** Prop `labelVariant = 'caps'` | `'sentence'` (default `'caps'` preserva funil/alunos).

- [ ] **Step 2:** CSS:

```css
.report-kpi-card__label--sentence {
  text-transform: none;
  letter-spacing: -0.01em;
  font-size: 0.8125rem;
  font-weight: 600;
}
```

- [ ] **Step 3:** Card “A receber”:

```jsx
<ReportKpiCard
  label={receivablesMonthLabel(to)}
  labelVariant="sentence"
  ...
/>
```

- [ ] **Step 4:** Teste — label não tem `text-transform: uppercase` computado (ou classe `--sentence` presente).

- [ ] **Step 5:** Commit `style(reports): label sentence-case no KPI A receber`

---

### PR-B — Checklist de aceite

- [ ] Despesa caiu → badge de trend verde
- [ ] Recebido caiu → badge vermelho
- [ ] Uma única nota de comparação abaixo do grid
- [ ] “A receber (jul. de 26)” legível, sem ALL CAPS
- [ ] Funil/Alunos inalterados (snapshot ou teste de não-regressão em `ReportKpiCard` default)

---

## PR-C — P2 Layout

### Task 8: Grid 2×2 até ~900px

**Files:**
- Modify: `src/components/reports/reports.css`

- [ ] **Step 1:** Ajustar container queries:

```css
/* padrão: 2 colunas (mobile + tablet) */
.reports-kpi-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

/* 3 colunas opcional em largura média — só se 4 cards ficarem legíveis */
@container reports (min-width: 640px) and (max-width: 899px) {
  .reports-kpi-grid--finance {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container reports (min-width: 900px) {
  .reports-kpi-grid--finance {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
```

- [ ] **Step 2:** Em `ReportsFinancePanel`, adicionar modificador:

```jsx
<div className="reports-kpi-grid reports-kpi-grid--finance">
```

Outras abas mantêm breakpoint 720px existente.

- [ ] **Step 3:** Verificação manual em viewport 768px e 1024px.

- [ ] **Step 4:** Commit `style(reports): grid financeiro 2x2 ate 900px`

---

### Task 9: Token `--reports-kpi-value-size` para 4 colunas

**Files:**
- Modify: `src/components/reports/reports.css`

- [ ] **Step 1:** Definir no bloco `:root` ou `.reports-panel`:

```css
.reports-kpi-grid--finance .report-kpi-card__value {
  font-size: clamp(1.25rem, 1.6vw, 1.75rem);
}

.reports-kpi-grid--finance .report-kpi-card__trend {
  font-size: 11px;
}
```

- [ ] **Step 2:** Opcional — empilhar trend abaixo do valor em 4 colunas:

```css
@container reports (min-width: 900px) {
  .reports-kpi-grid--finance .report-kpi-card__value-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
```

- [ ] **Step 3:** Commit `style(reports): reduzir tipo do valor KPI no grid financeiro`

---

### PR-C — Checklist de aceite

- [ ] 768px: grid 2×2, valores legíveis, trend não corta
- [ ] ≥900px: 4 colunas sem overflow horizontal
- [ ] Outras abas de relatório sem regressão de grid

---

## Testes consolidados

```bash
# Após cada PR
npm test -- reportsFinancePanel reportKpiCard reports.test

# Opcional visual
npm run dev
# /reports?tab=financeiro — presets 7d, 30d, mês; regime caixa/competência
```

| Cenário | Esperado |
|---------|----------|
| `scope: basic` | Sem toggle, sem footnote de comparação, sem atalhos de export |
| Gestor, mês com dados | Tooltip regime, 4 KPIs, footnote se houver período anterior |
| Gestor, despesa caiu vs mês anterior | Trend despesas verde |
| Viewport 375px | Grid 2×2, footer links em coluna (já em `reports-finance-links` mobile — migrar regra para footer row) |

---

## Governança de docs

No PR final (ou PR-C):

- [ ] `docs/flows/analise/relatorios-indicadores.md` — checklist Seção A item financeiro
- [ ] `docs/flows/VALIDATION.md` — linhas P0/P1/P2 layout
- [ ] `docs/superpowers/specs/2026-07-12-relatorio-financeiro-ux-evolucao-PRODUCT.md` — adicionar seção **Fase 4 — Layout polish** com link para este plano

---

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| `finance-regime-active` sem estilo fora do Financeiro | Copiar 4 linhas para `reports.css` (Task 1) |
| Regressão em `ReportKpiCard` no funil | `trendDirection` opcional; default = comportamento atual |
| `@container` não suportado (browsers antigos) | Fallback 2 colunas já é o default — OK |
| Footnote com datas do período anterior confunde | Incluir intervalo `prev.from — prev.to` explícito |

---

## Ordem de execução recomendada

1. PR-A completo → deploy / validação visual
2. PR-B (Tasks 5–7) — pode paralelizar 7 com 5–6
3. PR-C — após confirmar que P1 não exige ajuste fino de espaço

**Estimativa total:** 3 PRs · ~240 LOC · 4–6 h dev + QA manual
