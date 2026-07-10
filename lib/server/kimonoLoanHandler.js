/**
 * API de empréstimo de kimono — GET/POST via /api/inventory?kimono_loans=1
 */
import { academyHasInventoryModule, academyHasProductsAccess } from '../../src/lib/stockSettings.js';
import {
  getKimonoLoanBoard,
  lendKimono,
  returnKimono,
  saveKimonoLoanSettings,
} from './kimonoLoanExecute.js';

function json(res, status, obj) {
  res.status(status).json(obj);
}

function productsModuleOk(academyDoc) {
  return academyHasProductsAccess(academyDoc) || academyHasInventoryModule(academyDoc);
}

export async function handleKimonoLoansGet(req, res, ctx) {
  const { databases, dbId, stockItemsCol, academyId, academyDoc } = ctx;
  if (!productsModuleOk(academyDoc)) {
    return json(res, 403, { sucesso: false, erro: 'Módulo de estoque/produtos desativado' });
  }
  try {
    const board = await getKimonoLoanBoard(databases, dbId, stockItemsCol, academyDoc, academyId);
    return json(res, 200, { sucesso: true, ok: true, ...board });
  } catch (e) {
    if (e?.code === 'kimono_loans_collection_missing') {
      return json(res, 503, {
        sucesso: false,
        erro: 'kimono_loans_collection_missing',
        message: 'Coleção kimono_loans não provisionada. Rode o script de schema.',
      });
    }
    console.error('[kimono-loans] get:', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'load_failed' });
  }
}

export async function handleKimonoLoansPost(req, res, ctx) {
  const { databases, dbId, stockItemsCol, academyId, academyDoc, me } = ctx;
  if (!productsModuleOk(academyDoc)) {
    return json(res, 403, { sucesso: false, erro: 'Módulo de estoque/produtos desativado' });
  }

  const action = String(req.body?.action || '').trim().toLowerCase();
  const base = { dbId, stockItemsCol, academyId, academyDoc, me };

  try {
    if (action === 'kimono_loan_lend') {
      const out = await lendKimono(databases, {
        ...base,
        variantId: req.body.variant_id,
        borrowerType: req.body.borrower_type,
        borrowerId: req.body.borrower_id,
        borrowerName: req.body.borrower_name,
        notes: req.body.notes,
      });
      if (!out.ok) {
        return json(res, out.status || 400, { sucesso: false, erro: out.error, ...out });
      }
      return json(res, 200, { sucesso: true, ok: true, ...out });
    }

    if (action === 'kimono_loan_return') {
      const out = await returnKimono(databases, {
        ...base,
        loanId: req.body.loan_id,
      });
      if (!out.ok) {
        return json(res, out.status || 400, { sucesso: false, erro: out.error, ...out });
      }
      return json(res, 200, { sucesso: true, ok: true, ...out });
    }

    if (action === 'kimono_loan_settings') {
      const out = await saveKimonoLoanSettings(
        databases,
        dbId,
        academyId,
        academyDoc,
        req.body.overdue_hours
      );
      if (!out.ok) {
        return json(res, out.status || 400, { sucesso: false, erro: out.error });
      }
      return json(res, 200, { sucesso: true, ok: true, settings: out.settings });
    }

    return json(res, 400, { sucesso: false, erro: 'action_invalid' });
  } catch (e) {
    console.error('[kimono-loans] post:', action, e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'action_failed' });
  }
}
