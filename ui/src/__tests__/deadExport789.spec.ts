import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 七百八十九批·死码域续程=composables 域死导出清零（deadExport789）。
 * Phase 0 四折修正扫描器分型（118 export 符号）：产品活 94+spec 孤儿 0
 *   +内部活 20（同文件自用，export 关键字冗余非死码——类型 19+useHitScroll 值 1）
 *   +真死 2（useLayoutPreferences LayoutPreferences/LayoutSnapshotRef：
 *   零产品消费+零自用+零 spec 文本锁〔legacyKeyCleanup350 锁的是 esquerystudio_qb_split
 *   迁移串〕——ReturnType 别名与 Ref 别名均为「声明即终点」形态）。
 * 刀A=真死 2 type 整删+type Ref import 孤儿清理；
 * 刀B=内部活 20 处去 export 关键字（typecheck 0=零漏判铁证）；
 * 文本锁 1 把前置同步更新（tableKernelWave534:97 export interface SemFmtOpts→^interface 行锚）。 */

const C = (f: string) => readFileSync(resolve(__dirname, '../composables/' + f), 'utf8');

/* 刀B 名单：[文件, export 前缀正则（去后形态断言）, 本体保留正则] */
const REDUNDANT: Array<[string, RegExp, RegExp]> = [
  ['continuity.ts', /^export interface LastRoute /m, /^interface LastRoute /m],
  ['segmentAdvice.ts', /^export interface SegmentInput /m, /^interface SegmentInput /m],
  ['tableSort.ts', /^export interface SortChainKey /m, /^interface SortChainKey /m],
  ['tableSort.ts', /^export interface UseSortChainOpts /m, /^interface UseSortChainOpts \{/m],
  ['useAliases.ts', /^export interface AliasEntry /m, /^interface AliasEntry /m],
  ['useColFilters.ts', /^export interface ColRangeFilter /m, /^interface ColRangeFilter /m],
  ['useColFilters.ts', /^export interface ColFilterState /m, /^interface ColFilterState \{/m],
  ['useGridSearch.ts', /^export interface GridMatch /m, /^interface GridMatch /m],
  ['useHistAgg.ts', /^export interface HistAggOptions /m, /^interface HistAggOptions \{/m],
  ['useHitNav.ts', /^export function useHitScroll\(/m, /^function useHitScroll\(/m],
  ['useInputLint.ts', /^export type LintLevel /m, /^type LintLevel /m],
  ['useInputLint.ts', /^export interface InputLint /m, /^interface InputLint \{/m],
  ['useLayoutPreferences.ts', /^export interface PaneState /m, /^interface PaneState \{/m],
  ['useLayoutPreferences.ts', /^export interface LayoutSnapshot /m, /^interface LayoutSnapshot \{/m],
  ['usePopupList.ts', /^export type PopupListPlace /m, /^type PopupListPlace /m],
  ['usePopupList.ts', /^export type PopupListOpts</m, /^type PopupListOpts</m],
  ['useScopedDraft.ts', /^export interface ScopedDraft /m, /^interface ScopedDraft \{/m],
  ['useScopedDraft.ts', /^export interface ScopedDraftState</m, /^interface ScopedDraftState</m],
  ['useSemFormat.ts', /^export interface SemFmt /m, /^interface SemFmt \{/m],
  ['useSemFormat.ts', /^export interface SemFmtOpts /m, /^interface SemFmtOpts \{/m],
];

describe('789 composables 域死导出：真死 2 符号任何形态复发即红', () => {
  it('A1 useLayoutPreferences LayoutPreferences 退役（ReturnType 别名零消费）', () => {
    expect(C('useLayoutPreferences.ts')).not.toContain('LayoutPreferences = ReturnType');
  });

  it('A2 useLayoutPreferences LayoutSnapshotRef 退役（Ref 别名零消费）', () => {
    expect(C('useLayoutPreferences.ts')).not.toContain('LayoutSnapshotRef');
  });

  it('A3 type Ref import 孤儿清理（vue import 回落 ref 单符号）', () => {
    expect(C('useLayoutPreferences.ts')).toMatch(/^import \{ ref \} from 'vue';$/m);
    expect(C('useLayoutPreferences.ts')).not.toMatch(/type Ref[,}]/);
  });

  it('A4 内部活 20 处 export 前缀清零（符号本体保留，仅去关键字）', () => {
    for (const [f, dead, alive] of REDUNDANT) {
      const s = C(f);
      expect(s, `${f} export 前缀应清零`).not.toMatch(dead);
      expect(s, `${f} 本体声明应保留`).toMatch(alive);
    }
  });

  it('B1 活锚：useLayoutPreferences 三活导出在场（layoutStorageKey/createLayoutPreferences/LayoutScope）', () => {
    const s = C('useLayoutPreferences.ts');
    expect(s).toMatch(/export function layoutStorageKey/);
    expect(s).toMatch(/export function createLayoutPreferences/);
    expect(s).toMatch(/export interface LayoutScope/);
  });

  it('B2 活锚：semFormat 函数 export+签名链在（qrtKernel530 同锚口径）', () => {
    const s = C('useSemFormat.ts');
    expect(s).toMatch(/export function semFormat\(/);
    expect(s).toMatch(/opts\?: SemFmtOpts/);
  });

  it('B3 活锚：useHitNav/useScopedDraft 主导出在场（useHitScroll 本体已私有仍可自用）', () => {
    expect(C('useHitNav.ts')).toMatch(/export function useHitNav/);
    expect(C('useScopedDraft.ts')).toMatch(/export function useScopedDraft\b/);
  });

  it('B4 活锚：pane 偏好消费面（WorkbenchLayout createLayoutPreferences import 在场）', () => {
    const w = readFileSync(resolve(__dirname, '../components/WorkbenchLayout.vue'), 'utf8');
    expect(w).toContain("import { createLayoutPreferences, type LayoutScope } from '../composables/useLayoutPreferences'");
  });
});
