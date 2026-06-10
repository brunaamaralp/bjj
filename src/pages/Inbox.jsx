import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { account, teams, CONVERSATIONS_COL, DB_ID, databases, ACADEMIES_COL } from '../lib/appwrite';
import { membershipPrimaryLabel } from '../lib/teamMembershipLabel.js';
import { humanHandoffUntilToMs } from '../../lib/humanHandoffUntil.js';
import { AGENT_HISTORY_WINDOW, getHumanHandoffHoursForClient } from '../../lib/constants.js';
import {
  WHATSAPP_TEMPLATE_LABELS,
  applyWhatsappTemplatePlaceholders,
} from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../hooks/useToast';
import { resolveInboxTicketBadge } from '../lib/inboxTicketBadges.js';
import { useLeadStore } from '../store/useLeadStore';
import { useChatWidgetStore } from '../store/useChatWidgetStore';
import { primaryInboxPhone } from '../lib/normalizeInboxPhone.js';
import { useStudentStore } from '../store/useStudentStore';
import { useUserRole } from '../lib/useUserRole';
import { useTerms, contactLabelSingular } from '../lib/terminology.js';
import { friendlyError } from '../lib/errorMessages';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { useZapsterWhatsAppConnection } from '../hooks/useZapsterWhatsAppConnection';
import { Bell, BellOff, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuItem,
  DropdownMenuItemStatic,
  DropdownMenuLabel,
  DropdownMenuPanel,
} from '../components/shared/menu';
import InboxListPanel from '../components/inbox/InboxListPanel';
import InboxThreadPanel from '../components/inbox/InboxThreadPanel';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';

const InboxContextPanel = lazyWithRetry(() => import('../components/inbox/InboxContextPanel'));
const InboxContextPanelContent = lazy(() =>
  import('../components/inbox/InboxContextPanel').then((m) => ({ default: m.InboxContextPanelContent }))
);
const InboxImageLightbox = lazyWithRetry(() => import('../components/inbox/InboxImageLightbox.jsx'));
import { uploadInboxMedia, InboxMediaUploadError } from '../lib/uploadInboxMedia.js';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import EmptyState from '../components/shared/EmptyState.jsx';
import StatusBanner from '../components/shared/StatusBanner.jsx';
import useDebounce from '../hooks/useDebounce.js';
import { useInboxContextMenu } from '../hooks/useInboxContextMenu.js';
import { useInboxKeyboard } from '../hooks/useInboxKeyboard.js';
import { useInboxListPipeline } from '../hooks/useInboxListPipeline.js';
import { useInboxRealtimeSync } from '../hooks/useInboxRealtimeSync.js';
import { useInboxThreadScroll } from '../hooks/useInboxThreadScroll.js';
import { useInboxViewport } from '../hooks/useInboxViewport.js';
import { useInboxConversationList } from '../hooks/useInboxConversationList.js';
import { useInboxInitialLoad } from '../hooks/useInboxInitialLoad.js';
import { useInboxAutoRefresh } from '../hooks/useInboxAutoRefresh.js';
import { useInboxListStats } from '../hooks/useInboxListStats.js';
import { useInboxScrollLoadMore } from '../hooks/useInboxScrollLoadMore.js';
import { useInboxThreadLoader } from '../hooks/useInboxThreadLoader.js';
import { useInboxConversationActions } from '../hooks/useInboxConversationActions.js';
import { useInboxOutboundMessaging } from '../hooks/useInboxOutboundMessaging.js';
import InboxContextMenus from '../components/inbox/InboxContextMenus.jsx';
import {
  getInboxJwt as getJwt,
  normalizeInboxApiError as normalizeApiError,
  safeParseInboxJson as safeParseJson,
} from '../lib/inboxApiUtils.js';
import {
  normalizeInboxPhone as normalizePhone,
  formatInboxPhone as formatPhone,
  pickInboxDisplayName as pickDisplayName,
} from '../lib/inboxContactDisplay.js';
import { inboxPhoneLookupVariants } from '../lib/normalizeInboxPhone.js';
import { MAX_INBOX_LIST_ITEMS } from '../lib/inboxListCap.js';
import { inboxMessageMediaUrl } from '../lib/inboxMediaUtils.js';
import { inboxMessageKey, senderKindFromInboxMessage } from '../lib/inboxMessageUtils.js';
import { buildInboxThreadBlocks } from '../lib/inboxThreadBlocks.js';
import { isLeadPendingTriage, LEAD_TRIAGE_STATUS } from '../lib/leadTriage.js';
import { filterStudentCandidates } from '../lib/studentSearchFilter.js';
import { resolvePipelineLeadToStudent } from '../lib/resolvePipelineLeadToStudent.js';
import { unlinkInboxConversationLead } from '../lib/unlinkInboxConversationLead.js';
import { useFollowupEventsByLead } from '../hooks/useFollowupEventsByLead.js';
import { computeFollowupState, isFollowUpLead } from '../lib/followupState.js';
import { readFollowupPlaybook } from '../lib/followupPlaybookDefaults.js';
import useDialogFocus from '../hooks/useDialogFocus.js';
import { inboxFilterFromUrlParam, inboxFilterLabel, inboxFilterToUrlParam } from '../lib/inboxUrlState.js';
const EMPTY_ACADEMY_LIST = [];

const COMPOSER_EXPANDED_STORAGE_KEY = 'nave_composer_expanded';
const MINHA_FILA_STORAGE_KEY = 'nave_inbox_minha_fila';
/** Filtro inicial da lista — fila completa (Todos), salvo preferência legada de "Minha fila". */
const DEFAULT_INBOX_LIST_FILTER = 'all';
const INBOX_PRIMARY_FILTERS = new Set(['all', 'needs_me', 'unread']);

function readInitialInboxListFilter() {
  if (typeof window === 'undefined') return DEFAULT_INBOX_LIST_FILTER;
  try {
    const v = window.localStorage.getItem(MINHA_FILA_STORAGE_KEY);
    if (v === '1' || String(v).toLowerCase() === 'true') return 'needs_me';
  } catch {
    void 0;
  }
  return DEFAULT_INBOX_LIST_FILTER;
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

function inboxContentIsAudioPlaceholder(content) {
  const s = String(content || '').trim();
  return /🎵\s*\[Áudio recebido\]|\[Áudio recebido\]/i.test(s);
}

export default function Inbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { fetchLeads, leads, loading: leadsLoading, academyId, academyList: academyListRaw, updateLead, deleteLead } = useLeadStore(
    useShallow((state) => ({
      fetchLeads: state.fetchLeads,
      leads: state.leads,
      loading: state.loading,
      academyId: state.academyId,
      academyList: state.academyList,
      updateLead: state.updateLead,
      deleteLead: state.deleteLead,
    }))
  );
  const students = useStudentStore((s) => s.students);
  const fetchStudents = useStudentStore((s) => s.fetchStudents);
  const studentsLoading = useStudentStore((s) => s.loading);
  const academyList = Array.isArray(academyListRaw) ? academyListRaw : EMPTY_ACADEMY_LIST;
  const academyDoc = useMemo(() => academyList.find((a) => a.id === academyId) || { ownerId: '', teamId: '' }, [academyList, academyId]);

  useEffect(() => {
    const teamId = String(academyDoc?.teamId || '').trim();
    if (!teamId) {
      setTeamMembers([]);
      return undefined;
    }
    let cancelled = false;
    const loadTeamMembers = () => {
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
    };
    const schedule =
      typeof requestIdleCallback === 'function'
        ? (cb) => requestIdleCallback(cb, { timeout: 3000 })
        : (cb) => window.setTimeout(cb, 400);
    const cancelSchedule =
      typeof cancelIdleCallback === 'function'
        ? cancelIdleCallback
        : (id) => window.clearTimeout(id);
    const id = schedule(() => {
      if (!cancelled) loadTeamMembers();
    });
    return () => {
      cancelled = true;
      cancelSchedule(id);
    };
  }, [academyDoc?.teamId]);
  const role = useUserRole(academyDoc);
  const canConfigureAgenteIa = role === 'owner' || role === 'member';
  const fetchWaInfoDeferredRef = useRef(null);
  const { waInfo, waStatus, waSyncing, waStatusChecked, reconcileWhatsAppHistory, fetchWaInfoDeferred } =
    useZapsterWhatsAppConnection(academyId, {
      statusPollWhileMounted: true,
      watchAcademyStatus: true,
      deferInitialFetch: true,
    });
  useEffect(() => {
    fetchWaInfoDeferredRef.current = fetchWaInfoDeferred;
  }, [fetchWaInfoDeferred]);
  const terms = useTerms();
  const labels = useLeadStore((s) => s.labels);
  const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(() => {
    if (typeof window === 'undefined') return '';
    return normalizePhone(new URLSearchParams(window.location.search).get('phone') || '');
  });
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
  const debouncedSearch = useDebounce(search, 350);
  const [listCapped, setListCapped] = useState(false);
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
  const { isMobile, isNarrowDesktop, showInboxKeyHints } = useInboxViewport();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [composerExpanded, setComposerExpanded] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const [listFilter, setListFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const fromUrl = inboxFilterFromUrlParam(new URLSearchParams(window.location.search).get('filter'));
      if (fromUrl) return fromUrl;
    }
    return readInitialInboxListFilter();
  });
  const listFilterRef = useRef(listFilter);
  const [handoffReleaseHint, setHandoffReleaseHint] = useState(false);

  useEffect(() => {
    const fromUrl = inboxFilterFromUrlParam(searchParams.get('filter'));
    if (fromUrl && fromUrl !== listFilterRef.current) {
      setListFilter(fromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const param = inboxFilterToUrlParam(listFilter);
        const cur = String(next.get('filter') || '').trim();
        if (param) {
          if (cur === param) return prev;
          next.set('filter', param);
        } else if (!cur) {
          return prev;
        } else {
          next.delete('filter');
        }
        return next;
      },
      { replace: true }
    );
  }, [listFilter, setSearchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const phone = normalizePhone(selectedPhone);
        const cur = normalizePhone(next.get('phone') || '');
        if (phone) {
          if (cur === phone) return prev;
          next.set('phone', phone);
        } else if (!cur) {
          return prev;
        } else {
          next.delete('phone');
        }
        return next;
      },
      { replace: true }
    );
  }, [selectedPhone, setSearchParams]);
  const [pageActionsOpen, setPageActionsOpen] = useState(false);
  const prevListFilterForReloadRef = useRef(null);
  const [extraFiltersMenuOpen, setExtraFiltersMenuOpen] = useState(false);
  const [agentIaActive, setAgentIaActive] = useState(false);
  const { stats, refreshStats, applyStatsFromList } = useInboxListStats({ academyId, listFilter });
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window === 'undefined') return 360;
    const raw = window.localStorage.getItem('inbox_list_width');
    const n = Number.parseInt(String(raw || ''), 10);
    if (!Number.isFinite(n)) return 360;
    return Math.max(300, Math.min(480, n));
  });
  const [leadPanel, setLeadPanel] = useState(null);
  const [dismissTriageLead, setDismissTriageLead] = useState(null);
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
  const [desktopNotify, setDesktopNotify] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('inbox_desktop_notify') === '1';
    } catch {
      return false;
    }
  });
  const { templates: whatsappTemplatesHook, academyName: academyNameForTemplates } = useWhatsappTemplates(academyId);
  const whatsappTemplatesObj = whatsappTemplatesHook || null;
  const {
    followupDoneByLead,
    followupContactByLead,
    followupSnoozeUntilByLead,
  } = useFollowupEventsByLead(academyId);
  const followupPlaybook = useMemo(
    () => readFollowupPlaybook(academyDoc?.settings),
    [academyDoc?.settings]
  );
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadPaging, setThreadPaging] = useState(false);
  const [threadCursor, setThreadCursor] = useState(null);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [ticketUpdating, setTicketUpdating] = useState(false);
  const [contextOpen, setContextOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem('inbox_context_open');
    if (raw === '1') return true;
    if (raw === '0') return false;
    return false;
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { menu, openMenu, closeMenu } = useInboxContextMenu();
  const [imageLightboxUrl, setImageLightboxUrl] = useState('');
  /** Mobile: bottom sheet após long press na lista (só ação "marcar não lida" quando aplicável). */
  const [conversationSheet, setConversationSheet] = useState(null);
  const detailsModalOpen = Boolean((isMobile || isNarrowDesktop) && detailsOpen && selectedPhone);
  const detailsModalRef = useDialogFocus(detailsModalOpen, () => setDetailsOpen(false));
  const conversationSheetOpen = Boolean(conversationSheet && isMobile);
  const conversationSheetRef = useDialogFocus(conversationSheetOpen, () => setConversationSheet(null));
  const [selectedMsgKey, setSelectedMsgKey] = useState('');
  const [expandedMsgs, setExpandedMsgs] = useState({});
  const [msgFlags, setMsgFlags] = useState({});
  const [inboxVvInset, setInboxVvInset] = useState(0);
  const [inboxSlashMaxHeight, setInboxSlashMaxHeight] = useState(288);

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
  const threadMessagesApiRef = useRef(null);
  const lastAutoScrollPhoneRef = useRef('');
  const threadMsgCountRef = useRef(0);
  const listMetaRef = useRef(new Map());
  const notifiedOnceRef = useRef(false);
  const desktopNotifyRef = useRef(false);
  const loadingListRef = useRef(false);
  const threadAbortRef = useRef(null);
  const threadRequestSeqRef = useRef(0);
  const realtimeTimersRef = useRef({ list: null, thread: null });
  const academyIdRef = useRef('');
  const handleSelectConversationRef = useRef(() => {});
  const markSeenRef = useRef(null);
  const messageFlagsMigrationDoneRef = useRef(false);
  const inboxAutoSelectDoneRef = useRef(false);

  const threadMessageCount = Array.isArray(selected?.messages) ? selected.messages.length : 0;
  const handleThreadPhoneChange = useCallback(() => {
    setSelectedMsgKey('');
    setExpandedMsgs({});
    setDetailsOpen(false);
  }, []);
  const {
    threadAtBottom,
    setThreadAtBottom,
    newMsgCount,
    setNewMsgCount,
    scrollThreadToBottom,
  } = useInboxThreadScroll({
    selectedPhone,
    messageCount: threadMessageCount,
    threadScrollRef,
    selectedPhoneRef,
    threadMsgCountRef,
    lastAutoScrollPhoneRef,
    onPhoneChange: handleThreadPhoneChange,
  });

  const searchQuery = useMemo(() => String(search || '').trim(), [search]);
  const debouncedSearchQuery = useMemo(() => String(debouncedSearch || '').trim(), [debouncedSearch]);
  const searchPending = searchQuery !== debouncedSearchQuery;
  const handoffHours = useMemo(() => getHumanHandoffHoursForClient(), []);
  const handoffDurationPhrase = useMemo(
    () => (handoffHours === 1 ? '1 hora' : `${handoffHours} horas`),
    [handoffHours]
  );

  const onListItemNotifyRef = useRef(() => {});
  const onListReadyRef = useRef(null);
  const onStatsFromListRef = useRef(null);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    onStatsFromListRef.current = applyStatsFromList;
  }, [applyStatsFromList]);

  const waDeferredOnceRef = useRef(false);
  useEffect(() => {
    waDeferredOnceRef.current = false;
  }, [academyId]);
  useEffect(() => {
    onListReadyRef.current = () => {
      if (!waDeferredOnceRef.current) {
        waDeferredOnceRef.current = true;
        const waFn = fetchWaInfoDeferredRef.current;
        if (typeof waFn === 'function') void waFn();
      }
    };
  }, []);

  const { loadList, loadListRef } = useInboxConversationList({
    academyIdRef,
    debouncedSearchQuery,
    listFilterRef,
    selectedPhoneRef,
    listMetaRef,
    notifiedOnceRef,
    loadingListRef,
    nextCursor,
    hasMore,
    loading,
    loadingMore,
    setNextCursor,
    setHasMore,
    setError,
    setLoading,
    setLoadingMore,
    setLastUpdatedAt,
    setItems,
    setListCapped,
    onListItemNotifyRef,
    onListReadyRef,
    onStatsFromListRef,
  });

  const { loadThread, loadThreadRef } = useInboxThreadLoader({
    academyIdRef,
    threadScrollRef,
    threadAbortRef,
    threadRequestSeqRef,
    lastAutoScrollPhoneRef,
    setError,
    setThreadError,
    setThreadPaging,
    setThreadLoading,
    setThreadCursor,
    setThreadHasMore,
    setSelected,
    setItems,
    itemsRef,
    selectedRef,
  });

  const {
    markSeen,
    markUnread,
    unarchiveConversation,
    archiveConversation,
    setHandoffActive,
    updateTicket,
    linkLeadToConversation,
    saveContactName,
    convertToLead,
    openPromptSettings,
  } = useInboxConversationActions({
    toast,
    academyIdRef,
    selectedPhoneRef,
    listFilterRef,
    loadListRef,
    loadList,
    closeMenu,
    setError,
    setItems,
    setSelected,
    setSelectedPhone,
    setHighlighted,
    setConversationSheet,
    setHandoffReleaseHint,
    setTicketUpdating,
    ticketUpdating,
    setLinkingLead,
    setLeadPanel,
    setLeadSearch,
    setEditingContactName,
    setSavingContactName,
    savingContactName,
    contactNameDraft,
    leadNameDraft,
    leadTypeDraft,
    selected,
    contactLabel,
  });

  const {
    sendManual,
    retryFailedMessage,
    cancelScheduledMessage,
    runCancelScheduledMessage,
    improveDraftWithAi,
  } = useInboxOutboundMessaging({
    toast,
    academyIdRef,
    selectedPhoneRef,
    threadScrollRef,
    lastAutoScrollPhoneRef,
    draftRef,
    textareaRef,
    selectedPhone,
    selected,
    draft,
    scheduleOn,
    scheduleAtLocal,
    sending,
    cancelingMsgId,
    cancelConfirmMsgId,
    setError,
    setSelected,
    setDraft,
    setDraftBeforeImprove,
    setScheduleOn,
    setScheduleAtLocal,
    setSending,
    setImprovingDraft,
    setCancelConfirmMsgId,
    setCancelingMsgId,
    scrollThreadToBottom,
    setHandoffActive,
    markSeen,
    loadList,
  });

  useEffect(() => {
    markSeenRef.current = markSeen;
  }, [markSeen]);

  useEffect(() => {
    if (!academyId) return;
    const connected = String(waStatus || '').trim() === 'connected';
    if (!connected) return;
    const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'connect_whatsapp')?.done;
    if (done) return;
    void useLeadStore.getState().completeOnboardingStepIds(['connect_whatsapp']);
  }, [waStatus, academyId]);

  const { realtimeOn } = useInboxRealtimeSync({
    academyId,
    academyIdRef,
    selectedPhoneRef,
    loadListRef,
    loadThreadRef,
    realtimeTimersRef,
  });

  useInboxInitialLoad({
    academyId,
    debouncedSearchQuery,
    loadListRef,
    setSelectedPhone,
    setSelected,
    setItems,
    setListCapped,
    setMsgFlags,
    messageFlagsMigrationDoneRef,
    notifiedOnceRef,
    inboxAutoSelectDoneRef,
  });

  useInboxAutoRefresh({
    autoRefresh,
    realtimeOn,
    loadListRef,
    loadThreadRef,
    selectedPhoneRef,
    draftRef,
    onListRefresh: refreshStats,
  });

  useEffect(() => {
    draftRef.current = String(draft || '');
  }, [draft]);

  useEffect(() => {
    selectedPhoneRef.current = String(selectedPhone || '');
  }, [selectedPhone]);

  const pinConversation = useChatWidgetStore((s) => s.pinConversation);
  const switchConversation = useChatWidgetStore((s) => s.switchConversation);
  const isWidgetPinned = useChatWidgetStore((s) => s.isPinned);
  const widgetActivePhone = useChatWidgetStore((s) => s.activePhone);

  useEffect(() => {
    if (!isWidgetPinned) return;
    const phone = normalizePhone(selectedPhone);
    const widgetPhone = primaryInboxPhone(widgetActivePhone);
    if (!phone || phone === widgetPhone) return;
    const leadId = String(selected?.lead_id || '').trim();
    const name = pickDisplayName({
      leadName: String(selected?.lead_name || '').trim(),
      manualContactName: selected?.contact_name,
      whatsappProfileName: selected?.whatsapp_profile_name,
      phone,
    });
    switchConversation({ phone, leadId, leadName: name });
  }, [
    selectedPhone,
    selected,
    isWidgetPinned,
    widgetActivePhone,
    switchConversation,
    pickDisplayName,
  ]);

  useEffect(() => {
    const widgetPhone = primaryInboxPhone(widgetActivePhone);
    const cur = normalizePhone(selectedPhone);
    if (!widgetPhone || widgetPhone === cur) return;
    setSelectedPhone(widgetPhone);
  }, [widgetActivePhone, selectedPhone]);

  const handlePinToWidget = useCallback(() => {
    const phone = normalizePhone(selectedPhone);
    if (!phone) return;
    const leadId = String(selected?.lead_id || '').trim();
    const name = pickDisplayName({
      leadName: String(selected?.lead_name || '').trim(),
      manualContactName: selected?.contact_name,
      whatsappProfileName: selected?.whatsapp_profile_name,
      phone,
    });
    pinConversation({ phone, leadId, leadName: name, academyId, openPanel: false });
    if (typeof window !== 'undefined' && window.history.length > 1) navigate(-1);
    else navigate('/');
  }, [selectedPhone, selected, academyId, pinConversation, navigate, pickDisplayName]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    const untilMs = humanHandoffUntilToMs(selected?.human_handoff_until);
    if (!phone || !selected?.need_human || untilMs <= 0) {
      handoffExpiryToastRef.current = '';
      return;
    }
    const showExpiryToast = () => {
      const key = `${phone}:${untilMs}`;
      if (handoffExpiryToastRef.current === key) return;
      handoffExpiryToastRef.current = key;
      toast.warning('Tempo do atendimento manual acabou. A IA pode retomar neste atendimento.');
    };
    const delay = untilMs - Date.now();
    if (delay <= 0) {
      showExpiryToast();
      return;
    }
    const id = setTimeout(showExpiryToast, delay);
    return () => clearTimeout(id);
  }, [toast, selected?.human_handoff_until, selected?.need_human, selectedPhone]);

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
      window.localStorage.setItem(MINHA_FILA_STORAGE_KEY, listFilter === 'needs_me' ? '1' : '0');
    } catch {
      void 0;
    }
  }, [listFilter]);

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
    const id = String(academyId || '').trim();
    if (!id) return;
    void getJwt();
  }, [academyId]);

  useEffect(() => {
    if (!academyId) {
      setAgentIaActive(false);
      return;
    }
    let cancelled = false;
    const loadAgentFlag = async () => {
      try {
        const token = await getJwt();
        const { blocked, res } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
          headers: { Authorization: `Bearer ${token}`, 'x-academy-id': academyId },
        });
        if (blocked || !res?.ok) return;
        const data = await res.json();
        if (!cancelled && data && typeof data === 'object') {
          setAgentIaActive(data.ia_ativa === true);
        }
      } catch {
        if (!cancelled) setAgentIaActive(false);
      }
    };
    const schedule =
      typeof requestIdleCallback === 'function'
        ? (cb) => requestIdleCallback(cb, { timeout: 2500 })
        : (cb) => window.setTimeout(cb, 800);
    const cancel =
      typeof cancelIdleCallback === 'function'
        ? cancelIdleCallback
        : (id) => window.clearTimeout(id);
    const id = schedule(() => {
      if (!cancelled) void loadAgentFlag();
    });
    return () => {
      cancelled = true;
      cancel(id);
    };
  }, [academyId]);

  useEffect(() => {
    setLeadPanel(null);
    setLeadSearch('');
    setLeadNameDraft('');
    setDraftBeforeImprove(null);
  }, [selectedPhone]);

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
    if (leadPanel !== 'link_student') return;
    if (studentsLoading) return;
    if (Array.isArray(students) && students.length > 0) return;
    void fetchStudents({ reset: true });
  }, [leadPanel, studentsLoading, students, fetchStudents]);

  useEffect(() => {
    if (!isNarrowDesktop) return;
    if (!contextOpen) return;
    setContextOpen(false);
  }, [isNarrowDesktop, contextOpen]);

  const senderKindFromMessage = senderKindFromInboxMessage;

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
    const phoneForSync = String(selectedPhoneRef.current || '').trim();
    await reconcileWhatsAppHistory(
      async () => {
        await loadList({ reset: true, silent: true });
        const phone = String(selectedPhoneRef.current || '').trim();
        if (phone) await loadThread(phone);
        if (inboxDebugEnabled) {
          console.log('[Inbox Realtime] atualizar chat: lista/thread recarregados', { hasSelectedPhone: Boolean(phone) });
        }
      },
      { phone: phoneForSync }
    );
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

  useEffect(() => {
    onListItemNotifyRef.current = ({ phone, name, preview }) => {
      playNotificationSound();
      setHighlightedPhone(phone);
      toast.show({
        type: 'info',
        message: `Nova mensagem de ${name}${preview ? `: ${preview}` : ''}`,
      });
      tryDesktopNotify({ phone, name, preview });
    };
  }, [toast]);

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
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    const row = (itemsRef.current || []).find((it) => String(it?.phone_number || '').trim() === phone);
    const conversationId =
      String(row?.id || selectedRef.current?.conversation_id || '').trim();
    void loadThread(phone, { conversationId });
  }, [selectedPhone, loadThread]);

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
      const variants = inboxPhoneLookupVariants(l?.phone || '');
      for (const phone of variants) {
        if (!phone || map.has(phone)) continue;
        map.set(phone, l);
      }
    }
    return map;
  }, [leads]);

  const activeContactLead = useMemo(() => {
    const phone = normalizePhone(selectedPhone);
    const leadId = String(selected?.lead_id || '').trim();
    if (leadId && leadById.has(leadId)) return leadById.get(leadId);
    if (phone && leadByPhone.has(phone)) return leadByPhone.get(phone);
    return null;
  }, [selectedPhone, selected?.lead_id, leadById, leadByPhone]);

  const pendingTriage = isLeadPendingTriage(activeContactLead);

  const activeFollowupState = useMemo(() => {
    if (!activeContactLead || !isFollowUpLead(activeContactLead)) return null;
    return computeFollowupState(activeContactLead, {
      playbook: followupPlaybook,
      followupDoneByLead,
      followupContactByLead,
      followupSnoozeUntilByLead,
    });
  }, [
    activeContactLead,
    followupPlaybook,
    followupDoneByLead,
    followupContactByLead,
    followupSnoozeUntilByLead,
  ]);

  const handleFollowupSendTemplate = useCallback(
    (templateKey) => {
      const key = String(templateKey || '').trim();
      if (!key) return;
      const fromList = quickTemplates.find((t) => t.key === key);
      if (fromList) {
        applySlashTemplate(fromList);
        return;
      }
      const raw = whatsappTemplatesObj?.[key];
      if (typeof raw === 'string' && raw.trim()) {
        applySlashTemplate({ key, text: raw });
      }
    },
    [quickTemplates, whatsappTemplatesObj]
  );

  const studentCandidates = useMemo(
    () => filterStudentCandidates(students, { query: leadSearch, phoneHint: selectedPhone, limit: 20 }),
    [students, leadSearch, selectedPhone]
  );

  const handleInboxConfirmTriage = useCallback(async (lead) => {
    const id = String(lead?.id || '').trim();
    if (!id) return;
    setLinkingLead(true);
    try {
      await updateLead(id, { triageStatus: LEAD_TRIAGE_STATUS.CONFIRMED });
      toast.success('Lead confirmado');
    } catch (e) {
      toast.error(e, 'update');
    } finally {
      setLinkingLead(false);
    }
  }, [toast, updateLead]);

  const handleInboxDismissTriage = useCallback((lead) => {
    setDismissTriageLead(lead);
  }, []);

  const executeDismissTriage = useCallback(async () => {
    const lead = dismissTriageLead;
    const id = String(lead?.id || '').trim();
    const phone = String(selectedPhone || '').trim();
    if (!id) return;
    setLinkingLead(true);
    try {
      await deleteLead(id);
      if (phone && academyId) await unlinkInboxConversationLead({ phone, academyId });
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== phone) return prev;
        return { ...prev, lead_id: null, lead_name: '' };
      });
      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((it) => {
          if (String(it?.phone_number || '').trim() !== phone) return it;
          return { ...it, lead_id: null, lead_name: '' };
        })
      );
      toast.success('Contato descartado');
      setDismissTriageLead(null);
      setLeadPanel(null);
    } catch (e) {
      toast.error(e, 'delete');
    } finally {
      setLinkingLead(false);
    }
  }, [academyId, deleteLead, dismissTriageLead, selectedPhone, toast]);

  const handleOpenLinkStudent = useCallback(() => {
    setLeadSearch('');
    setLeadPanel('link_student');
    if (isMobile || isNarrowDesktop) {
      setDetailsOpen(true);
    } else {
      setContextOpen(true);
    }
    void fetchStudents({ reset: true });
  }, [fetchStudents, isMobile, isNarrowDesktop]);

  const handleInboxLinkStudentConfirm = useCallback(async (studentId) => {
    const lead = activeContactLead;
    const leadId = String(lead?.id || '').trim();
    const sid = String(studentId || '').trim();
    const phone = String(selectedPhone || '').trim();
    if (!leadId || !sid || linkingLead) return;

    const student = (Array.isArray(students) ? students : []).find((s) => String(s?.id || '').trim() === sid);
    const studentName = String(student?.name || '').trim();

    setLinkingLead(true);
    try {
      await resolvePipelineLeadToStudent({
        lead,
        studentId: sid,
        academyId,
        deleteLead,
      });
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== phone) return prev;
        return { ...prev, lead_id: sid, lead_name: studentName || prev.lead_name };
      });
      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((it) => {
          if (String(it?.phone_number || '').trim() !== phone) return it;
          return { ...it, lead_id: sid, lead_name: studentName || String(it?.lead_name || '').trim() };
        })
      );
      await loadList({ reset: true, silent: true });
      toast.success('Aluno vinculado — removido do funil');
      setLeadPanel(null);
      setLeadSearch('');
      setDetailsOpen(false);
    } catch (e) {
      toast.error(e, 'action');
    } finally {
      setLinkingLead(false);
    }
  }, [
    academyId,
    activeContactLead,
    deleteLead,
    linkingLead,
    loadList,
    selectedPhone,
    students,
    toast,
  ]);

  const {
    groupedFilteredItems,
    firstVisibleConversation,
    flatVisibleConversations,
  } = useInboxListPipeline({
    items,
    leadById,
    leadByPhone,
    highlighted,
    listFilter,
    searchQuery: debouncedSearchQuery,
    normalizePhone,
    pickDisplayName,
  });

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
    const resolved = resolveInboxTicketBadge(status, transferTo);
    return {
      label: resolved.label,
      tone: resolved.tone,
      status: resolved.status,
      isDefault: resolved.isDefault,
    };
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
  }, [transferToDraft, toast, updateTicket]);

  useInboxKeyboard({
    flatVisibleConversations,
    selectedPhoneRef,
    selectedTicketStatus: selected?.ticket_status,
    handleSelectConversationRef,
    textareaRef,
    updateTicket,
    loadThread,
  });

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

  const nudgeListWidth = (delta) => {
    setListWidth((w) => Math.max(300, Math.min(480, w + delta)));
  };

  const onListResizeKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudgeListWidth(-12);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudgeListWidth(12);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setListWidth(300);
    } else if (e.key === 'End') {
      e.preventDefault();
      setListWidth(480);
    }
  };

  const threadBlocks = useMemo(
    () => buildInboxThreadBlocks(selected?.messages),
    [selected?.messages]
  );

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
      const k = inboxMessageKey(m);
      if (!pinned[k]) continue;
      const content = String(m?.content || '').trim();
      list.push({ key: k, preview: content.length > 80 ? `${content.slice(0, 80)}…` : content });
    }
    return list;
  }, [selected?.messages, selectedPhoneFlags]);

  const { onConversationListScroll, onThreadScroll } = useInboxScrollLoadMore({
    searchQuery,
    loadList,
    loadThread,
    selectedPhoneRef,
    threadHasMore,
    threadPaging,
    threadCursor,
    setThreadAtBottom,
    setNewMsgCount,
    newMsgCount,
  });

  const handleClearInboxListFilters = useCallback(() => {
    setListFilter('all');
    setExtraFiltersMenuOpen(false);
    setSearch('');
  }, []);

  const waChatConnected = useMemo(
    () => !waStatusChecked || String(waStatus || '').trim() === 'connected',
    [waStatus, waStatusChecked]
  );
  const showWaDisconnectBanner = waStatusChecked && String(waStatus || '').trim() !== 'connected';

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

  const inboxExtraFilterActive = !INBOX_PRIMARY_FILTERS.has(String(listFilter || ''));
  const visibleConversationCount = flatVisibleConversations.length;
  const listMetaShowsFiltered = listFilter !== 'all' || Boolean(searchQuery);

  const inboxPageActionsMenu = (
    <DropdownMenu open={pageActionsOpen} onOpenChange={setPageActionsOpen} className="inbox-page-actions-menu">
      <button
        type="button"
        className="inbox-list-panel__topbar-btn inbox-page-actions-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={pageActionsOpen}
        aria-label="Mais ações do inbox"
        onClick={() => setPageActionsOpen((v) => !v)}
      >
        <MoreHorizontal size={20} strokeWidth={2} aria-hidden />
      </button>
      {pageActionsOpen ? (
        <DropdownMenuPanel className="inbox-page-actions-menu__panel" aria-label="Ações do inbox">
          <DropdownMenuItem
            icon={<RefreshCw size={16} aria-hidden />}
            disabled={waSyncing}
            onClick={() => {
              setPageActionsOpen(false);
              void reconcileLast24h();
            }}
          >
            {waSyncing ? 'Sincronizando WhatsApp…' : 'Sincronizar WhatsApp'}
          </DropdownMenuItem>
          <DropdownMenuDivider />
          <DropdownMenuItem
            icon={desktopNotify ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
            active={desktopNotify}
            onClick={() => {
              setPageActionsOpen(false);
              void toggleDesktopNotifyPreference();
            }}
          >
            {desktopNotify ? 'Notificações ativas' : 'Ativar notificações'}
          </DropdownMenuItem>
          <DropdownMenuDivider />
          <DropdownMenuLabel>Atalhos de teclado</DropdownMenuLabel>
          <DropdownMenuItemStatic>J / K — conversa anterior ou próxima</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>R — focar resposta</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>E — resolver conversa</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>Ctrl+R — recarregar mensagens</DropdownMenuItemStatic>
          <DropdownMenuItemStatic>Ctrl+K — resolver / reabrir ticket</DropdownMenuItemStatic>
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );

  const listPanel = (
    <InboxListPanel
      search={search}
      onSearchChange={setSearch}
      searchQuery={searchQuery}
      hasMore={hasMore}
      listFilter={listFilter}
      stats={stats}
      extraFiltersMenuOpen={extraFiltersMenuOpen}
      setExtraFiltersMenuOpen={setExtraFiltersMenuOpen}
      inboxExtraFilterActive={inboxExtraFilterActive}
      setListFilter={setListFilter}
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
      agentIaActive={agentIaActive}
      searchPending={searchPending}
      activeFilterLabel={inboxExtraFilterActive ? inboxFilterLabel(listFilter) : ''}
      onClearActiveFilter={() => setListFilter('all')}
      listTopbarMeta={
        loading || searchPending ? (
          searchPending ? 'Buscando…' : 'Carregando…'
        ) : listMetaShowsFiltered ? (
          <>
            {visibleConversationCount} exibidas · {items.length} carregadas
          </>
        ) : (
          <>
            {items.length} conversas
            {lastUpdatedAt ? (
              <>
                {' '}
                · atualizado às{' '}
                {new Date(lastUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : null}
          </>
        )
      }
      pageActionsMenu={inboxPageActionsMenu}
      onSyncWhatsApp={reconcileLast24h}
      waSyncing={waSyncing}
      desktopNotify={desktopNotify}
      onToggleDesktopNotify={toggleDesktopNotifyPreference}
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

  const contextPanelVisible = contextOpen && !isNarrowDesktop;

  const scrollToMsgKey = (k) => {
    const key = String(k || '').trim();
    if (!key) return;
    try {
      threadMessagesApiRef.current?.scrollToMsgKey?.(key);
    } catch {
      void 0;
    }
  };

  const threadActionsMenuProps = {
    selectedPhone,
    selected,
    items,
    listFilter,
    isMobile,
    isNarrowDesktop,
    contextPanelVisible,
    setDetailsOpen,
    setContextOpen,
    updateTicket,
    ticketUpdating,
    archiveConversation,
    unarchiveConversation,
    markUnread,
  };

  const messageMenuProps = {
    setDraft,
    textareaRef,
    copyToClipboard,
    toggleMsgFlag,
    setSelectedMsgKey,
    scrollToMsgKey,
    selectedPhoneFlags,
    cancelScheduledMessage,
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
      threadActionsMenuProps={threadActionsMenuProps}
      threadScrollRef={threadScrollRef}
      threadMessagesApiRef={threadMessagesApiRef}
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
      isNarrowDesktop={isNarrowDesktop}
      setContextOpen={setContextOpen}
      composerProps={composerProps}
      ticketChip={ticketChip}
      handoffDurationPhrase={handoffDurationPhrase}
      retryFailedMessage={retryFailedMessage}
      pendingTriage={pendingTriage}
      activeContactLead={activeContactLead}
      onConfirmTriage={handleInboxConfirmTriage}
      onDismissTriage={handleInboxDismissTriage}
      onOpenLinkStudent={handleOpenLinkStudent}
      triageBusy={linkingLead}
      followupState={activeFollowupState}
      onFollowupSendTemplate={handleFollowupSendTemplate}
      leadPanel={leadPanel}
      setLeadPanel={setLeadPanel}
      linkingLead={linkingLead}
    />
  );

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
    studentCandidates,
    studentsLoading,
    fetchStudents,
    onConfirmTriage: handleInboxConfirmTriage,
    onDismissTriage: handleInboxDismissTriage,
    onOpenLinkStudent: handleOpenLinkStudent,
    onLinkStudentConfirm: handleInboxLinkStudentConfirm,
    triageBusy: linkingLead,
    activeContactLead,
    pinnedMessages,
    setSelectedMsgKey,
    scrollToMsgKey,
    isMobile,
    setDetailsOpen,
    selectedPhoneFlags,
    membershipPrimaryLabel,
  };

  const contextPanel = (
    <Suspense fallback={null}>
      <InboxContextPanel
        isMobile={isMobile}
        setContextOpen={setContextOpen}
        {...contextPanelProps}
      />
    </Suspense>
  );

  const inboxPageClassName = [
    'container inbox-page',
    selectedPhone ? 'inbox-page--compact' : '',
    isMobile && selectedPhone ? 'inbox-page--mobile-thread' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={inboxPageClassName}>
      {showWaDisconnectBanner ? (
        <StatusBanner
          variant="warning"
          className="inbox-global-error"
          action={{ label: 'Reconectar →', onClick: () => navigate('/agente-ia') }}
        >
          WhatsApp desconectado — as mensagens não estão chegando.
        </StatusBanner>
      ) : null}

      <div className="inbox-body-grow">

      <InboxContextMenus menu={menu} closeMenu={closeMenu} messageMenuProps={messageMenuProps} />


      {imageLightboxUrl ? (
        <Suspense fallback={null}>
          <InboxImageLightbox imageUrl={imageLightboxUrl} onClose={() => setImageLightboxUrl('')} />
        </Suspense>
      ) : null}

      {detailsModalOpen ? (
        <div
          className="inbox-details-modal-overlay"
          onClick={() => setDetailsOpen(false)}
          role="presentation"
        >
          <div
            ref={detailsModalRef}
            className="inbox-details-modal-shell inbox-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inbox-details-modal-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inbox-details-modal__header">
              <h2 id="inbox-details-modal-title" className="inbox-details-modal__title">
                Detalhes
              </h2>
              <button className="btn btn-outline navi-btn--toolbar" type="button" onClick={() => setDetailsOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="inbox-details-modal-scroll">
              <Suspense fallback={null}>
                <InboxContextPanelContent {...contextPanelProps} />
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}

      {conversationSheet && isMobile && (() => {
        const it = conversationSheet.item;
        const phone = String(it?._phone || it?.phone_number || '').trim();
        const title = String(it?._displayTitle || phone || 'Conversa');
        const sheetUnread = Number(it?._unreadCount ?? it?.unread_count ?? 0);
        if (!phone) return null;
        return (
          <div className="inbox-sheet-overlay" onClick={() => setConversationSheet(null)} role="presentation">
            <div
              ref={conversationSheetRef}
              className="inbox-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inbox-conversation-sheet-title"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inbox-sheet__handle" aria-hidden />
              <h2 id="inbox-conversation-sheet-title" className="inbox-sheet__title">
                {title}
              </h2>
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

      {listCapped ? (
        <StatusBanner variant="info" className="inbox-global-error inbox-list-cap-banner">
          Exibindo as {MAX_INBOX_LIST_ITEMS} conversas mais recentes em memória. Use a busca ou filtros para encontrar
          contatos fora desta janela.
        </StatusBanner>
      ) : null}

      {
                isMobile ? (
                  <div className="inbox-mobile-split">
                    <div
                      className="inbox-mobile-list-slot"
                      style={{ display: selectedPhone ? 'none' : 'flex' }}
                      inert={selectedPhone ? true : undefined}
                    >
                      {listPanel}
                    </div>
                    <div
                      className="inbox-mobile-thread-slot"
                      style={{ display: selectedPhone ? 'flex' : 'none' }}
                      inert={!selectedPhone ? true : undefined}
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
                      aria-label="Ajustar largura da lista de conversas"
                      aria-valuemin={300}
                      aria-valuemax={480}
                      aria-valuenow={listWidth}
                      tabIndex={0}
                      onMouseDown={startResize}
                      onKeyDown={onListResizeKeyDown}
                      onDoubleClick={() => setListWidth(420)}
                      className="inbox-layout-resize-handle"
                      title="Arraste ou use as setas para ajustar a largura"
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

      <ConfirmDialog
        open={Boolean(dismissTriageLead)}
        title="Marcar que não é lead?"
        description="Este contato será removido do funil."
        confirmLabel="Não é lead"
        onConfirm={() => void executeDismissTriage()}
        onClose={() => setDismissTriageLead(null)}
      />
    </div>
  );
}