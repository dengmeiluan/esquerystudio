import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import ExplainTree from '../components/ExplainTree.vue';

// 八百二十六批·族3 Space 键双通道全矿收口（823 预扫备案域开刀）——role="button" 站点
// Enter+Space 双通道补齐（WAI-ARIA button 契约=Enter 与 Space 都激活；812 批三件套
// 只立 Enter=契约半覆盖，823 预扫实证 48 处缺备案留批）。刀面=48 站点/37 文件：
// 内联表达式形态 15（CreateIndexModal×2+ExplainTree+DevTools×2+IndexSettings×2+
// LuceneQuery+Mapping pre+ProfileFlame+SqlConsole+TemplateGallery+Watcher+Xmigrate+
// Security 动态 :role 三元形态）+方法调用形态 33（AltHitsViews/DocDiffModal×2/
// IndexPicker/MappingFieldTree×2/QueryHistoryPanel/SettingsGrid/SideNav/WelcomeWizard/
// AdhocRebuild×3/Aliases/AnalysisSettings/Browser/ConfigDrift/ConfigValidator/DslQuery/
// Favorites×2/Ilm/IndexHub×2/LiveDashboard×2/PainlessLab/SearchTemplates/Snapshots/
// TemplateGallery/Templates/Topology/Xmigrate——两形态判据同一：键位修饰符显式
// .enter 而无 .space 即缺口，handler 表达式形态无关=守卫约定从严）。
// 约定豁免①：role="link" 单通道 Enter，不加 Space（ARIA link 契约=Enter 激活，
// Space 保留页面滚动语义）——Mapping a.mp-link×2 + MetaStrip 动态 link 在豁免域。
// 约定豁免②：无 .enter 修饰的泛 @keydown="fn" 域（键位在 handler 内部裁决）文本
// 不可判定，不入本守卫 population，逐 handler 人工裁决留后续批/实报通道。

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* 48 站点清单（file 相对 __dirname；handler=Enter 通道原表达式，Space 通道逐字同表达式） */
const SITES: Array<{ file: string; handler: string }> = [
  { file: '../components/CreateIndexModal.vue', handler: 'advOpen = !advOpen' },
  { file: '../components/CreateIndexModal.vue', handler: 'previewOpen = !previewOpen' },
  { file: '../components/ExplainTree.vue', handler: 'open = !open' },
  { file: '../views/DevToolsView.vue', handler: 'addTab' },
  { file: '../views/DevToolsView.vue', handler: 'histOpen = !histOpen' },
  { file: '../views/IndexSettingsView.vue', handler: 'showRaw = !showRaw' },
  { file: '../views/IndexSettingsView.vue', handler: 'selectAllRaw' },
  { file: '../views/LuceneQueryView.vue', handler: 'qs = t.q' },
  { file: '../views/MappingView.vue', handler: 'selectAllRaw' },
  { file: '../views/ProfileFlameView.vue', handler: 'focused = s' },
  { file: '../views/SqlConsoleView.vue', handler: 'applyTemplate(t)' },
  { file: '../views/TemplateGalleryView.vue', handler: 'cat = c' },
  { file: '../views/WatcherView.vue', handler: 'onMetaKey' },
  { file: '../views/XmigrateView.vue', handler: 'form.sourceIndex = ri.index; if (!form.destIndex) form.destIndex = ri.index' },
  { file: '../views/SecurityView.vue', handler: 'value && openDetailCell(row)' },
  { file: '../components/DocDiffModal.vue', handler: 'copyCell(r.path, r.base)' },
  { file: '../components/DocDiffModal.vue', handler: 'copyCell(r.path, tv)' },
  { file: '../components/IndexPicker.vue', handler: 'choose(store.pickedIdx)' },
  { file: '../components/MappingFieldTree.vue', handler: 'copyPath(f.path)' },
  { file: '../components/MappingFieldTree.vue', handler: 'toggle(f.path)' },
  { file: '../components/QueryHistoryPanel.vue', handler: 'gotoIndex(it.index)' },
  { file: '../components/SettingsGrid.vue', handler: 'copyRow(r)' },
  { file: '../components/SideNav.vue', handler: 'toggleGroup(g.id)' },
  { file: '../components/WelcomeWizard.vue', handler: 'pickIdx(idx)' },
  { file: '../views/AdhocRebuildView.vue', handler: 'copyJobId(job.jobId)' },
  { file: '../views/AdhocRebuildView.vue', handler: "copyJobId(String(row[0] ?? ''))" },
  { file: '../views/AdhocRebuildView.vue', handler: 'toggleJobStatusFilter(row[3])' },
  { file: '../views/AliasesView.vue', handler: 'goHub(r.index)' },
  { file: '../views/AnalysisSettingsView.vue', handler: 'toggle(g.key, String(name))' },
  { file: '../views/BrowserView.vue', handler: 'goHub(value)' },
  { file: '../views/ConfigValidatorView.vue', handler: 'applyTemplate(t)' },
  { file: '../views/FavoritesView.vue', handler: 'importInput?.click()' },
  { file: '../views/FavoritesView.vue', handler: 'prefsInput?.click()' },
  { file: '../views/IlmView.vue', handler: 'pickPolicy(p)' },
  { file: '../views/IndexHubView.vue', handler: 'copyShardLocate(grp.node, s)' },
  { file: '../views/IndexHubView.vue', handler: 'select(idx.index)' },
  { file: '../views/PainlessLabView.vue', handler: 'pickStored(s)' },
  { file: '../views/SearchTemplatesView.vue', handler: 'pick(t)' },
  { file: '../views/SnapshotsView.vue', handler: 'gotoIndex(idx)' },
  { file: '../views/TemplateGalleryView.vue', handler: 'copy(t)' },
  { file: '../views/TemplatesView.vue', handler: 'select(t)' },
  { file: '../views/TopologyView.vue', handler: 'gotoShard(s)' },
  { file: '../views/XmigrateView.vue', handler: 'copyJobId(String(row[0]))' },
];

describe('spaceGuard826 逐站点锚（48 站点 Enter+Space 成对，属性紧邻容差 \\s*）', () => {
  it.each(SITES)('$file › $handler', ({ file, handler }) => {
    const v = rd(file);
    const pair = new RegExp(
      '@keydown\\.enter\\.prevent(\\.[\\w-]+)*="' + esc(handler) + '"\\s*@keydown\\.space\\.prevent(\\.[\\w-]+)*="' + esc(handler) + '"',
    );
    expect(v).toMatch(pair);
  });
});

describe('spaceGuard826 全域守卫', () => {
  it('ConfigDrift 泛 keydown 站点（已含右键菜单）：Enter/Space 仍在 handler 内成对', () => {
    const v = rd('../views/ConfigDriftView.vue');
    expect(v).toMatch(/@keydown="onKeyMenuKey\(\$event, k\)"/);
    expect(v).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });

  it('LiveDashboard 节点卡/活动告警卡（已含右键菜单）：Enter/Space 仍在 onLdCardKey 内成对', () => {
    const v = rd('../views/LiveDashboardView.vue');
    expect(v).toMatch(/@keydown="onLdCardKey\(\$event, 'node-card', n\)"/);
    expect(v).toMatch(/@keydown="onLdCardKey\(\$event, 'active-alert', a\)"/);
    expect(v).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });

  it('AltHitsViews 卡片（已含右键菜单）：Enter/Space 仍在 onCardKey 内成对', () => {
    const v = rd('../components/AltHitsViews.vue');
    expect(v).toMatch(/@keydown="onCardKey\(\$event, h\)"/);
    expect(v).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });

  it('DSL 聚合桶行（已含右键菜单）：Enter/Space 仍在 onAggKey 内成对', () => {
    const v = rd('../views/DslQueryView.vue');
    expect(v).toMatch(/@keydown="onAggKey\(\$event, a, b\)"/);
    expect(v).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.vue') ? [p] : [];
    });
  }
  function readTag(text: string, i: number): string {
    let q: string | null = null;
    let j = i + 1;
    for (; j < text.length; j++) {
      const c = text[j];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '>') break;
    }
    return text.slice(i, j + 1);
  }

  it('views+components 全域零 role=button「有 Enter 无 Space」硬形态（无 .enter 修饰的泛 keydown 域豁免=约定②）', () => {
    const offenders: string[] = [];
    for (const base of ['../views', '../components']) {
      for (const f of walk(join(__dirname, base))) {
        const src = readFileSync(f, 'utf-8');
        const tm = src.match(/<template>([\s\S]*)<\/template>/);
        if (!tm) continue;
        const re = /<([a-zA-Z][\w-]*)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(tm[1]))) {
          const raw = readTag(tm[1], m.index);
          const roleAttr = raw.match(/\b(?::role|role)\s*=\s*"([^"]*)"/);
          if (!roleAttr) continue;
          const rv = roleAttr[1];
          // 静态 role="button" 或动态三元真值支 'button'（link 形态豁免=约定①）
          const isButton = rv === 'button' || (rv.includes("'button'") && !rv.includes("'link'"));
          if (!isButton) continue;
          const pairs = [...raw.matchAll(/(?:@|v-on:)([\w.:-]*keydown[\w.:-]*)\s*=\s*"([^"]*)"/g)]
            .map(k => ({ mods: k[1], body: k[2] }));
          if (pairs.some(p => /\.space/.test(p.mods))) continue;
          const hasEnter = pairs.some(p => /\.enter/.test(p.mods));
          const generic = pairs.some(p => !/\.(enter|space|esc|up|down|left|right|tab|delete|home|end)/.test(p.mods));
          if (hasEnter && !generic) offenders.push(`${f.replace(/\\/g, '/').split('/src/')[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('link 豁免域：Mapping mp-link 双链不携带 Space 通道（ARIA link=Enter 单通道约定①）', () => {
    const v = rd('../views/MappingView.vue');
    const links = v.match(/<a class="mp-link"[^>]*>/g) || [];
    expect(links.length).toBe(2);
    for (const l of links) expect(l).not.toContain('keydown.space');
  });
});

describe('spaceGuard826 挂载级：Space 键激活+preventDefault（ExplainTree xt-row）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  function mountComp(comp: any, props: Record<string, unknown>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(comp, props) });
    app.mount(host);
    apps.push(app);
    return host;
  }
  beforeEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.innerHTML = '';
  });
  it('Space 翻转 aria-expanded 渲染子树+事件 defaultPrevented', async () => {
    const node = { value: 42, description: 'root', details: [{ value: 21, description: 'kid' }] };
    const host = mountComp(ExplainTree, { node, total: 42, depth: 3 });
    const row = host.querySelector('.xt-row') as HTMLElement;
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('aria-expanded')).toBe('false'); // depth≥2 默认收起
    expect(host.querySelector('.xt-kids')).toBeNull();
    const ev = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    row.dispatchEvent(ev);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(ev.defaultPrevented).toBe(true); // .space.prevent 契约（防页面滚动）
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.xt-kids')).not.toBeNull();
  });
});
