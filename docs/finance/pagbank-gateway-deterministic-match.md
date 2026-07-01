# Match determinístico PagBank na conciliação bancária

## Quando funciona

O match automático (sem revisão humana) ocorre **somente** quando:

1. O item do extrato traz um `gateway_charge_id` identificável (campo explícito, metadado EDI ou descrição com rótulo `charge_id` / `tid` / `transaction_code`), **e**
2. Existe **um único** `financial_tx` elegível com o mesmo ID (`gateway_charge_id` no documento ou via `pagbank_payments.payment_id` → `financial_entry_id`).

## Limitação — extrato bancário tradicional

Importações **CSV/OFX** de bancos (Sicoob, Nubank, Itaú, etc.) normalmente expõem apenas data, valor e descrição livre (ex.: “PIX recebido”, nome do pagador). O **charge_id do PagBank não aparece** nesses arquivos.

Nesses casos o fluxo cai no matcher por **score** (valor/data/descrição), que **sempre exige confirmação manual**, mesmo com score alto.

## Caminhos viáveis para match determinístico

| Fonte | Como o ID chega |
|-------|------------------|
| Webhook PagBank + espelho | `financial_tx.gateway_charge_id` preenchido no pagamento |
| Import EDI / sintético (`source_format=pagbank_edi`) | `gateway_charge_id` no item ou metadado |
| Lookup secundário | `pagbank_payments.payment_id` quando o extrato traz o mesmo ID |

## Alternativa futura

Conciliação automática de liquidações PagBank via **API EDI** ou extrato do próprio gateway (cron `pagbank-edi-sync`), não via extrato de conta corrente genérico.

## Auditoria

`bank_statement_items.reconciliation_method`:

- `gateway_deterministic` — auto-conciliado na importação
- `manual_confirm` — confirmação humana de sugestão por score ou ação manual
