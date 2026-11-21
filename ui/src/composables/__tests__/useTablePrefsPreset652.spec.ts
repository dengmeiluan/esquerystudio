/**
 * 六百五十二批：useTablePrefs 列布局命名 preset（轨3 内核先行，dbx 式布局管理）。
 * 651 斥候还原本体：键族（es_cols/es_tbl_dense/rowh/w/transpose/freeze）只有「当前态」
 * 记忆、无命名 preset 体系。本件立法三操作契约：
 *   · save：当前布局八字段快照（v1）落槽位 es_tbl_preset:<dim>:<name> + 名册
 *     es_tbl_preset_list:<dim> 登记（同名覆盖、位置稳定）；
 *   · apply：快照回填当前态并经既有 setter/watch 落盘同步；快照列对当前 allCols
 *     失效列过滤（全失效则列选不动、其余偏好照常回填）；缺失/损坏快照 false 且
 *     当前态零污染；
 *   · delete：删名+删槽；不存在的名 false。
 * 维度隔离（A 档名 B 不可见不可 apply）+ 维度关闭三操作全 false 零落盘 + 维度切换
 * 名册重读 + 名校验（空串/纯空格 false，trim 后落册）。
 * ⚠消费面（工具行 ⋯/下拉收纳，铁律 C）接线下一批——本批内核先行零 UI 消费
 * （603 纪律），本 spec 即消费面接线时的行为契约。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useTablePrefs } from '../useTablePrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('useTablePrefs 列布局 preset（652 批内核先行）', () => {
  it('save：八字段快照落槽+名册登记列名（槽位键 es_tbl_preset:<dim>:<name>）', () => {
    const dim = ref('idx-652a');
    const p = useTablePrefs(dim, ref(['a', 'b', 'c']));
    p.visibleCols.value = ['a', 'c'];
    p.colWidths.value = { a: 200 };
    p.setRowH('cozy');
    p.setFreezeN(1);
    p.toggleTranspose();
    p.setTransposeN(5);
    expect(p.savePreset('审计宽列')).toBe(true);
    expect(JSON.parse(localStorage.getItem('es_tbl_preset_list:idx-652a') || '[]')).toEqual(['审计宽列']);
    const snap = JSON.parse(localStorage.getItem('es_tbl_preset:idx-652a:审计宽列') || '{}');
    expect(snap.v).toBe(1);
    expect(snap.cols).toEqual(['a', 'c']);
    expect(snap.widths).toEqual({ a: 200 });
    expect(snap.rowH).toBe('cozy');
    expect(snap.dense).toBe(false);
    expect(snap.transpose).toBe(true);
    expect(snap.transposeN).toBe(5);
    expect(snap.freezeN).toBe(1);
    expect(p.presets.value).toEqual(['审计宽列']);
  });

  it('save 同名覆盖：名册位置稳定不重复，槽位内容更新', () => {
    const dim = ref('idx-652b');
    const p = useTablePrefs(dim, ref(['a', 'b']));
    p.savePreset('P');
    p.visibleCols.value = ['b'];
    expect(p.savePreset('P')).toBe(true);
    expect(JSON.parse(localStorage.getItem('es_tbl_preset_list:idx-652b') || '[]')).toEqual(['P']);
    expect(JSON.parse(localStorage.getItem('es_tbl_preset:idx-652b:P') || '{}').cols).toEqual(['b']);
    expect(p.presets.value).toEqual(['P']);
  });

  it('apply：改乱当前态后逐项还原+落盘键同步', async () => {
    const dim = ref('idx-652c');
    const p = useTablePrefs(dim, ref(['a', 'b', 'c']));
    p.visibleCols.value = ['a', 'c'];
    p.colWidths.value = { a: 200 };
    p.setRowH('cozy');
    p.setFreezeN(1);
    p.toggleTranspose();
    p.setTransposeN(5);
    p.savePreset('基准');
    // 改乱当前态
    p.visibleCols.value = ['b'];
    p.colWidths.value = { b: 300 };
    p.setRowH('compact');
    p.setFreezeN(0);
    p.toggleTranspose(); // true → false
    p.setTransposeN(1);
    await nextTick();
    expect(p.applyPreset('基准')).toBe(true);
    expect(p.visibleCols.value).toEqual(['a', 'c']);
    expect(p.colWidths.value).toEqual({ a: 200 });
    expect(p.rowH.value).toBe('cozy');
    expect(p.freezeN.value).toBe(1);
    expect(p.transpose.value).toBe(true);
    expect(p.transposeN.value).toBe(5);
    await nextTick(); // watch 驱动键（es_cols/es_tbl_w）落盘同步
    expect(JSON.parse(localStorage.getItem('es_cols:idx-652c') || '[]')).toEqual(['a', 'c']);
    expect(JSON.parse(localStorage.getItem('es_tbl_w:idx-652c') || '{}')).toEqual({ a: 200 });
    expect(localStorage.getItem('es_tbl_rowh')).toBe('cozy');
    expect(localStorage.getItem('es_tbl_freeze_n:idx-652c')).toBe('1');
    expect(localStorage.getItem('es_tbl_transpose_n:idx-652c')).toBe('5');
    expect(localStorage.getItem('es_tbl_dense')).toBe('0');
  });

  it('apply 不存在/损坏快照：false 且当前态不被破坏', () => {
    const dim = ref('idx-652d');
    const p = useTablePrefs(dim, ref(['a', 'b']));
    p.visibleCols.value = ['a'];
    expect(p.applyPreset('不存在')).toBe(false);
    expect(p.visibleCols.value).toEqual(['a']);
    localStorage.setItem('es_tbl_preset:idx-652d:坏档', '{oops');
    expect(p.applyPreset('坏档')).toBe(false);
    expect(p.visibleCols.value).toEqual(['a']);
  });

  it('apply：快照列含失效列时过滤回填（防陈旧列污染渲染）', () => {
    const dim = ref('idx-652e');
    const p = useTablePrefs(dim, ref(['a', 'b', 'c']));
    p.visibleCols.value = ['a', 'c'];
    p.savePreset('带陈旧列');
    const raw = JSON.parse(localStorage.getItem('es_tbl_preset:idx-652e:带陈旧列') || '{}');
    raw.cols = ['a', 'ghost', 'c'];
    localStorage.setItem('es_tbl_preset:idx-652e:带陈旧列', JSON.stringify(raw));
    p.visibleCols.value = ['b'];
    expect(p.applyPreset('带陈旧列')).toBe(true);
    expect(p.visibleCols.value).toEqual(['a', 'c']);
  });

  it('apply：快照列全失效则列选保持不动，其余偏好照常回填', () => {
    const dim = ref('idx-652f');
    const p = useTablePrefs(dim, ref(['a', 'b']));
    p.setRowH('cozy');
    p.savePreset('全失效');
    const raw = JSON.parse(localStorage.getItem('es_tbl_preset:idx-652f:全失效') || '{}');
    raw.cols = ['ghost1', 'ghost2'];
    localStorage.setItem('es_tbl_preset:idx-652f:全失效', JSON.stringify(raw));
    p.visibleCols.value = ['a'];
    p.setRowH('compact');
    expect(p.applyPreset('全失效')).toBe(true);
    expect(p.visibleCols.value).toEqual(['a']);
    expect(p.rowH.value).toBe('cozy');
  });

  it('delete：删名+删槽+名册同步；不存在的名 false', () => {
    const dim = ref('idx-652g');
    const p = useTablePrefs(dim, ref(['a']));
    p.savePreset('临时');
    expect(p.deletePreset('临时')).toBe(true);
    expect(p.presets.value).toEqual([]);
    expect(localStorage.getItem('es_tbl_preset:idx-652g:临时')).toBe(null);
    expect(localStorage.getItem('es_tbl_preset_list:idx-652g')).toBe('[]');
    expect(p.deletePreset('临时')).toBe(false);
  });

  it('维度隔离：A 维度存的名 B 维度看不见也 apply/delete 不到', async () => {
    const dim = ref('idx-652h-a');
    const p = useTablePrefs(dim, ref(['a']));
    p.savePreset('A档');
    dim.value = 'idx-652h-b';
    await nextTick(); // 维度 watch 重读名册
    expect(p.presets.value).toEqual([]);
    expect(p.applyPreset('A档')).toBe(false);
    expect(p.deletePreset('A档')).toBe(false);
  });

  it('维度关闭（null）：三操作全 false、名册空、零落盘', () => {
    const dim = ref<string | null>(null);
    const p = useTablePrefs(dim, ref(['a']));
    expect(p.presets.value).toEqual([]);
    expect(p.savePreset('x')).toBe(false);
    expect(p.applyPreset('x')).toBe(false);
    expect(p.deletePreset('x')).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('名校验：空串/纯空格 false 不落盘；trim 后落册；名册损坏回落空册可重建', () => {
    const dim = ref('idx-652i');
    const p = useTablePrefs(dim, ref(['a']));
    expect(p.savePreset('')).toBe(false);
    expect(p.savePreset('   ')).toBe(false);
    expect(p.savePreset('  夹心空白  ')).toBe(true);
    expect(p.presets.value).toEqual(['夹心空白']);
    localStorage.clear();
    localStorage.setItem('es_tbl_preset_list:idx-652i', '{oops');
    const q = useTablePrefs(dim, ref(['a']));
    expect(q.presets.value).toEqual([]);
    expect(q.savePreset('正常')).toBe(true);
    expect(JSON.parse(localStorage.getItem('es_tbl_preset_list:idx-652i') || '[]')).toEqual(['正常']);
  });
});
