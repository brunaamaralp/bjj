import { describe, it, expect } from 'vitest';
import {
  planDuplicateParentCleanup,
  planDuplicateParentMerge,
  buildVariantCountByParent,
  compareParentsForCanonical,
} from '../../../lib/server/cleanupDuplicateProductParents.js';

describe('cleanupDuplicateProductParents', () => {
  it('buildVariantCountByParent conta por product_id', () => {
    const map = buildVariantCountByParent([
      { product_id: 'p1' },
      { product_id: 'p1' },
      { product_id: 'p2' },
    ]);
    expect(map.get('p1')).toBe(2);
    expect(map.get('p2')).toBe(1);
  });

  it('prefere pai com mais variantes como canônico', () => {
    const counts = buildVariantCountByParent([
      { product_id: 'p1' },
      { product_id: 'p2' },
      { product_id: 'p2' },
    ]);
    const a = { $id: 'p1', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-01-01' };
    const b = { $id: 'p2', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-06-01' };
    expect(compareParentsForCanonical(a, b, counts)).toBeGreaterThan(0);
  });

  it('remove pais vazios duplicados e mantém o com variantes', () => {
    const plan = planDuplicateParentCleanup(
      [
        { $id: 'p1', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-01-01' },
        { $id: 'p2', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-02-01' },
        { $id: 'p3', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-03-01' },
      ],
      [{ product_id: 'p1' }, { product_id: 'p1' }]
    );

    expect(plan.toDelete.map((r) => r.id).sort()).toEqual(['p2', 'p3']);
    expect(plan.toDelete.every((r) => r.reason === 'duplicate_empty')).toBe(true);
    expect(plan.stats.parents_to_delete).toBe(2);
    expect(plan.warnings).toHaveLength(0);
  });

  it('quando todos estão vazios, mantém o mais antigo', () => {
    const plan = planDuplicateParentCleanup(
      [
        { $id: 'p-old', name: 'Faixa', academy_id: 'a1', created_at: '2023-01-01' },
        { $id: 'p-new', name: 'Faixa', academy_id: 'a1', created_at: '2024-01-01' },
      ],
      []
    );

    expect(plan.toDelete).toEqual([
      expect.objectContaining({ id: 'p-new', reason: 'duplicate_empty', canonical_id: 'p-old' }),
    ]);
  });

  it('não exclui pai duplicado que ainda tem variantes', () => {
    const plan = planDuplicateParentCleanup(
      [
        { $id: 'p1', name: 'Kimono', academy_id: 'a1' },
        { $id: 'p2', name: 'Kimono', academy_id: 'a1' },
      ],
      [{ product_id: 'p1' }, { product_id: 'p2' }]
    );

    expect(plan.toDelete).toHaveLength(0);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].id).toBe('p2');
  });

  it('não mistura academias diferentes', () => {
    const plan = planDuplicateParentCleanup(
      [
        { $id: 'p1', name: 'Kimono', academy_id: 'a1' },
        { $id: 'p2', name: 'Kimono', academy_id: 'a2' },
      ],
      []
    );

    expect(plan.toDelete).toHaveLength(0);
    expect(plan.stats.duplicate_name_groups).toBe(0);
  });

  it('includeSoloEmpty remove pai único sem variantes', () => {
    const plan = planDuplicateParentCleanup(
      [{ $id: 'p1', name: 'Órfão', academy_id: 'a1' }],
      [],
      { includeSoloEmpty: true }
    );

    expect(plan.toDelete).toEqual([expect.objectContaining({ id: 'p1', reason: 'solo_empty' })]);
  });
});

describe('planDuplicateParentMerge', () => {
  it('move variantes com combinação nova para o pai canônico', () => {
    const plan = planDuplicateParentMerge(
      [
        { $id: 'p1', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-01-01' },
        { $id: 'p2', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-02-01' },
      ],
      [
        { $id: 'v1', product_id: 'p1', size: 'M', color: '', current_quantity: 2 },
        { $id: 'v2', product_id: 'p2', size: 'G', color: '', current_quantity: 1 },
      ]
    );

    expect(plan.moves).toEqual([
      expect.objectContaining({ variant_id: 'v2', to_parent_id: 'p1', from_parent_id: 'p2' }),
    ]);
    expect(plan.merges).toHaveLength(0);
    expect(plan.deleteParents).toEqual([
      expect.objectContaining({ id: 'p2', canonical_id: 'p1', reason: 'duplicate_merged' }),
    ]);
  });

  it('soma saldo quando combinação já existe no canônico', () => {
    const plan = planDuplicateParentMerge(
      [
        { $id: 'p1', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-01-01' },
        { $id: 'p2', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-02-01' },
      ],
      [
        { $id: 'v1', product_id: 'p1', size: 'M', color: '', current_quantity: 2 },
        { $id: 'v2', product_id: 'p2', size: 'M', color: '', current_quantity: 3 },
      ]
    );

    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].patch.current_quantity).toBe(5);
    expect(plan.merges[0].patch.minimum_level).toBe(0);
    expect(plan.deleteVariants).toEqual([
      expect.objectContaining({ variant_id: 'v2', target_variant_id: 'v1' }),
    ]);
  });

  it('bloqueia fusão quando variante duplicada tem vendas', () => {
    const plan = planDuplicateParentMerge(
      [
        { $id: 'p1', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-01-01' },
        { $id: 'p2', name: 'Kimono', academy_id: 'a1', $createdAt: '2024-02-01' },
      ],
      [
        { $id: 'v1', product_id: 'p1', size: 'M', color: '', current_quantity: 2 },
        { $id: 'v2', product_id: 'p2', size: 'M', color: '', current_quantity: 3 },
      ],
      { saleCountsByVariantId: new Map([['v2', 1]]) }
    );

    expect(plan.merges).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.deleteParents.some((p) => p.id === 'p2')).toBe(false);
    expect(plan.parentsBlocked).toContain('p2');
  });
});
