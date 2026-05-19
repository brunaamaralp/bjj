import { z } from 'zod';

const deliveryMethodEnum = z.enum([
  'DELIVERY_METHOD_EMAIL',
  'DELIVERY_METHOD_WHATSAPP',
  'DELIVERY_METHOD_SMS',
]);

export const signerSchema = z
  .object({
    name: z.string().min(1, 'Nome obrigatório'),
    email: z.string().optional(),
    phone: z.string().optional(),
    action: z.enum(['SIGN', 'APPROVE', 'RECOGNIZE']),
    delivery_method: deliveryMethodEnum,
  })
  .superRefine((data, ctx) => {
    const needsPhone =
      data.delivery_method === 'DELIVERY_METHOD_WHATSAPP' ||
      data.delivery_method === 'DELIVERY_METHOD_SMS';
    if (needsPhone) {
      const digits = String(data.phone || '').replace(/\D/g, '');
      if (digits.length < 10) {
        ctx.addIssue({
          code: 'custom',
          message: 'Telefone obrigatório para WhatsApp',
          path: ['phone'],
        });
      }
      return;
    }
    const email = String(data.email || '').trim();
    if (!email) {
      ctx.addIssue({ code: 'custom', message: 'E-mail obrigatório', path: ['email'] });
      return;
    }
    if (!z.string().email().safeParse(email).success) {
      ctx.addIssue({ code: 'custom', message: 'E-mail inválido', path: ['email'] });
    }
  });

export const createContractSchema = z.object({
  name: z.string().min(1, 'Nome do contrato é obrigatório'),
  sandbox: z.boolean(),
  signers: z.array(signerSchema).min(1, 'Adicione pelo menos um signatário'),
  templateId: z.string().min(1, 'Selecione um modelo de contrato'),
});

export type CreateContractFormValues = z.infer<typeof createContractSchema>;

export const ACTION_OPTIONS = [
  { value: 'SIGN' as const, label: 'Assinar' },
  { value: 'APPROVE' as const, label: 'Aprovar' },
  { value: 'RECOGNIZE' as const, label: 'Reconhecer' },
];

export const DELIVERY_OPTIONS = [
  { value: 'DELIVERY_METHOD_EMAIL' as const, label: 'E-mail' },
  { value: 'DELIVERY_METHOD_WHATSAPP' as const, label: 'WhatsApp' },
  { value: 'DELIVERY_METHOD_SMS' as const, label: 'SMS' },
];

export const defaultSigner = (): CreateContractFormValues['signers'][number] => ({
  name: '',
  email: '',
  phone: '',
  action: 'SIGN',
  delivery_method: 'DELIVERY_METHOD_EMAIL',
});
