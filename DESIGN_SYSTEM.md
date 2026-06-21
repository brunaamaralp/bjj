# Design System (Nave)

Entry point único para padrões de UI, tokens e governança de CSS do app.

## Objetivo

Garantir consistênciaa visual entre módulos, reduzir regressões e facilitar evolução incremental do front-end.

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

## Jornadas do usuário

Fluxos end-to-end para auditoria e roteiros de demonstração: [docs/flows/README.md](docs/flows/README.md).

## Tokens e organização

Arquivos de tokens:

- `src/styles/tokens/core.css` — paleta semântica, tipografia, espaço, camadas e motion
- `src/styles/tokens/content.css` — overrides da coluna principal (`.navi-main-stack .main-content`)
- `src/styles/tokens/menu.css`
- `src/styles/tokens/inbox.css`
- `src/styles/tokens/finance.css`

Ordem de import em `src/index.css`: `core.css` → `content.css` → domínios → estilos de módulo.

Regras:

- `core.css` é a **fonte de verdade** para `--color-*` globais.
- Tokens de domínio estendem o core sem redefinir a paleta base.
- Evitar hex hardcoded em componentes; usar `var(--color-*)` ou aliases documentados abaixo.
- Novo código deve preferir `--color-primary` / `--color-accent`; não introduzir `--lima`, teal (`#004466`) ou verdes neon.

## Paleta de cores

Identidade atual: **roxo primário** (ações e foco no conteúdo), **verde sóbrio** (accent / CTAs e sucesso), **chrome escuro** na sidebar e topbar, **fundo branco** na área de conteúdo.

### Tokens canônicos (`core.css` → `:root`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-primary` | `#6C47D8` | Botões primários no conteúdo, links, ícones de seção, focus ring |
| `--color-primary-light` | `#AFA9EC` | Bordas/hover suaves, ícone de item ativo na sidebar |
| `--color-primary-surface` | `#EDE9FB` | Fundo de botão secundário, badges roxos, cards de agenda |
| `--color-primary-dark` | `#4A2FA3` | Texto em badge primário, hover de botão primário |
| `--color-accent` | `#1FAA5E` | CTA sidebar (ex.: Novo Lead), sucesso, chips ativos globais, FAB mobile |
| `--color-accent-light` | `#9FE1CB` | Detalhes em estados positivos |
| `--color-accent-surface` | `#E1F5EE` | Fundo de badge de sucesso / follow-up positivo |
| `--color-accent-dark` | `#085041` | Texto em badge de sucesso |
| `--color-sidebar-bg` | `#13111F` | Fundo sidebar e topbar |
| `--color-topbar-bg` | `#13111F` | Igual à sidebar |
| `--color-sidebar-text` | `#7A7595` | Links inativos na sidebar |
| `--color-sidebar-active-bg` | `rgba(108, 71, 216, 0.18)` | Item de navegação ativo |
| `--color-sidebar-active-text` | `#C4B4F5` | Texto do item ativo |
| `--color-sidebar-active-icon` | `#AFA9EC` | Ícone do item ativo |
| `--color-sidebar-section` | `#3A3458` | Títulos de seção (Atendimento, Financeiro…) |
| `--color-sidebar-border` | `rgba(255, 255, 255, 0.06)` | Divisores na sidebar |
| `--color-sidebar-avatar-bg` | `#2A2640` | Fundo do avatar |
| `--color-sidebar-avatar-text` | `#AFA9EC` | Iniciais no avatar |
| `--color-content-bg` | `#FFFFFF` | Fundo da coluna principal |
| `--color-card-bg` | `#FFFFFF` | Cards e superfícies elevadas |
| `--color-card-border` | `#E8E5F5` | Borda de card e controles |

### Tokens da área de conteúdo (`content.css`)

Escopo: `.navi-main-stack .main-content`. Redefinem aliases legados (`--petroleo`, `--v500`, `--accent`, `--text`, etc.) para a paleta acima.

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-text-primary` | `#18162A` | Títulos e corpo no conteúdo |
| `--color-text-secondary` | `#9896A8` | Metadados, subtítulos |
| `--color-badge-primary-text` | `#4A2FA3` | Texto em badge roxo |
| `--color-status-positive-text` | `#085041` | Texto em badge de sucesso |
| `--color-agenda-today-bg` | `#FAFAFE` | Coluna “hoje” na agenda |

Botões na área de conteúdo (via `content.css`):

- **Primário** (`.btn-primary`): `--color-primary` + texto `#fff`
- **Secundário / outline**: superfície `--color-primary-surface`, texto `--color-primary`
- **WhatsApp** (`.wa-btn`, `.fu-btn-wa`): `--color-accent` + texto `#fff`

### Uso semântico (quando usar cada cor)

| Contexto | Token |
| --- | --- |
| Ação principal em formulários e páginas | `--color-primary` |
| CTA de alto contraste na sidebar / mobile | `--color-accent` + texto branco |
| Navegação ativa (sidebar) | `--color-sidebar-active-bg` + `--color-sidebar-active-text` |
| Estado positivo (matriculado, confirmado) | `--color-accent-surface` + `--color-accent-dark` |
| Erro / destrutivo | `--danger` / `--c500` (inalterado) |
| Aviso | `--warning` / `--dourado` (inalterado) |

### Aliases legados (`index.css`)

Mantidos para compatibilidade. **Não usar em código novo.**

| Alias | Aponta para | Substituir por |
| --- | --- | --- |
| `--lima` | `--color-accent` | `--color-accent` |
| `--petroleo` | `--color-primary` | `--color-primary` |
| `--primary` | `--color-primary` | `--color-primary` |
| `--accent` | `--color-accent` | `--color-accent` |
| `--cta` / `--success` | `--color-accent` | `--color-accent` |
| `--cta-text` | `#FFFFFF` | `#fff` ou `--cta-text` |
| `--azul-gelo` / `--bg-page` | `--color-content-bg` | `--color-content-bg` |
| `--v500` / `--v700` | primária | `--color-primary` / `--color-primary-dark` |

Cores de marca legadas ainda presentes (texto escuro, PDFs, landing pontual): `--cosmos` (`#000435`), `--ameixa`, `--dourado`. Preferir `--color-text-primary` dentro do conteúdo autenticado.

### Substituições históricas (não reintroduzir)

| Antigo | Atual |
| --- | --- |
| Verde neon (`#AAEE44`, `#A8E63D`, `#B0F000`, `#C4F135`, `--lima` literal) | `--color-accent` (`#1FAA5E`) |
| Texto escuro sobre neon (`#1a3a06`) | `#FFFFFF` sobre `--color-accent` |
| Teal petróleo (`#1E4A5C`, `#1E7A8C`, `#004466`, `rgba(0, 68, 102, …)`) | `--color-primary` / `rgba(108, 71, 216, …)` |
| Teal claro de item ativo (`#7ECFDE`) | `--color-sidebar-active-text` (`#C4B4F5`) |
| Fundo sidebar azul petróleo (`#0E1621`, `#0D1117`) | `--color-sidebar-bg` (`#13111F`) |
| Fundo cinza azulado (`#E8EDF2`, `#EEF1F5`) | `--color-content-bg` (`#FFFFFF`) |

### Exceções

- **WhatsApp oficial**: `#25D366` (e derivados) apenas em bubbles, status de conexão WA e indicadores “online” — não confundir com `--color-accent`.
- **Preset de etiquetas**: `src/lib/labelPresetColors.js` — inclui `#6C47D8` e `#1FAA5E` alinhados aos tokens.

Opacidades sobre primária: preferir `rgba(108, 71, 216, α)` ou `color-mix(in srgb, var(--color-primary) X%, transparent)` em vez de valores teal fixos.

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

- Aliases antigos (`--lima`, `--petroleo`, escalas `--v*` soltas) devem ter comentário de depreciação com data quando tocados.
- Toda nova implementação deve usar `--color-*` e primitivos shared quando houver equivalente.
- Remoção de alias somente após migração dos usos e validação visual nas rotas críticas (`/pipeline`, `/inbox`, `/financeiro`, sidebar).

## Checklist de PR (UI)

- Usa tokens `--color-*` (ou aliases legados documentados) em vez de hex fixos para cor.
- CTAs na sidebar usam `--color-accent` com texto claro; conteúdo usa `--color-primary` para `.btn-primary`.
- Header de página usa `PageHeader` (quando aplicável).
- Filtros usam `FilterBar` + `SearchField` + classes de controls.
- Confirmação destrutiva usa `ConfirmDialog` ou `ModalShell`.
- Feedback persistente usa `StatusBanner`/`ErrorBanner`.
- Sem novos `z-index` hardcoded sem justificar mapeamento para `--z-*`.
