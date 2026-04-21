/** Estilos compartilhados das páginas Caixa / Contabilidade (ex-Finance). */
export const FINANCE_PAGE_CSS = `
          .finance-page-root { width: 100%; box-sizing: border-box; }
          .finance-page-inner { max-width: 1100px; margin: 0 auto; padding: 24px; box-sizing: border-box; padding-bottom: 40px; }
          .finance-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; margin-bottom: 6px; }
          .finance-tab { border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer; background: transparent; color: var(--text-secondary); font-family: inherit; transition: background 0.15s ease, color 0.15s ease; }
          .finance-tab--active { background: #5B3FBF; color: #fff; }
          .finance-tx-toolbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
          .finance-table-wrap { width: 100%; overflow-x: auto; border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); background: var(--surface); }
          .finance-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .finance-table thead th { text-align: left; padding: 10px 12px; background: var(--surface-hover); border-bottom: 1px solid var(--border-light); font-weight: 600; color: var(--mid); white-space: nowrap; }
          .finance-table thead th.finance-num { text-align: right; }
          .finance-table td { padding: 10px 12px; border-bottom: 0.5px solid var(--border-light); vertical-align: middle; }
          .finance-table tbody tr:hover { background: var(--surface-hover); }
          .finance-table .finance-num { text-align: right; font-variant-numeric: tabular-nums; }
          .finance-tx-empty { padding: 56px 20px; text-align: center; color: var(--text-secondary); }
          .finance-tx-empty p { margin: 8px 0 0; font-size: 13px; }
          .finance-accounts-form-card { background: var(--surface-hover); border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 20px; }
          .finance-accounts-form-grid { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: end; }
          @media (min-width: 720px) {
            .finance-accounts-form-grid--row2 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .finance-accounts-form-grid--row3 { grid-template-columns: 1fr 160px auto; align-items: end; }
          }
          @media (max-width: 719px) {
            .finance-accounts-form-grid { grid-template-columns: 1fr 1fr; }
            .finance-accounts-form-grid--row2, .finance-accounts-form-grid--row3 { grid-template-columns: 1fr 1fr; }
          }
          .finance-accounts-row .finance-accounts-delete { opacity: 0.35; transition: opacity 0.15s ease; }
          .finance-accounts-row:hover .finance-accounts-delete { opacity: 1; }
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
