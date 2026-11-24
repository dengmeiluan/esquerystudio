/**
 * 1439：两张结果表内核的能力对位守卫。
 *
 * 用户反复问「为什么索引工作区、查询工作台、SQL 的表格能力没有完全共享」。
 * 1378 之后两内核已各自补齐，但**没有任何测试锁住「两边都有」**——
 * 任一侧删掉一个能力，只要它自己的单测还过，就发现不了。
 *
 * 这里按能力清单做双列对位：每一项必须在两个内核里都能找到实现痕迹。
 * 判据是「能力名 → 两个文件各自的正则」，不是逐字比实现（两内核高度可以不同）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf8');

/** 能力 → 每侧都必须出现的证据正则 */
const PARITY: Array<[string, RegExp]> = [
  ['列显隐（ColPicker）', /ColPicker/],
  ['列布局方案', /TablePresetMenu/],
  ['列筛选弹层', /useColFilters/],
  ['排序链', /useSortChain/],
  ['远端排序', /remoteSort/],
  ['排序字段可达性闸', /sortableGuard|resolveSortField/],
  ['行选反选', /反选/],
  ['框选（鼠标）', /isRegionCell|rt-region|qrt-region/],
  ['框选（触屏两点）', /touchAnchor/],
  ['已选计数', /已选/],
  ['单元格右键菜单', /CellContextMenu/],
  ['行详情抽屉', /rowDrawer/],
  ['复制整表 JSON', /复制整表 JSON/],
  ['复制整表 TSV', /TSV/],
  ['导出格式菜单', /导出当前视图|导出为/],
  ['PNG 快照', /snapshotTableToPng/],
  ['多格式导出装配', /buildExportSheets/],
  ['表格工具行壳', /TableShell/],
  ['列宽/行高偏好', /useTablePrefs/],
  ['语义格式化', /semFormat|useSemFormat/],
  ['快速过滤', /quickFilter|quick-filter/],
  ['内建搜索框', /searchable/],
  ['刷新通道', /refreshable/],
  ['行高密度三档', /compact.*cozy|cozy.*compact/s],
  ['填满父容器', /fill\?: boolean/],
];

function missing(src: string): string[] {
  return PARITY.filter(([, re]) => !re.test(src)).map(([name]) => name);
}

describe('1439 两张结果表能力对位', () => {
  it('清单本身不是空转（至少 20 项）', () => {
    expect(PARITY.length).toBeGreaterThanOrEqual(20);
  });

  it('每一项能力在两个内核里都存在', () => {
    const problems: string[] = [];
    const rtMissing = missing(RT);
    const qrtMissing = missing(QRT);
    if (rtMissing.length) problems.push('ResultTable 缺：' + rtMissing.join('、'));
    if (qrtMissing.length) problems.push('QueryResultTable 缺：' + qrtMissing.join('、'));
    expect(problems, '能力不对位：\n' + problems.join('\n')).toEqual([]);
  });

  it('负控：从任一侧删掉一项能力 → 判据必须报缺', () => {
    /* 逐项注入：把该项的证据文本从源码副本里抹掉，判据必须点名它 */
    const probes: Array<[string, string]> = [
      ['行选反选', '反选'],
      ['PNG 快照', 'snapshotTableToPng'],
      ['填满父容器', 'fill?: boolean'],
      ['列筛选弹层', 'useColFilters'],
    ];
    for (const [name, token] of probes) {
      const re = PARITY.find(([n]) => n === name)![1];
      /* 用字面量替换而不是 new RegExp：`fill?: boolean` 里的 ? 是正则量词 */
      const stripped = RT.split(token).join('REMOVED');
      expect(stripped, `负控「${name}」必须真的改掉源码`).not.toBe(RT);
      expect(re.test(stripped), `负控「${name}」未被判据抓住`).toBe(false);
    }
  });
});
