/**
 * R130 一百七十二批：表格空态/错态文案终扫（EmptyState 三件套+下一步动作）。
 * 锁定：
 * 1) QRT emptyHint prop——传 hint 渲染 .es-hint，不传零增量（不渲染）；
 * 2) TasksView 空态/失败占位 EmptyState 化（原两处裸 .empty 文案缺下一步指引）：
 *    失败占位 hint 指向页顶 err-bar；真空态给「重建/迁移发起后出现」指引；
 * 3) 静态锁：TasksView 不再出现裸「任务列表拉取失败」div（防回潮）；
 *    Lucene 结果表传 empty-hint。
 * 盘点结论（防下会话重扫）：Xmigrate/Snapshots/Plugins 已达标；BrowserView 三支 .empty
 * 已带动作语义（184 批 E 组 EmptyState 化时统一；五百四十七批：加载态支随裸 .empty 收口
 * SkeletonBox，真空两支 EmptyState 不变）；Diag 走页面级 err-bar 体系（187 批同场）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';

const host = document.createElement('div');
document.body.appendChild(host);
const apps: ReturnType<typeof createApp>[] = [];

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('表格空态文案终扫（一百七十二批）', () => {
  it('QRT：emptyHint 传则渲染 hint，不传不渲染（零增量）', async () => {
    await mountTbl({ hits: [], storageKey: 'es1' });
    expect(host.querySelector('.es-hint')).toBeNull();
    await mountTbl({ hits: [], storageKey: 'es2', emptyHint: '调整查询条件后重查' });
    expect(host.querySelector('.es-hint')?.textContent?.trim()).toBe('调整查询条件后重查');
  });

  it('TasksView：空态/失败占位 EmptyState 三件套（含下一步指引）', () => {
    const s = read('../views/TasksView.vue');
    expect(s).toMatch(/<EmptyState v-else-if="!trees\.length && loadErr" :icon="RefreshCw" text="任务列表拉取失败" hint="失败原因与重试见页顶错误条" \/>/);
    expect(s).toMatch(/<EmptyState v-else-if="!trees\.length" :icon="ListTodo" text="当前无运行中任务" hint="重建\/迁移发起后任务会出现在这里，也可点右上角刷新" \/>/);
  });

  it('TasksView：裸「任务列表拉取失败」div 不回潮', () => {
    const s = read('../views/TasksView.vue');
    expect(s).not.toMatch(/<div[^>]*class="empty"[^>]*>任务列表拉取失败<\/div>/);
    expect(s).not.toMatch(/<div[^>]*class="empty"[^>]*>当前无运行中任务<\/div>/);
  });

  it('Lucene 结果表传 empty-hint（静态锁）', () => {
    const s = read('../views/LuceneQueryView.vue');
    expect(s).toMatch(/empty-hint="调整查询语句或时间范围后重查"/);
  });

  it('二百四十九批：EmptyState compact 档——Overview/Rest/Painless/Browser/Cluster 裸空态清零', () => {
    /* compact 档存在于共享件（图标缩档+留白减半），窄容器空态自此有组件级归宿 */
    const es = read('../components/EmptyState.vue');
    expect(es).toMatch(/compact\?: boolean/);
    expect(es).toMatch(/es-compact/);
    /* OverviewView：拓扑条/双 Top10/作业列表 四处真空态合并（进行态骨架保留） */
    const ov = read('../views/OverviewView.vue');
    expect(ov).toMatch(/<EmptyState v-else compact :icon="Network" text="暂无分片信息"/);
    expect(ov).toMatch(/<EmptyState v-if="!topBySize\.length" compact :icon="HardDrive"/);
    expect(ov).toMatch(/<EmptyState v-if="!topByDocs\.length" compact :icon="FileText"/);
    expect(ov).toMatch(/<EmptyState v-else compact :icon="History" text="暂无作业记录"/);
    expect(ov).not.toMatch(/class="empty">暂无/);
    /* RestView：三处已归一为单一 EmptyState（lane 续作批合并历史/无匹配/初始引导） */
    const rv = read('../views/RestView.vue');
    expect((rv.match(/<EmptyState/g) || []).length).toBe(1);
    expect(rv).not.toMatch(/class="empty"/);
    /* BrowserView：两支真空态合并；五百四十七批锁同步更新——进行态裸 .empty 收口 SkeletonBox
       （theme.css .empty 最后非表格消费退役），语义 label 逐字保留（原 G7-B2 口径的
       「保留」改「骨架收口」，锚见 emptyFrameZero547） */
    const bv = read('../views/BrowserView.vue');
    expect(bv).toMatch(/<EmptyState v-else-if="!filtered\.length && store\.indices\.length" compact :icon="Search"/);
    expect(bv).toMatch(/<EmptyState v-else-if="!filtered\.length && !store\.loadingIndices" compact :icon="Boxes"/);
    expect(bv).toMatch(/store\.loadingIndices && !store\.indices\.length" aria-label="正在拉取索引列表">/);
    expect(bv).toMatch(/<SkeletonBox height="30px" round/);
    /* ClusterSettingsView：失败重试+过滤致空 两处合并 */
    const cs = read('../views/ClusterSettingsView.vue');
    expect(cs).toMatch(/<EmptyState v-else-if="loadErr" :icon="AlertTriangle" text="集群设置拉取失败"/);
    expect(cs).toMatch(/<EmptyState v-if="!groups\.length" compact :icon="SearchX"/);
    expect(cs).not.toMatch(/class="empty"/);
  });
});
