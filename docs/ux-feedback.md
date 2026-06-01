# Feedback visual (toasts, banners, erros)

Guia para alertas, toasts e mensagens no app Nave.

## Quando usar cada canal

| Canal | Uso | Não usar para |
|-------|-----|----------------|
| **Toast** (`useToast`) | Feedback transitório após ação (salvar, enviar, copiar) | Erro persistente de lista que falhou ao carregar |
| **StatusBanner** / **ErrorBanner** | Erro/aviso/info persistente na página ou painel; `onRetry` em falhas de load | Validação de campo |
| **FieldError** | Validação abaixo do input | Duplicar a mesma frase em toast |
| **ConfirmDialog** | Confirmação bloqueante antes de delete/desconectar | — |
| **Notificações (sino)** | Histórico / eventos assíncronos | Feedback imediato de ação do usuário |

## Tipos semânticos

`success` | `error` | `warning` | `info` — alinhados a `TOAST_DURATION` em `src/store/useUiStore.js`.

## Código

```jsx
import { useToast } from '../hooks/useToast';

const toast = useToast();

// Sucesso / aviso / info
toast.success('Dados salvos com sucesso.');
toast.warning('Estoque baixo.');
toast.info('Assinatura ainda não está ativa.');

// Erro de API — aplica friendlyError automaticamente
} catch (e) {
  toast.error(e, 'save');
}

// Toast com opções extras (ação, persistente)
toast.show({ type: 'error', message: '...', action: { label: 'Desfazer', onClick: () => {} } });
```

```jsx
import StatusBanner from '../components/shared/StatusBanner';
import ErrorBanner from '../components/shared/ErrorBanner'; // alias variant="error"

{loadError ? (
  <ErrorBanner message={friendlyError(loadError, 'load')} onRetry={() => load()} />
) : null}

<StatusBanner variant="warning" message="Complete a configuração." />
```

```jsx
import FieldError from '../components/shared/FieldError';

{errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
```

```jsx
import ConfirmDialog from '../components/shared/ConfirmDialog';

<ConfirmDialog
  open={confirmOpen}
  title="Excluir tarefa?"
  description="Esta ação não pode ser desfeita."
  confirmLabel="Excluir"
  onConfirm={handleDelete}
  onClose={() => setConfirmOpen(false)}
/>
```

## Mensagens de texto

- **API/rede/Appwrite:** `friendlyError(e, context)` ou `friendlySaleError(e)` — nunca `e.message` cru.
- **Validação local:** frase curta imperativa — «Informe o nome.», «Selecione um plano.»
- **Falhas genéricas:** «Não foi possível…»
- Não mostrar toast + banner com o mesmo texto para o mesmo erro.

## Anti-padrões

- `window.confirm` — usar `ConfirmDialog`
- `addToast({ type: 'error', message: e.message })`
- Toast + banner duplicados
- Banners com cores hex fixas fora dos tokens CSS
- `role="status"` em toast de erro (usar `role="alert"`)

## Componentes

- `src/hooks/useToast.js`
- `src/components/NaviToasts.jsx`
- `src/components/shared/StatusBanner.jsx`
- `src/components/shared/FieldError.jsx`
- `src/components/shared/ConfirmDialog.jsx`
- `src/lib/errorMessages.js`

## Referências

- Barra de perguntas (⌘K): [assistive-queries.md](assistive-queries.md)
