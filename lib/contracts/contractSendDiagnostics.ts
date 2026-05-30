import type { SignerInput } from './types.js';
import type { ContractSignerLayout } from './contractSignerLayout.js';
import { resolveSlotPositions } from './contractSignerLayout.js';

function usesPhoneDelivery(method: string | undefined): boolean {
  const m = String(method || '').trim();
  return m === 'DELIVERY_METHOD_WHATSAPP' || m === 'DELIVERY_METHOD_SMS';
}

/** Celular BR: DDD + 9 + 8 dígitos (11 no total, sem contar 55). */
export function isValidBrazilMobilePhone(phone: string | undefined | null): boolean {
  const raw = String(phone || '').replace(/\D/g, '');
  if (!raw) return false;
  const national = raw.startsWith('55') && raw.length >= 12 ? raw.slice(2) : raw;
  if (national.length !== 11) return false;
  return national[2] === '9';
}

export function maskEmail(email: string): string {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at <= 1) return e ? '***' : '';
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

export function describeSignerDelivery(signer: SignerInput): string {
  const method = String(signer.delivery_method || 'DELIVERY_METHOD_EMAIL').trim();
  if (usesPhoneDelivery(method)) {
    const digits = String(signer.phone || '').replace(/\D/g, '');
    const label = method === 'DELIVERY_METHOD_SMS' ? 'SMS' : 'WhatsApp';
    return digits ? `${label} (${digits})` : `${label} (sem número)`;
  }
  const email = String(signer.email || '').trim();
  return email ? `E-mail (${maskEmail(email)})` : 'E-mail (não informado)';
}

export type ContractSendDiagnostic = {
  /** Impede envio — mostrar como erro. */
  blockers: string[];
  /** Avisos — usuário pode corrigir antes de enviar. */
  warnings: string[];
};

export function diagnoseContractSend(input: {
  signers: SignerInput[];
  layout?: ContractSignerLayout | null;
  pageCount?: number;
  pdfByteLength?: number;
}): ContractSendDiagnostic {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const signers = input.signers || [];
  const pageCount = Math.max(1, Number(input.pageCount) || 1);
  const layout = input.layout;
  const activeSlots = layout?.slots?.filter((s) => s.enabled !== false) || [];

  const emails = new Map<string, number>();

  signers.forEach((signer, index) => {
    const label =
      String(activeSlots[index]?.label || '').trim() || `Signatário ${index + 1}`;
    const method = String(signer.delivery_method || '').trim();
    const name = String(signer.name || '').trim();
    const email = String(signer.email || '').trim();
    const emailKey = email.toLowerCase();

    if (!name) {
      warnings.push(`${label}: nome vazio — a Autentique pode recusar campos de assinatura com "Nome".`);
    }

    if (usesPhoneDelivery(method)) {
      if (!String(signer.phone || '').trim()) {
        blockers.push(
          `${label}: você escolheu ${method === 'DELIVERY_METHOD_SMS' ? 'SMS' : 'WhatsApp'}, mas não há telefone. Troque para E-mail ou informe o celular com DDD.`
        );
      } else if (!isValidBrazilMobilePhone(signer.phone)) {
        blockers.push(
          `${label}: telefone inválido para ${method === 'DELIVERY_METHOD_SMS' ? 'SMS' : 'WhatsApp'} na Autentique (use celular com DDD, 11 dígitos, começando com 9 após o DDD). O e-mail preenchido não é usado quando o envio é por WhatsApp.`
        );
      } else if (email) {
        warnings.push(
          `${label}: envio por ${method === 'DELIVERY_METHOD_SMS' ? 'SMS' : 'WhatsApp'} — o link vai para o telefone, não para ${maskEmail(email)}.`
        );
      }
    } else {
      if (!email) {
        blockers.push(`${label}: informe o e-mail ou altere o envio para WhatsApp.`);
      } else {
        const prev = emails.get(emailKey);
        if (prev != null) {
          blockers.push(
            `${label} e Signatário ${prev + 1} usam o mesmo e-mail (${maskEmail(email)}). A Autentique exige endereços diferentes.`
          );
        } else {
          emails.set(emailKey, index);
        }
      }
    }

    const slot = activeSlots[index];
    if (slot) {
      const positions = resolveSlotPositions(slot, pageCount);
      const needsName = positions.some((p) => p.element === 'NAME');
      if (needsName && !name) {
        blockers.push(
          `${label}: o modelo tem campo "Nome" na assinatura — preencha o nome do signatário.`
        );
      }
      for (const p of positions) {
        if (p.z > pageCount) {
          blockers.push(
            `${label}: campo de assinatura na página ${p.z}, mas o PDF tem ${pageCount} página(s). Ajuste o modelo em Empresa → Contratos.`
          );
        }
      }
    }
  });

  const pdfLen = Number(input.pdfByteLength) || 0;
  if (pdfLen > 0 && pdfLen < 800) {
    warnings.push(
      'O PDF do contrato parece muito pequeno — confira a prévia antes de enviar (modelo vazio ou erro na geração).'
    );
  }

  return { blockers, warnings };
}

/** Dicas quando a Autentique devolve só "validation" sem detalhe. */
export function autentiqueValidationFallbackHints(signers: SignerInput[]): string[] {
  const hints: string[] = [];
  const hasWhatsApp = signers.some((s) =>
    String(s.delivery_method || '').includes('WHATSAPP')
  );
  if (hasWhatsApp) {
    hints.push(
      'Se algum signatário está em WhatsApp, confira se o celular tem 11 dígitos (DDD + 9 + número). E-mail preenchido não substitui telefone nesse modo.'
    );
  }
  hints.push(
    'Abra a prévia do PDF: se estiver em branco ou ilegível, corrija o modelo antes de enviar.',
    'Na conta Autentique, verifique se ainda há créditos de documentos (ou use modo sandbox para teste).',
    'Em Empresa → Contratos, revise as posições dos campos de assinatura na última página do modelo.'
  );
  return hints;
}
