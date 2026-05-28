# Design System (Nave)

Entry point único para padrões de UI, tokens e governança de CSS do app.

## Objetivo

Garantir consistência visual entre módulos, reduzir regressões e facilitar evolução incremental do front-end.

## Arquitetura

- **Tokens core**: base global de cor semântica, tipografia, espaçamento, raios, sombras, camadas e motion.
- **Tokens de domínio**: extensões por contexto (`menu`, `inbox`, `finance`) separadas por arquivo.
- **Primitivos shared**: componentes reutilizáveis em `src/components/shared`.
- **Padrões de página**: `PageHeader`, `HubTabBar`, barras de filtro e feedback semântico.

## Fontes de verdade

- [docs/controls-toolbar.md](docs/controls-toolbar.md)
- [docs/dropdown-menus.md](docs/dropdown-menus.md)
- [docs/page-headings.md](docs/page-headings.md)
- [docs/ux-feedback.md](docs/ux-feedback.md)
- [docs/css-audit.md](docs/css-audit.md)

## Tokens e organização

Arquivos de tokens:

- `src/styles/tokens/core.css`
- `src/styles/tokens/menu.css`
- `src/styles/tokens/inbox.css`
- `src/styles/tokens/finance.css`

Regra:

- `core.css` contém escalas globais e semânticas transversais.
- Tokens de domínio ficam fora do bloco global principal para evitar acoplamento.
- Evitar novos hex hardcoded em componentes; preferir tokens existentes.

## Escalas globais mínimas

### Espaçamento (`--space-*`)

- `--space-0`, `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-5`, `--space-6`, `--space-8`, `--space-10`, `--space-12`

### Camadas (`--z-*`)

- `--z-base`, `--z-dropdown`, `--z-sticky`, `--z-overlay`, `--z-modal`, `--z-toast`, `--z-sheet`, `--z-elevated`

### Motion (`--motion-*`)

- `--motion-fast`, `--motion-base`, `--motion-slow`, `--ease-standard`

## Namespace CSS

- **Global permitido**: `navi-*` e utilitários compartilhados mínimos (`form-input`, `card`, `text-*`, `flex`).
- **Módulo obrigatório**: classes de feature devem usar prefixo de domínio (`finance-*`, `inbox-*`, `products-*`, `contracts-*`, etc.).
- **Não permitido**: novas classes genéricas sem prefixo quando o estilo for específico de módulo.

## Componentes críticos de padronização

- `PageHeader`
- `HubTabBar`
- `FilterBar`
- `SearchField`
- `FormSelect`
- `ModalShell`
- `StatusBanner` / `ErrorBanner`
- `ConfirmDialog`

## Política de legado

- Aliases antigos devem ter comentário de depreciação com data.
- Toda nova implementação deve usar primitivos shared quando houver equivalente.
- Remoção de alias somente após migração dos usos e validação visual nas rotas críticas.

## Checklist de PR (UI)

- Usa tokens (`var(--*)`) em vez de valores fixos para cor/espaço/camada.
- Header de página usa `PageHeader` (quando aplicável).
- Filtros usam `FilterBar` + `SearchField` + classes de controls.
- Confirmação destrutiva usa `ConfirmDialog` ou `ModalShell`.
- Feedback persistente usa `StatusBanner`/`ErrorBanner`.
- Sem novos `z-index` hardcoded sem justificar mapeamento para `--z-*`.
