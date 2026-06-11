import React from 'react';
import {
  FINANCE_REMINDER_PLACEHOLDERS,
  normalizeWhatsappRemindersConfig,
} from '../../../lib/financeWhatsappReminders.js';

function ReminderBlock({ title, enabled, onEnabledChange, daysLabel, daysValue, onDaysChange, daysMin, daysMax, message, onMessageChange }) {
  return (
    <div className="card finance-whatsapp-reminder-block">
      <label className="flex items-center gap-2 finance-whatsapp-reminder-block__toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
        <span className="ctx-label">{title}</span>
      </label>

      {enabled ? (
        <div className="finance-whatsapp-reminder-block__body">
          <label className="form-field">
            <span className="form-label">{daysLabel}</span>
            <input
              type="number"
              className="input finance-whatsapp-reminder-block__days"
              min={daysMin}
              max={daysMax}
              value={daysValue}
              onChange={(e) => onDaysChange(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Mensagem</span>
            <textarea
              className="input finance-whatsapp-reminder-block__message"
              rows={5}
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceSettingsWhatsappRemindersSection({ financeConfig, setFinanceConfig }) {
  const reminders = normalizeWhatsappRemindersConfig(financeConfig?.whatsappReminders);

  const patchReminders = (patch) => {
    setFinanceConfig((prev) => ({
      ...prev,
      whatsappReminders: {
        ...normalizeWhatsappRemindersConfig(prev?.whatsappReminders),
        ...patch,
      },
    }));
  };

  const patchDueSoon = (partial) => {
    patchReminders({
      dueSoon: { ...reminders.dueSoon, ...partial },
    });
  };

  const patchOverdue = (partial) => {
    patchReminders({
      overdue: { ...reminders.overdue, ...partial },
    });
  };

  return (
    <div className="finance-settings-section-body">
      <p className="finance-settings-lead finance-whatsapp-reminders-intro">
        Envio automático pelo WhatsApp (Zapster) quando a mensalidade está próxima do vencimento ou em atraso.
        Não cria conversa no Inbox e não altera a régua de cobrança.
      </p>

      <p className="text-small text-muted finance-whatsapp-reminders-vars">
        Variáveis:{' '}
        {FINANCE_REMINDER_PLACEHOLDERS.map((p) => p.key).join(', ')}
      </p>

      <ReminderBlock
        title="Lembrete de vencimento"
        enabled={reminders.dueSoon.enabled}
        onEnabledChange={(enabled) => patchDueSoon({ enabled })}
        daysLabel="Dias antes do vencimento"
        daysValue={reminders.dueSoon.daysBefore}
        onDaysChange={(raw) => patchDueSoon({ daysBefore: raw })}
        daysMin={1}
        daysMax={7}
        message={reminders.dueSoon.message}
        onMessageChange={(message) => patchDueSoon({ message })}
      />

      <ReminderBlock
        title="Lembrete de atraso"
        enabled={reminders.overdue.enabled}
        onEnabledChange={(enabled) => patchOverdue({ enabled })}
        daysLabel="Dias após o vencimento para primeiro envio"
        daysValue={reminders.overdue.daysAfter}
        onDaysChange={(raw) => patchOverdue({ daysAfter: raw })}
        daysMin={1}
        daysMax={7}
        message={reminders.overdue.message}
        onMessageChange={(message) => patchOverdue({ message })}
      />
    </div>
  );
}
