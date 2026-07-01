# Métricas operacionais — conciliação bancária

Instrumentação passiva do pipeline: gateway determinístico → score unificado → fallback IA (quando existir) → confirmação manual.

## Provisionamento

```bash
node --env-file=.env scripts/provision-reconciliation-metrics-schema.mjs
```

Variável: `APPWRITE_RECONCILIATION_METRICS_COLLECTION_ID` (padrão `reconciliation_metrics`).

Se a coleção não existir, métricas continuam em **log JSON** (`event: reconciliation_metric`) sem quebrar importação.

## Coleção `reconciliation_metrics`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `academy_id` | string(64) | Academia |
| `statement_id` | string(64) | Extrato (vazio em scan global de órfãos) |
| `event_type` | string(32) | Ver tabela abaixo |
| `recorded_at` | datetime | Momento do registro |
| `metrics_json` | string(10000) | Payload JSON |

### `event_type`

| Valor | Quando |
|-------|--------|
| `import_snapshot` | Fim de cada importação de extrato |
| `match_confirmed` | Cada confirmação manual (`confirm-match`, etc.) |
| `statement_completed` | Fechamento do extrato (`complete`) |
| `stale_orphan_scan` | Cron diário — linhas unmatched há > N dias |

## Consulta via API (owner)

```
GET /api/finance.js?finance_hub=bank-reconciliation&route=recon-metrics
Header: x-academy-id: <academyId>
```

Parâmetros opcionais:

- `limit` (1–100, default 50)
- `event_type` — ex. `import_snapshot`
- `statement_id`
- `since` — ISO datetime (filtro `recorded_at >= since`)

Exemplo:

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "x-academy-id: $ACADEMY" \
  "https://<app>/api/bank-reconciliation?route=recon-metrics&event_type=import_snapshot&limit=20"
```

## Consulta direta no Appwrite

```javascript
// Últimos snapshots de importação da academia
databases.listDocuments(DB_ID, 'reconciliation_metrics', [
  Query.equal('academy_id', academyId),
  Query.equal('event_type', 'import_snapshot'),
  Query.orderDesc('recorded_at'),
  Query.limit(50),
]);
```

## Payloads (`metrics_json`)

### `import_snapshot`

```json
{
  "schema_version": 1,
  "items_total": 42,
  "items_eligible": 40,
  "layers_at_import": {
    "gateway_deterministic": 5,
    "score_suggested": 28,
    "ai_suggested": 0,
    "no_suggestion": 7,
    "duplicate": 2
  },
  "resolution_at_import": { "...": "mesmos contadores sem duplicate" },
  "pool_tx_count": 120,
  "ai": { "calls": 0, "estimated_cost_usd": 0, "items_suggested": 0 }
}
```

### `statement_completed`

Inclui `resolution_final`, `suggestions.rejection_rate`, `timing.time_to_complete_hours`.

### `match_confirmed`

Inclui `accepted_suggestion`, `reconciliation_method` (`score_manual_accepted`, `manual_override`, `ai_fallback`, …).

## Cron — órfãos antigos

Agendado diariamente (`30 7 * * *` UTC) via:

```
GET /api/cron/recon-stale-orphans
```

(rewrite → `reset-usage.js?action=recon-stale-orphans`)

Registra `stale_orphan_scan` por academia com extratos `pending`/`partial` importados há mais de **7 dias** e linhas ainda `unmatched`.

## Perguntas de saúde (após 1–2 meses)

| Pergunta | Métricas |
|----------|----------|
| Gateway cobre PagBank? | `layers_at_import.gateway_deterministic` / `items_eligible` |
| Score bem calibrado? | `suggestions.rejection_rate` em `statement_completed` |
| IA mascarando matcher ruim? | `ai.calls` alto + `no_suggestion` baixo + `rejection_rate` alto |

## Nota sobre P5 (IA)

Campos `ai.*` e `ai_suggested` estão prontos; permanecem **0** até o fallback de IA ser implementado. A instrumentação não altera decisões de conciliação.
