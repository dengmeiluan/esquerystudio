/**
 * 七百二十六批（R107/G85）：useTablePrefs 坏形态键防御——es_cols:<dim> 存合法 JSON
 * 但非数组形态（对象/数字/null 字面）时，restoreCols 的 try-catch 只护 parse 语法错，
 * saved.filter 抛 TypeError 击穿渲染（725 批 probe 首跑 A-ERRORS 实锚，注释宣称
 * 「记录损坏回落默认前 8 列」与实现不符）。契约：坏形态一律回落默认列，与 652 批
 * readPresets 的 Array.isArray 范式同构。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useTablePrefs } from '../useTablePrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('useTablePrefs 坏形态键防御（726 批 G85）', () => {
  const cols = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];

  it('G85：es_cols 键合法 JSON 非数组（对象形态）→ 不抛 TypeError，回落默认前 8 列', () => {
    localStorage.setItem('es_cols:idx-bad', '{"a":1}');
    const p = useTablePrefs(ref('idx-bad'), ref(cols));
    expect(p.visibleCols.value).toEqual(cols.slice(0, 8));
  });

  it('G85：数字形态同样回落（JSON.parse 出 number 无 .filter）', () => {
    localStorage.setItem('es_cols:idx-bad', '42');
    const p = useTablePrefs(ref('idx-bad'), ref(cols));
    expect(p.visibleCols.value).toEqual(cols.slice(0, 8));
  });

  it('G85：维度切换 watch 链路——切进坏形态维度不炸，回落新维度默认列', async () => {
    localStorage.setItem('es_cols:idx-good', JSON.stringify(['c3', 'c1']));
    localStorage.setItem('es_cols:idx-bad', '{"a":1}');
    const dim = ref('idx-good');
    const p = useTablePrefs(dim, ref(cols));
    expect(p.visibleCols.value).toEqual(['c3', 'c1']);
    dim.value = 'idx-bad';
    await nextTick();
    expect(p.visibleCols.value, '坏形态维度回落默认前 8 列').toEqual(cols.slice(0, 8));
  });

  it('G85：坏形态回落同样触发 onColsReset（与正常回落语义一致）', () => {
    localStorage.setItem('es_cols:idx-bad', 'null');
    let reset = 0;
    useTablePrefs(ref('idx-bad'), ref(cols), { onColsReset: () => reset++ });
    expect(reset).toBe(1);
  });

  it('现状即守卫：非法 JSON（parse 语法错）被 catch 回落默认前 8 列', () => {
    localStorage.setItem('es_cols:idx-x', 'not-json');
    const p = useTablePrefs(ref('idx-x'), ref(cols));
    expect(p.visibleCols.value).toEqual(cols.slice(0, 8));
  });

  it('现状即守卫：合法数组恢复有效列，混入非字符串项被自然过滤', () => {
    localStorage.setItem('es_cols:idx-y', JSON.stringify(['c2', 42, 'nope', 'c9']));
    const p = useTablePrefs(ref('idx-y'), ref(cols));
    expect(p.visibleCols.value).toEqual(['c2', 'c9']);
  });
});
