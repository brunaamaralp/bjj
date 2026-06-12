import { LEGAL_COMPANY, LEGAL_VERSION } from './legalConstants.js';

const { productName, legalName, website, privacyEmail, supportEmail } = LEGAL_COMPANY;

/** @typedef {{ id: string, title: string, paragraphs: string[] }} LegalSection */

/** @type {LegalSection[]} */
export const TERMS_SECTIONS = [
  {
    id: 'intro',
    title: '1. Introdução',
    paragraphs: [
      `Estes Termos de Uso ("Termos") regulam o acesso e a utilização da plataforma ${productName} ("Plataforma"), software na modalidade SaaS destinado à gestão de academias, estúdios e negócios de atividade física e saúde.`,
      `Ao criar uma conta ou utilizar a Plataforma, você ("Usuário" ou "Cliente") declara ter lido, compreendido e aceito integralmente estes Termos. Se não concordar, não utilize o serviço.`,
      `Estes Termos constituem contrato entre o Usuário e ${legalName} ("Nós", "Operadora"), responsável pela operação da Plataforma disponível em ${website}.`,
    ],
  },
  {
    id: 'definitions',
    title: '2. Definições',
    paragraphs: [
      'Conta: credenciais de acesso do Usuário à Plataforma.',
      'Academia / Workspace: ambiente isolado na Plataforma vinculado ao negócio do Cliente, com dados de leads, alunos, financeiro e demais módulos contratados.',
      'Plano: modalidade comercial (ex.: Starter, Studio, Pro) com recursos, limites e preço definidos na área de assinatura.',
      'Período de teste (trial): uso gratuito por prazo limitado, conforme divulgado no site ou na interface.',
      'Dados do Cliente: informações inseridas ou geradas pelo Usuário na Plataforma, incluindo dados de leads, alunos e colaboradores.',
    ],
  },
  {
    id: 'service',
    title: '3. Objeto e escopo do serviço',
    paragraphs: [
      `A Plataforma oferece ferramentas de CRM, atendimento via WhatsApp, automações, agente de inteligência artificial, gestão financeira e outros módulos conforme o plano contratado.`,
      'Funcionalidades podem variar conforme o plano, configurações da conta e integrações habilitadas (ex.: provedores de mensagens, pagamentos, assinatura digital).',
      'A Operadora pode alterar, incluir ou descontinuar recursos, desde que não prejudique de forma desproporcional o uso essencial já contratado, comunicando mudanças relevantes com antecedência razoável.',
    ],
  },
  {
    id: 'account',
    title: '4. Cadastro e responsabilidades da conta',
    paragraphs: [
      'O Usuário deve fornecer informações verdadeiras, completas e atualizadas no cadastro e manter a confidencialidade de sua senha.',
      'O titular da conta é responsável por todas as ações realizadas sob suas credenciais e pelas permissões concedidas a membros da equipe.',
      'É vedado compartilhar a conta com terceiros não autorizados, utilizar a Plataforma para fins ilícitos ou que violem direitos de terceiros.',
      'O Cliente é exclusivamente responsável pelo conteúdo das mensagens enviadas por meio da Plataforma, inclusive pelas respostas geradas por IA configuradas com suas instruções.',
    ],
  },
  {
    id: 'billing',
    title: '5. Planos, trial, pagamento e cancelamento',
    paragraphs: [
      'Após o período de teste, o uso continuado pode exigir contratação de plano pago, conforme valores e condições exibidos na interface.',
      'Cobranças recorrentes são processadas por provedor de pagamentos terceirizado (ex.: Asaas). A Operadora não armazena dados completos de cartão de crédito.',
      'Atrasos ou falhas de pagamento podem resultar em suspensão parcial ou total do acesso até a regularização.',
      'O Cliente pode solicitar cancelamento conforme canais disponíveis na conta. O cancelamento não exime o pagamento de valores já devidos pelo período utilizado.',
      'Limites de uso (ex.: conversas de IA por mês) seguem o plano contratado. Uso excedente, quando permitido, pode ser cobrado conforme tabela vigente.',
    ],
  },
  {
    id: 'acceptable-use',
    title: '6. Uso aceitável',
    paragraphs: [
      'É proibido utilizar a Plataforma para spam, práticas abusivas, discriminação, conteúdo ilegal, violação de propriedade intelectual ou tentativa de acesso não autorizado a sistemas.',
      'O Cliente deve obter consentimentos e bases legais necessários para tratar dados pessoais de leads, alunos e contatos importados ou coletados via WhatsApp e demais canais.',
      'A Operadora pode suspender ou encerrar contas que violem estes Termos ou representem risco à infraestrutura, a outros clientes ou a terceiros.',
    ],
  },
  {
    id: 'ip',
    title: '7. Propriedade intelectual',
    paragraphs: [
      'A Plataforma, sua marca, interface, código e documentação são de titularidade da Operadora ou de seus licenciadores.',
      'Os Dados do Cliente permanecem de propriedade do Cliente. O Cliente concede à Operadora licença limitada para hospedar, processar e exibir esses dados apenas para prestar o serviço contratado.',
    ],
  },
  {
    id: 'privacy',
    title: '8. Privacidade e proteção de dados',
    paragraphs: [
      `O tratamento de dados pessoais é regido pela Política de Privacidade, parte integrante destes Termos, disponível em ${website}/privacidade.`,
      'Em relação aos dados de leads e alunos inseridos pelo Cliente, o Cliente atua, em regra, como controlador perante seus titulares, e a Operadora como operadora na prestação do SaaS.',
      `Dúvidas sobre privacidade: ${privacyEmail}.`,
    ],
  },
  {
    id: 'availability',
    title: '9. Disponibilidade e suporte',
    paragraphs: [
      'A Plataforma é fornecida "como está", com esforços comercialmente razoáveis de disponibilidade e segurança.',
      'Manutenções programadas ou emergenciais podem causar indisponibilidade temporária. Integrações de terceiros (WhatsApp, gateways de pagamento, etc.) dependem da disponibilidade desses serviços.',
      `Suporte é prestado pelos canais indicados na Plataforma ou via ${supportEmail}.`,
    ],
  },
  {
    id: 'liability',
    title: '10. Limitação de responsabilidade',
    paragraphs: [
      'Na máxima extensão permitida pela lei aplicável, a Operadora não se responsabiliza por lucros cessantes, perda de dados causada por uso inadequado pelo Cliente, decisões comerciais tomadas com base em relatórios da Plataforma ou falhas de serviços de terceiros.',
      'A responsabilidade total da Operadora por danos diretos comprovados relacionados ao serviço fica limitada ao valor pago pelo Cliente nos 12 (doze) meses anteriores ao evento, salvo hipóteses de dolo ou culpa grave.',
    ],
  },
  {
    id: 'changes',
    title: '11. Alterações destes Termos',
    paragraphs: [
      'Podemos atualizar estes Termos para refletir mudanças legais, de produto ou de processos. A data da versão vigente aparece no topo desta página.',
      'Mudanças relevantes serão comunicadas por e-mail ou aviso na Plataforma. O uso continuado após a vigência das alterações constitui aceite, salvo quando a lei exigir consentimento específico.',
    ],
  },
  {
    id: 'law',
    title: '12. Lei aplicável e foro',
    paragraphs: [
      'Estes Termos são regidos pelas leis da República Federativa do Brasil.',
      'Fica eleito o foro da comarca do domicílio do Cliente, quando aplicável o Código de Defesa do Consumidor, ou, na hipótese de relação B2B sem caracterização de consumo, o foro da comarca da sede da Operadora, com renúncia a qualquer outro, por mais privilegiado que seja.',
    ],
  },
  {
    id: 'contact',
    title: '13. Contato',
    paragraphs: [
      `Dúvidas sobre estes Termos: ${supportEmail}`,
      `Privacidade: ${privacyEmail}`,
      `Site: ${website}`,
    ],
  },
];

/** @type {LegalSection[]} */
export const PRIVACY_SECTIONS = [
  {
    id: 'intro',
    title: '1. Quem somos',
    paragraphs: [
      `Esta Política de Privacidade descreve como ${legalName} ("Nós", "Operadora"), responsável pela plataforma ${productName}, trata dados pessoais ao oferecer o serviço disponível em ${website}.`,
      'Esta política foi elaborada em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e demais normas aplicáveis.',
    ],
  },
  {
    id: 'roles',
    title: '2. Papéis no tratamento de dados',
    paragraphs: [
      'Dados de cadastro do Cliente (dono da conta, administradores e colaboradores): em geral, a Operadora atua como controladora.',
      'Dados de leads, alunos, pacientes e contatos inseridos ou importados pelo Cliente na Plataforma: o Cliente é, em regra, o controlador perante esses titulares; a Operadora atua como operadora, tratando os dados conforme instruções do Cliente e para execução do contrato SaaS.',
      'O Cliente é responsável por informar seus titulares, obter bases legais e consentimentos quando necessários, especialmente em comunicações via WhatsApp e automações.',
    ],
  },
  {
    id: 'collected',
    title: '3. Dados que coletamos',
    paragraphs: [
      'Dados de conta: nome, e-mail, senha (armazenada de forma criptografada pelo provedor de autenticação), identificadores de sessão.',
      'Dados da academia/workspace: nome do negócio, telefone, configurações, módulos habilitados, vertical (ex.: fitness ou fisioterapia).',
      'Dados operacionais: leads, histórico de conversas, mensagens, automações, registros financeiros, presença e demais informações inseridas pelo Cliente.',
      'Dados de uso: logs de acesso, métricas de consumo (ex.: conversas de IA), endereço IP, tipo de navegador e eventos de segurança.',
      'Dados de pagamento da assinatura: processados por gateway terceirizado (ex.: Asaas); recebemos status de pagamento, identificadores e dados fiscais necessários (CPF/CNPJ), não o número completo do cartão.',
      'Aceite legal: registro de que você aceitou estes documentos, com data, hora e versão.',
    ],
  },
  {
    id: 'purposes',
    title: '4. Finalidades e bases legais',
    paragraphs: [
      'Prestação do serviço contratado e execução do contrato (art. 7º, V, LGPD).',
      'Cadastro, autenticação, suporte e comunicações sobre a conta (art. 7º, V e, quando aplicável, VI).',
      'Cobrança, faturamento e prevenção a fraudes (art. 7º, V e IX).',
      'Melhoria da Plataforma, segurança e análises agregadas (art. 7º, IX — legítimo interesse, com balanceamento).',
      'Cumprimento de obrigações legais e regulatórias (art. 7º, II).',
      'Comunicações de marketing sobre o Nave, quando permitido e com opção de descadastro (art. 7º, I, quando baseado em consentimento).',
    ],
  },
  {
    id: 'sharing',
    title: '5. Compartilhamento com terceiros',
    paragraphs: [
      'Utilizamos provedores de infraestrutura e serviços essenciais, que tratam dados conforme contratos e apenas na medida necessária:',
      '• Appwrite — autenticação, banco de dados e armazenamento da aplicação.',
      '• Asaas (ou equivalente) — cobrança da assinatura SaaS.',
      '• Provedores de WhatsApp / mensageria (ex.: Zapster) — envio e recebimento de mensagens configuradas pelo Cliente.',
      '• Vercel — hospedagem e execução da aplicação.',
      '• Provedores de IA — processamento de mensagens do agente, conforme configuração do Cliente.',
      '• Autentique ou similares — assinatura digital de contratos, quando habilitado.',
      'Podemos divulgar dados quando exigido por lei, ordem judicial ou autoridade competente, ou para proteger direitos, segurança e integridade da Plataforma.',
      'Não vendemos dados pessoais.',
    ],
  },
  {
    id: 'international',
    title: '6. Transferência internacional',
    paragraphs: [
      'Alguns provedores podem processar dados em servidores fora do Brasil (ex.: Estados Unidos ou Europa). Nesses casos, adotamos medidas contratuais e técnicas compatíveis com a LGPD, incluindo cláusulas padrão ou mecanismos equivalentes quando aplicável.',
    ],
  },
  {
    id: 'retention',
    title: '7. Retenção',
    paragraphs: [
      'Mantemos os dados enquanto a conta estiver ativa e pelo tempo necessário para cumprir obrigações legais, resolver disputas e fazer cumprir acordos.',
      'Após cancelamento, dados podem ser mantidos por período limitado para backup, auditoria e obrigações legais, sendo depois eliminados ou anonimizados, salvo retenção exigida por lei.',
      'O Cliente pode exportar ou solicitar exclusão conforme seção de direitos abaixo, observadas limitações técnicas e legais.',
    ],
  },
  {
    id: 'security',
    title: '8. Segurança',
    paragraphs: [
      'Adotamos medidas técnicas e organizacionais como controle de acesso por perfil, isolamento multi-tenant por academia, comunicação criptografada (HTTPS), segregação de credenciais e monitoramento.',
      'Nenhum sistema é 100% seguro. O Cliente deve usar senhas fortes, gerenciar permissões da equipe e não compartilhar tokens de API ou integrações.',
    ],
  },
  {
    id: 'cookies',
    title: '9. Cookies e tecnologias similares',
    paragraphs: [
      'Utilizamos cookies e armazenamento local estritamente necessários para autenticação, preferências da sessão (ex.: academia ativa) e funcionamento da aplicação.',
      'Não utilizamos cookies de publicidade de terceiros na área logada. Ferramentas de analytics, se habilitadas, serão descritas em aviso específico.',
    ],
  },
  {
    id: 'rights',
    title: '10. Direitos dos titulares (LGPD)',
    paragraphs: [
      'Você pode solicitar, nos termos da LGPD: confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamentos e revogação de consentimento quando aplicável.',
      `Para exercer seus direitos como titular de conta Nave, envie pedido para ${privacyEmail} com identificação suficiente. Responderemos em prazo razoável conforme a lei.`,
      'Se seus dados foram inseridos por uma academia que usa o Nave, contate também essa academia, que é controladora em relação a você.',
    ],
  },
  {
    id: 'children',
    title: '11. Crianças e adolescentes',
    paragraphs: [
      'A Plataforma não é destinada a menores de 18 anos criarem conta. Dados de menores inseridos pelo Cliente (ex.: alunos) devem ser tratados pelo Cliente com base legal adequada e consentimento parental quando exigido.',
    ],
  },
  {
    id: 'changes',
    title: '12. Alterações desta política',
    paragraphs: [
      'Podemos atualizar esta Política periodicamente. A versão vigente e sua data aparecem no topo desta página.',
      'Alterações relevantes serão comunicadas por e-mail ou aviso na Plataforma.',
    ],
  },
  {
    id: 'contact',
    title: '13. Encarregado / contato',
    paragraphs: [
      `Para questões sobre privacidade e proteção de dados: ${privacyEmail}`,
      `Suporte geral: ${supportEmail}`,
      `Site: ${website}`,
    ],
  },
];

export function getLegalDocumentMeta(kind) {
  if (kind === 'terms') {
    return {
      title: 'Termos de Uso',
      version: LEGAL_VERSION.terms,
      updatedLabel: 'Última atualização',
    };
  }
  return {
    title: 'Política de Privacidade',
    version: LEGAL_VERSION.privacy,
    updatedLabel: 'Última atualização',
  };
}
