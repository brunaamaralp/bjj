import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, MessageCircle, MoreHorizontal, UserCheck, UserX } from 'lucide-react';
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
    <button
      type="button"
      className={`btn-wa wa-btn wa-btn--icon-only${waLoading ? ' wa-btn--loading' : ''}${waSent ? ' wa-btn--sent' : ''}`}
      disabled={waSent || rowBusy || !hasPhone}
      title={hasPhone ? 'Enviar WhatsApp de reativação' : 'Sem telefone cadastrado'}
      aria-label={hasPhone ? 'Enviar WhatsApp de reativação' : 'Sem telefone cadastrado'}
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
  );
}

function CheckinActionButton({ row, checkinLoading, rowBusy, onCheckin }) {
  return (
    <button
      type="button"
      className={`attendance-at-risk-actions__btn attendance-at-risk-actions__btn--checkin${
        checkinLoading ? ' attendance-at-risk-actions__btn--loading' : ''
      }`}
      disabled={checkinLoading || rowBusy}
      title={checkinLoading ? 'Registrando…' : 'Registrar presença'}
      aria-label={checkinLoading ? 'Registrando presença' : 'Registrar presença'}
      onClick={() => void onCheckin(row)}
    >
      {checkinLoading ? (
        <Loader2 size={16} className="attendance-at-risk-spin" aria-hidden />
      ) : (
        <UserCheck size={16} aria-hidden />
      )}
    </button>
  );
}

/**
 * Ações por linha — WhatsApp primário + menu ⋯ (desktop e mobile).
 */
export default function AttendanceAtRiskRowActions({
  row,
  showCheckin = false,
  checkinLoading = false,
  onCheckin,
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
  const hasPhone = Boolean(String(row?.phone || '').trim());

  return (
    <div className="attendance-at-risk-actions" data-no-dnd="true">
      {showCheckin ? (
        <CheckinActionButton
          row={row}
          checkinLoading={checkinLoading}
          rowBusy={rowBusy}
          onCheckin={onCheckin}
        />
      ) : null}
      <WhatsAppActionButton
        row={row}
        waLoading={waLoading}
        waSent={waSent}
        rowBusy={rowBusy}
        onWhatsApp={onWhatsApp}
      />
      {!hasPhone && !waSent ? (
        <span className="attendance-at-risk-no-phone" title="Cadastre o telefone no perfil">
          Sem tel.
        </span>
      ) : null}
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
          <DropdownMenuPanel aria-label="Ações de retenção" align="end">
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
              <UserX size={14} aria-hidden />
              Encerrar matrícula
            </DropdownMenuItem>
          </DropdownMenuPanel>
        ) : null}
      </DropdownMenu>
    </div>
  );
}
