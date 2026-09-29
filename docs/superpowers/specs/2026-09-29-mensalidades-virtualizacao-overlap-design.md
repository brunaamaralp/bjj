# Mensalidades desktop — virtualização sem sobreposição

| Campo | Valor |
|---|---|
| **Status** | Aprovado (design) |
| **Data** | 2026-09-29 |
| **Contexto** | Financeiro → A receber (Mensalidades embutida; mesma grade standalone) |
| **Persona** | recepcionista / admin / owner — desktop |

## Problema

Com muitas linhas (>40 no desktop), a grade de Mensalidades usa `@tanstack/react-virtual` com **altura estimada fixa** (~58px por aluno). Linhas reais mais altas (nome + plano, atraso, ações) não são medidas; o `translateY` posiciona o próximo aluno **por cima** do anterior. Sintoma reportado: “um aluno em cima do outro”, difícil de ler.

## Objetivos

1. Nenhuma linha de aluno/grupo sobreposta no scroll desktop.
2. Manter virtualização ligada (performance com listas grandes).
3. Leve ganho de legibilidade (padding / alinhamento da ação), sem redesign de colunas ou abas.

## Não-objetivos

- Redesign de Visão geral, Cobrança ou Outros.
- Desligar virtualização no desktop.
- Mudar filtros, colunas ou fluxo de pagamento.
- Migração estrutural de CSS para fora de `finance.css` (só o necessário para virtual rows).

## Abordagem escolhida

**Corrigir medição da virtualização** (não desligar; não só “arejar” CSS).

### Comportamento

1. **Desktop** (`MensalidadesListTable`): virtualizer com `measureElement` (ref + `data-index` nos itens virtuais). Estimativa inicial: grupo ~44px, aluno ~64–72px (chute; a medição corrige).
2. **Mobile** (mesma lista): aplicar a mesma medição — evita regressão quando cards > estimativa 168px.
3. **CSS**: `.mensal-desktop-virtual-row` / `.mensal-virtual-item` com `min-height` coerente; conteúdo da linha **sem** `overflow: hidden` que corte nome/ação; padding vertical um pouco maior nas células da tabela desktop; ação (Registrar / check) alinhada ao centro vertical da linha.
4. Limiar de virtualização atual (~40 desktop / ~50 mobile) **mantido**.

### Arquivos

- `src/components/finance/MensalidadesListTable.jsx` — measureElement, refs, estimates
- `src/components/finance/finance.css` — virtual row / densidade leve
- Teste: estender harness existente de mensalidades se houver assert de layout; senão smoke manual + regressão unitária mínima se já mockar virtualizer

## Critérios de aceite

- [ ] Desktop, academia com >40 alunos no mês: scroll sem sobreposição de linhas
- [ ] Expandir/recolher turma recalcula posições (sem “buracos” nem overlap)
- [ ] Linhas pago / em atraso / coberto legíveis; botão Registrar clicável
- [ ] Mobile: lista virtual sem cards sobrepostos após medição
- [ ] Sem mudança de colunas, filtros ou subabas de A receber

## Decisão registrada

- Opção 1 (medir + densidade leve) — aprovada pelo usuário em 2026-09-29  
- Opções descartadas: desligar virtualização; só padding sem medir
