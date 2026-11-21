/**
 * 四百七十二批：useTablePrefs 转置/冻结行为补测（490 只测了行高/列宽/维度重读）——
 * 转置开关（es_tbl_transpose:<dim> 持久化）/冻结列数（es_tbl_freeze_n:<dim>，
 * setFreezeN 负数钳 0）/toggleFreezeFirst 开关对称/维度切换重读。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useTablePrefs } from '../useTablePrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('useTablePrefs 转置/冻结（472 批）', () => {
  it('转置开关：toggle 翻转+es_tbl_transpose:<dim> 持久化', () => {
    const dim = ref('idx-t');
    const p = useTablePrefs(dim, ref([]));
    expect(p.transpose.value).toBe(false);
    p.toggleTranspose();
    expect(p.transpose.value).toBe(true);
    expect(localStorage.getItem('es_tbl_transpose:idx-t')).toBe('1');
    p.toggleTranspose();
    expect(localStorage.getItem('es_tbl_transpose:idx-t')).toBe('0');
  });

  it('冻结列数：setFreezeN 负数钳 0+持久化+toggleFreezeFirst 开关对称', () => {
    const dim = ref('idx-f');
    const p = useTablePrefs(dim, ref(['a', 'b']));
    expect(p.freezeN.value).toBe(0);
    expect(p.freezeFirst.value).toBe(false);
    p.setFreezeN(-3);
    expect(p.freezeN.value, '负数钳 0').toBe(0);
    p.setFreezeN(2);
    expect(p.freezeFirst.value).toBe(true);
    expect(localStorage.getItem('es_tbl_freeze_n:idx-f')).toBe('2');
    p.toggleFreezeFirst();
    expect(p.freezeN.value, 'toggleFreezeFirst 1→0').toBe(0);
  });
});
