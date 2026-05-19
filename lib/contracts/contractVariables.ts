export interface ContractVariableDef {
  key: string;
  label: string;
}

export const CONTRACT_TEMPLATE_VARIABLES: ContractVariableDef[] = [
  { key: 'nome_aluno', label: 'Nome do aluno' },
  { key: 'email_aluno', label: 'E-mail do aluno' },
  { key: 'telefone_aluno', label: 'Telefone do aluno' },
  { key: 'plano', label: 'Plano' },
  { key: 'nome_academia', label: 'Nome da academia' },
  { key: 'data_hoje', label: 'Data de hoje' },
];

export const DEFAULT_CONTRACT_TEMPLATE_HTML = `<h1>Contrato de matrícula</h1>
<p>Pelo presente instrumento, <strong>{{nome_academia}}</strong> e o(a) aluno(a) <strong>{{nome_aluno}}</strong> firmam o seguinte:</p>
<p><strong>Plano:</strong> {{plano}}</p>
<p><strong>Contato:</strong> {{email_aluno}} · {{telefone_aluno}}</p>
<p>Data: {{data_hoje}}</p>
<p>_________________________________________</p>
<p>Assinatura do aluno ou responsável</p>`;

export type ContractVariableMap = Record<string, string>;

export function mergeContractTemplateHtml(html: string, vars: ContractVariableMap): string {
  let out = String(html || '');
  for (const { key } of CONTRACT_TEMPLATE_VARIABLES) {
    const value = String(vars[key] ?? '');
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), value);
  }
  return out;
}

export function formatContractDate(d = new Date()): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
