import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { account, realtime, CONVERSATIONS_COL, DB_ID } from '../lib/appwrite';
import { useUiStore } from '../store/useUiStore';
import { LEAD_STATUS, useLeadStore } from '../store/useLeadStore';

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
  const addToast = useUiStore((s) => s.addToast);
  const addLead = useLeadStore((s) => s.addLead);
  const fetchLeads = useLeadStore((s) => s.fetchLeads);
  const leads = useLeadStore((s) => s.leads);
  const leadsLoading = useLeadStore((s) => s.loading);
  const academyId = useLeadStore((s) => s.academyId);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [sending, setSending] = useState(false);
  const [cancelingMsgId, setCancelingMsgId] = useState('');
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [listFilter, setListFilter] = useState('all');
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window === 'undefined') return 420;
    const raw = window.localStorage.getItem('inbox_list_width');
    const n = Number.parseInt(String(raw || ''), 10);
    if (!Number.isFinite(n)) return 420;
    return Math.max(320, Math.min(560, n));
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
  const [inboxTab, setInboxTab] = useState('conversas');
  const [waLoading, setWaLoading] = useState(false);
  const [waInfo, setWaInfo] = useState({ instance_id: null, status: 'disconnected', qrcode: null });
  const [waTokenMissing, setWaTokenMissing] = useState(false);
  const [waQrError, setWaQrError] = useState(false);
  const [waQrTick, setWaQrTick] = useState(0);
  const [waSyncing, setWaSyncing] = useState(false);
  const waOpen = inboxTab === 'dispositivo';

  const draftRef = useRef('');
  const selectedPhoneRef = useRef('');
  const textareaRef = useRef(null);
  const threadScrollRef = useRef(null);
  const lastAutoScrollPhoneRef = useRef('');
  const listMetaRef = useRef(new Map());
  const notifiedOnceRef = useRef(false);
  const loadListRef = useRef(null);
  const loadThreadRef = useRef(null);
  const realtimeTimersRef = useRef({ list: null, thread: null });
  const academyIdRef = useRef('');

  const normalizedSearch = useMemo(() => normalizePhone(search), [search]);

  useEffect(() => {
    draftRef.current = String(draft || '');
  }, [draft]);

  useEffect(() => {
    selectedPhoneRef.current = String(selectedPhone || '');
  }, [selectedPhone]);

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

  function safeParseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
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
      const resp = await fetch('/api/whatsapp/reconcile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao atualizar'));
      const data = safeParseJson(raw) || {};
      const updated = Number.isFinite(Number(data?.conversations_updated)) ? Number(data.conversations_updated) : 0;
      const created = Number.isFinite(Number(data?.conversations_created)) ? Number(data.conversations_created) : 0;
      const merged = Number.isFinite(Number(data?.messages_merged)) ? Number(data.messages_merged) : 0;
      addToast({
        type: 'success',
        message: `Atualizado • ${updated} conversas${created ? ` (+${created})` : ''}${merged ? ` • ${merged} msgs` : ''}`
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
        method: 'PATCH',
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
      if (normalizedSearch) qs.set('search', normalizedSearch);
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
      setHasMore(Boolean(nextCur) && next.length > 0 && !normalizedSearch);
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

  async function loadThread(phone, { silent = false } = {}) {
    const p = String(phone || '').trim();
    if (!p) return;
    if (!silent) setError('');
    try {
      setThreadLoading(true);
      const jwt = await getJwt();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(p)}`, {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao carregar conversa'));
      const data = safeParseJson(raw) || {};
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const summary = data?.summary && typeof data.summary === 'object' ? data.summary : null;
      const handoffUntil = typeof data?.human_handoff_until === 'string' ? data.human_handoff_until : '';
      setSelected({
        phone: p,
        messages,
        summary,
        lead_id: typeof data?.lead_id === 'string' ? data.lead_id : null,
        lead_name: typeof data?.lead_name === 'string' ? data.lead_name : '',
        need_human: Boolean(data?.need_human),
        human_handoff_until: handoffUntil || null
      });
      try {
        const last = messages.length > 0 ? messages[messages.length - 1] : null;
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
        setTimeout(() => {
          const el = threadScrollRef.current;
          if (!el) return;
          el.scrollTop = el.scrollHeight;
          lastAutoScrollPhoneRef.current = p;
        }, 0);
      } catch {
        void 0;
      }
    } catch (e) {
      if (!silent) setError(e?.message || 'Erro');
    } finally {
      setThreadLoading(false);
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
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'handoff', ativo: Boolean(ativo) })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao atualizar handoff'));
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
      const resp = await fetch('/api/whatsapp/send', {
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
      const resp = await fetch('/api/whatsapp/cancel', {
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
    const name = String(leadNameDraft || '').trim();
    if (!phone || !name) return;
    setLinkingLead(true);
    setError('');
    try {
      const created = await addLead({
        name,
        phone,
        type: leadTypeDraft || 'Adulto',
        origin: 'WhatsApp',
        status: LEAD_STATUS.NEW,
        pipelineStage: 'Novo',
        isFirstExperience: 'Sim',
        notes: []
      });
      const leadId = String(created?.id || '').trim();
      if (!leadId) throw new Error('Erro ao criar lead');
      await linkLeadToConversation({ leadId });
      addToast({ type: 'success', message: 'Lead criado' });
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
  }, [normalizedSearch]);

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
      const name = String(lead?.name || '').trim() || String(it?.lead_name || '').trim();
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
        _isHighlighted: Boolean(highlighted && typeof highlighted === 'object' && highlighted[phone] && Number(highlighted[phone]) > Date.now())
      };
    });
  }, [items, leadById, leadByPhone, highlighted]);

  const filteredItems = useMemo(() => {
    const arr = Array.isArray(enrichedItems) ? enrichedItems : [];
    const f = String(listFilter || 'all');
    if (f === 'unread') return arr.filter((it) => Number(it?._unreadCount || 0) > 0);
    if (f === 'hot') return arr.filter((it) => Boolean(it?._hotLead));
    if (f === 'need_human') return arr.filter((it) => Boolean(it?._handoffActive));
    return arr;
  }, [enrichedItems, listFilter]);

  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    if (!selectedPhone) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 220) {
      try {
        el.scrollTop = el.scrollHeight;
        lastAutoScrollPhoneRef.current = selectedPhone;
      } catch {
        void 0;
      }
    }
  }, [selectedPhone, selected?.messages?.length]);

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
      const next = Math.max(320, Math.min(560, startW + dx));
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
  }, [autoRefresh, normalizedSearch, realtimeOn]);

  const listPanel = (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>Conversas</div>
        {!normalizedSearch && (
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
      </div>
      <div
        style={{ maxHeight: isMobile ? '72vh' : '70vh', overflow: 'auto' }}
        onScroll={(e) => {
          if (normalizedSearch) return;
          const el = e.currentTarget;
          const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (remaining < 240) loadList({ reset: false, silent: true });
        }}
      >
        {filteredItems.map((it) => {
          const phone = String(it?._phone || it?.phone_number || '');
          const active = phone === selectedPhone;
          const hotLead = Boolean(it?._hotLead);
          const handoffActive = Boolean(it?._handoffActive);
          const aiSuggestHuman = Boolean(it?._aiSuggestHuman);
          const unreadCount = Number(it?._unreadCount || 0);
          const lastRole = String(it?._lastRole || '').trim();
          const lastSender = String(it?._lastSender || '').trim();
          const lastAssistantDot =
            lastRole === 'assistant'
              ? lastSender === 'human'
                ? { bg: '#f59e0b', label: 'Humano' }
                : { bg: '#22c55e', label: 'Agente IA' }
              : null;
          const isHighlighted = Boolean(it?._isHighlighted);
          const rawPrev = String(it?.last_preview || '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
          const preview = rawPrev.length > 40 ? `${rawPrev.slice(0, 40)}…` : rawPrev;
          return (
            <button
              key={String(it?.id || phone)}
              onClick={() => setSelectedPhone(phone)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 14,
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: active ? 'var(--accent-light)' : isHighlighted ? 'rgba(34, 197, 94, 0.10)' : 'transparent',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, flex: 1 }}>
                  {lastAssistantDot && (
                    <span
                      title={lastAssistantDot.label}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: lastAssistantDot.bg,
                        flex: '0 0 auto'
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span>{String(it?._displayTitle || '-')}</span>
                        {hotLead && <span title="Lead quente">🔥</span>}
                        {handoffActive && <span title="Atendimento assumido (agente pausado)">⏸️</span>}
                        {!handoffActive && aiSuggestHuman && <span title="IA sugere intervenção humana">⚠️</span>}
                      </span>
                    </div>
                    {!!String(it?._displaySubtitle || '').trim() && (
                      <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                        {String(it?._displaySubtitle || '—')}
                      </div>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <span
                      className="text-small"
                      style={{
                        background: 'var(--danger)',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontWeight: 800
                      }}
                      title="Mensagens não lidas"
                    >
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {formatWhen(it?.updated_at)}
                </div>
              </div>
              <div
                className="text-small"
                style={{
                  color: 'var(--text-secondary)',
                  marginTop: 8,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {preview || '—'}
              </div>
              {it?.lead_id && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      window.location.href = `/lead/${encodeURIComponent(String(it.lead_id))}`;
                    }}
                  >
                    Abrir lead
                  </button>
                </div>
              )}
            </button>
          );
        })}
        {items.length === 0 && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Nenhuma conversa.</div>}
        {loadingMore && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Carregando mais…</div>}
      </div>
    </div>
  );

  const threadPanel = (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isMobile && (
            <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setSelectedPhone('')}>
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
            {(() => {
              const phone = String(selectedPhone || '').trim();
              const leadId = String(selected?.lead_id || '').trim();
              const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
              const name = String(lead?.name || '').trim() || String(selected?.lead_name || '').trim();
              return Boolean(name);
            })() && (
              <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
                {selectedPhone || '—'}
              </div>
            )}
          </div>
          {(() => {
            const phone = String(selectedPhone || '').trim();
            const leadId = String(selected?.lead_id || '').trim();
            const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
            const aiSuggestHuman = Boolean(lead?.needHuman);
            const until = String(selected?.human_handoff_until || '').trim();
            const untilLabel = until ? formatTimeOnly(until) || formatWhen(until) : '';
            if (selected?.need_human) {
              return (
                <span
                  className="text-small"
                  style={{
                    background: 'var(--danger-light)',
                    color: 'var(--danger)',
                    padding: '2px 8px',
                    borderRadius: 999
                  }}
                  title={untilLabel ? `Atendimento humano até ${untilLabel}` : 'Atendimento humano ativo'}
                >
                  {untilLabel ? `Humano até ${untilLabel}` : 'Atendimento humano'}
                </span>
              );
            }
            if (aiSuggestHuman) {
              return (
                <span
                  className="text-small"
                  style={{
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#b45309',
                    padding: '2px 8px',
                    borderRadius: 999
                  }}
                  title="IA sugere intervenção humana (agente ainda está ativo)"
                >
                  IA sugere humano
                </span>
              );
            }
            return (
              <span
                className="text-small"
                style={{
                  background: 'rgba(34, 197, 94, 0.10)',
                  color: '#16a34a',
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: 12
                }}
              >
                Agente IA ativo
              </span>
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '6px 10px' }}
            onClick={() => setHandoffActive(true)}
            disabled={!selectedPhone || Boolean(selected?.need_human)}
            type="button"
            title="Pausa o agente por 2 horas"
          >
            Assumir atendimento
          </button>
          <button
            className="btn"
            style={{ padding: '6px 10px', background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
            onClick={() => setHandoffActive(false)}
            disabled={!selectedPhone || !selected?.need_human}
            type="button"
            title="Reativa o agente agora"
          >
            Devolver ao agente
          </button>
          {!selected?.lead_id && (
            <>
              <button
                className="btn btn-outline"
                style={{ padding: '6px 10px' }}
                onClick={() => setLeadPanel((v) => (v === 'convert' ? null : 'convert'))}
                disabled={!selectedPhone || linkingLead}
                type="button"
              >
                Converter em lead
              </button>
            </>
          )}
          {!!selected?.lead_id && (
            <button
              className="btn btn-outline"
              style={{ padding: '6px 10px' }}
              onClick={() => {
                window.location.href = `/lead/${encodeURIComponent(String(selected.lead_id))}`;
              }}
              type="button"
            >
              Ver perfil completo
            </button>
          )}
          <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={openPromptSettings} type="button">
            Agente IA
          </button>
          {!selected?.lead_id && (
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px' }}
              onClick={() => setLeadPanel((v) => (v === 'associate' ? null : 'associate'))}
              disabled={!selectedPhone || linkingLead}
              type="button"
            >
              Associar lead
            </button>
          )}
          {!!selected?.lead_id && (
            <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => navigate('/pipeline')} type="button">
              Kanban
            </button>
          )}
          <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => loadThread(selectedPhone)} disabled={!selectedPhone}>
            Recarregar
          </button>
        </div>
      </div>

      {(() => {
        const phone = String(selectedPhone || '').trim();
        const leadId = String(selected?.lead_id || '').trim();
        const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
        if (!lead) return null;
        const name = String(lead?.name || '').trim();
        const status = String(lead?.status || '').trim();
        const intention = String(lead?.intention || '').trim();
        const priority = String(lead?.priority || '').trim();
        const hotLead = Boolean(lead?.hotLead);
        return (
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
                <div style={{ fontWeight: 800, lineHeight: '20px' }}>{name || 'Sem nome'}</div>
                <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
                  {lead?.phone || selectedPhone || ''}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!!status && (
                    <span className="text-small" style={{ background: 'var(--border)', padding: '2px 8px', borderRadius: 999 }}>
                      {status}
                    </span>
                  )}
                  {!!intention && (
                    <span className="text-small" style={{ background: 'var(--border)', padding: '2px 8px', borderRadius: 999 }}>
                      {intention}
                    </span>
                  )}
                  {!!priority && (
                    <span className="text-small" style={{ background: 'var(--border)', padding: '2px 8px', borderRadius: 999 }}>
                      {priority}
                    </span>
                  )}
                  {hotLead && (
                    <span className="text-small" style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#b45309', padding: '2px 8px', borderRadius: 999 }}>
                      🔥 quente
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {!!lead?.id && (
                  <button className="btn btn-outline" style={{ padding: '6px 10px' }} onClick={() => window.location.href = `/lead/${encodeURIComponent(String(lead.id))}`} type="button">
                    Ver perfil completo
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {leadPanel === 'convert' && !selected?.lead_id && (
        <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>
                Nome
              </div>
              <input className="input" value={leadNameDraft} onChange={(e) => setLeadNameDraft(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div style={{ minWidth: 180 }}>
              <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>
                Tipo
              </div>
              <select className="input" value={leadTypeDraft} onChange={(e) => setLeadTypeDraft(e.target.value)}>
                <option value="Adulto">Adulto</option>
                <option value="Criança">Criança</option>
                <option value="Juniores">Juniores</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={convertToLead} disabled={linkingLead || !String(leadNameDraft || '').trim()} type="button">
              Criar e enviar ao Kanban
            </button>
          </div>
        </div>
      )}

      {leadPanel === 'associate' && !selected?.lead_id && (
        <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <input
              className="input"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              style={{ flex: 1, minWidth: 220 }}
            />
            <button className="btn btn-secondary" onClick={() => fetchLeads()} disabled={leadsLoading || linkingLead} type="button">
              Atualizar
            </button>
          </div>
          {leadsLoading && <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Carregando leads…</div>}
          {!leadsLoading && leadCandidates.length === 0 && (
            <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Nenhum lead encontrado.</div>
          )}
          {!leadsLoading && leadCandidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leadCandidates.map((l) => (
                <button
                  key={l.id}
                  className="btn btn-outline"
                  style={{ justifyContent: 'space-between', display: 'flex' }}
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
        </div>
      )}

      {selected?.summary?.text && (
        <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>
            Resumo
          </div>
          <div className="text-small" style={{ whiteSpace: 'pre-wrap' }}>{selected.summary.text}</div>
        </div>
      )}

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

      <div ref={threadScrollRef} style={{ padding: 14, maxHeight: isMobile ? '58vh' : '58vh', overflow: 'auto', background: 'rgba(0,0,0,0.02)' }}>
        {threadLoading && (
          <div className="text-small" style={{ color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>
            Carregando mensagens…
          </div>
        )}
        {(selected?.messages || []).map((m, idx) => {
          const role = m?.role === 'assistant' ? 'assistant' : 'user';
          const mine = role === 'assistant';
          const content = String(m?.content || '');
          const senderKind = (() => {
            if (role !== 'assistant') return 'user';
            const sender = String(m?.sender || '').trim().toLowerCase();
            if (sender === 'human' || sender === 'humano') return 'human';
            if (sender === 'ai' || sender === 'agent' || sender === 'agente') return 'ai';
            const hasAiHints = Boolean(m?.in_reply_to) || (m?.classificacao && typeof m.classificacao === 'object');
            return hasAiHints ? 'ai' : 'human';
          })();
          const senderIcon = senderKind === 'ai' ? '🤖' : senderKind === 'human' ? '👤' : '';
          const statusLower = String(m?.status || '').trim().toLowerCase();
          const scheduledAt = typeof m?.send_at === 'string' ? String(m.send_at) : '';
          const canceledAt = typeof m?.canceled_at === 'string' ? String(m.canceled_at) : '';
          const isScheduled = statusLower === 'scheduled' && !!scheduledAt;
          const isCanceled = statusLower === 'canceled';
          const mid = String(m?.message_id || '').trim();
          const canCancel = mine && (statusLower === 'scheduled' || statusLower === 'pending') && !!mid;
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              <div
                style={{
                  maxWidth: 720,
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: mine ? 'var(--accent-light)' : 'var(--border)',
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap'
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    {mine && <span title={senderKind === 'ai' ? 'Agente IA' : 'Humano'}>{senderIcon}</span>}
                    <span>{content}</span>
                  </div>
                </div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>{formatTimeOnly(m?.timestamp) || formatWhen(m?.timestamp)}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {isCanceled && <span title="Mensagem cancelada">Cancelada {canceledAt ? formatWhen(canceledAt) : ''}</span>}
                    {isScheduled && <span title="Mensagem agendada">Agendada {formatWhen(scheduledAt)}</span>}
                    {canCancel && (
                      <button
                        className="btn btn-outline"
                        style={{ padding: '2px 8px', minHeight: 26 }}
                        onClick={() => cancelScheduledMessage(mid)}
                        disabled={Boolean(cancelingMsgId) || cancelingMsgId === mid}
                        type="button"
                      >
                        {cancelingMsgId === mid ? 'Cancelando…' : 'Cancelar'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!threadLoading && (selected?.messages || []).length === 0 && (
          <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28, lineHeight: '28px', marginBottom: 6 }}>💬</div>
            <div>Nenhuma mensagem ainda</div>
          </div>
        )}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => applyWrapToDraft('*')} type="button">
              Negrito
            </button>
            <button className="btn btn-outline" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => applyWrapToDraft('_')} type="button">
              Itálico
            </button>
            <button className="btn btn-outline" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => applyWrapToDraft('~')} type="button">
              Riscado
            </button>
            <button className="btn btn-outline" style={{ minHeight: 30, padding: '0 8px' }} onClick={() => applyWrapToDraft('```')} type="button">
              Mono
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-outline"
                style={{ minHeight: 30, padding: '0 8px' }}
                onClick={() => setEmojiOpen((v) => !v)}
                type="button"
                aria-expanded={emojiOpen}
              >
                Emojis
              </button>
              {emojiOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 40,
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
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            WhatsApp: *negrito* _itálico_ ~riscado~
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
            <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
              {String(draft || '').length} caracteres
            </div>
            <button className="btn btn-primary" onClick={sendManual} disabled={sending || !draft.trim() || !selectedPhone} type="button">
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container" style={{ paddingTop: 18, paddingBottom: 30, maxWidth: '100%', width: '100%' }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Atendimento</h2>
          <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            {loading ? 'Carregando…' : `${items.length} conversas${lastUpdatedAt ? ` • atualizado ${formatWhen(lastUpdatedAt)}` : ''}`}
          </div>
        </div>
        {inboxTab === 'conversas' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por telefone…"
              className="form-input"
              style={{ width: 220 }}
            />
            <button className="btn btn-secondary" onClick={() => loadList({ reset: true })} disabled={loading}>
              Atualizar
            </button>
            <button className="btn btn-outline" onClick={() => setAutoRefresh((v) => !v)} title="Atualiza automaticamente a cada 10s">
              Auto: {autoRefresh ? 'On' : 'Off'}
            </button>
          </div>
        ) : (
          <div />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          className={inboxTab === 'conversas' ? 'btn btn-primary' : 'btn btn-outline'}
          type="button"
          onClick={() => setInboxTab('conversas')}
        >
          Conversas
        </button>
        <button
          className={inboxTab === 'dispositivo' ? 'btn btn-primary' : 'btn btn-outline'}
          type="button"
          onClick={() => {
            setInboxTab('dispositivo');
            setWaQrError(false);
            setWaQrTick((v) => v + 1);
            fetchWaInfo();
          }}
        >
          Dispositivo
        </button>
        <button
          className={inboxTab === 'agente' ? 'btn btn-primary' : 'btn btn-outline'}
          type="button"
          onClick={openPromptSettings}
        >
          Agente IA
        </button>
      </div>

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
          <div style={{ display: 'grid', gridTemplateColumns: `${listWidth}px 10px minmax(0, 1fr)`, gap: 0, alignItems: 'stretch' }}>
            <div style={{ paddingRight: 14 }}>{listPanel}</div>
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
            <div style={{ paddingLeft: 14 }}>{threadPanel}</div>
          </div>
        ))}
    </div>
  );
}
