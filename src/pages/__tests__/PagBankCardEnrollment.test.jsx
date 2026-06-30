import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PagBankCardEnrollment from '../PagBankCardEnrollment.jsx';
import { maskCardNumber } from '../../lib/pagbankCardMasks.js';

function renderWithToken(token) {
  const encoded = encodeURIComponent(token);
  return render(
    <MemoryRouter initialEntries={[`/cartao/${encoded}`]}>
      <Routes>
        <Route path="/cartao/:token" element={<PagBankCardEnrollment />} />
      </Routes>
    </MemoryRouter>
  );
}

const portalContext = {
  student_name: 'Aluno Teste',
  plan_name: 'Adulto Mensal',
  plan_amount: 15000,
  plan_frequency: 'por mês',
  academy_name: 'Academia GBLP',
  already_subscribed: false,
};

describe('PagBankCardEnrollment', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('invalid token URL shows expired link message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      ok: false,
      json: async () => ({ error: 'invalid_portal_token' }),
    });

    renderWithToken('bad-token');

    expect(await screen.findByText(/expirou ou é inválido/i)).toBeInTheDocument();
  });

  it('already_subscribed goes directly to success without form', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        ...portalContext,
        already_subscribed: true,
        subscription_id: 'SUB_EXISTING',
      }),
    });

    renderWithToken('valid-token');

    expect(await screen.findByText('Sua assinatura já está ativa')).toBeInTheDocument();
    expect(screen.getByText(/SUB_EXISTING/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Número do cartão/i)).not.toBeInTheDocument();
  });

  it('retryable load error shows retry button and reloads', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: async () => ({ error: 'server_error' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => portalContext,
      });

    renderWithToken('valid-token');
    expect(await screen.findByText('Erro ao carregar. Tente novamente.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

    expect(await screen.findByText(/Cadastro de cartão/i)).toBeInTheDocument();
  });

  it('empty form submit shows errors on all fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => portalContext,
    });

    renderWithToken('valid-token');
    expect(await screen.findByText(/Informe os dados do cartão/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ativar assinatura/i }));

    expect(await screen.findByText('Número de cartão inválido')).toBeInTheDocument();
    expect(screen.getByText('Validade inválida')).toBeInTheDocument();
    expect(screen.getByText('CVV inválido')).toBeInTheDocument();
    expect(screen.getByText('Nome igual ao impresso no cartão')).toBeInTheDocument();
  });

  it('CVV input filters non-numeric characters', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => portalContext,
    });

    renderWithToken('valid-token');
    await screen.findByLabelText(/CVV/i);

    const cvvInput = screen.getByLabelText(/CVV/i);
    await userEvent.type(cvvInput, 'abc123x');
    expect(cvvInput).toHaveValue('123');
  });

  it('masks card number correctly', () => {
    expect(maskCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
  });

  it('full flow reaches success state', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => portalContext,
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ encrypted_card: 'enc-abc' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ subscriber_id: 'CUST_1' }),
      })
      .mockResolvedValueOnce({
        status: 201,
        ok: true,
        json: async () => ({ subscription_id: 'SUB_NEW' }),
      });

    renderWithToken('valid-token');
    await screen.findByLabelText(/Número do cartão/i);

    await userEvent.type(screen.getByLabelText(/Número do cartão/i), '4111111111111111');
    await userEvent.type(screen.getByLabelText(/Nome/i), 'aluno teste');
    await userEvent.type(screen.getByLabelText(/Validade/i), '1230');
    await userEvent.type(screen.getByLabelText(/CVV/i), '123');

    fireEvent.click(screen.getByRole('button', { name: /Ativar assinatura/i }));

    await waitFor(() => {
      expect(screen.getByText('Assinatura ativada!')).toBeInTheDocument();
    });
    expect(screen.getByText(/SUB_NEW/)).toBeInTheDocument();
  });

  it('encrypt failure shows error state', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => portalContext,
      })
      .mockResolvedValueOnce({
        status: 400,
        ok: false,
        json: async () => ({ error: 'missing_fields' }),
      });

    renderWithToken('valid-token');
    await screen.findByLabelText(/Número do cartão/i);

    await userEvent.type(screen.getByLabelText(/Número do cartão/i), '4111111111111111');
    await userEvent.type(screen.getByLabelText(/Nome/i), 'aluno teste');
    await userEvent.type(screen.getByLabelText(/Validade/i), '1230');
    await userEvent.type(screen.getByLabelText(/CVV/i), '123');
    fireEvent.click(screen.getByRole('button', { name: /Ativar assinatura/i }));

    expect(
      await screen.findByText(/Erro ao processar o cartão/i)
    ).toBeInTheDocument();
  });

  it('subscription failure shows reception contact message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => portalContext,
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ encrypted_card: 'enc-abc' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ subscriber_id: 'CUST_1' }),
      })
      .mockResolvedValueOnce({
        status: 502,
        ok: false,
        json: async () => ({ error: 'pagbank_unavailable' }),
      });

    renderWithToken('valid-token');
    await screen.findByLabelText(/Número do cartão/i);

    await userEvent.type(screen.getByLabelText(/Número do cartão/i), '4111111111111111');
    await userEvent.type(screen.getByLabelText(/Nome/i), 'aluno teste');
    await userEvent.type(screen.getByLabelText(/Validade/i), '1230');
    await userEvent.type(screen.getByLabelText(/CVV/i), '123');
    fireEvent.click(screen.getByRole('button', { name: /Ativar assinatura/i }));

    expect(
      await screen.findByText(/Cartão registrado, mas houve um erro ao ativar o plano/i)
    ).toBeInTheDocument();
  });
});
