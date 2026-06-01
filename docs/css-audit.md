# Auditoria de CSS (2026-05-28)

Levantamento inicial para a Fase 3 de limpeza do design system.

## Extrações realizadas do `index.css`

- Regras de menu dropdown foram extraídas para `src/components/shared/menu/menu.css`.
- `DropdownMenu.jsx` agora importa o CSS local do primitivo de menu.
- Tokens de domínio foram segregados para:
  - `src/styles/tokens/core.css` (paleta `--color-*` global)
  - `src/styles/tokens/content.css` (coluna principal)
  - `src/styles/tokens/menu.css`
  - `src/styles/tokens/inbox.css`
  - `src/styles/tokens/finance.css`

## Aliases legados com depreciação

- `.page-header-search` e variações (`input`, `input:focus`) marcados como **DEPRECATED (2026-06-30)**.
- `.dropdown-panel` e `.dropdown-item` mantidos por compatibilidade no CSS de menu com comentário de sunset.

## Candidatos a CSS morto (revisar antes de remover)

- `.status-dot-active` (sem referência clara em JSX atual).
- Família legacy `.navi-side-section*` (parte parece coberta por classes de sidebar mais novas; validar visualmente antes de remoção).

## Próximos passos

1. Validar candidatas com busca estática e smoke test manual nas rotas críticas (`/financeiro`, `/pipeline`, `/inbox`, `/students`, `/loja`, `/conta`).
2. Remover somente após confirmação visual.
3. Registrar remoções com motivo e data no changelog de UI.
