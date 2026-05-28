# Controles e toolbars

Padrão visual para barras de busca, filtros, inputs e botões alinhados na mesma linha (altura, padding e raio).

## Tokens CSS (`:root`)

| Token | Valor | Uso |
|-------|-------|-----|
| `--control-height-toolbar` | 36px | Barras, filtros, hub tabs |
| `--control-height-form` | 40px | Formulários e modais |
| `--control-height-touch` | 44px | Mobile (inputs nativos) |
| `--control-radius` | `var(--radius-sm)` (10px) | Inputs e botões |
| `--control-pad-x` | 12px | Padding horizontal (toolbar) |
| `--control-pad-x-btn` | 16px | Botões em formulário |
| `--control-gap` | 8px | Espaço entre itens na barra |
| `--control-font-size` | 13px | Texto em controles |
| `--control-border` | 1px solid var(--v100) | Borda padrão |

## Classes

| Classe | Uso |
|--------|-----|
| `.navi-toolbar` | Container flex alinhado (`align-items: center`, `gap: var(--control-gap)`) |
| `.navi-control` | Input/select base (altura form) |
| `.navi-control--toolbar` | Input/select na barra (36px) |
| `.navi-search` | Busca com ícone (alias legado: `.page-header-search`) |
| `.navi-btn--toolbar` | Botão na barra (mesma altura que busca) |
| `.navi-btn--touch` | Botão 44px (CTA mobile) |
| `.btn-action-ghost` / `.btn-action-primary` | Botões de ação na toolbar (já usam tokens) |

## Componente React

```jsx
import SearchField from '../components/shared/SearchField.jsx';

<SearchField
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  placeholder="Buscar nome ou telefone..."
  aria-label="Buscar no funil"
/>
```

## Toolbar no `PageHeader`

```jsx
<PageHeader
  title="Alunos"
  subtitle="…"
  toolbar={
    <div className="page-header-row navi-toolbar">
      <SearchField value={q} onChange={…} placeholder="Buscar…" />
      <button type="button" className="btn-action-primary">Novo</button>
    </div>
  }
/>
```

Datas em barra: `className="form-input navi-date-filter navi-control--toolbar"` ou só `navi-date-filter` no funil.

## O que não padronizar

- `.filter-chip`, `.date-chip` (pills)
- `.icon-btn` circular (avatar, fechar)
- `.btn-large` (CTA full-width)
- `.navi-hub-tabs--sm` (32px — abas densas)

## Checklist de PR

- [ ] Toolbar com `.navi-toolbar` ou `.page-header-row` + `align-items: center`
- [ ] Busca via `SearchField` ou `.navi-search`
- [ ] Botões na barra: `.btn-action-*` ou `.navi-btn--toolbar`
- [ ] Sem `style` inline de `minHeight`, `padding` ou `borderRadius` em controles da barra
- [ ] Formulários fora da barra: `.form-input` (40px) ou `.navi-control--form`

## Migração

- **Feito:** tokens, classes base, `SearchField`, aliases `.page-header-search` / `.btn-action-*`, hub tabs, `.form-input`.
- **Em curso:** substituir buscas manuais e estilos inline em páginas legadas.

Ver também [page-headings.md](./page-headings.md) e [dropdown-menus.md](./dropdown-menus.md).
