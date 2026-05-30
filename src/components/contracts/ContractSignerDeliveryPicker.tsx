import React from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import type { CreateContractFormValues } from './contractsSchema.js';

type DeliveryMethod = CreateContractFormValues['signers'][number]['delivery_method'];

const DELIVERY_CHOICES = [
  {
    value: 'DELIVERY_METHOD_EMAIL' as const,
    label: 'E-mail',
    hint: 'Link no e-mail do signatário',
    icon: Mail,
  },
  {
    value: 'DELIVERY_METHOD_WHATSAPP' as const,
    label: 'WhatsApp',
    hint: 'Link no WhatsApp (Autentique envia)',
    icon: MessageCircle,
  },
];

export type ContractSignerDeliveryPickerProps = {
  value: DeliveryMethod;
  disabled?: boolean;
  onChange: (value: DeliveryMethod) => void;
};

export default function ContractSignerDeliveryPicker({
  value,
  disabled = false,
  onChange,
}: ContractSignerDeliveryPickerProps) {
  return (
    <div className="contracts-delivery-picker">
      <span className="task-field-label">Como enviar o link de assinatura?</span>
      <div className="contracts-delivery-picker__options" role="radiogroup" aria-label="Como enviar o link">
        {DELIVERY_CHOICES.map((choice) => {
          const Icon = choice.icon;
          const active = value === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              className={`contracts-delivery-picker__option${active ? ' contracts-delivery-picker__option--active' : ''}`}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(choice.value)}
            >
              <Icon size={18} aria-hidden />
              <span className="contracts-delivery-picker__option-text">
                <strong>{choice.label}</strong>
                <span className="text-small text-muted">{choice.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function isWhatsAppDelivery(method: string | undefined): boolean {
  return String(method || '') === 'DELIVERY_METHOD_WHATSAPP';
}

export function isEmailDelivery(method: string | undefined): boolean {
  const m = String(method || 'DELIVERY_METHOD_EMAIL').trim();
  return m === 'DELIVERY_METHOD_EMAIL' || !m;
}
