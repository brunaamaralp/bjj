# Equipe — Professor/Instrutor sem login (catálogo interno)

**Data:** 2026-09-10  
**Status:** aprovado para implementação  
**Abordagem:** catálogo interno + mesma tela Equipe

## Problem

Na Equipe só existem Administrador e Recepcionista (com e-mail/login). Academias precisam cadastrar **Professor** e **Instrutor** só para controle interno e confirmação de aulas — **sem e-mail e sem acesso ao app**.

## Goals

1. Cadastrar Professor/Instrutor na mesma UI da Equipe (form único; e-mail some nesses papéis)
2. Papéis exclusivos: login **ou** catálogo
3. Confirmação de aula e relatório usam **Equipe com login + catálogo ativo**

## Non-goals

- Login futuro para professor/instrutor
- Permissões de app para esses papéis
- Portal do professor

## Modelo

Coleção `instructors` (já provisionada), attrs:

| Campo | Tipo | Notas |
|-------|------|-------|
| `academy_id` | string | obrigatório |
| `name` | string | obrigatório |
| `role` | string | `professor` \| `instructor` |
| `is_active` | bool | default true |
| `sort_order` | int | opcional |

Refs estáveis na confirmação de aula / relatório:

- Login: `login:<userId>` (legado sem prefixo = login)
- Catálogo: `roster:<docId>`

## UX Equipe

- Opções de papel: Recepcionista, Administrador, Professor, Instrutor
- Se Professor/Instrutor: só nome; sem e-mail, senha, convite
- Tabela única; linhas de catálogo sem ações de senha/e-mail
- Owner/admin gerenciam; recepcionista só leitura

## Confirmação de aula

Selects unem membros ativos da Equipe (login) + roster ativo (ambos os papéis do catálogo).

## API / storage

- CRUD roster via client Appwrite (padrão `classesStore`) + permissões de documento da academia
- Sem nova Serverless Function

## Fluxos a atualizar

- `docs/flows/config/equipe-colaboradores.md`
- Spec de staff de aula (refs)
- `VALIDATION.md`
