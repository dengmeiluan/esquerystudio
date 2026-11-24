/**
 * 字节换算与千分位单源看守（fmtAndTimeUnify1120）。
 *
 * 静态锁：展示用字节换算统一委托 utils/format 的 fmtSize——已迁移文件源码中不再出现
 *  /1024、1024 **、* 1024 形式的手搓换算字面量。字节容量常量（REST_RESP_MAX /
 *  DEVTOOLS_RESP_MAX / MAX_SEGMENT_TARGET_BYTES）是容量定义而非展示换算，按整行白名单
 *  放行（restTruncW2/devtoolsRespGuard326 另有源码锁钉住这些常量本身）。
 *  千分位：TasksView 不再自带 'en-US' locale 字面量，统一委托 fmtNum（输出形态不变）。
 *
 * 行为锁：fmtSize 档位边界输出形态（B 档直出 / B→KB 跨界 / MB 档 / GB 档），保证各页面
 *  展示与单源一致；fmtNum 千分位形态是 TasksView 进度 title 等价迁移的依据。
 *  旧形态负向断言防回潮（truncKb / 1048576 字面量 / 本地 fmtBytes 克隆）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtSize, fmtNum } from '../utils/format';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

/** 手搓换算字面量三形：除法归一 / 幂运算 / 乘法放大 */
const HAND_ROLLED = /\/\s*1024\b|1024\s*\*\*|\*\s*1024\b/;
/** 容量上限常量整行（容量定义，非展示换算——白名单）。
    REST_RESP_MAX / DEVTOOLS_RESP_MAX 已改直书数值 524288（512KiB），不再属白名单 */
const CAP_CONSTS = [
  /^export const MAX_SEGMENT_TARGET_BYTES = 5 \* 1024 \* 1024 \* 1024;$/,
];

function assertNoHandRolled(rel: string, fileLabel: string): void {
  const dirty = read(rel)
    .split('\n')
    .map((ln) => ln.trim())
    .filter((ln) => HAND_ROLLED.test(ln) && !CAP_CONSTS.some((re) => re.test(ln)));
  expect(dirty, `${fileLabel} 出现手搓 1024 换算（应走 fmtSize 单源）：\n${dirty.join('\n')}`).toEqual([]);
}

describe('fmtAndTimeUnify1120 · 字节换算单源静态锁', () => {
  it('RestView：无手搓换算字面量；容量常量仍在；旧 truncKb 形态不回潮', () => {
    assertNoHandRolled('views/RestView.vue', 'RestView.vue');
    const v = read('views/RestView.vue');
    expect(v, '512KiB 截断容量常量必须保留（restTruncW2 同口径）').toContain('const REST_RESP_MAX = 524288;');
    expect(v, '512 * 1024 手搓乘法形态不回潮').not.toContain('const REST_RESP_MAX = 512 * 1024;');
    expect(v, 'truncKb 手搓 KB 换算不应回潮').not.toContain('truncKb');
    expect(v, '体积标签须走 fmtSize').toContain('fmtSize');
  });

  it('IndexOptimizerView：无手搓换算字面量；确认文案体积走 fmtSize', () => {
    assertNoHandRolled('views/IndexOptimizerView.vue', 'IndexOptimizerView.vue');
    expect(read('views/IndexOptimizerView.vue')).toContain('fmtSize(adv.shardSizeBytes)');
  });

  it('OverviewView：本地 fmtBytes 克隆退役，storeSizeFmt 走 fmtSize', () => {
    assertNoHandRolled('views/OverviewView.vue', 'OverviewView.vue');
    const v = read('views/OverviewView.vue');
    expect(v, '本地字节档位表不应回潮').not.toContain('function fmtBytes');
    expect(v).toContain('splitSize(fmtSize(totalSize.value))');
  });

  it('DevToolsView：1048576 手搓 MB 换算退役，截断体积标签走 fmtSize', () => {
    assertNoHandRolled('views/DevToolsView.vue', 'DevToolsView.vue');
    const v = read('views/DevToolsView.vue');
    expect(v, '1048576 换算字面量不应回潮').not.toContain('1048576');
    expect(v, '512KiB 截断容量常量必须保留（devtoolsRespGuard326 同口径）').toContain('const DEVTOOLS_RESP_MAX = 524288;');
    expect(v, '512 * 1024 手搓乘法形态不回潮').not.toContain('const DEVTOOLS_RESP_MAX = 512 * 1024;');
    expect(v).toContain('fmtSize(txt.length)');
  });

  it('segmentAdvice：GB 幂运算换算退役，建议文案体积走 fmtSize', () => {
    assertNoHandRolled('composables/segmentAdvice.ts', 'segmentAdvice.ts');
    expect(read('composables/segmentAdvice.ts')).toContain('fmtSize(shardSizeBytes)');
  });

  it('TasksView：不再含 en-US locale 字面量（千分位委托 fmtNum）', () => {
    const v = read('views/TasksView.vue');
    expect(v, "TasksView 不应自带 'en-US' 字面量").not.toContain("'en-US'");
    expect(v, '页内 toLocaleString 应由 fmtNum 单源承接').not.toContain('.toLocaleString(');
    expect(v).toContain('fmtNum(done)');
  });
});

describe('fmtAndTimeUnify1120 · fmtSize 档位边界行为锁', () => {
  it('B 档整数直出（含上边界 1023）', () => {
    expect(fmtSize(512)).toBe('512b');
    expect(fmtSize(1023)).toBe('1023b');
  });

  it('B→KB 跨界：1024 落 KB 档一位小数', () => {
    expect(fmtSize(1024)).toBe('1.0kb');
    expect(fmtSize(614422)).toBe('600.0kb'); /* RestView 截断徽标实际口径 */
  });

  it('MB / GB 档形态（IndexOptimizer/segmentAdvice 确认文案口径）', () => {
    expect(fmtSize(3 * 1024 * 1024)).toBe('3.0mb');
    expect(fmtSize(34.5 * 1024 ** 3)).toBe('34.5gb');
  });
});

describe('fmtAndTimeUnify1120 · fmtNum 千分位行为锁（TasksView title 等价迁移依据）', () => {
  it('千分位输出与原 toLocaleString(en-US) 逐字一致', () => {
    expect(fmtNum(1200)).toBe('1,200');
    expect(fmtNum(5000)).toBe('5,000');
    expect(fmtNum(1000)).toBe('1,000');
  });
});
