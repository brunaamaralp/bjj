import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { account, realtime, CONVERSATIONS_COL, DB_ID } from '../lib/appwrite';
import { humanHandoffUntilToMs } from '../../lib/humanHandoffUntil.js';
import { useUiStore } from '../store/useUiStore';
import { LEAD_STATUS, useLeadStore } from '../store/useLeadStore';
import ConversationList from '../components/inbox/ConversationList';
import ThreadState from '../components/inbox/ThreadState';
import ThreadSkeleton from '../components/inbox/ThreadSkeleton';

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

async function getJwt() {
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
}

function formatWhen(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('pt-BR');
}

function formatTimeOnly(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function parseTimestampMs(value) {
  const s = String(value || '').trim();
  if (!s) return 0;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

const ANA_PROMPT_INTRO = `Você se chama Ana e é atendente da Gracie Barra Lagoa da Prata,
academia de Jiu-Jitsu da rede Gracie Barra em Lagoa da Prata, MG.

Atenda de forma humana, calorosa e direta — como uma recepcionista
simpática que conhece bem a academia e gosta de ajudar.

Use o primeiro nome da pessoa quando souber.

Se alguém perguntar seu nome, responda naturalmente:
"Sou a Ana, atendente da Gracie Barra Lagoa da Prata 😊"

Se alguém perguntar se você é uma IA ou robô, desvie com naturalidade:
"Sou a Ana, aqui pra te ajudar com tudo sobre a academia!
No que posso te ajudar?"`;

const ANA_PROMPT_BODY = `HORÁRIOS ADULTO:

Iniciantes e todos os níveis:
- Segunda e Quarta: 7h e 19h10
- Terça e Quinta: 7h e 20h15
- Sexta: 7h e 18h
- Sábado: 10h às 12h

Turma Feminina:
- Terça e Quinta: 19h

No-Gi sem kimono (a partir da Faixa Azul):
- Segunda a Sexta: 12h

Treino Avançado (a partir da Faixa Azul):
- Segunda e Quarta: 20h15

Em todos os planos você treina quantas vezes quiser,
de segunda a sábado.

HORÁRIOS INFANTIL (5 a 9 anos — Pequenos Campeões):
- Segunda e Quarta: 8h
- Terça e Quinta: 18h

HORÁRIOS JUNIORES (10 a 15 anos):
- Terça e Quinta: 8h
- Segunda e Quarta: 18h

PLANOS ADULTO:
- Anual: 12x de R$289
- Recorrente: R$330 por mês
- Semestral: 6x de R$330
- Trimestral: 3x de R$360
- Mensal: R$390

Taxa de matrícula: R$90 (cobrada uma única vez)

Em todos os planos você treina quantas vezes quiser,
de segunda a sábado.

PLANOS INFANTIL E JUNIORES:
- Anual: 12x de R$239
- Recorrente: R$279 por mês
- Semestral: 6x de R$279
- Trimestral: 3x de R$299
- Mensal: R$319

Taxa de matrícula: R$90 (cobrada uma única vez)

UNIFORME:

A Gracie Barra exige o uso do kimono oficial da equipe durante
os treinos — kimonos de outras equipes não são permitidos.

O uniforme completo é composto por kimono + camiseta training + faixa.

Adulto:
- Kimono: R$649,90
- Camiseta training: R$179,90
- Faixa: R$79,90
- Kit completo em até 3x de R$303,23

Infantil:
- Kimono: R$489,90
- Camiseta: R$159,90
- Faixa: R$79,90
- Kit completo em até 3x no cartão

Para aulas avulsas: temos kimono disponível para aluguel por aula.
Na aula experimental: emprestamos o kimono gratuitamente.

AULA EXPERIMENTAL:
- Gratuita, sem necessidade de uniforme — emprestamos o kimono
- Para agendar: pedir horário preferido e nome completo
- Endereço: Azure Residence, Av. Dr. Antônio Luciano Pereira Filho,
  843 — Coronel Luciano, Lagoa da Prata MG

REGRAS DE TOM:
- Use o primeiro nome da pessoa quando souber
- Nunca use frases genéricas como "Que bom seu interesse!"
- Nunca pareça que está seguindo um roteiro
- Adapte o nível de formalidade ao da pessoa — se ela for informal, seja informal também
- Para pagamentos, graduação ou assuntos internos, diga que vai passar para o responsável
- Nunca invente informações que não estão listadas acima
- Se não souber responder, diga que vai verificar e retornar

REGRAS DE FORMATAÇÃO:
- Nunca mande blocos de texto sem quebra de linha
- Entre cada tópico deixe uma linha em branco
- Listas com mais de 4 itens: deixe linha em branco entre cada item
- Máximo de 1 emoji por mensagem — use com intenção, não como decoração
- Se a resposta tiver mais de 3 tópicos diferentes, priorize o mais relevante e deixe os outros para a próxima mensagem se perguntarem
- Respostas curtas e diretas — evite textos longos desnecessários

REGRAS DE VENDAS:
- Responda sempre a dúvida primeiro, antes de qualquer pergunta
- Faça no máximo 1 pergunta por mensagem
- Use o CTA de aula experimental no máximo 1 vez por conversa, no momento certo
- Depois de usar o CTA uma vez, não repita — faça uma pergunta diferente para entender melhor o contexto
- Se a pessoa hesitar no preço, ofereça o mensal como forma de experimentar sem compromisso e reforce que a experimental é gratuita e sem obrigação
- Prefira perguntas abertas que revelam contexto:
  "O que te motivou a procurar o Jiu-Jitsu?" em vez de
  "Você quer se matricular?"`;

export default function Inbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const addToast = useUiStore((s) => s.addToast);
  const fetchLeads = useLeadStore((s) => s.fetchLeads);
  const leads = useLeadStore((s) => s.leads);
  const leadsLoading = useLeadStore((s) => s.loading);
  const academyId = useLeadStore((s) => s.academyId);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = String(params.get('phone') || '').trim();
    const digits = normalizePhone(raw);
    if (!digits) return;
    setSelectedPhone(digits);
  }, [location.search]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [sending, setSending] = useState(false);
  const [cancelingMsgId, setCancelingMsgId] = useState('');
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [isNarrowDesktop, setIsNarrowDesktop] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const [listFilter, setListFilter] = useState('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [stats, setStats] = useState({
    firstResponseMs: [],
    selectedCount: 0,
    resolvedCount: 0,
    transferredCount: 0
  });
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window === 'undefined') return 360;
    const raw = window.localStorage.getItem('inbox_list_width');
    const n = Number.parseInt(String(raw || ''), 10);
    if (!Number.isFinite(n)) return 360;
    return Math.max(300, Math.min(480, n));
  });
  const [leadPanel, setLeadPanel] = useState(null);
  const [leadNameDraft, setLeadNameDraft] = useState('');
  const [leadTypeDraft, setLeadTypeDraft] = useState('Adulto');
  const [leadSearch, setLeadSearch] = useState('');
  const [linkingLead, setLinkingLead] = useState(false);
  const [highlighted, setHighlighted] = useState({});
  const [realtimeOn, setRealtimeOn] = useState(false);
  const [promptModal, setPromptModal] = useState(false);
  const [promptIntro, setPromptIntro] = useState('');
  const [promptBody, setPromptBody] = useState('');
  const [promptSuffix, setPromptSuffix] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadPaging, setThreadPaging] = useState(false);
  const [threadCursor, setThreadCursor] = useState(null);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [ticketUpdating, setTicketUpdating] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferToDraft, setTransferToDraft] = useState('');
  const [inboxTab, setInboxTab] = useState('conversas');
  const [waLoading, setWaLoading] = useState(false);
  const [waInfo, setWaInfo] = useState({ instance_id: null, status: 'disconnected', qrcode: null });
  const [waTokenMissing, setWaTokenMissing] = useState(false);
  const [waQrError, setWaQrError] = useState(false);
  const [waQrTick, setWaQrTick] = useState(0);
  const [waSyncing, setWaSyncing] = useState(false);
  const [contextOpen, setContextOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem('inbox_context_open');
    if (raw === '0') return false;
    if (raw === '1') return true;
    return true;
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [selectedMsgKey, setSelectedMsgKey] = useState('');
  const [expandedMsgs, setExpandedMsgs] = useState({});
  const [threadAtBottom, setThreadAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [msgFlags, setMsgFlags] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('inbox_msg_flags');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const waOpen = inboxTab === 'dispositivo';
  const quickTemplates = useMemo(
    () => ['Oi! Como posso te ajudar hoje?', 'Perfeito! Vou te passar as opções agora.', 'Consigo te ajudar a agendar uma aula experimental gratuita.'],
    []
  );

  const draftRef = useRef('');
  const selectedPhoneRef = useRef('');
  const textareaRef = useRef(null);
  const threadScrollRef = useRef(null);
  const lastAutoScrollPhoneRef = useRef('');
  const threadMsgCountRef = useRef(0);
  const listMetaRef = useRef(new Map());
  const notifiedOnceRef = useRef(false);
  const loadListRef = useRef(null);
  const loadThreadRef = useRef(null);
  const threadAbortRef = useRef(null);
  const threadRequestSeqRef = useRef(0);
  const realtimeTimersRef = useRef({ list: null, thread: null });
  const academyIdRef = useRef('');
  const firstResponseTrackedRef = useRef({});

  const searchQuery = useMemo(() => String(search || '').trim(), [search]);

  useEffect(() => {
    draftRef.current = String(draft || '');
  }, [draft]);

  useEffect(() => {
    selectedPhoneRef.current = String(selectedPhone || '');
  }, [selectedPhone]);

  useEffect(() => {
    return () => {
      try {
        if (threadAbortRef.current) threadAbortRef.current.abort();
      } catch {
        void 0;
      }
    };
  }, []);

  useEffect(() => {
    academyIdRef.current = String(academyId || '').trim();
  }, [academyId]);

  useEffect(() => {
    setLeadPanel(null);
    setLeadSearch('');
    setLeadNameDraft('');
  }, [selectedPhone]);

  useEffect(() => {
    if (leadsLoading) return;
    const arr = Array.isArray(leads) ? leads : [];
    if (arr.length > 0) return;
    fetchLeads();
  }, [leadsLoading, leads, fetchLeads]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('inbox_list_width', String(listWidth));
  }, [listWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('inbox_context_open', contextOpen ? '1' : '0');
  }, [contextOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('inbox_msg_flags', JSON.stringify(msgFlags || {}));
    } catch {
      void 0;
    }
  }, [msgFlags]);

  useEffect(() => {
    if (leadPanel !== 'associate') return;
    if (leadsLoading) return;
    if (Array.isArray(leads) && leads.length > 0) return;
    fetchLeads();
  }, [leadPanel, leadsLoading, leads, fetchLeads]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setIsMobile(Boolean(mq.matches));
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 1365px)');
    const apply = () => setIsNarrowDesktop(Boolean(mq.matches));
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, []);

  useEffect(() => {
    if (!isNarrowDesktop) return;
    if (!contextOpen) return;
    setContextOpen(false);
  }, [isNarrowDesktop, contextOpen]);

  useEffect(() => {
    const unreadBacklog = (Array.isArray(items) ? items : []).reduce((acc, it) => acc + (Number(it?.unread_count || 0) > 0 ? 1 : 0), 0);
    const resolvedCount = (Array.isArray(items) ? items : []).filter((it) => String(it?.ticket_status || '') === 'resolved').length;
    const transferredCount = (Array.isArray(items) ? items : []).filter((it) => String(it?.ticket_status || '') === 'transferred').length;
    setStats((prev) => ({ ...prev, unreadBacklog, resolvedCount, transferredCount }));
  }, [items]);

  useEffect(() => {
    const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
    const firstUser = msgs.find((m) => String(m?.role || '') === 'user');
    const firstAssistant = msgs.find((m) => String(m?.role || '') === 'assistant');
    const firstUserMs = parseTimestampMs(firstUser?.timestamp);
    const firstAssistantMs = parseTimestampMs(firstAssistant?.timestamp);
    if (!selectedPhone || !firstUserMs || !firstAssistantMs || firstAssistantMs <= firstUserMs) return;
    const firstResponseMs = firstAssistantMs - firstUserMs;
    const trackedKey = `${String(selectedPhone || '').trim()}:${String(firstUser?.timestamp || '')}:${String(firstAssistant?.timestamp || '')}`;
    if (firstResponseTrackedRef.current[trackedKey]) return;
    firstResponseTrackedRef.current[trackedKey] = true;
    setStats((prev) => {
      const next = Array.isArray(prev?.firstResponseMs) ? prev.firstResponseMs.slice() : [];
      const phoneKey = String(selectedPhone || '').trim();
      if (!phoneKey) return prev;
      if (next.length > 100) next.shift();
      next.push(firstResponseMs);
      return { ...prev, firstResponseMs: next, selectedCount: Number(prev?.selectedCount || 0) + 1 };
    });
  }, [selectedPhone, selected?.messages]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (editing) return;
      if (!selectedPhone) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        loadThread(selectedPhoneRef.current);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setTransferToDraft(String(selected?.transfer_to || '').trim());
        setTransferModalOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        updateTicket({ status: String(selected?.ticket_status || '') === 'resolved' ? 'open' : 'resolved' });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        openPromptSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPhone, selected?.ticket_status, selected?.transfer_to]);

  function safeParseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function formatDayLabel(iso) {
    const s = String(iso || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return '';
    const now = new Date();
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((dd.getTime() - nn.getTime()) / (24 * 60 * 60 * 1000));
    if (diff === 0) return 'Hoje';
    if (diff === -1) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function messageKey(m) {
    const mid = String(m?.message_id || '').trim();
    if (mid) return mid;
    const role = String(m?.role || '').trim();
    const ts = String(m?.timestamp || '').trim();
    const content = String(m?.content || '').trim();
    return `${role}:${ts}:${content.slice(0, 80)}`;
  }

  function senderKindFromMessage(m) {
    const role = m?.role === 'assistant' ? 'assistant' : 'user';
    if (role !== 'assistant') return 'user';
    const sender = String(m?.sender || '').trim().toLowerCase();
    if (sender === 'human' || sender === 'humano') return 'human';
    if (sender === 'ai' || sender === 'agent' || sender === 'agente') return 'ai';
    const hasAiHints = Boolean(m?.in_reply_to) || (m?.classificacao && typeof m.classificacao === 'object');
    return hasAiHints ? 'ai' : 'human';
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      addToast({ type: 'success', message: 'Copiado' });
      return true;
    } catch {
      addToast({ type: 'error', message: 'Falha ao copiar' });
      return false;
    }
  }

  function toggleMsgFlag(phone, key, kind) {
    const p = String(phone || '').trim();
    const k = String(key || '').trim();
    const t = String(kind || '').trim();
    if (!p || !k || (t !== 'pinned' && t !== 'important')) return;
    setMsgFlags((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const cur = base[p] && typeof base[p] === 'object' ? base[p] : {};
      const next = { ...base };
      const curMap = cur[t] && typeof cur[t] === 'object' ? cur[t] : {};
      const has = Boolean(curMap[k]);
      const nextMap = { ...curMap };
      if (has) delete nextMap[k];
      else nextMap[k] = true;
      next[p] = { ...cur, [t]: nextMap };
      return next;
    });
  }

  function openMenu(kind, anchorEl, payload) {
    const el = anchorEl && anchorEl.getBoundingClientRect ? anchorEl : null;
    const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const w = 260;
    const h = 260;
    const x = Math.max(10, Math.min(rect.left, vw - w - 10));
    const y = Math.max(10, Math.min(rect.bottom + 8, vh - h - 10));
    setMenu({ kind: String(kind || '').trim(), x, y, payload: payload || null });
  }

  function closeMenu() {
    setMenu(null);
  }

  function scrollThreadToBottom({ clearNew = true } = {}) {
    const el = threadScrollRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
      lastAutoScrollPhoneRef.current = String(selectedPhoneRef.current || '').trim();
      setThreadAtBottom(true);
      if (clearNew) setNewMsgCount(0);
    } catch {
      void 0;
    }
  }

  function normalizeApiError(raw, fallback) {
    const s = String(raw || '').trim();
    if (!s) return fallback;
    const parsed = safeParseJson(s);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.erro === 'string' && parsed.erro.trim()) return parsed.erro.trim();
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    }
    return s;
  }

  async function fetchWaInfo({ silent = false } = {}) {
    if (!academyIdRef.current) return;
    if (!silent) setError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch('/api/zapster/instances', {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao consultar WhatsApp'));
      const data = safeParseJson(raw) || {};
      const instance_id = data?.instance_id || null;
      const status = String(data?.status || '').trim() || 'unknown';
      const qrcode = data?.qrcode ?? null;
      setWaInfo({ instance_id, status, qrcode });
      setWaTokenMissing(false);
      setWaQrError(false);
      setWaQrTick((v) => v + 1);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('zapster_api_token') || msg.toLowerCase().includes('token')) {
        setWaTokenMissing(true);
      }
      if (!silent) setError(msg || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }

  async function createWaInstance() {
    if (!academyIdRef.current) return;
    setError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch('/api/zapster/instances', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao criar instância'));
      const data = safeParseJson(raw) || {};
      const instance_id = data?.instance_id || null;
      const status = String(data?.status || '').trim() || 'unknown';
      const qrcode = data?.qrcode ?? null;
      setWaInfo({ instance_id, status, qrcode });
      addToast({ type: 'success', message: 'Instância criada' });
      setWaTokenMissing(false);
      setWaQrError(false);
      setWaQrTick((v) => v + 1);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('zapster_api_token') || msg.toLowerCase().includes('token')) {
        setWaTokenMissing(true);
      }
      setError(msg || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }

  async function disconnectWaInstance() {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/zapster/instances?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao desconectar'));
      addToast({ type: 'success', message: 'Dispositivo desconectado' });
      setWaInfo({ instance_id: null, status: 'disconnected', qrcode: null });
      setWaTokenMissing(false);
      setWaQrError(false);
      setWaQrTick(0);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('zapster_api_token') || msg.toLowerCase().includes('token')) {
        setWaTokenMissing(true);
      }
      setError(msg || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }

  async function powerOnInstance() {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/zapster/instances?action=power-on&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      if (!(resp.ok || resp.status === 204)) {
        const raw = await resp.text();
        throw new Error(normalizeApiError(raw, 'Falha ao ligar instância'));
      }
      addToast({ type: 'success', message: 'Instância ligada' });
      await fetchWaInfo({ silent: true });
    } catch (e) {
      const msg = String(e?.message || '');
      setError(msg || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }

  async function powerOffInstance() {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/zapster/instances?action=power-off&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      if (!(resp.ok || resp.status === 204)) {
        const raw = await resp.text();
        throw new Error(normalizeApiError(raw, 'Falha ao desligar instância'));
      }
      addToast({ type: 'success', message: 'Instância desligada' });
      await fetchWaInfo({ silent: true });
    } catch (e) {
      const msg = String(e?.message || '');
      setError(msg || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }

  async function restartInstance() {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/zapster/instances?action=restart&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      if (!(resp.ok || resp.status === 204)) {
        const raw = await resp.text();
        throw new Error(normalizeApiError(raw, 'Falha ao reiniciar instância'));
      }
      addToast({ type: 'success', message: 'Reiniciando instância…' });
      setTimeout(() => {
        fetchWaInfo({ silent: true });
      }, 1200);
    } catch (e) {
      const msg = String(e?.message || '');
      setError(msg || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }

  async function reconcileLast24h() {
    if (!academyIdRef.current) return;
    setError('');
    setWaSyncing(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch('/api/whatsapp?action=reconcile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const raw = await resp.text();
      const data = safeParseJson(raw) || {};
      if (!resp.ok) {
        if (data?.code === 'messages_retention_exceeded' || resp.status === 402) {
          addToast({ type: 'warning', message: 'Plano Zapster limita o histórico a 24h. As mensagens recentes foram importadas normalmente.' });
          await loadList({ reset: true, silent: true });
          const phone2 = String(selectedPhoneRef.current || '').trim();
          if (phone2) await loadThread(phone2);
          return;
        }
        throw new Error(normalizeApiError(raw, 'Falha ao atualizar'));
      }
      const updated = Number.isFinite(Number(data?.conversations_updated)) ? Number(data.conversations_updated) : 0;
      const created = Number.isFinite(Number(data?.conversations_created)) ? Number(data.conversations_created) : 0;
      const merged = Number.isFinite(Number(data?.messages_merged)) ? Number(data.messages_merged) : 0;
      addToast({
        type: 'success',
        message: `Sincronizado • ${updated} conversas${created ? ` (+${created})` : ''}${merged ? ` • ${merged} msgs` : ''}`
      });
      await loadList({ reset: true, silent: true });
      const phone = String(selectedPhoneRef.current || '').trim();
      if (phone) await loadThread(phone);
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Erro ao atualizar' });
    } finally {
      setWaSyncing(false);
    }
  }

  useEffect(() => {
    if (!academyId) return;
    fetchWaInfo({ silent: true });
  }, [academyId]);

  useEffect(() => {
    if (!waOpen) return;
    if (!waInfo || waInfo.status === 'connected') return;
    const id = setInterval(() => {
      fetchWaInfo({ silent: true });
    }, 3000);
    return () => clearInterval(id);
  }, [waOpen, waInfo?.status]);

  useEffect(() => {
    if (!waOpen) return;
    if (!waInfo?.instance_id) return;
    if (waInfo?.status === 'connected') return;
    if (waTokenMissing) return;
    const id = setInterval(() => {
      setWaQrTick((v) => v + 1);
      setWaQrError(false);
    }, 6000);
    return () => clearInterval(id);
  }, [waOpen, waInfo?.instance_id, waInfo?.status, waTokenMissing]);

  function playNotificationSound() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
      osc.onended = () => {
        try {
          ctx.close();
        } catch {
          void 0;
        }
      };
    } catch {
      void 0;
    }
  }

  function setHighlightedPhone(phone) {
    const p = String(phone || '').trim();
    if (!p) return;
    const expiresAt = Date.now() + 25000;
    setHighlighted((prev) => ({ ...(prev || {}), [p]: expiresAt }));
    try {
      setTimeout(() => {
        setHighlighted((prev) => {
          const cur = prev && typeof prev === 'object' ? prev : {};
          const exp = Number(cur[p] || 0);
          if (!Number.isFinite(exp) || exp <= Date.now()) {
            const next = { ...cur };
            delete next[p];
            return next;
          }
          return cur;
        });
      }, 26000);
    } catch {
      void 0;
    }
  }

  async function markSeen(phone) {
    const p = String(phone || '').trim();
    if (!p) return;
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(p)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'read' })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao marcar como lida'));
      setItems((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map((it) => {
          const ph = String(it?.phone_number || '').trim();
          if (ph !== p) return it;
          return { ...it, unread_count: 0, last_read_at: new Date().toISOString() };
        });
      });
      setSelected((prev) => {
        if (!prev || prev.phone !== p) return prev;
        return { ...prev, unread_count: 0, last_read_at: new Date().toISOString() };
      });
      setHighlighted((prev) => {
        const cur = prev && typeof prev === 'object' ? prev : {};
        if (!cur[p]) return cur;
        const n = { ...cur };
        delete n[p];
        return n;
      });
    } catch {
      void 0;
    }
  }

  async function openPromptSettings() {
    setLoadingPrompt(true);
    setInboxTab('agente');
    try {
      const jwt = await getJwt();
      const resp = await fetch('/api/settings/ai-prompt', {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      const data = await resp.json();
      if (resp.ok && data && typeof data === 'object') {
        setPromptIntro(String(data.prompt_intro || ''));
        setPromptBody(String(data.prompt_body || ''));
        setPromptSuffix(String(data.prompt_suffix || ''));
      } else {
        throw new Error('Falha ao carregar');
      }
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Erro ao carregar' });
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function savePromptSettings() {
    setSavingPrompt(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch('/api/settings/ai-prompt', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ prompt_intro: promptIntro, prompt_body: promptBody, prompt_suffix: promptSuffix })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao salvar'));
      addToast({ type: 'success', message: 'Prompt atualizado' });
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Erro ao salvar' });
    } finally {
      setSavingPrompt(false);
    }
  }

  async function loadList({ reset = false, silent = false } = {}) {
    if (reset) {
      setNextCursor(null);
      setHasMore(true);
    }
    if (!reset && (!hasMore || loadingMore || loading)) return;
    if (!silent) setError('');
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const jwt = await getJwt();
      const qs = new URLSearchParams();
      qs.set('limit', '50');
      const cursorToUse = reset ? '' : String(nextCursor || '').trim();
      if (cursorToUse) qs.set('cursor', cursorToUse);
      if (searchQuery) qs.set('search', searchQuery);
      const resp = await fetch(`/api/conversations?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao carregar conversas'));
      const data = safeParseJson(raw) || {};
      const next = Array.isArray(data?.items) ? data.items : [];
      const nextCur = data?.next_cursor ? String(data.next_cursor) : null;
      const previousMeta = listMetaRef.current instanceof Map ? listMetaRef.current : new Map();
      const nextMeta = reset ? new Map() : new Map(previousMeta);
      for (const it of next) {
        const phone = String(it?.phone_number || '').trim();
        if (!phone) continue;
        const ts = String(it?.last_message_timestamp || it?.updated_at || '').trim();
        nextMeta.set(phone, {
          ts,
          role: String(it?.last_message_role || '').trim(),
          sender: String(it?.last_message_sender || '').trim()
        });
      }
      setNextCursor(nextCur);
      setHasMore(Boolean(nextCur) && next.length > 0 && !searchQuery);
      setLastUpdatedAt(new Date().toISOString());
      setItems((prev) => {
        const incoming = reset ? next : [...(Array.isArray(prev) ? prev : []), ...next];
        const seen = new Set();
        const deduped = [];
        for (const it of incoming) {
          const phoneKey = String(it?.phone_number || '').trim();
          const k = phoneKey || String(it?.id || '');
          if (!k || seen.has(k)) continue;
          seen.add(k);
          deduped.push(it);
        }
        return deduped;
      });
      if (reset && notifiedOnceRef.current) {
        for (const it of next) {
          const phone = String(it?.phone_number || '').trim();
          if (!phone) continue;
          const prevMeta = previousMeta.get(phone);
          const curMeta = nextMeta.get(phone);
          if (!prevMeta || !curMeta) continue;
          const prevTs = new Date(String(prevMeta.ts || '')).getTime();
          const curTs = new Date(String(curMeta.ts || '')).getTime();
          if (!Number.isFinite(prevTs) || !Number.isFinite(curTs) || curTs <= prevTs) continue;
          const role = String(curMeta.role || '').trim();
          if (role !== 'user') continue;
          if (String(selectedPhoneRef.current || '').trim() === phone) continue;
          const preview = String(it?.last_preview || '').trim();
          const name = String(it?.lead_name || '').trim() || phone;
          playNotificationSound();
          setHighlightedPhone(phone);
          addToast({
            type: 'info',
            message: `Nova mensagem de ${name}${preview ? `: ${preview}` : ''}`
          });
        }
      } else if (reset) {
        notifiedOnceRef.current = true;
      }
      listMetaRef.current = nextMeta;
      if (reset) {
        if (!selectedPhoneRef.current && next.length > 0) setSelectedPhone(String(next[0].phone_number || ''));
      }
    } catch (e) {
      if (!silent) setError(e?.message || 'Erro');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  }

  async function loadThread(phone, { silent = false, cursor = '', append = false } = {}) {
    const p = String(phone || '').trim();
    if (!p) return;
    if (!silent) {
      setError('');
      setThreadError('');
    }
    const reqSeq = ++threadRequestSeqRef.current;
    if (!append) {
      try {
        if (threadAbortRef.current) threadAbortRef.current.abort();
      } catch {
        void 0;
      }
      threadAbortRef.current = new AbortController();
    }
    const signal = !append && threadAbortRef.current ? threadAbortRef.current.signal : undefined;
    const prevScroll = (() => {
      if (!append) return null;
      const el = threadScrollRef.current;
      if (!el) return null;
      return { height: el.scrollHeight, top: el.scrollTop };
    })();
    try {
      if (append) setThreadPaging(true);
      else setThreadLoading(true);
      const jwt = await getJwt();
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (cursor) params.set('cursor', String(cursor));
      const qs = params.toString();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(p)}${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') },
        ...(signal ? { signal } : {})
      });
      const contentType = resp.headers.get('content-type') || '';
      const raw = await resp.text();
      console.log('[loadThread]', p, 'status:', resp.status, 'academy:', academyIdRef.current, 'body:', raw.slice(0, 300));
      if (!contentType.includes('application/json')) {
        console.error('[loadThread] resposta não é JSON', {
          phone: p,
          status: resp.status,
          contentType,
          bodyPreview: raw.slice(0, 100)
        });
        if (!silent) setThreadError('Erro ao carregar conversa. Tente novamente.');
        return;
      }
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao carregar conversa'));
      const data = safeParseJson(raw) || {};
      const incoming = Array.isArray(data?.messages) ? data.messages : [];
      const nextCur = typeof data?.next_cursor === 'string' ? data.next_cursor : '';
      const summary = data?.summary && typeof data.summary === 'object' ? data.summary : null;
      const handoffUntil = typeof data?.human_handoff_until === 'string' ? data.human_handoff_until : '';
      const ticketStatus = typeof data?.ticket_status === 'string' ? data.ticket_status : 'open';
      const transferTo = typeof data?.transfer_to === 'string' ? data.transfer_to : '';
      if (reqSeq !== threadRequestSeqRef.current) return;
      setThreadCursor(nextCur || null);
      setThreadHasMore(Boolean(nextCur));
      setSelected((prev) => {
        const base = {
          phone: p,
          summary,
          lead_id: typeof data?.lead_id === 'string' ? data.lead_id : null,
          lead_name: typeof data?.lead_name === 'string' ? data.lead_name : '',
          need_human: Boolean(data?.need_human),
          human_handoff_until: handoffUntil || null,
          ticket_status: String(ticketStatus || 'open'),
          transfer_to: transferTo || null
        };
        if (!append || !prev || prev.phone !== p) {
          return { ...base, messages: incoming };
        }
        const existing = Array.isArray(prev.messages) ? prev.messages : [];
        const combined = [...incoming, ...existing];
        const seen = new Set();
        const deduped = [];
        for (const m of combined) {
          const mid = String(m?.message_id || '').trim();
          const key = mid || `${String(m?.role || '')}:${String(m?.timestamp || '')}:${String(m?.content || '')}`;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          deduped.push(m);
        }
        return { ...base, messages: deduped };
      });
      try {
        const last = incoming.length > 0 ? incoming[incoming.length - 1] : null;
        const textRaw = String(last?.content || '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
        const preview = textRaw.length > 40 ? `${textRaw.slice(0, 40)}…` : textRaw;
        if (preview) {
          setItems((prev) => {
            const arr = Array.isArray(prev) ? prev : [];
            return arr.map((it) => {
              const ph = String(it?.phone_number || '').trim();
              if (ph !== p) return it;
              return { ...it, last_preview: preview };
            });
          });
        }
      } catch {
        void 0;
      }
      try {
        if (!append) {
          setTimeout(() => {
            if (reqSeq !== threadRequestSeqRef.current) return;
            const el = threadScrollRef.current;
            if (!el) return;
            el.scrollTop = el.scrollHeight;
            lastAutoScrollPhoneRef.current = p;
          }, 0);
        } else if (prevScroll) {
          setTimeout(() => {
            if (reqSeq !== threadRequestSeqRef.current) return;
            const el = threadScrollRef.current;
            if (!el) return;
            const nextHeight = el.scrollHeight;
            const delta = nextHeight - prevScroll.height;
            el.scrollTop = prevScroll.top + delta;
          }, 0);
        }
      } catch {
        void 0;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (!silent) setError(e?.message || 'Erro');
    } finally {
      if (reqSeq === threadRequestSeqRef.current) {
        setThreadLoading(false);
        setThreadPaging(false);
      }
    }
  }

  useEffect(() => {
    loadListRef.current = loadList;
  }, [loadList]);

  useEffect(() => {
    loadThreadRef.current = loadThread;
  }, [loadThread]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!DB_ID || !CONVERSATIONS_COL) return;
    let unsub = null;
    try {
      unsub = realtime.subscribe(`databases.${DB_ID}.collections.${CONVERSATIONS_COL}.documents`, (ev) => {
        const payload = ev && typeof ev === 'object' ? ev.payload : null;
        const academy = payload && typeof payload === 'object' ? String(payload.academy_id || payload.academyId || '').trim() : '';
        const expected = String(academyIdRef.current || '').trim();
        if (academy && expected && academy !== expected) return;
        const phone = payload && typeof payload === 'object' ? String(payload.phone_number || '').trim() : '';

        if (realtimeTimersRef.current?.list) clearTimeout(realtimeTimersRef.current.list);
        realtimeTimersRef.current.list = setTimeout(() => {
          const fn = loadListRef.current;
          if (typeof fn === 'function') fn({ reset: true, silent: true });
        }, 250);

        const selectedNow = String(selectedPhoneRef.current || '').trim();
        if (phone && selectedNow && phone === selectedNow) {
          if (realtimeTimersRef.current?.thread) clearTimeout(realtimeTimersRef.current.thread);
          realtimeTimersRef.current.thread = setTimeout(() => {
            const fn = loadThreadRef.current;
            if (typeof fn === 'function') fn(phone, { silent: true });
          }, 250);
        }
      });
      setRealtimeOn(true);
    } catch {
      setRealtimeOn(false);
    }
    return () => {
      try {
        if (realtimeTimersRef.current?.list) clearTimeout(realtimeTimersRef.current.list);
        if (realtimeTimersRef.current?.thread) clearTimeout(realtimeTimersRef.current.thread);
      } catch {
        void 0;
      }
      try {
        if (unsub && typeof unsub === 'function') unsub();
        if (unsub && typeof unsub.unsubscribe === 'function') unsub.unsubscribe();
      } catch {
        void 0;
      }
      setRealtimeOn(false);
    };
  }, []);

  async function setHandoffActive(ativo, { silent = false } = {}) {
    const phone = String(selectedPhoneRef.current || '').trim();
    if (!phone) return false;
    if (!silent) setError('');
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'handoff', ativo: Boolean(ativo) })
      });
      const raw = await resp.text();
      if (!resp.ok) {
        const msg = String(raw || '').trim() ? normalizeApiError(raw, 'Falha ao atualizar handoff') : `Falha ao atualizar handoff (HTTP ${resp.status})`;
        throw new Error(msg);
      }
      const data = safeParseJson(raw) || {};
      const until = typeof data?.human_handoff_until === 'string' ? data.human_handoff_until : '';
      const active = Boolean(data?.need_human);
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        return { ...prev, need_human: active, human_handoff_until: until || null };
      });
      setItems((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map((it) => {
          const p = String(it?.phone_number || '').trim();
          if (p !== phone) return it;
          return { ...it, need_human: active, human_handoff_until: until || null };
        });
      });
      await loadList({ reset: true, silent: true });
      return true;
    } catch (e) {
      if (!silent) setError(e?.message || 'Erro');
      return false;
    }
  }

  function toIsoFromLocalDatetime(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    const [d, t] = s.split('T');
    if (!d || !t) return '';
    const [yy, mm, dd] = d.split('-').map((v) => Number(v));
    const [hh, mi] = t.split(':').map((v) => Number(v));
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(hh) || !Number.isFinite(mi)) return '';
    const dt = new Date(yy, mm - 1, dd, hh, mi, 0, 0);
    const ms = dt.getTime();
    if (!Number.isFinite(ms)) return '';
    return dt.toISOString();
  }

  async function sendManual() {
    const phone = String(selectedPhone || '').trim();
    const text = String(draft || '').trim();
    if (!phone || !text) return;
    setError('');
    setSending(true);
    try {
      const sendAtIso = scheduleOn ? toIsoFromLocalDatetime(scheduleAtLocal) : '';
      if (scheduleOn && !sendAtIso) {
        addToast({ type: 'error', message: 'Escolha data e hora para agendar' });
        return;
      }
      const shouldAssume = !selected?.need_human;
      if (shouldAssume) {
        await setHandoffActive(true, { silent: true });
      }
      const jwt = await getJwt();
      const resp = await fetch('/api/whatsapp?action=send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ phone, text, ...(sendAtIso ? { send_at: sendAtIso } : {}) })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao enviar'));
      const data = safeParseJson(raw) || {};
      const status = String(data?.status || '').trim();
      const sendAt = typeof data?.send_at === 'string' ? data.send_at : null;
      const msgId = typeof data?.message_id === 'string' ? data.message_id : null;
      const nowIso = new Date().toISOString();
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages.slice() : [];
        msgs.push({
          role: 'assistant',
          content: text,
          timestamp: nowIso,
          sender: 'human',
          ...(status ? { status } : {}),
          ...(sendAt ? { send_at: sendAt } : {}),
          ...(msgId ? { message_id: msgId } : {})
        });
        return { ...prev, messages: msgs.slice(-50) };
      });
      markSeen(phone);
      setDraft('');
      setScheduleOn(false);
      setScheduleAtLocal('');
      addToast({ type: 'success', message: status === 'scheduled' ? 'Agendado' : 'Enviado' });
      await loadList({ reset: true, silent: true });
      try {
        setTimeout(() => {
          const el = threadScrollRef.current;
          if (!el) return;
          el.scrollTop = el.scrollHeight;
          lastAutoScrollPhoneRef.current = phone;
        }, 0);
      } catch {
        void 0;
      }
    } catch (e) {
      setError(e?.message || 'Erro');
    } finally {
      setSending(false);
    }
  }

  async function cancelScheduledMessage(messageId) {
    const phone = String(selectedPhoneRef.current || '').trim();
    const mid = String(messageId || '').trim();
    if (!phone || !mid) return;
    if (cancelingMsgId) return;
    const ok = window.confirm('Cancelar esta mensagem agendada?');
    if (!ok) return;
    setCancelingMsgId(mid);
    try {
      const jwt = await getJwt();
      const resp = await fetch('/api/whatsapp?action=cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ phone, message_id: mid })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao cancelar'));
      const data = safeParseJson(raw) || {};
      const canceledAt = typeof data?.canceled_at === 'string' ? data.canceled_at : new Date().toISOString();
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages.slice() : [];
        const i = msgs.findIndex((m) => String(m?.message_id || '').trim() === mid);
        if (i < 0) return prev;
        msgs[i] = { ...(msgs[i] && typeof msgs[i] === 'object' ? msgs[i] : {}), status: 'canceled', canceled_at: canceledAt };
        return { ...prev, messages: msgs };
      });
      addToast({ type: 'success', message: 'Agendamento cancelado' });
      await loadList({ reset: true, silent: true });
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Erro ao cancelar' });
    } finally {
      setCancelingMsgId('');
    }
  }

  async function linkLeadToConversation({ leadId }) {
    const phone = String(selectedPhoneRef.current || '').trim();
    if (!phone || !leadId) return;
    setLinkingLead(true);
    setError('');
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'link_lead', lead_id: leadId })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao associar lead'));
      const data = safeParseJson(raw) || {};
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        return {
          ...prev,
          lead_id: typeof data?.lead_id === 'string' ? data.lead_id : leadId,
          lead_name: typeof data?.lead_name === 'string' ? data.lead_name : prev.lead_name
        };
      });
      await loadList({ reset: true, silent: true });
      addToast({ type: 'success', message: 'Lead associado' });
      setLeadPanel(null);
      setLeadSearch('');
    } catch (e) {
      setError(e?.message || 'Erro');
    } finally {
      setLinkingLead(false);
    }
  }

  async function convertToLead() {
    const phone = String(selectedPhoneRef.current || '').trim();
    const name = String(leadNameDraft || '').trim() || String(selected?.lead_name || '').trim() || phone;
    if (!phone) return;
    setLinkingLead(true);
    setError('');
    try {
      const latestClass = (() => {
        const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && m.classificacao && typeof m.classificacao === 'object') return m.classificacao;
        }
        return {};
      })();
      const jwt = await getJwt();
      const resp = await fetch('/api/leads/convert', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          phone,
          name,
          type: String(leadTypeDraft || 'Adulto').trim(),
          classificacao: {
            intencao: String(latestClass?.intencao || '').trim(),
            prioridade: String(latestClass?.prioridade || '').trim(),
            lead_quente: String(latestClass?.lead_quente || '').trim(),
            precisa_resposta_humana: String(latestClass?.precisa_resposta_humana || '').trim()
          }
        })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao converter lead'));
      const data = safeParseJson(raw) || {};
      const leadId = String(data?.id || '').trim();
      if (!leadId) throw new Error('ID do lead ausente');
      await linkLeadToConversation({ leadId });
      addToast({ type: 'success', message: data?.ja_existe ? 'Lead já existente' : 'Lead criado' });
      window.location.href = `/lead/${encodeURIComponent(leadId)}`;
    } catch (e) {
      setError(e?.message || 'Erro');
    } finally {
      setLinkingLead(false);
    }
  }

  const applyWrapToDraft = (prefix, suffix = prefix) => {
    const cur = String(draftRef.current || '');
    const el = textareaRef.current;
    const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
    const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
    const selectedText = cur.slice(start, end);
    const wrappingEmpty = start === end;
    const insert = wrappingEmpty ? `${prefix}${suffix}` : `${prefix}${selectedText}${suffix}`;
    const next = cur.slice(0, start) + insert + cur.slice(end);
    setDraft(next);
    setEmojiOpen(false);
    try {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        if (wrappingEmpty) {
          const pos = start + prefix.length;
          textarea.setSelectionRange(pos, pos);
        } else {
          const selStart = start + prefix.length;
          const selEnd = selStart + selectedText.length;
          textarea.setSelectionRange(selStart, selEnd);
        }
      }, 0);
    } catch {
      void 0;
    }
  };

  const insertAtCursor = (text) => {
    const cur = String(draftRef.current || '');
    const el = textareaRef.current;
    const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
    const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    setDraft(next);
    try {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        const pos = start + text.length;
        textarea.setSelectionRange(pos, pos);
      }, 0);
    } catch {
      void 0;
    }
  };

  const emojis = useMemo(
    () => ['😀', '😂', '😍', '🥰', '🙏', '👍', '👏', '🎉', '🔥', '✅', '❌', '🤝', '😢', '🤔', '⭐', '💪', '🥋', '📍', '📞', '⏰'],
    []
  );

  const leadCandidates = useMemo(() => {
    const q = String(leadSearch || '').trim().toLowerCase();
    const qPhone = normalizePhone(q);
    const all = Array.isArray(leads) ? leads : [];
    const filtered = all.filter((l) => {
      const name = String(l?.name || '').toLowerCase();
      const phone = normalizePhone(l?.phone || '');
      if (!q && selectedPhone) return phone.endsWith(normalizePhone(selectedPhone));
      if (qPhone) return phone.includes(qPhone);
      return name.includes(q);
    });
    return filtered.slice(0, 20);
  }, [leads, leadSearch, selectedPhone]);

  useEffect(() => {
    loadList({ reset: true });
  }, [searchQuery]);

  useEffect(() => {
    if (selectedPhone) loadThread(selectedPhone);
  }, [selectedPhone]);


  const leadById = useMemo(() => {
    const map = new Map();
    const arr = Array.isArray(leads) ? leads : [];
    for (const l of arr) {
      const id = String(l?.id || '').trim();
      if (!id) continue;
      map.set(id, l);
    }
    return map;
  }, [leads]);

  const leadByPhone = useMemo(() => {
    const map = new Map();
    const arr = Array.isArray(leads) ? leads : [];
    for (const l of arr) {
      const phone = normalizePhone(l?.phone || '');
      if (!phone) continue;
      if (!map.has(phone)) map.set(phone, l);
    }
    return map;
  }, [leads]);

  const enrichedItems = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return arr.map((it) => {
      const phone = String(it?.phone_number || '').trim();
      const leadId = String(it?.lead_id || '').trim();
      const leadFromId = leadId ? leadById.get(leadId) : null;
      const leadFromPhone = phone ? leadByPhone.get(normalizePhone(phone)) : null;
      const lead = leadFromId || leadFromPhone;
      const name = String(lead?.name || '').trim() || String(it?.lead_name || '').trim() || String(it?.contact_name || '').trim();
      const displayTitle = name || phone || '-';
      const lastRole = String(it?.last_message_role || '').trim() || '';
      const lastSender = String(it?.last_message_sender || '').trim() || '';
      const unreadCount = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
      const handoffActive = Boolean(it?.need_human);
      const aiSuggestHuman = Boolean(lead?.needHuman);
      const hotLead = Boolean(lead?.hotLead);
      const priority = String(lead?.priority || '').trim();
      const intention = String(lead?.intention || '').trim();
      const status = String(lead?.status || '').trim();
      const ticketStatus = String(it?.ticket_status || '').trim() || 'open';
      const transferTo = String(it?.transfer_to || '').trim();
      return {
        ...it,
        _phone: phone,
        _displayTitle: displayTitle,
        _displaySubtitle: name ? phone : '',
        _lead: lead || null,
        _hotLead: hotLead,
        _handoffActive: handoffActive,
        _aiSuggestHuman: aiSuggestHuman,
        _needsHuman: handoffActive,
        _priority: priority,
        _intention: intention,
        _status: status,
        _lastRole: lastRole,
        _lastSender: lastSender,
        _unreadCount: unreadCount,
        _ticketStatus: ticketStatus,
        _transferTo: transferTo,
        _isHighlighted: Boolean(highlighted && typeof highlighted === 'object' && highlighted[phone] && Number(highlighted[phone]) > Date.now())
      };
    });
  }, [items, leadById, leadByPhone, highlighted]);

  const prioritizedItems = useMemo(() => {
    const arr = Array.isArray(enrichedItems) ? enrichedItems : [];
    const score = (it) => {
      let points = 0;
      const unread = Number(it?._unreadCount || 0);
      if (unread > 0) points += 40;
      const ticketStatus = String(it?._ticketStatus || '').trim();
      if (ticketStatus === 'waiting_customer') points += 20;
      if (ticketStatus === 'transferred') points += 8;
      if (ticketStatus === 'resolved') points -= 20;
      if (Boolean(it?._hotLead)) points += 15;
      if (Boolean(it?._handoffActive)) points += 10;
      const updatedMs = parseTimestampMs(it?.updated_at);
      const ageMinutes = updatedMs ? (Date.now() - updatedMs) / 60000 : 0;
      if (ageMinutes > 30 && unread > 0) points += 15;
      return points;
    };
    return arr.slice().sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff) return diff;
      return parseTimestampMs(b?.updated_at) - parseTimestampMs(a?.updated_at);
    });
  }, [enrichedItems]);

  const filteredItems = useMemo(() => {
    const arr = Array.isArray(prioritizedItems) ? prioritizedItems : [];
    const f = String(listFilter || 'all');
    if (f === 'unread') return arr.filter((it) => Number(it?._unreadCount || 0) > 0);
    if (f === 'hot') return arr.filter((it) => Boolean(it?._hotLead));
    if (f === 'need_human') return arr.filter((it) => Boolean(it?._handoffActive));
    if (f === 'waiting_customer') return arr.filter((it) => String(it?._ticketStatus || '') === 'waiting_customer');
    if (f === 'resolved') return arr.filter((it) => String(it?._ticketStatus || '') === 'resolved');
    if (f === 'transferred') return arr.filter((it) => String(it?._ticketStatus || '') === 'transferred');
    return arr;
  }, [prioritizedItems, listFilter]);

  const groupedFilteredItems = useMemo(() => {
    const arr = Array.isArray(filteredItems) ? filteredItems : [];
    const unread = arr.filter((it) => Number(it?._unreadCount || 0) > 0);
    const resolved = arr.filter((it) => String(it?._ticketStatus || '') === 'resolved');
    const open = arr.filter((it) => Number(it?._unreadCount || 0) <= 0 && String(it?._ticketStatus || '') !== 'resolved');
    return [
      { key: 'unread', label: 'Não lidas', items: unread },
      { key: 'open', label: 'Em atendimento', items: open },
      { key: 'resolved', label: 'Resolvidas', items: resolved }
    ];
  }, [filteredItems]);

  const handleSelectConversation = (it) => {
    const phone = String(it?._phone || it?.phone_number || '').trim();
    if (!phone) return;
    setSelectedPhone(phone);
    setThreadCursor(null);
    setThreadHasMore(false);
    setSelected((prev) => ({
      phone,
      summary: prev?.phone === phone ? prev.summary : null,
      lead_id: String(it?.lead_id || '').trim() || null,
      lead_name: String(it?._displayTitle || it?.lead_name || '').trim(),
      need_human: Boolean(it?._handoffActive || it?.need_human),
      human_handoff_until: prev?.phone === phone ? prev.human_handoff_until : null,
      ticket_status: String(it?._ticketStatus || it?.ticket_status || 'open'),
      transfer_to: String(it?._transferTo || it?.transfer_to || '').trim() || null,
      messages: prev?.phone === phone && Array.isArray(prev?.messages) ? prev.messages : []
    }));
  };

  function ticketChip(status, transferTo) {
    const s = String(status || '').trim();
    if (s === 'resolved') return { label: 'Resolvido', bg: 'var(--success-light)', fg: 'var(--success)', tone: 'success' };
    if (s === 'waiting_customer') return { label: 'Aguardando cliente', bg: 'var(--warning-light)', fg: '#b45309', tone: 'warning' };
    if (s === 'transferred') return { label: transferTo ? `Transferido • ${transferTo}` : 'Transferido', bg: 'rgba(59, 130, 246, 0.12)', fg: '#1d4ed8', tone: 'info' };
    return { label: 'Em andamento', bg: 'rgba(6, 182, 212, 0.12)', fg: 'var(--info)', tone: 'info', isDefault: true };
  }

  async function updateTicket({ status, transferTo } = {}) {
    const phone = String(selectedPhoneRef.current || '').trim();
    if (!phone) return false;
    const s = String(status || '').trim();
    if (!s) return false;
    if (ticketUpdating) return false;
    setTicketUpdating(true);
    setError('');
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'ticket', status: s, ...(transferTo ? { transfer_to: String(transferTo) } : {}) })
      });
      const raw = await resp.text();
      if (!resp.ok) {
        const msg = String(raw || '').trim() ? normalizeApiError(raw, 'Falha ao atualizar ticket') : `Falha ao atualizar ticket (HTTP ${resp.status})`;
        throw new Error(msg);
      }
      const data = safeParseJson(raw) || {};
      const nextStatus = typeof data?.ticket_status === 'string' ? data.ticket_status : s;
      const nextTransferTo = typeof data?.transfer_to === 'string' ? data.transfer_to : '';
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        return { ...prev, ticket_status: nextStatus, transfer_to: nextTransferTo || null };
      });
      setItems((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map((it) => {
          const p = String(it?.phone_number || '').trim();
          if (p !== phone) return it;
          return { ...it, ticket_status: nextStatus, transfer_to: nextTransferTo || null };
        });
      });
      await loadList({ reset: true, silent: true });
      return true;
    } catch (e) {
      setError(e?.message || 'Erro');
      return false;
    } finally {
      setTicketUpdating(false);
    }
  }

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    threadMsgCountRef.current = Array.isArray(selected?.messages) ? selected.messages.length : 0;
    setSelectedMsgKey('');
    setExpandedMsgs({});
    setDetailsOpen(false);
    setNewMsgCount(0);
    setThreadAtBottom(true);
    setTimeout(() => scrollThreadToBottom({ clearNew: true }), 0);
  }, [selectedPhone]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
    const nextCount = msgs.length;
    const prevCount = Number(threadMsgCountRef.current || 0);
    threadMsgCountRef.current = nextCount;
    if (nextCount <= prevCount) return;
    if (threadAtBottom) {
      setTimeout(() => scrollThreadToBottom({ clearNew: true }), 0);
      return;
    }
    setNewMsgCount((v) => v + (nextCount - prevCount));
  }, [selected?.messages?.length, selectedPhone, threadAtBottom]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
    const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    if (last) markSeen(phone);
  }, [selectedPhone, selected?.messages?.length]);

  const startResize = (ev) => {
    if (!ev) return;
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = listWidth;
    const onMove = (e) => {
      const dx = e.clientX - startX;
      const next = Math.max(300, Math.min(480, startW + dx));
      setListWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    if (!autoRefresh) return;
    if (realtimeOn) return;
    const id = setInterval(() => {
      loadList({ reset: true, silent: true });
      const phone = selectedPhoneRef.current;
      if (phone && !String(draftRef.current || '').trim()) {
        loadThread(phone, { silent: true });
      }
    }, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, searchQuery, realtimeOn]);

  const threadBlocks = useMemo(() => {
    const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
    const out = [];
    let lastDayKey = '';
    let group = null;
    let lastTs = 0;
    for (const m of msgs) {
      const ts = String(m?.timestamp || '').trim();
      const d = ts ? new Date(ts) : null;
      const ms = d && Number.isFinite(d.getTime()) ? d.getTime() : 0;
      const dayKey = d && Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '';
      if (dayKey && dayKey !== lastDayKey) {
        out.push({ type: 'day', key: dayKey, label: formatDayLabel(ts) || d.toLocaleDateString('pt-BR') });
        lastDayKey = dayKey;
        group = null;
        lastTs = 0;
      }

      const role = m?.role === 'assistant' ? 'assistant' : 'user';
      const mine = role === 'assistant';
      const senderKind = senderKindFromMessage(m);
      const key = messageKey(m);
      const gapOk = ms && lastTs ? ms - lastTs <= 2 * 60 * 1000 : false;
      const canAppend = group && group.mine === mine && group.senderKind === senderKind && gapOk;
      if (!canAppend) {
        group = { type: 'group', id: `${out.length}-${mine ? 'me' : 'them'}-${senderKind}`, mine, senderKind, items: [] };
        out.push(group);
      }
      group.items.push({ key, m });
      if (ms) lastTs = ms;
    }
    return out;
  }, [selected?.messages]);

  const selectedPhoneFlags = useMemo(() => {
    const phone = String(selectedPhone || '').trim();
    const base = msgFlags && typeof msgFlags === 'object' ? msgFlags : {};
    const cur = phone && base[phone] && typeof base[phone] === 'object' ? base[phone] : {};
    const pinned = cur.pinned && typeof cur.pinned === 'object' ? cur.pinned : {};
    const important = cur.important && typeof cur.important === 'object' ? cur.important : {};
    return { pinned, important };
  }, [msgFlags, selectedPhone]);

  const pinnedMessages = useMemo(() => {
    const pinned = selectedPhoneFlags.pinned || {};
    const msgs = Array.isArray(selected?.messages) ? selected.messages : [];
    const list = [];
    for (const m of msgs) {
      const k = messageKey(m);
      if (!pinned[k]) continue;
      const content = String(m?.content || '').trim();
      list.push({ key: k, preview: content.length > 80 ? `${content.slice(0, 80)}…` : content });
    }
    return list;
  }, [selected?.messages, selectedPhoneFlags]);

  const onThreadScroll = (e) => {
    const el = e && e.currentTarget ? e.currentTarget : null;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = remaining < 40;
    setThreadAtBottom(atBottom);
    if (atBottom && newMsgCount) setNewMsgCount(0);
    if (el.scrollTop < 140 && threadHasMore && !threadPaging && threadCursor) {
      loadThread(selectedPhoneRef.current, { silent: true, cursor: String(threadCursor || ''), append: true });
    }
  };

  const listPanel = (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>Conversas</div>
        {!searchQuery && (
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            {hasMore ? 'Role para carregar mais' : 'Fim'}
          </div>
        )}
      </div>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={listFilter === 'all' ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ padding: '6px 10px', minHeight: 34 }}
          onClick={() => setListFilter('all')}
        >
          Todos
        </button>
        <button
          type="button"
          className={listFilter === 'unread' ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ padding: '6px 10px', minHeight: 34 }}
          onClick={() => setListFilter('unread')}
        >
          Não lidas
        </button>
        <button
          type="button"
          className={listFilter === 'waiting_customer' ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ padding: '6px 10px', minHeight: 34 }}
          onClick={() => setListFilter('waiting_customer')}
        >
          Aguardando cliente
        </button>
        <button
          type="button"
          className={listFilter === 'resolved' ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ padding: '6px 10px', minHeight: 34 }}
          onClick={() => setListFilter('resolved')}
        >
          Resolvidos
        </button>
        <button
          type="button"
          className={showMoreFilters ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ padding: '6px 10px', minHeight: 34 }}
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          Mais filtros
        </button>
        {showMoreFilters && (
          <>
            <button
              type="button"
              className={listFilter === 'hot' ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ padding: '6px 10px', minHeight: 34 }}
              onClick={() => setListFilter('hot')}
            >
              Lead quente
            </button>
            <button
              type="button"
              className={listFilter === 'need_human' ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ padding: '6px 10px', minHeight: 34 }}
              onClick={() => setListFilter('need_human')}
            >
              Aguardando humano
            </button>
            <button
              type="button"
              className={listFilter === 'transferred' ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ padding: '6px 10px', minHeight: 34 }}
              onClick={() => setListFilter('transferred')}
            >
              Transferidos
            </button>
          </>
        )}
      </div>
      <div
        style={{ maxHeight: isMobile ? '72vh' : '70vh', overflow: 'auto' }}
        onScroll={(e) => {
          if (searchQuery) return;
          const el = e.currentTarget;
          const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (remaining < 240) loadList({ reset: false, silent: true });
        }}
      >
        <ConversationList
          groupedItems={groupedFilteredItems}
          loading={loading}
          totalItems={items.length}
          loadingMore={loadingMore}
          onSelectConversation={handleSelectConversation}
          selectedPhone={selectedPhone}
          ticketChip={ticketChip}
          formatTimeOnly={formatTimeOnly}
          formatWhen={formatWhen}
        />
      </div>
    </div>
  );

  const threadPanel = !selectedPhone ? (
    <ThreadState type="none-selected" />
  ) : (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          {isMobile && (
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px', minHeight: 34 }}
              onClick={() => {
                setSelectedPhone('');
                setDetailsOpen(false);
              }}
              type="button"
            >
              Voltar
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(() => {
                const phone = String(selectedPhone || '').trim();
                const leadId = String(selected?.lead_id || '').trim();
                const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
                const name = String(lead?.name || '').trim() || String(selected?.lead_name || '').trim();
                return name || phone || '—';
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
              {(() => {
                const phone = String(selectedPhone || '').trim();
                const leadId = String(selected?.lead_id || '').trim();
                const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
                const name = String(lead?.name || '').trim() || String(selected?.lead_name || '').trim();
                const showPhone = Boolean(name) && Boolean(phone);
                if (!showPhone) return null;
                return (
                  <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                    {phone}
                  </span>
                );
              })()}
              {(() => {
                const chip = ticketChip(selected?.ticket_status, selected?.transfer_to);
                return (
                  <span className="text-small" style={{ background: chip.bg, color: chip.fg, padding: '2px 8px', borderRadius: 999 }} title="Status do ticket">
                    {chip.label}
                  </span>
                );
              })()}
              {(() => {
                const phone = String(selectedPhone || '').trim();
                const leadId = String(selected?.lead_id || '').trim();
                const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
                const aiSuggestHuman = Boolean(lead?.needHuman);
                const untilRaw = String(selected?.human_handoff_until || '').trim();
                const untilMs = humanHandoffUntilToMs(untilRaw);
                const untilIso = untilMs > 0 ? new Date(untilMs).toISOString() : '';
                const untilLabel = untilIso ? formatTimeOnly(untilIso) || formatWhen(untilIso) : '';
                if (selected?.need_human) {
                  return (
                    <span
                      className="text-small"
                      style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 999 }}
                      title={untilLabel ? `Atendimento humano até ${untilLabel}` : 'Atendimento humano ativo'}
                    >
                      {untilLabel ? `Humano até ${untilLabel}` : 'Atendimento humano'}
                    </span>
                  );
                }
                if (aiSuggestHuman) {
                  return (
                    <span className="text-small" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#b45309', padding: '2px 8px', borderRadius: 999 }} title="IA sugere intervenção humana">
                      IA sugere humano
                    </span>
                  );
                }
                return (
                  <span className="text-small" style={{ background: 'rgba(34, 197, 94, 0.10)', color: '#16a34a', padding: '2px 8px', borderRadius: 999 }}>
                    Agente IA ativo
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', justifyContent: 'flex-end', overflowX: 'auto', maxWidth: '100%' }}>
          {String(selected?.ticket_status || '') === 'resolved' ? (
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => updateTicket({ status: 'open' })} disabled={!selectedPhone || ticketUpdating} type="button">
              Reabrir
            </button>
          ) : (
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => updateTicket({ status: 'resolved' })} disabled={!selectedPhone || ticketUpdating} type="button">
              Resolver
            </button>
          )}
          {!selected?.need_human ? (
            <button className="btn btn-primary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => setHandoffActive(true)} disabled={!selectedPhone} type="button" title="Pausa o agente por 2 horas">
              Assumir
            </button>
          ) : (
            <button className="btn btn-primary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => setHandoffActive(false)} disabled={!selectedPhone} type="button" title="Reativa o agente agora">
              Devolver
            </button>
          )}
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34 }}
            onClick={() => {
              if (isMobile || isNarrowDesktop) setDetailsOpen(true);
              else setContextOpen((v) => !v);
            }}
            disabled={!selectedPhone}
            type="button"
          >
            Painel
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34, fontWeight: 900 }}
            onClick={(e) => openMenu('thread', e.currentTarget, { phone: String(selectedPhone || '').trim() })}
            disabled={!selectedPhone}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'thread'}
          >
            ⋯
          </button>
        </div>
      </div>

      {promptModal && (
        <div style={{ position: 'fixed', zIndex: 50, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 'min(960px, 92vw)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 800 }}>Configurar Prompt da IA</div>
              <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setPromptModal(false)} type="button">
                Fechar
              </button>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 12 }}>
              {loadingPrompt && <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Carregando…</div>}
              <div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Introdução</div>
                <textarea className="input" value={promptIntro} onChange={(e) => setPromptIntro(e.target.value)} rows={5} placeholder="Texto de introdução" disabled={loadingPrompt} />
              </div>
              <div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Corpo</div>
                <textarea className="input" value={promptBody} onChange={(e) => setPromptBody(e.target.value)} rows={10} placeholder="Regras, horários, preços, etc." disabled={loadingPrompt} />
              </div>
              <div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Complemento</div>
                <textarea className="input" value={promptSuffix} onChange={(e) => setPromptSuffix(e.target.value)} rows={5} placeholder="Instruções adicionais" disabled={loadingPrompt} />
              </div>
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={() => {
                  setPromptIntro(ANA_PROMPT_INTRO);
                  setPromptBody(ANA_PROMPT_BODY);
                  setPromptSuffix('');
                }}
                type="button"
                disabled={savingPrompt || loadingPrompt}
              >
                Aplicar prompt Ana
              </button>
              <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setPromptModal(false)} type="button" disabled={savingPrompt}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={savePromptSettings} disabled={savingPrompt || loadingPrompt}>
                {savingPrompt ? 'Salvando…' : loadingPrompt ? 'Carregando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferModalOpen && (
        <div style={{ position: 'fixed', zIndex: 50, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 'min(560px, 92vw)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 800 }}>Transferir conversa</div>
              <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setTransferModalOpen(false)} type="button">
                Fechar
              </button>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
                Use para marcar para qual área essa conversa foi transferida (ex.: Financeiro, Secretaria, Comercial).
              </div>
              <div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Destino (opcional)</div>
                <input className="input" value={transferToDraft} onChange={(e) => setTransferToDraft(e.target.value)} placeholder="Ex.: Financeiro" />
              </div>
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setTransferModalOpen(false)} type="button" disabled={ticketUpdating}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 10px' }}
                onClick={async () => {
                  const ok = await updateTicket({ status: 'transferred', transferTo: transferToDraft });
                  if (ok) setTransferModalOpen(false);
                }}
                disabled={ticketUpdating}
                type="button"
              >
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div
          ref={threadScrollRef}
          onScroll={onThreadScroll}
          style={{ padding: 14, maxHeight: isMobile ? '58vh' : '58vh', overflow: 'auto', background: 'rgba(0,0,0,0.02)' }}
        >
          {threadHasMore && !threadLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <button
                className="btn btn-outline"
                style={{ padding: '6px 10px', minHeight: 34 }}
                onClick={() => loadThread(selectedPhoneRef.current, { silent: true, cursor: String(threadCursor || ''), append: true })}
                disabled={threadPaging || !threadCursor}
                type="button"
              >
                {threadPaging ? 'Carregando…' : 'Carregar mensagens anteriores'}
              </button>
            </div>
          )}
          {threadLoading && <ThreadSkeleton />}
          {!threadLoading && (error || threadError) && (
            <ThreadState
              type="error"
              errorText={error || threadError}
              onRetry={() => loadThread(selectedPhone)}
            />
          )}
          {!threadLoading && !error && !threadError && (!selected?.messages || selected.messages.length === 0) && <ThreadState type="empty" />}

          {threadBlocks.map((b) => {
            if (b.type === 'day') {
              return (
                <div key={b.key} style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                  <span className="text-small" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 999, color: 'var(--text-secondary)' }}>
                    {b.label}
                  </span>
                </div>
              );
            }
            const g = b;
            return (
              <div key={g.id} style={{ display: 'flex', justifyContent: g.mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                <div
                  className={`inbox-bubble ${g.mine ? 'mine' : 'theirs'}`}
                  style={{
                    maxWidth: '72%',
                    width: 'fit-content',
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: g.mine ? 'var(--accent-light)' : 'var(--surface)',
                    border: `1px solid ${g.mine ? 'rgba(0, 188, 142, 0.25)' : 'var(--border)'}`,
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {g.items.map(({ key, m }, idx) => {
                    const contentRaw = String(m?.content || '');
                    const expanded = Boolean(expandedMsgs && typeof expandedMsgs === 'object' && expandedMsgs[key]);
                    const content = !expanded && contentRaw.length > 600 ? `${contentRaw.slice(0, 600)}…` : contentRaw;
                    const statusLower = String(m?.status || '').trim().toLowerCase();
                    const scheduledAt = typeof m?.send_at === 'string' ? String(m.send_at) : '';
                    const canceledAt = typeof m?.canceled_at === 'string' ? String(m.canceled_at) : '';
                    const isScheduled = statusLower === 'scheduled' && !!scheduledAt;
                    const isCanceled = statusLower === 'canceled';
                    const mine = m?.role === 'assistant';
                    const mid = String(m?.message_id || '').trim();
                    const canCancel = mine && (statusLower === 'scheduled' || statusLower === 'pending') && !!mid;
                    const isSelected = String(selectedMsgKey || '') === key;
                    const pinned = Boolean(selectedPhoneFlags?.pinned && selectedPhoneFlags.pinned[key]);
                    const important = Boolean(selectedPhoneFlags?.important && selectedPhoneFlags.important[key]);
                    const senderKind = senderKindFromMessage(m);
                    const senderLabel = senderKind === 'ai' ? 'Agente IA' : senderKind === 'human' ? 'Humano' : 'Cliente';
                    return (
                      <div
                        key={`${key}-${idx}`}
                        data-msgkey={key}
                        className={isSelected ? 'inbox-msg selected' : 'inbox-msg'}
                        style={{ position: 'relative', paddingTop: idx === 0 ? 0 : 10 }}
                        onClick={() => setSelectedMsgKey((v) => (String(v || '') === key ? '' : key))}
                      >
                        {idx === 0 && g.mine && (
                          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: senderKind === 'ai' ? 'var(--accent)' : 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                            {senderKind === 'ai' ? 'Agente IA' : 'Você'}
                          </div>
                        )}
                        <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', lineHeight: '22px', fontSize: 15, color: 'var(--text)' }}>
                          {content}
                        </div>
                        {!expanded && contentRaw.length > 600 && (
                          <button
                            className="btn btn-outline"
                            style={{ minHeight: 28, padding: '0 10px', marginTop: 8 }}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setExpandedMsgs((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [key]: true }));
                            }}
                          >
                            Ver mais
                          </button>
                        )}
                        <div className="inbox-msg-meta" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                            {formatTimeOnly(m?.timestamp) || formatWhen(m?.timestamp)}
                            {pinned ? ' • Fixada' : ''}
                            {important ? ' • Importante' : ''}
                          </span>
                          <div className="inbox-msg-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                              className="btn btn-outline inbox-mini-btn"
                              style={{ minHeight: 28, padding: '0 10px' }}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const base = contentRaw.replace(/\s+/g, ' ').trim();
                                const snippet = base.length > 120 ? `${base.slice(0, 120)}…` : base;
                                if (snippet) {
                                  setDraft((prev) => {
                                    const p = String(prev || '');
                                    const prefix = p.trim() ? `${p}\n\n` : '';
                                    return `${prefix}Respondendo: "${snippet}"\n\n`;
                                  });
                                  try {
                                    textareaRef.current && textareaRef.current.focus && textareaRef.current.focus();
                                  } catch {
                                    void 0;
                                  }
                                }
                              }}
                            >
                              Responder
                            </button>
                            <button
                              className="btn btn-outline inbox-mini-btn"
                              style={{ minHeight: 28, padding: '0 10px' }}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                copyToClipboard(contentRaw);
                              }}
                            >
                              Copiar
                            </button>
                            <button
                              className="btn btn-outline inbox-mini-btn"
                              style={{ minHeight: 28, padding: '0 10px', fontWeight: 900 }}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openMenu('message', e.currentTarget, { key, phone: String(selectedPhoneRef.current || '').trim(), m, canCancel });
                              }}
                              aria-haspopup="menu"
                              aria-expanded={menu?.kind === 'message' && menu?.payload?.key === key}
                            >
                              ⋯
                            </button>
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                              {senderLabel}
                            </span>
                            {!!String(statusLower || '').trim() && (
                              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                                Status: {statusLower}
                              </span>
                            )}
                            {isScheduled && (
                              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                                Agendada: {formatWhen(scheduledAt)}
                              </span>
                            )}
                            {isCanceled && (
                              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                                Cancelada: {canceledAt ? formatWhen(canceledAt) : '—'}
                              </span>
                            )}
                            {canCancel && (
                              <button
                                className="btn btn-outline"
                                style={{ minHeight: 28, padding: '0 10px' }}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  cancelScheduledMessage(mid);
                                }}
                                disabled={Boolean(cancelingMsgId) || cancelingMsgId === mid}
                              >
                                {cancelingMsgId === mid ? 'Cancelando…' : 'Cancelar agendamento'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!threadLoading && !error && !threadError && (selected?.messages || []).length === 0 && (
            <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, lineHeight: '28px', marginBottom: 6 }}>💬</div>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>Nenhuma mensagem carregada</div>
              <div className="text-small" style={{ marginTop: 4, maxWidth: 320, margin: '4px auto 0' }}>
                Se já há mensagens no WhatsApp, clique em <strong>Sincronizar</strong> para importar o histórico das últimas 24h.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', minHeight: 34 }}
                  type="button"
                  disabled={waSyncing}
                  onClick={reconcileLast24h}
                >
                  {waSyncing ? 'Sincronizando…' : '↻ Sincronizar com WhatsApp'}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', minHeight: 34 }}
                  type="button"
                  onClick={() => {
                    setDraft((prev) => String(prev || '').trim() ? prev : 'Olá! Como posso te ajudar hoje?');
                    try {
                      textareaRef.current && textareaRef.current.focus && textareaRef.current.focus();
                    } catch {
                      void 0;
                    }
                  }}
                >
                  Enviar primeira mensagem
                </button>
              </div>
            </div>
          )}
        </div>

        {!threadAtBottom && newMsgCount > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', minHeight: 34, pointerEvents: 'auto' }}
              type="button"
              onClick={() => scrollThreadToBottom({ clearNew: true })}
              title="Ir para o mais recente"
            >
              {newMsgCount} novas • Ir para o mais recente
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {selectedPhone && (
              <div style={{ position: 'relative' }}>
                <button
                  className={templatesOpen ? 'btn btn-secondary' : 'btn btn-outline'}
                  style={{ minHeight: 28, padding: '0 8px', fontSize: 14 }}
                  onClick={() => { setTemplatesOpen((v) => !v); setEmojiOpen(false); }}
                  type="button"
                  title="Mensagens prontas"
                >
                  ⚡
                </button>
                {templatesOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 36,
                      left: 0,
                      width: 280,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      boxShadow: 'var(--shadow)',
                      padding: 8,
                      zIndex: 50,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}
                  >
                    <div className="text-small" style={{ color: 'var(--text-secondary)', padding: '2px 6px 6px', fontWeight: 600 }}>Mensagens prontas</div>
                    {quickTemplates.map((tpl) => (
                      <button
                        key={tpl}
                        type="button"
                        className="btn btn-outline"
                        style={{ textAlign: 'left', padding: '6px 10px', minHeight: 32, whiteSpace: 'normal', lineHeight: '18px' }}
                        onClick={() => {
                          setDraft(tpl);
                          setTemplatesOpen(false);
                          try { textareaRef.current?.focus(); } catch { void 0; }
                        }}
                      >
                        {tpl.length > 60 ? `${tpl.slice(0, 60)}…` : tpl}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-outline"
                style={{ minHeight: 28, padding: '0 8px', fontSize: 16 }}
                onClick={() => { setEmojiOpen((v) => !v); setTemplatesOpen(false); }}
                type="button"
                aria-expanded={emojiOpen}
                title="Inserir emoji"
              >
                😊
              </button>
              {emojiOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 36,
                    left: 0,
                    width: 260,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow)',
                    padding: 10,
                    zIndex: 50
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                    {emojis.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          insertAtCursor(em);
                          setEmojiOpen(false);
                        }}
                        style={{
                          minHeight: 30,
                          padding: 0,
                          borderRadius: 10,
                          background: 'transparent',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <span style={{ fontSize: 18, lineHeight: '18px' }}>{em}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                const k = String(e.key || '').toLowerCase();
                if (k === 'b') {
                  e.preventDefault();
                  applyWrapToDraft('*');
                  return;
                }
                if (k === 'i') {
                  e.preventDefault();
                  applyWrapToDraft('_');
                  return;
                }
                if (k === 'enter') {
                  e.preventDefault();
                  sendManual();
                  return;
                }
              }
              if (e.key === 'Escape') setEmojiOpen(false);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendManual();
              }
            }}
            placeholder={selected?.need_human ? 'Responder manualmente…' : 'Agente IA ativo — responda para assumir o atendimento'}
            className="form-input"
            rows={3}
            style={{ flex: 1, resize: 'vertical', minHeight: 88 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className={scheduleOn ? 'btn btn-secondary' : 'btn btn-outline'}
                style={{ padding: '6px 10px' }}
                onClick={() => setScheduleOn((v) => !v)}
                disabled={sending || !selectedPhone}
                type="button"
              >
                Agendar
              </button>
              {scheduleOn && (
                <input
                  type="datetime-local"
                  className="form-input"
                  value={scheduleAtLocal}
                  onChange={(e) => setScheduleAtLocal(e.target.value)}
                  disabled={sending || !selectedPhone}
                  style={{ width: 210 }}
                />
              )}
            </div>
            {String(draft || '').length > 160 && (
              <div className="text-small" style={{ color: String(draft || '').length > 800 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {String(draft || '').length} chars
              </div>
            )}
            <button className="btn btn-primary" onClick={sendManual} disabled={sending || !draft.trim() || !selectedPhone} type="button">
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const scrollToMsgKey = (k) => {
    const key = String(k || '').trim();
    if (!key) return;
    const el = threadScrollRef.current;
    if (!el) return;
    try {
      const nodes = el.querySelectorAll('[data-msgkey]');
      for (const node of nodes) {
        const dk = node && node.dataset ? String(node.dataset.msgkey || '') : '';
        if (dk !== key) continue;
        node.scrollIntoView({ block: 'center' });
        break;
      }
    } catch {
      void 0;
    }
  };

  const contextPanelContent = (
    <div style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
        <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 800, marginBottom: 8 }}>
          Conversa
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
              Telefone
            </span>
            <span className="text-small" style={{ color: 'var(--text)', fontWeight: 700, textAlign: 'right', wordBreak: 'break-all' }}>
              {selectedPhone || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
              Status
            </span>
            {(() => {
              const chip = ticketChip(selected?.ticket_status, selected?.transfer_to);
              return (
                <span className="text-small" style={{ background: chip.bg, color: chip.fg, padding: '2px 8px', borderRadius: 999 }}>
                  {chip.label}
                </span>
              );
            })()}
          </div>
          {!!String(selected?.transfer_to || '').trim() && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                Transferido para
              </span>
              <span className="text-small" style={{ color: 'var(--text)', fontWeight: 700, textAlign: 'right' }}>
                {String(selected?.transfer_to || '').trim()}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34 }}
            type="button"
            onClick={() => {
              setTransferToDraft(String(selected?.transfer_to || '').trim());
              setTransferModalOpen(true);
            }}
            disabled={!selectedPhone || ticketUpdating}
          >
            Transferir
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34 }}
            type="button"
            onClick={() => updateTicket({ status: 'waiting_customer' })}
            disabled={!selectedPhone || ticketUpdating}
            title="Marca como aguardando resposta do cliente"
          >
            Aguardando cliente
          </button>
          <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => loadThread(selectedPhone)} disabled={!selectedPhone} type="button">
            Recarregar
          </button>
          <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={openPromptSettings} type="button">
            Configurar IA
          </button>
        </div>
      </div>

      {(() => {
        const phone = String(selectedPhone || '').trim();
        const leadId = String(selected?.lead_id || '').trim();
        const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
        if (!lead && !phone) return null;
        const name = String(lead?.name || '').trim() || String(selected?.lead_name || '').trim();
        const status = String(lead?.status || '').trim();
        const intention = String(lead?.intention || '').trim();
        const priority = String(lead?.priority || '').trim();
        const hotLead = Boolean(lead?.hotLead);
        return (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
            <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 800, marginBottom: 8 }}>
              Contato / Lead
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900, lineHeight: '20px' }}>{name || phone || '—'}</div>
              {!!phone && (
                <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
                  {phone}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {!!status && (
                  <span className="text-small" style={{ background: 'var(--border-light)', padding: '2px 8px', borderRadius: 999 }}>
                    {status}
                  </span>
                )}
                {!!intention && (
                  <span className="text-small" style={{ background: 'var(--border-light)', padding: '2px 8px', borderRadius: 999 }}>
                    {intention}
                  </span>
                )}
                {!!priority && (
                  <span className="text-small" style={{ background: 'var(--border-light)', padding: '2px 8px', borderRadius: 999 }}>
                    {priority}
                  </span>
                )}
                {hotLead && (
                  <span className="text-small" style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#b45309', padding: '2px 8px', borderRadius: 999 }}>
                    🔥 quente
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!selected?.lead_id && (
                  <>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel((v) => (v === 'convert' ? null : 'convert'))} disabled={!selectedPhone || linkingLead}>
                      Converter em lead
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel((v) => (v === 'associate' ? null : 'associate'))} disabled={!selectedPhone || linkingLead}>
                      Associar lead
                    </button>
                  </>
                )}
                {!!selected?.lead_id && (
                  <>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => (window.location.href = `/lead/${encodeURIComponent(String(selected.lead_id))}`)} type="button">
                      Ver lead
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => navigate('/pipeline')} type="button">
                      Kanban
                    </button>
                  </>
                )}
                {!!lead?.id && (
                  <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => (window.location.href = `/lead/${encodeURIComponent(String(lead.id))}`)} type="button">
                    Perfil completo
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {leadPanel === 'convert' && !selected?.lead_id && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 800, marginBottom: 8 }}>
            Converter em lead
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>
                Nome
              </div>
              <input className="input" value={leadNameDraft} onChange={(e) => setLeadNameDraft(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>
                Tipo
              </div>
              <select className="input" value={leadTypeDraft} onChange={(e) => setLeadTypeDraft(e.target.value)}>
                <option value="Adulto">Adulto</option>
                <option value="Criança">Criança</option>
                <option value="Juniores">Juniores</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel(null)} disabled={linkingLead}>
                Fechar
              </button>
              <button className="btn btn-primary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={convertToLead} disabled={linkingLead} type="button">
                {linkingLead ? 'Convertendo…' : 'Converter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {leadPanel === 'associate' && !selected?.lead_id && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 800, marginBottom: 8 }}>
            Associar lead
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <input className="input" value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="Buscar por nome ou telefone" style={{ flex: 1, minWidth: 220 }} />
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => fetchLeads()} disabled={leadsLoading || linkingLead} type="button">
              Atualizar
            </button>
          </div>
          {leadsLoading && <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Carregando leads…</div>}
          {!leadsLoading && leadCandidates.length === 0 && <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Nenhum lead encontrado.</div>}
          {!leadsLoading && leadCandidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leadCandidates.map((l) => (
                <button
                  key={l.id}
                  className="btn btn-outline"
                  style={{ justifyContent: 'space-between', display: 'flex', minHeight: 44 }}
                  onClick={() => linkLeadToConversation({ leadId: l.id })}
                  disabled={linkingLead}
                  type="button"
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span style={{ fontWeight: 800 }}>{l.name || 'Sem nome'}</span>
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>{l.phone || ''}</span>
                  </span>
                  <span className="text-small" style={{ color: 'var(--text-secondary)' }}>{l.pipelineStage || l.status || ''}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel(null)} disabled={linkingLead}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {selected?.summary?.text && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 800, marginBottom: 8 }}>
            Resumo
          </div>
          <div className="text-small" style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{selected.summary.text}</div>
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>
            Fixadas
          </div>
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            {pinnedMessages.length}
          </div>
        </div>
        {pinnedMessages.length === 0 ? (
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma mensagem fixada.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pinnedMessages.map((pm) => (
              <button
                key={pm.key}
                type="button"
                className="btn btn-outline"
                style={{ justifyContent: 'space-between', display: 'flex', minHeight: 40, textAlign: 'left' }}
                onClick={() => {
                  setSelectedMsgKey(pm.key);
                  scrollToMsgKey(pm.key);
                  if (isMobile) setDetailsOpen(false);
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pm.preview || '—'}</span>
                <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                  Ver
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            Importantes: {Object.keys(selectedPhoneFlags?.important || {}).length}
          </div>
        </div>
      </div>
    </div>
  );

  const contextPanel = (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Detalhes</div>
        {!isMobile && (
          <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setContextOpen(false)}>
            Ocultar painel
          </button>
        )}
      </div>
      <div style={{ maxHeight: '70vh', overflow: 'auto' }}>{contextPanelContent}</div>
    </div>
  );

  const contextPanelVisible = contextOpen && !isNarrowDesktop;
  const compactTabs = isMobile || isNarrowDesktop;
  const onTabChange = (nextTab) => {
    const tab = String(nextTab || '').trim();
    if (!tab) return;
    if (tab === 'agente') {
      openPromptSettings();
      return;
    }
    if (tab === 'dispositivo') {
      setInboxTab('dispositivo');
      setWaQrError(false);
      setWaQrTick((v) => v + 1);
      fetchWaInfo();
      return;
    }
    setInboxTab('conversas');
  };

  return (
    <div className="container" style={{ paddingTop: 18, paddingBottom: 30, maxWidth: '100%', width: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .inbox-msg { border-radius: 12px; padding: 8px; margin: -6px; transition: var(--transition); }
        .inbox-msg.selected { background: rgba(0, 188, 142, 0.10); outline: 2px solid rgba(0, 188, 142, 0.35); }
        .inbox-msg-actions { opacity: 0; pointer-events: none; transition: var(--transition); }
        .inbox-msg:hover .inbox-msg-actions, .inbox-msg.selected .inbox-msg-actions { opacity: 1; pointer-events: auto; }
        .inbox-menu-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.10); z-index: 80; }
        .inbox-menu-panel { position: fixed; width: 260px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-lg); overflow: hidden; z-index: 81; }
        .inbox-menu-item { width: 100%; text-align: left; padding: 10px 12px; background: transparent; border: none; color: var(--text); font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px; }
        .inbox-menu-item:hover { background: var(--surface-hover); }
        .inbox-menu-item.danger { color: var(--danger); }
        .inbox-menu-item.danger:hover { background: var(--danger-light); }
        .inbox-menu-item.muted { color: var(--text-secondary); font-weight: 600; }
        .inbox-conversation-item {
          transition: background .16s ease, border-color .16s ease;
          appearance: none;
          -webkit-appearance: none;
          border-radius: 0;
          font: inherit;
          line-height: 1.25;
        }
        .inbox-conversation-item:hover { background: rgba(15, 23, 42, 0.04) !important; }
        .inbox-conversation-item.active { box-shadow: inset 0 0 0 1px rgba(0, 188, 142, 0.25); }
        .inbox-group-title {
          position: sticky; top: 0; z-index: 3;
          background: var(--surface); border-bottom: 1px solid var(--border);
          padding: 6px 12px; font-size: 0.72rem; font-weight: 800; letter-spacing: .03em;
          color: var(--text-secondary); text-transform: uppercase;
        }
        .inbox-list-skeleton {
          height: 58px; border-radius: 10px; margin-bottom: 10px;
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.24) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: inboxSk 1.2s ease-in-out infinite;
        }
        .inbox-chat-skeleton {
          height: 34px; border-radius: 12px; margin-bottom: 10px; width: 52%;
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.24) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: inboxSk 1.2s ease-in-out infinite;
        }
        .inbox-chat-skeleton.right { margin-left: auto; width: 46%; }
        .inbox-chat-skeleton.left { margin-right: auto; }
        @keyframes inboxSk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      ` }} />

      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Atendimento</h2>
          <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            {loading ? 'Carregando…' : `${items.length} conversas${lastUpdatedAt ? ` • atualizado ${formatWhen(lastUpdatedAt)}` : ''}`}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Number(stats?.unreadBacklog || 0) > 0 && (
              <span className="text-small" style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 999 }} title="Backlog de conversas com mensagens não lidas">
                Não lidas: {Number(stats.unreadBacklog)}
              </span>
            )}
            {Number(stats?.resolvedCount || 0) > 0 && (
              <span className="text-small" style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '2px 8px', borderRadius: 999 }} title="Conversas em status resolvido">
                Resolvidas: {Number(stats.resolvedCount)}
              </span>
            )}
            {Number(stats?.transferredCount || 0) > 0 && (
              <span className="text-small" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8', padding: '2px 8px', borderRadius: 999 }} title="Conversas transferidas">
                Transferidas: {Number(stats.transferredCount)}
              </span>
            )}
            {(() => {
              const samples = Array.isArray(stats?.firstResponseMs) ? stats.firstResponseMs : [];
              if (!samples.length) return null;
              const avg = samples.reduce((acc, cur) => acc + Number(cur || 0), 0) / samples.length;
              const mins = Math.round(avg / 60000);
              return (
                <span className="text-small" style={{ background: 'var(--warning-light)', color: '#b45309', padding: '2px 8px', borderRadius: 999 }} title="Tempo médio da primeira resposta (sessão atual)">
                  TTFR: {mins} min
                </span>
              );
            })()}
          </div>
        </div>
        {inboxTab === 'conversas' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por telefone ou nome…"
              className="form-input"
              style={{ flex: '1 1 320px', minWidth: 260, maxWidth: 520 }}
            />
            <button className="btn btn-secondary" onClick={() => loadList({ reset: true })} disabled={loading}>
              Atualizar
            </button>
            <button
              className={autoRefresh ? 'btn btn-secondary' : 'btn btn-outline'}
              onClick={() => setAutoRefresh((v) => !v)}
              title={autoRefresh ? 'Atualização automática ativa (a cada 10s) — clique para pausar' : 'Ativar atualização automática a cada 10s'}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <span style={{ fontSize: 14 }}>↻</span>
              {autoRefresh ? 'Ao vivo' : 'Pausado'}
            </button>
          </div>
        ) : (
          <div />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {compactTabs ? (
          <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="form-input"
              value={inboxTab === 'agente' ? 'agente' : inboxTab}
              onChange={(e) => onTabChange(e.target.value)}
              style={{ minWidth: 220, maxWidth: 360, padding: '10px 12px' }}
              aria-label="Selecionar aba"
            >
              <option value="conversas">Conversas</option>
              <option value="dispositivo">Dispositivo</option>
              <option value="agente">Agente IA</option>
            </select>
            <button className="btn btn-outline" type="button" onClick={() => onTabChange('agente')} style={{ minHeight: 40, padding: '0 12px' }}>
              IA
            </button>
          </div>
        ) : (
          <>
            <button
              className={inboxTab === 'conversas' ? 'btn btn-primary' : 'btn btn-outline'}
              type="button"
              onClick={() => onTabChange('conversas')}
            >
              Conversas
            </button>
            <button
              className={inboxTab === 'dispositivo' ? 'btn btn-primary' : 'btn btn-outline'}
              type="button"
              onClick={() => onTabChange('dispositivo')}
            >
              Dispositivo
            </button>
            <button
              className={inboxTab === 'agente' ? 'btn btn-primary' : 'btn btn-outline'}
              type="button"
              onClick={() => onTabChange('agente')}
            >
              Agente IA
            </button>
          </>
        )}
      </div>

      {menu && (
        <div className="inbox-menu-overlay" onClick={closeMenu} role="presentation">
          <div
            className="inbox-menu-panel"
            style={{ left: Number(menu.x || 0), top: Number(menu.y || 0) }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {menu.kind === 'message' && (() => {
              const payload = menu.payload && typeof menu.payload === 'object' ? menu.payload : {};
              const key = String(payload.key || '').trim();
              const phone = String(payload.phone || '').trim();
              const m = payload.m && typeof payload.m === 'object' ? payload.m : {};
              const canCancel = Boolean(payload.canCancel);
              const contentRaw = String(m?.content || '');
              const mid = String(m?.message_id || '').trim();
              return (
                <>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      const base = contentRaw.replace(/\s+/g, ' ').trim();
                      const snippet = base.length > 120 ? `${base.slice(0, 120)}…` : base;
                      if (snippet) {
                        setDraft((prev) => {
                          const p = String(prev || '');
                          const prefix = p.trim() ? `${p}\n\n` : '';
                          return `${prefix}Respondendo: "${snippet}"\n\n`;
                        });
                      }
                      closeMenu();
                      try {
                        textareaRef.current && textareaRef.current.focus && textareaRef.current.focus();
                      } catch {
                        void 0;
                      }
                    }}
                  >
                    Responder
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Enter
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      copyToClipboard(contentRaw);
                      closeMenu();
                    }}
                  >
                    Copiar
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Ctrl+C
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      copyToClipboard(contentRaw);
                      addToast({ type: 'info', message: 'Copiado para encaminhar' });
                      closeMenu();
                    }}
                  >
                    Encaminhar
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Copia texto
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      toggleMsgFlag(phone, key, 'pinned');
                      closeMenu();
                    }}
                  >
                    Fixar
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      {selectedPhoneFlags?.pinned && selectedPhoneFlags.pinned[key] ? 'On' : 'Off'}
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      toggleMsgFlag(phone, key, 'important');
                      closeMenu();
                    }}
                  >
                    Importante
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      {selectedPhoneFlags?.important && selectedPhoneFlags.important[key] ? 'On' : 'Off'}
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item muted"
                    type="button"
                    onClick={() => {
                      setSelectedMsgKey(key);
                      scrollToMsgKey(key);
                      closeMenu();
                    }}
                  >
                    Ver detalhes
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Seleciona
                    </span>
                  </button>
                  <button
                    className={`inbox-menu-item ${canCancel ? 'danger' : 'muted'}`}
                    type="button"
                    disabled={!canCancel || !mid}
                    onClick={() => {
                      if (canCancel && mid) cancelScheduledMessage(mid);
                      closeMenu();
                    }}
                  >
                    Excluir
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      {canCancel ? 'Cancela agendamento' : '—'}
                    </span>
                  </button>
                </>
              );
            })()}

            {menu.kind === 'thread' && (() => {
              const payload = menu.payload && typeof menu.payload === 'object' ? menu.payload : {};
              const phone = String(payload.phone || '').trim();
              const hasLead = Boolean(String(selected?.lead_id || '').trim());
              return (
                <>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                      else setContextOpen((v) => !v);
                      closeMenu();
                    }}
                  >
                    {isMobile || isNarrowDesktop ? 'Abrir detalhes' : contextPanelVisible ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Painel
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      updateTicket({ status: 'waiting_customer' });
                      closeMenu();
                    }}
                    disabled={!phone || ticketUpdating}
                  >
                    Aguardando cliente
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Ticket
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      setTransferToDraft(String(selected?.transfer_to || '').trim());
                      setTransferModalOpen(true);
                      closeMenu();
                    }}
                    disabled={!phone || ticketUpdating}
                  >
                    Transferir
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Ticket
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      loadThread(phone);
                      closeMenu();
                    }}
                    disabled={!phone}
                  >
                    Recarregar conversa
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Atualiza
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      openPromptSettings();
                      closeMenu();
                    }}
                  >
                    Configurar IA
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Prompt
                    </span>
                  </button>
                  {!hasLead && (
                    <>
                      <button
                        className="inbox-menu-item"
                        type="button"
                        onClick={() => {
                          setLeadPanel('convert');
                          if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                          else setContextOpen(true);
                          closeMenu();
                        }}
                        disabled={!phone || linkingLead}
                      >
                        Converter em lead
                        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                          CRM
                        </span>
                      </button>
                      <button
                        className="inbox-menu-item"
                        type="button"
                        onClick={() => {
                          setLeadPanel('associate');
                          if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                          else setContextOpen(true);
                          closeMenu();
                        }}
                        disabled={!phone || linkingLead}
                      >
                        Associar lead
                        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                          CRM
                        </span>
                      </button>
                    </>
                  )}
                  {hasLead && (
                    <>
                      <button
                        className="inbox-menu-item"
                        type="button"
                        onClick={() => {
                          window.location.href = `/lead/${encodeURIComponent(String(selected.lead_id))}`;
                          closeMenu();
                        }}
                      >
                        Ver lead
                        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                          Perfil
                        </span>
                      </button>
                      <button
                        className="inbox-menu-item"
                        type="button"
                        onClick={() => {
                          navigate('/pipeline');
                          closeMenu();
                        }}
                      >
                        Kanban
                        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                          Funil
                        </span>
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {isMobile && detailsOpen && selectedPhone && (
        <div
          style={{ position: 'fixed', zIndex: 70, inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          onClick={() => setDetailsOpen(false)}
          role="presentation"
        >
          <div
            style={{ width: 'min(560px, 96vw)', maxHeight: '92vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Detalhes</div>
              <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setDetailsOpen(false)}>
                Fechar
              </button>
            </div>
            <div style={{ maxHeight: 'calc(92vh - 56px)', overflow: 'auto' }}>{contextPanelContent}</div>
          </div>
        </div>
      )}

      {inboxTab === 'dispositivo' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
            <div
              style={{
                padding: 10,
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Dispositivo WhatsApp</div>
                <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                  {waInfo?.status === 'connected' ? 'Conectado' : waInfo?.status || '—'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" style={{ padding: '6px 10px' }} onClick={() => fetchWaInfo()} disabled={waLoading} type="button">
                  Verificar status
                </button>
                <button
                  className="btn btn-outline"
                  style={{ padding: '6px 10px' }}
                  onClick={reconcileLast24h}
                  disabled={waLoading || waSyncing || waTokenMissing}
                  type="button"
                  title="Sincroniza mensagens das últimas 24 horas"
                >
                  {waSyncing ? 'Atualizando…' : 'Atualizar'}
                </button>
                {!waInfo?.instance_id && (
                  <button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={createWaInstance} disabled={waLoading || waTokenMissing} type="button">
                    Conectar dispositivo
                  </button>
                )}
                {!!waInfo?.instance_id && (
                  <button className="btn btn-outline" style={{ padding: '6px 10px' }} onClick={disconnectWaInstance} disabled={waLoading || waTokenMissing} type="button">
                    Desconectar
                  </button>
                )}
                {!!waInfo?.instance_id && waInfo?.status === 'offline' && (
                  <button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={powerOnInstance} disabled={waLoading || waTokenMissing} type="button" title="Liga a instância se estiver offline">
                    Ligar instância
                  </button>
                )}
                {!!waInfo?.instance_id && (
                  <button
                    className="btn btn-outline"
                    style={{ padding: '6px 10px' }}
                    onClick={powerOffInstance}
                    disabled={waLoading || waTokenMissing}
                    type="button"
                    title="Desliga a instância (mantém sessão quando possível)"
                  >
                    Desligar instância
                  </button>
                )}
                {!!waInfo?.instance_id && (
                  <button
                    className="btn btn-outline"
                    style={{ padding: '6px 10px' }}
                    onClick={restartInstance}
                    disabled={waLoading || waTokenMissing}
                    type="button"
                    title="Reinicia a instância (pode ficar offline por até 1 minuto)"
                  >
                    Reiniciar
                  </button>
                )}
              </div>
            </div>
            {waTokenMissing && (
              <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'var(--danger-light)', color: 'var(--danger)' }}>
                Backend não configurado: defina a variável de ambiente ZAPSTER_API_TOKEN no servidor.
              </div>
            )}
            <div style={{ padding: 12, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {!waInfo?.instance_id && <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Nenhuma instância criada.</div>}
              {!!waInfo?.instance_id && (
                <>
                  <div style={{ minWidth: 260 }}>
                    <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Instância</div>
                    <div className="text-small" style={{ wordBreak: 'break-all' }}>{waInfo.instance_id}</div>
                  </div>
                  <div style={{ minWidth: 260 }}>
                    <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>QR Code</div>
                    {waInfo?.status !== 'connected' && !!waInfo?.instance_id && !waTokenMissing && !waQrError && (
                      <img
                        src={`/api/zapster/instances?action=qrcode&id=${encodeURIComponent(String(waInfo.instance_id))}&ts=${waQrTick}`}
                        alt="QR"
                        onError={() => setWaQrError(true)}
                        style={{ width: 240, height: 240, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8 }}
                      />
                    )}
                    {(waTokenMissing || waQrError || waInfo?.status === 'connected' || !waInfo?.instance_id) && (
                      <div className="text-small" style={{ color: 'var(--text-secondary)', maxWidth: 480 }}>
                        {waTokenMissing
                          ? 'Backend não configurado para QR.'
                          : waInfo?.status === 'connected'
                          ? 'Dispositivo conectado'
                          : waQrError
                          ? 'QR Code indisponível no momento (instância pode estar conectada).'
                          : 'Aguardando QR… toque em Verificar status'}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {inboxTab === 'agente' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontWeight: 800 }}>Configurar Agente IA</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" style={{ padding: '6px 10px' }} onClick={openPromptSettings} type="button" disabled={loadingPrompt || savingPrompt}>
                  Recarregar
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px' }}
                  onClick={() => {
                    setPromptIntro(ANA_PROMPT_INTRO);
                    setPromptBody(ANA_PROMPT_BODY);
                    setPromptSuffix('');
                  }}
                  type="button"
                  disabled={savingPrompt || loadingPrompt}
                >
                  Aplicar prompt Ana
                </button>
                <button className="btn btn-primary" style={{ padding: '6px 10px' }} onClick={savePromptSettings} disabled={savingPrompt || loadingPrompt} type="button">
                  {savingPrompt ? 'Salvando…' : loadingPrompt ? 'Carregando…' : 'Salvar'}
                </button>
              </div>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 12 }}>
              {loadingPrompt && <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Carregando…</div>}
              <div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Introdução</div>
                <textarea className="input" value={promptIntro} onChange={(e) => setPromptIntro(e.target.value)} rows={5} placeholder="Texto de introdução" disabled={loadingPrompt} />
              </div>
              <div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Corpo</div>
                <textarea className="input" value={promptBody} onChange={(e) => setPromptBody(e.target.value)} rows={10} placeholder="Regras, horários, preços, etc." disabled={loadingPrompt} />
              </div>
              <div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Complemento</div>
                <textarea className="input" value={promptSuffix} onChange={(e) => setPromptSuffix(e.target.value)} rows={5} placeholder="Instruções adicionais" disabled={loadingPrompt} />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: 10, borderRadius: 10, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {inboxTab === 'conversas' &&
        (isMobile ? (
          <div>{selectedPhone ? threadPanel : listPanel}</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: contextPanelVisible ? `${listWidth}px 10px minmax(0, 1.3fr) minmax(280px, 320px)` : `${listWidth}px 10px minmax(0, 1fr)`,
              gap: 0,
              alignItems: 'stretch'
            }}
          >
            <div style={{ paddingRight: 10 }}>{listPanel}</div>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResize}
              onDoubleClick={() => setListWidth(420)}
              style={{
                cursor: 'col-resize',
                width: 10,
                borderRadius: 999,
                background: 'transparent',
                display: 'flex',
                justifyContent: 'center'
              }}
              title="Arraste para ajustar a largura"
            >
              <div style={{ width: 2, background: 'var(--border)', borderRadius: 999, height: '100%' }} />
            </div>
            <div style={{ paddingLeft: 10, paddingRight: contextPanelVisible ? 10 : 0 }}>{threadPanel}</div>
            {contextPanelVisible && <div style={{ paddingLeft: 10 }}>{contextPanel}</div>}
          </div>
        ))}
    </div>
  );
}
