import { isCollectionTask } from './collectionRules.js';
import { isTemplateTask } from './taskTemplates.js';

/** @returns {'manual' | 'process' | 'collection'} */
export function resolveTaskOrigin(task) {
  if (!task) return 'manual';
  if (isCollectionTask(task)) return 'collection';

  const source = String(task.source || task.origin || '').trim().toLowerCase();
  if (source.includes('collection') || source.includes('cobranca') || source.includes('cobrança')) {
    return 'collection';
  }
  if (source.includes('template') || source.includes('process') || source.includes('processo')) {
    return 'process';
  }

  const kind = String(task.kind || '').trim().toLowerCase();
  if (kind === 'collection' || kind === 'cobranca' || kind === 'cobrança') return 'collection';
  if (kind === 'template' || kind === 'process' || kind === 'processo') return 'process';

  if (isTemplateTask(task)) return 'process';
  if (String(task.template_name || task.templateName || '').trim()) return 'process';

  return 'manual';
}
