import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReceiptPdfButton from '../components/shared/ReceiptPdfButton.jsx';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  show: vi.fn(),
}));

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => toast,
}));

describe('ReceiptPdfButton', () => {
  it('mostra Baixar recibo e confirma o download', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn().mockResolvedValue(undefined);

    render(<ReceiptPdfButton onDownload={onDownload} />);

    const button = screen.getByRole('button', { name: /Baixar recibo/i });
    await user.click(button);

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Recibo baixado.');
  });
});
