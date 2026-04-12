import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, Phone, Upload, MessageCircle, ChevronRight, SlidersHorizontal, PlusCircle, StickyNote, Search } from 'lucide-react';
import ImportSheet from '../components/ImportSheet';
import ExportButton from '../components/ExportButton';
import { LostReasonModal } from '../components/LostReasonModal';
import MatriculaModal from '../components/MatriculaModal';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const normalizeDayToken = (t) => t.toLowerCase().trim().replace(/á/g, 'a').slice(0, 3);
const dayTokenToIndex = (tok) => {
    const n = normalizeDayToken(tok);
    return WEEK.findIndex(x => x === n);
};
const parseQuickItems = (arr) => {
    return arr.map(entry => {
        const raw = String(entry).trim();
        if (!raw) return { days: null, label: '', value: '' };
        const firstSpace = raw.indexOf(' ');
        let days = null;
        let timePart = raw;
        if (firstSpace > 0) {
            const possibleDays = raw.slice(0, firstSpace);
            const rest = raw.slice(firstSpace + 1).trim();
            const looksLikeDays = /^[A-Za-zçÇáÁéÉíÍóÓúÚãÃõÕêÊôÔàÀ,\s]+$/.test(possibleDays);
            if (looksLikeDays && rest) {
                const tokens = possibleDays.split(',').map(t => t.trim()).filter(Boolean);
                const idxs = tokens.map(dayTokenToIndex).filter(i => i >= 0);
                if (idxs.length > 0) {
                    days = Array.from(new Set(idxs));
                    timePart = rest;
                }
            }
        }
        const label = timePart;
        return { days, label, value: timePart };
    }).filter(it => it.label);
};
const parseTimeToMinutes = (t) => {
    const parts = t.split(':');
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) || 0;
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
    return Number.MAX_SAFE_INTEGER;
};
const timeStartMinutes = (timePart) => {
    const norm = timePart.replace('–', '-');
    const start = norm.split('-')[0].trim();
    return parseTimeToMinutes(start);
};

/** Ordem: Novo → Experimental (id técnico Aula experimental) → Não compareceu → Matrícula → Perdidos */
const DEFAULT_STAGE_LABELS = [
    { id: 'Novo', label: 'Novo' },
    { id: 'Aula experimental', label: 'Experimental' },
    { id: LEAD_STATUS.MISSED, label: 'Não compareceu' },
    { id: 'Matriculado', label: 'Matrícula' },
    { id: LEAD_STATUS.LOST, label: 'Perdidos' },
];
const STAGE_COLORS = [
    { color: 'var(--accent)', bg: 'var(--accent-light)' },
    { color: 'var(--warning)', bg: 'var(--warning-light)' },
    { color: 'var(--danger)', bg: 'var(--danger-light)' },
    { color: 'var(--success)', bg: 'var(--success-light)' },
    { color: 'var(--purple)', bg: 'var(--purple-light)' },
];
const DEFAULT_STAGE_SLA_DAYS = 3;
const KANBAN_SCROLL_EDGE = 36;
const KANBAN_SCROLL_MAX_STEP = 14;

const normalizeKanbanPhone = (v) => String(v || '').replace(/\D/g, '');

const leadMatchesProfileFilter = (lead, profileFilter) => {
    if (profileFilter === 'all') return true;
    const t = String(lead?.type || 'Adulto').trim();
    if (profileFilter === 'Adulto') return t === 'Adulto';
    if (profileFilter === 'Criança') return t === 'Criança';
    if (profileFilter === 'Juniores') return t === 'Juniores';
    return true;
};

const leadMatchesContactType = (lead) => {
    const contactType = String(lead?.contact_type || '').trim();
    return !contactType || contactType === 'lead';
};

const Pipeline = () => {
    const navigate = useNavigate();
    const { leads, importLeads, updateLead, fetchMoreLeads, deleteLead } = useLeadStore();
    const labels = useLeadStore((s) => s.labels);
    const academyId = useLeadStore((s) => s.academyId);
    const leadsLoading = useLeadStore((s) => s.loading);
    const leadsHasMore = useLeadStore((s) => s.leadsHasMore);
    const loadingMore = useLeadStore((s) => s.loadingMore);
    const getLeadById = useLeadStore((s) => s.getLeadById);
    const kanbanWrapperRef = useRef(null);
    const dragScrollRafRef = useRef(null);
    const lastDragClientXRef = useRef(null);
    const [showImport, setShowImport] = useState(false);
    const [quickItems, setQuickItems] = useState([]);
    const [toast, setToast] = useState('');
    const [expanded, setExpanded] = useState({});
    const [dragOver, setDragOver] = useState(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteLead, setNoteLead] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [schedulerOpenId, setSchedulerOpenId] = useState(null);
    const [moverOpenId, setMoverOpenId] = useState(null);
    const [lostModal, setLostModal] = useState(null);
    const [stages, setStages] = useState(DEFAULT_STAGE_LABELS);
    const [editStages, setEditStages] = useState(false);
    const [tempStages, setTempStages] = useState(DEFAULT_STAGE_LABELS);
    const [originFilter, setOriginFilter] = useState('all'); // all | origin
    const [kanbanSearch, setKanbanSearch] = useState('');
    const [profileFilter, setProfileFilter] = useState('all'); // all | Adulto | Criança | Juniores
    const [searchStageScope, setSearchStageScope] = useState('all');
    const [openMenuId, setOpenMenuId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [lostModalLead, setLostModalLead] = useState(null);
    const [dragTargetLead, setDragTargetLead] = useState(null);
    const [matriculaModalOpen, setMatriculaModalOpen] = useState(false);
    const [searchingServer, setSearchingServer] = useState(false);
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [quickFilter, setQuickFilter] = useState(null);

    const searchStageScopeOptions = useMemo(() => [
        { value: 'all', label: 'Todas as etapas' },
        ...stages.map((s) => ({
            value: s.id,
            label: String(s.label || s.id).trim() || s.id,
        })),
    ], [stages]);

    useEffect(() => {
        setSearchStageScope((prev) => {
            if (prev === 'all') return prev;
            const ids = new Set(stages.map((s) => s.id));
            return ids.has(prev) ? prev : 'all';
        });
    }, [stages]);

    useEffect(() => {
        const handleClickOutside = () => setOpenMenuId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleSearch = async (term) => {
        setKanbanSearch(term);

        if (!term || term.trim().length < 2) return;

        const localResults = leads.filter(l =>
            l.name?.toLowerCase().includes(term.toLowerCase()) ||
            normalizeKanbanPhone(l.phone).includes(normalizeKanbanPhone(term))
        );

        if (localResults.length === 0) {
            setSearchingServer(true);
            try {
                await useLeadStore.getState().fetchLeads({
                    reset: true,
                    search: term,
                });
            } finally {
                setSearchingServer(false);
            }
        }
    };

    const handleCopyPhone = (e, lead) => {
        e.stopPropagation();
        navigator.clipboard.writeText(lead.phone || '');
        setCopiedId(lead.id);
        setOpenMenuId(null);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleMarkAsLost = (e, lead) => {
        e.stopPropagation();
        setOpenMenuId(null);
        setLostModalLead(lead);
    };

    const handleDeleteLead = (e, leadId) => {
        e.stopPropagation();
        setOpenMenuId(null);
        if (window.confirm('Tem certeza que deseja excluir este lead?')) {
            deleteLead(leadId);
        }
    };

    const stepKanbanScrollFromClientX = (clientX) => {
        const el = kanbanWrapperRef.current;
        if (!el || typeof clientX !== 'number') return;
        const rect = el.getBoundingClientRect();
        let dx = 0;
        if (clientX < rect.left + KANBAN_SCROLL_EDGE) {
            dx = -Math.min(KANBAN_SCROLL_MAX_STEP, rect.left + KANBAN_SCROLL_EDGE - clientX);
        } else if (clientX > rect.right - KANBAN_SCROLL_EDGE) {
            dx = Math.min(KANBAN_SCROLL_MAX_STEP, clientX - (rect.right - KANBAN_SCROLL_EDGE));
        }
        if (dx !== 0) el.scrollLeft += dx;
    };

    const runDragScrollLoop = () => {
        dragScrollRafRef.current = null;
        const x = lastDragClientXRef.current;
        if (x == null) return;
        const el = kanbanWrapperRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const inHotZone = x < rect.left + KANBAN_SCROLL_EDGE || x > rect.right - KANBAN_SCROLL_EDGE;
        if (!inHotZone) return;
        stepKanbanScrollFromClientX(x);
        dragScrollRafRef.current = requestAnimationFrame(runDragScrollLoop);
    };

    const onKanbanWrapperDragOverCapture = (e) => {
        e.preventDefault();
        lastDragClientXRef.current = e.clientX;
        stepKanbanScrollFromClientX(e.clientX);
        if (dragScrollRafRef.current == null) {
            dragScrollRafRef.current = requestAnimationFrame(runDragScrollLoop);
        }
    };

    useEffect(() => {
        const clearDragScroll = () => {
            lastDragClientXRef.current = null;
            if (dragScrollRafRef.current != null) {
                cancelAnimationFrame(dragScrollRafRef.current);
                dragScrollRafRef.current = null;
            }
        };
        const onDocDragOver = (e) => {
            lastDragClientXRef.current = e.clientX;
        };
        document.addEventListener('dragend', clearDragScroll);
        document.addEventListener('drop', clearDragScroll);
        document.addEventListener('dragover', onDocDragOver);
        return () => {
            document.removeEventListener('dragend', clearDragScroll);
            document.removeEventListener('drop', clearDragScroll);
            document.removeEventListener('dragover', onDocDragOver);
            clearDragScroll();
        };
    }, []);

    useEffect(() => {
        if (!academyId) return;
        useLeadStore.getState().fetchLeads({ reset: true });
    }, [academyId]);

    const handleLoadMoreLeads = async () => {
        if (loadingMore || leadsLoading || !leadsHasMore) return;
        await fetchMoreLeads();
    };

    const handleImport = (rows) => {
        importLeads(rows);
    };
    const singular = (plural) => {
        if (!plural) return 'Lead';
        const p = String(plural).trim();
        if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1);
        return p;
    };
    const slug = (txt) => String(txt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    useEffect(() => {
        if (!academyId) return;
        const ensureSpecialColumns = (cols) => {
            const base = Array.isArray(cols) ? cols.filter(Boolean) : [];
            const ids = new Set(base.map((c) => String(c?.id || '').trim()).filter(Boolean));
            const out = [...base];
            if (!ids.has(LEAD_STATUS.MISSED)) out.push({ id: LEAD_STATUS.MISSED, label: 'Não compareceu' });
            if (!ids.has(LEAD_STATUS.LOST)) out.push({ id: LEAD_STATUS.LOST, label: 'Perdidos' });
            return out;
        };
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then(doc => {
                let raw = [];
                if (Array.isArray(doc.quickTimes)) raw = doc.quickTimes;
                else if (typeof doc.quickTimes === 'string' && doc.quickTimes.trim()) raw = doc.quickTimes.split(',').map(s => s.trim()).filter(Boolean);
                const parsed = parseQuickItems(raw);
                if (parsed.length > 0) setQuickItems(parsed);
                else setQuickItems(parseQuickItems(['18:00', '19:00']));
                try {
                    if (doc.stagesConfig) {
                        const conf = typeof doc.stagesConfig === 'string' ? JSON.parse(doc.stagesConfig) : doc.stagesConfig;
                        if (Array.isArray(conf) && conf.length > 0) {
                            const normalized = ensureSpecialColumns(conf);
                            setStages(normalized);
                            setTempStages(normalized);
                        } else {
                            const normalized = ensureSpecialColumns(DEFAULT_STAGE_LABELS);
                            setStages(normalized);
                            setTempStages(normalized);
                        }
                    } else {
                        const normalized = ensureSpecialColumns(DEFAULT_STAGE_LABELS);
                        setStages(normalized);
                        setTempStages(normalized);
                    }
                } catch {
                    const normalized = ensureSpecialColumns(DEFAULT_STAGE_LABELS);
                    setStages(normalized);
                    setTempStages(normalized);
                }
            })
            .catch(() => {});
    }, [academyId]);

    const getDayIndex = (date) => date.getDay();
    const itemsForDay = (key) => {
        const base = new Date();
        if (key === 'tomorrow') base.setDate(base.getDate() + 1);
        const idx = getDayIndex(base);
        const list = quickItems.filter(it => !it.days || it.days.includes(idx));
        list.sort((a, b) => timeStartMinutes(a.value) - timeStartMinutes(b.value));
        return list;
    };

    const toYMD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const handleWhatsApp = (e, lead) => {
        e.stopPropagation();
        const clean = (lead.phone || '').replace(/\D/g, '');
        const sugArr = itemsForDay('today').slice(0, 2).map(it => it.label);
        const sug = sugArr.join('/');
        const firstName = String(lead?.name || '').trim().split(/\s+/)[0] || 'Aluno';
        const msg = (lead?.status === LEAD_STATUS.MISSED)
            ? `Olá ${firstName}, sentimos sua ausência na aula combinada. Quer reagendar? Tenho hoje às ${sug} ou amanhã nos mesmos horários.`
            : `Olá ${firstName}! Tudo bem? Quer agendar uma aula experimental? Tenho horários hoje às ${sug} ou amanhã nos mesmos horários.`;
        const url = `https://wa.me/55${clean}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    const handleReschedule = async (e, lead, day, time) => {
        e.stopPropagation();
        const base = new Date();
        if (day === 'tomorrow') base.setDate(base.getDate() + 1);
        const ymd = toYMD(base);
        try {
            const existing = Array.isArray(lead.notes) ? lead.notes : [];
            const event = { type: 'schedule', date: ymd, time, at: new Date().toISOString(), by: 'user' };
            const newNotes = [...existing, event];
            await updateLead(lead.id, { status: LEAD_STATUS.SCHEDULED, scheduledDate: ymd, scheduledTime: time, pipelineStage: 'Aula experimental', notes: newNotes });
        } catch {
            await updateLead(lead.id, { status: LEAD_STATUS.SCHEDULED, scheduledDate: ymd, scheduledTime: time, pipelineStage: 'Aula experimental' });
        }
        const label = day === 'tomorrow' ? 'amanhã' : 'hoje';
        setToast(`Reagendado para ${label} ${time}`);
        setTimeout(() => setToast(''), 2500);
    };
    const MAX_CHIPS = 4;
    const isExpanded = (leadId) => !!expanded[leadId];
    const toggleExpanded = (e, leadId) => {
        e.stopPropagation();
        setExpanded(prev => ({ ...prev, [leadId]: !prev[leadId] }));
    };
    const openScheduler = (e, leadId) => {
        e.stopPropagation();
        setSchedulerOpenId(prev => prev === leadId ? null : leadId);
        setMoverOpenId(null);
    };
    const openMover = (e, leadId) => {
        e.stopPropagation();
        setMoverOpenId(prev => prev === leadId ? null : leadId);
        setSchedulerOpenId(null);
    };
    const openLostModal = (leadId, onConfirm) => {
        const lead = getLeadById(leadId);
        setLostModal({ leadId, leadName: lead?.name || 'Lead', onConfirm });
    };
    const moveToStatus = async (e, leadId, stageId) => {
        e.stopPropagation();
        const lead = getLeadById(leadId);

        if (stageId === 'Matriculado') {
            setDragTargetLead(lead);
            setMatriculaModalOpen(true);
            setMoverOpenId(null);
            return;
        }

        if (stageId === LEAD_STATUS.MISSED) {
            const ok = window.confirm(`Mover "${lead?.name || 'Sem nome'}" para "Não compareceu"? Isso marca o status como Não Compareceu.`);
            if (!ok) return;
            await updateLead(leadId, { status: LEAD_STATUS.MISSED, pipelineStage: LEAD_STATUS.MISSED });
            setMoverOpenId(null);
            setToast('Marcado como não compareceu');
            setTimeout(() => setToast(''), 2000);
            return;
        }
        if (stageId === LEAD_STATUS.LOST) {
            openLostModal(leadId, async (lostReason) => {
                const cur = getLeadById(leadId) || lead;
                const existing = Array.isArray(cur?.notes) ? cur.notes : [];
                const event = {
                    type: 'stage_change',
                    from: cur?.status || '',
                    to: LEAD_STATUS.LOST,
                    at: new Date().toISOString(),
                    by: 'user',
                };
                const newNotes = [...existing, event];
                await updateLead(leadId, {
                    status: LEAD_STATUS.LOST,
                    scheduledDate: '',
                    scheduledTime: '',
                    pipelineStage: LEAD_STATUS.LOST,
                    lostReason,
                    notes: newNotes,
                });
                setMoverOpenId(null);
                setToast('Marcado como perdido');
                setTimeout(() => setToast(''), 2000);
            });
            return;
        }
        try {
            const existing = Array.isArray(lead?.notes) ? lead.notes : [];
            const event = { type: 'pipeline_change', from: lead?.pipelineStage || '', to: stageId, at: new Date().toISOString(), by: 'user' };
            const newNotes = [...existing, event];
            await updateLead(leadId, { pipelineStage: stageId, notes: newNotes });
        } catch {
            await updateLead(leadId, { pipelineStage: stageId });
        }
        setMoverOpenId(null);
        setToast('Movido no pipeline');
        setTimeout(() => setToast(''), 2000);
    };
    const saveStages = async () => {
        try {
            const cleaned = tempStages
                .filter(s => s && String(s.id).trim())
                .map((s) => ({
                    id: String(s.id).trim(),
                    label: String(s.label || s.id).trim(),
                    slaDays: Number.isFinite(s.slaDays) ? s.slaDays : DEFAULT_STAGE_SLA_DAYS,
                }));
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                stagesConfig: JSON.stringify(cleaned),
            });
            setStages(cleaned);
            setEditStages(false);
        } catch (e) {
            console.error('saveStages error', e);
        }
    };
    const addStage = () => {
        const id = `custom-${Date.now()}`;
        setTempStages(prev => [...prev, { id, label: 'Nova etapa', slaDays: DEFAULT_STAGE_SLA_DAYS }]);
    };
    const mapLeadToStageId = useCallback((lead) => {
        if (lead?.status === LEAD_STATUS.MISSED) return LEAD_STATUS.MISSED;
        if (lead?.status === LEAD_STATUS.LOST) return LEAD_STATUS.LOST;
        if (lead?.status === LEAD_STATUS.CONVERTED) return 'Matriculado';

        let stage = lead?.pipelineStage ? String(lead.pipelineStage).trim() : '';
        if (stage === 'Contato feito') stage = 'Novo';
        if (stage === 'Negociação') stage = 'Matriculado';

        if (stage) {
            const known = stages.some((col) => col.id === stage);
            if (known) return stage;
            const st = (lead.status || '').toLowerCase();
            if (st.includes('compareceu')) return 'Matriculado';
            if (st.includes('agendado')) return 'Aula experimental';
            if (st.includes('matricul')) return 'Matriculado';
            return 'Novo';
        }

        const hasDirect = stages.find(s => s.id === lead.status);
        if (hasDirect) return lead.status;
        const s = (lead.status || '').toLowerCase();
        if (s === (LEAD_STATUS.NEW || '').toLowerCase() || s === 'novo') return 'Novo';
        if (s.includes('agendado')) return 'Aula experimental';
        if (s.includes('compareceu')) return 'Matriculado';
        if (s.includes('não compareceu') || s.includes('nao compareceu')) return LEAD_STATUS.MISSED;
        if (s.includes('não fechou') || s.includes('nao fechou') || s.includes('perdid')) return LEAD_STATUS.LOST;
        if (s.includes('matricul')) return 'Matriculado';
        return 'Novo';
    }, [stages]);

    const filterByDate = useCallback((lead) => {
        let from = filterDateFrom;
        let to = filterDateTo;

        if (quickFilter === 'today') {
            const today = new Date().toISOString().split('T')[0];
            from = today; to = today;
        } else if (quickFilter === 'week') {
            const now = new Date();
            from = new Date(now.setDate(now.getDate() - now.getDay()))
                .toISOString().split('T')[0];
            to = new Date(now.setDate(now.getDate() + 6))
                .toISOString().split('T')[0];
        } else if (quickFilter === 'month') {
            const now = new Date();
            from = new Date(now.getFullYear(), now.getMonth(), 1)
                .toISOString().split('T')[0];
            to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
                .toISOString().split('T')[0];
        }

        if (!from && !to) return true;

        const dateRef = lead.scheduledDate || lead.createdAt?.split('T')[0];
        if (!dateRef) return false;
        if (from && dateRef < from) return false;
        if (to && dateRef > to) return false;
        return true;
    }, [filterDateFrom, filterDateTo, quickFilter]);

    const leadsForBoard = useMemo(() => {
        let list = leads
            .filter((l) => leadMatchesContactType(l))
            .filter((l) => leadMatchesProfileFilter(l, profileFilter))
            .filter(filterByDate);

        const q = String(kanbanSearch || '').trim().toLowerCase();
        const qPhone = normalizeKanbanPhone(kanbanSearch);
        if (q || qPhone) {
            list = list.filter((l) => {
                const name = String(l?.name || '').toLowerCase();
                const phoneNorm = normalizeKanbanPhone(l?.phone);
                if (qPhone && phoneNorm.includes(qPhone)) return true;
                if (q && name.includes(q)) return true;
                return false;
            });
        }

        if (searchStageScope !== 'all') {
            list = list.filter((l) => mapLeadToStageId(l) === searchStageScope);
        }

        return list;
    }, [leads, kanbanSearch, profileFilter, searchStageScope, mapLeadToStageId, filterByDate]);

    const onDragStart = (e, leadId) => {
        const el = e?.target;
        if (el && typeof el.closest === 'function') {
            if (el.closest('button') || el.closest('a') || el.closest('input') || el.closest('select') || el.closest('textarea') || el.closest('.dropdown-panel') || el.closest('.action-menu-panel')) {
                e.preventDefault();
                return;
            }
        }
        e.dataTransfer.setData('text/plain', leadId);
    };
    const onDragOver = (e) => {
        e.preventDefault();
    };
    const onDragEnter = (status) => {
        setDragOver(status);
    };
    const onDragLeave = () => {
        setDragOver(null);
    };
    const onDrop = async (e, status) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;

        if (status === 'Matriculado') {
            const lead = getLeadById(id);
            setDragTargetLead(lead);
            setMatriculaModalOpen(true);
            setDragOver(null);
            return;
        }

        if (status === LEAD_STATUS.MISSED) {
            const lead = getLeadById(id);
            const ok = window.confirm(`Mover "${lead?.name || 'Sem nome'}" para "Não compareceu"? Isso marca o status como Não Compareceu.`);
            if (!ok) { setDragOver(null); return; }
            await updateLead(id, { status: LEAD_STATUS.MISSED, pipelineStage: LEAD_STATUS.MISSED });
        } else if (status === LEAD_STATUS.LOST) {
            openLostModal(id, async (lostReason) => {
                const cur = getLeadById(id);
                const existing = Array.isArray(cur?.notes) ? cur.notes : [];
                const event = {
                    type: 'stage_change',
                    from: cur?.status || '',
                    to: LEAD_STATUS.LOST,
                    at: new Date().toISOString(),
                    by: 'user',
                };
                const newNotes = [...existing, event];
                await updateLead(id, {
                    status: LEAD_STATUS.LOST,
                    scheduledDate: '',
                    scheduledTime: '',
                    pipelineStage: LEAD_STATUS.LOST,
                    lostReason,
                    notes: newNotes,
                });
                setToast('Marcado como perdido');
                setTimeout(() => setToast(''), 2000);
            });
            setDragOver(null);
            return;
        } else {
            await updateLead(id, { pipelineStage: status });
        }
        setDragOver(null);
        setToast('Movido no pipeline');
        setTimeout(() => setToast(''), 2000);
    };
    const openNote = (e, lead) => {
        e.stopPropagation();
        setNoteLead(lead);
        setNoteText('');
        setNoteOpen(true);
    };
    const saveNote = async () => {
        if (!noteLead || !noteText.trim()) {
            setNoteOpen(false);
            return;
        }
        const existing = Array.isArray(noteLead.notes) ? noteLead.notes : [];
        const newNotes = [...existing, { text: noteText, date: new Date().toISOString() }];
        await updateLead(noteLead.id, { notes: newNotes });
        setNoteOpen(false);
        setToast('Observação salva');
        setTimeout(() => setToast(''), 2000);
    };

    return (
        <div className="pipeline-container">
            <div className="pipeline-header">
                <div className="container header-layout">
                    <div className="header-left">
                        <div className="pipeline-title-block">
                            <h2 className="navi-page-title">{labels.pipeline || 'Funil'}</h2>
                            <p className="navi-eyebrow" style={{ marginTop: 6, maxWidth: '42ch' }}>Fluxo de matrícula até a conversão</p>
                        </div>
                        <div className="filters">
                            <div className="pipeline-search-row">
                                <div className="pipeline-search-wrap" title="Filtra por nome ou telefone">
                                    <Search size={14} className="pipeline-search-icon" aria-hidden />
                                    <input
                                        type="search"
                                        className="pipeline-search-input"
                                        value={kanbanSearch}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        placeholder="Buscar nome ou telefone…"
                                        aria-label="Buscar no funil"
                                    />
                                    {searchingServer && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--accent)', marginLeft: '4px', whiteSpace: 'nowrap' }}>
                                            Buscando...
                                        </div>
                                    )}
                                </div>
                                <div
                                    className="origin-group pipeline-search-scope-group"
                                    title="Restringe resultados da busca a uma coluna do funil. Com “Todas as etapas”, a busca vale em todas as colunas."
                                >
                                    <span className="pipeline-search-scope-label">Buscar em:</span>
                                    <select
                                        className="origin-select pipeline-search-scope-select"
                                        value={searchStageScope}
                                        onChange={(e) => setSearchStageScope(e.target.value)}
                                        aria-label="Etapa para busca"
                                    >
                                        {searchStageScopeOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="origin-group" title="Filtra por perfil do lead em todas as colunas">
                                <select
                                    className="origin-select"
                                    value={profileFilter}
                                    onChange={(e) => setProfileFilter(e.target.value)}
                                    aria-label="Filtrar por perfil"
                                >
                                    <option value="all">Todos os perfis</option>
                                    <option value="Adulto">Adulto</option>
                                    <option value="Criança">Criança</option>
                                    <option value="Juniores">Júnior</option>
                                </select>
                            </div>
                            <div className="origin-group">
                                <SlidersHorizontal size={14} />
                                <select className="origin-select" value={originFilter} onChange={(e) => setOriginFilter(e.target.value)}>
                                    <option value="all">Todas origens</option>
                                    {LEAD_ORIGIN.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <div className="origin-group" style={{ gap: '4px' }}>
                                <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', paddingLeft: '4px' }}>Data:</label>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button className={`time-chip-mini ${quickFilter === 'today' ? 'active' : ''}`} style={quickFilter === 'today' ? { background: 'var(--accent-light)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}} onClick={() => { setQuickFilter('today'); setFilterDateFrom(''); setFilterDateTo(''); }}>Hoje</button>
                                    <button className={`time-chip-mini ${quickFilter === 'week' ? 'active' : ''}`} style={quickFilter === 'week' ? { background: 'var(--accent-light)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}} onClick={() => { setQuickFilter('week'); setFilterDateFrom(''); setFilterDateTo(''); }}>Esta sem.</button>
                                    <button className={`time-chip-mini ${quickFilter === 'month' ? 'active' : ''}`} style={quickFilter === 'month' ? { background: 'var(--accent-light)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}} onClick={() => { setQuickFilter('month'); setFilterDateFrom(''); setFilterDateTo(''); }}>Este mês</button>
                                    <button className={`time-chip-mini ${quickFilter === null && !filterDateFrom && !filterDateTo ? 'active' : ''}`} style={quickFilter === null && !filterDateFrom && !filterDateTo ? { background: 'var(--accent-light)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}} onClick={() => { setQuickFilter(null); setFilterDateFrom(''); setFilterDateTo(''); }}>Todos</button>
                                </div>
                                <input
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={e => { setFilterDateFrom(e.target.value); setQuickFilter(null); }}
                                    style={{ border: 'none', background: 'transparent', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, padding: '0 4px', maxWidth: '100px' }}
                                />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>a</span>
                                <input
                                    type="date"
                                    value={filterDateTo}
                                    onChange={e => { setFilterDateTo(e.target.value); setQuickFilter(null); }}
                                    style={{ border: 'none', background: 'transparent', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, padding: '0 4px', maxWidth: '100px' }}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="header-right">
                        {leadsHasMore ? (
                            <button
                                type="button"
                                className="import-btn-pipe pipeline-load-more"
                                onClick={handleLoadMoreLeads}
                                disabled={loadingMore || leadsLoading}
                                title="Carregar próximos leads do servidor"
                            >
                                {loadingMore ? 'Carregando…' : 'Carregar mais'}
                            </button>
                        ) : null}
                        <ExportButton leads={leads} fileName={`${slug(labels.leads)}-pipeline`} label="Exportar" />
                        <button className="import-btn-pipe" onClick={() => setShowImport(true)}>
                            <Upload size={16} /> {`Importar ${labels.leads}`}
                        </button>
                        <button className="import-btn-pipe" onClick={() => { setEditStages(prev => !prev); setTempStages(stages); }}>
                            <SlidersHorizontal size={16} /> Etapas
                        </button>
                    </div>
                </div>
                {editStages && (
                    <div className="container stage-editor">
                        <div className="stage-editor-head">
                            <span>Nome da etapa</span>
                            <span title="Alerta quando o interessado permanece mais dias que o limite nesta etapa">SLA (dias)</span>
                        </div>
                        {tempStages.map((st, idx) => (
                            <div className="stage-row" key={st.id}>
                                <input
                                    className="stage-input"
                                    value={st.label}
                                    disabled={st.id === LEAD_STATUS.MISSED || st.id === LEAD_STATUS.LOST}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setTempStages(prev => prev.map((s, i) => i === idx ? { ...s, label: v } : s));
                                    }}
                                />
                                <input
                                    className="stage-sla"
                                    type="number"
                                    min="1"
                                    value={st.slaDays ?? DEFAULT_STAGE_SLA_DAYS}
                                    disabled={st.id === LEAD_STATUS.MISSED || st.id === LEAD_STATUS.LOST}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        setTempStages(prev => prev.map((s, i) => i === idx ? { ...s, slaDays: v } : s));
                                    }}
                                    title="SLA (dias)"
                                />
                            </div>
                        ))}
                        <div className="stage-actions">
                            <button className="btn-secondary" onClick={addStage}><PlusCircle size={14} /> Adicionar etapa</button>
                            <button
                                type="button"
                                className="btn-outline"
                                title="Substitui a lista de etapas pelo modelo de 5 colunas. Clique em Salvar para gravar."
                                onClick={() => {
                                    const ok = window.confirm('Aplicar o modelo de funil com 5 etapas (Novo → Experimental → Não compareceu → Matrícula → Perdidos)? As etapas atuais serão substituídas neste editor até você salvar.');
                                    if (!ok) return;
                                    setTempStages(DEFAULT_STAGE_LABELS.map((s) => ({ ...s, slaDays: s.slaDays ?? DEFAULT_STAGE_SLA_DAYS })));
                                }}
                            >
                                Funil 5 etapas
                            </button>
                            <div className="grow"></div>
                            <button className="btn-outline" onClick={() => setEditStages(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={saveStages}>Salvar</button>
                        </div>
                    </div>
                )}
            </div>

            <div
                ref={kanbanWrapperRef}
                className="kanban-wrapper"
                onDragOverCapture={onKanbanWrapperDragOverCapture}
            >
                {stages.map((col, idx) => {
                    const color = STAGE_COLORS[idx % STAGE_COLORS.length];
                    const colLeads = leadsForBoard
                      .filter(l => mapLeadToStageId(l) === col.id)
                      .filter(l => originFilter === 'all' ? true : (l.origin || '') === originFilter)
                      .sort((a, b) => {
                        const toDateTime = (lead) => {
                          const base = lead.scheduledDate || lead.createdAt || '';
                          if (!base) return new Date(8640000000000000);
                          const [y, m, d] = base.split('T')[0].split('-').map(Number);
                          let hh = 23, mm = 59;
                          if (lead.scheduledTime && /^\d{2}:\d{2}$/.test(lead.scheduledTime)) {
                            const [h, mi] = lead.scheduledTime.split(':').map(Number);
                            if (Number.isFinite(h) && Number.isFinite(mi)) {
                              hh = h; mm = mi;
                            }
                          }
                          return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
                        };
                        return toDateTime(a) - toDateTime(b);
                      });
                    return (
                        <div
                            key={col.id}
                            className={`kanban-column ${dragOver === col.id ? 'drop-target' : ''}`}
                            onDragOver={onDragOver}
                            onDragEnter={() => onDragEnter(col.id)}
                            onDragLeave={onDragLeave}
                            onDrop={(e) => onDrop(e, col.id)}
                        >
                            <div className="col-header">
                                <div className="col-header-titles">
                                    <div className="flex items-center gap-2">
                                        <span className="col-dot" style={{ background: color.color }}></span>
                                        <h3 className="navi-section-heading pipeline-col-heading">{col.label}</h3>
                                    </div>
                                </div>
                                <span className="col-count" style={{ background: color.bg, color: color.color }}>
                                    {colLeads.length}
                                </span>
                            </div>

                            <div className="col-content">
                                {colLeads.map((lead, i) => (
                                    <div
                                        key={lead.id}
                                        className="card lead-card animate-in"
                                        style={{ 
                                            animationDelay: `${0.03 * i}s`,
                                            zIndex: (openMenuId === lead.id || schedulerOpenId === lead.id || moverOpenId === lead.id) ? 20 : 1
                                        }}
                                        onClick={() => navigate(`/lead/${lead.id}`)}
                                        draggable={!(schedulerOpenId === lead.id || moverOpenId === lead.id)}
                                        onDragStart={(e) => onDragStart(e, lead.id)}
                                    >
                                        <div className="lead-card-title-row lead-card-title-row--name-only">
                                            <span className="lead-card-name" title={String(lead.name || '').trim() || undefined}>
                                                {lead.name}
                                            </span>
                                        </div>
                                        <div className="lead-meta mt-2 flex items-center gap-2 flex-wrap">
                                            <Phone size={12} /> {lead.phone}
                                            {normalizeKanbanPhone(lead.phone) ? (
                                                <Link
                                                    to={`/inbox?phone=${encodeURIComponent(normalizeKanbanPhone(lead.phone))}`}
                                                    className="lead-inbox-link"
                                                    draggable={false}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    Atendimento
                                                </Link>
                                            ) : null}
                                        </div>
                                        <div className="lead-meta mt-1 flex items-center gap-2">
                                            {lead.hotLead ? <span className="type-pill">🔥</span> : null}
                                            {lead.needHuman ? <span className="type-pill">Precisa resposta</span> : null}
                                            {lead.intention ? <span className="type-pill">{lead.intention}</span> : null}
                                            {lead.priority ? <span className="type-pill">{lead.priority}</span> : null}
                                        </div>
                                        {lead.scheduledDate && (
                                            <div className="lead-meta mt-1 flex items-center gap-2">
                                                <Calendar size={12} /> {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')} {lead.scheduledTime && `às ${lead.scheduledTime}`}
                                            </div>
                                        )}
                                        {lead.status === LEAD_STATUS.LOST && lead.lostReason ? (
                                            <div className="lead-meta mt-1">
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--text-muted)',
                                                        background: 'var(--surface-hover)',
                                                        borderRadius: 4,
                                                        padding: '2px 6px',
                                                        display: 'inline-block',
                                                    }}
                                                >
                                                    {lead.lostReason}
                                                </span>
                                            </div>
                                        ) : null}
                                        <div className="action-bar action-bar--icons mt-2">
                                            <button
                                                type="button"
                                                className="action-btn action-btn--icon"
                                                draggable={false}
                                                title="WhatsApp"
                                                aria-label="Abrir WhatsApp"
                                                onClick={(e) => handleWhatsApp(e, lead)}
                                            >
                                                <MessageCircle size={17} strokeWidth={2} aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                className="action-btn action-btn--icon"
                                                draggable={false}
                                                title="Agendar"
                                                aria-label="Agendar"
                                                onClick={(e) => openScheduler(e, lead.id)}
                                            >
                                                <Calendar size={17} strokeWidth={2} aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                className="action-btn action-btn--icon"
                                                draggable={false}
                                                title="Mover de etapa"
                                                aria-label="Mover de etapa"
                                                onClick={(e) => openMover(e, lead.id)}
                                            >
                                                <ChevronRight size={17} strokeWidth={2} aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                className="action-btn action-btn--icon"
                                                draggable={false}
                                                title="Observação"
                                                aria-label="Adicionar observação"
                                                onClick={(e) => openNote(e, lead)}
                                            >
                                                <StickyNote size={17} strokeWidth={2} aria-hidden />
                                            </button>
                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenMenuId(openMenuId === lead.id ? null : lead.id);
                                                    }}
                                                    title="Mais ações"
                                                    className="action-btn action-btn--icon"
                                                    draggable={false}
                                                >
                                                    ⋯
                                                </button>
                                                {openMenuId === lead.id && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        right: 0,
                                                        zIndex: 100,
                                                        background: 'white',
                                                        border: '1px solid #eee',
                                                        borderRadius: '8px',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                        minWidth: '180px',
                                                        overflow: 'hidden',
                                                    }} onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={(e) => handleCopyPhone(e, lead)}
                                                            style={{
                                                                display: 'block',
                                                                width: '100%',
                                                                padding: '10px 16px',
                                                                textAlign: 'left',
                                                                background: 'none',
                                                                border: 'none',
                                                                borderBottom: '1px solid #f5f5f5',
                                                                cursor: 'pointer',
                                                                color: '#333',
                                                                fontSize: '14px',
                                                            }}
                                                        >
                                                            {copiedId === lead.id ? '✓ Copiado!' : 'Copiar telefone'}
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleMarkAsLost(e, lead)}
                                                            style={{
                                                                display: 'block',
                                                                width: '100%',
                                                                padding: '10px 16px',
                                                                textAlign: 'left',
                                                                background: 'none',
                                                                border: 'none',
                                                                borderBottom: '1px solid #f5f5f5',
                                                                cursor: 'pointer',
                                                                color: '#E65100',
                                                                fontSize: '14px',
                                                            }}
                                                        >
                                                            Marcar como perdido
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeleteLead(e, lead.id)}
                                                            style={{
                                                                display: 'block',
                                                                width: '100%',
                                                                padding: '10px 16px',
                                                                textAlign: 'left',
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: '#E53935',
                                                                fontSize: '14px',
                                                            }}
                                                        >
                                                            Excluir lead
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {schedulerOpenId === lead.id && (
                                            <div className="dropdown-panel" onClick={(e) => e.stopPropagation()}>
                                                <div className="dropdown-section">
                                                    <div className="dropdown-label">Hoje</div>
                                                    <div className="dropdown-times">
                                                        {(isExpanded(lead.id) ? itemsForDay('today') : itemsForDay('today').slice(0, MAX_CHIPS)).map((it, idx) => (
                                                            <button key={`t-${lead.id}-${idx}`} className="time-chip-mini" onClick={(e) => handleReschedule(e, lead, 'today', it.value)}>{it.label}</button>
                                                        ))}
                                                        {itemsForDay('today').length > MAX_CHIPS && (
                                                            <button className="more-btn" onClick={(e) => toggleExpanded(e, lead.id)}>
                                                                {isExpanded(lead.id) ? 'Menos' : `+${itemsForDay('today').length - MAX_CHIPS}`}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="dropdown-section">
                                                    <div className="dropdown-label">Amanhã</div>
                                                    <div className="dropdown-times">
                                                        {(isExpanded(lead.id) ? itemsForDay('tomorrow') : itemsForDay('tomorrow').slice(0, MAX_CHIPS)).map((it, idx) => (
                                                            <button key={`m-${lead.id}-${idx}`} className="time-chip-mini" onClick={(e) => handleReschedule(e, lead, 'tomorrow', it.value)}>{it.label}</button>
                                                        ))}
                                                        {itemsForDay('tomorrow').length > MAX_CHIPS && (
                                                            <button className="more-btn" onClick={(e) => toggleExpanded(e, lead.id)}>
                                                                {isExpanded(lead.id) ? 'Menos' : `+${itemsForDay('tomorrow').length - MAX_CHIPS}`}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {moverOpenId === lead.id && (
                                            <div className="dropdown-panel" onClick={(e) => e.stopPropagation()}>
                                                {stages.map(s => {
                                                    const active = (mapLeadToStageId(lead) === s.id);
                                                    return (
                                                        <button
                                                            key={`${lead.id}-${s.id}`}
                                                            className={`dropdown-item${active ? ' active' : ''}`}
                                                            draggable={false}
                                                            onClick={(e) => moveToStatus(e, lead.id, s.id)}
                                                        >
                                                            {s.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {colLeads.length === 0 && (() => {
                                    const scopeLabel = searchStageScopeOptions.find((o) => o.value === searchStageScope)?.label || '';
                                    const hasSearchQuery = Boolean(String(kanbanSearch || '').trim() || normalizeKanbanPhone(kanbanSearch));
                                    const inStageScope = searchStageScope === 'all' || col.id === searchStageScope;
                                    let hint = 'Arraste um card de outra coluna ou use “Novo” no menu para cadastrar.';
                                    if (searchStageScope !== 'all' && col.id !== searchStageScope) {
                                        hint = `“Buscar em” está em “${scopeLabel}”. Troque para “Todas as etapas” para ver todas as colunas.`;
                                    } else if (hasSearchQuery && inStageScope) {
                                        hint = 'Nenhum resultado para nome ou telefone. Ajuste a busca ou a etapa em “Buscar em”.';
                                    }
                                    return (
                                        <div className="col-empty">
                                            <p>{`Nenhum ${singular(labels.leads).toLowerCase()} nesta etapa`}</p>
                                            <p className="col-empty-hint">{hint}</p>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {lostModal ? (
                <LostReasonModal
                    leadName={lostModal.leadName}
                    onCancel={() => setLostModal(null)}
                    onConfirm={async (reason) => {
                        try {
                            await lostModal.onConfirm(reason);
                        } catch (err) {
                            setToast(err?.message || 'Erro ao salvar');
                            setTimeout(() => setToast(''), 3500);
                        } finally {
                            setLostModal(null);
                        }
                    }}
                />
            ) : null}

            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.NEW}
                title={`Importar ${labels.leads}`}
            />

            <MatriculaModal
                isOpen={matriculaModalOpen}
                onClose={() => {
                    setMatriculaModalOpen(false);
                    setDragTargetLead(null);
                }}
                onConfirmSimple={async () => {
                    setMatriculaModalOpen(false);
                    if (dragTargetLead) {
                        await updateLead(dragTargetLead.id, {
                            status: LEAD_STATUS.CONVERTED,
                            contact_type: 'student',
                            pipelineStage: 'Matriculado',
                        });
                        setToast('Lead matriculado com sucesso!');
                        setTimeout(() => setToast(''), 2000);
                        setDragTargetLead(null);
                    }
                }}
                onConfirmFull={() => {
                    setMatriculaModalOpen(false);
                    if (dragTargetLead) {
                        navigate(`/lead/${dragTargetLead.id}`);
                    }
                    setDragTargetLead(null);
                }}
            />

            {lostModalLead && (
                <LostReasonModal
                    isOpen={!!lostModalLead}
                    leadName={lostModalLead?.name || 'Lead'}
                    onClose={() => setLostModalLead(null)}
                    onConfirm={async (reason) => {
                        const cur = lostModalLead;
                        const existing = Array.isArray(cur?.notes) ? cur.notes : [];
                        const event = {
                            type: 'stage_change',
                            from: cur?.status || '',
                            to: LEAD_STATUS.LOST,
                            at: new Date().toISOString(),
                            by: 'user',
                        };
                        const newNotes = [...existing, event];
                        try {
                            await updateLead(cur.id, {
                                status: LEAD_STATUS.LOST,
                                scheduledDate: '',
                                scheduledTime: '',
                                pipelineStage: LEAD_STATUS.LOST,
                                lostReason: reason,
                                notes: newNotes,
                            });
                            setToast('Marcado como perdido');
                            setTimeout(() => setToast(''), 2000);
                        } catch (e) {
                            console.error(e);
                        }
                        setLostModalLead(null);
                    }}
                />
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .pipeline-container { width: 100%; display: flex; flex-direction: column; flex: 0 0 auto; min-height: 0; }
        .pipeline-header { padding: 12px 0 8px; background: var(--surface); border-bottom: 1px solid var(--border-light); overflow-x: hidden; }
        .pipeline-header .container { max-width: none; margin: 0; padding: 0 16px; }
        .header-layout { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .header-left { display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .pipeline-title-block .navi-page-title { margin: 0; }
        .pipeline-search-row { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1 1 220px; min-width: 0; }
        .pipeline-search-wrap { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--radius-full); padding: 2px 10px; background: var(--surface); min-height: 30px; flex: 1 1 140px; min-width: 0; max-width: 22rem; }
        .pipeline-search-icon { color: var(--text-muted); flex-shrink: 0; }
        .pipeline-search-input { border: none; outline: none; background: transparent; color: var(--text-secondary); font-weight: 600; font-size: 0.78rem; width: 100%; min-width: 8rem; max-width: 100%; }
        .pipeline-search-scope-group { flex: 0 1 auto; max-width: 100%; }
        .pipeline-search-scope-label { font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
        .pipeline-search-scope-select { max-width: min(11rem, 42vw); }
        .pipeline-search-input::placeholder { color: var(--text-muted); font-weight: 500; }
        .pipeline-load-more { background: var(--surface-hover) !important; color: var(--text-secondary) !important; border: 1px solid var(--border) !important; }
        .header-right { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .filters { display: inline-flex; align-items: center; gap: 8px; margin-right: 8px; flex-wrap: wrap; }
        @media (max-width: 1024px) {
          .header-layout { align-items: flex-start; }
          .header-left { width: 100%; }
          .filters { width: 100%; margin-right: 0; }
          .header-right { width: 100%; justify-content: flex-start; }
        }
        .kanban-wrapper { 
          display: flex; gap: 10px; overflow-x: auto; padding: 10px 12px 14px; flex: 0 0 auto;
          align-items: flex-start;
          scroll-snap-type: x mandatory;
          scrollbar-width: thin;
          scrollbar-gutter: stable both-edges;
        }
        .kanban-wrapper::-webkit-scrollbar {
          height: 12px;
        }
        .kanban-wrapper::-webkit-scrollbar-track {
          background: var(--surface);
          border-top: 1px solid var(--border-light);
        }
        .kanban-wrapper::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, var(--border) 0%, var(--accent) 100%);
          border-radius: 999px;
          border: 2px solid var(--surface);
        }
        .kanban-wrapper::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, var(--accent) 0%, var(--accent) 100%);
        }
        .kanban-column { 
          --kanban-col-w: min(236px, calc(100vw - 40px));
          flex: 0 0 var(--kanban-col-w);
          width: var(--kanban-col-w);
          max-width: var(--kanban-col-w);
          min-width: 0;
          box-sizing: border-box;
          display: flex; flex-direction: column;
          gap: 8px; scroll-snap-align: start;
        }
        .col-header { 
          display: flex; justify-content: space-between; align-items: flex-start; 
          padding-bottom: 10px; margin-bottom: 4px; gap: 8px;
        }
        .col-header-titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .col-content {
          flex: 0 0 auto; min-width: 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .drop-target .col-header { outline: 2px dashed var(--accent); outline-offset: 4px; border-radius: var(--radius-sm); }
        .col-header .pipeline-col-heading { font-size: 0.82rem; font-weight: 600; line-height: 1.2; }
        .col-dot { width: 8px; height: 8px; border-radius: 50%; }
        .col-count { 
          flex-shrink: 0;
          padding: 2px 10px; border-radius: var(--radius-full); 
          font-size: 0.75rem; font-weight: 800; 
        }
        .lead-card { 
          cursor: pointer; padding: 10px 11px; 
          border-left: 3px solid var(--border); 
          transition: var(--transition);
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .lead-card:hover { border-left-color: var(--accent); box-shadow: var(--shadow); }
        .lead-card-title-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          width: 100%;
          min-width: 0;
        }
        .lead-card-title-row--name-only {
          display: block;
        }
        .lead-card-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.84rem;
          font-weight: 700;
          color: var(--text);
          word-break: normal;
          overflow-wrap: normal;
        }
        .type-pill { 
          font-size: 0.58rem; background: var(--border-light); 
          padding: 2px 6px; border-radius: var(--radius-full); 
          color: var(--text-secondary); font-weight: 700; text-transform: uppercase; 
          white-space: nowrap;
          flex: 0 0 auto;
          flex-shrink: 0;
          word-break: normal;
          overflow-wrap: normal;
          max-width: 100%;
        }
        .lead-card-title-row .type-pill {
          max-width: none;
          justify-self: end;
        }
        .type-pill--lead-kind {
          flex-shrink: 0;
        }
        .lead-meta { font-size: 0.72rem; color: var(--text-secondary); }
        .col-empty { 
          padding: 16px 12px; text-align: center; color: var(--text-muted); 
          font-size: 0.82rem; border: 1.5px dashed var(--border); 
          border-radius: var(--radius-sm); 
        }
        .col-empty p { margin: 0; font-weight: 600; color: var(--text-secondary); }
        .col-empty-hint { margin-top: 8px !important; font-weight: 500 !important; font-size: 0.75rem !important; line-height: 1.35; color: var(--text-muted) !important; }
        .lead-inbox-link {
          font-size: 0.72rem; font-weight: 700; color: var(--accent);
          text-decoration: none; margin-left: 4px;
        }
        .lead-inbox-link:hover { text-decoration: underline; }
        .import-btn-pipe {
          background: var(--accent); color: white; padding: 0 14px; min-height: 38px;
          border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;
          gap: 6px; white-space: nowrap;
        }
        .import-btn-pipe:hover { filter: brightness(1.1); }
        .origin-group { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--radius-full); padding: 2px 8px; background: var(--surface); }
        .origin-select { border: none; outline: none; background: transparent; color: var(--text-secondary); font-weight: 700; }
        .stage-editor { margin-top: 10px; padding-bottom: 10px; }
        .stage-editor-head {
          display: grid; grid-template-columns: 1fr 90px; gap: 8px; margin-bottom: 6px;
          font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em;
        }
        .stage-row { display: grid; grid-template-columns: 1fr 90px; gap: 8px; margin-bottom: 8px; }
        .stage-input, .stage-sla { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; background: var(--surface); color: var(--text); }
        .stage-actions { display: flex; align-items: center; gap: 8px; }
        .btn-primary { background: var(--accent); color: white; border: 1px solid var(--accent); padding: 6px 12px; border-radius: var(--radius-sm); font-weight: 700; }
        .btn-secondary { background: var(--surface-hover); color: var(--text-secondary); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius-sm); font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius-sm); font-weight: 700; }
        .grow { flex: 1 1 auto; }
        .quick-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .quick-btn {
          min-height: 30px; padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 0.78rem; font-weight: 700; border: 1px solid var(--border);
          background: var(--surface-hover); color: var(--text-secondary);
        }
        .quick-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .whatsapp-btn { border-color: var(--success); color: var(--success); background: var(--success-light); }
        .whatsapp-btn:hover { filter: brightness(0.98); }
        .quick-block { display: flex; flex-direction: column; gap: 4px; }
        .quick-label { font-size: 0.72rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.03em; text-transform: uppercase; }
        .quick-times { display: flex; gap: 6px; flex-wrap: wrap; }
        .time-chip-mini {
          min-height: 28px; padding: 4px 8px; border-radius: var(--radius-full);
          background: var(--surface-hover); border: 1px solid var(--border);
          font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);
        }
        .time-chip-mini:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .more-btn {
          min-height: 28px; padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 0.72rem; font-weight: 800; border: 1px dashed var(--border);
          background: var(--surface); color: var(--text-muted);
        }
        .more-btn:hover { border-color: var(--accent); color: var(--accent); }
        .action-bar { display: flex; gap: 6px; flex-wrap: wrap; }
        .action-bar--icons { gap: 4px; flex-wrap: nowrap; }
        .action-btn {
          min-height: 30px; padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 0.78rem; font-weight: 700; border: 1px solid var(--border);
          background: var(--surface); color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px;
        }
        .action-btn--icon {
          min-width: 34px; width: 34px; height: 34px; padding: 0; gap: 0;
          border-radius: var(--radius-sm); justify-content: center;
        }
        .action-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .action-btn.danger { border-color: var(--danger); color: var(--danger); }
        .action-btn.danger:hover { background: var(--danger-light); }
        .action-btn.lost { border-color: var(--warning); color: var(--warning); }
        .action-btn.lost:hover { background: var(--warning-light); }
        .lead-card { position: relative; }
        .dropdown-panel {
          position: absolute; left: 14px; right: 14px; top: 100%; margin-top: 6px;
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-panel);
          box-shadow: var(--shadow-lg); padding: 10px; z-index: 15;
        }
        .dropdown-section { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
        .dropdown-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; }
        .dropdown-times { display: flex; gap: 6px; flex-wrap: wrap; }
        .dropdown-item {
          width: 100%; text-align: left; padding: 8px 10px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--surface);
          font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);
        }
        .dropdown-item.active { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
        .toast {
          position: fixed; bottom: calc(88px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
          background: var(--success); color: white; padding: 10px 14px; border-radius: var(--radius-full);
          font-size: 0.85rem; font-weight: 700; box-shadow: var(--shadow);
          z-index: 300; animation: fadeInUp 0.2s ease;
          max-width: min(92vw, 420px); text-align: center;
        }
        @media (min-width: 900px) {
          .toast { bottom: 24px; }
        }
        .note-overlay {
          position: fixed; inset: 0; background: rgba(18, 16, 42, 0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 300; animation: fadeIn 0.2s ease;
        }
        .note-modal {
          background: var(--surface); border-radius: var(--radius);
          width: 100%; max-width: 460px; padding: 16px;
          box-shadow: var(--shadow-lg); animation: fadeInUp 0.25s ease;
        }
        .note-textarea {
          width: 100%; min-height: 100px; border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 12px; font-family: inherit; font-size: 0.95rem;
          outline: none; background: var(--surface); color: var(--text);
        }
        .note-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
      `}} />
            {toast && <div className="toast">{toast}</div>}
            {noteOpen && (
                <div className="note-overlay" onClick={() => setNoteOpen(false)}>
                    <div className="note-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="navi-section-heading" style={{ marginBottom: 8 }}>Adicionar observação</h3>
                        <textarea
                            className="note-textarea"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Ex.: Ligação realizada, reagendado para quinta às 19:00"
                        />
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setNoteOpen(false)}>Cancelar</button>
                            <button className="btn-secondary" onClick={saveNote}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Pipeline;
