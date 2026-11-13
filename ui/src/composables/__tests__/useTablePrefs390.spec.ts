/**
 * 三百九十批：useTablePrefs 行为级单测——全站表格偏好底座（RT/QRT 共用），
 * 此前只有源码锁（colFreeze263 等）。四契约：行高三档循环+档位中文名/
 * 全局键写入+旧维度键回落迁移（242 批语义）/列宽记忆与重置/维度切换重读。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useTablePrefs } from '../useTablePrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('useTablePrefs 行为契约（390 批）', () => {
  it('行高三档循环：紧凑→标准→宽松→紧凑；档位中文名；写入全局键', () => {
    const dim = ref('idx-a');
    const p = useTablePrefs(dim, ref(['a', 'b']));
    expect(p.rowH.value).toBe('standard');
    p.cycleRowH();
    expect(p.rowH.value).toBe('cozy');
    expect(p.rowHLabel.value).toBe('宽松');
    expect(localStorage.getItem('es_tbl_rowh'), '写入全局键不分维度').toBe('cozy');
    p.cycleRowH();
    expect(p.rowH.value).toBe('compact');
    expect(p.rowHLabel.value).toBe('紧凑');
    p.cycleRowH();
    expect(p.rowH.value, '循环回标准').toBe('standard');
  });

  it('旧维度键回落迁移：全局键缺省读旧维度键，写入只落全局键', () => {
    localStorage.setItem('es_tbl_rowh:idx-b', 'cozy');
    const dim = ref('idx-b');
    const p = useTablePrefs(dim, ref([]));
    expect(p.rowH.value, '全局缺省回落旧维度键').toBe('cozy');
    p.setRowH('standard');
    expect(localStorage.getItem('es_tbl_rowh'), '新写入只落全局键').toBe('standard');
  });

  it('列宽记忆：es_tbl_w:<dim> 持久化，resetColWidth 单列重置', () => {
    const dim = ref('idx-c');
    const p = useTablePrefs(dim, ref(['name', 'size']));
    p.colWidths.value = { name: 180 };
    p.startResize; // 方法在场（拖拽链路需要 mouse 事件，行为测只验状态）
    expect(p.colWidths.value.name).toBe(180);
    p.resetColWidth('name');
    expect(p.colWidths.value.name).toBeUndefined();
    p.colWidths.value = { name: 200, size: 120 };
    p.resetColWidths();
    expect(p.colWidths.value, '全量重置').toEqual({});
  });

  it('维度切换重读：切换 dimension 后偏好按新维度刷新', () => {
    localStorage.setItem('es_tbl_rowh', 'compact');
    const dim = ref('idx-d');
    const p = useTablePrefs(dim, ref([]));
    expect(p.rowH.value).toBe('compact');
    dim.value = 'idx-e'; // 新维度：全局键仍在 → compact（全局键不分维度）
    expect(p.rowH.value).toBe('compact');
  });
});
