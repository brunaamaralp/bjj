/** @typedef {'today' | 'week' | 'month' | 'all'} PipelinePeriodChip */

/**
 * @typedef {object} PipelineActiveFilters
 * @property {string} [profileFilter]
 * @property {string} [originFilter]
 * @property {string} [filterDateFrom]
 * @property {string} [filterDateTo]
 * @property {string} [enrollmentMonthFilter]
 * @property {string} [searchStageScope]
 * @property {boolean} [followupKanban]
 */

/**
 * @typedef {object} PipelineSessionState
 * @property {number} scrollX
 * @property {Record<string, number>} columnScrolls
 * @property {string} searchTerm
 * @property {PipelineActiveFilters} activeFilters
 * @property {PipelinePeriodChip | null} activePeriodChip
 */

export const PIPELINE_STATE_STORAGE_KEY = 'pipeline_state';

export const LEAD_PROFILE_FROM_PIPELINE = 'pipeline';
export const LEAD_PROFILE_FROM_DASHBOARD = 'dashboard';

export function readPipelineSessionState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PIPELINE_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return /** @type {PipelineSessionState} */ (parsed);
  } catch {
    return null;
  }
}

/** @param {PipelineSessionState} state */
export function writePipelineSessionState(state) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PIPELINE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearPipelineSessionState() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PIPELINE_STATE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** @param {HTMLElement | null | undefined} kanbanWrapperEl */
export function collectColumnScrolls(kanbanWrapperEl) {
  /** @type {Record<string, number>} */
  const columnScrolls = {};
  if (!kanbanWrapperEl) return columnScrolls;
  kanbanWrapperEl.querySelectorAll('[data-pipeline-stage-id]').forEach((el) => {
    const id = el.getAttribute('data-pipeline-stage-id');
    if (id) columnScrolls[id] = el.scrollTop;
  });
  return columnScrolls;
}

/**
 * @param {{
 *   quickFilter: string | null;
 *   filterDateFrom: string;
 *   filterDateTo: string;
 *   enrollmentMonthFilter: string;
 * }} p
 * @returns {PipelinePeriodChip | null}
 */
export function deriveActivePeriodChip({ quickFilter, filterDateFrom, filterDateTo, enrollmentMonthFilter }) {
  if (quickFilter === 'today') return 'today';
  if (quickFilter === 'week') return 'week';
  if (quickFilter === 'month') return 'month';
  if (!quickFilter && !filterDateFrom && !filterDateTo && !enrollmentMonthFilter) return 'all';
  return null;
}

/** @param {PipelineSessionState | null | undefined} saved */
export function pipelineSessionInitialFilters(saved) {
  const f = saved?.activeFilters || {};
  return {
    profileFilter: f.profileFilter ?? 'all',
    originFilter: f.originFilter ?? 'all',
    filterDateFrom: f.filterDateFrom ?? '',
    filterDateTo: f.filterDateTo ?? '',
    enrollmentMonthFilter: f.enrollmentMonthFilter ?? '',
    searchStageScope: f.searchStageScope ?? 'all',
  };
}

/** @param {PipelineSessionState | null | undefined} saved */
export function pipelineSessionInitialQuickFilter(saved) {
  const chip = saved?.activePeriodChip;
  if (chip === 'today' || chip === 'week' || chip === 'month') return chip;
  return null;
}
