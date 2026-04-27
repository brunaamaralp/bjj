/** Monta partida de liquidação a partir de uma transação financeira (mesma lógica do Finance legado). */
export function montarLancamento(tx, accounts, academyId) {
  const findId = (code) => accounts.find((a) => a.code === code)?.id;

  const caixaId = findId('1.1.1');
  const receitaId = findId('4.1.1');
  const despFinId = findId('7.1.1');

  const gross = Number(tx.gross) || 0;
  const fee = Number(tx.fee) || 0;
  const net = Number(tx.net) || gross;
  const txType = String(tx?.type || '').trim().toLowerCase();

  const lines = [];

  if (txType === 'expense') {
    if (!caixaId || !despFinId) return null;
    lines.push(
      { accountId: despFinId, debit: gross, credit: 0, cash: false, counterCode: '1.1.1' },
      { accountId: caixaId, debit: 0, credit: gross, cash: true, counterCode: '7.1.1' }
    );
    return {
      date: new Date().toISOString().split('T')[0],
      memo: `Liquidação: despesa · ${tx.id}`,
      lines,
      academyId
    };
  }

  if (!caixaId || !receitaId) return null;

  if (fee > 0 && despFinId) {
    lines.push(
      { accountId: caixaId, debit: net, credit: 0, cash: true, counterCode: '4.1.1' },
      { accountId: despFinId, debit: fee, credit: 0, cash: false, counterCode: '4.1.1' },
      { accountId: receitaId, debit: 0, credit: gross, cash: false, counterCode: '1.1.1' }
    );
  } else {
    lines.push(
      { accountId: caixaId, debit: gross, credit: 0, cash: true, counterCode: '4.1.1' },
      { accountId: receitaId, debit: 0, credit: gross, cash: false, counterCode: '1.1.1' }
    );
  }

  return {
    date: new Date().toISOString().split('T')[0],
    memo: `Liquidação: ${tx.planName || tx.type || 'transação'} · ${tx.id}`,
    lines,
    academyId
  };
}
