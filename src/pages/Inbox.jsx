import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { account, realtime, CONVERSATIONS_COL, DB_ID, databases, ACADEMIES_COL } from '../lib/appwrite';
import { humanHandoffUntilToMs } from '../../lib/humanHandoffUntil.js';
import { AGENT_HISTORY_WINDOW, getHumanHandoffHoursForClient } from '../../lib/constants.js';
import {
  WHATSAPP_TEMPLATE_LABELS,
  applyWhatsappTemplatePlaceholders,
} from '../../lib/whatsappTemplateDefaults.js';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../store/useUiStore';
import { LEAD_STATUS, useLeadStore } from '../store/useLeadStore';
import { useUserRole } from '../lib/useUserRole';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { useZapsterWhatsAppConnection } from '../hooks/useZapsterWhatsAppConnection';
import { Bell, BellOff, Loader2, Sparkles } from 'lucide-react';
import ConversationList from '../components/inbox/ConversationList';
import ConversationNotesPanel from '../components/inbox/ConversationNotesPanel';
import ThreadState from '../components/inbox/ThreadState';
import ThreadSkeleton from '../components/inbox/ThreadSkeleton';
const EMPTY_ACADEMY_LIST = [];

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

/** 0 = desconhecido/inválido — na ordenação por data ficam por último dentro do grupo. */
function parseTimestampMs(value) {
  const s = String(value || '').trim();
  if (!s) return 0;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Citação estilo WhatsApp para encaminhar na mesma conversa: cada linha com ">", depois linha em branco para o cursor. */
function buildQuotedForwardBlock(originalText) {
  const raw = String(originalText ?? '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const quoted = lines.map((ln) => `> ${ln}`).join('\n');
  return `${quoted}\n\n`;
}

export default function Inbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const addToast = useUiStore((s) => s.addToast);
  const { fetchLeads, leads, loading: leadsLoading, academyId, academyList: academyListRaw } = useLeadStore(
    useShallow((state) => ({
      fetchLeads: state.fetchLeads,
      leads: state.leads,
      loading: state.loading,
      academyId: state.academyId,
      academyList: state.academyList,
    }))
  );
  const academyList = Array.isArray(academyListRaw) ? academyListRaw : EMPTY_ACADEMY_LIST;
  const academyDoc = useMemo(() => academyList.find((a) => a.id === academyId) || { ownerId: '', teamId: '' }, [academyList, academyId]);
  const role = useUserRole(academyDoc);
  const canConfigureAgenteIa = role === 'owner' || role === 'member';
  const { waInfo, waSyncing, reconcileWhatsAppHistory } = useZapsterWhatsAppConnection(academyId, { pollWhileDisconnected: false });

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
    
    // Evita um setState redundante se o phone já é o mesmo que está no state atual
    if (selectedPhoneRef.current === digits) return;
    
    setSelectedPhone(digits);
  }, [location.search]);

  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [sending, setSending] = useState(false);
  const [improvingDraft, setImprovingDraft] = useState(false);
  const [draftBeforeImprove, setDraftBeforeImprove] = useState(null);
  const [cancelingMsgId, setCancelingMsgId] = useState('');
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 1023px)').matches
      : false
  );
  const [isNarrowDesktop, setIsNarrowDesktop] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);

  const [listFilter, setListFilter] = useState('all');
  const listFilterRef = useRef('all');
  const prevListFilterForReloadRef = useRef(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [labelFilter, setLabelFilter] = useState(null); // string id | null
  const [inboxLabels, setInboxLabels] = useState([]);
  const [stats, setStats] = useState({
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
  const [desktopNotify, setDesktopNotify] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('inbox_desktop_notify') === '1';
    } catch {
      return false;
    }
  });
  const [academyNameForTemplates, setAcademyNameForTemplates] = useState('');
  const [whatsappTemplatesObj, setWhatsappTemplatesObj] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadPaging, setThreadPaging] = useState(false);
  const [threadCursor, setThreadCursor] = useState(null);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [ticketUpdating, setTicketUpdating] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferToDraft, setTransferToDraft] = useState('');
  const [contextOpen, setContextOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem('inbox_context_open');
    if (raw === '0') return false;
    if (raw === '1') return true;
    return true;
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  /** Mobile: bottom sheet após long press na lista (só ação "marcar não lida" quando aplicável). */
  const [conversationSheet, setConversationSheet] = useState(null);
  const [selectedMsgKey, setSelectedMsgKey] = useState('');
  const [expandedMsgs, setExpandedMsgs] = useState({});
  const [threadAtBottom, setThreadAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [msgFlags, setMsgFlags] = useState({});

  useEffect(() => {
    if (!academyId) {
      setAcademyNameForTemplates('');
      setWhatsappTemplatesObj(null);
      return;
    }
    let cancelled = false;
    databases
      .getDocument(DB_ID, ACADEMIES_COL, academyId)
      .then((doc) => {
        if (cancelled) return;
        setAcademyNameForTemplates(String(doc?.name || '').trim());
        try {
          const w = doc.whatsappTemplates;
          const parsed = typeof w === 'string' ? JSON.parse(w) : w;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const strOnly = {};
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'string' && String(v).trim()) strOnly[k] = v;
            }
            setWhatsappTemplatesObj(Object.keys(strOnly).length ? strOnly : null);
          } else {
            setWhatsappTemplatesObj(null);
          }
        } catch {
          setWhatsappTemplatesObj(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAcademyNameForTemplates('');
          setWhatsappTemplatesObj(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const quickTemplates = useMemo(() => {
    const raw = whatsappTemplatesObj;
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw)
      .filter(([, tpl]) => typeof tpl === 'string' && String(tpl).trim())
      .map(([key, text]) => ({
        key,
        label: WHATSAPP_TEMPLATE_LABELS[key] || key,
        text: String(text)
      }));
  }, [whatsappTemplatesObj]);

  const slashFilteredTemplates = useMemo(() => {
    const q = String(slashQuery || '').trim().toLowerCase();
    return quickTemplates.filter(
      (t) =>
        !q ||
        String(t.label).toLowerCase().includes(q) ||
        String(t.text).toLowerCase().includes(q)
    );
  }, [quickTemplates, slashQuery]);

  const draftRef = useRef('');
  const selectedPhoneRef = useRef('');
  const textareaRef = useRef(null);
  const slashPopupRef = useRef(null);
  const slashActiveItemRef = useRef(null);
  const threadScrollRef = useRef(null);
  const lastAutoScrollPhoneRef = useRef('');
  const threadMsgCountRef = useRef(0);
  const listMetaRef = useRef(new Map());
  const notifiedOnceRef = useRef(false);
  const desktopNotifyRef = useRef(false);
  const loadListRef = useRef(null);
  const loadThreadRef = useRef(null);
  const threadAbortRef = useRef(null);
  const threadRequestSeqRef = useRef(0);
  const realtimeTimersRef = useRef({ list: null, thread: null });
  const academyIdRef = useRef('');
  const prevAcademyIdForInboxRef = useRef('');
  const messageFlagsMigrationDoneRef = useRef(false);
  const searchQuery = useMemo(() => String(search || '').trim(), [search]);
  const handoffHours = useMemo(() => getHumanHandoffHoursForClient(), []);
  const handoffDurationPhrase = useMemo(
    () => (handoffHours === 1 ? '1 hora' : `${handoffHours} horas`),
    [handoffHours]
  );

  useEffect(() => {
    draftRef.current = String(draft || '');
  }, [draft]);

  useEffect(() => {
    selectedPhoneRef.current = String(selectedPhone || '');
  }, [selectedPhone]);

  useEffect(() => {
    setSlashOpen(false);
    setSlashQuery('');
  }, [selectedPhone]);

  useEffect(() => {
    if (!slashOpen) return;
    setSlashIndex(0);
  }, [slashQuery, slashOpen]);

  useEffect(() => {
    if (!slashOpen) return;
    try {
      slashActiveItemRef.current?.scrollIntoView?.({ block: 'nearest' });
    } catch {
      void 0;
    }
  }, [slashIndex, slashOpen, slashFilteredTemplates.length]);

  useEffect(() => {
    if (!slashOpen) return;
    const onDown = (e) => {
      const pop = slashPopupRef.current;
      const ta = textareaRef.current;
      const t = e.target;
      if (pop && pop.contains(t)) return;
      if (ta && ta.contains(t)) return;
      setSlashOpen(false);
      setSlashQuery('');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [slashOpen]);

  useEffect(() => {
    listFilterRef.current = listFilter;
  }, [listFilter]);

  useEffect(() => {
    if (!academyId) prevListFilterForReloadRef.current = null;
  }, [academyId]);

  useEffect(() => {
    desktopNotifyRef.current = Boolean(desktopNotify);
  }, [desktopNotify]);

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
    setLabelFilter(null);
  }, [academyId]);

  useEffect(() => {
    if (!academyId) return;
    (async () => {
      try {
        const token = await getJwt();
        const res = await fetch('/api/labels', {
          headers: { Authorization: `Bearer ${token}`, 'x-academy-id': academyId },
        });
        const data = await res.json();
        if (data?.sucesso) setInboxLabels(data.labels || []);
      } catch { /* silent */ }
    })();
  }, [academyId]);

  useEffect(() => {
    setLeadPanel(null);
    setLeadSearch('');
    setLeadNameDraft('');
    setDraftBeforeImprove(null);
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
    if (leadPanel !== 'associate') return;
    if (leadsLoading) return;
    if (Array.isArray(leads) && leads.length > 0) return;
    fetchLeads();
  }, [leadPanel, leadsLoading, leads, fetchLeads]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => {
      setIsMobile(Boolean(mq.matches));
    };
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
    if (listFilter === 'archived') return;
    const unreadBacklog = (Array.isArray(items) ? items : []).reduce((acc, it) => acc + (Number(it?.unread_count || 0) > 0 ? 1 : 0), 0);
    const resolvedCount = (Array.isArray(items) ? items : []).filter((it) => String(it?.ticket_status || '') === 'resolved').length;
    const transferredCount = (Array.isArray(items) ? items : []).filter((it) => String(it?.ticket_status || '') === 'transferred').length;
    setStats((prev) => ({ ...prev, unreadBacklog, resolvedCount, transferredCount }));
    useLeadStore.getState().setInboxUnreadConversations(unreadBacklog);
  }, [items, listFilter]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (editing) return;
      if (!selectedPhoneRef.current) return;
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected?.ticket_status, selected?.transfer_to]);

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

  const conversationIdForFlags = useMemo(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return '';
    const fromSelected = String(selected?.conversation_id || '').trim();
    if (fromSelected) return fromSelected;
    const row = (Array.isArray(items) ? items : []).find((it) => String(it?.phone_number || '').trim() === phone);
    return String(row?.id || '').trim();
  }, [selectedPhone, selected?.conversation_id, items]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!academyId || messageFlagsMigrationDoneRef.current) return;
    const raw = window.localStorage.getItem('inbox_msg_flags');
    if (!raw || raw === '{}') {
      messageFlagsMigrationDoneRef.current = true;
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      messageFlagsMigrationDoneRef.current = true;
      try {
        window.localStorage.removeItem('inbox_msg_flags');
      } catch {
        void 0;
      }
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      messageFlagsMigrationDoneRef.current = true;
      try {
        window.localStorage.removeItem('inbox_msg_flags');
      } catch {
        void 0;
      }
      return;
    }

    const arr = Array.isArray(items) ? items : [];
    const phones = Object.keys(parsed).filter((ph) => {
      const p = String(ph || '').trim();
      if (!p) return false;
      const cur = parsed[p];
      const pin = cur?.pinned && typeof cur.pinned === 'object' ? cur.pinned : {};
      const imp = cur?.important && typeof cur.important === 'object' ? cur.important : {};
      const nPin = Object.keys(pin).filter((k) => pin[k]).length;
      const nImp = Object.keys(imp).filter((k) => imp[k]).length;
      return nPin + nImp > 0;
    });
    if (phones.length > 0 && arr.length === 0) {
      if (!loading) {
        messageFlagsMigrationDoneRef.current = true;
        try {
          window.localStorage.removeItem('inbox_msg_flags');
        } catch {
          void 0;
        }
      }
      return;
    }

    (async () => {
      let ok = true;
      try {
        const jwt = await getJwt();
        const headers = {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': academyId,
        };
        for (const phone of phones.length ? phones : Object.keys(parsed)) {
          const p = String(phone || '').trim();
          if (!p) continue;
          const cur = parsed[p];
          if (!cur || typeof cur !== 'object') continue;
          const row = arr.find((it) => String(it?.phone_number || '').trim() === p);
          const conversationId = String(row?.id || '').trim();
          if (!conversationId) continue;
          const pin = cur.pinned && typeof cur.pinned === 'object' ? cur.pinned : {};
          const imp = cur.important && typeof cur.important === 'object' ? cur.important : {};
          for (const k of Object.keys(pin)) {
            if (!pin[k]) continue;
            const mid = String(k || '').trim();
            if (!mid) continue;
            const res = await fetch('/api/message-flags', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                academy_id: academyId,
                conversation_id: conversationId,
                message_id: mid,
                type: 'pinned',
              }),
            });
            if (!res.ok) ok = false;
          }
          for (const k of Object.keys(imp)) {
            if (!imp[k]) continue;
            const mid = String(k || '').trim();
            if (!mid) continue;
            const res = await fetch('/api/message-flags', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                academy_id: academyId,
                conversation_id: conversationId,
                message_id: mid,
                type: 'important',
              }),
            });
            if (!res.ok) ok = false;
          }
        }
        if (ok) {
          try {
            window.localStorage.removeItem('inbox_msg_flags');
          } catch {
            void 0;
          }
        }
      } catch {
        ok = false;
      } finally {
        messageFlagsMigrationDoneRef.current = true;
      }
    })();
  }, [academyId, items, loading]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    const cid = String(conversationIdForFlags || '').trim();
    if (!academyId || !phone || !cid) return;
    let cancelled = false;
    (async () => {
      try {
        const jwt = await getJwt();
        const qs = new URLSearchParams({
          conversation_id: cid,
          academy_id: academyId,
        });
        const res = await fetch(`/api/message-flags?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.sucesso) return;
        const list = Array.isArray(data.flags) ? data.flags : [];
        const mapPinned = {};
        const mapImp = {};
        for (const f of list) {
          const mid = String(f?.message_id || '').trim();
          if (!mid) continue;
          if (f.type === 'pinned') mapPinned[mid] = true;
          if (f.type === 'important') mapImp[mid] = true;
        }
        setMsgFlags((prev) => {
          const base = prev && typeof prev === 'object' ? prev : {};
          return {
            ...base,
            [phone]: { pinned: mapPinned, important: mapImp },
          };
        });
      } catch {
        void 0;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, selectedPhone, conversationIdForFlags]);

  async function toggleMsgFlag(phone, key, kind) {
    const p = String(phone || '').trim();
    const k = String(key || '').trim();
    const t = String(kind || '').trim();
    if (!p || !k || (t !== 'pinned' && t !== 'important')) return;
    const cid =
      p === String(selectedPhone || '').trim()
        ? String(conversationIdForFlags || '').trim()
        : String(
            (Array.isArray(items) ? items : []).find((it) => String(it?.phone_number || '').trim() === p)?.id || ''
          ).trim();
    if (!cid || !academyId) return;

    const curPhone = msgFlags && typeof msgFlags === 'object' && msgFlags[p] && typeof msgFlags[p] === 'object' ? msgFlags[p] : {};
    const curMap = curPhone[t] && typeof curPhone[t] === 'object' ? curPhone[t] : {};
    const has = Boolean(curMap[k]);
    const nextHas = !has;

    const applyLocal = () => {
      setMsgFlags((prev) => {
        const base = prev && typeof prev === 'object' ? prev : {};
        const cur = base[p] && typeof base[p] === 'object' ? base[p] : {};
        const next = { ...base };
        const cm = cur[t] && typeof cur[t] === 'object' ? cur[t] : {};
        const nextMap = { ...cm };
        if (nextHas) nextMap[k] = true;
        else delete nextMap[k];
        next[p] = { ...cur, [t]: nextMap };
        return next;
      });
    };

    try {
      const jwt = await getJwt();
      if (nextHas) {
        const res = await fetch('/api/message-flags', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
            'x-academy-id': academyId,
          },
          body: JSON.stringify({
            academy_id: academyId,
            conversation_id: cid,
            message_id: k,
            type: t,
          }),
        });
        if (!res.ok) throw new Error('post');
        applyLocal();
      } else {
        const qs = new URLSearchParams({
          type: t,
          academy_id: academyId,
          conversation_id: cid,
        });
        const res = await fetch(`/api/message-flags/${encodeURIComponent(k)}?${qs.toString()}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': academyId },
        });
        if (!res.ok) throw new Error('delete');
        applyLocal();
      }
    } catch {
      addToast({ type: 'error', message: 'Não foi possível atualizar a mensagem.' });
    }
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

  async function reconcileLast24h() {
    if (!academyIdRef.current) return;
    setError('');
    await reconcileWhatsAppHistory(async () => {
      await loadList({ reset: true, silent: true });
      const phone = String(selectedPhoneRef.current || '').trim();
      if (phone) await loadThread(phone);
    });
  }

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

  function tryDesktopNotify({ phone, name, preview }) {
    if (typeof window === 'undefined' || !desktopNotifyRef.current) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const label = String(name || phone || '').trim() || 'Contato';
    const pv = String(preview || '').trim();
    const body = (pv ? `${label}: ${pv}` : `${label} enviou uma mensagem`).slice(0, 180);
    try {
      new Notification('Nova mensagem no WhatsApp', { body, tag: `wa-inbox-${phone}` });
    } catch {
      void 0;
    }
  }

  async function toggleDesktopNotifyPreference() {
    if (desktopNotify) {
      try {
        window.localStorage.removeItem('inbox_desktop_notify');
      } catch {
        void 0;
      }
      setDesktopNotify(false);
      addToast({ type: 'info', message: 'Alertas do sistema desativados.' });
      return;
    }
    if (typeof Notification === 'undefined') {
      addToast({ type: 'warning', message: 'Este navegador não suporta notificações.' });
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      addToast({ type: 'warning', message: 'Permissão necessária para alertas do sistema.' });
      return;
    }
    try {
      window.localStorage.setItem('inbox_desktop_notify', '1');
    } catch {
      void 0;
    }
    setDesktopNotify(true);
    addToast({ type: 'success', message: 'Você receberá alertas quando chegar mensagem.' });
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
    if (!academyIdRef.current) return;
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(p)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'read' })
      });
      if (blocked) return;
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
    } catch (e) {
      try {
        addToast({ type: 'error', message: e?.message || 'Não foi possível marcar como lida. Tente de novo.' });
      } catch {
        void 0;
      }
    }
  }

  async function markUnread(phone) {
    const p = String(phone || '').trim();
    if (!p) return;
    if (!academyIdRef.current) return;
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(p)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'unread' })
      });
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao marcar como não lida'));
      setItems((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map((it) => {
          const ph = String(it?.phone_number || '').trim();
          if (ph !== p) return it;
          return { ...it, unread_count: 1 };
        });
      });
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== p) return prev;
        return null;
      });
      setSelectedPhone((prevPhone) => (String(prevPhone || '').trim() === p ? '' : prevPhone));
      setConversationSheet(null);
      closeMenu();
      addToast({ type: 'success', message: 'Marcado como não lida' });
    } catch (e) {
      try {
        addToast({ type: 'error', message: e?.message || 'Não foi possível marcar como não lida.' });
      } catch {
        void 0;
      }
    }
  }

  async function unarchiveConversation(phone, { silent = false } = {}) {
    const p = String(phone || '').trim();
    if (!p || !academyIdRef.current) return false;
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(p)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'unarchive' })
      });
      if (blocked) return false;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao desarquivar'));
      const curFilter = listFilterRef.current;
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== p) return prev;
        return { ...prev, archived: false };
      });
      setItems((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        if (curFilter === 'archived') return arr.filter((it) => String(it?.phone_number || '').trim() !== p);
        return arr.map((it) => {
          const ph = String(it?.phone_number || '').trim();
          if (ph !== p) return it;
          return { ...it, archived: false };
        });
      });
      if (curFilter === 'archived' && String(selectedPhoneRef.current || '').trim() === p) {
        setSelectedPhone('');
        setSelected(null);
      }
      const fn = loadListRef.current;
      if (typeof fn === 'function') void fn({ reset: true, silent: true });
      if (!silent) addToast({ type: 'success', message: 'Conversa desarquivada' });
      closeMenu();
      return true;
    } catch (e) {
      try {
        addToast({ type: 'error', message: e?.message || 'Não foi possível desarquivar.' });
      } catch {
        void 0;
      }
      return false;
    }
  }

  async function archiveConversation(phone) {
    const p = String(phone || '').trim();
    if (!p || !academyIdRef.current) return;
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(p)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'archive' })
      });
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao arquivar'));
      const curFilter = listFilterRef.current;
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== p) return prev;
        return { ...prev, archived: true };
      });
      setItems((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        if (curFilter !== 'archived') return arr.filter((it) => String(it?.phone_number || '').trim() !== p);
        return arr.map((it) => {
          const ph = String(it?.phone_number || '').trim();
          if (ph !== p) return it;
          return { ...it, archived: true };
        });
      });
      if (curFilter !== 'archived' && String(selectedPhoneRef.current || '').trim() === p) {
        setSelectedPhone('');
        setSelected(null);
      }
      const fn = loadListRef.current;
      if (typeof fn === 'function') void fn({ reset: true, silent: true });
      addToast({
        type: 'info',
        message: 'Conversa arquivada',
        duration: 5000,
        action: {
          label: 'Desfazer',
          onClick: () => {
            void unarchiveConversation(p, { silent: true });
          }
        }
      });
      closeMenu();
    } catch (e) {
      try {
        addToast({ type: 'error', message: e?.message || 'Não foi possível arquivar.' });
      } catch {
        void 0;
      }
    }
  }

  function openPromptSettings() {
    navigate('/empresa?tab=agente');
  }


  useEffect(() => {
    if (!academyId) return;
    const connected = String(waInfo?.status || '').trim() === 'connected';
    if (!connected) return;
    const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'connect_whatsapp')?.done;
    if (done) return;
    void useLeadStore.getState().completeOnboardingStepIds(['connect_whatsapp']);
  }, [waInfo?.status, academyId]);

  async function loadList({ reset = false, silent = false } = {}) {
    if (!academyIdRef.current) return;
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
      qs.set('archived', listFilterRef.current === 'archived' ? '1' : '0');
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      if (blocked) return;
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
        const curUnread = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
        const curUpdated = String(it?.updated_at || '').trim();
        const curLu = String(it?.last_user_msg_at || '').trim();
        nextMeta.set(phone, {
          ts,
          role: String(it?.last_message_role || '').trim(),
          sender: String(it?.last_message_sender || '').trim(),
          unread_count: curUnread,
          updated_at: curUpdated,
          last_user_msg_at: curLu
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
        const selected = String(selectedPhoneRef.current || '').trim();
        for (const it of next) {
          const phone = String(it?.phone_number || '').trim();
          if (!phone || phone === selected) continue;
          const curUnread = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
          if (curUnread <= 0) continue;
          const prev = previousMeta.get(phone);
          const prevUnread = prev && Number.isFinite(Number(prev.unread_count)) ? Number(prev.unread_count) : 0;
          const prevLu = prev && typeof prev.last_user_msg_at === 'string' ? prev.last_user_msg_at : '';
          const curLu = String(it?.last_user_msg_at || '').trim();
          const prevUpdated = prev && typeof prev.updated_at === 'string' ? prev.updated_at : '';
          const curUpdated = String(it?.updated_at || '').trim();
          const unreadIncreased = curUnread > prevUnread;
          const userMsgRenewed = Boolean(curLu && curLu !== prevLu);
          const updatedAdvanced = Boolean(curUpdated && curUpdated !== prevUpdated);
          if (!unreadIncreased && !(userMsgRenewed && updatedAdvanced)) continue;
          const preview = String(it?.last_preview || '').trim();
          const name = String(it?.lead_name || '').trim() || phone;
          playNotificationSound();
          setHighlightedPhone(phone);
          addToast({
            type: 'info',
            message: `Nova mensagem de ${name}${preview ? `: ${preview}` : ''}`
          });
          tryDesktopNotify({ phone, name, preview });
        }
      } else if (reset) {
        notifiedOnceRef.current = true;
      }
      listMetaRef.current = nextMeta;
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
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(p)}${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') },
        ...(signal ? { signal } : {})
      });
      if (blocked) return;
      const contentType = resp.headers.get('content-type') || '';
      const raw = await resp.text();
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
        const convId =
          typeof data?.conversation_id === 'string' && String(data.conversation_id).trim()
            ? String(data.conversation_id).trim()
            : append && prev && prev.phone === p
              ? String(prev.conversation_id || '').trim()
              : '';
        const base = {
          phone: p,
          conversation_id: convId || null,
          summary,
          lead_id: typeof data?.lead_id === 'string' ? data.lead_id : null,
          lead_name: typeof data?.lead_name === 'string' ? data.lead_name : '',
          need_human: Boolean(data?.need_human),
          human_handoff_until: handoffUntil || null,
          ticket_status: String(ticketStatus || 'open'),
          transfer_to: transferTo || null,
          archived: Boolean(data?.archived)
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
        const selectedNow = String(selectedPhoneRef.current || '').trim();

        if (realtimeTimersRef.current?.list) clearTimeout(realtimeTimersRef.current.list);
        realtimeTimersRef.current.list = setTimeout(() => {
          const fn = loadListRef.current;
          if (typeof fn === 'function') fn({ reset: true, silent: true });
        }, 250);

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
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'handoff', ativo: Boolean(ativo) })
      });
      if (blocked) return false;
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
        return { ...prev, messages: msgs.slice(-AGENT_HISTORY_WINDOW) };
      });
      markSeen(phone);
      setDraft('');
      setDraftBeforeImprove(null);
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

  async function improveDraftWithAi() {
    const phone = String(selectedPhoneRef.current || '').trim();
    const current = String(draftRef.current || '');
    if (!phone || current.trim().length <= 3) return;
    setError('');
    setImprovingDraft(true);
    try {
      const jwt = await getJwt();
      const aid = String(academyIdRef.current || '').trim();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': aid,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'improve_reply', draft: current, phone, academyId: aid })
      });
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao melhorar texto'));
      const data = safeParseJson(raw) || {};
      const improved = typeof data?.improved === 'string' ? data.improved.trim() : '';
      if (!improved) throw new Error('Resposta inválida do servidor');
      setDraftBeforeImprove(current);
      setDraft(improved);
      addToast({ type: 'success', message: 'Texto atualizado — revise antes de enviar' });
      try {
        setTimeout(() => textareaRef.current?.focus?.(), 0);
      } catch {
        void 0;
      }
    } catch (e) {
      setError(e?.message || 'Erro ao melhorar');
    } finally {
      setImprovingDraft(false);
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
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'link_lead', lead_id: leadId })
      });
      if (blocked) return;
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
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/leads/convert', {
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
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao converter lead'));
      const data = safeParseJson(raw) || {};
      const leadId = String(data?.id || '').trim();
      if (!leadId) throw new Error('ID do lead ausente');
      await linkLeadToConversation({ leadId });
      addToast({ type: 'success', message: data?.ja_existe ? 'Lead já existente' : 'Lead criado' });
      navigate(`/lead/${encodeURIComponent(leadId)}`);
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

  function applySlashTemplate(tpl) {
    if (!tpl || typeof tpl.text !== 'string') return;
    const lid = String(selected?.lead_id || '').trim();
    const fromStore = lid ? leads.find((x) => String(x.id) === lid) : null;
    const leadForTpl = fromStore || { name: selected?.lead_name, lead_name: selected?.lead_name };
    const out = applyWhatsappTemplatePlaceholders(tpl.text, {
      lead: leadForTpl,
      academyName: academyNameForTemplates
    });
    setDraft(out);
    setSlashOpen(false);
    setSlashQuery('');
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    }, 0);
  }

  function handleDraftChange(e) {
    const value = e.target.value;
    setDraft(value);
    if (!String(selectedPhone || '').trim()) {
      setSlashOpen(false);
      setSlashQuery('');
      return;
    }
    const parts = String(value || '')
      .split(/\s+/)
      .filter((p) => p.length > 0);
    const lastSeg = parts.length ? parts[parts.length - 1] : '';
    if (lastSeg.startsWith('/')) {
      setSlashQuery(lastSeg.slice(1));
      setSlashOpen(true);
    } else {
      setSlashOpen(false);
      setSlashQuery('');
    }
  }

  const emojis = useMemo(
    () => [
      '\u{1F600}',
      '\u{1F602}',
      '\u{1F60D}',
      '\u{1F970}',
      '\u{1F64F}',
      '\u{1F44D}',
      '\u{1F44F}',
      '\u{1F389}',
      '\u{1F525}',
      '\u{2705}',
      '\u{274C}',
      '\u{1F91D}',
      '\u{1F622}',
      '\u{1F914}',
      '\u{2B50}',
      '\u{1F4AA}',
      '\u{1F94B}',
      '\u{1F4CD}',
      '\u{1F4DE}',
      '\u{23F0}',
    ],
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
    if (!academyId) return;
    if (prevListFilterForReloadRef.current === null) {
      prevListFilterForReloadRef.current = listFilter;
      return;
    }
    if (prevListFilterForReloadRef.current === listFilter) return;
    prevListFilterForReloadRef.current = listFilter;
    const fn = loadListRef.current;
    if (typeof fn === 'function') void fn({ reset: true, silent: true });
  }, [listFilter, academyId]);

  useEffect(() => {
    const cur = String(academyId || '').trim();
    if (!cur) return;
    const prev = prevAcademyIdForInboxRef.current;
    if (prev === cur) return;
    if (prev) {
      setSelectedPhone('');
      setSelected(null);
      setItems([]);
      setMsgFlags({});
      messageFlagsMigrationDoneRef.current = false;
      notifiedOnceRef.current = false;
    }
    prevAcademyIdForInboxRef.current = cur;
    const fn = loadListRef.current;
    if (typeof fn === 'function') void fn({ reset: true });
  }, [academyId]);

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
      const contactType =
        String(lead?.contact_type || '').trim() ||
        (status === LEAD_STATUS.CONVERTED ? 'student' : 'lead');
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
        _contactType: contactType,
        _lastRole: lastRole,
        _lastSender: lastSender,
        _unreadCount: unreadCount,
        _ticketStatus: ticketStatus,
        _transferTo: transferTo,
        _archived: Boolean(it?.archived),
        _isHighlighted: Boolean(highlighted && typeof highlighted === 'object' && highlighted[phone] && Number(highlighted[phone]) > Date.now())
      };
    });
  }, [items, leadById, leadByPhone, highlighted]);

  const prioritizedItems = useMemo(() => {
    const arr = Array.isArray(enrichedItems) ? enrichedItems : [];
    // Modelo híbrido: Não lidas / Em atendimento / Resolvidas vêm de groupedFilteredItems; dentro de cada grupo
    // a ordem é só por data (mais recente no topo). O score abaixo era usado para priorizar inbox inteiro — desativado.
    // const score = (it) => {
    //   let points = 0;
    //   const unread = Number(it?._unreadCount || 0);
    //   if (unread > 0) points += 40;
    //   const ticketStatus = String(it?._ticketStatus || '').trim();
    //   if (ticketStatus === 'waiting_customer') points += 20;
    //   if (ticketStatus === 'transferred') points += 8;
    //   if (ticketStatus === 'resolved') points -= 20;
    //   if (it?._hotLead) points += 15;
    //   if (it?._handoffActive) points += 10;
    //   const updatedMs = parseTimestampMs(it?.updated_at);
    //   const ageMinutes = updatedMs ? (Date.now() - updatedMs) / 60000 : 0;
    //   if (ageMinutes > 30 && unread > 0) points += 15;
    //   return points;
    // };
    const activityMs = (it) => {
      const u = parseTimestampMs(it?.updated_at);
      if (u) return u;
      return parseTimestampMs(it?.last_message_timestamp);
    };
    return arr.slice().sort((a, b) => activityMs(b) - activityMs(a));
  }, [enrichedItems]);

  const filteredItems = useMemo(() => {
    const arr = Array.isArray(prioritizedItems) ? prioritizedItems : [];
    const f = String(listFilter || 'all');
    const normTicket = (it) =>
      String(it?._ticketStatus ?? it?.ticket_status ?? '')
        .trim()
        .toLowerCase();
    const unreadN = (it) => {
      const n = Number(it?._unreadCount ?? it?.unread_count ?? 0);
      return Number.isFinite(n) ? n : 0;
    };
    let result = arr;
    if (f === 'archived') result = arr.filter((it) => Boolean(it?.archived));
    else if (f === 'unread') result = arr.filter((it) => unreadN(it) > 0);
    else if (f === 'hot') result = arr.filter((it) => Boolean(it?._hotLead));
    else if (f === 'need_human') result = arr.filter((it) => Boolean(it?._handoffActive));
    else if (f === 'waiting_customer') result = arr.filter((it) => normTicket(it) === 'waiting_customer');
    else if (f === 'resolved') result = arr.filter((it) => normTicket(it) === 'resolved');
    else if (f === 'transferred') result = arr.filter((it) => normTicket(it) === 'transferred');
    if (labelFilter) {
      result = result.filter((it) => {
        const ids = it?._lead?.labelIds;
        return Array.isArray(ids) && ids.includes(labelFilter);
      });
    }
    return result;
  }, [prioritizedItems, listFilter, labelFilter]);

  const groupedFilteredItems = useMemo(() => {
    const arr = Array.isArray(filteredItems) ? filteredItems : [];
    const unreadN = (it) => {
      const n = Number(it?._unreadCount ?? it?.unread_count ?? 0);
      return Number.isFinite(n) ? n : 0;
    };
    const isResolvedTicket = (it) =>
      String(it?._ticketStatus ?? it?.ticket_status ?? '')
        .trim()
        .toLowerCase() === 'resolved';
    const unread = arr.filter((it) => unreadN(it) > 0);
    const resolved = arr.filter((it) => isResolvedTicket(it));
    const open = arr.filter((it) => unreadN(it) <= 0 && !isResolvedTicket(it));
    const keyOf = (it) => String(it?._phone || it?.phone_number || it?.id || '').trim();
    const placed = new Set();
    for (const it of [...unread, ...resolved, ...open]) {
      const k = keyOf(it);
      if (k) placed.add(k);
    }
    const orphan = arr.filter((it) => {
      const k = keyOf(it);
      return k && !placed.has(k);
    });
    const openMerged = orphan.length ? [...open, ...orphan] : open;
    return [
      { key: 'unread', label: 'Não lidas', items: unread },
      { key: 'open', label: 'Em atendimento', items: openMerged },
      { key: 'resolved', label: 'Resolvidas', items: resolved }
    ];
  }, [filteredItems]);

  const handleSelectConversation = (it) => {
    const phone = String(it?._phone || it?.phone_number || '').trim();
    if (!phone) return;
    
    setThreadCursor(null);
    setThreadHasMore(false);
    setSelected((prev) => {
      const prevPhone = String(prev?.phone || '').trim();
      const isSamePhone = prevPhone === phone;
      const convId = String(it?.id || '').trim() || (isSamePhone ? String(prev?.conversation_id || '').trim() : '');
      return {
        phone,
        conversation_id: convId || null,
        summary: isSamePhone ? prev.summary : null,
        lead_id: String(it?.lead_id || '').trim() || null,
        lead_name: String(it?._displayTitle || it?.lead_name || '').trim(),
        need_human: Boolean(it?._handoffActive || it?.need_human),
        human_handoff_until: isSamePhone ? prev.human_handoff_until : null,
        ticket_status: String(it?._ticketStatus || it?.ticket_status || 'open'),
        transfer_to: String(it?._transferTo || it?.transfer_to || '').trim() || null,
        archived: Boolean(it?._archived ?? it?.archived),
        messages: isSamePhone && Array.isArray(prev?.messages) ? prev.messages : []
      };
    });
    setSelectedPhone(phone); // Atualizar o phone por último, ou isoladamente, após as mudanças de ref/state

    const unreadCount = Number(it?._unreadCount ?? it?.unread_count ?? 0);
    if (unreadCount > 0) {
      markSeen(phone);
    }
  };

  function ticketChip(status, transferTo) {
    const s = String(status || '').trim();
    if (s === 'resolved') return { label: 'Resolvido', bg: 'var(--success-light)', fg: 'var(--success)', tone: 'success' };
    if (s === 'waiting_customer') return { label: 'Aguardando cliente', bg: 'var(--warning-light)', fg: '#b45309', tone: 'warning' };
    if (s === 'transferred')
      return {
        label: transferTo ? `Transferido • ${transferTo}` : 'Transferido',
        bg: 'var(--inbox-info-badge-bg)',
        fg: 'var(--inbox-info-badge-fg)',
        tone: 'info'
      };
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
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/conversations/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'ticket', status: s, ...(transferTo ? { transfer_to: String(transferTo) } : {}) })
      });
      if (blocked) return false;
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
  }, [selected?.messages?.length]); // Removed selectedPhone and threadAtBottom to prevent infinite re-renders

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
    const periodMs = realtimeOn ? 30000 : 10000;
    const id = setInterval(() => {
      loadList({ reset: true, silent: true });
      const phone = selectedPhoneRef.current;
      if (phone && !String(draftRef.current || '').trim()) {
        loadThread(phone, { silent: true });
      }
    }, periodMs);
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

  const onConversationListScroll = (e) => {
    if (searchQuery) return;
    const el = e.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 240) loadList({ reset: false, silent: true });
  };

  const listPanel = (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 14,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        flex: isMobile ? undefined : 1,
        minHeight: isMobile ? undefined : 0,
        maxHeight: isMobile ? undefined : '100%'
      }}
    >
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Conversas</span>
          {Number(stats?.unreadBacklog || 0) > 0 && (
            <span
              className="text-small"
              style={{
                minWidth: 22,
                height: 22,
                padding: '0 7px',
                borderRadius: 999,
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                fontWeight: 700,
                lineHeight: '22px',
                textAlign: 'center'
              }}
              title={`${Number(stats.unreadBacklog)} conversa(s) com mensagens não lidas`}
            >
              {Number(stats.unreadBacklog) > 99 ? '99+' : Number(stats.unreadBacklog)}
            </span>
          )}
        </div>
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
          className={listFilter === 'archived' ? 'btn btn-primary' : 'btn btn-outline'}
          style={{ padding: '6px 10px', minHeight: 34 }}
          onClick={() => setListFilter('archived')}
        >
          Arquivadas
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
            {inboxLabels.length > 0 && (
              <select
                value={labelFilter || ''}
                onChange={(e) => setLabelFilter(e.target.value || null)}
                style={{
                  padding: '6px 10px',
                  minHeight: 34,
                  border: labelFilter ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 8,
                  background: labelFilter ? 'var(--accent-light)' : 'var(--surface)',
                  color: labelFilter ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <option value="">Etiqueta: todas</option>
                {inboxLabels.map((l) => (
                  <option key={l.$id} value={l.$id}>{l.name}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
      <div
        style={{
          flex: isMobile ? 'none' : 1,
          minHeight: isMobile ? undefined : 0,
          maxHeight: isMobile ? '72vh' : '100%',
          overflow: 'auto'
        }}
        onScroll={onConversationListScroll}
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
          isMobile={isMobile}
          onConversationLongPress={(it) => {
            const u = Number(it?._unreadCount ?? it?.unread_count ?? 0);
            if (!isMobile || u !== 0) return;
            setConversationSheet({ item: it });
          }}
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
                const untilMs = humanHandoffUntilToMs(selected?.human_handoff_until);
                const untilIso = untilMs > 0 ? new Date(untilMs).toISOString() : '';
                const untilLabel = untilIso ? formatTimeOnly(untilIso) || formatWhen(untilIso) : '';
                let rem = null;
                if (untilMs > 0) {
                  const remaining = untilMs - Date.now();
                  if (remaining > 0) {
                    const hours = Math.floor(remaining / 3600000);
                    const minutes = Math.floor((remaining % 3600000) / 60000);
                    if (hours > 0) rem = `${hours}h ${minutes}min`;
                    else if (minutes > 0) rem = `${minutes}min`;
                    else rem = 'menos de 1min';
                  }
                }

                if (selected?.need_human) {
                  return (
                    <>
                      <span
                        className="text-small"
                        style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 999 }}
                        title={
                          untilLabel
                            ? `Atendimento humano por ${handoffDurationPhrase} (até ${untilLabel})`
                            : `Atendimento humano ativo (${handoffDurationPhrase})`
                        }
                      >
                        {untilLabel ? `Humano até ${untilLabel}` : 'Atendimento humano'}
                      </span>
                      {rem && (
                        <span className="text-small handoff-timer" style={{ background: 'var(--warning-light)', color: 'var(--warning)', padding: '2px 8px', borderRadius: 999 }}>
                          IA retoma em {rem}
                        </span>
                      )}
                    </>
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
                  <span className="text-small" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: 999 }}>
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
          {listFilter === 'archived' && selectedPhone ? (
            <button
              className="btn btn-outline"
              style={{ padding: '6px 10px', minHeight: 34 }}
              onClick={() => void unarchiveConversation(selectedPhone)}
              disabled={!selectedPhone}
              type="button"
            >
              Desarquivar
            </button>
          ) : null}
          {!selected?.need_human ? (
            <button
              className="btn btn-primary"
              style={{ padding: '6px 10px', minHeight: 34 }}
              onClick={() => setHandoffActive(true)}
              disabled={!selectedPhone}
              type="button"
              title={`Pausa o agente por ${handoffDurationPhrase}`}
            >
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
            {'\u22EF'}
          </button>
        </div>
      </div>

      {transferModalOpen && (
        <div style={{ position: 'fixed', zIndex: 50, inset: 0, background: 'rgba(18,16,42,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 'min(560px, 92vw)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div className="navi-section-heading" style={{ fontSize: '1.05rem' }}>Transferir conversa</div>
              <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setTransferModalOpen(false)} type="button">
                Fechar
              </button>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
                Use para marcar para qual área essa conversa foi transferida (ex.: Financeiro, Secretaria, Comercial).
              </div>
              <div>
                <div className="ctx-label" style={{ marginBottom: 6 }}>Destino (opcional)</div>
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
          style={{ padding: 14, maxHeight: isMobile ? '58vh' : '58vh', overflow: 'auto', background: 'rgba(91,63,191,0.04)' }}
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

          {Array.isArray(threadBlocks) && threadBlocks.map((b) => {
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
                    border: `1px solid ${g.mine ? 'rgba(91, 63, 191, 0.22)' : 'var(--border)'}`,
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
                        {m?.type === 'image' && m?.mediaUrl ? (
                          <div className="inbox-msg-image">
                            <img
                              src={m.mediaUrl}
                              alt="Imagem"
                              style={{
                                maxWidth: '100%',
                                maxHeight: 300,
                                borderRadius: 8,
                                cursor: 'pointer',
                                objectFit: 'cover',
                                display: 'block'
                              }}
                              onClick={() => window.open(m.mediaUrl, '_blank')}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                const el = e.target.nextSibling;
                                if (el && el.style) el.style.display = 'flex';
                              }}
                            />
                            <div
                              style={{
                                display: 'none',
                                alignItems: 'center',
                                gap: 8,
                                color: 'var(--text-muted)',
                                fontSize: 13,
                                padding: '8px 0'
                              }}
                            >
                              Imagem indisponível (link expirado ou bloqueado)
                            </div>
                            {String(content || '').trim() && String(content || '').trim() !== '[imagem]' ? (
                              <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', lineHeight: '22px', fontSize: 15, color: 'var(--text)', marginTop: 8 }}>
                                {content}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="inbox-msg-text" style={{ whiteSpace: 'pre-wrap', lineHeight: '22px', fontSize: 15, color: 'var(--text)' }}>
                            {content}
                          </div>
                        )}
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
                              {'\u22EF'}
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
              <div style={{ fontSize: 28, lineHeight: '28px', marginBottom: 6 }}>ðŸ’¬</div>
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
                  {'\u26A1'}
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
                    <div className="navi-section-heading" style={{ fontSize: '0.82rem', padding: '2px 6px 6px' }}>Mensagens prontas</div>
                    {quickTemplates.length === 0 && (
                      <div className="text-small" style={{ color: 'var(--text-muted)', padding: '4px 8px' }}>
                        Nenhum template da academia. Configure em Templates no menu.
                      </div>
                    )}
                    {quickTemplates.map((tpl) => {
                      const lid = String(selected?.lead_id || '').trim();
                      const fromStore = lid ? leads.find((x) => String(x.id) === lid) : null;
                      const leadForTpl = fromStore || { name: selected?.lead_name, lead_name: selected?.lead_name };
                      return (
                      <button
                        key={tpl.key}
                        type="button"
                        className="btn btn-outline"
                        style={{ textAlign: 'left', padding: '6px 10px', minHeight: 32, whiteSpace: 'normal', lineHeight: '18px' }}
                        onClick={() => {
                          const out = applyWhatsappTemplatePlaceholders(tpl.text, {
                            lead: leadForTpl,
                            academyName: academyNameForTemplates
                          });
                          setDraft(out);
                          setTemplatesOpen(false);
                          try { textareaRef.current?.focus(); } catch { void 0; }
                        }}
                      >
                        <span style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{tpl.label}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {(tpl.text || '').length > 72 ? `${String(tpl.text).slice(0, 72)}…` : tpl.text}
                        </span>
                      </button>
                    );})}
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
                ðŸ˜Š
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
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {slashOpen && selectedPhone && (
              <div ref={slashPopupRef} className="inbox-slash-templates" role="listbox" aria-label="Templates rápidos">
                {slashFilteredTemplates.length === 0 ? (
                  <div className="text-small" style={{ color: 'var(--text-secondary)', padding: '10px 12px' }}>
                    Nenhum template encontrado
                  </div>
                ) : (
                  slashFilteredTemplates.map((tpl, idx) => {
                    const rawPrev = String(tpl.text || '').replace(/\s+/g, ' ').trim();
                    const preview = rawPrev.length > 60 ? `${rawPrev.slice(0, 60)}…` : rawPrev;
                    return (
                      <button
                        key={tpl.key}
                        type="button"
                        role="option"
                        aria-selected={idx === slashIndex}
                        ref={idx === slashIndex ? slashActiveItemRef : undefined}
                        className={`inbox-slash-templates-row${idx === slashIndex ? ' active' : ''}`}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          applySlashTemplate(tpl);
                        }}
                      >
                        <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{tpl.label}</span>
                        <span className="text-small" style={{ color: 'var(--text-secondary)', display: 'block', marginTop: 2 }}>
                          {preview}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={(e) => {
                if (slashOpen) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSlashIndex((i) => {
                      const n = slashFilteredTemplates.length;
                      if (n <= 0) return 0;
                      return Math.min(i + 1, n - 1);
                    });
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSlashIndex((i) => Math.max(0, i - 1));
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSlashOpen(false);
                    setSlashQuery('');
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (slashFilteredTemplates.length > 0) {
                      const n = slashFilteredTemplates.length;
                      const idx = Math.min(Math.max(0, slashIndex), n - 1);
                      applySlashTemplate(slashFilteredTemplates[idx]);
                    } else {
                      setSlashOpen(false);
                      setSlashQuery('');
                    }
                    return;
                  }
                }
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
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 88 }}
            />
          </div>
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline"
                style={{ padding: '6px 10px', minHeight: 34, minWidth: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={improveDraftWithAi}
                disabled={
                  sending ||
                  improvingDraft ||
                  !selectedPhone ||
                  String(draft || '').trim().length <= 3
                }
                type="button"
                title={improvingDraft ? 'Melhorando…' : 'Melhorar texto com IA (usa o contexto da conversa)'}
                aria-label={improvingDraft ? 'Melhorando texto com IA' : 'Melhorar texto com IA'}
                aria-busy={improvingDraft}
              >
                {improvingDraft ? (
                  <Loader2 size={18} className="inbox-improve-spin" aria-hidden />
                ) : (
                  <Sparkles size={18} strokeWidth={2} aria-hidden />
                )}
              </button>
              {draftBeforeImprove != null && (
                <button
                  className="btn btn-outline"
                  style={{ padding: '6px 10px', minHeight: 34 }}
                  onClick={() => {
                    setDraft(String(draftBeforeImprove));
                    setDraftBeforeImprove(null);
                    try {
                      setTimeout(() => textareaRef.current?.focus?.(), 0);
                    } catch {
                      void 0;
                    }
                  }}
                  disabled={sending || improvingDraft}
                  type="button"
                  title="Voltar ao texto antes da melhoria"
                >
                  {'\u21A9'} Desfazer
                </button>
              )}
              <button className="btn btn-primary" onClick={sendManual} disabled={sending || !draft.trim() || !selectedPhone} type="button">
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
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
        <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
          Conversa
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span className="ctx-label" style={{ marginBottom: 0 }}>Telefone</span>
            <span className="navi-ui-count" style={{ textAlign: 'right', wordBreak: 'break-all', color: 'var(--ink)' }}>
              {selectedPhone || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span className="ctx-label" style={{ marginBottom: 0 }}>Status</span>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <span className="ctx-label" style={{ marginBottom: 0 }}>Transferido para</span>
              <span className="navi-ui-count" style={{ textAlign: 'right', color: 'var(--ink)' }}>
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
          {canConfigureAgenteIa && (
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={openPromptSettings} type="button">
              Configurar IA
            </button>
          )}
        </div>
      </div>

      <ConversationNotesPanel academyId={academyId} conversationId={conversationIdForFlags} addToast={addToast} />

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
            <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
              Contato / Lead
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900, lineHeight: '20px' }}>{name || phone || '—'}</div>
              {!!phone && (
                <div className="navi-subtitle" style={{ marginTop: 0 }}>
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
                    ðŸ”¥ quente
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
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', minHeight: 34 }}
                      onClick={() => navigate(`/lead/${encodeURIComponent(String(selected.lead_id))}`)}
                      type="button"
                    >
                      Ver lead
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => navigate('/pipeline')} type="button">
                      Kanban
                    </button>
                  </>
                )}
                {!!lead?.id && (
                  <button
                    className="btn btn-outline"
                    style={{ padding: '6px 10px', minHeight: 34 }}
                    onClick={() => navigate(`/lead/${encodeURIComponent(String(lead.id))}`)}
                    type="button"
                  >
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
          <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
            Converter em lead
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div className="ctx-label" style={{ marginBottom: 6 }}>
                Nome
              </div>
              <input className="input" value={leadNameDraft} onChange={(e) => setLeadNameDraft(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <div className="ctx-label" style={{ marginBottom: 6 }}>
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
          <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
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
          <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
            Resumo
          </div>
          <div className="navi-subtitle" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)', marginTop: 0 }}>{selected.summary.text}</div>
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <div className="navi-section-heading" style={{ fontSize: '0.9rem' }}>
            Fixadas
          </div>
          <span className="navi-ui-count">{pinnedMessages.length}</span>
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
        <div className="navi-section-heading" style={{ fontSize: '1.05rem' }}>Detalhes</div>
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

  return (
    <div className="container" style={{ paddingTop: 18, paddingBottom: 30, maxWidth: '100%', width: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .inbox-msg { border-radius: 12px; padding: 8px; margin: -6px; transition: var(--transition); }
        .inbox-msg.selected { background: var(--v50); outline: 2px solid rgba(91, 63, 191, 0.35); }
        .inbox-msg-actions { opacity: 0; pointer-events: none; transition: var(--transition); }
        .inbox-msg:hover .inbox-msg-actions, .inbox-msg.selected .inbox-msg-actions { opacity: 1; pointer-events: auto; }
        .inbox-menu-overlay { position: fixed; inset: 0; background: var(--overlay-menu); z-index: 80; }
        .inbox-menu-panel { position: fixed; width: 260px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-panel); box-shadow: var(--shadow-lg); overflow: hidden; z-index: 81; }
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
        .inbox-conversation-item.active { box-shadow: inset 3px 0 0 var(--v500); }
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
        @keyframes inbox-improve-spin { to { transform: rotate(360deg); } }
        .inbox-improve-spin { animation: inbox-improve-spin 0.75s linear infinite; }
        @keyframes inbox-slash-pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .inbox-slash-templates {
          position: absolute; left: 0; right: 0; bottom: 100%; margin-bottom: 8px; z-index: 55;
          background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow);
          max-height: 288px; overflow-y: auto; padding: 4px;
          animation: inbox-slash-pop 120ms ease-out;
        }
        .inbox-slash-templates-row {
          width: 100%; text-align: left; padding: 8px 10px; border: none; border-radius: 6px;
          background: transparent; cursor: pointer; font: inherit; color: var(--text);
          display: block; box-sizing: border-box;
        }
        .inbox-slash-templates-row:hover, .inbox-slash-templates-row.active { background: rgba(91, 63, 191, 0.08); }
        .agent-header { margin-bottom: 24px; }
        .agent-subtitle { color: var(--text-muted); font-size: 14px; margin: 0; line-height: 1.45; }
        .agent-toggle-block {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .agent-toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .agent-toggle-label { font-weight: 600; font-size: 15px; color: var(--text); }
        .agent-toggle-hint {
          font-size: 13px;
          color: var(--text-muted);
          margin: 8px 0 0;
          padding: 8px 12px;
          background: var(--surface-hover, var(--v50));
          border-radius: 8px;
          border-left: 3px solid var(--warning);
          line-height: 1.45;
        }
        .agent-toggle-hint strong { color: var(--text); font-weight: 700; }
        .agent-toggle-btn {
          min-height: 36px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface-hover);
          color: var(--text);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }
        .agent-toggle-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .agent-toggle-btn.active {
          background: var(--purple);
          color: #fff;
          border-color: var(--purple);
        }
        .agent-instructions-panel {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          padding: 16px;
          margin-bottom: 24px;
        }
        .agent-field { margin-bottom: 16px; }
        .agent-field label {
          display: block;
          font-weight: 600;
          margin-bottom: 6px;
          font-size: 14px;
        }
        .agent-field-textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          resize: vertical;
          font-family: inherit;
        }
        .agent-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 16px;
        }
        .agent-actions-right { display: flex; gap: 8px; flex-wrap: wrap; }
        .unsaved-indicator { color: var(--warning); font-size: 13px; font-weight: 600; }
        .agent-accordion {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 24px;
          background: var(--surface);
        }
        .agent-accordion summary { cursor: pointer; font-weight: 600; font-size: 14px; }
        .agent-accordion-content { margin-top: 14px; }
        .agent-warning { color: var(--danger); font-size: 13px; margin: 8px 0 0; line-height: 1.45; }
        .agent-info { color: var(--text-muted); font-size: 13px; margin: 8px 0 0; line-height: 1.45; }
        .agent-field-hint { color: var(--text-muted); font-size: 13px; margin: 0 0 8px; line-height: 1.45; }
        .agent-instructions-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .wizard-agente-overlay {
          position: fixed;
          inset: 0;
          z-index: 2100;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .wizard-agente-panel {
          width: min(560px, 100%);
          max-height: min(90vh, 820px);
          overflow: auto;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          box-shadow: var(--shadow-lg);
        }
        .wizard-agente-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
        .wizard-agente-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        .wizard-agente-checks, .wizard-agente-radios { display: flex; flex-wrap: wrap; gap: 12px 16px; }
        .wizard-agente-radios--col { flex-direction: column; align-items: flex-start; }
        .wizard-agente-check { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
        .agent-field-label-block { display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px; }
      ` }} />

      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div>
          <h2 className="navi-page-title" style={{ margin: 0 }}>Atendimento</h2>
          <div className="navi-eyebrow" style={{ marginTop: 6 }}>
            {loading ? (
              'Carregando…'
            ) : (
              <>
                <span className="navi-ui-count">{items.length}</span> conversas
                {lastUpdatedAt ? (
                  <>
                    {' '}
                    • atualizado <span className="navi-ui-date">{formatWhen(lastUpdatedAt)}</span>
                  </>
                ) : null}
              </>
            )}
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
              <span
                className="text-small"
                style={{
                  background: 'var(--inbox-info-badge-bg)',
                  color: 'var(--inbox-info-badge-fg)',
                  padding: '2px 8px',
                  borderRadius: 999
                }}
                title="Conversas transferidas"
              >
                Transferidas: {Number(stats.transferredCount)}
              </span>
            )}
          </div>
        </div>
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
              type="button"
            >
              <span style={{ fontSize: 14 }}>↻</span>
              {autoRefresh ? 'Ao vivo' : 'Pausado'}
            </button>
            <button
              className={desktopNotify ? 'btn btn-secondary' : 'btn btn-outline'}
              onClick={() => void toggleDesktopNotifyPreference()}
              title={
                desktopNotify
                  ? 'Alertas do sistema ativos (notificação do Windows/macOS)'
                  : 'Ativar notificação do sistema ao receber mensagem (além do aviso no app)'
              }
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              type="button"
            >
              {desktopNotify ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
              Alertas
            </button>
          </div>
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
                      const block = buildQuotedForwardBlock(contentRaw);
                      setDraft((prev) => {
                        const p = String(prev || '');
                        const prefix = p.trim() ? `${p}\n\n` : '';
                        return `${prefix}${block}`;
                      });
                      closeMenu();
                      setTimeout(() => {
                        const ta = textareaRef.current;
                        if (!ta) return;
                        ta.focus();
                        const end = ta.value.length;
                        ta.setSelectionRange(end, end);
                      }, 0);
                    }}
                  >
                    Encaminhar
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Cita no rascunho
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item"
                    type="button"
                    onClick={() => {
                      void toggleMsgFlag(phone, key, 'pinned');
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
                      void toggleMsgFlag(phone, key, 'important');
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
                  <span
                    style={{ display: 'block' }}
                    title={!canCancel || !mid ? 'Só é possível excluir mensagens agendadas' : undefined}
                  >
                    <button
                      className={`inbox-menu-item ${canCancel ? 'danger' : 'muted'}`}
                      type="button"
                      disabled={!canCancel || !mid}
                      onClick={() => {
                        if (canCancel && mid) cancelScheduledMessage(mid);
                        closeMenu();
                      }}
                      style={{ width: '100%' }}
                    >
                      Excluir
                      <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                        {canCancel ? 'Cancela agendamento' : '—'}
                      </span>
                    </button>
                  </span>
                </>
              );
            })()}

            {menu.kind === 'thread' && (() => {
              const payload = menu.payload && typeof menu.payload === 'object' ? menu.payload : {};
              const phone = String(payload.phone || '').trim();
              const hasLead = Boolean(String(selected?.lead_id || '').trim());
              const listArr = Array.isArray(items) ? items : [];
              const listRow = listArr.find((row) => String(row?.phone_number || '').trim() === phone);
              const isConvArchived = Boolean(listRow?.archived || selected?.archived);
              const threadUnread = Number.isFinite(Number(listRow?.unread_count))
                ? Number(listRow.unread_count)
                : 0;
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
                  {listFilter !== 'archived' && !isConvArchived && (
                    <button
                      className="inbox-menu-item"
                      type="button"
                      onClick={() => {
                        void archiveConversation(phone);
                      }}
                      disabled={!phone}
                    >
                      Arquivar
                      <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                        Inbox
                      </span>
                    </button>
                  )}
                  {(listFilter === 'archived' || isConvArchived) && (
                    <button
                      className="inbox-menu-item"
                      type="button"
                      onClick={() => {
                        void unarchiveConversation(phone);
                      }}
                      disabled={!phone}
                    >
                      Desarquivar
                      <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                        Inbox
                      </span>
                    </button>
                  )}
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
                  {threadUnread === 0 && (
                    <button
                      className="inbox-menu-item"
                      type="button"
                      onClick={() => {
                        void markUnread(phone);
                      }}
                      disabled={!phone}
                    >
                      Marcar como não lida
                      <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                        Lista
                      </span>
                    </button>
                  )}
                  {canConfigureAgenteIa && (
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
                  )}
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
                      navigate(`/lead/${encodeURIComponent(String(selected.lead_id))}`);
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
          style={{ position: 'fixed', zIndex: 70, inset: 0, background: 'rgba(18,16,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
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

      {conversationSheet && isMobile && (() => {
        const it = conversationSheet.item;
        const phone = String(it?._phone || it?.phone_number || '').trim();
        const title = String(it?._displayTitle || phone || 'Conversa');
        if (!phone) return null;
        return (
          <div
            style={{
              position: 'fixed',
              zIndex: 72,
              inset: 0,
              background: 'rgba(18,16,42,0.45)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
            onClick={() => setConversationSheet(null)}
            role="presentation"
          >
            <div
              style={{
                width: '100%',
                maxWidth: 560,
                background: 'var(--surface)',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                border: '1px solid var(--border)',
                borderBottom: 'none',
                padding: '12px 16px 20px',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--border)', margin: '0 auto 14px' }} aria-hidden />
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', minHeight: 44 }}
                onClick={() => {
                  void markUnread(phone);
                }}
              >
                Marcar como não lida
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', minHeight: 44, marginTop: 8 }}
                onClick={() => setConversationSheet(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        );
      })()}


      {error && (
        <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: 10, borderRadius: 10, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {
                isMobile ? (
                  <div className="inbox-mobile-split">
                    <div
                      className="inbox-mobile-list-slot"
                      style={{ display: selectedPhone ? 'none' : 'block' }}
                      aria-hidden={selectedPhone ? true : undefined}
                    >
                      {listPanel}
                    </div>
                    <div
                      className="inbox-mobile-thread-slot"
                      style={{ display: selectedPhone ? 'block' : 'none' }}
                      aria-hidden={!selectedPhone ? true : undefined}
                    >
                      {threadPanel}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      gridTemplateColumns: contextPanelVisible ? `${listWidth}px 10px minmax(0, 1.3fr) minmax(280px, 320px)` : `${listWidth}px 10px minmax(0, 1fr)`,
                      gap: 0,
                      alignItems: 'start'
                    }}
                  >
                    <div
                      style={{
                        paddingRight: 10,
                        minWidth: 0,
                        position: 'sticky',
                        top: 0,
                        alignSelf: 'start',
                        maxHeight: 'calc(100dvh - 108px)',
                        minHeight: 0,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 2
                      }}
                    >
                      {listPanel}
                    </div>
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
                        flexDirection: 'column',
                        alignItems: 'center',
                        alignSelf: 'stretch'
                      }}
                      title="Arraste para ajustar a largura"
                    >
                      <div style={{ width: 2, flex: 1, minHeight: 200, background: 'var(--border)', borderRadius: 999 }} />
                    </div>
                    <div style={{ paddingLeft: 10, paddingRight: contextPanelVisible ? 10 : 0, minWidth: 0 }}>{threadPanel}</div>
                    {contextPanelVisible && <div style={{ paddingLeft: 10 }}>{contextPanel}</div>}
                  </div>
                )
      }
    </div>
  );
}