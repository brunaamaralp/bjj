import { Client, Databases, Permission, Role, Account } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Method Not Allowed' });
  }
  if (!ensureConfigOk(res)) return;
  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
    }
    const jwt = auth.slice(7).trim();
    if (!jwt) return res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new Account(userClient);
    const me = await account.get();
    const ownerId = me.$id;

    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);

    const defaultFinance = {
      cardFees: {
        pix: { percent: 0, fixed: 0 },
        debito: { percent: 0, fixed: 0 },
        credito_avista: { percent: 0, fixed: 0 },
        credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 }
      },
      bankAccounts: [],
      plans: []
    };
    const checklist = [
      { id: 'academy_info', title: 'Atualizar dados da academia', done: false },
      { id: 'ui_labels', title: 'Definir rótulos (Aulas/Alunos/Leads)', done: false },
      { id: 'quick_times', title: 'Adicionar horários rápidos', done: false },
      { id: 'first_lead', title: 'Criar primeiro lead', done: false },
      { id: 'install_pwa', title: 'Instalar atalho no celular', done: false }
    ];
    const payload = {
      name: me.name || '',
      phone: '',
      email: me.email || '',
      address: '',
      ownerId,
      uiLabels: JSON.stringify({ leads: 'Leads', students: 'Alunos', classes: 'Aulas' }),
      modules: JSON.stringify({ sales: false, inventory: false, finance: false }),
      quickTimes: [],
      financeConfig: JSON.stringify(defaultFinance),
      onboardingChecklist: JSON.stringify(checklist),
      customLeadQuestions: JSON.stringify(['Faixa'])
    };
    const perms = [
      Permission.read(Role.user(ownerId)),
      Permission.update(Role.user(ownerId)),
      Permission.delete(Role.user(ownerId)),
    ];
    const doc = await databases.createDocument(DB_ID, ACADEMIES_COL, 'unique()', payload, perms);
    return res.status(200).json({ sucesso: true, id: doc.$id });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
