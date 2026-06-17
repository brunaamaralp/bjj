import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ExternalLink, Loader2, MessageCircle, MoreHorizontal, UserX } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItem,
  DropdownMenuDivider,
  DropdownMenuLabel,
} from '../shared/menu';
import { ATTENDANCE_ABSENCE_SNOOZE_OPTIONS } from '../../../lib/attendanceRetentionCore.js';

function WhatsAppActionButton({ row, waLoading, waSent, rowBusy, onWhatsApp }) {
  const hasPhone = Boolean(String(row?.phone || '').trim());

  return (
    <>
      <button
        type="button"
        className={`btn-wa wa-btn wa-btn--icon-only${waLoading ? ' wa-btn--loading' : ''}${waSent ? ' wa-btn--sent' : ''}`}
        disabled={waSent || rowBusy || !hasPhone}
        title={hasPhone ? 'Enviar WhatsApp de reativação' : 'Sem telefone'}
        aria-label="WhatsApp de reativação"
        onClick={() => void onWhatsApp(row)}
      >
        {waLoading ? (
          <Loader2 className="wa-icon wa-icon--spin" size={14} color="#fff" aria-hidden />
        ) : waSent ? (
          <Check className="wa-icon" size={14} color="#fff" strokeWidth={2.5} aria-hidden />
        ) : (
          <MessageCircle size={14} color="#fff" aria-hidden />
        )}
      </button>
      {!hasPhone && !waSent ? (
        <span className="attendance-at-risk-no-phone">Sem telefone</span>
      ) : null}
    </>
  );
}

/**
 * Ações por linha da fila de retenção (desktop inline; mobile com menu ⋯).
 */
export default function AttendanceAtRiskRowActions({
  row,
  waLoading,
  waSent,
  rowBusy,
  menuOpen,
  onMenuOpenChange,
  onWhatsApp,
  onAbsence,
  onMarkContact,
  onDeactivate,
  onQuickSnooze,
}) {
  const navigate = useNavigate();
  const sid = String(row.studentId || '');
  const moreOpen = menuOpen === sid;

  return (
    <>
      <div className="attendance-at-risk-actions attendance-at-risk-actions--desktop" data-no-dnd="true">
        <WhatsAppActionButton
          row={row}
          waLoading={waLoading}
          waSent={waSent}
          rowBusy={rowBusy}
          onWhatsApp={onWhatsApp}
        />
        <Link
          to={`/student/${sid}`}
          className="btn-outline attendance-at-risk-actions__btn"
          title="Abrir perfil"
        >
          <ExternalLink size={14} aria-hidden />
        </Link>
        <button
          type="button"
          className="btn-outline attendance-at-risk-actions__btn"
          disabled={rowBusy}
          title="Registrar motivo de ausência"
          onClick={() => onAbsence(row)}
        >
          Ausência
        </button>
        <button
          type="button"
          className="btn-outline attendance-at-risk-actions__btn"
          disabled={rowBusy}
          title="Marcar como em contato"
          onClick={() => void onMarkContact(row)}
        >
          Em contato
        </button>
        <button
          type="button"
          className="btn-outline attendance-at-risk-actions__btn attendance-at-risk-actions__btn--danger"
          disabled={rowBusy}
          title="Encerrar matrícula"
          onClick={() => onDeactivate(row)}
        >
          <UserX size={14} aria-hidden />
        </button>
      </div>

      <div className="attendance-at-risk-actions attendance-at-risk-actions--mobile" data-no-dnd="true">
        <WhatsAppActionButton
          row={row}
          waLoading={waLoading}
          waSent={waSent}
          rowBusy={rowBusy}
          onWhatsApp={onWhatsApp}
        />
        <DropdownMenu
          open={moreOpen}
          onOpenChange={(next) => onMenuOpenChange(next ? sid : '')}
          className="attendance-at-risk-actions-menu"
        >
          <button
            type="button"
            className="btn-outline attendance-at-risk-actions__btn attendance-at-risk-actions__btn--icon"
            aria-label="Mais ações"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            title="Mais ações"
            disabled={rowBusy}
            onClick={() => onMenuOpenChange(moreOpen ? '' : sid)}
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {moreOpen ? (
            <DropdownMenuPanel aria-label="Ações de retenção">
              <DropdownMenuItem onClick={() => navigate(`/student/${sid}`)}>
                Abrir perfil
              </DropdownMenuItem>
              <DropdownMenuItem disabled={rowBusy} onClick={() => onAbsence(row)}>
                Registrar ausência
              </DropdownMenuItem>
              <DropdownMenuItem disabled={rowBusy} onClick={() => void onMarkContact(row)}>
                Marcar em contato
              </DropdownMenuItem>
              <DropdownMenuDivider />
              <DropdownMenuLabel>Ocultar da fila</DropdownMenuLabel>
              {ATTENDANCE_ABSENCE_SNOOZE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  disabled={rowBusy}
                  onClick={() => void onQuickSnooze(row, opt.value)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuDivider />
              <DropdownMenuItem danger disabled={rowBusy} onClick={() => onDeactivate(row)}>
                Encerrar matrícula
              </DropdownMenuItem>
            </DropdownMenuPanel>
          ) : null}
        </DropdownMenu>
      </div>
    </>
  );
}
