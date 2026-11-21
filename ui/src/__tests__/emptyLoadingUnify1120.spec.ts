/* 空态/加载态统一看守：五个文件里的旧空态与加载态写法退役，统一到
 * EmptyState（compact 档）与 SkeletonBox，字节格式化统一 utils/format fmtSize。
 *
 * 防回退面（not.toContain / not.toMatch 均按源文本字面匹配）：
 *   - McpPanel：mcp-empty 类与 mcp-muted 裸「暂无…」span 形态
 *   - PermModal：pm-loading 裸「加载中…」文案
 *   - LiveDashboardView：私有 ld-spin keyframes/.spinning 类定义、fmtGB 手搓 1024 换算
 *   - TablePresetMenu：tpm-none 自绘空文案
 * 正锁面：新形态（EmptyState compact / SkeletonBox / fmtSize）在场。
 * happy-dom 下 scoped style 不参与计算，数值类断言一律不做（同 emptyStatePadding 结论）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h } from 'vue';
import { Search } from 'lucide-vue-next';
import EmptyState from '../components/EmptyState.vue';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const mcp = read('../components/McpPanel.vue');
const live = read('../views/LiveDashboardView.vue');
const perm = read('../components/PermModal.vue');
const tpm = read('../components/TablePresetMenu.vue');
const qh = read('../views/QueryHubView.vue');

describe('1120 空态/加载态统一：旧形态不回流', () => {
  it('McpPanel：mcp-empty 类与裸「暂无…」mcp-muted 形态退役，空态统一 EmptyState compact', () => {
    expect(mcp, 'mcp-empty 类不得回流').not.toContain('mcp-empty');
    expect(mcp, '裸「暂无…」mcp-muted span 不得回流').not.toContain('mcp-muted">暂无');
    expect(mcp).toContain("import EmptyState from './EmptyState.vue'");
    /* 10 处空态（工具目录/试跑/审计/密钥列表/KEY INSPECTOR）全部 compact 档；
       目录与签发的两个细粒度兼容视图空态随视图一并退役 */
    expect(mcp.match(/<EmptyState[^>]*\bcompact\b/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('PermModal：pm-loading 裸文案退役，加载态走 SkeletonBox 骨架', () => {
    expect(perm, 'pm-loading 类不得回流').not.toContain('pm-loading');
    expect(perm).toContain("import SkeletonBox from './SkeletonBox.vue'");
    expect(perm).toMatch(/<SkeletonBox[^>]*height="18px"/);
    expect(perm).toContain('pm-skeleton');
  });

  it('LiveDashboardView：私有 spin 定义与手搓 1024 换算退役', () => {
    expect(live, 'ld-spin 私有 keyframes 不得回流').not.toContain('ld-spin');
    expect(live, '视图内 .spinning 类定义不得回流（统一 theme.css）').not.toMatch(/\.spinning\s*\{/);
    expect(live, '手搓 1024 字节换算不得回流').not.toMatch(/1024\s*\*\*|\/\s*1024\b/);
    expect(live, '本地 fmtGB 函数退役').not.toContain('function fmtGB(');
    expect(live, '字节格式化统一 fmtSize').toMatch(/fmtSize\(ring\./);
  });

  it('LiveDashboardView：Top 索引表空态走 EmptyState compact（文案逐字保留）', () => {
    expect(live).toMatch(/<EmptyState compact :icon="MonitorSpeaker" text="暂无索引速率快照（首轮采集基线建立后出数）"/);
  });

  it('TablePresetMenu：tpm-none 自绘空文案退役，走 EmptyState compact', () => {
    expect(tpm, 'tpm-none 类不得回流').not.toContain('tpm-none');
    expect(tpm).toMatch(/<EmptyState v-else compact :icon="LayoutTemplate" text="暂无方案"/);
  });

  it('QueryHubView：通道加载保持 SkeletonBox+文案统一形态', () => {
    expect(qh).toContain('h(SkeletonBox');
    expect(qh).toContain('通道加载中');
  });
});

describe('1120 行为冒烟：EmptyState compact 挂载形态（McpPanel 空态同款用法）', () => {
  it('compact 档渲染 es-compact 类+图标+一句话+hint', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(EmptyState, {
        compact: true,
        icon: Search,
        text: '没有匹配的密钥。',
        hint: '调整搜索或状态筛选。',
      }),
    });
    app.config.warnHandler = () => {};
    app.mount(host);
    const root = host.querySelector('.empty-state');
    expect(root, '组件根节点在场').toBeTruthy();
    expect(root!.classList.contains('es-compact'), 'compact 档类在场').toBe(true);
    expect(root!.querySelector('.es-text')?.textContent).toBe('没有匹配的密钥。');
    expect(root!.querySelector('.es-hint')?.textContent).toBe('调整搜索或状态筛选。');
    /* happy-dom 下 SVG 命名空间外壳节点不落地（.es-icon 内直接是 circle/path 子元素），
       图标在场断言按子元素数走 */
    expect((root!.querySelector('.es-icon') as HTMLElement)?.childElementCount, 'lucide 图标渲染').toBeGreaterThan(0);
    expect(root!.querySelector('button'), '未传 actionText 不渲染按钮').toBeNull();
    app.unmount();
    host.remove();
  });
});
