import { describe, expect, it } from 'vitest';
import {
  clampPaneSize,
  distributePreset,
  getViewportProfile,
  migrateLegacySplit,
  type PaneConstraint,
} from '../utils/layout';

const pane: PaneConstraint = { id: 'request', min: 240, max: 720, defaultSize: 360 };

describe('layout pure functions', () => {
  it('clamps invalid, below-min and above-max sizes', () => {
    expect(clampPaneSize(Number.NaN, pane, 900)).toBe(360);
    expect(clampPaneSize(80, pane, 900)).toBe(240);
    expect(clampPaneSize(900, pane, 900)).toBe(720);
  });

  it('uses available space when max is not reachable', () => {
    expect(clampPaneSize(600, { id: 'response', min: 240, max: 'available', defaultSize: 360 }, 500)).toBe(500);
  });

  it('creates deterministic presets without violating minimums', () => {
    expect(distributePreset('equal', 1000, [
      { id: 'request', min: 240, defaultSize: 360 },
      { id: 'response', min: 240, defaultSize: 420 },
    ])).toEqual({ request: 500, response: 500 });
    expect(distributePreset('editor-first', 700, [
      { id: 'editor', min: 240, defaultSize: 360 },
      { id: 'result', min: 240, defaultSize: 420 },
    ])).toEqual({ editor: 460, result: 240 });
  });

  /* 五百一十九批：reservedMin——flex 兄弟的 min 保留 + 「结果优先」反向语义。
     存在 flex pane（reservedMin>0）时：编辑优先把 sized 压到各自上界且合计为 flex 留 min；
     结果优先反向（sized 全部压到 min，余量让给 flex）；无 flex 时维持旧分布。 */
  it('reserves flex sibling min and reverses result-first when flex exists', () => {
    const panes: PaneConstraint[] = [
      { id: 'tree', min: 320, defaultSize: 560, max: 400 },
      { id: 'aux', min: 240, defaultSize: 300, max: 320 },
    ];
    expect(distributePreset('editor-first', 1000, panes, { reservedMin: 360 })).toEqual({ tree: 400, aux: 240 });
    expect(distributePreset('result-first', 1000, panes, { reservedMin: 360 })).toEqual({ tree: 320, aux: 240 });
    expect(distributePreset('equal', 1000, panes, { reservedMin: 360 })).toEqual({ tree: 320, aux: 320 });
    expect(distributePreset('result-first', 1000, panes), '无 flex 时维持「后一 pane 优先」旧行为')
      .toEqual({ tree: 400, aux: 320 });
  });

  it('classifies embedded, compact, standard and wide containers', () => {
    expect(getViewportProfile(866, 700)).toBe('embedded');
    expect(getViewportProfile(1000, 700)).toBe('compact');
    expect(getViewportProfile(1280, 700)).toBe('standard');
    expect(getViewportProfile(1920, 900)).toBe('wide');
  });

  it('migrates the existing query-builder split once', () => {
    expect(migrateLegacySplit('560', 'query-builder.tree')).toEqual({ size: 560, source: 'legacy' });
    expect(migrateLegacySplit(null, 'query-builder.tree')).toBeNull();
  });
});
