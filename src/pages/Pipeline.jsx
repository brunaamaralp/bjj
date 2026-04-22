import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { addLeadEvent } from '../lib/leadEvents.js';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, Phone, Upload, MessageCircle, ChevronRight, SlidersHorizontal, PlusCircle, StickyNote, Search, GraduationCap } from 'lucide-react';
import ImportSheet from '../components/ImportSheet';
import ExportButton from '../components/ExportButton';
import { LostReasonModal } from '../components/LostReasonModal';
import MatriculaModal from '../components/MatriculaModal';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import { getStageUpdatePayload } from '../lib/leadStageRules.js';
import { friendlyError } from '../lib/errorMessages.js';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';

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
const normalizeKanbanPhone = (v) => String(v || '').replace(/\D/g, '');
import {
    DndContext,
    DragOverlay,
    closestCorners,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.4',
            },
        },
    }),
};

/**
 * Card puramente visual para ser usado tanto no grid quanto no Overlay.
 */
const LeadCard = React.memo(({ lead, isDragging, isOverlay, navigate, openMenuId, schedulerOpenId, moverOpenId, setOpenMenuId, setWaDropdownOpenId, handleSplitWaMain, toggleWaDropdown, waDropdownOpenId, templateSendKeys, sendTemplateFromPipeline, handleReschedule, itemsForDay, isExpanded, toggleExpanded, MAX_CHIPS, stages, moveToStatus, handleCopyPhone, copiedId, handleMarkAsLost, handleDeleteLead, openScheduler, handleConfirmPresence, setMissedModalLead, setMatriculaModalOpen, openMover, setDragTargetLead, mapLeadToStageId, openNote, ...props }) => {
    return (
        <div
            className={`card lead-card ${isDragging ? 'lead-card--dragging' : ''} ${isOverlay ? 'lead-card--overlay' : ''} animate-in`}
            style={{
                zIndex: (openMenuId === lead.id || schedulerOpenId === lead.id || moverOpenId === lead.id) ? 2200 : 1,
                ...props.style
            }}
            onClick={() => !isOverlay && navigate(`/lead/${lead.id}`)}
            {...props}
        >
            <div className="lead-card-title-row lead-card-title-row--name-only">
                <span className="lead-card-name" title={String(lead.name || '').trim() || undefined}>
                    {lead.name}
                </span>
            </div>
            <div className="lead-meta mt-2 flex items-center gap-2 flex-wrap">
                <Phone size={12} /> {lead.phone}
                {normalizeKanbanPhone(lead.phone) && !isOverlay ? (
                    <Link
                        to={`/inbox?phone=${encodeURIComponent(normalizeKanbanPhone(lead.phone))}`}
                        className="lead-inbox-link"
                        draggable={false}
                        onClick={(e) => e.stopPropagation()}
                        data-no-dnd="true"
                    >
                        Ver conversa
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
            <div className="action-bar action-bar--reorganized mt-3">
                <div className="wa-split-btn" data-no-dnd="true">
                    <button
                        type="button"
                        className="wa-main-btn"
                        onClick={(e) => handleSplitWaMain(e, lead)}
                        title="Conversar"
                    >
                        <MessageCircle size={16} /> WhatsApp
                    </button>
                    <button
                        type="button"
                        className="wa-drop-toggle"
                        onClick={(e) => toggleWaDropdown(e, lead.id)}
                        title="Templates"
                    >
                        <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                    </button>
                    {waDropdownOpenId === lead.id && (
                        <div className="wa-templates-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="dropdown-panel-header">Templates</div>
                            {templateSendKeys.length === 0 && (
                                <div className="dropdown-item disabled">Sem templates</div>
                            )}
                            {templateSendKeys.map((key) => (
                                <button
                                    key={`${lead.id}-tpl-${key}`}
                                    type="button"
                                    className="dropdown-item"
                                    onClick={(e) => void sendTemplateFromPipeline(e, lead, key)}
                                >
                                    {WHATSAPP_TEMPLATE_LABELS[key] || key}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ position: 'relative', zIndex: openMenuId === lead.id ? 2300 : 1 }} data-no-dnd="true">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === lead.id ? null : lead.id);
                            setWaDropdownOpenId(null);
                        }}
                        title="Mais ações"
                        className="action-btn action-btn--menu"
                    >
                        ⋯
                    </button>
                    {openMenuId === lead.id && (
                        <div className="action-menu-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="menu-group">
                                <button className="menu-item" onClick={(e) => openScheduler(e, lead.id)}>
                                    <Calendar size={16} /> Agendar aula experimental
                                </button>
                                {lead.pipelineStage === 'Aula experimental' && (
                                    <button className="menu-item success" onClick={(e) => handleConfirmPresence(e, lead)}>
                                        <PlusCircle size={16} /> Confirmar presença
                                    </button>
                                )}
                                {lead.pipelineStage === 'Aula experimental' && (
                                    <button className="menu-item warning" onClick={(e) => { e.stopPropagation(); setMissedModalLead(lead); setOpenMenuId(null); }}>
                                        <Calendar size={16} /> Não compareceu
                                    </button>
                                )}
                                {['Aguardando decisão', 'Protocolo', 'Matriculado'].includes(lead.pipelineStage) && (
                                    <button className="menu-item primary" onClick={(e) => { e.stopPropagation(); setDragTargetLead(lead); setMatriculaModalOpen(true); setOpenMenuId(null); }}>
                                        <GraduationCap size={16} /> Matricular
                                    </button>
                                )}
                                <button className="menu-item" onClick={(e) => openMover(e, lead.id)}>
                                    <ChevronRight size={16} /> Mover para etapa
                                </button>
                            </div>
                            <div className="menu-divider" />
                            <div className="menu-group">
                                <button className="menu-item" onClick={(e) => openNote(e, lead)}>
                                    <StickyNote size={16} /> Adicionar nota
                                </button>
                                <button className="menu-item" onClick={(e) => handleCopyPhone(e, lead)}>
                                    <Phone size={16} /> {copiedId === lead.id ? '✓ Copiado!' : 'Copiar telefone'}
                                </button>
                            </div>
                            <div className="menu-divider" />
                            <div className="menu-group">
                                <button className="menu-item danger-text" onClick={(e) => handleMarkAsLost(e, lead)}>
                                    <MessageCircle size={16} /> Marcar como perdido
                                </button>
                                <button className="menu-item danger-text" onClick={(e) => handleDeleteLead(e, lead.id)}>
                                    <StickyNote size={16} className="text-danger" /> Excluir lead
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {schedulerOpenId === lead.id && (
                <div className="dropdown-panel" onClick={(e) => e.stopPropagation()} data-no-dnd="true">
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
                <div className="dropdown-panel" onClick={(e) => e.stopPropagation()} data-no-dnd="true">
                    {stages.map(s => {
                        const active = (mapLeadToStageId(lead) === s.id);
                        return (
                            <button
                                key={`${lead.id}-${s.id}`}
                                className={`dropdown-item${active ? ' active' : ''}`}
                                onClick={(e) => moveToStatus(e, lead.id, s.id)}
                            >
                                {s.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

const SortableLeadCard = ({ lead, ...props }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: lead.id, data: { lead } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="lead-card--placeholder"
            />
        );
    }

    return (
        <LeadCard
            ref={setNodeRef}
            lead={lead}
            style={style}
            {...attributes}
            {...listeners}
            {...props}
        />
    );
};

const Column = ({ id, col, color, leads, isOver, children }) => {
    const { setNodeRef } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`kanban-column ${isOver ? 'kanban-col--drag-over' : ''}`}
        >
            <div className="col-header">
                <div className="col-header-titles">
                    <div className="flex items-center gap-2">
                        <span className="col-dot" style={{ background: color.color }} />
                        <h3 className="navi-section-heading pipeline-col-heading">{col.label}</h3>
                    </div>
                </div>
                <span className="col-count" style={{ background: color.bg, color: color.color }}>
                    {leads.length}
                </span>
            </div>
            <div className="col-content">
                {children}
            </div>
        </div>
    );
};


/** Ordem: Novo → Experimental → Não compareceu → Aguardando decisão → Matrícula → Perdidos */
const DEFAULT_STAGE_LABELS = [
    { id: 'Novo', label: 'Novo' },
    { id: 'Aula experimental', label: 'Experimental' },
    { id: LEAD_STATUS.MISSED, label: 'Não compareceu' },
    { id: PIPELINE_WAITING_DECISION_STAGE, label: 'Aguardando decisão' },
    { id: 'Matriculado', label: 'Matrícula' },
    { id: LEAD_STATUS.LOST, label: 'Perdidos' },
];
const STAGE_COLORS = [
    { color: 'var(--accent)', bg: 'var(--accent-light)' },
    { color: 'var(--warning)', bg: 'var(--warning-light)' },
    { color: 'var(--danger)', bg: 'var(--danger-light)' },
    { color: 'var(--v500)', bg: 'rgba(99, 102, 241, 0.12)' },
    { color: 'var(--success)', bg: 'var(--success-light)' },
    { color: 'var(--purple)', bg: 'var(--purple-light)' },
];
const DEFAULT_STAGE_SLA_DAYS = 3;
const KANBAN_SCROLL_EDGE = 36;
const KANBAN_SCROLL_MAX_STEP = 14;


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

const leadIsPipelineFunnel = (lead) => String(lead?.origin || '').trim() !== 'Planilha';

const Pipeline = () => {
    const navigate = useNavigate();
    const { leads, importLeads, updateLead, fetchMoreLeads, deleteLead, fetchLeads } = useLeadStore();
    const leadsError = useLeadStore((s) => s.leadsError);
    const addToast = useUiStore((s) => s.addToast);
    const labels = useLeadStore((s) => s.labels);
    const academyId = useLeadStore((s) => s.academyId);
    const userId = useLeadStore((s) => s.userId);
    const academyList = useLeadStore((s) => s.academyList);
    const permCtx = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
    }, [academyList, academyId, userId]);
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
    const [waDropdownOpenId, setWaDropdownOpenId] = useState(null);
    const [missedModalLead, setMissedModalLead] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [searchingServer, setSearchingServer] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null);
    const [matriculaModalOpen, setMatriculaModalOpen] = useState(false);
    const [dragTargetLead, setDragTargetLead] = useState(null);
    const [lostModalLead, setLostModalLead] = useState(null);
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [quickFilter, setQuickFilter] = useState(null);
    const [waOutbound, setWaOutbound] = useState(() => ({
        name: '',
        zapster_instance_id: '',
        templates: { ...DEFAULT_WHATSAPP_TEMPLATES },
    }));
    const [noteError, setNoteError] = useState('');
    const [filtersCollapsedMobile, setFiltersCollapsedMobile] = useState(false);
    const [nlOpen, setNlOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
            // Não ativar se clicar em elementos marcadores com data-no-dnd
            onActivation: ({ event }) => {
                if (event.target.closest('[data-no-dnd]')) {
                    return false;
                }
            }
        })
    );

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
        const handleClickOutside = () => {
            setOpenMenuId(null);
            setWaDropdownOpenId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!academyId) return;
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void fetchLeads({ reset: true });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [academyId, fetchLeads]);

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
        setConfirmModal({
            title: 'Excluir lead?',
            description: 'Esta ação remove o lead permanentemente.',
            confirmLabel: 'Excluir',
            onConfirm: async () => {
                try {
                    await deleteLead(leadId);
                    setToast('Lead excluído');
                    setTimeout(() => setToast(''), 2500);
                } catch (err) {
                    addToast({ type: 'error', message: friendlyError(err, 'delete') });
                } finally {
                    setConfirmModal(null);
                }
            }
        });
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

    useEffect(() => {
        const mainEl = document.querySelector('.main-content');
        if (mainEl) mainEl.classList.add('pipeline-active');
        return () => {
            if (mainEl) mainEl.classList.remove('pipeline-active');
        };
    }, []);

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
        const mergeWaitingDecisionStage = (cols) => {
            const base = Array.isArray(cols) ? [...cols].filter(Boolean) : [];
            const ids = new Set(base.map((c) => String(c?.id || '').trim()).filter(Boolean));
            if (ids.has(PIPELINE_WAITING_DECISION_STAGE)) return base;
            const matIdx = base.findIndex((c) => String(c?.id || '').trim() === 'Matriculado');
            const row = { id: PIPELINE_WAITING_DECISION_STAGE, label: 'Aguardando decisão', slaDays: DEFAULT_STAGE_SLA_DAYS };
            if (matIdx >= 0) {
                base.splice(matIdx, 0, row);
            } else {
                const expIdx = base.findIndex((c) => String(c?.id || '').trim() === 'Aula experimental');
                base.splice(expIdx >= 0 ? expIdx + 1 : base.length, 0, row);
            }
            return base;
        };
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then(doc => {
                let tplParsed = {};
                try {
                    const w = doc.whatsappTemplates;
                    const p = typeof w === 'string' ? JSON.parse(w) : w;
                    if (p && typeof p === 'object' && !Array.isArray(p)) tplParsed = p;
                } catch {
                    tplParsed = {};
                }
                setWaOutbound({
                    name: String(doc?.name || '').trim(),
                    zapster_instance_id: String(doc?.zapster_instance_id || '').trim(),
                    templates: { ...DEFAULT_WHATSAPP_TEMPLATES, ...tplParsed }
                });
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
                            const normalized = ensureSpecialColumns(mergeWaitingDecisionStage(conf));
                            setStages(normalized);
                            setTempStages(normalized);
                        } else {
                            const normalized = ensureSpecialColumns(mergeWaitingDecisionStage(DEFAULT_STAGE_LABELS));
                            setStages(normalized);
                            setTempStages(normalized);
                        }
                    } else {
                        const normalized = ensureSpecialColumns(mergeWaitingDecisionStage(DEFAULT_STAGE_LABELS));
                        setStages(normalized);
                        setTempStages(normalized);
                    }
                } catch {
                    const normalized = ensureSpecialColumns(mergeWaitingDecisionStage(DEFAULT_STAGE_LABELS));
                    setStages(normalized);
                    setTempStages(normalized);
                }
            })
            .catch(() => {
                addToast({ type: 'error', message: 'Não foi possível carregar configurações do funil.' });
            });
    }, [academyId, addToast]);

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

    const templateSendKeys = useMemo(
        () =>
            Object.entries(waOutbound.templates)
                .filter(([, v]) => typeof v === 'string' && String(v).trim())
                .map(([k]) => k),
        [waOutbound.templates]
    );

    const sendTemplateFromPipeline = async (e, lead, key) => {
        e.stopPropagation();
        setOpenMenuId(null);
        await sendWhatsappTemplateOutbound({
            lead,
            academyId,
            academyName: waOutbound.name,
            templateKey: key,
            templatesMap: waOutbound.templates,
            zapsterInstanceId: waOutbound.zapster_instance_id,
            onToast: (t) => {
                setToast(t.message);
                setTimeout(() => setToast(''), 3200);
            }
        });
    };

    const handleWhatsApp = (e, lead) => {
        e.stopPropagation();
        if (!lead?.phone) {
            setToast('Lead sem telefone cadastrado');
            setTimeout(() => setToast(''), 3200);
            return;
        }
        navigate(`/inbox?phone=${encodeURIComponent(lead.phone)}`);
    };

    const handleReschedule = async (e, lead, day, time) => {
        e.stopPropagation();
        const base = new Date();
        if (day === 'tomorrow') base.setDate(base.getDate() + 1);
        const ymd = toYMD(base);
        try {
            await addLeadEvent({
                academyId,
                leadId: lead.id,
                type: 'schedule',
                to: ymd,
                text: 'Aula experimental agendada',
                createdBy: userId || 'user',
                permissionContext: permCtx,
                payloadJson: { date: ymd, time }
            });
            await updateLead(lead.id, { status: LEAD_STATUS.SCHEDULED, scheduledDate: ymd, scheduledTime: time, pipelineStage: 'Aula experimental' });
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
    const handleConfirmPresence = async (e, lead) => {
        e.stopPropagation();
        try {
            await updateLead(lead.id, {
                status: LEAD_STATUS.COMPLETED,
                pipelineStage: PIPELINE_WAITING_DECISION_STAGE,
                attendedAt: new Date().toISOString(),
                statusChangedAt: new Date().toISOString()
            });
            await addLeadEvent({
                academyId,
                leadId: lead.id,
                type: 'attended',
                from: lead.pipelineStage || '',
                to: PIPELINE_WAITING_DECISION_STAGE,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            setToast('Presença confirmada');
            setOpenMenuId(null);
            setTimeout(() => setToast(''), 2000);
        } catch (err) {
            addToast({ type: 'error', message: friendlyError(err, 'action') });
        }
    };

    const handleMissedWithReason = async (lead, reason) => {
        try {
            const now = new Date().toISOString();
            await updateLead(lead.id, {
                status: LEAD_STATUS.MISSED,
                pipelineStage: LEAD_STATUS.MISSED,
                missedAt: now,
                missed_reason: reason,
                statusChangedAt: now
            });
            await addLeadEvent({
                academyId,
                leadId: lead.id,
                type: 'missed',
                from: lead.pipelineStage || '',
                to: LEAD_STATUS.MISSED,
                text: `Motivo: ${reason}`,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            setToast('Lead movido para Não compareceu');
            setMissedModalLead(null);
            setOpenMenuId(null);
            setTimeout(() => setToast(''), 2000);
        } catch (err) {
            addToast({ type: 'error', message: friendlyError(err, 'action') });
        }
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

        const stageFromStatusOnly = (l) => {
            const hasDirect = stages.find((s) => s.id === l.status);
            if (hasDirect) return l.status;
            const s = (l.status || '').toLowerCase();
            if (s === (LEAD_STATUS.NEW || '').toLowerCase() || s === 'novo') return 'Novo';
            if (s.includes('agendado')) return 'Aula experimental';
            if (s.includes('compareceu')) return PIPELINE_WAITING_DECISION_STAGE;
            if (s.includes('não compareceu') || s.includes('nao compareceu')) return LEAD_STATUS.MISSED;
            if (s.includes('não fechou') || s.includes('nao fechou') || s.includes('perdid')) return LEAD_STATUS.LOST;
            if (s.includes('matricul')) return 'Matriculado';
            return 'Novo';
        };

        let stage = lead?.pipelineStage ? String(lead.pipelineStage).trim() : '';
        if (stage === 'Contato feito') stage = 'Novo';
        if (stage === 'Negociação') stage = 'Matriculado';

        if (stage) {
            if (stage === 'Aula experimental' && lead.status !== LEAD_STATUS.SCHEDULED) {
                return stageFromStatusOnly(lead);
            }
            const known = stages.some((col) => col.id === stage);
            if (known) return stage;
            const st = (lead.status || '').toLowerCase();
            if (st.includes('compareceu')) return PIPELINE_WAITING_DECISION_STAGE;
            if (st.includes('agendado')) return 'Aula experimental';
            if (st.includes('matricul')) return 'Matriculado';
            return 'Novo';
        }

        return stageFromStatusOnly(lead);
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

    /** Primeira carga: evita colunas vazias sem feedback até o fetch do Appwrite. */
    const showKanbanInitialLoading = Boolean(leadsLoading && (!Array.isArray(leads) || leads.length === 0));

    const leadsForBoard = useMemo(() => {
        let list = leads
            .filter((l) => leadIsPipelineFunnel(l))
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

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const resolveDropStageId = useCallback((over) => {
        if (!over) return null;

        const hasStageId = (val) => stages.some((s) => String(s.id) === String(val));

        const overId = String(over.id || '');
        if (hasStageId(overId)) return overId;

        // Quando "over.id" é de um card, converte pelo estágio atual desse lead.
        const overLead = leadsForBoard.find((l) => String(l.id) === overId);
        if (overLead) {
            const leadStage = mapLeadToStageId(overLead);
            if (hasStageId(leadStage)) return String(leadStage);
        }

        const containerId = String(over?.data?.current?.sortable?.containerId || '');
        if (hasStageId(containerId)) return containerId;

        return null;
    }, [stages, leadsForBoard, mapLeadToStageId]);

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);
        setDragOver(null);

        if (!over) return;

        const status = resolveDropStageId(over);
        if (!status) return;
        const leadId = active.id;
        const lead = getLeadById(leadId);
        
        if (!lead || mapLeadToStageId(lead) === status) return;

        if (status === 'Matriculado') {
            setDragTargetLead(lead);
            setMatriculaModalOpen(true);
            return;
        }

        if (status === LEAD_STATUS.MISSED) {
            setMissedModalLead(lead);
            return;
        }

        if (status === LEAD_STATUS.LOST) {
            openLostModal(leadId, async (lostReason) => {
                const cur = getLeadById(leadId);
                await addLeadEvent({
                    academyId,
                    leadId,
                    type: 'lost',
                    from: cur?.status || '',
                    to: LEAD_STATUS.LOST,
                    text: String(lostReason || '').slice(0, 1000),
                    createdBy: userId || 'user',
                    permissionContext: permCtx
                });
                await updateLead(leadId, {
                    status: LEAD_STATUS.LOST,
                    scheduledDate: '',
                    scheduledTime: '',
                    pipelineStage: LEAD_STATUS.LOST,
                    lostReason,
                    lostAt: new Date().toISOString()
                });
                setToast('Marcado como perdido');
                setTimeout(() => setToast(''), 2000);
            });
            return;
        }

        try {
            await addLeadEvent({
                academyId,
                leadId,
                type: 'pipeline_change',
                from: lead.pipelineStage || '',
                to: status,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            const payload = getStageUpdatePayload(status);
            await updateLead(leadId, payload);
            setToast('Movido no pipeline');
            setTimeout(() => setToast(''), 2000);
        } catch (err) {
            addToast({ type: 'error', message: friendlyError(err, 'action') });
        }
    };

    const handleDragOver = (event) => {
        const { over } = event;
        setDragOver(resolveDropStageId(over));
    };

    const moveToStatus = async (e, leadId, stageId) => {
        e.stopPropagation();
        const lead = getLeadById(leadId);
        if (!lead) return;

        if (stageId === 'Matriculado') {
            setDragTargetLead(lead);
            setMatriculaModalOpen(true);
            setMoverOpenId(null);
            return;
        }

        if (stageId === LEAD_STATUS.MISSED) {
            setMissedModalLead(lead);
            setMoverOpenId(null);
            return;
        }

        if (stageId === LEAD_STATUS.LOST) {
            openLostModal(leadId, async (lostReason) => {
                const cur = getLeadById(leadId);
                await addLeadEvent({
                    academyId,
                    leadId,
                    type: 'lost',
                    from: cur?.status || '',
                    to: LEAD_STATUS.LOST,
                    text: String(lostReason || '').slice(0, 1000),
                    createdBy: userId || 'user',
                    permissionContext: permCtx
                });
                await updateLead(leadId, {
                    status: LEAD_STATUS.LOST,
                    scheduledDate: '',
                    scheduledTime: '',
                    pipelineStage: LEAD_STATUS.LOST,
                    lostReason,
                    lostAt: new Date().toISOString()
                });
                setMoverOpenId(null);
                setToast('Marcado como perdido');
                setTimeout(() => setToast(''), 2000);
            });
            return;
        }

        try {
            await addLeadEvent({
                academyId,
                leadId,
                type: 'pipeline_change',
                from: lead.pipelineStage || '',
                to: stageId,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            const payload = getStageUpdatePayload(stageId);
            await updateLead(leadId, payload);
        } catch (err) {
            addToast({ type: 'error', message: friendlyError(err, 'action') });
            return;
        }
        setMoverOpenId(null);
        setToast('Movido no pipeline');
        setTimeout(() => setToast(''), 2000);
    };

    const handleSplitWaMain = (e, lead) => {
        e.stopPropagation();
        handleWhatsApp(e, lead);
    };

    const toggleWaDropdown = (e, leadId) => {
        e.stopPropagation();
        setWaDropdownOpenId(prev => prev === leadId ? null : leadId);
        setOpenMenuId(null);
    };
    const openNote = (e, lead) => {
        e.stopPropagation();
        setNoteLead(lead);
        setNoteText('');
        setNoteError('');
        setNoteOpen(true);
    };
    const saveNote = async () => {
        if (!noteLead) {
            return;
        }
        if (!noteText.trim()) {
            setNoteError('Digite uma observação antes de salvar.');
            return;
        }
        setNoteError('');
        await addLeadEvent({
            academyId,
            leadId: noteLead.id,
            type: 'note',
            text: noteText.trim().slice(0, 1000),
            createdBy: userId || 'user',
            permissionContext: permCtx
        });
        await updateLead(noteLead.id, { lastNoteAt: new Date().toISOString() });
        setNoteOpen(false);
        setToast('Observação salva');
        setTimeout(() => setToast(''), 2000);
    };

    return (
        <div className="pipeline-container">
            <div className="pipeline-header">
                <div className="container">
                    <h1 className="navi-page-title">{labels.pipeline || 'Funil'}</h1>
                    <div className="page-header-card">
                        <div className="page-header-row">
                            <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
                            <div className="page-header-sep" />
                            <div className="page-header-search" title="Filtra por nome ou telefone">
                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} aria-hidden />
                                <input
                                    type="search"
                                    value={kanbanSearch}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder="Buscar nome ou telefone..."
                                    aria-label="Buscar no funil"
                                />
                            </div>
                            {searchingServer ? (
                                <span style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 700 }}>Buscando...</span>
                            ) : null}
                            <div style={{ flex: 1 }} />
                            {leadsHasMore ? (
                                <button
                                    type="button"
                                    className="btn-action-ghost"
                                    onClick={handleLoadMoreLeads}
                                    disabled={loadingMore || leadsLoading}
                                    title="Carregar próximos leads do servidor"
                                >
                                    {loadingMore ? 'Carregando…' : 'Carregar mais'}
                                </button>
                            ) : null}
                            <button type="button" className="btn-action-ghost" onClick={() => setShowImport(true)}>
                                <Upload size={14} /> {`Importar ${labels.leads}`}
                            </button>
                            <button type="button" className="btn-action-ghost" onClick={() => { setEditStages(prev => !prev); setTempStages(stages); }}>
                                <SlidersHorizontal size={14} /> Etapas
                            </button>
                            <button
                                type="button"
                                className="btn-action-primary"
                                onClick={() => navigate('/new-lead')}
                            >
                                <PlusCircle size={14} /> Novo lead
                            </button>
                        </div>
                        <div className="page-header-row">
                            <span className={`date-chip${quickFilter === 'today' ? ' active' : ''}`} onClick={() => { setQuickFilter('today'); setFilterDateFrom(''); setFilterDateTo(''); }}>Hoje</span>
                            <span className={`date-chip${quickFilter === 'week' ? ' active' : ''}`} onClick={() => { setQuickFilter('week'); setFilterDateFrom(''); setFilterDateTo(''); }}>Esta sem.</span>
                            <span className={`date-chip${quickFilter === 'month' ? ' active' : ''}`} onClick={() => { setQuickFilter('month'); setFilterDateFrom(''); setFilterDateTo(''); }}>Este mês</span>
                            <span className={`date-chip${quickFilter === null && !filterDateFrom && !filterDateTo ? ' active' : ''}`} onClick={() => { setQuickFilter(null); setFilterDateFrom(''); setFilterDateTo(''); }}>Todos</span>
                            <input
                                type="date"
                                value={filterDateFrom}
                                onChange={(e) => { setFilterDateFrom(e.target.value); setQuickFilter(null); }}
                                style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-light)', borderRadius: 8 }}
                            />
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>—</span>
                            <input
                                type="date"
                                value={filterDateTo}
                                onChange={(e) => { setFilterDateTo(e.target.value); setQuickFilter(null); }}
                                style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-light)', borderRadius: 8 }}
                            />
                            <div className="page-header-sep" />
                            <div className="filter-group">
                                <select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}>
                                    <option value="all">Todos os perfis</option>
                                    <option value="Adulto">Adulto</option>
                                    <option value="Criança">Criança</option>
                                    <option value="Juniores">Juniores</option>
                                </select>
                                <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)}>
                                    <option value="all">Todas as origens</option>
                                    {LEAD_ORIGIN.map((o) => (
                                        <option key={o} value={o}>{o}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
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
                                title="Substitui a lista de etapas pelo modelo padrão. Clique em Salvar para gravar."
                                onClick={() => {
                                    setConfirmModal({
                                        title: 'Aplicar funil padrão?',
                                        description: 'As etapas atuais do editor serão substituídas até você salvar.',
                                        confirmLabel: 'Aplicar',
                                        onConfirm: async () => {
                                            setTempStages(DEFAULT_STAGE_LABELS.map((s) => ({ ...s, slaDays: s.slaDays ?? DEFAULT_STAGE_SLA_DAYS })));
                                            setConfirmModal(null);
                                        }
                                    });
                                }}
                            >
                                Funil padrão
                            </button>
                            <div className="grow"></div>
                            <button className="btn-outline" onClick={() => setEditStages(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={saveStages}>Salvar</button>
                        </div>
                    </div>
                )}
            </div>
            {leadsError ? (
                <div className="container" style={{ paddingTop: 10 }}>
                    <div className="dashboard-error-banner" role="alert">
                        <span>Não foi possível carregar os leads do funil.</span>
                        <button type="button" className="btn-secondary" onClick={() => void fetchLeads({ reset: true })}>
                            Tentar novamente
                        </button>
                    </div>
                </div>
            ) : null}

            {showKanbanInitialLoading ? (
                <div className="pipeline-kanban-loading-hint" role="status">
                    Carregando leads do funil…
                </div>
            ) : null}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div
                    ref={kanbanWrapperRef}
                    className="kanban-wrapper"
                    onDragOverCapture={showKanbanInitialLoading ? undefined : onKanbanWrapperDragOverCapture}
                    aria-busy={showKanbanInitialLoading || undefined}
                    aria-label={showKanbanInitialLoading ? 'Carregando leads do funil' : undefined}
                >
                    {stages.map((col, idx) => {
                        const color = STAGE_COLORS[idx % STAGE_COLORS.length];
                        if (showKanbanInitialLoading) {
                            return (
                                <div key={col.id} className="kanban-column pipeline-kanban-skeleton-col">
                                    <div className="col-header">
                                        <div className="col-header-titles">
                                            <div className="flex items-center gap-2">
                                                <span className="col-dot" style={{ background: color.color }} />
                                                <h3 className="navi-section-heading pipeline-col-heading">{col.label}</h3>
                                            </div>
                                        </div>
                                        <span className="pipeline-kanban-skeleton-count" aria-hidden />
                                    </div>
                                    <div className="col-content">
                                        <div className="pipeline-kanban-skeleton-card" />
                                        <div className="pipeline-kanban-skeleton-card pipeline-kanban-skeleton-card--short" />
                                        <div className="pipeline-kanban-skeleton-card" />
                                    </div>
                                </div>
                            );
                        }

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
                            <Column
                                key={col.id}
                                id={col.id}
                                col={col}
                                color={color}
                                isOver={dragOver === col.id}
                                leads={colLeads}
                            >
                                <SortableContext items={colLeads.map(l => l.id)} strategy={verticalListSortingStrategy}>
                                    {colLeads.map((lead) => (
                                        <SortableLeadCard
                                            key={lead.id}
                                            lead={lead}
                                            navigate={navigate}
                                            openNote={openNote}
                                            openMenuId={openMenuId}
                                            schedulerOpenId={schedulerOpenId}
                                            moverOpenId={moverOpenId}
                                            setOpenMenuId={setOpenMenuId}
                                            setWaDropdownOpenId={setWaDropdownOpenId}
                                            handleSplitWaMain={handleSplitWaMain}
                                            toggleWaDropdown={toggleWaDropdown}
                                            waDropdownOpenId={waDropdownOpenId}
                                            templateSendKeys={templateSendKeys}
                                            sendTemplateFromPipeline={sendTemplateFromPipeline}
                                            handleReschedule={handleReschedule}
                                            itemsForDay={itemsForDay}
                                            isExpanded={isExpanded}
                                            toggleExpanded={toggleExpanded}
                                            MAX_CHIPS={MAX_CHIPS}
                                            stages={stages}
                                            moveToStatus={moveToStatus}
                                            handleCopyPhone={handleCopyPhone}
                                            copiedId={copiedId}
                                            handleMarkAsLost={handleMarkAsLost}
                                            handleDeleteLead={handleDeleteLead}
                                            openScheduler={openScheduler}
                                            handleConfirmPresence={handleConfirmPresence}
                                            setMissedModalLead={setMissedModalLead}
                                            setMatriculaModalOpen={setMatriculaModalOpen}
                                            openMover={openMover}
                                            setDragTargetLead={setDragTargetLead}
                                            mapLeadToStageId={mapLeadToStageId}
                                        />
                                    ))}
                                </SortableContext>

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
                            </Column>
                        );
                    })}
                </div>

                <DragOverlay dropAnimation={dropAnimationConfig}>
                    {activeId ? (
                        <LeadCard
                            lead={getLeadById(activeId)}
                            isOverlay
                            navigate={navigate}
                            openNote={openNote}
                            openMenuId={openMenuId}
                            schedulerOpenId={schedulerOpenId}
                            moverOpenId={moverOpenId}
                            setOpenMenuId={setOpenMenuId}
                            setWaDropdownOpenId={setWaDropdownOpenId}
                            handleSplitWaMain={handleSplitWaMain}
                            toggleWaDropdown={toggleWaDropdown}
                            waDropdownOpenId={waDropdownOpenId}
                            templateSendKeys={templateSendKeys}
                            sendTemplateFromPipeline={sendTemplateFromPipeline}
                            handleReschedule={handleReschedule}
                            itemsForDay={itemsForDay}
                            isExpanded={isExpanded}
                            toggleExpanded={toggleExpanded}
                            MAX_CHIPS={MAX_CHIPS}
                            stages={stages}
                            moveToStatus={moveToStatus}
                            handleCopyPhone={handleCopyPhone}
                            copiedId={copiedId}
                            handleMarkAsLost={handleMarkAsLost}
                            handleDeleteLead={handleDeleteLead}
                            openScheduler={openScheduler}
                            handleConfirmPresence={handleConfirmPresence}
                            setMissedModalLead={setMissedModalLead}
                            setMatriculaModalOpen={setMatriculaModalOpen}
                            openMover={openMover}
                            setDragTargetLead={setDragTargetLead}
                            mapLeadToStageId={mapLeadToStageId}
                        />
                    ) : null}
                </DragOverlay>
            </DndContext>

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
                        try {
                            await addLeadEvent({
                                academyId,
                                leadId: dragTargetLead.id,
                                type: 'converted',
                                from: dragTargetLead.pipelineStage || '',
                                to: LEAD_STATUS.CONVERTED,
                                createdBy: userId || 'user',
                                permissionContext: permCtx
                            });
                            await updateLead(dragTargetLead.id, {
                                status: LEAD_STATUS.CONVERTED,
                                contact_type: 'student',
                                pipelineStage: 'Matriculado',
                                convertedAt: new Date().toISOString()
                            });
                            setToast('Lead matriculado com sucesso!');
                            setTimeout(() => setToast(''), 2000);
                            setDragTargetLead(null);
                        } catch (err) {
                            addToast({ type: 'error', message: friendlyError(err, 'action') });
                        }
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

            {missedModalLead && (
                <div className="note-overlay" onClick={() => setMissedModalLead(null)}>
                    <div className="note-modal mini-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '340px' }}>
                        <h4 className="navi-section-heading" style={{ marginBottom: 16, fontSize: '0.95rem' }}>Por que não compareceu?</h4>
                        <div className="reason-grid">
                            {[
                                'Esqueceu',
                                'Imprevisto pessoal',
                                'Problema de saúde',
                                'Não avisou',
                                'Vai remarcar',
                                'Outro'
                            ].map(reason => (
                                <button
                                    key={reason}
                                    className="reason-chip"
                                    onClick={() => handleMissedWithReason(missedModalLead, reason)}
                                >
                                    {reason}
                                </button>
                            ))}
                        </div>
                        <div className="note-footer" style={{ marginTop: 20 }}>
                            <button className="btn-ghost" onClick={() => setMissedModalLead(null)} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {lostModalLead && (
                <LostReasonModal
                    isOpen={!!lostModalLead}
                    leadName={lostModalLead?.name || 'Lead'}
                    onClose={() => setLostModalLead(null)}
                    onConfirm={async (reason) => {
                        const cur = lostModalLead;
                        try {
                            await addLeadEvent({
                                academyId,
                                leadId: cur.id,
                                type: 'lost',
                                from: cur?.status || '',
                                to: LEAD_STATUS.LOST,
                                text: String(reason || '').slice(0, 1000),
                                createdBy: userId || 'user',
                                permissionContext: permCtx
                            });
                            await updateLead(cur.id, {
                                status: LEAD_STATUS.LOST,
                                scheduledDate: '',
                                scheduledTime: '',
                                pipelineStage: LEAD_STATUS.LOST,
                                lostReason: reason,
                                lostAt: new Date().toISOString()
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
        .main-content.pipeline-active { overflow: hidden !important; padding: 0 !important; }
        .pipeline-container { width: 100%; display: flex; flex-direction: column; flex: 1 1 0 !important; min-height: 0; overflow: hidden; }
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
        .filters-mobile-toggle-wrap { display: none; }
        @media (max-width: 1024px) {
          .header-layout { align-items: flex-start; }
          .header-left { width: 100%; }
          .filters { width: 100%; margin-right: 0; }
          .header-right { width: 100%; justify-content: flex-start; }
        }
        @media (max-width: 640px) {
          .filters-mobile-toggle-wrap { display: block; width: 100%; margin-top: 4px; }
          .filters-mobile-toggle { width: 100%; min-height: 44px; }
          .filters.filters-collapsed-mobile { display: none; }
        }
        .pipeline-kanban-loading-hint {
          padding: 8px 16px 0;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-secondary);
        }
        .kanban-wrapper { 
          display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; padding: 10px 12px 0; flex: 1 1 0;
          min-height: 0;
          align-items: stretch;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          scrollbar-gutter: stable;
        }
        .kanban-wrapper::-webkit-scrollbar {
          height: 0;
        }
        .kanban-wrapper::-webkit-scrollbar-track {
          background: transparent;
        }
        .kanban-wrapper::-webkit-scrollbar-thumb {
          background: var(--border-secondary);
          border-radius: 4px;
        }
        .kanban-wrapper:hover { scrollbar-width: thin; }
        .kanban-wrapper:hover::-webkit-scrollbar { height: 4px; }
        .kanban-wrapper:hover::-webkit-scrollbar-track { background: transparent; }
        .kanban-wrapper:hover::-webkit-scrollbar-thumb {
          background: var(--border-secondary);
          border-radius: 4px;
        }
        @media (max-width: 1023px) {
          .kanban-wrapper {
            scrollbar-width: thin;
            -webkit-overflow-scrolling: touch;
          }
          .kanban-wrapper::-webkit-scrollbar {
            height: 3px;
          }
          .kanban-wrapper::after {
            content: '';
            position: sticky;
            right: 0;
            width: 24px;
            background: linear-gradient(to right, transparent, rgba(0, 0, 0, 0.06));
            pointer-events: none;
            flex-shrink: 0;
          }
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
          overflow-y: auto;
          overflow-x: visible;
          padding-bottom: 12px;
          border-radius: var(--radius-sm);
          transition: background 0.12s ease, outline 0.12s ease;
        }
        .pipeline-kanban-skeleton-col {
          pointer-events: none;
          opacity: 0.92;
        }
        .pipeline-kanban-skeleton-count {
          display: inline-block;
          min-width: 28px;
          height: 22px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(148,163,184,0.14) 25%, rgba(148,163,184,0.28) 50%, rgba(148,163,184,0.14) 75%);
          background-size: 200% 100%;
          animation: pipelineKanbanSk 1.15s ease-in-out infinite;
        }
        .pipeline-kanban-skeleton-card {
          height: 88px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-light);
          background: linear-gradient(90deg, rgba(148,163,184,0.1) 25%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.1) 75%);
          background-size: 200% 100%;
          animation: pipelineKanbanSk 1.15s ease-in-out infinite;
        }
        .pipeline-kanban-skeleton-card--short { height: 72px; }
        @keyframes pipelineKanbanSk {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pipeline-kanban-skeleton-count,
          .pipeline-kanban-skeleton-card {
            animation: none;
            background: rgba(148,163,184,0.16);
          }
        }
        .col-header { 
          display: flex; justify-content: space-between; align-items: flex-start; 
          padding-bottom: 10px; margin-bottom: 4px; gap: 8px;
        }
        .col-header-titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .col-content {
          flex: 1 1 auto; min-width: 0; min-height: 40px;
          display: flex; flex-direction: column; gap: 8px;
          overflow: visible;
        }
        .drop-target { background: var(--accent-light) !important; outline: 2px dashed var(--accent); outline-offset: -2px; }
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
          position: relative;
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
        .pipeline-btn-secondary,
        .pipeline-btn-outline {
          min-height: 38px;
          padding: 0 14px;
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        .pipeline-btn-secondary {
          background: var(--surface-hover);
          border: 1px solid var(--border);
          color: var(--text-secondary);
        }
        .pipeline-btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
        .pipeline-btn-outline {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text-secondary);
        }
        .pipeline-btn-outline:hover { border-color: var(--accent); color: var(--accent); }
        .header-right .export-btn {
          min-height: 34px;
          padding: 0 10px;
          border: 1px solid var(--border);
          background: transparent;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
        }
        .header-right .export-btn:hover {
          background: var(--surface-hover);
          border-color: var(--border-secondary);
          color: var(--text-secondary);
        }
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
         .action-bar--reorganized { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
        .wa-split-btn { display: flex; align-items: stretch; border: 1px solid var(--success); border-radius: var(--radius-sm); overflow: visible; position: relative; background: var(--success); }
        .wa-main-btn { background: var(--success); color: white; border: none; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; gap: 6px; cursor: pointer; border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
        .wa-main-btn:hover { background: #2e7d32; }
        .wa-drop-toggle { background: #2e7d32; color: white; border: none; border-left: 1px solid rgba(255,255,255,0.2); padding: 0 6px; cursor: pointer; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; display: flex; align-items: center; }
        .wa-templates-dropdown { position: absolute; top: 100%; left: 0; margin-top: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); min-width: 180px; z-index: 100; overflow: hidden; }
        .dropdown-panel-header { padding: 10px 14px 6px; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-light); }
        .action-btn--menu { width: 34px; height: 34px; padding: 0; border-radius: var(--radius-sm); background: var(--surface-hover); border: 1px solid var(--border); cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
        .action-menu-panel { position: absolute; top: 100%; right: 0; margin-top: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-panel); box-shadow: var(--shadow-lg); min-width: 220px; z-index: 4000; overflow: hidden; padding: 6px 0; }
        .menu-group { display: flex; flex-direction: column; }
        .menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 14px; background: transparent; border: none; color: var(--text-secondary); font-size: 0.82rem; font-weight: 600; text-align: left; cursor: pointer; transition: background 0.15s; }
        .menu-item:hover { background: var(--surface-hover); color: var(--accent); }
        .menu-item svg { color: var(--text-muted); }
        .menu-item:hover svg { color: var(--accent); }
        .menu-item.primary { color: var(--accent); }
        .menu-item.success { color: var(--success); }
        .menu-item.warning { color: var(--warning); }
        .menu-item.danger-text { color: var(--danger); }
        .menu-item.danger-text:hover { background: var(--danger-light); }
        .menu-divider { height: 1px; background: var(--border-light); margin: 6px 0; }
        .reason-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .reason-chip { padding: 10px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); font-size: 0.78rem; font-weight: 600; cursor: pointer; text-align: center; }
        .reason-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }

        /* Estilos D&D Kit */
        .kanban-column { transition: background 0.2s, border-color 0.2s; border: 1px solid transparent; }
        .kanban-col--drag-over { background: rgba(91, 63, 191, 0.04); border-color: rgba(91, 63, 191, 0.3); }
        .lead-card { cursor: grab; }
        .lead-card:active { cursor: grabbing; }
        .lead-card--dragging { opacity: 0.4; border: 2px dashed var(--border-secondary); background: var(--surface-hover); cursor: grabbing; }
        .lead-card--overlay { opacity: 0.95; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2); transform: rotate(2deg) scale(1.02); cursor: grabbing; z-index: 500; pointer-events: none; }
        .lead-card--placeholder { height: 80px; border: 2px dashed var(--border); background: var(--surface-hover); border-radius: var(--radius-sm); opacity: 0.5; margin-bottom: 8px; }
      `}} />
            {toast && <div className="toast">{toast}</div>}
            {confirmModal && (
                <div className="note-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="note-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="navi-section-heading" style={{ marginBottom: 8 }}>{confirmModal.title}</h3>
                        <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>{confirmModal.description}</p>
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setConfirmModal(null)}>Cancelar</button>
                            <button className="btn-secondary" onClick={() => void confirmModal.onConfirm?.()}>{confirmModal.confirmLabel || 'Confirmar'}</button>
                        </div>
                    </div>
                </div>
            )}
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
                        {noteError ? <p className="text-small" style={{ color: 'var(--danger)', marginTop: 8 }}>{noteError}</p> : null}
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setNoteOpen(false)}>Cancelar</button>
                            <button className="btn-secondary" onClick={saveNote} disabled={!String(noteText || '').trim()}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
            <NlCommandBar open={nlOpen} onOpenChange={setNlOpen} context="funil" />
        </div>
    );
};

export default Pipeline;
