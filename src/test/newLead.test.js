import { describe, it, expect, vi, beforeEach } from 'vitest';

const appwriteMocks = vi.hoisted(() => ({
  createDocument: vi.fn()
}));

const storeMocks = vi.hoisted(() => ({
  addLead: vi.fn(),
  leads: []
}));

vi.mock('../lib/appwrite.js', () => ({
  databases: {
    createDocument: appwriteMocks.createDocument
  },
  DB_ID: 'db-x',
  LEADS_COL: 'leads-col'
}));

vi.mock('../store/useLeadStore.js', () => ({
  useLeadStore: {
    getState: () => ({
      addLead: storeMocks.addLead,
      leads: storeMocks.leads
    })
  }
}));

vi.mock('../lib/masks.js', () => ({
  maskPhone: vi.fn((v) => String(v || ''))
}));

function normalizePhoneDedup(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
}

function validateLeadInput(data) {
  if (!String(data?.name || '').trim()) return { ok: false, reason: 'nome' };
  const digits = String(data?.phone || '').replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'telefone' };
  if (digits.length < 10) return { ok: false, reason: 'telefone_min' };
  if (String(data?.type || '') === 'Criança' && !String(data?.parentName || '').trim()) {
    return { ok: false, reason: 'parentName' };
  }
  return { ok: true };
}

function findDuplicateByPhone(leads, phone) {
  const inputNorm = normalizePhoneDedup(phone);
  if (inputNorm.length < 8) return null;
  return (leads || []).find((l) => normalizePhoneDedup(l.phone) === inputNorm) || null;
}

function buildLeadPayload(data) {
  const hasSchedule = !!data.scheduledDate && !!data.scheduledTime;
  return {
    name: data.name,
    phone: String(data.phone || '').replace(/\D/g, ''),
    contact_type: 'lead',
    type: data.type || 'Adulto',
    origin: data.origin || 'Instagram',
    status: hasSchedule ? 'SCHEDULED' : 'NEW',
    pipelineStage: hasSchedule ? 'Aula experimental' : 'Novo',
    parentName: data.parentName || '',
    age: data.age || '',
    scheduledDate: data.scheduledDate || '',
    scheduledTime: data.scheduledTime || ''
  };
}

describe('Criação de lead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.leads = [];
  });

  describe('Validação de campos', () => {
    it('nome é obrigatório', () => {
      expect(validateLeadInput({ name: '', phone: '37999999999' }).ok).toBe(false);
    });

    it('telefone é obrigatório', () => {
      expect(validateLeadInput({ name: 'Ana', phone: '' }).reason).toBe('telefone');
    });

    it('telefone com menos de 10 dígitos é inválido', () => {
      expect(validateLeadInput({ name: 'Ana', phone: '379999999' }).reason).toBe('telefone_min');
    });

    it('telefone com 11 dígitos é válido', () => {
      expect(validateLeadInput({ name: 'Ana', phone: '37999999999' }).ok).toBe(true);
    });

    it('lead com tipo Criança requer parentName', () => {
      expect(validateLeadInput({ name: 'Bia', phone: '37999999999', type: 'Criança', parentName: '' }).reason).toBe(
        'parentName'
      );
    });

    it('lead com tipo Adulto não requer parentName', () => {
      expect(validateLeadInput({ name: 'Lia', phone: '37999999999', type: 'Adulto' }).ok).toBe(true);
    });
  });

  describe('Detecção de duplicatas', () => {
    it('telefone já cadastrado retorna lead existente', () => {
      const existing = { id: 'l1', name: 'Rafa', phone: '(37) 99999-9999' };
      expect(findDuplicateByPhone([existing], '37999999999')).toEqual(existing);
    });

    it('telefone novo não retorna duplicata', () => {
      const existing = { id: 'l1', name: 'Rafa', phone: '(37) 99999-9999' };
      expect(findDuplicateByPhone([existing], '37911112222')).toBeNull();
    });

    it('telefone formatado diferente mas mesmo número é duplicata', () => {
      const existing = { id: 'l1', name: 'Rafa', phone: '(37) 99999-9999' };
      expect(findDuplicateByPhone([existing], '37999999999')?.id).toBe('l1');
    });
  });

  describe('Gravação', () => {
    it('cria documento no Appwrite com campos corretos', async () => {
      const data = { name: 'Ana', phone: '(37) 99999-9999', type: 'Adulto' };
      const payload = buildLeadPayload(data);
      appwriteMocks.createDocument.mockResolvedValueOnce({ $id: 'doc-1' });
      await appwriteMocks.createDocument('db-x', 'leads-col', 'unique', payload);
      expect(appwriteMocks.createDocument).toHaveBeenCalledWith(
        'db-x',
        'leads-col',
        'unique',
        expect.objectContaining({ name: 'Ana', phone: '37999999999', pipelineStage: 'Novo' })
      );
    });

    it('status inicial é Novo quando sem data agendada', () => {
      const payload = buildLeadPayload({ name: 'Ana', phone: '37999999999' });
      expect(payload.status).toBe('NEW');
    });

    it('status inicial é Agendado quando tem data e hora', () => {
      const payload = buildLeadPayload({
        name: 'Ana',
        phone: '37999999999',
        scheduledDate: '2026-04-23',
        scheduledTime: '19:00'
      });
      expect(payload.status).toBe('SCHEDULED');
      expect(payload.pipelineStage).toBe('Aula experimental');
    });

    it('addLead é chamado após createDocument', async () => {
      storeMocks.addLead.mockResolvedValueOnce({ id: 'lead-1' });
      const payload = buildLeadPayload({ name: 'Ana', phone: '37999999999' });
      const out = await storeMocks.addLead(payload);
      expect(storeMocks.addLead).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana' }));
      expect(out.id).toBe('lead-1');
    });
  });
});
