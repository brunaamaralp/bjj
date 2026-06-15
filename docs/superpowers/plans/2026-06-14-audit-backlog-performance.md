# Backlog auditoria — Performance (bundle + PWA)

> **Origem:** [PERFORMANCE_ERRORS_DIAGNOSTIC.md](../../PERFORMANCE_ERRORS_DIAGNOSTIC.md) · Fase 5 · 2026-06-14  
> **Prioridade:** P1 degradante  
> **Relacionado:** [shell-performance S2](2026-06-10-shell-performance-s2.md)

**Goal:** Entry JS **172,9 KB → < 145 KB gzip**, LCP mobile login **3,3 s → < 2,5 s**, eliminar warnings de build (circular deps, chunks > 500 KB no critical path).

**Architecture:** Continuar S2 (bootstrap + CSS split) + quebrar ciclo finance + auditar precache PWA. Medir com `npm run build` e Lighthouse prod após cada PR.

---

## Baseline (2026-06-14)

| Métrica | Valor | Meta spec |
|---------|-------|-----------|
| `index-*.js` gzip | **172,88 KB** | < 145 KB |
| `index-*.css` gzip | **19,15 KB** ✅ | < 30 KB |
| LCP `/login` mobile prod | **3,3 s** | < 2,5 s |
| PWA precache | **3988 KiB** | documentar |
| Circular deps | `paymentMethodBankDefaults` ↔ `bankAccounts` | 0 |

---

### Task 1: Quebrar dependência circular finance

**Files:**
- Modify: `src/lib/paymentMethodBankDefaults.js` e/ou `src/lib/bankAccounts.js`
- Verify: `npm run build` (warning Rollup deve sumir)

- [ ] **Step 1:** Extrair tipos/constantes compartilhadas para módulo leaf (ex. `bankAccountTypes.js`) sem import cruzado.
- [ ] **Step 2:** Atualizar imports nos 6 arquivos afetados pelo warning.
- [ ] **Step 3:** `npm run build` — confirmar zero circular dependency warning.

**PR sugerido:** `fix/finance-bank-circular-deps`

---

### Task 2: Continuar shell-performance S2

**Files:** ver [2026-06-10-shell-performance-s2.md](2026-06-10-shell-performance-s2.md)

- [ ] Task 1 S2: prefetch na troca de rota (`App.jsx`)
- [ ] Task 2 S2: eliminar double-fetch Dashboard
- [ ] Tasks CSS: migrar CSS restante do critical path para rotas lazy

**PR sugerido:** `perf/shell-s2-bootstrap-css` (pode ser incremental)

**Verificação:**

```bash
npm run build
# comparar gzip index-*.js vs baseline 172,88 KB
npx lighthouse https://www.navefit.com/login --form-factor=mobile --only-categories=performance
```

---

### Task 3: Auditar precache PWA (3,9 MB)

**Files:**
- Inspect: `vite.config.js` (plugin PWA), `dist/sw.js` ou build log
- Modify: excluir assets não críticos do precache se aplicável

- [ ] **Step 1:** Listar 35 entries do precache; classificar essential vs lazy-only.
- [ ] **Step 2:** Excluir chunks de rotas raras (`vendor-xlsx`, `contracts`, etc.) do precache inicial se Workbox permitir.
- [ ] **Step 3:** Documentar tamanho final no diagnostic.

**PR sugerido:** `perf/pwa-precache-trim`  
**Prioridade:** P2 se LCP/bundle forem tratados primeiro.

---

## Critério de done

- [ ] Entry JS gzip < 145 KB **ou** delta documentado com próximo passo
- [ ] LCP mobile `/login` prod < 2,5 s **ou** Speed Insights confirma tendência pós-deploy
- [ ] Zero circular dependency warnings no build
