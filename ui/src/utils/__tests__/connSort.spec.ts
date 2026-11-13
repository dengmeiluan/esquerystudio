/**
 * 五百九十七批：集群切换器列表排序（用户实报：连接列表异常与正常混排，默认应按状态
 * 分类且可调排序）。纯函数——ClusterSwitcher 管理面板与快速菜单共用同一排序真源。
 *
 * 语义：
 * - 'status'（默认）：异常（RED/未知）置顶、健康（GREEN）沉底，组内按名称升序——运维
 *   视角先看坏的；
 * - 'name'：纯名称升序（历史行为可回退）；
 * - 'latency'：时延升序，异常/无时延沉底（健康的排前面才有时延可比性）。
 * 排序为纯展示层，不修改入参数组。
 */
import { describe, it, expect } from 'vitest';
import { sortConns, type SortMode, type SortableConn } from '../../utils/connSort';

const conn = (over: Partial<SortableConn>): SortableConn => ({
  id: 'x', name: 'x', health: { status: 'GREEN', latencyMs: 20 }, ...over,
} as SortableConn);

const names = (cs: SortableConn[]) => cs.map(c => c.name);

describe('sortConns：status 模式（默认）', () => {
  it('异常置顶、健康沉底，组内名称升序', () => {
    const cs = [
      conn({ id: '1', name: '生产集群', health: { status: 'GREEN', latencyMs: 15 } }),
      conn({ id: '2', name: 'es_preview', health: { status: 'RED' } }),
      conn({ id: '3', name: 'es_example_staging', health: { status: 'RED' } }),
      conn({ id: '4', name: 'es_price', health: { status: 'GREEN', latencyMs: 22 } }),
    ];
    const out = sortConns(cs, 'status');
    expect(names(out)).toEqual(['es_example_staging', 'es_preview', 'es_price', '生产集群']);
    expect(out).not.toBe(cs); /* 纯函数：不改入参 */
  });
  it('无 health/未知状态按异常组处理（看不见的状态更要置顶排查）', () => {
    const cs = [
      conn({ id: '1', name: 'ok', health: { status: 'GREEN', latencyMs: 10 } }),
      conn({ id: '2', name: 'no-health' }),
    ];
    expect(names(sortConns(cs, 'status'))).toEqual(['no-health', 'ok']);
  });
});

describe('sortConns：name 模式', () => {
  it('纯名称升序（历史顺序可回退）', () => {
    const cs = [
      conn({ id: '1', name: '腾讯云QA', health: { status: 'GREEN', latencyMs: 21 } }),
      conn({ id: '2', name: 'es_excel_conn', health: { status: 'RED' } }),
    ];
    expect(names(sortConns(cs, 'name'))).toEqual(['es_excel_conn', '腾讯云QA']);
  });
});

describe('sortConns：latency 模式', () => {
  it('健康按时延升序，异常/无时延沉底', () => {
    const cs = [
      conn({ id: '1', name: 'slow', health: { status: 'GREEN', latencyMs: 90 } }),
      conn({ id: '2', name: 'fast', health: { status: 'GREEN', latencyMs: 12 } }),
      conn({ id: '3', name: 'dead', health: { status: 'RED' } }),
    ];
    expect(names(sortConns(cs, 'latency'))).toEqual(['fast', 'slow', 'dead']);
  });
});

describe('sortConns：边界', () => {
  it('空数组返回空数组', () => {
    expect(sortConns([], 'status')).toEqual([]);
  });
  it('非法 mode 回落 status（usePref 脏值容错）', () => {
    const cs = [conn({ id: '1', name: 'ok', health: { status: 'GREEN', latencyMs: 10 } }), conn({ id: '2', name: 'bad', health: { status: 'RED' } })];
    expect(names(sortConns(cs, 'bogus' as SortMode))).toEqual(['bad', 'ok']);
  });
});

/* ═══ 六百二十五批：手动档（623 设计稿 D3/D4 用户裁决「同意推荐」落码）═══
   sortConns 增 'manual' 档：按 manualOrder 序排列，不在序中的连接沉底（组内名称升序——
   新添加连接未入序时自然排尾）；moveInOrder 纯函数承担拖拽落位与 Ctrl+↑/↓ 键盘移位的
   共用落位语义（越界钳位、幂等、不改入参）。 */
import { moveInOrder, normalizeSortMode } from '../../utils/connSort';

describe('sortConns：manual 模式（625 批）', () => {
  it('按 manualOrder 序排列；不在序中的连接沉底（组内名称升序）', () => {
    const cs = [
      conn({ id: 'a', name: 'alpha' }),
      conn({ id: 'b', name: 'bravo' }),
      conn({ id: 'c', name: 'charlie' }),
      conn({ id: 'z', name: 'zulu' }),
    ];
    const out = sortConns(cs, 'manual', ['c', 'a']);
    expect(names(out)).toEqual(['charlie', 'alpha', 'bravo', 'zulu']);
  });
  it('manualOrder 缺省=名称升序兜底（脏 usePref 容错）', () => {
    const cs = [conn({ id: 'b', name: 'bravo' }), conn({ id: 'a', name: 'alpha' })];
    expect(names(sortConns(cs, 'manual'))).toEqual(['alpha', 'bravo']);
  });
  it('纯函数：不改入参数组', () => {
    const cs = [conn({ id: 'b', name: 'bravo' }), conn({ id: 'a', name: 'alpha' })];
    sortConns(cs, 'manual', ['b', 'a']);
    expect(cs.map(c => c.id)).toEqual(['b', 'a']);
  });
});

describe('normalizeSortMode：manual（625 批）', () => {
  it("合法 manual 透传，非法值仍回落 'status'", () => {
    expect(normalizeSortMode('manual')).toBe('manual');
    expect(normalizeSortMode('latency')).toBe('latency');
    expect(normalizeSortMode('bogus')).toBe('status');
  });
});

describe('moveInOrder（625 批：拖拽落位与 Ctrl+↑/↓ 键盘移位共用纯函数）', () => {
  it('id 移到目标下标（目标位前插）', () => {
    expect(moveInOrder(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('越界钳位（负值 → 插到最前；超出 → 队尾）', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'c', -5)).toEqual(['c', 'a', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
  });
  it('幂等且不改入参、不丢项', () => {
    const order = ['a', 'b', 'c'];
    expect(moveInOrder(order, 'b', 1)).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
