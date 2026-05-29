import type { AutentiquePosition, SignerInput } from './types.js';

export type AutentiqueElementType = AutentiquePosition['element'];

export type SignerLayoutElement = {
  element: AutentiqueElementType;
  x: string;
  y: string;
  z: number | 'last';
};

export type SignerLayoutSlot = {
  label: string;
  enabled?: boolean;
  includeName?: boolean;
  includeDate?: boolean;
  elements?: SignerLayoutElement[];
};

export type ContractSignerLayout = {
  version: 1;
  slots: SignerLayoutSlot[];
};

const ELEMENT_TYPES = new Set<AutentiqueElementType>([
  'SIGNATURE',
  'NAME',
  'DATE',
  'CPF',
  'INITIALS',
]);

export function defaultContractSignerLayout(): ContractSignerLayout {
  return {
    version: 1,
    slots: [
      {
        label: 'Contratante',
        enabled: true,
        includeName: true,
        includeDate: true,
        elements: [
          { element: 'SIGNATURE', x: '25', y: '88', z: 'last' },
          { element: 'NAME', x: '25', y: '92', z: 'last' },
          { element: 'DATE', x: '25', y: '95', z: 'last' },
        ],
      },
      {
        label: 'Contratada',
        enabled: true,
        includeName: true,
        includeDate: false,
        elements: [
          { element: 'SIGNATURE', x: '75', y: '88', z: 'last' },
          { element: 'NAME', x: '75', y: '92', z: 'last' },
        ],
      },
    ],
  };
}

function clampCoord(value: unknown, fallback: string): string {
  const n = Number(String(value ?? fallback).trim());
  if (!Number.isFinite(n)) return fallback;
  return String(Math.min(100, Math.max(0, n)));
}

function normalizeElement(raw: unknown): SignerLayoutElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const element = String(row.element || '').trim().toUpperCase() as AutentiqueElementType;
  if (!ELEMENT_TYPES.has(element)) return null;
  const zRaw = row.z;
  const z =
    zRaw === 'last' || String(zRaw).trim().toLowerCase() === 'last'
      ? 'last'
      : Math.max(1, Number(zRaw) || 1);
  return {
    element,
    x: clampCoord(row.x, '50'),
    y: clampCoord(row.y, '90'),
    z,
  };
}

function buildElementsFromSlot(slot: SignerLayoutSlot): SignerLayoutElement[] {
  if (Array.isArray(slot.elements) && slot.elements.length > 0) {
    return slot.elements
      .map((el) => normalizeElement(el))
      .filter((el): el is SignerLayoutElement => Boolean(el));
  }

  const baseX = slot.label.toLowerCase().includes('contratada') ? '75' : '25';
  const elements: SignerLayoutElement[] = [
    { element: 'SIGNATURE', x: baseX, y: '88', z: 'last' },
  ];
  if (slot.includeName !== false) {
    elements.push({ element: 'NAME', x: baseX, y: '92', z: 'last' });
  }
  if (slot.includeDate) {
    elements.push({ element: 'DATE', x: baseX, y: '95', z: 'last' });
  }
  return elements;
}

export function parseContractSignerLayout(raw: unknown): ContractSignerLayout {
  if (raw == null || raw === '') return defaultContractSignerLayout();
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaultContractSignerLayout();
    }
  }
  if (!parsed || typeof parsed !== 'object') return defaultContractSignerLayout();
  const obj = parsed as Record<string, unknown>;
  const slotsRaw = Array.isArray(obj.slots) ? obj.slots : [];
  const slots: SignerLayoutSlot[] = slotsRaw.slice(0, 4).map((slotRaw, index) => {
    const slot = (slotRaw || {}) as Record<string, unknown>;
    const defaults = defaultContractSignerLayout().slots[index] || defaultContractSignerLayout().slots[0];
    const label = String(slot.label || defaults.label).trim() || defaults.label;
    const enabled = slot.enabled !== false && slot.enabled !== 'false';
    const includeName = slot.includeName !== false && slot.includeName !== 'false';
    const includeDate = slot.includeDate === true || slot.includeDate === 'true';
    const normalized: SignerLayoutSlot = {
      label,
      enabled,
      includeName,
      includeDate,
    };
    if (Array.isArray(slot.elements)) {
      normalized.elements = slot.elements
        .map((el) => normalizeElement(el))
        .filter((el): el is SignerLayoutElement => Boolean(el));
    } else {
      normalized.elements = buildElementsFromSlot(normalized);
    }
    return normalized;
  });

  while (slots.length < 2) {
    const fallback = defaultContractSignerLayout().slots[slots.length];
    if (fallback) slots.push({ ...fallback });
  }

  return { version: 1, slots };
}

export function serializeContractSignerLayout(layout: ContractSignerLayout): string {
  return JSON.stringify(layout);
}

export function resolveSlotPositions(
  slot: SignerLayoutSlot,
  pageCount: number
): AutentiquePosition[] {
  const elements = buildElementsFromSlot(slot);
  return elements.map((el) => ({
    element: el.element,
    x: clampCoord(el.x, '50'),
    y: clampCoord(el.y, '90'),
    z: el.z === 'last' ? Math.max(1, pageCount) : Math.max(1, Number(el.z) || 1),
  }));
}

export function countEnabledSignerSlots(layout: ContractSignerLayout | null | undefined): number {
  if (!layout) return 0;
  return layout.slots.filter((s) => s.enabled !== false).length;
}

export function applyLayoutToSigners(
  signers: SignerInput[],
  layout: ContractSignerLayout | null | undefined,
  pageCount: number
): SignerInput[] {
  if (!layout) return signers;
  const activeSlots = layout.slots.filter((s) => s.enabled !== false);
  return signers.map((signer, index) => {
    const slot = activeSlots[index];
    if (!slot) return signer;
    return {
      ...signer,
      positions: resolveSlotPositions(slot, pageCount),
    };
  });
}
