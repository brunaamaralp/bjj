export interface ContractVariableDef {
  key: string;
  label: string;
  group: 'aluno' | 'responsavel' | 'academia' | 'datas';
}

export const CONTRACT_VARIABLE_GROUPS: { id: ContractVariableDef['group']; label: string }[] = [
  { id: 'aluno', label: 'Aluno' },
  { id: 'responsavel', label: 'Responsável' },
  { id: 'academia', label: 'Academia' },
  { id: 'datas', label: 'Datas' },
];

export const CONTRACT_TEMPLATE_VARIABLES: ContractVariableDef[] = [
  { key: 'nome_aluno', label: 'Nome do aluno', group: 'aluno' },
  { key: 'email_aluno', label: 'E-mail do aluno', group: 'aluno' },
  { key: 'telefone_aluno', label: 'Telefone do aluno', group: 'aluno' },
  { key: 'cpf_aluno', label: 'CPF do aluno', group: 'aluno' },
  { key: 'data_nascimento', label: 'Data de nascimento', group: 'aluno' },
  { key: 'tipo_perfil', label: 'Perfil (Adulto/Criança)', group: 'aluno' },
  { key: 'turma', label: 'Turma', group: 'aluno' },
  { key: 'faixa', label: 'Faixa / cinto', group: 'aluno' },
  { key: 'sexo', label: 'Sexo', group: 'aluno' },
  { key: 'plano', label: 'Plano', group: 'aluno' },
  { key: 'data_ingresso', label: 'Data de ingresso', group: 'aluno' },
  { key: 'origem', label: 'Origem do cadastro', group: 'aluno' },
  { key: 'nome_responsavel', label: 'Nome do responsável', group: 'responsavel' },
  { key: 'cpf_responsavel', label: 'CPF do responsável', group: 'responsavel' },
  { key: 'contato_emergencia', label: 'Contato de emergência', group: 'responsavel' },
  { key: 'telefone_emergencia', label: 'Telefone de emergência', group: 'responsavel' },
  { key: 'forma_pagamento_preferida', label: 'Forma de pagamento preferida', group: 'aluno' },
  { key: 'conta_pagamento_preferida', label: 'Conta de pagamento preferida', group: 'aluno' },
  { key: 'nome_academia', label: 'Nome da academia', group: 'academia' },
  { key: 'data_hoje', label: 'Data de hoje', group: 'datas' },
  { key: 'data_aceite', label: 'Data do aceite (envio do contrato)', group: 'datas' },
];

export const DEFAULT_CONTRACT_TEMPLATE_HTML = `<h1>Contrato de matrícula</h1>
<p>Pelo presente instrumento, <strong>{{nome_academia}}</strong> e o(a) aluno(a) <strong>{{nome_aluno}}</strong> firmam o seguinte:</p>
<p><strong>Plano:</strong> {{plano}}</p>
<p><strong>Aluno:</strong> {{nome_aluno}} · CPF {{cpf_aluno}} · Tel. {{telefone_aluno}}</p>
<p><strong>Responsável:</strong> {{nome_responsavel}} · CPF {{cpf_responsavel}}</p>
<p><strong>Contato:</strong> {{email_aluno}} · {{telefone_aluno}}</p>
<p>Data do contrato: {{data_hoje}} · Aceite: {{data_aceite}}</p>
<p>_________________________________________</p>
<p>Assinatura do aluno ou responsável</p>`;

export const DEFAULT_RESCISSION_TEMPLATE_HTML = `<h1>Termo de rescisão</h1>
<p>Pelo presente termo, <strong>{{nome_academia}}</strong> e o(a) aluno(a) <strong>{{nome_aluno}}</strong> registram o encerramento da matrícula:</p>
<p><strong>Plano:</strong> {{plano}}</p>
<p><strong>Aluno:</strong> {{nome_aluno}} · CPF {{cpf_aluno}} · Tel. {{telefone_aluno}}</p>
<p><strong>Responsável:</strong> {{nome_responsavel}} · CPF {{cpf_responsavel}}</p>
<p>Data do termo: {{data_hoje}}</p>
<p>As partes declaram ciência das condições de rescisão acordadas entre academia e aluno (ou responsável).</p>
<p>_________________________________________</p>
<p>Assinatura do aluno ou responsável</p>`;

export type ContractVariableMap = Record<string, string>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mergeContractTemplateHtml(html: string, vars: ContractVariableMap): string {
  let out = String(html || '');
  const keys = new Set([
    ...CONTRACT_TEMPLATE_VARIABLES.map((v) => v.key),
    ...Object.keys(vars || {}),
  ]);
  for (const key of keys) {
    const value = String(vars[key] ?? '');
    out = out.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'gi'), value);
  }
  return out;
}

export function formatContractDate(d = new Date()): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
