import express from 'express';
import { Client, Databases, Permission, Role, Query, ID } from 'node-appwrite';

const app = express();
app.use(express.json({ limit: '1mb' }));

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || 'academies';
const TASKS_COL = process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || process.env.APPWRITE_TASKS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL || !ACADEMIES_COL) {
  console.error('Config inválida. Defina APPWRITE_ENDPOINT, APPWRITE_API_KEY, PROJECT_ID, DB_ID, LEADS_COL e ACADEMIES_COL.');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const ensureJsonBody = (req, res, next) => {
  if (!req.is('application/json')) return res.status(400).json({ sucesso: false, erro: 'Content-Type inválido' });
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ sucesso: false, erro: 'Body ausente' });
  next();
};

const toBoolSim = (v) => String(v || '').trim().toLowerCase() === 'sim';
const toContactType = (v) => (String(v || '').trim().toLowerCase() === 'aluno' ? 'student' : 'lead');

app.post('/webhook/whatsapp', ensureJsonBody, async (req, res) => {
  try {
    const b = req.body || {};
    const contato = b.contato || {};
    const classificacao = b.classificacao || {};
    const atendimento = b.atendimento || {};

    const telefone = String(contato.telefone || '').trim();
    const intencao = String(classificacao.intencao || '').trim();
    const prioridade = String(classificacao.prioridade || '').trim();
    if (!telefone || !intencao || !prioridade) {
      return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios ausentes' });
    }
    if (!DEFAULT_ACADEMY_ID) {
      return res.status(500).json({ sucesso: false, erro: 'DEFAULT_ACADEMY_ID não configurado' });
    }

    let existing = null;
    try {
      const list = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('phone', [telefone]),
        Query.equal('academyId', [DEFAULT_ACADEMY_ID]),
        Query.limit(1),
      ]);
      existing = list.documents && list.documents[0] ? list.documents[0] : null;
    } catch (e) { void e; }

    const msgEvent = {
      type: 'whatsapp',
      phone: telefone,
      original: String(atendimento.mensagem_original || ''),
      at: String(atendimento.data_hora || new Date().toISOString()),
      intent: intencao,
      tipoContato: String(classificacao.tipo_contato || ''),
      prioridade: prioridade,
      leadQuente: String(classificacao.lead_quente || ''),
      precisaHumano: String(atendimento.precisa_resposta_humana || ''),
      sugerirFollowup: String(atendimento.sugerir_followup || '')
    };
    const contactType = toContactType(classificacao.tipo_contato);

    const appendHistory = (notesJson) => {
      let parsed = {};
      try {
        parsed = notesJson ? JSON.parse(notesJson) : {};
      } catch {
        parsed = {};
      }
      if (!parsed.history || !Array.isArray(parsed.history)) parsed.history = [];
      parsed.history.push(msgEvent);
      if (toBoolSim(classificacao.lead_quente)) parsed.priority = 'sim';
      if (toBoolSim(atendimento.precisa_resposta_humana)) parsed.needHuman = 'sim';
      return JSON.stringify(parsed);
    };

    if (existing) {
      const updatedNotes = appendHistory(existing.notes || '');
      const payload = {
        notes: updatedNotes,
        contact_type: contactType
      };
      const up = await databases.updateDocument(DB_ID, LEADS_COL, existing.$id, payload);
      if (toBoolSim(atendimento.precisa_resposta_humana)) {
        try {
          if (TASKS_COL) {
            await databases.createDocument(DB_ID, TASKS_COL, ID.unique(), {
              leadId: up.$id,
              title: 'Responder WhatsApp',
              status: 'open',
              createdAt: new Date().toISOString()
            }, [
              Permission.read(Role.users()),
              Permission.update(Role.users()),
              Permission.delete(Role.users()),
            ]);
          }
        } catch (e) { void e; }
      }
      return res.status(200).json({ sucesso: true, id: up.$id });
    }

    const newNotes = appendHistory('');
    const created = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), {
      name: String(contato.nome || '').trim() || telefone,
      phone: telefone,
      contact_type: contactType,
      type: 'Adulto',
      origin: 'WhatsApp',
      status: 'Novo',
      scheduledDate: '',
      scheduledTime: '',
      parentName: '',
      age: '',
      notes: newNotes,
      statusChangedAt: new Date().toISOString(),
      academyId: DEFAULT_ACADEMY_ID
    }, [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ]);
    if (toBoolSim(atendimento.precisa_resposta_humana)) {
      try {
        if (TASKS_COL) {
          await databases.createDocument(DB_ID, TASKS_COL, ID.unique(), {
            leadId: created.$id,
            title: 'Responder WhatsApp',
            status: 'open',
            createdAt: new Date().toISOString()
          }, [
            Permission.read(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
          ]);
        }
      } catch (e) { void e; }
    }
    return res.status(200).json({ sucesso: true, id: created.$id });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  process.stdout.write(`Webhook server on :${PORT}\n`);
});
