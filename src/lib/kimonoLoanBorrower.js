/**
 * Resolução de tomador para empréstimo/aluguel de kimono (client + server).
 */
import { KIMONO_BORROWER_TYPES } from './kimonoLoanCore.js';

export function isRentalStockOutMove(move) {
  const tipo = String(move?.tipo || '').toLowerCase();
  const kind = String(move?.movement_kind || '').toLowerCase();
  return tipo === 'saida_aluguel' || (tipo === 'saida' && kind === 'rental');
}

export function resolveBorrowerFromSale({ aluno_id, cliente_nome, saleId, saleSource }) {
  const name = String(cliente_nome || '').trim();
  const personId = String(aluno_id || '').trim();
  if (personId) {
    const isStudent = String(saleSource || '').trim().toLowerCase() === 'student';
    return {
      borrower_type: isStudent ? KIMONO_BORROWER_TYPES.STUDENT : KIMONO_BORROWER_TYPES.LEAD,
      borrower_id: personId,
      borrower_name: name || (isStudent ? 'Aluno' : 'Lead'),
    };
  }
  return {
    borrower_type: KIMONO_BORROWER_TYPES.CLIENT,
    borrower_id: String(saleId || '').trim(),
    borrower_name: name || 'Cliente PDV',
  };
}

export function resolveBorrowerFromStockMove(move, { saleClienteNome } = {}) {
  const leadId = String(move?.lead_id || '').trim();
  const saleId = String(move?.sale_id || move?.referencia_id || '').trim();
  const motivo = String(move?.motivo || '').trim();

  if (leadId) {
    return {
      borrower_type: KIMONO_BORROWER_TYPES.LEAD,
      borrower_id: leadId,
      borrower_name: String(saleClienteNome || move?.usuario_name || 'Lead').slice(0, 120),
    };
  }
  if (motivo === 'emprestimo_recepcao' && move?.referencia_id) {
    return {
      borrower_type: KIMONO_BORROWER_TYPES.LEAD,
      borrower_id: String(move.referencia_id),
      borrower_name: 'Empréstimo recepção',
    };
  }
  if (saleId) {
    return {
      borrower_type: KIMONO_BORROWER_TYPES.CLIENT,
      borrower_id: saleId,
      borrower_name: String(saleClienteNome || 'Venda PDV').slice(0, 120),
    };
  }
  return {
    borrower_type: KIMONO_BORROWER_TYPES.CLIENT,
    borrower_id: String(move?.$id || move?.id || '').trim(),
    borrower_name: motivo ? motivo.slice(0, 120) : 'Uso interno',
  };
}
