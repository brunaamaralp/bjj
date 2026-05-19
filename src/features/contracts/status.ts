import type { ContractDisplayStatus } from './types.js';

const SIGNED_STATUSES = new Set(['signed', 'accepted']);
const CANCELLED_STATUSES = new Set(['deleted', 'cancelled', 'rejected', 'removed']);
const COMPLETED_STATUSES = new Set(['finished', 'completed']);

export function mapContractDisplayStatus(
  backendStatus: string,
  signersSigned = 0,
  signersTotal = 0
): ContractDisplayStatus {
  const s = String(backendStatus || '').toLowerCase();

  if (CANCELLED_STATUSES.has(s)) return 'cancelled';
  if (COMPLETED_STATUSES.has(s)) return 'completed';

  if (signersTotal > 0) {
    if (signersSigned >= signersTotal) return 'completed';
    if (signersSigned > 0) return 'partial';
  }

  if (s === 'in_progress' || s === 'created' || s === 'viewed' || s === 'updated') {
    return signersSigned > 0 ? 'partial' : 'pending';
  }

  return 'pending';
}

export const CONTRACT_STATUS_LABELS: Record<ContractDisplayStatus, string> = {
  pending: 'Pendente',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  partial: 'Parcial',
};

export const CONTRACT_STATUS_FILTER_OPTIONS: Array<{ id: 'all' | ContractDisplayStatus; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendente' },
  { id: 'partial', label: 'Parcial' },
  { id: 'completed', label: 'Concluído' },
  { id: 'cancelled', label: 'Cancelado' },
];

export function signerStatusLabel(status: string): string {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    pending: 'Pendente',
    viewed: 'Visualizado',
    signed: 'Assinado',
    accepted: 'Assinado',
    rejected: 'Recusado',
    removed: 'Removido',
    delivery_failed: 'Falha no envio',
    updated: 'Atualizado',
    biometric_approved: 'Biometria aprovada',
    biometric_unapproved: 'Biometria pendente',
    biometric_rejected: 'Biometria rejeitada',
    biometric_reset: 'Biometria reiniciada',
  };
  return map[s] || status || '—';
}

export function eventTypeLabel(eventType: string): string {
  const map: Record<string, string> = {
    'document.created': 'Documento criado',
    'document.updated': 'Documento atualizado',
    'document.finished': 'Documento finalizado',
    'document.deleted': 'Documento removido',
    'signature.created': 'Solicitação de assinatura',
    'signature.viewed': 'Documento visualizado',
    'signature.accepted': 'Assinatura concluída',
    'signature.rejected': 'Assinatura recusada',
    'signature.deleted': 'Signatário removido',
    'signature.delivery_failed': 'Falha no envio',
    'signature.updated': 'Assinatura atualizada',
  };
  return map[eventType] || eventType || 'Evento';
}

export function autentiqueSignedDocumentUrl(autentiqueId: string | null | undefined): string | null {
  if (!autentiqueId) return null;
  return `https://painel.autentique.com.br/documentos/${encodeURIComponent(autentiqueId)}/assinado.pdf`;
}
