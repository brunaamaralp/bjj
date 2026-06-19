import '../styles/tasks.css';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';
import { useTaskStore, serverTaskFilters, buildTasksFetchKey } from '../store/useTaskStore';
import { useLeadStore } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import {
  buildTaskLinkablePeople,
  filterTaskLinkablePeople,
  profilePathForLinkablePerson,
} from '../lib/taskLinkablePeople.js';
import { useUiStore } from '../store/useUiStore';
import { fetchTeamMemberships } from '../lib/teamApi.js';
import { TASKS_HUB_TABS, TASKS_TAB_OPERACAO, TASKS_TAB_PROCESSOS, resolveTasksHubTab } from '../lib/tasksHubTabs.js';
import { PROCESSOS_DEFAULT_SECTION } from '../lib/processosSettingsSections.js';
import { TASKS_COPY } from '../lib/tasksCopy.js';
import TaskProcessosTab from './TaskProcessosTab.jsx';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { DateInputField } from '../components/DateInput';
import TaskCard from '../components/shared/TaskCard.jsx';
import { isTaskOverdue as isVencida } from '../lib/taskDue.js';
import {
  CheckSquare,
  PlusCircle,
  X,
  ClipboardList,
  AlertTriangle,
  Users,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { progressLabelForLead } from '../lib/taskTemplates.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import { friendlyError } from '../lib/errorMessages';
import { useTerms, contactLabelSingular } from '../lib/terminology.js';
import CollectionResultModal from '../components/CollectionResultModal.jsx';
import { useModalA11y } from '../hooks/useModalA11y.js';
import {
  isCollectionTask,
  parseCollectionTaskDescription,
  formatCollectionAttemptText,
} from '../lib/collectionRules.js';
import { addLeadEvent } from '../lib/leadEvents.js';
import { membershipPrimaryLabel } from '../lib/teamMembershipLabel.js';

const VIEW_STORAGE_KEY = 'nave_tasks_view';
/** Tarefas visíveis por aluno antes de exigir "Ver mais". */
const STUDENT_TASKS_PREVIEW = 4;
/** Id sintético para expandir/recolher o grupo de tarefas sem aluno. */
const UNLINKED_STUDENT_GROUP_ID = '__unlinked__';

function initialsFromName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function sortTasksForStudentGroup(tasks, isOverdue) {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done';
    const bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aLate = !aDone && isOverdue(a.due_date);
    const bLate = !bDone && isOverdue(b.due_date);
    if (aLate !== bLate) return aLate ? -1 : 1;
    const aDue = String(a.due_date || '').trim().slice(0, 10) || '9999-12-31';
    const bDue = String(b.due_date || '').trim().slice(0, 10) || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });
}

function buildStudentTaskGroup(leadId, leadName, tasks, isOverdue) {
  const tasksSorted = sortTasksForStudentGroup(tasks, isOverdue);
  const pendingTasks = [];
  const doneTasks = [];
  let overdueCount = 0;
  for (const t of tasksSorted) {
    if (t.status === 'done') {
      doneTasks.push(t);
    } else {
      pendingTasks.push(t);
      if (isOverdue(t.due_date)) overdueCount += 1;
    }
  }
  return {
    leadId,
    leadName,
    tasks: tasksSorted,
    pendingTasks,
    doneTasks,
    pendingCount: pendingTasks.length,
    doneCount: doneTasks.length,
    overdueCount,
  };
}

function compareStudentGroupsByUrgency(a, b) {
  if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
  if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
  return String(a.leadName).localeCompare(String(b.leadName), 'pt-BR');
}

function studentGroupVisibleInByStudentView(group, showCompletedOnly) {
  if (showCompletedOnly) return group.doneCount > 0;
  return group.pendingCount > 0;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Segunda-feira 00:00 local da semana que contém `ref`. */
function startOfWeekMondayLocal(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isDueInCurrentWeek(dueStr) {
  if (!dueStr || !String(dueStr).trim()) return false;
  const mon = startOfWeekMondayLocal();
  const ymdDue = String(dueStr).trim().slice(0, 10);
  const due = new Date(ymdDue.length === 10 ? `${ymdDue}T00:00:00` : ymdDue);
  const dDue = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const dSun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate(), 0, 0, 0, 0);
  return dDue.getTime() >= mon.getTime() && dDue.getTime() <= dSun.getTime();
}

const TASKS_KANBAN_VIRTUAL_THRESHOLD = 20;

const TASK_KANBAN_COLUMN = {
  ATRASADAS: 'atrasadas',
  A_FAZER: 'a-fazer',
  CONCLUIDAS: 'concluidas',
};

const TASK_KANBAN_COLUMN_IDS = new Set([
  TASK_KANBAN_COLUMN.ATRASADAS,
  TASK_KANBAN_COLUMN.A_FAZER,
  TASK_KANBAN_COLUMN.CONCLUIDAS,
]);

const KANBAN_INSERT_END = '__end__';

function KanbanDropSlot() {
  return <div className="kanban-drop-slot" aria-hidden />;
}

const TASK_KANBAN_DROP_ANIMATION = {
  duration: 180,
  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
};

const TASK_KANBAN_COLUMN_MAP = {
  [TASK_KANBAN_COLUMN.CONCLUIDAS]: { status: 'done' },
  [TASK_KANBAN_COLUMN.A_FAZER]: { status: 'pending' },
  [TASK_KANBAN_COLUMN.ATRASADAS]: { status: 'pending' },
};

function resolveTaskKanbanColumnId(over, kanbanColumns) {
  if (!over) return null;
  const overId = String(over.id || '');
  if (TASK_KANBAN_COLUMN_IDS.has(overId)) return overId;
  if (kanbanColumns.atrasadas.some((t) => String(t.id) === overId)) return TASK_KANBAN_COLUMN.ATRASADAS;
  if (kanbanColumns.aFazer.some((t) => String(t.id) === overId)) return TASK_KANBAN_COLUMN.A_FAZER;
  if (kanbanColumns.concluidas.some((t) => String(t.id) === overId)) return TASK_KANBAN_COLUMN.CONCLUIDAS;
  return null;
}

const SortableTaskCard = React.memo(function SortableTaskCard({
  task,
  isUpdating,
  assigneeLabel,
  assigneeInitials,
  onComplete,
  onEdit,
  onDelete,
  onOpen,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    visibility: isDragging ? 'hidden' : undefined,
    opacity: isDragging ? 0 : undefined,
    pointerEvents: isDragging ? 'none' : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="tasks-kanban-sortable-item" {...attributes} {...listeners}>
      <TaskCard
        task={task}
        isUpdating={isUpdating}
        assigneeLabel={assigneeLabel}
        assigneeInitials={assigneeInitials}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onOpen={onOpen}
      />
    </div>
  );
});

function TasksKanbanColumn({ columnId, className, head, children, isDropTarget, isDragActive }) {
  const { setNodeRef } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`${className}${isDropTarget ? ' tasks-kanban-col--drag-over' : ''}${isDragActive && isDropTarget ? ' tasks-kanban-col--drag-active' : ''}`}
    >
      {head}
      <div className="tasks-kanban-col-drop-host">
        {isDragActive && isDropTarget ? (
          <div className="kanban-col-drop-zone" aria-hidden>
            <span className="kanban-col-drop-zone__label">Soltar nesta coluna</span>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function TasksKanbanColumnBody({
  tasks,
  renderCard,
  hasMore,
  loadingMore,
  onLoadMore,
  disableVirtualization = false,
  showInsertSlots = false,
  insertOverId = null,
}) {
  const scrollRef = useRef(null);
  const shouldVirtualize =
    !disableVirtualization && tasks.length > TASKS_KANBAN_VIRTUAL_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? tasks.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  return (
    <div
      ref={scrollRef}
      className="tasks-kanban-col-body task-list task-virtual-scroll"
    >
      {shouldVirtualize ? (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const t = tasks[virtualRow.index];
            if (!t) return null;
            return (
              <div
                key={t.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderCard(t)}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {tasks.map((t) => (
            <React.Fragment key={t.id}>
              {showInsertSlots && insertOverId === String(t.id) ? <KanbanDropSlot /> : null}
              {renderCard(t)}
            </React.Fragment>
          ))}
          {showInsertSlots && insertOverId === KANBAN_INSERT_END ? <KanbanDropSlot /> : null}
        </>
      )}
      {hasMore ? (
        <button
          type="button"
          className="btn-action-ghost task-kanban-load-more"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? 'Carregando…' : 'Carregar mais'}
        </button>
      ) : null}
    </div>
  );
}

export default function Tasks() {
  const navigate = useNavigate();
  const terms = useTerms();
  const labels = useLeadStore((s) => s.labels);
  const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
  const academyId = useLeadStore((s) => s.academyId);
  const teamId = useLeadStore((s) => s.teamId);
  const leads = useLeadStore((s) => s.leads);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const students = useStudentStore((s) => s.students);
  const tasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const loadingMore = useTaskStore((s) => s.loadingMore);
  const tasksHasMore = useTaskStore((s) => s.tasksHasMore);
  const error = useTaskStore((s) => s.error);
  const filters = useTaskStore((s) => s.filters);
  const setFilter = useTaskStore((s) => s.setFilter);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const fetchMoreTasks = useTaskStore((s) => s.fetchMoreTasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const patchTaskLocal = useTaskStore((s) => s.patchTaskLocal);
  const isUpdating = useTaskStore((s) => s.isUpdating);
  const addToast = useUiStore((s) => s.addToast);

  const [searchParams, setSearchParams] = useSearchParams();
  const hubTab = resolveTasksHubTab(searchParams.get('tab'));
  const isProcessosHub = hubTab === TASKS_TAB_PROCESSOS;

  const handleHubTabChange = useCallback(
    (id) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === TASKS_TAB_OPERACAO) {
            next.delete('tab');
            next.delete('section');
          } else {
            next.set('tab', id);
            if (!String(next.get('section') || '').trim()) {
              next.set('section', PROCESSOS_DEFAULT_SECTION);
            }
          }
          return next;
        },
        { replace: id === TASKS_TAB_OPERACAO }
      );
    },
    [setSearchParams]
  );
  const initLeadId = searchParams.get('lead_id') || '';
  const initNew = searchParams.get('new') === '1';

  useEffect(() => {
    const f = String(searchParams.get('filter') || '').trim().toLowerCase();
    const status = String(searchParams.get('status') || '').trim().toLowerCase();
    const period = String(searchParams.get('period') || '').trim().toLowerCase();

    if (f === 'overdue' || f === 'vencidas' || status === 'vencidas') {
      setFilter('status', 'vencidas');
    } else if (status === 'pendentes') {
      setFilter('status', 'pendentes');
    }

    if (period === 'today') {
      setPeriodTodayOn(true);
    }
  }, [searchParams, setFilter]);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(false);

  const effectiveTeamId = useMemo(() => {
    const acad = (academyList || []).find((a) => a.id === academyId);
    return String(acad?.teamId || teamId || '').trim();
  }, [academyList, academyId, teamId]);

  const linkablePeople = useMemo(
    () => buildTaskLinkablePeople(leads, students),
    [leads, students]
  );

  const linkableById = useMemo(() => {
    const map = new Map();
    for (const p of linkablePeople) map.set(p.id, p);
    return map;
  }, [linkablePeople]);

  const [collectionModalTask, setCollectionModalTask] = useState(null);
  const [collectionSaving, setCollectionSaving] = useState(false);
  const [showModal, setShowModal] = useState(initNew);
  const suppressOverlayCloseUntil = useRef(0);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', due_date: '', assigned_to: '', lead_id: initLeadId });
  const [saving, setSaving] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const leadDropRef = useRef(null);

  const filteredLinkablePeople = useMemo(
    () => filterTaskLinkablePeople(linkablePeople, leadSearch),
    [linkablePeople, leadSearch]
  );

  // Carrega todas as páginas de leads + alunos ao abrir o modal (matriculados saem de leads).
  useEffect(() => {
    if (!showModal || !academyId) return;
    let cancelled = false;
    (async () => {
      let guard = 0;
      while (!cancelled && useLeadStore.getState().leadsHasMore && guard < 40) {
        await useLeadStore.getState().fetchMoreLeads();
        guard += 1;
      }
      guard = 0;
      while (!cancelled && useStudentStore.getState().studentsHasMore && guard < 40) {
        await useStudentStore.getState().fetchMoreStudents();
        guard += 1;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showModal, academyId]);

  useEffect(() => {
    if (!initLeadId) return;
    const person = linkableById.get(initLeadId);
    if (person?.name) setLeadSearch(person.name);
  }, [initLeadId, linkableById]);

  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === 'kanban' || v === 'calendar' || v === 'by_student' || v === 'list') return v;
      return 'by_student';
    } catch {
      return 'by_student';
    }
  });
  const [estaSemanaOn, setEstaSemanaOn] = useState(false);
  const [periodTodayOn, setPeriodTodayOn] = useState(false);
  const [expandedStudentIds, setExpandedStudentIds] = useState(() => new Set());
  const [expandedCompletedStudentIds, setExpandedCompletedStudentIds] = useState(() => new Set());
  const [detailTask, setDetailTask] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    if (!showModal) return;
    suppressOverlayCloseUntil.current = Date.now() + 400;
  }, [showModal, editingTask?.id]);

  const requestCloseModal = useCallback(() => {
    if (saving) return;
    setShowModal(false);
  }, [saving]);

  const handleTaskModalOverlayPointerUp = useCallback(
    (e) => {
      if (e.target !== e.currentTarget) return;
      if (Date.now() < suppressOverlayCloseUntil.current) return;
      requestCloseModal();
    },
    [requestCloseModal]
  );

  useModalA11y({ isOpen: showModal, onClose: requestCloseModal });

  // Sincronizar filtro ao carregar a página se tiver lead_id na URL
  useEffect(() => {
    if (initLeadId && filters.lead_id !== initLeadId) {
      setFilter('lead_id', initLeadId);
    }
  }, [initLeadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Membros da equipe (responsável) — API server enriquece nome/e-mail (SDK cliente omite por privacidade)
  useEffect(() => {
    if (!academyId) {
      setMembers([]);
      setMembersError(false);
      setMembersLoading(false);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(false);
    fetchTeamMemberships(academyId)
      .then((data) => {
        if (!cancelled) {
          const rows = (data.memberships || []).filter((m) => String(m?.userId || '').trim());
          setMembers(rows);
        }
      })
      .catch((e) => {
        console.error('Erro ao buscar membros', e);
        if (!cancelled) {
          setMembers([]);
          setMembersError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const filterLeadId = filters.lead_id;
  const filterAssigned = filters.assigned_to;
  const apiTaskFilters = useMemo(() => {
    const base = serverTaskFilters(
      { status: filters.status, assigned_to: filterAssigned, lead_id: filterLeadId },
      userId
    );
    if (!periodTodayOn || base.overdue === '1') return base;
    return {
      ...base,
      due_today: '1',
      ...(filters.status === 'all' ? { status: null } : {}),
    };
  }, [filters.status, filterAssigned, filterLeadId, userId, periodTodayOn]);
  const tasksFetchKey = useMemo(
    () => buildTasksFetchKey(academyId, apiTaskFilters),
    [academyId, apiTaskFilters]
  );
  const lastTasksFetchKeyRef = useRef('');
  const staleMs = 5 * 60 * 1000;

  useEffect(() => {
    if (!academyId) return;
    const { tasksLastFetchedAt, tasksFetchKey: cachedKey, error: storeError } = useTaskStore.getState();
    const stale =
      !tasksLastFetchedAt || Date.now() - tasksLastFetchedAt > staleMs || Boolean(storeError);
    const keyChanged = lastTasksFetchKeyRef.current !== tasksFetchKey;
    const scopeMismatch = cachedKey !== tasksFetchKey;
    if (!keyChanged && !stale && !scopeMismatch) return;

    lastTasksFetchKeyRef.current = tasksFetchKey;
    void fetchTasks(academyId, { reset: true, filters: apiTaskFilters, scopeMismatch });
  }, [academyId, tasksFetchKey, apiTaskFilters, fetchTasks, staleMs]);

  const handleLoadMoreTasks = useCallback(() => {
    if (!academyId || loadingMore || !tasksHasMore) return;
    void fetchMoreTasks(academyId, { filters: apiTaskFilters });
  }, [academyId, loadingMore, tasksHasMore, fetchMoreTasks, apiTaskFilters]);

  useEffect(() => {
    if (!showLeadDrop) return;
    const handler = (e) => {
      if (leadDropRef.current && !leadDropRef.current.contains(e.target)) setShowLeadDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLeadDrop]);

  useEffect(() => {
    if (!detailTask) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailTask]);

  const [quickTitle, setQuickTitle] = useState('');
  const [quickError, setQuickError] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [kanbanActiveId, setKanbanActiveId] = useState(null);
  const [kanbanDragOver, setKanbanDragOver] = useState(null);
  const [kanbanInsertOverId, setKanbanInsertOverId] = useState(null);

  const todayYmd = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const handleQuickCreate = async () => {
    const title = String(quickTitle || '').trim();
    if (!title) {
      setQuickError('Digite um título');
      return;
    }
    if (!academyId) return;
    setQuickSaving(true);
    setQuickError('');
    try {
      await createTask({
        title,
        description: '',
        due_date: todayYmd,
        assigned_to: '',
        lead_id: filters.lead_id || '',
        lead_name: filters.lead_id ? linkableById.get(filters.lead_id)?.name || '' : '',
      });
      setQuickTitle('');
      addToast({ type: 'success', message: 'Tarefa criada' });
    } catch {
      setQuickError('Não foi possível criar. Tente novamente.');
    } finally {
      setQuickSaving(false);
    }
  };

  const filteredTasksBase = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.lead_id && t.lead_id !== filters.lead_id) return false;
      return true;
    });
  }, [tasks, filters.lead_id]);

  const filteredTasks = useMemo(() => {
    let list = filteredTasksBase;
    if (estaSemanaOn) {
      list = list.filter((t) => isDueInCurrentWeek(t.due_date));
    }
    if (periodTodayOn) {
      list = list.filter((t) => {
        const due = String(t.due_date || '').trim().slice(0, 10);
        return due === todayYmd;
      });
    }
    return list;
  }, [filteredTasksBase, estaSemanaOn, periodTodayOn, todayYmd]);

  const hasActiveFilters =
    filters.status !== 'all' || Boolean(filters.lead_id) || estaSemanaOn || periodTodayOn;

  const emptyFilterTitle = useMemo(() => {
    if (filters.status === 'vencidas') return 'Nenhuma tarefa vencida.';
    if (filters.status === 'concluidas') return 'Nenhuma tarefa concluída.';
    if (filters.status === 'minhas') return 'Nenhuma tarefa atribuída a você.';
    if (filters.status === 'pendentes') return 'Nenhuma tarefa pendente.';
    if (estaSemanaOn) return 'Nenhuma tarefa nesta semana.';
    if (periodTodayOn) return 'Nenhuma tarefa para hoje.';
    if (filters.lead_id) return 'Nenhuma tarefa para este aluno.';
    return 'Nenhuma tarefa corresponde a este filtro.';
  }, [filters.status, filters.lead_id, estaSemanaOn, periodTodayOn]);

  const semPrazoExcluidasCount = useMemo(
    () => filteredTasksBase.filter((t) => !t.due_date || !String(t.due_date).trim()).length,
    [filteredTasksBase]
  );

  const semPrazoTasksForCalendar = useMemo(
    () => filteredTasksBase.filter((t) => !t.due_date || !String(t.due_date).trim()),
    [filteredTasksBase]
  );

  const tasksByDueYmd = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      const raw = String(t.due_date || '').trim().slice(0, 10);
      if (!raw || raw.length < 10) continue;
      if (!map[raw]) map[raw] = [];
      map[raw].push(t);
    }
    return map;
  }, [filteredTasks]);

  const byStudentShowCompletedOnly = filters.status === 'concluidas';

  const tasksByLead = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      const lid = String(t.lead_id || '').trim();
      if (!lid) continue;
      if (!map[lid]) {
        map[lid] = {
          leadId: lid,
          leadName: String(t.lead_name || '').trim() || linkableById.get(lid)?.name || 'Aluno',
          tasks: [],
        };
      }
      map[lid].tasks.push(t);
    }
    return Object.values(map)
      .map((group) => buildStudentTaskGroup(group.leadId, group.leadName, group.tasks, isVencida))
      .filter((group) => studentGroupVisibleInByStudentView(group, byStudentShowCompletedOnly))
      .sort((a, b) =>
        byStudentShowCompletedOnly
          ? String(a.leadName).localeCompare(String(b.leadName), 'pt-BR')
          : compareStudentGroupsByUrgency(a, b)
      );
  }, [filteredTasks, linkableById, byStudentShowCompletedOnly]);

  const unlinkedTasksGroup = useMemo(() => {
    const tasks = filteredTasks.filter((t) => !String(t.lead_id || '').trim());
    if (tasks.length === 0) return null;
    const group = buildStudentTaskGroup(UNLINKED_STUDENT_GROUP_ID, 'Sem aluno vinculado', tasks, isVencida);
    return studentGroupVisibleInByStudentView(group, byStudentShowCompletedOnly) ? group : null;
  }, [filteredTasks, byStudentShowCompletedOnly]);

  const byStudentEmptyHint = useMemo(() => {
    if (byStudentShowCompletedOnly) return null;
    const hasPending = filteredTasks.some((t) => t.status !== 'done');
    const hasDone = filteredTasks.some((t) => t.status === 'done');
    if (!hasPending && hasDone) {
      return 'Nenhuma tarefa em aberto. Use o filtro Concluídas para ver o histórico.';
    }
    return null;
  }, [filteredTasks, byStudentShowCompletedOnly]);

  const kanbanColumns = useMemo(() => {
    const atrasadas = [];
    const aFazer = [];
    const concluidas = [];
    filteredTasks.forEach((t) => {
      if (t.status === 'done') {
        concluidas.push(t);
      } else if (isVencida(t.due_date)) {
        atrasadas.push(t);
      } else {
        aFazer.push(t);
      }
    });
    return { atrasadas, aFazer, concluidas };
  }, [filteredTasks]);

  const kanbanDragging = kanbanActiveId != null;

  const kanbanSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
      onActivation: ({ event }) => {
        if (event.target.closest?.('[data-no-dnd]')) {
          return false;
        }
      },
    }),
  );

  const activeKanbanTask = useMemo(
    () => (kanbanActiveId ? tasks.find((t) => String(t.id) === String(kanbanActiveId)) : null),
    [kanbanActiveId, tasks],
  );

  const calMatrix = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const firstDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calMonth.y, calMonth.m]);

  const calMonthLabel = useMemo(
    () =>
      new Date(calMonth.y, calMonth.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [calMonth.y, calMonth.m]
  );

  function shiftCalMonth(delta) {
    setCalMonth((prev) => {
      const d = new Date(prev.y, prev.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function detailStatusMeta(t) {
    if (t.status === 'done') return { label: 'Concluída', cls: 'task-drawer-badge--done' };
    if (isVencida(t.due_date)) return { label: 'Atrasada', cls: 'task-drawer-badge--late' };
    return { label: 'Pendente', cls: 'task-drawer-badge--pending' };
  }

  const groupedTasks = useMemo(() => {
    const vencidas = [];
    const pendentes = [];
    const concluidas = [];
    
    filteredTasks.forEach(t => {
      if (t.status === 'done') {
        concluidas.push(t);
      } else if (isVencida(t.due_date)) {
        vencidas.push(t);
      } else {
        pendentes.push(t);
      }
    });
    
    return { vencidas, pendentes, concluidas };
  }, [filteredTasks]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      addToast({ type: 'error', message: 'Título é obrigatório' });
      return;
    }
    
    setSaving(true);
    try {
      let leadName = '';
      if (form.lead_id) {
        leadName = linkableById.get(form.lead_id)?.name || '';
      }
      
      const payload = { ...form, lead_name: leadName };
      
      if (editingTask) {
        await updateTask(editingTask.id, payload);
        addToast({ type: 'success', message: 'Tarefa atualizada' });
      } else {
        await createTask(payload);
        addToast({ type: 'success', message: 'Tarefa criada' });
      }
      setShowModal(false);
    } catch {
      addToast({ type: 'error', message: 'Erro ao salvar tarefa' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = useCallback((t) => {
    setEditingTask(t);
    setForm({
      title: t.title || '',
      description: t.description || '',
      due_date: t.due_date || '',
      assigned_to: t.assigned_to || '',
      lead_id: t.lead_id || ''
    });
    const person = linkableById.get(t.lead_id);
    setLeadSearch(person?.name || '');
    setShowModal(true);
  }, [linkableById]);

  const openEditFromDetail = () => {
    const t = detailTask;
    setDetailTask(null);
    if (t) openEdit(t);
  };

  const openNew = () => {
    setEditingTask(null);
    const lid = filters.lead_id || '';
    setForm({ title: '', description: '', due_date: '', assigned_to: '', lead_id: lid });
    setLeadSearch(lid ? linkableById.get(lid)?.name || '' : '');
    setShowModal(true);
  };

  const permCtx = useMemo(() => {
    const acad = (academyList || []).find((a) => a.id === academyId) || {};
    return { ownerId: acad.ownerId, teamId: acad.teamId || teamId, userId: userId || '' };
  }, [academyList, academyId, teamId, userId]);

  const toggleDone = useCallback(async (t) => {
    if (t.status !== 'done' && isCollectionTask(t)) {
      setCollectionModalTask(t);
      return;
    }
    if (isUpdating(t.id)) return;
    const previousStatus = t.status;
    const newStatus = previousStatus === 'done' ? 'pending' : 'done';
    patchTaskLocal(t.id, { status: newStatus });
    try {
      await updateTask(t.id, { status: newStatus });
    } catch {
      patchTaskLocal(t.id, { status: previousStatus });
      addToast({ type: 'error', message: 'Erro ao atualizar status' });
    }
  }, [isUpdating, patchTaskLocal, updateTask, addToast]);

  const handleCollectionConfirm = async ({ result, notes }) => {
    const t = collectionModalTask;
    if (!t?.id || !academyId) return;
    const meta = parseCollectionTaskDescription(t.description);
    setCollectionSaving(true);
    try {
      await updateTask(t.id, { status: 'done' });
      if (t.lead_id) {
        await addLeadEvent({
          academyId,
          leadId: t.lead_id,
          type: 'collection_attempt',
          text: formatCollectionAttemptText({
            stage: meta?.stage || t.title,
            result,
            notes,
          }),
          createdBy: userId || 'user',
          payloadJson: {
            date: new Date().toISOString(),
            stage: meta?.stage || '',
            stage_day: meta?.day ?? null,
            result,
            notes: notes || '',
            task_id: t.id,
          },
          permissionContext: permCtx,
        });
      }
      setCollectionModalTask(null);
      addToast({ type: 'success', message: 'Tarefa concluída e resultado registrado.' });
    } catch {
      addToast({ type: 'error', message: 'Erro ao registrar cobrança' });
    } finally {
      setCollectionSaving(false);
    }
  };

  const handleDelete = useCallback((id) => {
    setDeleteConfirmId(id);
  }, []);

  const runDeleteConfirmed = async () => {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    try {
      await deleteTask(id);
      if (detailTask?.id === id) setDetailTask(null);
      addToast({ type: 'success', message: 'Tarefa excluída' });
    } catch {
      addToast({ type: 'error', message: 'Erro ao excluir' });
    }
  };

  const toggleStudentTasksExpanded = useCallback((leadId) => {
    setExpandedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  const toggleStudentCompletedExpanded = useCallback((leadId) => {
    setExpandedCompletedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  const assigneeForTask = useCallback((t) => {
    if (!t?.assigned_to) return { label: null, initials: null };
    const member = members.find((m) => m.userId === t.assigned_to);
    const label = membershipPrimaryLabel(member || {}) || t.assigned_to;
    return { label, initials: String(label).slice(0, 2).toUpperCase() };
  }, [members]);

  const renderOneTaskCard = (t, opts = {}) => {
    const compact = Boolean(opts.compact);
    const { label, initials } = assigneeForTask(t);
    return (
      <TaskCard
        key={t.id}
        task={t}
        variant={compact ? 'compact' : 'full'}
        compactLayout={compact ? 'stack' : 'row'}
        showLead={!opts.hideLead}
        showAssignee={!compact || Boolean(opts.showMeta)}
        isUpdating={isUpdating(t.id)}
        assigneeLabel={label}
        assigneeInitials={initials}
        onComplete={() => void toggleDone(t)}
        onEdit={openEdit}
        onDelete={handleDelete}
        onOpen={() => setDetailTask(t)}
      />
    );
  };

  const renderKanbanTaskCard = useCallback((t) => {
    const { label, initials } = assigneeForTask(t);
    return (
      <SortableTaskCard
        key={t.id}
        task={t}
        isUpdating={isUpdating(t.id)}
        assigneeLabel={label}
        assigneeInitials={initials}
        onComplete={() => void toggleDone(t)}
        onEdit={openEdit}
        onDelete={handleDelete}
        onOpen={() => setDetailTask(t)}
      />
    );
  }, [assigneeForTask, isUpdating, toggleDone, openEdit, handleDelete]);

  const clearKanbanDragUi = useCallback(() => {
    setKanbanActiveId(null);
    setKanbanDragOver(null);
    setKanbanInsertOverId(null);
  }, []);

  const handleKanbanDragStart = useCallback((event) => {
    setKanbanActiveId(event.active.id);
    setKanbanDragOver(null);
    setKanbanInsertOverId(null);
  }, []);

  const handleKanbanDragOver = useCallback((event) => {
    const { over } = event;
    if (!over) {
      setKanbanDragOver((prev) => (prev === null ? prev : null));
      setKanbanInsertOverId((prev) => (prev === null ? prev : null));
      return;
    }

    const columnId = resolveTaskKanbanColumnId(over, kanbanColumns);
    setKanbanDragOver((prev) => (prev === columnId ? prev : columnId));

    const overId = String(over.id || '');
    const nextInsert = TASK_KANBAN_COLUMN_IDS.has(overId) ? KANBAN_INSERT_END : overId;
    setKanbanInsertOverId((prev) => (prev === nextInsert ? prev : nextInsert));
  }, [kanbanColumns]);

  const handleKanbanDragEnd = useCallback(({ active, over }) => {
    clearKanbanDragUi();
    if (!over) return;

    const task = tasks.find((t) => String(t.id) === String(active.id));
    if (!task || isUpdating(task.id)) return;

    const columnId = resolveTaskKanbanColumnId(over, kanbanColumns);
    if (!columnId) return;

    const target = TASK_KANBAN_COLUMN_MAP[columnId];
    if (!target) return;
    if (task.status === target.status && columnId !== TASK_KANBAN_COLUMN.CONCLUIDAS) return;

    if (columnId === TASK_KANBAN_COLUMN.CONCLUIDAS && task.status !== 'done' && isCollectionTask(task)) {
      setCollectionModalTask(task);
      return;
    }

    const previousStatus = task.status;
    patchTaskLocal(task.id, target);
    updateTask(task.id, target).catch(() => {
      patchTaskLocal(task.id, { status: previousStatus });
      addToast({ type: 'error', message: 'Erro ao atualizar status' });
    });
  }, [tasks, kanbanColumns, patchTaskLocal, updateTask, isUpdating, addToast, clearKanbanDragUi]);

  const renderTasksLoadingSkeleton = () => (
    <div
      className="tasks-skeleton-root"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando tarefas"
    >
      <span className="tasks-skeleton-sr">Carregando tarefas…</span>
      {[0, 1].map((section) => (
        <div key={section} className="tasks-skeleton-section">
          <div className="tasks-skeleton-group-title" aria-hidden />
          <div className="tasks-skeleton-list">
            {[0, 1, 2].map((row) => (
              <div key={`${section}-${row}`} className="tasks-skeleton-card" aria-hidden>
                <div className="tasks-skeleton-check" />
                <div className="tasks-skeleton-body">
                  <div className="tasks-skeleton-line tasks-skeleton-line--title" />
                  <div className={`tasks-skeleton-line tasks-skeleton-line--sub ${row % 2 === 1 ? 'tasks-skeleton-line--short' : ''}`} />
                  <div className="tasks-skeleton-badges">
                    <span className="tasks-skeleton-pill" />
                    <span className="tasks-skeleton-pill tasks-skeleton-pill--narrow" />
                  </div>
                </div>
                <div className="tasks-skeleton-actions">
                  <span className="tasks-skeleton-icon" />
                  <span className="tasks-skeleton-icon" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTaskList = (list, title, titleColor) => {
    if (list.length === 0) return null;
    return (
      <div className="task-group">
        <h3 className="task-group-title" style={{ color: titleColor }}>{title} ({list.length})</h3>
        <div className="task-list">
          {list.map((t) => renderOneTaskCard(t))}
        </div>
      </div>
    );
  };

  const renderStudentTasksGroupCard = (group, { unlinked = false } = {}) => {
    const showCompletedOnly = byStudentShowCompletedOnly;
    const primaryTasks = showCompletedOnly ? group.doneTasks : group.pendingTasks;
    const canCollapsePrimary = primaryTasks.length > STUDENT_TASKS_PREVIEW;
    const isPrimaryExpanded = expandedStudentIds.has(group.leadId);
    const visiblePrimary =
      canCollapsePrimary && !isPrimaryExpanded
        ? primaryTasks.slice(0, STUDENT_TASKS_PREVIEW)
        : primaryTasks;
    const hiddenPrimaryCount = Math.max(0, primaryTasks.length - STUDENT_TASKS_PREVIEW);
    const isCompletedExpanded = expandedCompletedStudentIds.has(group.leadId);
    const visibleDone = !showCompletedOnly && isCompletedExpanded ? group.doneTasks : [];
    const countsMarkup = (
      <span className="tasks-student-card__counts">
        {group.pendingCount > 0 ? (
          <span>
            {group.pendingCount} pendente{group.pendingCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {group.doneCount > 0 ? (
          <span>
            {group.pendingCount > 0 ? ' · ' : ''}
            {group.doneCount} concluída{group.doneCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {group.overdueCount > 0 ? (
          <span className="tasks-student-card__overdue">
            {group.pendingCount > 0 || group.doneCount > 0 ? ' · ' : ''}
            {group.overdueCount} atrasada{group.overdueCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </span>
    );

    return (
      <article
        key={group.leadId}
        className={`tasks-student-card${unlinked ? ' tasks-student-card--unlinked' : ''}${canCollapsePrimary && !isPrimaryExpanded ? ' tasks-student-card--collapsed' : ''}`}
        role="listitem"
      >
        <header className="tasks-student-card__head">
          {unlinked ? (
            <div className="tasks-student-card__profile-static">
              <span className="tasks-student-card__avatar tasks-student-card__avatar--unlinked" aria-hidden="true">
                <ClipboardList size={18} />
              </span>
              <span className="tasks-student-card__identity">
                <span className="tasks-student-card__name-row">
                  <span className="tasks-student-card__name">{group.leadName}</span>
                  <span className="tasks-student-card__kind">Geral</span>
                </span>
                {countsMarkup}
              </span>
            </div>
          ) : (
            <>
              {(() => {
                const linkedPerson = linkableById.get(group.leadId);
                const linkedKindLabel =
                  linkedPerson?.kind === 'lead'
                    ? contactLabel
                    : linkedPerson?.kind === 'student'
                      ? terms.student
                      : null;
                const profilePath =
                  profilePathForLinkablePerson(linkedPerson) || `/student/${group.leadId}`;
                return (
                  <button
                    type="button"
                    className="tasks-student-card__profile"
                    onClick={() => navigate(profilePath)}
                    aria-label={`Abrir perfil de ${group.leadName}`}
                  >
                    <span className="tasks-student-card__avatar" aria-hidden="true">
                      {initialsFromName(group.leadName)}
                    </span>
                    <span className="tasks-student-card__identity">
                      <span className="tasks-student-card__name-row">
                        <span className="tasks-student-card__name">{group.leadName}</span>
                        {linkedKindLabel ? (
                          <span className="tasks-student-card__kind">{linkedKindLabel}</span>
                        ) : null}
                      </span>
                      {countsMarkup}
                    </span>
                    <ChevronRight size={16} className="tasks-student-card__chevron" aria-hidden="true" />
                  </button>
                );
              })()}
            </>
          )}
          <div className="tasks-student-card__toolbar">
            {(() => {
              if (unlinked) return null;
              const progress = progressLabelForLead(group.leadId, filteredTasks);
              return progress ? (
                <span
                  className="tasks-student-card__progress"
                  title="Progresso do checklist de processo automático"
                >
                  {progress}
                </span>
              ) : null;
            })()}
            <button
              type="button"
              className="tasks-student-card__add"
              onClick={() =>
                unlinked ? openNew() : navigate(`/tarefas?lead_id=${group.leadId}&new=1`)
              }
            >
              <PlusCircle size={14} aria-hidden="true" /> Nova
            </button>
          </div>
        </header>
        <div className="tasks-student-card__body">
          <div className="task-list tasks-student-card__tasks">
            {visiblePrimary.map((t) =>
              renderOneTaskCard(t, { compact: true, hideLead: true, showMeta: true })
            )}
          </div>
          {canCollapsePrimary ? (
            <button
              type="button"
              className="tasks-student-card__toggle"
              onClick={() => toggleStudentTasksExpanded(group.leadId)}
              aria-expanded={isPrimaryExpanded}
            >
              {isPrimaryExpanded ? (
                <>
                  <ChevronUp size={16} aria-hidden="true" />
                  Recolher tarefas
                </>
              ) : (
                <>
                  <ChevronDown size={16} aria-hidden="true" />
                  Ver mais {hiddenPrimaryCount} tarefa{hiddenPrimaryCount === 1 ? '' : 's'}
                </>
              )}
            </button>
          ) : null}
          {!showCompletedOnly && group.doneCount > 0 ? (
            <>
              {isCompletedExpanded && visibleDone.length > 0 ? (
                <div className="tasks-student-card__done-block">
                  <p className="tasks-student-card__done-label">Concluídas</p>
                  <div className="task-list tasks-student-card__tasks tasks-student-card__tasks--done">
                    {visibleDone.map((t) =>
                      renderOneTaskCard(t, { compact: true, hideLead: true, showMeta: true })
                    )}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className="tasks-student-card__toggle tasks-student-card__toggle--done"
                onClick={() => toggleStudentCompletedExpanded(group.leadId)}
                aria-expanded={isCompletedExpanded}
              >
                {isCompletedExpanded ? (
                  <>
                    <ChevronUp size={16} aria-hidden="true" />
                    Ocultar concluídas
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} aria-hidden="true" />
                    Ver {group.doneCount} concluída{group.doneCount === 1 ? '' : 's'}
                  </>
                )}
              </button>
            </>
          ) : null}
        </div>
      </article>
    );
  };

  function formatCreatedByLabel(task) {
    const raw = String(task?.created_by || '').trim();
    if (!raw) return '—';
    const creator = members.find(
      (m) => String(m.userId) === raw || String(m.id) === raw
    );
    return creator ? membershipPrimaryLabel(creator) : raw;
  }

  function formatCompletedByLabel(task) {
    const stored = String(task?.completed_by_name || '').trim();
    if (stored) return stored;
    const raw = String(task?.completed_by || '').trim();
    if (!raw) return '—';
    const member = members.find((m) => String(m.userId) === raw || String(m.id) === raw);
    return member ? membershipPrimaryLabel(member) : raw;
  }

  return (
    <div className="container navi-hub-page tasks-page--padded">
      <header className="animate-in">
        <PageHeader
          className="navi-page-header--flush"
          title={isProcessosHub ? TASKS_COPY.processos.title : TASKS_COPY.operacao.title}
          subtitle={isProcessosHub ? TASKS_COPY.processos.subtitle : TASKS_COPY.operacao.subtitle}
          actions={
            isProcessosHub ? null : (
              <>
                <button
                  type="button"
                  className="edit-link text-small"
                  onClick={() => handleHubTabChange(TASKS_TAB_PROCESSOS)}
                >
                  Configurar processos automáticos
                </button>
                <button type="button" className="btn-primary" onClick={openNew}>
                  <PlusCircle size={16} /> Nova tarefa
                </button>
              </>
            )
          }
        />

        <HubTabBar
          tabs={TASKS_HUB_TABS}
          activeId={hubTab}
          onChange={handleHubTabChange}
          ariaLabel="Tarefas"
          fullWidth
          className="mb-3"
        />

        {isProcessosHub ? (
          <div className="mt-3 animate-in">
            <TaskProcessosTab />
          </div>
        ) : (
          <>
        <HubTabBar
          tabs={[
            { id: 'by_student', label: 'Por aluno' },
            { id: 'list', label: 'Lista' },
            { id: 'kanban', label: 'Kanban' },
            { id: 'calendar', label: 'Calendário' },
          ]}
          activeId={viewMode}
          onChange={setViewMode}
          ariaLabel="Visualização de tarefas"
          variant="secondary"
          size="sm"
          fullWidth
          className="tasks-view-toggle mb-3"
        />
        
        <div className="filter-bar task-filters">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'pendentes', label: 'Pendentes' },
            { id: 'minhas', label: 'Minhas' },
            { id: 'vencidas', label: 'Vencidas' },
            { id: 'concluidas', label: 'Concluídas' },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`filter-chip ${filters.status === id ? 'is-active' : ''}`}
              onClick={() => setFilter('status', id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip ${estaSemanaOn ? 'is-active' : ''}`}
            onClick={() => setEstaSemanaOn((v) => !v)}
          >
            Esta semana
          </button>
          {filters.lead_id && (
            <button 
              type="button" 
              className="filter-chip is-active"
              onClick={() => {
                setFilter('lead_id', null);
                searchParams.delete('lead_id');
                searchParams.delete('new');
                navigate('/tarefas');
              }}
            >
              Aluno: {linkableById.get(filters.lead_id)?.name || 'Desconhecido'} ✕
            </button>
          )}
        </div>
        {estaSemanaOn && semPrazoExcluidasCount > 0 ? (
          <p className="task-week-hint text-muted text-sm mt-2 mb-0">
            {semPrazoExcluidasCount} {semPrazoExcluidasCount === 1 ? 'tarefa sem prazo definido não aparece' : 'tarefas sem prazo definido não aparecem'} neste filtro.
          </p>
        ) : null}
          </>
        )}
      </header>

      {!isProcessosHub && error ? (
        <ErrorBanner
          className="mt-3"
          message={typeof error === 'string' ? error : friendlyError(error, 'load')}
          onRetry={() => fetchTasks(academyId, { reset: true, filters: apiTaskFilters })}
        />
      ) : null}

      {!isProcessosHub && tasks.length >= 500 ? (
        <div className="tasks-limit-notice" role="status">
          <AlertTriangle className="tasks-limit-notice__icon" size={18} strokeWidth={2} aria-hidden />
          <span>
            Exibindo 500 tarefas — o limite máximo. Use os filtros para encontrar o que precisa.
          </span>
        </div>
      ) : null}

      {!isProcessosHub ? (
      <div className={`tasks-board mt-4${loading && tasks.length === 0 ? ' tasks-board--loading' : ''}`}>
        {loading && tasks.length === 0 ? (
          renderTasksLoadingSkeleton()
        ) : tasks.length === 0 && !error && !hasActiveFilters ? (
          <EmptyState
            variant="default"
            tone="dashed"
            icon={CheckSquare}
            title="Nenhuma tarefa por aqui ainda"
            primaryAction={{ label: '+ Nova tarefa', onClick: openNew }}
            secondaryAction={{
              label: 'Configurar processos automáticos',
              variant: 'link',
              onClick: () => handleHubTabChange(TASKS_TAB_PROCESSOS),
            }}
            role="status"
          />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            variant="default"
            tone="dashed"
            icon={CheckSquare}
            title={emptyFilterTitle}
            secondaryAction={
              hasActiveFilters
                ? {
                    label: 'Limpar filtros',
                    variant: 'link',
                    onClick: () => {
                      setFilter('status', 'all');
                      setFilter('lead_id', null);
                      setEstaSemanaOn(false);
                      setPeriodTodayOn(false);
                      navigate('/tarefas');
                    },
                  }
                : undefined
            }
            role="status"
            className="mt-2"
          />
        ) : viewMode === 'by_student' ? (
          <div className="tasks-by-student">
            {tasksByLead.length === 0 && !unlinkedTasksGroup ? (
              <EmptyState
                variant="compact"
                tone="dashed"
                title={byStudentEmptyHint || 'Nenhuma tarefa neste filtro.'}
                secondaryAction={
                  byStudentEmptyHint
                    ? {
                        label: 'Ver concluídas',
                        variant: 'link',
                        onClick: () => setFilter('status', 'concluidas'),
                      }
                    : undefined
                }
              />
            ) : (
              <>
                {tasksByLead.length > 0 ? (
                  <div className="tasks-by-student-grid" role="list">
                    {tasksByLead.map((group) => renderStudentTasksGroupCard(group))}
                  </div>
                ) : null}
                {unlinkedTasksGroup ? (
                  <section
                    className="tasks-by-student-section tasks-by-student-section--unlinked"
                    aria-labelledby="tasks-unlinked-heading"
                  >
                    <h3 id="tasks-unlinked-heading" className="tasks-by-student-section__title">
                      Sem aluno vinculado
                    </h3>
                    <p className="tasks-by-student-section__hint">
                      Tarefas gerais que não estão ligadas a nenhum aluno.
                    </p>
                    {renderStudentTasksGroupCard(unlinkedTasksGroup, { unlinked: true })}
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="tasks-lists-wrap">
            {renderTaskList(groupedTasks.vencidas, 'Vencidas', 'var(--danger)')}
            {renderTaskList(groupedTasks.pendentes, 'Pendentes', 'var(--text)')}
            {renderTaskList(groupedTasks.concluidas, 'Concluídas', 'var(--success)')}
          </div>
        ) : viewMode === 'kanban' ? (
          <DndContext
            sensors={kanbanSensors}
            collisionDetection={closestCorners}
            onDragStart={handleKanbanDragStart}
            onDragOver={handleKanbanDragOver}
            onDragEnd={handleKanbanDragEnd}
            onDragCancel={clearKanbanDragUi}
          >
            <div className="tasks-kanban">
              {kanbanColumns.atrasadas.length > 0 ? (
                <TasksKanbanColumn
                  columnId={TASK_KANBAN_COLUMN.ATRASADAS}
                  className="tasks-kanban-col tasks-kanban-col--late"
                  isDropTarget={kanbanDragOver === TASK_KANBAN_COLUMN.ATRASADAS}
                  isDragActive={kanbanDragging}
                  head={(
                    <div className="tasks-kanban-col-head">
                      <span className="tasks-kanban-col-title">Atrasadas</span>
                      <span className="tasks-kanban-badge">{kanbanColumns.atrasadas.length}</span>
                    </div>
                  )}
                >
                  <SortableContext
                    items={kanbanColumns.atrasadas.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <TasksKanbanColumnBody
                      tasks={kanbanColumns.atrasadas}
                      renderCard={renderKanbanTaskCard}
                      hasMore={tasksHasMore}
                      loadingMore={loadingMore}
                      onLoadMore={handleLoadMoreTasks}
                      disableVirtualization={kanbanDragging}
                      showInsertSlots={kanbanDragging && kanbanDragOver === TASK_KANBAN_COLUMN.ATRASADAS}
                      insertOverId={kanbanDragOver === TASK_KANBAN_COLUMN.ATRASADAS ? kanbanInsertOverId : null}
                    />
                  </SortableContext>
                </TasksKanbanColumn>
              ) : null}
              <TasksKanbanColumn
                columnId={TASK_KANBAN_COLUMN.A_FAZER}
                className="tasks-kanban-col tasks-kanban-col--todo"
                isDropTarget={kanbanDragOver === TASK_KANBAN_COLUMN.A_FAZER}
                isDragActive={kanbanDragging}
                head={(
                  <>
                    <div className="tasks-kanban-col-head">
                      <span className="tasks-kanban-col-title">A fazer</span>
                      <span className="tasks-kanban-badge">{kanbanColumns.aFazer.length}</span>
                    </div>
                    <div className="tasks-quick-create" data-no-dnd="true" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="form-input tasks-quick-create-input"
                        placeholder="+ Digite o título da tarefa..."
                        value={quickTitle}
                        onChange={(e) => {
                          setQuickTitle(e.target.value);
                          if (quickError) setQuickError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleQuickCreate();
                          }
                        }}
                        disabled={quickSaving}
                        aria-invalid={quickError ? true : undefined}
                      />
                      <button
                        type="button"
                        className="btn-primary tasks-quick-create-btn"
                        disabled={quickSaving}
                        onClick={() => void handleQuickCreate()}
                      >
                        {quickSaving ? '…' : 'Criar'}
                      </button>
                      <button
                        type="button"
                        className="btn-outline tasks-quick-create-settings"
                        title="Configurações avançadas"
                        aria-label="Abrir formulário completo"
                        onClick={openNew}
                      >
                        ⚙
                      </button>
                    </div>
                    {quickError ? <p className="tasks-quick-create-error">{quickError}</p> : null}
                  </>
                )}
              >
                <SortableContext
                  items={kanbanColumns.aFazer.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <TasksKanbanColumnBody
                    tasks={kanbanColumns.aFazer}
                    renderCard={renderKanbanTaskCard}
                    hasMore={tasksHasMore}
                    loadingMore={loadingMore}
                    onLoadMore={handleLoadMoreTasks}
                    disableVirtualization={kanbanDragging}
                    showInsertSlots={kanbanDragging && kanbanDragOver === TASK_KANBAN_COLUMN.A_FAZER}
                    insertOverId={kanbanDragOver === TASK_KANBAN_COLUMN.A_FAZER ? kanbanInsertOverId : null}
                  />
                </SortableContext>
              </TasksKanbanColumn>
              <TasksKanbanColumn
                columnId={TASK_KANBAN_COLUMN.CONCLUIDAS}
                className="tasks-kanban-col tasks-kanban-col--done"
                isDropTarget={kanbanDragOver === TASK_KANBAN_COLUMN.CONCLUIDAS}
                isDragActive={kanbanDragging}
                head={(
                  <div className="tasks-kanban-col-head">
                    <span className="tasks-kanban-col-title">Concluídas</span>
                    <span className="tasks-kanban-badge">{kanbanColumns.concluidas.length}</span>
                  </div>
                )}
              >
                <SortableContext
                  items={kanbanColumns.concluidas.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <TasksKanbanColumnBody
                    tasks={kanbanColumns.concluidas}
                    renderCard={renderKanbanTaskCard}
                    hasMore={tasksHasMore}
                    loadingMore={loadingMore}
                    onLoadMore={handleLoadMoreTasks}
                    disableVirtualization={kanbanDragging}
                    showInsertSlots={kanbanDragging && kanbanDragOver === TASK_KANBAN_COLUMN.CONCLUIDAS}
                    insertOverId={kanbanDragOver === TASK_KANBAN_COLUMN.CONCLUIDAS ? kanbanInsertOverId : null}
                  />
                </SortableContext>
              </TasksKanbanColumn>
            </div>
            <DragOverlay dropAnimation={TASK_KANBAN_DROP_ANIMATION}>
              {activeKanbanTask ? (
                <TaskCard
                  task={activeKanbanTask}
                  isOverlay
                  isUpdating={isUpdating(activeKanbanTask.id)}
                  assigneeLabel={assigneeForTask(activeKanbanTask).label}
                  assigneeInitials={assigneeForTask(activeKanbanTask).initials}
                  style={{ opacity: 0.75, transform: 'scale(1.02)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="tasks-cal-layout">
            <div className="tasks-cal-main">
              <div className="tasks-cal-toolbar flex flex-wrap justify-between items-center gap-2 mb-3">
                <button type="button" className="btn-secondary" onClick={() => shiftCalMonth(-1)}>
                  Mês anterior
                </button>
                <span className="tasks-cal-month-label">{calMonthLabel}</span>
                <button type="button" className="btn-secondary" onClick={() => shiftCalMonth(1)}>
                  Próximo mês
                </button>
              </div>
              <div className="tasks-cal-weekdays">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
                  <div key={w} className="tasks-cal-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="tasks-cal-grid">
                {calMatrix.map((cell, idx) => {
                  if (cell === null) {
                    return <div key={`e-${idx}`} className="tasks-cal-cell tasks-cal-cell--empty" />;
                  }
                  const ymd = `${calMonth.y}-${pad2(calMonth.m + 1)}-${pad2(cell)}`;
                  const now = new Date();
                  const isToday =
                    cell === now.getDate() &&
                    calMonth.m === now.getMonth() &&
                    calMonth.y === now.getFullYear();
                  const dayTasks = tasksByDueYmd[ymd] || [];
                  return (
                    <div
                      key={ymd}
                      className={`tasks-cal-cell ${isToday ? 'tasks-cal-cell--today' : ''}`}
                    >
                      <div className="tasks-cal-day-num">{cell}</div>
                      <div className="tasks-cal-day-tasks">
                        {dayTasks.map((t) => renderOneTaskCard(t, { compact: true }))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <section className="tasks-cal-semprazo" aria-label="Tarefas sem prazo">
              <h4 className="tasks-cal-semprazo-title">Sem prazo</h4>
              {semPrazoTasksForCalendar.length === 0 ? (
                <EmptyState variant="bare" title="Nenhuma tarefa sem prazo neste filtro." role="none" />
              ) : (
                <div className="tasks-cal-semprazo-grid">
                  {semPrazoTasksForCalendar.map((t) => renderOneTaskCard(t, { compact: true }))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      ) : null}

      {showModal &&
        createPortal(
        <div
          role="presentation"
          className="task-modal-overlay"
          onMouseUp={handleTaskModalOverlayPointerUp}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
            className="task-modal-panel"
            onMouseUp={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="task-modal-header">
              <div className="task-modal-title-row">
                <div className="task-modal-icon-wrap">
                  <ClipboardList size={16} />
                </div>
                <span id="task-modal-title" className="task-modal-title">
                  {editingTask ? 'Editar tarefa' : 'Nova tarefa'}
                </span>
              </div>
              <button
                type="button"
                onClick={requestCloseModal}
                aria-label="Fechar"
                className="task-modal-close"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="task-modal-form">
              {/* Título */}
              <div className="task-field">
                <label className="task-field-label">Título <span className="task-field-required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={form.title}
                  onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="Ex: Ligar para confirmar aula experimental"
                  autoFocus
                  required
                />
              </div>

              {/* Descrição */}
              <div className="task-field">
                <label className="task-field-label">Descrição</label>
                <textarea
                  className="form-input task-textarea"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Detalhes opcionais..."
                />
              </div>

              {/* Prazo + Responsável — grid 2 colunas */}
              <div className="task-field-row">
                <div className="task-field">
                  <label className="task-field-label">Prazo</label>
                  <DateInputField
                    type="date"
                    className="form-input"
                    value={form.due_date}
                    onChange={e => setForm({...form, due_date: e.target.value})}
                  />
                </div>
                <div className="task-field">
                  <label className="task-field-label">Responsável</label>
                  <select
                    className="form-input task-select"
                    value={form.assigned_to}
                    disabled={membersLoading}
                    onChange={e => setForm({...form, assigned_to: e.target.value})}
                  >
                    <option value="">
                      {membersLoading ? 'Carregando equipe…' : 'Sem responsável'}
                    </option>
                    {members.map((m) => (
                      <option key={m.userId || m.$id} value={m.userId}>
                        {membershipPrimaryLabel(m)}
                      </option>
                    ))}
                  </select>
                  {!effectiveTeamId && !membersLoading ? (
                    <p className="task-field-hint">Equipe não vinculada a esta academia.</p>
                  ) : null}
                  {membersError ? (
                    <p className="task-field-hint task-field-hint--error">Não foi possível carregar a equipe.</p>
                  ) : null}
                  {!membersError && effectiveTeamId && !membersLoading && members.length === 0 ? (
                    <p className="task-field-hint">
                      Nenhum membro.{' '}
                      <Link to="/equipe" className="edit-link">
                        Cadastre na Equipe
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Vincular aluno / lead */}
              <div className="task-field task-field--dropdown" ref={leadDropRef}>
                <label className="task-field-label">{`Vincular ${terms.student.toLowerCase()} / ${contactLabel.toLowerCase()}`}</label>
                <div className="task-field-dropdown-wrap">
                  <input
                    type="text"
                    className="form-input"
                    value={leadSearch}
                    onChange={e => {
                      setLeadSearch(e.target.value);
                      setForm(f => ({ ...f, lead_id: '' }));
                      setShowLeadDrop(true);
                    }}
                    onFocus={() => setShowLeadDrop(true)}
                    placeholder="Buscar por nome..."
                    autoComplete="off"
                    style={form.lead_id ? { paddingRight: 32 } : {}}
                  />
                  {form.lead_id && (
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, lead_id: '' })); setLeadSearch(''); }}
                      className="task-lead-clear"
                      aria-label="Limpar"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                {showLeadDrop && (
                  <div className="task-lead-drop">
                    {filteredLinkablePeople.slice(0, 80).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="task-lead-option"
                          onMouseDown={() => {
                            setForm(f => ({ ...f, lead_id: p.id }));
                            setLeadSearch(p.name);
                            setShowLeadDrop(false);
                          }}
                        >
                          <span className="task-lead-name">{p.name}</span>
                          <span className="task-lead-phone">
                            {p.phone || ''}
                            {p.kind === 'student' ? ` · ${terms.student}` : ` · ${contactLabel}`}
                          </span>
                        </button>
                      ))}
                    {filteredLinkablePeople.length > 80 ? (
                      <p className="task-lead-more-hint text-muted text-sm px-3 py-2 mb-0">
                        Mostrando 80 de {filteredLinkablePeople.length}. Refine a busca por nome ou telefone.
                      </p>
                    ) : null}
                    {filteredLinkablePeople.length === 0 ? (
                      <EmptyState variant="bare" title="Nenhum resultado" role="none" className="task-lead-empty-state" />
                    ) : null}
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="task-modal-footer">
                <button type="button" className="btn-outline" onClick={requestCloseModal} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : editingTask ? 'Salvar alterações' : 'Criar tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
        )}

      {detailTask ? (
        <>
          <div
            role="presentation"
            className="task-drawer-backdrop"
            onMouseDown={() => setDetailTask(null)}
          />
          <aside className="task-drawer-panel" aria-labelledby="task-drawer-heading">
            <div className="task-drawer-header">
              <h2 id="task-drawer-heading" className="task-drawer-heading">
                Detalhes da tarefa
              </h2>
              <button
                type="button"
                className="task-drawer-close"
                aria-label="Fechar"
                onClick={() => setDetailTask(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="task-drawer-body">
              <div className="task-drawer-field">
                <span className="task-drawer-label">Título</span>
                <p className="task-drawer-value">{detailTask.title || '—'}</p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Descrição</span>
                <p className="task-drawer-value task-drawer-value--multiline">
                  {String(detailTask.description || '').trim() ? detailTask.description : 'Sem descrição'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Status</span>
                <div>
                  <span className={`task-drawer-badge ${detailStatusMeta(detailTask).cls}`}>
                    {detailStatusMeta(detailTask).label}
                  </span>
                </div>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Prazo</span>
                <p className="task-drawer-value">
                  {detailTask.due_date && String(detailTask.due_date).trim()
                    ? new Date(String(detailTask.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR')
                    : 'Sem prazo'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Responsável</span>
                <p className="task-drawer-value">
                  {detailTask.assigned_to
                    ? membershipPrimaryLabel(
                        members.find((m) => m.userId === detailTask.assigned_to) || {}
                      ) || detailTask.assigned_to
                    : '—'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">{`${contactLabel} vinculado`}</span>
                {detailTask.lead_id ? (
                  <button
                    type="button"
                    className="task-drawer-link"
                    onClick={() => {
                      setDetailTask(null);
                      const path =
                        profilePathForLinkablePerson(linkableById.get(detailTask.lead_id)) ||
                        `/student/${detailTask.lead_id}`;
                      navigate(path);
                    }}
                  >
                    {detailTask.lead_name || linkableById.get(detailTask.lead_id)?.name || detailTask.lead_id}
                  </button>
                ) : (
                  <p className="task-drawer-value">—</p>
                )}
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Criado por</span>
                <p className="task-drawer-value">
                  {formatCreatedByLabel(detailTask)}
                  {detailTask.created_at
                    ? ` · ${new Date(detailTask.created_at).toLocaleString('pt-BR')}`
                    : ''}
                </p>
              </div>
              {String(detailTask.status || '').toLowerCase() === 'done' ? (
                <div className="task-drawer-field">
                  <span className="task-drawer-label">Concluída por</span>
                  <p className="task-drawer-value">{formatCompletedByLabel(detailTask)}</p>
                </div>
              ) : null}
              <div className="task-drawer-field">
                <span className="task-drawer-label">Atualizado em</span>
                <p className="task-drawer-value">
                  {detailTask.updated_at
                    ? new Date(detailTask.updated_at).toLocaleString('pt-BR')
                    : '—'}
                </p>
              </div>
            </div>
            <div className="task-drawer-footer">
              <button type="button" className="btn-primary task-drawer-edit" onClick={openEditFromDetail}>
                Editar
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <CollectionResultModal
        open={Boolean(collectionModalTask)}
        stageLabel={parseCollectionTaskDescription(collectionModalTask?.description)?.stage || ''}
        saving={collectionSaving}
        onCancel={() => !collectionSaving && setCollectionModalTask(null)}
        onConfirm={handleCollectionConfirm}
      />

      <ConfirmDialog
        open={Boolean(deleteConfirmId)}
        title="Excluir tarefa?"
        description="Tem certeza que deseja excluir esta tarefa?"
        confirmLabel="Excluir"
        onConfirm={() => void runDeleteConfirmed()}
        onClose={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
