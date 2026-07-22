# Coluna Pagador na grade de Mensalidades — Design

**Data:** 2026-07-22  
**Status:** Implementado  
**Fluxo:** [a-receber-mensalidades](../../flows/financeiro/a-receber-mensalidades.md)

---

## 1. Problem

Na conferência de mensalidades, o operador vê só o nome do aluno. Quem paga (alias do extrato, responsável ou pai/mãe) exige abrir o perfil — atrasa o cruzamento com PIX/TED e listas de conferência.

---

## 2. Goal

Mostrar na grade (e no CSV) o nome de quem paga / responsável, ao lado do aluno, com uma regra única de fallback.

**Sucesso:** na lista e no export, cada linha mostra o pagador resolvido (ou vazio/`—` se não houver dado).

---

## 3. Non-goals

- Editar responsável/alias na grade
- Filtrar ou buscar por pagador
- Exibir mais de um alias na mesma célula
- Alterar conciliação bancária ou `payer_aliases_json` no backend

---

## 4. Resolução do nome

Helper puro `resolveStudentPayerDisplayName(student)` em `src/lib/studentPayerAliases.js`:

| Prioridade | Fonte | Regra |
|------------|--------|--------|
| 1 | `student.payerAliases` | Primeiro item com `display` não vazio (trim) |
| 2 | `student.responsavel` | Trim; se vazio, próximo |
| 3 | `student.parentName` | Trim; se vazio, próximo |
| 4 | — | Retorna `''` |

UI: `''` → `—`. CSV: campo vazio (sem `—`).

---

## 5. UI

### Desktop (`MensalidadesListTable`)

Ordem das colunas:

`Aluno | Pagador | Vencimento | Valor | Conta / Plataforma | Status | Ação`

- Header: **Pagador**
- Célula: texto do helper; vazio → `—` (classe `mensal-cell-faint` como nas demais)
- Linhas de grupo por turma: `colSpan` 6 → **7**

### Mobile (card)

Abaixo do nome do aluno (meta), linha com o pagador quando houver valor; se vazio, `—` discreto (mesmo padrão de preferência de pagamento).

---

## 6. Export CSV

Em `mensalidadesGridToCsvRows`:

- Nova chave `pagador` imediatamente após `aluno`
- Valor = retorno do helper (string, possivelmente vazia)

Demais colunas inalteradas.

---

## 7. Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/lib/studentPayerAliases.js` | Exportar `resolveStudentPayerDisplayName` |
| `src/test/studentPayerAliases.test.js` | Casos de prioridade e trim |
| `src/components/finance/MensalidadesListTable.jsx` | Coluna + mobile + colSpan |
| CSS mensalidades (se necessário) | Largura/ellipsis da coluna |
| `src/lib/mensalidadesExport.js` | Campo `pagador` no CSV |
| `src/test/mensalidadesExport.test.js` | Assert coluna |
| `src/test/mensalidadesListTable.test.jsx` | Assert header/célula |
| `docs/flows/financeiro/a-receber-mensalidades.md` | Checklist/mapa se listar colunas |
| `docs/flows/VALIDATION.md` | Registro se checklist mudar |

Sem novos endpoints `/api/`.

---

## 8. Testes

1. Alias presente → usa `display` do primeiro alias, ignora responsável/pai
2. Sem alias, com `responsavel` → responsável
3. Só `parentName` → pai/mãe
4. Tudo vazio → `''`
5. Tabela renderiza header **Pagador** e valor na linha
6. CSV inclui `pagador` após `aluno`

---

## 9. Aceite

- [ ] Coluna Pagador visível ao lado de Aluno no desktop
- [ ] Fallback alias → responsável → parentName
- [ ] Mobile mostra o mesmo valor no card
- [ ] CSV exporta `pagador`
- [ ] Testes do helper + export + tabela passam
