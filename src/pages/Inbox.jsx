import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { account, realtime, teams, CONVERSATIONS_COL, DB_ID, databases, ACADEMIES_COL } from '../lib/appwrite';
import { membershipPrimaryLabel } from '../lib/teamMembershipLabel.js';
import { humanHandoffUntilToMs } from '../../lib/humanHandoffUntil.js';
import { getThreadHandoffBanner, getThreadHandoffPill } from '../../lib/inboxHandoffPresentation.js';
import { AGENT_HISTORY_WINDOW, getHumanHandoffHoursForClient } from '../../lib/constants.js';
import {
  WHATSAPP_TEMPLATE_LABELS,
  applyWhatsappTemplatePlaceholders,
} from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../store/useUiStore';
import { useToast } from '../hooks/useToast';
import { LEAD_STATUS, useLeadStore } from '../store/useLeadStore';
import { useUserRole } from '../lib/useUserRole';
import { useTerms, contactLabelSingular } from '../lib/terminology.js';
import { friendlyError } from '../lib/errorMessages';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { useZapsterWhatsAppConnection } from '../hooks/useZapsterWhatsAppConnection';
import { Bell, BellOff, User, X, Zap } from 'lucide-react';
import InboxListPanel from '../components/inbox/InboxListPanel';
import InboxContextPanel, { InboxContextPanelContent } from '../components/inbox/InboxContextPanel';
import InboxThreadPanel from '../components/inbox/InboxThreadPanel';
import InboxImageLightbox from '../components/inbox/InboxImageLightbox.jsx';
import { uploadInboxMedia, InboxMediaUploadError } from '../lib/uploadInboxMedia.js';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import SearchField from '../components/shared/SearchField.jsx';
import StatusBanner from '../components/shared/StatusBanner.jsx';
const EMPTY_ACADEMY_LIST = [];

const COMPOSER_EXPANDED_STORAGE_KEY = 'nave_composer_expanded';
const MINHA_FILA_STORAGE_KEY = 'nave_inbox_minha_fila';
/** Filtro inicial da lista — fila completa (Todos), não "Precisa de mim". */
const DEFAULT_INBOX_LIST_FILTER = 'all';
const MAX_INBOX_LIST_ITEMS = 150;

/** Mantém no máximo MAX_INBOX_LIST_ITEMS; preserva conversa selecionada se sair da janela. */
function capInboxListItems(items, selectedPhone) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= MAX_INBOX_LIST_ITEMS) return list;
  const selected = String(selectedPhone || '').trim();
  let trimmed = list.slice(-MAX_INBOX_LIST_ITEMS);
  if (selected) {
    const selectedItem = list.find((it) => String(it?.phone_number || '').trim() === selected);
    if (selectedItem) {
      const inTrimmed = trimmed.some(
        (it) => String(it?.phone_number || '').trim() === selected
      );
      if (!inTrimmed) {
        trimmed = [selectedItem, ...trimmed.slice(0, MAX_INBOX_LIST_ITEMS - 1)];
      }
    }
  }
  return trimmed;
}

function readMinhaFilaFromStorage() {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(MINHA_FILA_STORAGE_KEY);
    if (v === null) return false;
    return v === '1' || String(v).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

function readComposerExpandedFromStorage() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COMPOSER_EXPANDED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

function pickDisplayName({ leadName = '', manualContactName = '', whatsappProfileName = '', phone = '' }) {
  const lead = String(leadName || '').trim();
  if (lead) return lead;
  const manual = String(manualContactName || '').trim();
  if (manual) return manual;
  const wa = String(whatsappProfileName || '').trim();
  if (wa) return wa;
  return formatPhone(String(phone || '').trim()) || '-';
}

function isInboxDebugEnabled() {
  const envEnabled =
    import.meta.env.DEV ||
    ['1', 'true', 'yes'].includes(String(import.meta.env.VITE_INBOX_DEBUG || '').trim().toLowerCase());
  if (envEnabled) return true;
  if (typeof window === 'undefined') return false;
  try {
    const local = String(window.localStorage?.getItem('inbox_debug') || '').trim().toLowerCase();
    return local === '1' || local === 'true' || local === 'yes';
  } catch {
    return false;
  }
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

/** Rótulo curto para a lista: “Agora”, “Há N min”, horário no dia, “Ontem”, data. */
function formatListActivityLabel(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = now.getTime() - d.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return 'Agora';
  if (diffMs >= 60_000 && diffMs < 3600_000) {
    const m = Math.floor(diffMs / 60_000);
    return `Há ${m} min`;
  }
  if (startOfMsg.getTime() === startOfToday.getTime()) {
    const t = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `hoje ${t}`;
  }
  const yesterday = new Date(startOfToday);
  yesterday.setDate(yesterday.getDate() - 1);
  if (startOfMsg.getTime() === yesterday.getTime()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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

function inboxMessageMediaUrl(m) {
  if (!m || typeof m !== 'object') return '';
  const nested = m.media && typeof m.media === 'object' ? String(m.media.url || '').trim() : '';
  const u = String(m.mediaUrl || m.media_url || m.url || nested || '').trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return '';
}

function inboxContentIsAudioPlaceholder(content) {
  const s = String(content || '').trim();
  return /🎵\s*\[Áudio recebido\]|\[Áudio recebido\]/i.test(s);
}

export default function Inbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
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

  useEffect(() => {
    const teamId = String(academyDoc?.teamId || '').trim();
    if (!teamId) {
      setTeamMembers([]);
      return undefined;
    }
    let cancelled = false;
    teams
      .listMemberships(teamId)
      .then((res) => {
        if (cancelled) return;
        const rows = (res.memberships || []).filter((m) => String(m?.joined || '').trim());
        setTeamMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [academyDoc?.teamId]);
  const role = useUserRole(academyDoc);
  const canConfigureAgenteIa = role === 'owner' || role === 'member';
  const { waInfo, waStatus, waSyncing, reconcileWhatsAppHistory } = useZapsterWhatsAppConnection(academyId, {
    statusPollWhileMounted: true,
    watchAcademyStatus: true
  });
  const terms = useTerms();
  const labels = useLeadStore((s) => s.labels);
  const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);

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
  const [cancelConfirmMsgId, setCancelConfirmMsgId] = useState('');
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const autoRefresh = true;
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
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
  const [composerExpanded, setComposerExpanded] = useState(() => readComposerExpandedFromStorage());

  const [listFilter, setListFilter] = useState(DEFAULT_INBOX_LIST_FILTER);
  const [minhaFilaOn, setMinhaFilaOn] = useState(() => readMinhaFilaFromStorage());
  const [handoffReleaseHint, setHandoffReleaseHint] = useState(false);
  const listFilterRef = useRef(DEFAULT_INBOX_LIST_FILTER);
  const prevListFilterForReloadRef = useRef(null);
  const [extraFiltersMenuOpen, setExtraFiltersMenuOpen] = useState(false);
  const listExtraFiltersRef = useRef(null);
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
  const [transferToDraft, setTransferToDraft] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [leadNameDraft, setLeadNameDraft] = useState('');
  const [contactNameDraft, setContactNameDraft] = useState('');
  const [editingContactName, setEditingContactName] = useState(false);
  const [savingContactName, setSavingContactName] = useState(false);
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
  const { templates: whatsappTemplatesHook, academyName: academyNameForTemplates } = useWhatsappTemplates(academyId);
  const whatsappTemplatesObj = whatsappTemplatesHook || null;
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadPaging, setThreadPaging] = useState(false);
  const [threadCursor, setThreadCursor] = useState(null);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [ticketUpdating, setTicketUpdating] = useState(false);
  const [contextOpen, setContextOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem('inbox_context_open');
    if (raw === '0') return false;
    if (raw === '1') return true;
    return true;
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [imageLightboxUrl, setImageLightboxUrl] = useState('');
  /** Mobile: bottom sheet após long press na lista (só ação "marcar não lida" quando aplicável). */
  const [conversationSheet, setConversationSheet] = useState(null);
  const [selectedMsgKey, setSelectedMsgKey] = useState('');
  const [expandedMsgs, setExpandedMsgs] = useState({});
  const [threadAtBottom, setThreadAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [msgFlags, setMsgFlags] = useState({});

  useEffect(() => {
    const url = String(imageLightboxUrl || '').trim();
    if (!url) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setImageLightboxUrl('');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [imageLightboxUrl]);

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
  const handoffExpiryToastRef = useRef('');
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
  const loadingListRef = useRef(false);
  const threadAbortRef = useRef(null);
  const threadRequestSeqRef = useRef(0);
  const realtimeTimersRef = useRef({ list: null, thread: null });
  const academyIdRef = useRef('');
  const prevAcademyIdForInboxRef = useRef('');
  const inboxAutoSelectDoneRef = useRef(false);
  const handleSelectConversationRef = useRef(() => {});
  const markSeenRef = useRef(null);
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
    const untilMs = humanHandoffUntilToMs(selected?.human_handoff_until);
    if (!selected?.need_human || untilMs <= 0) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [selected?.need_human, selected?.human_handoff_until]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    const untilMs = humanHandoffUntilToMs(selected?.human_handoff_until);
    if (!phone || !selected?.need_human || untilMs <= 0) {
      handoffExpiryToastRef.current = '';
      return;
    }
    if (untilMs > nowMs) return;
    const key = `${phone}:${untilMs}`;
    if (handoffExpiryToastRef.current === key) return;
    handoffExpiryToastRef.current = key;
    toast.warning('Tempo do atendimento manual acabou. A IA pode retomar neste atendimento.');
  }, [toast, nowMs, selected?.human_handoff_until, selected?.need_human, selectedPhone]);

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
    try {
      window.localStorage.setItem(COMPOSER_EXPANDED_STORAGE_KEY, composerExpanded ? '1' : '0');
    } catch {
      void 0;
    }
  }, [composerExpanded]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MINHA_FILA_STORAGE_KEY, minhaFilaOn ? '1' : '0');
    } catch {
      void 0;
    }
  }, [minhaFilaOn]);

  useEffect(() => {
    if (listFilter === 'my_queue') setListFilter('needs_me');
  }, [listFilter]);

  useEffect(() => {
    if (composerExpanded) return;
    setTemplatesOpen(false);
    setEmojiOpen(false);
  }, [composerExpanded]);

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
      } catch {
        void 0;
      }
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

  const [inboxThreadNarrow767, setInboxThreadNarrow767] = useState(false);
  const [showInboxKeyHints, setShowInboxKeyHints] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setInboxThreadNarrow767(Boolean(mq.matches));
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
    const mq = window.matchMedia('(min-width: 769px)');
    const apply = () => setShowInboxKeyHints(Boolean(mq.matches));
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
      toast.success('Copiado');
      return true;
    } catch (e) {
      toast.error(e, 'action');
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
        if (t === 'pinned') {
          toast.success('Mensagem fixada');
        } else {
          toast.success('Marcada como importante');
        }
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
        if (t === 'pinned') {
          toast.success('Mensagem desfixada');
        } else {
          toast.success('Importante removido');
        }
      }
    } catch (e) {
      toast.error(e, 'action');
    }
  }

  function openMenu(kind, anchorEl, payload) {
    const el = anchorEl && anchorEl.getBoundingClientRect ? anchorEl : null;
    const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const pad = 8;
    const menuW = 260;
    const menuH = String(kind || '').trim() === 'message' ? 300 : 360;
    let x;
    if (String(kind || '').trim() === 'message') {
      x = rect.right - menuW;
    } else {
      x = rect.left;
    }
    x = Math.max(pad, Math.min(x, vw - menuW - pad));
    let y = rect.bottom + 6;
    if (y + menuH > vh - pad) {
      y = rect.top - menuH - 6;
    }
    y = Math.max(pad, Math.min(y, vh - menuH - pad));
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
    if (!academyIdRef.current) {
      const message = 'Não foi possível sincronizar: academia não identificada.';
      toast.show({ type: 'error', message });
      setError(message);
      if (isInboxDebugEnabled()) {
        console.warn('[Inbox Realtime] atualizar chat abortado: academyId vazio');
      }
      return;
    }
    setError('');
    const inboxDebugEnabled = isInboxDebugEnabled();
    if (inboxDebugEnabled) {
      console.log('[Inbox Realtime] atualizar chat: início', {
        academyId: String(academyIdRef.current || '').trim(),
        selectedPhone: String(selectedPhoneRef.current || '').trim(),
      });
    }
    await reconcileWhatsAppHistory(async () => {
      await loadList({ reset: true, silent: true });
      const phone = String(selectedPhoneRef.current || '').trim();
      if (phone) await loadThread(phone);
      if (inboxDebugEnabled) {
        console.log('[Inbox Realtime] atualizar chat: lista/thread recarregados', { hasSelectedPhone: Boolean(phone) });
      }
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
      toast.info('Notificações do sistema desativadas.');
      return;
    }
    if (typeof Notification === 'undefined') {
      toast.warning('Este navegador não suporta notificações.');
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      toast.warning('Permissão necessária para notificações do sistema.');
      return;
    }
    try {
      window.localStorage.setItem('inbox_desktop_notify', '1');
    } catch {
      void 0;
    }
    setDesktopNotify(true);
    toast.success('Você receberá notificações quando chegar mensagem.');
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

  /**
   * Marca conversa como lida: unread_count é a fonte do badge na lista (zera só após POST read OK).
   * Notificação desktop usa last_user_msg_at separadamente — não confundir com o contador.
   */
  async function markSeen(phone, { notifySuccess = false } = {}) {
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
      if (notifySuccess) {
        toast.success('Marcado como lida');
      }
    } catch (e) {
      try {
        toast.error(e, 'action');
      } catch {
        void 0;
      }
    }
  }
  markSeenRef.current = markSeen;

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
          const cur = Number.isFinite(Number(it?.unread_count)) ? Number(it.unread_count) : 0;
          return { ...it, unread_count: Math.max(1, cur) };
        });
      });
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== p) return prev;
        return null;
      });
      setSelectedPhone((prevPhone) => (String(prevPhone || '').trim() === p ? '' : prevPhone));
      setConversationSheet(null);
      closeMenu();
      toast.success('Marcado como não lida');
    } catch (e) {
      try {
        toast.error(e, 'action');
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
      if (!silent) toast.success('Conversa desarquivada');
      closeMenu();
      return true;
    } catch (e) {
      try {
        toast.error(e, 'action');
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
      toast.show({
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
        toast.error(e, 'action');
      } catch {
        void 0;
      }
    }
  }

  function openPromptSettings() {
    navigate('/agente-ia');
  }


  useEffect(() => {
    if (!academyId) return;
    const connected = String(waStatus || '').trim() === 'connected';
    if (!connected) return;
    const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'connect_whatsapp')?.done;
    if (done) return;
    void useLeadStore.getState().completeOnboardingStepIds(['connect_whatsapp']);
  }, [waStatus, academyId]);

  async function loadList({ reset = false, silent = false } = {}) {
    if (!academyIdRef.current) return;
    if (reset && loadingListRef.current) return;
    if (reset) {
      setNextCursor(null);
      setHasMore(true);
    }
    if (!reset && (!hasMore || loadingMore || loading)) return;
    if (!silent) setError('');
    loadingListRef.current = true;
    if (reset && !silent) setLoading(true);
    else if (!reset) setLoadingMore(true);
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
        return capInboxListItems(deduped, selectedPhoneRef.current);
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
          const name = pickDisplayName({
            leadName: it?.lead_name,
            manualContactName: it?.contact_name,
            whatsappProfileName: it?.whatsapp_profile_name,
            phone
          });
          playNotificationSound();
          setHighlightedPhone(phone);
          toast.show({
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
      if (!silent) setError(friendlyError(e, 'load'));
    } finally {
      loadingListRef.current = false;
      if (reset && !silent) setLoading(false);
      else if (!reset) setLoadingMore(false);
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
          contact_name: typeof data?.contact_name === 'string' ? data.contact_name : '',
          contact_name_source: typeof data?.contact_name_source === 'string' ? data.contact_name_source : '',
          whatsapp_profile_name: typeof data?.whatsapp_profile_name === 'string' ? data.whatsapp_profile_name : '',
          whatsapp_profile_image_url:
            typeof data?.whatsapp_profile_image_url === 'string' ? data.whatsapp_profile_image_url : '',
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
      if (!silent) setError(friendlyError(e, 'load'));
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

    const inboxDebugEnabled = isInboxDebugEnabled();
    const devLog = inboxDebugEnabled
      ? (...args) => {
          console.log(...args);
        }
      : () => {};

    if (!DB_ID || !CONVERSATIONS_COL) {
      if (inboxDebugEnabled) {
        console.warn('[Inbox Realtime] DB_ID ou CONVERSATIONS_COL vazio — subscription não criada');
      }
      return;
    }

    const channel = `databases.${DB_ID}.collections.${CONVERSATIONS_COL}.documents`;
    if (inboxDebugEnabled) {
      console.group('[Inbox Realtime] setup');
      devLog('DB_ID:', DB_ID);
      devLog('CONVERSATIONS_COL:', CONVERSATIONS_COL);
      devLog('academyId (ref):', academyIdRef.current || '(vazio)');
      devLog('canal:', channel);
      console.groupEnd();
    }

    const cancelledRef = { current: false };
    let subscription = null;
    let subscribeTimer = null;

    const onRealtimeEvent = (ev) => {
      if (cancelledRef.current) return;
      const payload = ev && typeof ev === 'object' ? ev.payload : null;
      const academy =
        payload && typeof payload === 'object'
          ? String(payload.academy_id ?? payload.academyId ?? '').trim()
          : '';
      const expected = String(academyIdRef.current || '').trim();
      const phone =
        payload && typeof payload === 'object' ? String(payload.phone_number || '').trim() : '';
      const selectedNow = String(selectedPhoneRef.current || '').trim();

      if (inboxDebugEnabled) {
        console.group('[Inbox Realtime] evento');
        devLog('events:', ev?.events);
        devLog('phone:', phone || '(vazio)');
        devLog('academy payload:', academy || '(vazio)', '| esperado:', expected || '(vazio)');
        console.groupEnd();
      }

      if (academy && expected && academy !== expected) return;

      if (realtimeTimersRef.current?.list) clearTimeout(realtimeTimersRef.current.list);
      realtimeTimersRef.current.list = setTimeout(() => {
        const fn = loadListRef.current;
        if (typeof fn === 'function') void fn({ reset: true, silent: true });
      }, 250);

      if (phone && selectedNow && phone === selectedNow) {
        if (realtimeTimersRef.current?.thread) clearTimeout(realtimeTimersRef.current.thread);
        realtimeTimersRef.current.thread = setTimeout(() => {
          const fn = loadThreadRef.current;
          if (typeof fn === 'function') void fn(phone, { silent: true });
        }, 250);
      }
    };

    subscribeTimer = window.setTimeout(() => {
      if (cancelledRef.current) return;
      void realtime
        .subscribe(channel, onRealtimeEvent)
        .then((sub) => {
          if (cancelledRef.current) {
            void sub?.close?.();
            return;
          }
          subscription = sub;
          setRealtimeOn(true);
          if (inboxDebugEnabled) {
            devLog('[Inbox Realtime] subscrito; close:', typeof sub?.close);
          }
        })
        .catch((e) => {
          if (!cancelledRef.current) {
            console.error('[Inbox Realtime] falha ao subscrever:', e);
            setRealtimeOn(false);
          }
        });
    }, 300);

    return () => {
      cancelledRef.current = true;
      if (subscribeTimer) clearTimeout(subscribeTimer);
      if (inboxDebugEnabled) {
        devLog('[Inbox Realtime] cleanup');
      }
      try {
        if (realtimeTimersRef.current?.list) clearTimeout(realtimeTimersRef.current.list);
        if (realtimeTimersRef.current?.thread) clearTimeout(realtimeTimersRef.current.thread);
      } catch {
        void 0;
      }
      try {
        if (subscription && typeof subscription.close === 'function') void subscription.close();
      } catch {
        void 0;
      }
      setRealtimeOn(false);
    };
  }, []);

  /** Fallback poll: 60s com Realtime ok; backoff quando aba inativa (visibilitychange). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!DB_ID || !CONVERSATIONS_COL) return;
    let hidden = document.visibilityState === 'hidden';
    let delayMs = realtimeOn ? 60000 : 28000;
    let timer = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (!academyIdRef.current) {
          schedule();
          return;
        }
        const fn = loadListRef.current;
        if (typeof fn === 'function') await fn({ reset: true, silent: true });
        delayMs = hidden ? Math.min(delayMs * 2, 300000) : realtimeOn ? 60000 : 28000;
        schedule();
      }, delayMs);
    };
    const onVis = () => {
      hidden = document.visibilityState === 'hidden';
      if (!hidden) delayMs = realtimeOn ? 60000 : 28000;
      schedule();
    };
    document.addEventListener('visibilitychange', onVis);
    schedule();
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (timer) window.clearTimeout(timer);
    };
  }, [realtimeOn]);

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
        const msg = String(raw || '').trim()
          ? normalizeApiError(raw, 'Falha ao atualizar o modo de atendimento')
          : `Falha ao atualizar o modo de atendimento (HTTP ${resp.status})`;
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
      if (!silent) {
        toast.show({
          type: 'success',
          message: ativo ? 'Você assumiu esta conversa' : 'IA reativada',
        });
      }
      if (!ativo) setHandoffReleaseHint(false);
      return true;
    } catch (e) {
      if (!silent) setError(friendlyError(e, 'load'));
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

  async function sendManual({ file, mediaUrl: mediaUrlArg, mimeType: mimeTypeArg, caption: captionArg, fileName: fileNameArg } = {}) {
    const phone = String(selectedPhone || '').trim();
    const text = String(draft || '').trim();
    const caption = String(captionArg ?? '').trim();
    let mediaUrl = String(mediaUrlArg || '').trim();
    let mimeType = String(mimeTypeArg || '').trim();
    let fileName = String(fileNameArg || '').trim();

    if (!phone || (!text && !caption && !mediaUrl && !file)) return;
    if (file && scheduleOn) {
      toast.show({ type: 'error', message: 'Agendamento não está disponível para envio de mídia.' });
      return;
    }
    setError('');
    setSending(true);
    try {
      if (file) {
        try {
          const uploaded = await uploadInboxMedia(file);
          mediaUrl = uploaded.mediaUrl;
          mimeType = uploaded.mimeType;
          fileName = uploaded.fileName;
        } catch (e) {
          if (e instanceof InboxMediaUploadError) {
            if (e.code === 'too_large') toast.show({ type: 'error', message: 'Arquivo muito grande. Máximo: 16MB.' });
            else if (e.code === 'unsupported') toast.show({ type: 'error', message: 'Tipo de arquivo não suportado.' });
            else toast.show({ type: 'error', message: e.message || 'Erro ao enviar arquivo.' });
          } else {
            toast.show({ type: 'error', message: 'Erro ao enviar arquivo. Tente novamente.' });
          }
          return;
        }
      }
      const sendAtIso = scheduleOn && !mediaUrl ? toIsoFromLocalDatetime(scheduleAtLocal) : '';
      if (scheduleOn && !mediaUrl && !sendAtIso) {
        toast.show({ type: 'error', message: 'Escolha data e hora para agendar' });
        return;
      }
      if (scheduleOn && !mediaUrl && sendAtIso) {
        const sendMs = new Date(sendAtIso).getTime();
        if (!Number.isFinite(sendMs) || sendMs <= Date.now()) {
          toast.show({ type: 'error', message: 'Selecione um horário posterior ao atual para agendar.' });
          return;
        }
      }
      const shouldAssume = !selected?.need_human;
      if (shouldAssume) {
        await setHandoffActive(true);
      }
      const jwt = await getJwt();
      const body = mediaUrl
        ? {
            phone,
            mediaUrl,
            mimeType: mimeType || 'image/jpeg',
            caption: caption || text,
            ...(fileName ? { fileName } : {})
          }
        : { phone, text, ...(sendAtIso ? { send_at: sendAtIso } : {}) };
      const resp = await fetch('/api/whatsapp?action=send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao enviar'));
      const data = safeParseJson(raw) || {};
      const waUrl = typeof data?.wa_me_url === 'string' ? data.wa_me_url.trim() : '';
      if (String(data?.channel || '').trim() === 'wa_me' && waUrl) {
        try {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        } catch {
          void 0;
        }
      }
      const status = String(data?.status || '').trim();
      const sendAt = typeof data?.send_at === 'string' ? data.send_at : null;
      const msgId = typeof data?.message_id === 'string' ? data.message_id : null;
      const nowIso = new Date().toISOString();
      const mime = mimeType || '';
      const mediaType = mime.startsWith('image/')
        ? 'image'
        : mime.startsWith('audio/')
          ? 'audio'
          : mediaUrl
            ? 'document'
            : '';
      const displayContent =
        caption ||
        text ||
        (mediaType === 'image'
          ? '[imagem]'
          : mediaType === 'audio'
            ? '🎵 [Áudio enviado]'
            : mediaType === 'document'
              ? '📄 [Documento enviado]'
              : '');
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages.slice() : [];
        msgs.push({
          role: 'assistant',
          content: displayContent,
          timestamp: nowIso,
          sender: 'human',
          ...(status ? { status } : {}),
          ...(sendAt ? { send_at: sendAt } : {}),
          ...(msgId ? { message_id: msgId } : {}),
          ...(mediaUrl
            ? {
                type: mediaType,
                mediaUrl,
                mimeType: mime || null,
                media_stored: true,
                ...(mediaType === 'document' && fileName ? { fileName } : {})
              }
            : {})
        });
        return { ...prev, messages: msgs.slice(-AGENT_HISTORY_WINDOW) };
      });
      markSeen(phone);
      setDraft('');
      setDraftBeforeImprove(null);
      setScheduleOn(false);
      setScheduleAtLocal('');
      toast.show({
        type: 'success',
        message:
          String(data?.channel || '').trim() === 'wa_me'
            ? 'Sem instância API: abrimos o WhatsApp para você concluir o envio.'
            : status === 'scheduled'
              ? 'Agendado'
              : mediaUrl
                ? 'Mídia enviada'
                : 'Enviado'
      });
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
      setError(friendlyError(e, 'action'));
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
      toast.success('Texto atualizado — revise antes de enviar');
      try {
        setTimeout(() => textareaRef.current?.focus?.(), 0);
      } catch {
        void 0;
      }
    } catch (e) {
      setError(friendlyError(e, 'action'));
    } finally {
      setImprovingDraft(false);
    }
  }

  function cancelScheduledMessage(messageId) {
    const mid = String(messageId || '').trim();
    if (!mid || cancelingMsgId) return;
    setCancelConfirmMsgId(mid);
  }

  async function runCancelScheduledMessage() {
    const phone = String(selectedPhoneRef.current || '').trim();
    const mid = String(cancelConfirmMsgId || '').trim();
    if (!phone || !mid) return;
    setCancelConfirmMsgId('');
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
      toast.success('Agendamento cancelado');
      await loadList({ reset: true, silent: true });
    } catch (e) {
      toast.error(e, 'action');
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
      toast.success(`${contactLabel} associado`);
      setLeadPanel(null);
      setLeadSearch('');
    } catch (e) {
      setError(friendlyError(e, 'action'));
    } finally {
      setLinkingLead(false);
    }
  }

  async function saveContactName() {
    const phone = String(selectedPhoneRef.current || '').trim();
    if (!phone || savingContactName) return;
    const nextName = String(contactNameDraft || '').trim();
    setSavingContactName(true);
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
        body: JSON.stringify({ action: 'set_contact_name', contact_name: nextName })
      });
      if (blocked) return;
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao salvar nome do contato'));
      const data = safeParseJson(raw) || {};
      const savedName = String(data?.contact_name || '').trim();
      const savedSource = String(data?.contact_name_source || '').trim();
      const waProfileName = String(data?.whatsapp_profile_name || '').trim();
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        return {
          ...prev,
          contact_name: savedName,
          contact_name_source: savedSource || (savedName ? 'manual' : ''),
          whatsapp_profile_name: waProfileName || prev.whatsapp_profile_name || ''
        };
      });
      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((it) => {
          const rowPhone = String(it?.phone_number || '').trim();
          if (rowPhone !== phone) return it;
          return {
            ...it,
            contact_name: savedName,
            contact_name_source: savedSource || (savedName ? 'manual' : ''),
            whatsapp_profile_name: waProfileName || String(it?.whatsapp_profile_name || '').trim()
          };
        })
      );
      setEditingContactName(false);
      toast.show({ type: 'success', message: savedName ? 'Nome do contato salvo' : 'Nome do contato removido' });
    } catch (e) {
      setError(friendlyError(e, 'save'));
    } finally {
      setSavingContactName(false);
    }
  }

  async function convertToLead() {
    const phone = String(selectedPhoneRef.current || '').trim();
    const name =
      String(leadNameDraft || '').trim() ||
      pickDisplayName({
        leadName: selected?.lead_name,
        manualContactName: selected?.contact_name,
        whatsappProfileName: selected?.whatsapp_profile_name,
        phone
      });
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
      toast.show({
        type: 'success',
        message: data?.ja_existe ? `${contactLabel} já existente` : `${contactLabel} criado`,
      });
      navigate(`/lead/${encodeURIComponent(leadId)}`);
    } catch (e) {
      setError(friendlyError(e, 'action'));
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
      inboxAutoSelectDoneRef.current = false;
    }
    prevAcademyIdForInboxRef.current = cur;
    const fn = loadListRef.current;
    if (typeof fn === 'function') void fn({ reset: true });
  }, [academyId]);

  useEffect(() => {
    if (selectedPhone) loadThread(selectedPhone);
  }, [selectedPhone]);

  useEffect(() => {
    setEditingContactName(false);
    setSavingContactName(false);
    setContactNameDraft('');
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
      const leadName = String(lead?.name || '').trim() || String(it?.lead_name || '').trim();
      const manualContactName = String(it?.contact_name || '').trim();
      const waProfileName = String(it?.whatsapp_profile_name || '').trim();
      const waProfileImageUrl = String(it?.whatsapp_profile_image_url || '').trim();
      const displayTitle = pickDisplayName({ leadName, manualContactName, whatsappProfileName: waProfileName, phone });
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
        _displaySubtitle: displayTitle && phone && displayTitle !== phone ? phone : '',
        _leadName: leadName,
        _manualContactName: manualContactName,
        _waProfileName: waProfileName,
        _profileImageUrl: waProfileImageUrl,
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
        _hasLinkedLead: Boolean(String(it?.lead_id || '').trim()),
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
    const normTicket = (it) =>
      String(it?._ticketStatus ?? it?.ticket_status ?? '')
        .trim()
        .toLowerCase();
    const unreadN = (it) => {
      const n = Number(it?._unreadCount ?? it?.unread_count ?? 0);
      return Number.isFinite(n) ? n : 0;
    };
    const applyLabel = (rows) => {
      if (!labelFilter) return rows;
      return rows.filter((it) => {
        const ids = it?._lead?.labelIds;
        return Array.isArray(ids) && ids.includes(labelFilter);
      });
    };

    if (minhaFilaOn || listFilter === 'needs_me') {
      return applyLabel(arr.filter((it) => Boolean(it?._handoffActive) && unreadN(it) > 0));
    }

    const f = String(listFilter || 'all');
    let result = arr;
    if (f === 'archived') result = arr.filter((it) => Boolean(it?.archived));
    else if (f === 'unread') result = arr.filter((it) => unreadN(it) > 0);
    else if (f === 'hot') result = arr.filter((it) => Boolean(it?._hotLead));
    else if (f === 'need_human') result = arr.filter((it) => Boolean(it?._handoffActive));
    else if (f === 'waiting_customer') result = arr.filter((it) => normTicket(it) === 'waiting_customer');
    else if (f === 'resolved') result = arr.filter((it) => normTicket(it) === 'resolved');
    else if (f === 'transferred') result = arr.filter((it) => normTicket(it) === 'transferred');
    result = applyLabel(result);
    if (f === 'all') {
      const updatedMs = (it) => {
        const u = parseTimestampMs(it?.updated_at);
        if (u) return u;
        return parseTimestampMs(it?.last_message_timestamp);
      };
      const unreadRank = (it) => (unreadN(it) > 0 ? 0 : 1);
      result = result.slice().sort((a, b) => {
        const ru = unreadRank(a) - unreadRank(b);
        if (ru !== 0) return ru;
        return updatedMs(b) - updatedMs(a);
      });
    }
    return result;
  }, [prioritizedItems, listFilter, labelFilter, minhaFilaOn]);

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

  const firstVisibleConversation = useMemo(() => {
    const groups = Array.isArray(groupedFilteredItems) ? groupedFilteredItems : [];
    for (const g of groups) {
      const raw = Array.isArray(g?.items) ? g.items : [];
      for (const it of raw) {
        const phone = String(it?._phone || it?.phone_number || '').trim();
        if (phone) return it;
      }
    }
    return null;
  }, [groupedFilteredItems]);

  const flatVisibleConversations = useMemo(() => {
    const groups = Array.isArray(groupedFilteredItems) ? groupedFilteredItems : [];
    const out = [];
    for (const g of groups) {
      const raw = Array.isArray(g?.items) ? g.items : [];
      for (const it of raw) out.push(it);
    }
    return out;
  }, [groupedFilteredItems]);

  const handleSelectConversation = useCallback((it) => {
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
        lead_name: String(it?._leadName || it?.lead_name || '').trim(),
        contact_name: String(it?._manualContactName || it?.contact_name || '').trim(),
        contact_name_source: String(it?.contact_name_source || '').trim(),
        whatsapp_profile_name: String(it?._waProfileName || it?.whatsapp_profile_name || '').trim(),
        whatsapp_profile_image_url: String(it?._profileImageUrl || it?.whatsapp_profile_image_url || '').trim(),
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
      markSeenRef.current?.(phone);
    }
  }, []);

  handleSelectConversationRef.current = handleSelectConversation;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (normalizePhone(String(params.get('phone') || '').trim())) return;
    if (searchQuery) return;
    const curAcademy = String(academyId || '').trim();
    if (!curAcademy) return;
    if (loading) return;
    if (inboxAutoSelectDoneRef.current) return;
    if (String(selectedPhoneRef.current || '').trim()) return;
    const it = firstVisibleConversation;
    if (!it) return;
    inboxAutoSelectDoneRef.current = true;
    handleSelectConversationRef.current(it);
  }, [academyId, loading, firstVisibleConversation, location.search, searchQuery]);

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
      if (s === 'resolved') {
        toast.success('Conversa resolvida');
      } else if (s === 'open') {
        toast.success('Conversa reaberta');
      } else if (s === 'waiting_customer') {
        toast.success('Marcado como aguardando cliente');
      } else if (s === 'transferred') {
        toast.show({
          type: 'success',
          message: nextTransferTo ? `Conversa transferida para ${nextTransferTo}` : 'Conversa transferida',
        });
      }
      return true;
    } catch (e) {
      setError(friendlyError(e, 'action'));
      return false;
    } finally {
      setTicketUpdating(false);
    }
  }

  const confirmTransferConversation = useCallback(async () => {
    const dest = String(transferToDraft || '').trim();
    if (!dest) {
      toast.show({ type: 'error', message: 'Escolha quem vai receber a conversa.' });
      return;
    }
    const ok = await updateTicket({ status: 'transferred', transferTo: dest });
    if (ok) {
      setTransferToDraft('');
      setLeadPanel(null);
    }
  }, [transferToDraft, toast]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (editing) return;

      const flat = flatVisibleConversations;
      const keyOne = e.key.length === 1 ? e.key.toLowerCase() : '';

      if (!e.ctrlKey && !e.metaKey && (keyOne === 'j' || keyOne === 'k') && flat.length) {
        e.preventDefault();
        const cur = String(selectedPhoneRef.current || '').trim();
        let idx = flat.findIndex((it) => String(it?._phone || it?.phone_number || '').trim() === cur);
        if (idx < 0) {
          const pick = keyOne === 'j' ? flat[0] : flat[flat.length - 1];
          if (pick) handleSelectConversationRef.current(pick);
          return;
        }
        const nextIdx = keyOne === 'j' ? Math.min(flat.length - 1, idx + 1) : Math.max(0, idx - 1);
        if (nextIdx !== idx) {
          const pick = flat[nextIdx];
          if (pick) handleSelectConversationRef.current(pick);
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && keyOne === 'r' && selectedPhoneRef.current) {
        e.preventDefault();
        try {
          textareaRef.current?.focus?.();
        } catch {
          void 0;
        }
        return;
      }

      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        keyOne === 'e' &&
        selectedPhoneRef.current &&
        String(selected?.ticket_status || '').trim().toLowerCase() !== 'resolved'
      ) {
        e.preventDefault();
        void updateTicket({ status: 'resolved' });
        return;
      }

      if (!selectedPhoneRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        loadThread(selectedPhoneRef.current);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        void updateTicket({ status: String(selected?.ticket_status || '') === 'resolved' ? 'open' : 'resolved' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flatVisibleConversations, selected?.ticket_status]);

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
    if (!autoRefresh) return undefined;

    const INTERVAL_ACTIVE_LIST_MS = realtimeOn ? 30_000 : 15_000;
    const INTERVAL_ACTIVE_THREAD_MS = realtimeOn ? 15_000 : 15_000;
    const INTERVAL_INACTIVE_MS = 60_000;

    const runListRefresh = () => {
      const fn = loadListRef.current;
      if (typeof fn === 'function') fn({ reset: true, silent: true });
    };

    const runThreadRefresh = () => {
      const phone = selectedPhoneRef.current;
      if (!phone || String(draftRef.current || '').trim()) return;
      const fnThread = loadThreadRef.current;
      if (typeof fnThread === 'function') fnThread(phone, { silent: true });
    };

    const runAutoRefresh = () => {
      runListRefresh();
      runThreadRefresh();
    };

    let listTimer = null;
    let threadTimer = null;

    const clearTimers = () => {
      if (listTimer) clearInterval(listTimer);
      if (threadTimer) clearInterval(threadTimer);
      listTimer = null;
      threadTimer = null;
    };

    const startTimers = () => {
      clearTimers();
      const hidden = typeof document !== 'undefined' && document.hidden;
      const listMs = hidden ? INTERVAL_INACTIVE_MS : INTERVAL_ACTIVE_LIST_MS;
      const threadMs = hidden ? INTERVAL_INACTIVE_MS : INTERVAL_ACTIVE_THREAD_MS;
      listTimer = setInterval(runListRefresh, listMs);
      threadTimer = setInterval(runThreadRefresh, threadMs);
    };

    const onVisibility = () => {
      if (!document.hidden) {
        runAutoRefresh();
      }
      startTimers();
    };

    runAutoRefresh();
    startTimers();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoRefresh, realtimeOn]);

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
      const senderKind = senderKindFromMessage(m);
      const bubbleKind =
        role === 'assistant' ? (senderKind === 'human' ? 'human' : 'ai') : 'user';
      const alignEnd = bubbleKind !== 'user';
      const key = messageKey(m);
      const gapOk = ms && lastTs ? ms - lastTs <= 2 * 60 * 1000 : false;
      const canAppend = group && group.bubbleKind === bubbleKind && gapOk;
      if (!canAppend) {
        group = {
          type: 'group',
          id: `${out.length}-${bubbleKind}`,
          bubbleKind,
          alignEnd,
          senderKind,
          items: [],
        };
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

  const handleClearInboxListFilters = useCallback(() => {
    setMinhaFilaOn(false);
    setListFilter('all');
    setLabelFilter(null);
    setExtraFiltersMenuOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    if (!extraFiltersMenuOpen) return undefined;
    const onDoc = (e) => {
      const root = listExtraFiltersRef.current;
      if (!root || root.contains(e.target)) return;
      setExtraFiltersMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [extraFiltersMenuOpen]);

  const waChatConnected = useMemo(() => String(waStatus || '').trim() === 'connected', [waStatus]);
  const showWaDisconnectBanner = String(waStatus || '').trim() !== 'connected';

  const [inboxVvInset, setInboxVvInset] = useState(0);
  const [inboxSlashMaxHeight, setInboxSlashMaxHeight] = useState(288);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    if (!isMobile) {
      setInboxVvInset(0);
      setInboxSlashMaxHeight(288);
      return;
    }
    const vv = window.visualViewport;
    const upd = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      setInboxVvInset(inset);
      setInboxSlashMaxHeight(Math.min(288, Math.max(120, Math.floor(vv.height * 0.38))));
    };
    upd();
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
    return () => {
      vv.removeEventListener('resize', upd);
      vv.removeEventListener('scroll', upd);
    };
  }, [isMobile]);

  const inboxExtraFilterActive =
    !['unread', 'need_human', 'waiting_customer'].includes(String(listFilter || '')) || Boolean(labelFilter);

  const listPanel = (
    <InboxListPanel
      searchQuery={searchQuery}
      hasMore={hasMore}
      listFilter={listFilter}
      minhaFilaOn={minhaFilaOn}
      stats={stats}
      extraFiltersMenuOpen={extraFiltersMenuOpen}
      setExtraFiltersMenuOpen={setExtraFiltersMenuOpen}
      inboxExtraFilterActive={inboxExtraFilterActive}
      listExtraFiltersRef={listExtraFiltersRef}
      setMinhaFilaOn={setMinhaFilaOn}
      setListFilter={setListFilter}
      inboxLabels={inboxLabels}
      labelFilter={labelFilter}
      setLabelFilter={setLabelFilter}
      onConversationListScroll={onConversationListScroll}
      groupedFilteredItems={groupedFilteredItems}
      loading={loading}
      itemsLength={items.length}
      waChatConnected={waChatConnected}
      loadingMore={loadingMore}
      handleSelectConversation={handleSelectConversation}
      selectedPhone={selectedPhone}
      ticketChip={ticketChip}
      formatTimeOnly={formatTimeOnly}
      formatWhen={formatWhen}
      formatListActivityLabel={formatListActivityLabel}
      isMobile={isMobile}
      handleClearInboxListFilters={handleClearInboxListFilters}
      setConversationSheet={setConversationSheet}
      nowMs={nowMs}
    />
  );

  const threadMessagesEmptyUi = Boolean(
    selectedPhone &&
    !threadLoading &&
    !error &&
    !threadError &&
    (!Array.isArray(selected?.messages) || selected.messages.length === 0)
  );

  const composerProps = {
    isMobile,
    inboxVvInset,
    composerExpanded,
    selectedPhone,
    selected,
    templatesOpen,
    setTemplatesOpen,
    setEmojiOpen,
    quickTemplates,
    terms,
    leads,
    academyNameForTemplates,
    setDraft,
    textareaRef,
    emojiOpen,
    emojis,
    insertAtCursor,
    scheduleOn,
    setScheduleOn,
    sending,
    scheduleAtLocal,
    setScheduleAtLocal,
    improveDraftWithAi,
    improvingDraft,
    draft,
    draftBeforeImprove,
    setDraftBeforeImprove,
    slashOpen,
    slashPopupRef,
    inboxSlashMaxHeight,
    slashFilteredTemplates,
    slashIndex,
    setSlashIndex,
    slashActiveItemRef,
    applySlashTemplate,
    handleDraftChange,
    applyWrapToDraft,
    sendManual,
    setComposerExpanded,
    setSlashOpen,
    setSlashQuery,
    toast,
  };

  const threadPanel = (
    <InboxThreadPanel
      selectedPhone={selectedPhone}
      setSelectedPhone={setSelectedPhone}
      setDetailsOpen={setDetailsOpen}
      isMobile={isMobile}
      selected={selected}
      leadById={leadById}
      leadByPhone={leadByPhone}
      normalizePhone={normalizePhone}
      pickDisplayName={pickDisplayName}
      formatPhone={formatPhone}
      nowMs={nowMs}
      handoffReleaseHint={handoffReleaseHint}
      editingContactName={editingContactName}
      contactNameDraft={contactNameDraft}
      setContactNameDraft={setContactNameDraft}
      saveContactName={saveContactName}
      savingContactName={savingContactName}
      setEditingContactName={setEditingContactName}
      navigate={navigate}
      contactLabel={contactLabel}
      terms={terms}
      menu={menu}
      openMenu={openMenu}
      closeMenu={closeMenu}
      threadScrollRef={threadScrollRef}
      onThreadScroll={onThreadScroll}
      threadHasMore={threadHasMore}
      threadLoading={threadLoading}
      loadThread={loadThread}
      selectedPhoneRef={selectedPhoneRef}
      threadPaging={threadPaging}
      threadCursor={threadCursor}
      error={error}
      threadError={threadError}
      threadMessagesEmptyUi={threadMessagesEmptyUi}
      waChatConnected={waChatConnected}
      threadBlocks={threadBlocks}
      expandedMsgs={expandedMsgs}
      setExpandedMsgs={setExpandedMsgs}
      inboxMessageMediaUrl={inboxMessageMediaUrl}
      inboxContentIsAudioPlaceholder={inboxContentIsAudioPlaceholder}
      selectedMsgKey={selectedMsgKey}
      setSelectedMsgKey={setSelectedMsgKey}
      selectedPhoneFlags={selectedPhoneFlags}
      senderKindFromMessage={senderKindFromMessage}
      setImageLightboxUrl={setImageLightboxUrl}
      formatWhen={formatWhen}
      formatTimeOnly={formatTimeOnly}
      copyToClipboard={copyToClipboard}
      setHandoffActive={setHandoffActive}
      setHandoffReleaseHint={setHandoffReleaseHint}
      cancelScheduledMessage={cancelScheduledMessage}
      cancelingMsgId={cancelingMsgId}
      waSyncing={waSyncing}
      reconcileLast24h={reconcileLast24h}
      setDraft={setDraft}
      textareaRef={textareaRef}
      threadAtBottom={threadAtBottom}
      newMsgCount={newMsgCount}
      scrollThreadToBottom={scrollThreadToBottom}
      ticketUpdating={ticketUpdating}
      updateTicket={updateTicket}
      showInboxKeyHints={showInboxKeyHints}
      inboxThreadNarrow767={inboxThreadNarrow767}
      isNarrowDesktop={isNarrowDesktop}
      setContextOpen={setContextOpen}
      composerProps={composerProps}
      ticketChip={ticketChip}
      listFilter={listFilter}
      unarchiveConversation={unarchiveConversation}
      handoffDurationPhrase={handoffDurationPhrase}
    />
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

  const contextPanelProps = {
    selectedPhone,
    selected,
    ticketChip,
    updateTicket,
    ticketUpdating,
    loadThread,
    setLeadPanel,
    canConfigureAgenteIa,
    openPromptSettings,
    academyId,
    conversationIdForFlags,
    toast,
    leadById,
    leadByPhone,
    normalizePhone,
    pickDisplayName,
    contactLabel,
    navigate,
    linkingLead,
    leadPanel,
    leadNameDraft,
    setLeadNameDraft,
    leadTypeDraft,
    setLeadTypeDraft,
    convertToLead,
    transferToDraft,
    setTransferToDraft,
    teamMembers,
    confirmTransferConversation,
    leadSearch,
    setLeadSearch,
    fetchLeads,
    leadsLoading,
    leadCandidates,
    linkLeadToConversation,
    pinnedMessages,
    setSelectedMsgKey,
    scrollToMsgKey,
    isMobile,
    setDetailsOpen,
    selectedPhoneFlags,
    membershipPrimaryLabel,
  };

  const contextPanel = (
    <InboxContextPanel
      isMobile={isMobile}
      setContextOpen={setContextOpen}
      {...contextPanelProps}
    />
  );

  const contextPanelVisible = contextOpen && !isNarrowDesktop;

  return (
    <div className="container inbox-page">
      {showWaDisconnectBanner ? (
        <StatusBanner
          variant="warning"
          className="inbox-global-error"
          action={{ label: 'Reconectar →', onClick: () => navigate('/agente-ia') }}
        >
          WhatsApp desconectado — as mensagens não estão chegando.
        </StatusBanner>
      ) : null}

      <PageHeader
        className="inbox-page-header"
        title="Conversas"
        subtitle="Responda e acompanhe threads do WhatsApp."
        meta={
          loading ? (
            'Carregando…'
          ) : (
            <>
              <span className="navi-ui-count">{items.length}</span> conversas
              {lastUpdatedAt ? (
                <>
                  {' '}
                  · atualizado às{' '}
                  <span className="navi-ui-date">
                    {new Date(lastUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              ) : null}
              {!isMobile ? (
                <span
                  className="inbox-shortcut-hint"
                  title="Atalhos (fora de campos de texto): J / K conversas, R focar resposta, E resolver, Ctrl+R recarregar histórico, Ctrl+K alternar resolvido."
                >
                  {' '}
                  · J · K
                </span>
              ) : null}
            </>
          )
        }
        toolbar={
          <div className="page-header-row navi-toolbar inbox-page-header__toolbar">
            <SearchField
              className="inbox-toolbar-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por telefone ou nome…"
              aria-label="Buscar conversas"
            />
            <button
              type="button"
              className={minhaFilaOn ? 'btn-action-primary inbox-minha-fila-btn' : 'btn-action-ghost inbox-minha-fila-btn'}
              aria-pressed={minhaFilaOn}
              onClick={() => setMinhaFilaOn((v) => !v)}
              title="Quando ativo: só conversas com handoff humano e não lidas. Preferência salva neste aparelho."
            >
              <span className="inbox-minha-fila-icon" aria-hidden>
                <User size={17} strokeWidth={2} style={{ opacity: 0.92 }} />
                <Zap
                  size={11}
                  strokeWidth={2.75}
                  className={minhaFilaOn ? 'inbox-minha-fila-zap inbox-minha-fila-zap--active' : 'inbox-minha-fila-zap inbox-minha-fila-zap--idle'}
                />
              </span>
              Minha fila
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn-action-primary"
              onClick={reconcileLast24h}
              disabled={waSyncing}
            >
              {waSyncing ? 'Sincronizando…' : 'Sincronizar WhatsApp'}
            </button>
            <button
              type="button"
              className={desktopNotify ? 'btn-action-ghost' : 'btn-action-ghost'}
              onClick={() => void toggleDesktopNotifyPreference()}
              title={
                desktopNotify
                  ? 'Notificações do sistema ativas (Windows/macOS)'
                  : 'Ativar notificação do sistema ao receber mensagem (além do aviso no app)'
              }
            >
              {desktopNotify ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
              Notificações
            </button>
          </div>
        }
      />

      <div className="inbox-body-grow">

      {menu && (
        <div className="inbox-menu-overlay" onClick={closeMenu} role="presentation">
          <div
            className="inbox-menu-panel navi-menu__panel navi-menu__panel--overlay"
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
                    className="inbox-menu-item navi-menu__item"
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
                    className="inbox-menu-item navi-menu__item"
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
                    className="inbox-menu-item navi-menu__item"
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
                    className="inbox-menu-item navi-menu__item"
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
                    className="inbox-menu-item navi-menu__item"
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
                    className="inbox-menu-item navi-menu__item navi-menu__item--muted"
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
                      className={`inbox-menu-item navi-menu__item ${canCancel ? 'navi-menu__item--danger' : 'navi-menu__item--muted'}`}
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
                    className="inbox-menu-item navi-menu__item"
                    type="button"
                    onClick={() => {
                      if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                      else setContextOpen((v) => !v);
                      closeMenu();
                    }}
                  >
                    {isMobile || isNarrowDesktop ? 'Abrir detalhes' : contextPanelVisible ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Detalhes
                    </span>
                  </button>
                  <button
                    className="inbox-menu-item navi-menu__item"
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
                    className="inbox-menu-item navi-menu__item"
                    type="button"
                    onClick={() => {
                      setLeadPanel('transfer');
                      if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                      else setContextOpen(true);
                      closeMenu();
                    }}
                    disabled={!phone || ticketUpdating}
                  >
                    Transferir conversa
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      Equipe
                    </span>
                  </button>
                  {listFilter !== 'archived' && !isConvArchived && (
                    <button
                      className="inbox-menu-item navi-menu__item"
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
                      className="inbox-menu-item navi-menu__item"
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
                    className="inbox-menu-item navi-menu__item"
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
                      className="inbox-menu-item navi-menu__item"
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
                      className="inbox-menu-item navi-menu__item"
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
                        className="inbox-menu-item navi-menu__item"
                        type="button"
                        onClick={() => {
                          setLeadPanel('convert');
                          if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                          else setContextOpen(true);
                          closeMenu();
                        }}
                        disabled={!phone || linkingLead}
                      >
                        Converter em contato
                        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                          CRM
                        </span>
                      </button>
                      <button
                        className="inbox-menu-item navi-menu__item"
                        type="button"
                        onClick={() => {
                          setLeadPanel('associate');
                          if (isMobile || isNarrowDesktop) setDetailsOpen(true);
                          else setContextOpen(true);
                          closeMenu();
                        }}
                        disabled={!phone || linkingLead}
                      >
                        Associar contato
                        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                          CRM
                        </span>
                      </button>
                    </>
                  )}
                  {hasLead && (
                    <>
                  <button
                    className="inbox-menu-item navi-menu__item"
                    type="button"
                    onClick={() => {
                      navigate(`/lead/${encodeURIComponent(String(selected.lead_id))}`);
                      closeMenu();
                    }}
                  >
                    {`Ver ${contactLabel.toLowerCase()}`}
                        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                          Perfil
                        </span>
                      </button>
                      <button
                        className="inbox-menu-item navi-menu__item"
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

      <InboxImageLightbox imageUrl={imageLightboxUrl} onClose={() => setImageLightboxUrl('')} />

      {(isMobile || isNarrowDesktop) && detailsOpen && selectedPhone && (
        <div
          className="inbox-details-modal-overlay"
          onClick={() => setDetailsOpen(false)}
          role="presentation"
        >
          <div className="inbox-details-modal-shell inbox-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inbox-details-modal__header">
              <div className="inbox-details-modal__title">Detalhes</div>
              <button className="btn btn-outline navi-btn--toolbar" type="button" onClick={() => setDetailsOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="inbox-details-modal-scroll">
              <InboxContextPanelContent {...contextPanelProps} />
            </div>
          </div>
        </div>
      )}

      {conversationSheet && isMobile && (() => {
        const it = conversationSheet.item;
        const phone = String(it?._phone || it?.phone_number || '').trim();
        const title = String(it?._displayTitle || phone || 'Conversa');
        const sheetUnread = Number(it?._unreadCount ?? it?.unread_count ?? 0);
        if (!phone) return null;
        return (
          <div className="inbox-sheet-overlay" onClick={() => setConversationSheet(null)} role="presentation">
            <div className="inbox-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="inbox-sheet__handle" aria-hidden />
              <div className="inbox-sheet__title">{title}</div>
              {sheetUnread === 0 ? (
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
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', minHeight: 44 }}
                  onClick={() => {
                    void markSeen(phone, { notifySuccess: true });
                    setConversationSheet(null);
                  }}
                >
                  Marcar como lida
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', minHeight: 44, marginTop: 8 }}
                onClick={() => {
                  void archiveConversation(phone);
                  setConversationSheet(null);
                }}
              >
                Arquivar
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


      {error ? <StatusBanner variant="error" message={error} className="inbox-global-error" /> : null}

      {
                isMobile ? (
                  <div className="inbox-mobile-split">
                    <div
                      className="inbox-mobile-list-slot"
                      style={{ display: selectedPhone ? 'none' : 'flex' }}
                      aria-hidden={selectedPhone ? true : undefined}
                    >
                      {listPanel}
                    </div>
                    <div
                      className="inbox-mobile-thread-slot"
                      style={{ display: selectedPhone ? 'flex' : 'none' }}
                      aria-hidden={!selectedPhone ? true : undefined}
                    >
                      {threadPanel}
                    </div>
                  </div>
                ) : (
                  <div
                    className="inbox-layout-grid"
                    style={{
                      gridTemplateColumns: contextPanelVisible
                        ? `${listWidth}px 10px minmax(0, 1.3fr) minmax(280px, 320px)`
                        : `${listWidth}px 10px minmax(0, 1fr)`,
                    }}
                  >
                    <div className="inbox-layout-list-col">{listPanel}</div>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={startResize}
                      onDoubleClick={() => setListWidth(420)}
                      className="inbox-layout-resize-handle"
                      title="Arraste para ajustar a largura"
                    >
                      <div className="inbox-layout-resize-handle__bar" />
                    </div>
                    <div
                      className={
                        contextPanelVisible
                          ? 'inbox-layout-thread-col inbox-layout-thread-col--with-context'
                          : 'inbox-layout-thread-col'
                      }
                    >
                      {threadPanel}
                    </div>
                    {contextPanelVisible ? <div className="inbox-layout-context-col">{contextPanel}</div> : null}
                  </div>
                )
      }
      </div>

      <ConfirmDialog
        open={Boolean(cancelConfirmMsgId)}
        title="Cancelar agendamento?"
        description="Cancelar esta mensagem agendada?"
        confirmLabel="Cancelar agendamento"
        onConfirm={() => void runCancelScheduledMessage()}
        onClose={() => setCancelConfirmMsgId('')}
      />
    </div>
  );
}