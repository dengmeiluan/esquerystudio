/* 1443：自定义列表行的 ↑/↓/Home/End 导航（行内输入控件让路）。 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rowArrowNav } from '../utils/rowNav';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const rowsHost = document.createElement('div');
document.body.appendChild(rowsHost);

afterEach(() => { rowsHost.innerHTML = ''; });

function buildRows(n = 3): HTMLElement[] {
  const rows = Array.from({ length: n }, (_, i) => {
    const r = document.createElement('div');
    r.setAttribute('data-row-nav', '');
    r.tabIndex = 0;
    r.textContent = 'row-' + i;
    rowsHost.appendChild(r);
    return r;
  });
  return rows;
}
const key = (k: string, currentTarget: HTMLElement) => {
  let prevented = false;
  rowArrowNav({ key: k, currentTarget, preventDefault: () => { prevented = true; } } as any);
  return prevented;
};

describe('1443 行导航 helper', () => {
  it('↑/↓ 移动、Home/End 首末，边界不越界', () => {
    const rows = buildRows(3);
    rows[1].focus();
    expect(key('ArrowDown', rows[1])).toBe(true);
    expect(document.activeElement).toBe(rows[2]);
    key('ArrowDown', rows[2]);
    expect(document.activeElement, '末行 ↓ 不越界').toBe(rows[2]);
    key('Home', rows[2]);
    expect(document.activeElement).toBe(rows[0]);
    key('ArrowUp', rows[0]);
    expect(document.activeElement, '首行 ↑ 不越界').toBe(rows[0]);
    key('End', rows[0]);
    expect(document.activeElement).toBe(rows[2]);
  });

  it('非导航键不拦截；单选行/无容器不动', () => {
    const rows = buildRows(2);
    rows[0].focus();
    expect(key('Enter', rows[0]), 'Enter 不拦截').toBe(false);
    expect(document.activeElement).toBe(rows[0]);
    const lone = document.createElement('div');
    lone.setAttribute('data-row-nav', '');
    lone.tabIndex = 0;
    const orphanHost = document.createElement('div');
    orphanHost.appendChild(lone);
    document.body.appendChild(orphanHost);
    lone.focus();
    key('ArrowDown', lone);
    expect(document.activeElement, '单行保持焦点').toBe(lone);
    orphanHost.remove();
  });

  it('嵌套行不混入：组头 ↓ 不跳进组内嵌套行', () => {
    const group = document.createElement('div');
    group.className = 'g';
    const hd = document.createElement('div');
    hd.setAttribute('data-row-nav', '');
    hd.tabIndex = 0;
    const inner = document.createElement('div');
    const row = document.createElement('div');
    row.setAttribute('data-row-nav', '');
    row.tabIndex = 0;
    inner.appendChild(row);
    group.append(hd, inner);
    rowsHost.appendChild(group);
    hd.focus();
    key('ArrowDown', hd);
    expect(document.activeElement, '组头无同级行时保持焦点').toBe(hd);
  });

  it('索引别名芯片：可聚焦按钮语义 + Enter/Space 双键', () => {
    const s = src('components/IndexOptionRow.vue');
    expect(s).toContain('tabindex="0" role="button"');
    expect(s).toContain(`@keydown.enter.prevent="emit('select-alias', a)"`);
    expect(s).toContain(`@keydown.space.prevent="emit('select-alias', a)"`);
  });

  it('源码锁：核心自定义行都接同一行导航（data-row-nav + .self）', () => {
    const files = [
      'views/TasksView.vue', 'views/SnapshotsView.vue', 'views/HealthReportView.vue',
      'views/WatcherView.vue', 'views/TemplatesView.vue', 'views/IlmView.vue',
      'views/LifecycleView.vue', 'views/SlmView.vue', 'views/RemoteClustersView.vue',
      'views/FavoritesView.vue', 'views/SearchTemplatesView.vue', 'views/TemplateGalleryView.vue',
      'views/TaskTreeView.vue', 'views/DiagView.vue', 'views/BulkEditorView.vue',
      'views/ProfileFlameView.vue', 'views/QueryXrayView.vue', 'views/ScoreExplainView.vue',
      'views/SearchSandboxView.vue', 'views/AliasesView.vue',
      'components/QueryHistoryPanel.vue', 'components/SettingsGrid.vue',
      'views/IndexOptimizerView.vue', 'views/ConfigValidatorView.vue', 'views/DiffEditorView.vue',
      'views/AnalysisSettingsView.vue', 'views/AdhocRebuildView.vue', 'views/DevToolsView.vue',
      'views/OverviewView.vue', 'views/LiveDashboardView.vue', 'views/ConfigDriftView.vue',
      'components/AltHitsViews.vue',
    ];
    for (const f of files) {
      const s = src(f);
      expect(s, `${f} 缺 data-row-nav`).toContain('data-row-nav');
      expect(s, `${f} 缺 rowArrowNav 接线`).toContain('@keydown.self="rowArrowNav"');
      expect(s, `${f} 未导入 rowNav`).toContain("utils/rowNav");
    }
  });
});
