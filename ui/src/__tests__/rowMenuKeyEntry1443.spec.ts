/**
 * 1443：自定义列表/卡片行的右键菜单补齐键盘入口。
 * 约定（docs/design.md「右键菜单覆盖面」）：新增右键面必须同时补键盘入口与速查面板登记。
 * 统一判据落在 utils/menuKey（ContextMenu 键 / Shift+F10，锚点取行盒左下角）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey } as KeyboardEvent);

/* 每个视图至少一条行级菜单键绑定（字符串精确到行内参数，防同名 handler 互相冒充） */
const ROWS: Array<[string, string]> = [
  ['views/TasksView.vue', '@keydown="onTaskMenuKey($event, t)"'],
  ['views/SnapshotsView.vue', '@keydown="onSnapMenuKey($event, s)"'],
  ['views/AliasesView.vue', '@keydown="onAliasMenuKey($event, g)"'],
  ['views/AliasesView.vue', '@keydown="onAliasRowMenuKey($event, g, r.index, r.isWriteIndex)"'],
  ['views/IndexHubView.vue', '@keydown="onIdxMenuKey($event, idx.index)"'],
  ['views/HealthReportView.vue', '@keydown="onCheckMenuKey($event, c)"'],
  ['views/WatcherView.vue', '@keydown="onWatchMenuKey($event, w)"'],
  ['views/TemplatesView.vue', '@keydown="onTplMenuKey($event, t)"'],
  ['views/IlmView.vue', '@keydown="onIlmMenuKey($event, p)"'],
  ['views/LifecycleView.vue', '@keydown="onLcMenuKey($event, p)"'],
  ['views/SlmView.vue', '@keydown="onSlmMenuKey($event, p)"'],
  ['views/RemoteClustersView.vue', '@keydown="onRcMenuKey($event, r)"'],
  ['views/FavoritesView.vue', '@keydown="onFavMenuKey($event, it)"'],
  ['views/SearchTemplatesView.vue', '@keydown="onTplMenuKey($event, t)"'],
  ['views/TemplateGalleryView.vue', '@keydown="onTgMenuKey($event, t)"'],
  ['views/TopologyView.vue', '@keydown="onShardKey($event, g, s, si)"'],
  ['views/ProfileFlameView.vue', '@keydown="onFlameMenuKey($event, n, i)"'],
  ['views/ConfigValidatorView.vue', '@keydown="onIssueMenuKey($event, iss)"'],
  ['views/DiffEditorView.vue', '@keydown="onLineMenuKey($event, l, i)"'],
  ['views/AdhocRebuildView.vue', '@keydown="onDiffMenuKey($event, row)"'],
  ['views/AdhocRebuildView.vue', '@keydown="onRoundMenuKey($event, r)"'],
  ['views/IndexOptimizerView.vue', '@keydown="onRecMenuKey($event, r)"'],
  ['views/AnalysisSettingsView.vue', '@keydown="onItemMenuKey($event, g.key, String(name), cfg)"'],
  ['views/DevToolsView.vue', '@keydown="onTabMenuKey($event, i)"'],
  ['views/DevToolsView.vue', '@keydown="onRespRowMenuKey($event, r, ri)"'],
  ['views/XmigrateView.vue', '@keydown="onJobMenuKey($event, rowJob(row))"'],
  ['views/IndexSettingsView.vue', '@keydown="openRowMenu($event)"'],
  ['views/RestView.vue', '@keydown="onRespMenuKey"'],
  ['components/QueryHistoryPanel.vue', '@keydown="onRowMenuKey($event, it)"'],
  ['components/SettingsGrid.vue', '@keydown="onRowMenuKey($event, r)"'],
  ['components/MappingFieldTree.vue', '@keydown="onRowMenuKey($event, f)"'],
  ['components/ExplainTree.vue', '@keydown="onRowKey($event)"'],
  ['components/DocDiffModal.vue', '@keydown="onCellMenuKey($event, r, -1)"'],
  ['components/builder/AggTreeNode.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/BoolGroupNode.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/ClauseNode.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/MultiNodeRow.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/WrapNodeRow.vue', '@keydown.self="onRowMenuKey"'],
  ['components/builder/RootExtrasPane.vue', '@keydown.self="onSortMenuKey($event, s, i)"'],
  ['components/builder/RootExtrasPane.vue', '@keydown.self="onHlMenuKey($event, i)"'],
  ['views/BulkEditorView.vue', '@keydown="onFailMenuKey($event, f, i)"'],
  ['views/DiagView.vue', '@keydown="onPendingMenuKey($event, p)"'],
  ['views/LuceneQueryView.vue', '@keydown="onHitMenuKey($event, h)"'],
  ['views/PainlessLabView.vue', '@keydown="onStoredMenuKey($event, s)"'],
  ['views/QueryXrayView.vue', '@keydown="onExMenuKey($event, ex)"'],
  ['views/ScoreExplainView.vue', '@keydown="onHitMenuKey($event, h)"'],
  ['views/SearchSandboxView.vue', '@keydown="onHitMenuKey($event, h)"'],
  ['views/TaskTreeView.vue', '@keydown="onRowMenuKey($event, root)"'],
  ['components/TableShell.vue', '@keydown.self="onBarKey"'],
  ['views/AnalyzerLabView.vue', '@keydown="onTokMenuKey($event, l, t)"'],
];

describe('1443 行级右键菜单键盘入口', () => {
  it('menuKey 判据：ContextMenu / Shift+F10 命中，F10 单独与 Enter 不命中', () => {
    expect(isMenuKey(key('ContextMenu'))).toBe(true);
    expect(isMenuKey(key('F10', true))).toBe(true);
    expect(isMenuKey(key('F10'))).toBe(false);
    expect(isMenuKey(key('Enter'))).toBe(false);
    expect(isMenuKey(key(' '))).toBe(false);
  });

  it('锚点取当前行盒左下角 +12px，无元素时回落 0,0', () => {
    const row = { currentTarget: { getBoundingClientRect: () => ({ left: 10, bottom: 40 }) } };
    expect(menuKeyAnchor(row as any)).toEqual({ x: 22, y: 40 });
    expect(menuKeyAnchor({ currentTarget: null })).toEqual({ x: 0, y: 0 });
  });

  it('全部自定义行都绑定菜单键，并且共用同一判据/锚点', () => {
    const seen = new Set<string>();
    for (const [file, anchor] of ROWS) {
      const s = src(file);
      expect(s, `${file} 缺 ${anchor}`).toContain(anchor);
      expect(s, `${file} 未接入 isMenuKey`).toContain('isMenuKey');
      expect(s, `${file} 未接入 menuKeyAnchor`).toContain('menuKeyAnchor');
      seen.add(file);
    }
    expect(seen.size).toBe(46);
  });

  it('TemplatesView 不再使用匹配不到 ContextMenu 的 @keydown.menu 修饰符', () => {
    const s = src('views/TemplatesView.vue');
    expect(s).not.toContain('@keydown.menu');
    expect(s).toMatch(/function onTplMenuKey\(e: KeyboardEvent/);
  });

  it('行列可聚焦或原本已可聚焦：新接入的行都补了 tabindex', () => {
    for (const file of [
      'views/SnapshotsView.vue',
      'views/AliasesView.vue',
      'views/HealthReportView.vue',
      'views/WatcherView.vue',
      'views/IlmView.vue',
      'views/LifecycleView.vue',
      'views/SlmView.vue',
      'views/RemoteClustersView.vue',
      'views/FavoritesView.vue',
      'views/TemplateGalleryView.vue',
      'views/ProfileFlameView.vue',
      'views/ConfigValidatorView.vue',
      'views/DiffEditorView.vue',
      'views/AdhocRebuildView.vue',
      'views/IndexOptimizerView.vue',
      'views/AnalysisSettingsView.vue',
    ]) {
      expect(src(file), `${file} 行不可聚焦`).toContain('tabindex="0"');
    }
  });

  /* 契约（docs/design.md）：新增右键面必须同时补键盘入口。
     本普查按目录枚举而非手抄清单——新增组件漏补时在这里红，而不是等用户发现。 */
  it('普查：每个挂 @contextmenu 的视图/组件都带键盘入口', () => {
    const root = join(__dirname, '..');
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => {
      const p = join(dir, d.name);
      return d.isDirectory() ? walk(p) : (d.name.endsWith('.vue') ? [p] : []);
    });
    const files = [...walk(join(root, 'views')), ...walk(join(root, 'components'))];
    expect(files.length, '目录枚举失效').toBeGreaterThan(100);
    /* 同时扫模板 @contextmenu 与渲染函数 onContextmenu——只扫模板会漏掉字段树/JSON 树 */
    const withMenu = files.filter(f => {
      const s = readFileSync(f, 'utf-8');
      return s.includes('@contextmenu') || s.includes('onContextmenu');
    });
    expect(withMenu.length, '右键面数量太少（枚举/路径异常）').toBeGreaterThanOrEqual(60);
    const KERNEL = new Set(['components/CellContextMenu.vue']); /* 菜单内核本身不接菜单键 */
    const missing = withMenu
      .filter(f => {
        const rel = relative(root, f).replace(/\\/g, '/');
        if (KERNEL.has(rel)) return false;
        const s = readFileSync(f, 'utf-8');
        return !s.includes('isMenuKey') && !s.includes("ContextMenu'");
      })
      .map(f => relative(root, f).replace(/\\/g, '/'));
    expect(missing, '右键面缺键盘入口').toEqual([]);
  });

  it('快捷键速查面板登记了列表/卡片行入口', () => {
    const hk = src('components/HotkeyPanel.vue');
    expect(hk).toContain('列表/卡片行（任务/快照/别名/索引/体检/告警/策略/模板/校验/差分行/火焰图/查询记录/设置/mapping/explain/文档差异/构建器/DevTools/检索/沙盒/打分/X 光/失败样例/诊断待办/任务树/分词 token）');
    expect(hk).toContain('Shift+F10 同效');
  });
});
