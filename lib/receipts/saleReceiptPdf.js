import { buildReceiptText } from '../../src/lib/salesReceipt.js';
import { readSalesSettings } from '../../src/lib/salesSettings.js';
import { parsePagamentosJson, buildReceiptPaymentsText } from '../../src/lib/salePayments.js';
import { resolveClientName } from '../../src/lib/salesHistory.js';
import { parseAcademySettings } from '../../src/lib/stockSettings.js';
import { textToPdfBuffer } from './textToPdfBuffer.js';

export function academyDisplayName(academyDoc) {
  return String(academyDoc?.name || academyDoc?.nome || 'Academia').trim() || 'Academia';
}

export function formatBrDateTimeFromIso(iso) {
  if (!iso) return { date: '—', time: '—' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
  return {
    date: d.toLocaleDateString('pt-BR'),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Monta texto do comprovante de venda (mesma lógica do SalesReceiptPanel).
 * @param {object} doc — documento SALES
 * @param {Array} items — itens enriquecidos
 * @param {Record<string,string>} leadNames
 * @param {object} academyDoc
 */
export function buildSaleReceiptPlainText(doc, items, leadNames, academyDoc) {
  const settings = readSalesSettings(parseAcademySettings(academyDoc?.settings));
  const { date, time } = formatBrDateTimeFromIso(doc.$createdAt || doc.created_at);
  const pagamentos = parsePagamentosJson(doc.pagamentos_json);
  const clientName = resolveClientName(
    { cliente_nome: doc.cliente_nome, aluno_id: doc.aluno_id },
    leadNames
  );
  const clientPhone = String(doc.cliente_telefone || '').trim();

  const base = buildReceiptText({
    template: settings.receiptTemplate,
    footer: settings.receiptFooter,
    academyName: academyDisplayName(academyDoc),
    saleId: doc.$id,
    date,
    time,
    channel: doc.canal || 'presencial',
    clientName,
    clientPhone,
    items,
    total: Number(doc.total) || 0,
    payment: doc.forma_pagamento || '',
  });

  const paymentSection = pagamentos.length
    ? buildReceiptPaymentsText(pagamentos, Number(doc.total) || 0)
    : '';

  return paymentSection ? `${base}\n\n${paymentSection}`.trim() : base;
}

export async function generateSaleReceiptPdfBuffer(doc, items, leadNames, academyDoc) {
  const text = buildSaleReceiptPlainText(doc, items, leadNames, academyDoc);
  return textToPdfBuffer(text);
}
