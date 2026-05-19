import { z } from 'zod';

export const signerSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().optional(),
  action: z.enum(['SIGN', 'APPROVE', 'RECOGNIZE']),
  delivery_method: z.enum([
    'DELIVERY_METHOD_EMAIL',
    'DELIVERY_METHOD_WHATSAPP',
    'DELIVERY_METHOD_SMS',
  ]),
});

export const createContractSchema = z.object({
  name: z.string().min(1, 'Nome do contrato é obrigatório'),
  sandbox: z.boolean(),
  signers: z.array(signerSchema).min(1, 'Adicione pelo menos um signatário'),
  file: z
    .custom<File>((v) => v instanceof File, 'PDF obrigatório')
    .refine((f) => f.size > 0, 'PDF obrigatório')
    .refine(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      'O arquivo deve ser PDF'
    ),
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
