# Menus dropdown

Padrão visual e de comportamento para painéis flutuantes de menu e seleção no app Nave.

## Componentes

```jsx
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItem,
  DropdownMenuItemStatic,
  DropdownMenuLabel,
  DropdownMenuHeader,
  DropdownMenuDivider,
  DropdownMenuBackdrop,
} from '../components/shared/menu';
import { useDismissibleMenu } from '../hooks/useDismissibleMenu';
```

- **`DropdownMenu`**: wrapper `position: relative` + click-outside + `Escape`.
- **`DropdownMenuPanel`**: painel (`navi-menu__panel`). Props: `fixed`, `elevated`, `style` (posição fixa).
- **`DropdownMenuItem`**: ação (`role="menuitem"`). Props: `danger`, `active`, `disabled`, `icon`.
- **`DropdownMenuItemStatic`**: linha não clicável (ex.: vazio).
- **`DropdownMenuLabel`**: rótulo de seção (uppercase).
- **`DropdownMenuHeader`**: bloco de cabeçalho (conta, título).
- **`DropdownMenuDivider`**: separador.
- **`DropdownMenuBackdrop`**: overlay transparente ou `--dim` via classe `navi-menu__backdrop--dim`.

## Tokens CSS (`:root`)

| Token | Uso |
|-------|-----|
| `--menu-radius` | Raio do painel (12px) |
| `--menu-shadow` | Sombra do painel |
| `--menu-gap` | Distância trigger → painel |
| `--menu-z` / `--menu-z-elevated` | Camadas (padrão 1200 / kanban 9000) |
| `--menu-item-*` | Padding, hover, ativo, perigo |

Classes base: `.navi-menu`, `.navi-menu__panel`, `.navi-menu__item`.

Aliases legados (migração): `.dropdown-panel`, `.dropdown-item` herdam o mesmo visual quando usados com o painel.

## Quando usar

| Padrão | Uso |
|--------|-----|
| Menu de ações (⋯) | Linhas de tabela, cards — `DropdownMenu` + itens |
| Filtro / listbox | `CompactStatusFilter` — `role="listbox"` + opções com `navi-menu__item` |
| Menu de conta | `NaviUserMenu` — trigger próprio + painel `navi-menu__panel` |
| Menu contextual fixo (Inbox) | `navi-menu__panel--overlay` + backdrop `--dim` |
| `<select>` nativo | Planos, turmas — **não** substituir por menu custom |

## Comportamento

- Fechar com **Escape** e **click outside** (`useDismissibleMenu` / `DropdownMenu`).
- Trigger: `aria-expanded`, `aria-haspopup="menu"` ou `"listbox"`.
- Ações destrutivas: `danger` em `DropdownMenuItem` ou classe `navi-menu__item--danger`.
- Confirmações bloqueantes: `ConfirmDialog` (ver [ux-feedback.md](ux-feedback.md)), não `window.confirm`.

## z-index

| Camada | Valor | Exemplo |
|--------|-------|---------|
| Filtros em página | 40 | Mensalidades |
| Menu padrão | `--menu-z` (1200) | Produtos, conta |
| Kanban / DnD | `--menu-z-elevated` (9000) | Pipeline |
| Inbox overlay | 80–81 | Menu de conversa |

## Anti-padrões

- Novo bloco `*-actions-menu__panel` por feature.
- `style={{ boxShadow, borderRadius }}` em painéis de menu.
- `--surface-2` ou variáveis inexistentes no hover.
- z-index arbitrário sem `elevated` no Pipeline.
