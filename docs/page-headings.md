# Padrão de títulos e subtítulos (Nave)

Componentes: `src/components/layout/PageHeader.jsx`, `SectionHeader.jsx`.

## Camadas

| Camada | Elemento | Classe | Uso |
|--------|----------|--------|-----|
| Título da página | `h1` | `navi-page-title` | Nome da tela; alinhar ao menu quando possível |
| Subtítulo | `p` | `navi-subtitle` | Frase fixa sobre o propósito da tela |
| Meta | `p` | `navi-eyebrow` + `navi-page-header__meta` | Contagens, período, academia (dinâmico) |
| Seção | `h2`/`h3` | `navi-section-heading` | Blocos dentro da página |
| Toolbar | `div` | `page-header-card` + `.navi-toolbar` / `.page-header-row` | Busca (`SearchField`), IA, filtros — ver [controls-toolbar.md](./controls-toolbar.md) |

## Escrita

- Português, sentence case.
- Título: 1–3 palavras.
- Subtítulo: uma frase, até ~90 caracteres.
- Um único `h1` por rota.

## Exemplo

```jsx
import PageHeader from '../components/layout/PageHeader.jsx';

<PageHeader
  title="Integrações"
  subtitle="Conecte catraca Control iD e assinatura digital Autentique."
/>
```

## Ordem de layout

1. `PageHeader`
2. `HubTabBar` (hubs)
3. Conteúdo com `SectionHeader` nas seções

## Checklist de PR

- [ ] Um `<h1>` com `navi-page-title`
- [ ] Título alinhado ao menu (ou exceção documentada)
- [ ] Subtítulo em `navi-subtitle` via `PageHeader`
- [ ] Dados dinâmicos em `meta`, não no subtítulo
- [ ] Seções com `SectionHeader` e hierarquia `h2` → `h3`
- [ ] Toolbar em `toolbar` do `PageHeader` ou `page-header-card` (controles 36px — [controls-toolbar.md](./controls-toolbar.md))
- [ ] Sem margens inline duplicadas no cabeçalho

## Migração

Concluída nas rotas principais. Páginas públicas (`PublicStudentEnrollment`, planos) mantêm layout próprio.
