import type { ContractDisplayStatus } from '../../../lib/contracts/displayStatus.js';
import type { ContractRecord } from '../../../lib/contracts/types.js';
import { mapContractDisplayStatus } from '../../../lib/contracts/displayStatus.js';

export type { ContractDisplayStatus };
export { mapContractDisplayStatus, mapLegacyDisplayStatus } from '../../../lib/contracts/displayStatus.js';

export const CONTRACT_STATUS_LABELS: Record<ContractDisplayStatus, string> = {
  sent: 'Enviado',
  viewed: 'Visualizado',
  signed: 'Assinado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

export const CONTRACT_STATUS_FILTER_OPTIONS: Array<{ id: 'all' | ContractDisplayStatus; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'sent', label: 'Enviado' },
  { id: 'viewed', label: 'Visualizado' },
  { id: 'signed', label: 'Assinado' },
  { id: 'expired', label: 'Expirado' },
  { id: 'cancelled', label: 'Cancelado' },
];

export function contractDisplayContext(c: ContractRecord) {
  return {
    signersViewed: c.signersViewed ?? 0,
    expiresAt: c.expiresAt ?? null,
    metaStatus: c.metaStatus ?? null,
  };
}

export function mapContractDisplayStatusForRecord(c: ContractRecord): ContractDisplayStatus {
  return mapContractDisplayStatus(
    c.status,
    c.signersSigned ?? 0,
    c.signersTotal ?? 0,
    contractDisplayContext(c)
  );
}

/** Rótulo do badge na lista (inclui assinatura parcial). */
export function contractListStatusLabel(c: ContractRecord): string {
  const display = mapContractDisplayStatusForRecord(c);
  const signed = Number(c.signersSigned) || 0;
  const total = Number(c.signersTotal) || 0;
  if (display === 'viewed' && total > 0 && signed > 0 && signed < total) {
    return `${signed} de ${total} assinaram`;
  }
  return CONTRACT_STATUS_LABELS[display] || display;
}

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

export function contractHeaderChipLabel(
  displayStatus: ContractDisplayStatus,
  signedAt?: string | null
): string {
  if (displayStatus === 'signed') {
    if (signedAt) {
      const d = new Date(signedAt);
      if (!Number.isNaN(d.getTime())) {
        return `Assinado em ${d.toLocaleDateString('pt-BR')}`;
      }
    }
    return 'Assinado';
  }
  if (displayStatus === 'viewed') return 'Assinatura: visualizado';
  if (displayStatus === 'expired') return 'Assinatura: expirada';
  if (displayStatus === 'cancelled') return 'Assinatura: cancelada';
  return 'Assinatura: aguardando';
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
