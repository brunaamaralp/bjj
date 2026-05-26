/** Estilos compartilhados do hub Caixa. */
export const FINANCE_PAGE_CSS = `
          .finance-page-root { width: 100%; box-sizing: border-box; }
          .finance-page-inner { max-width: 1100px; margin: 0 auto; padding: 24px; box-sizing: border-box; padding-bottom: 40px; }
          /* Abas: estilos globais em index.css (.navi-hub-tabs / .finance-tabs) */
          .finance-regime-active { background: var(--v100, #f3f0ff) !important; border-color: var(--v500, #5B3FBF) !important; color: var(--v500, #5B3FBF) !important; }
          .finance-tx-toolbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
          .finance-tx-totals {
            display: grid;
            gap: 6px;
            margin-bottom: 14px;
            padding: 12px 14px;
            border-radius: var(--radius-sm);
            background: var(--surface-hover);
            border: 0.5px solid var(--border-light);
          }
          .finance-tx-totals__row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 12px;
            font-size: 13px;
            color: var(--text-secondary);
          }
          .finance-tx-totals__row strong {
            color: var(--text);
            font-variant-numeric: tabular-nums;
          }
          .navi-mobile-list { display: none; flex-direction: column; }
          .navi-mobile-card {
            border-bottom: 0.5px solid var(--border-light);
            background: var(--surface);
          }
          .navi-mobile-card:last-child { border-bottom: none; }
          .navi-mobile-card__actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: flex-end;
          }
          .finance-mobile-list { border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); overflow: hidden; }
          .finance-mobile-card { padding: 12px 14px; }
          .finance-mobile-card__head {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 10px;
            margin-bottom: 6px;
          }
          .finance-mobile-card__date { font-size: 13px; color: var(--text-secondary); }
          .finance-mobile-card__amount { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
          .finance-mobile-card__name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
          .finance-mobile-card__meta { margin-bottom: 8px; }
          .finance-mobile-card__actions { margin-top: 10px; padding-top: 10px; border-top: 0.5px solid var(--border-light); }
          .finance-tx-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.02em;
            text-transform: uppercase;
          }
          .finance-tx-badge--plan {
            background: color-mix(in srgb, var(--v500) 14%, transparent);
            color: var(--v700);
          }
          .finance-tx-badge--product {
            background: var(--surface-hover);
            color: var(--text-secondary);
          }
          .finance-forecast-summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
          }
          .finance-forecast-summary__card {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 14px 16px;
          }
          .finance-forecast-summary__value {
            font-size: 1.15rem;
            font-weight: 600;
            margin: 2px 0 0;
            font-variant-numeric: tabular-nums;
          }
          .finance-forecast-chart-card { padding: 16px 18px; }
          .finance-forecast-weeks { display: flex; flex-direction: column; gap: 12px; }
          .finance-forecast-week { padding: 14px 16px; }
          .finance-forecast-week__head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            flex-wrap: wrap;
            padding-bottom: 10px;
            border-bottom: 0.5px solid var(--border-light);
          }
          .finance-forecast-week__list {
            list-style: none;
            margin: 12px 0 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .finance-forecast-week__item {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .finance-forecast-week__icon {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            background: var(--surface-hover);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--v500);
          }
          .finance-forecast-week__body {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .finance-forecast-week__label,
          .finance-forecast-week__link {
            font-weight: 500;
            font-size: 13px;
            color: var(--text);
          }
          .finance-forecast-week__link:hover { color: var(--v500); text-decoration: underline; }
          .finance-forecast-week__amount {
            font-weight: 600;
            font-size: 13px;
            font-variant-numeric: tabular-nums;
            flex-shrink: 0;
          }
          .bank-recon-summary__grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
          }
          .bank-recon-columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            align-items: start;
          }
          @media (max-width: 900px) {
            .bank-recon-columns { grid-template-columns: 1fr; }
          }
          .bank-recon-col {
            border: 0.5px solid var(--border-light);
            border-radius: var(--radius-sm);
            padding: 12px;
            background: var(--surface);
            min-height: 200px;
          }
          .bank-recon-pair {
            display: grid;
            grid-template-columns: 1fr 1fr auto;
            gap: 10px;
            align-items: start;
            padding: 10px;
            margin-bottom: 8px;
            border-radius: var(--radius-sm);
            border: 0.5px solid var(--border-light);
          }
          .bank-recon-pair--auto { background: #EAF3DE; border-color: #3B6D1133; }
          .bank-recon-pair--suggested { background: #FEF3C7; border-color: #B4530933; }
          .bank-recon-pair--unmatched { background: var(--surface-hover); grid-template-columns: 1fr auto; }
          .bank-recon-pair__title { font-weight: 600; font-size: 13px; margin: 0 0 4px; }
          .bank-recon-pair__actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
          .bank-recon-confidence { color: #B45309; font-weight: 600; }
          .bank-recon-navi-row {
            padding: 10px;
            margin-bottom: 8px;
            border-radius: var(--radius-sm);
            border: 0.5px dashed var(--border-light);
          }
          @media (max-width: 767px) {
            .finance-desktop-table-wrap { display: none !important; }
            .finance-mobile-list { display: flex; }
          }
          .finance-table-wrap { width: 100%; max-height: calc(100vh - 320px); overflow: auto; -webkit-overflow-scrolling: touch; border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); background: var(--surface); }
          .finance-table-wrap--modal { max-height: 60vh; overflow: auto; -webkit-overflow-scrolling: touch; }
          .finance-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .finance-table thead th { position: sticky; top: 0; z-index: 1; text-align: left; padding: 10px 12px; background: var(--surface-hover); border-bottom: 1px solid var(--border-light); font-weight: 600; color: var(--mid); white-space: nowrap; }
          .finance-table thead th.finance-num { text-align: right; }
          .finance-table td { padding: 10px 12px; border-bottom: 0.5px solid var(--border-light); vertical-align: middle; }
          .finance-table tbody tr:hover { background: var(--surface-hover); }
          .finance-table .finance-num { text-align: right; font-variant-numeric: tabular-nums; }
          .accounts-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
          .accounts-header-title { margin: 0; }
          .accounts-header-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; flex: 1; justify-content: flex-end; min-width: 0; }
          .accounts-search { min-width: 180px; max-width: 280px; flex: 1; }
          .accounts-new-btn { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
          .accounts-storage-warning { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--warning-light, #fff8e6); border: 0.5px solid var(--warning, #b45309); font-size: 13px; color: var(--ink); }
          .accounts-table-wrap { margin-top: 12px; }
          .accounts-table { table-layout: fixed; width: 100%; }
          .accounts-table tr { height: 48px; border-bottom: 1px solid var(--border-light); }
          .accounts-table tr:hover { background: var(--surface-hover); }
          .accounts-table td { padding: 0 12px; vertical-align: middle; }
          .accounts-th-conta { width: auto; }
          .accounts-th-tipo { width: 120px; }
          .accounts-th-acoes { width: 48px; padding: 0 !important; }
          .accounts-conta-inner { display: flex; align-items: center; gap: 8px; min-width: 0; }
          .accounts-code { font-size: 11px; color: var(--text-secondary); font-family: ui-monospace, monospace; flex-shrink: 0; }
          .accounts-name { font-size: 14px; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .accounts-lock { opacity: 0.5; flex-shrink: 0; display: inline-flex; color: var(--text-secondary); }
          .accounts-usage-badge { font-size: 11px; background: var(--surface-hover); color: var(--text-secondary); border-radius: 10px; padding: 1px 6px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
          .accounts-type-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; white-space: nowrap; display: inline-block; }
          .accounts-type-badge--receita { background: var(--success-light, #dcfce7); color: var(--success, #166534); }
          .accounts-type-badge--despesa { background: var(--danger-light, #fee2e2); color: var(--danger, #991b1b); }
          .accounts-type-badge--ativo { background: rgba(59, 130, 246, 0.12); color: #1e40af; }
          .accounts-type-badge--passivo { background: var(--warning-light, #fef3c7); color: #92400e; }
          .accounts-type-badge--custo { background: rgba(107, 33, 168, 0.1); color: #6b21a8; }
          .accounts-type-badge--pl { background: var(--surface-hover); color: var(--text-secondary); }
          .accounts-menu-btn { opacity: 0; transition: opacity 0.15s; background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 6px; color: var(--text-secondary); min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
          .accounts-table-row:hover .accounts-menu-btn,
          .accounts-table-row:focus-within .accounts-menu-btn { opacity: 1; }
          .accounts-table-row--unused { opacity: 0.72; }
          .accounts-table-row--inactive { opacity: 0.55; }
          .accounts-empty { padding: 16px; text-align: center; margin: 0; }
          .accounts-popover-backdrop { position: fixed; inset: 0; z-index: 1095; background: transparent; }
          .accounts-popover.dropdown-panel {
            position: fixed; z-index: 1100; min-width: 200px;
            background: var(--surface); border: 0.5px solid var(--border-light);
            border-radius: var(--radius-sm); box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12));
            padding: 6px 0; display: flex; flex-direction: column;
          }
          .accounts-popover .dropdown-item {
            display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 14px;
            background: transparent; border: none; color: var(--text-secondary); font-size: 13px;
            font-weight: 500; text-align: left; cursor: pointer;
          }
          .accounts-popover .dropdown-item:hover:not(:disabled) { background: var(--surface-hover); color: var(--ink); }
          .accounts-popover .dropdown-item:disabled { opacity: 0.45; cursor: not-allowed; }
          .accounts-popover-btn--danger { color: var(--danger, #991b1b) !important; }
          .accounts-popover-btn--danger:hover:not(:disabled) { background: var(--danger-light, #fee2e2) !important; }
          .accounts-side-drawer-backdrop { position: fixed; inset: 0; z-index: 1100; background: rgba(18, 16, 42, 0.35); }
          .accounts-side-drawer-panel {
            position: fixed; top: 0; right: 0; z-index: 1110;
            width: min(440px, 100vw); height: 100vh; max-height: 100dvh;
            background: var(--surface); box-shadow: -8px 0 32px rgba(18, 16, 42, 0.12);
            display: flex; flex-direction: column;
          }
          .accounts-side-drawer-header {
            display: flex; align-items: flex-start; justify-content: space-between;
            padding: 20px 20px 12px; border-bottom: 1px solid var(--border-light); gap: 12px;
          }
          .accounts-side-drawer-heading { margin: 0; font-size: 18px; font-weight: 700; color: var(--ink); }
          .accounts-side-drawer-subtitle { margin: 4px 0 0; font-size: 12px; font-family: ui-monospace, monospace; color: var(--text-secondary); }
          .accounts-side-drawer-close { border: none; background: transparent; cursor: pointer; padding: 6px; border-radius: 8px; color: var(--text-muted); flex-shrink: 0; }
          .accounts-side-drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px 24px; }
          .accounts-side-drawer-footer {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 16px 20px; border-top: 1px solid var(--border-light);
          }
          .accounts-side-drawer-footer-actions { display: flex; gap: 10px; margin-left: auto; }
          .accounts-side-drawer-delete { color: var(--danger, #991b1b); border-color: var(--danger-light, #fecaca); }
          .accounts-drawer-section { margin-bottom: 20px; }
          .accounts-drawer-section-title { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 12px; }
          .accounts-drawer-collapse-trigger {
            display: flex; align-items: center; justify-content: space-between; width: 100%;
            padding: 10px 0; border: none; background: transparent; cursor: pointer;
            font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
            color: var(--text-muted); border-bottom: 1px solid var(--border-light); margin-bottom: 12px;
          }
          .accounts-drawer-collapse-body { display: flex; flex-direction: column; gap: 0; }
          .accounts-drawer-checkbox { display: flex; align-items: center; gap: 8px; font-size: 14px; margin-top: 8px; cursor: pointer; }
          .accounts-drawer-checkbox--inline { margin-top: 0; }
          .accounts-protected-hint { margin: 6px 0 0; font-size: 11px; line-height: 1.35; color: var(--text-secondary); max-width: 100%; display: inline-flex; align-items: flex-start; }
          .accounts-info-dl { margin: 0; display: flex; flex-direction: column; gap: 12px; }
          .accounts-info-dl > div { display: grid; grid-template-columns: 100px 1fr; gap: 8px; font-size: 14px; }
          .accounts-info-dl dt { margin: 0; color: var(--text-muted); font-weight: 500; }
          .accounts-info-dl dd { margin: 0; color: var(--ink); }
          .accounts-mobile-list { display: flex; flex-direction: column; gap: 0; border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); overflow: hidden; background: var(--surface); }
          .accounts-mobile-card {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 12px 14px; border-bottom: 0.5px solid var(--border-light);
          }
          .accounts-mobile-card:last-child { border-bottom: none; }
          .accounts-mobile-card__main { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; min-width: 0; flex: 1; }
          .accounts-mobile-card__right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
          .accounts-mobile-lock { opacity: 0.5; color: var(--text-secondary); }
          @media (max-width: 719px) {
            .accounts-header { flex-direction: column; align-items: stretch; }
            .accounts-header-actions { flex-direction: column; align-items: stretch; }
            .accounts-search { max-width: none; }
          }
          .finance-reports-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 20px; }
          .finance-reports-block { background: var(--surface); border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); padding: 20px; margin-bottom: 16px; }
          .finance-reports-block h4 { font-size: 15px; font-weight: 500; margin: 0 0 14px; color: var(--ink); }
          .finance-reports-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 0.5px solid var(--border-light); gap: 12px; }
          .finance-reports-row:last-child { border-bottom: none; }
          .finance-reports-row--total { font-weight: 600; background: var(--surface-hover); padding: 8px 10px; border-radius: var(--radius-sm); margin-top: 4px; border-bottom: none; }
          .finance-journal-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
          .finance-journal-head-icon { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, rgba(91, 63, 191, 0.12), rgba(91, 63, 191, 0.04)); border: 0.5px solid var(--border-violet); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--v500, #5B3FBF); }
          .finance-journal-lead { font-size: 13px; color: var(--text-secondary); line-height: 1.45; margin: 0; max-width: 640px; }
          .finance-journal-panel { background: var(--surface-hover); border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); padding: 18px 18px 16px; margin-bottom: 20px; }
          .finance-journal-panel-title { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 14px; }
          .finance-journal-meta { display: grid; gap: 12px; margin-bottom: 18px; }
          @media (min-width: 640px) {
            .finance-journal-meta { grid-template-columns: 200px 1fr; align-items: end; }
          }
          .finance-journal-lines { display: flex; flex-direction: column; gap: 0; }
          .finance-journal-line { display: grid; gap: 12px; padding: 14px 14px; margin-bottom: 10px; background: var(--surface); border: 0.5px solid var(--border-light); border-radius: var(--radius-sm); align-items: end; box-sizing: border-box; }
          .finance-journal-line:last-of-type { margin-bottom: 0; }
          @media (min-width: 1024px) {
            .finance-journal-line {
              grid-template-columns: minmax(200px, 2.2fr) minmax(96px, 1fr) minmax(96px, 1fr) minmax(100px, 0.9fr) minmax(120px, 1.1fr) 44px;
            }
          }
          @media (min-width: 640px) and (max-width: 1023px) {
            .finance-journal-line {
              grid-template-columns: 1fr 1fr;
            }
            .finance-journal-line-col--account { grid-column: 1 / -1; }
            .finance-journal-line-col--counter { grid-column: 1 / -1; }
            .finance-journal-line-col--remove { grid-column: 1 / -1; justify-self: end; }
          }
          @media (max-width: 639px) {
            .finance-journal-line { grid-template-columns: 1fr; }
            .finance-journal-line-col--remove { justify-self: end; }
          }
          .finance-journal-line .form-group { margin-bottom: 0; }
          .finance-journal-line .form-group label { font-size: 11px; }
          .finance-journal-line-remove { display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
          .finance-journal-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 0.5px solid var(--border-light); }
          .finance-journal-pills { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
          .finance-journal-pill { font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 999px; background: var(--surface); border: 0.5px solid var(--border-light); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
          .finance-journal-pill--ok { background: var(--success-light); border-color: transparent; color: var(--success); }
          .finance-journal-pill--warn { background: var(--danger-light); border-color: transparent; color: var(--danger); }
          .finance-journal-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
          .finance-journal-btn-primary { border: none; border-radius: 10px; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; background: #5B3FBF; color: #fff; transition: opacity 0.15s ease, transform 0.1s ease; }
          .finance-journal-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
          .finance-journal-btn-primary:not(:disabled):hover { filter: brightness(1.05); }
          .finance-journal-btn-ghost { display: inline-flex; align-items: center; gap: 8px; border-radius: 10px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); }
          .finance-journal-btn-ghost:hover { background: var(--surface-hover); color: var(--text); }
          .finance-journal-history { margin-top: 8px; }
          .finance-journal-history-title { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 10px; }
          .finance-journal-memo { font-weight: 500; color: var(--text); max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .finance-reports-hint { margin-bottom: 16px; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-hover); border: 0.5px solid var(--border-violet); font-size: 13px; color: var(--text-secondary); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
`;
