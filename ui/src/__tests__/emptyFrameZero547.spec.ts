/**
 * 五百四十七批·轨4（工蚁）：任务 1 空态/加载态空框清零 · 契约备案。
 *
 * 538 约定「空态不留整块空框」续扫（AnalyzerLabView:49 是 546 先例；SystemView:65 骨架裸置先例）：
 * ① IndexSettingsView settings 拉取失败态整卡（card is-empty）→ EmptyState centered 直贴
 *    （文案保留原样；flattenWave534 的「失败态整卡豁免备案」由约定推翻，锁同步更新彼处）；
 * ② IndexSettingsView / MappingView 加载骨架空框（card + padding:var(--sp-4) 内联包 8×SkeletonBox）
 *    → 壳退役骨架裸置（SystemView:65 先例）；
 * ③ IndexHubView 未选索引引导卡（card ih-guide，:1569 64px 居中即手写 EmptyState 形态）
 *    → EmptyState centered 直贴（ih-guide-t/-s 文案迁 props；重锁区仅动 ih-guide 块）；
 * ④ BrowserView 加载态裸 .empty（theme.css 全局 .empty 的最后非表格消费）→ SkeletonBox 收口
 *    （DocDiffModal 表格 td.empty 属表格语义豁免不动）。
 *
 * 范围铁律：纯视觉层——高度链/flex 语义零变动，容器只摘壳不搬内容。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const isv = read('../views/IndexSettingsView.vue');
const mp = read('../views/MappingView.vue');
const ih = read('../views/IndexHubView.vue');
const bw = read('../views/BrowserView.vue');

/* ═══════════ ① IndexSettingsView 失败态整卡 → EmptyState centered ═══════════ */

describe('五百四十七批①：IndexSettingsView 失败态整卡退役（538 空态空框约定续扫）', () => {
  it('card is-empty 整卡与壳规则双退役；EmptyState centered 直贴在场', () => {
    expect(isv, '失败态整卡（card is-empty）退役').not.toMatch(/class="card is-empty"/);
    expect(isv, '.is-empty 壳规则退役（空态留白归 EmptyState 组件单源）').not.toMatch(/\.is-empty \{/);
    expect(isv, '失败态改 EmptyState centered 直贴').toMatch(/<EmptyState[\s\S]*?centered[\s\S]*?:icon="AlertTriangle"/);
    /* 文案保留原样（含 loadErr 动态拼接）与重试行动原样 */
    expect(isv).toContain('settings 拉取失败');
    expect(isv).toMatch(/action-text="重试"/);
  });

  it('挂载渲染锁：拉取失败 → EmptyState 组件直贴（不再有 card 空框）', async () => {
    const { mountIndexSettings } = await mountHelper();
    const { app, host } = await mountIndexSettings();
    expect(host.querySelector('.card.is-empty'), '失败态整卡空框退役').toBeNull();
    const es = host.querySelector('.empty-state');
    expect(es, '失败态出 EmptyState 组件').toBeTruthy();
    expect(es?.className).toContain('es-centered');
    expect(host.textContent).toContain('settings 拉取失败');
    expect(host.querySelector('.empty-state .btn'), '重试行动在 EmptyState 行动位').toBeTruthy();
    app.unmount();
  });
});

/* ═══════════ ② 加载骨架空框退役（SystemView:65 骨架裸置先例） ═══════════ */

describe('五百四十七批②：加载骨架 card 空框退役（IndexSettings/Mapping）', () => {
  it('骨架壳（card + padding:var(--sp-4) 内联）双视图退役，SkeletonBox 裸置保 8 根', () => {
    for (const [s, name] of [[isv, 'IndexSettingsView'], [mp, 'MappingView']] as const) {
      expect(s, `${name} 骨架壳退役`).not.toMatch(/<div[^>]*class="card"[^>]*style="padding:var\(--sp-4\)"/);
      expect(s, `${name} 骨架裸置（8 根保量）`).toMatch(/SkeletonBox v-for="i in 8"/);
    }
    expect(isv, 'IndexSettingsView 骨架 34px round 形态零触').toMatch(/height="34px" round/);
  });
});

/* ═══════════ ③ IndexHubView 引导卡 → EmptyState centered（重锁区仅动 ih-guide 块） ═══════════ */

describe('五百四十七批③：IndexHubView ih-guide 引导空框退役', () => {
  it('ih-guide 卡类/文案类/壳规则三退役；EmptyState centered 承接（文案逐字迁移）', () => {
    /* 类与规则级锚（注释里的备案字样不算回流） */
    expect(ih, '引导卡 ih-guide 模板类退役').not.toMatch(/class="card ih-guide"/);
    expect(ih, '引导卡壳/文案规则退役').not.toMatch(/\.ih-guide[- t{]/);
    expect(ih, '未选索引态改 EmptyState centered 直贴').toMatch(/<EmptyState v-if="!cur" centered :icon="Boxes"/);
    expect(ih, '主文案逐字迁移').toContain('点击「索引列表」或搜索选择索引，进入索引工作区');
    expect(ih, '副文案逐字迁移').toContain('文档检索 · DSL 查询 · Settings · Mapping · 分片 · 运维操作，一个索引的全生命周期在一个页面完成');
    /* 重锁区防误伤：五百五十一批同步更新（击穿者：551 轨2 刀⑥a——ih-card-flush 大卡壳退役），
       547 豁免正锁字面改退役形，工作区分节容器 ih-ws 承接（锁意图=工作区容器形态回归防线） */
    expect(ih, 'ih-card-flush 主卡退役（551 击穿同步更新）').not.toMatch(/class="card ih-card-flush"/);
    expect(ih, 'ih-ws 分节容器承接（551）').toMatch(/<div class="ih-ws"(?:\s+:class="|>)/);
  });
});

/* ═══════════ ④ BrowserView 加载态裸 .empty 收口（theme.css .empty 最后非表格消费） ═══════════ */

describe('五百四十七批④：BrowserView 加载态 .empty → SkeletonBox 收口', () => {
  it('裸 .empty 消费退役；加载态 SkeletonBox 骨架（语义 label 保留）；DocDiffModal td.empty 豁免不动', () => {
    expect(bw, '裸 .empty 加载态退役').not.toMatch(/class="empty"/);
    expect(bw, '加载态 SkeletonBox 收口（aria-label 语义逐字保留）')
      .toMatch(/store\.loadingIndices && !store\.indices\.length" aria-label="正在拉取索引列表">/);
    expect(bw, '骨架形态对齐 SystemView:65 先例').toMatch(/<SkeletonBox height="30px" round/);
    /* 表格语义豁免正锁：DocDiffModal td.empty 不在扫荡域 */
    const ddm = read('../components/DocDiffModal.vue');
    expect(ddm, 'DocDiffModal 表格 td.empty 豁免保留').toMatch(/td class="empty"/);
  });
});

/* ═══════════ 挂载辅助（qualityThreeState mountView 同款；Monaco 无关不 stub） ═══════════ */

const indexSettingsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      indexSettings: (...args: any[]) => indexSettingsFn(...args),
      insight: { ...actual.api.insight, settingsImpact: () => Promise.reject(new Error('skip')) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
    },
  };
});

async function mountHelper() {
  return {
    async mountIndexSettings() {
      location.hash = '#/index-settings?idx=t-1';
      indexSettingsFn.mockRejectedValue(new Error('boom'));
      const pinia = createPinia();
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/adhoc-rebuild', component: { template: '<div/>' } }, { path: '/', component: { template: '<div/>' } }],
      });
      await router.push('/');
      await router.isReady();
      const app = createApp({ render: () => h(IndexSettingsView) });
      app.use(pinia);
      app.use(router);
      const host = document.createElement('div');
      document.body.appendChild(host);
      app.mount(host);
      for (let i = 0; i < 12; i++) { await nextTick(); await Promise.resolve(); }
      return { app, host };
    },
  };
}

import IndexSettingsView from '../views/IndexSettingsView.vue';

beforeEach(() => {
  indexSettingsFn.mockReset();
  document.body.innerHTML = '';
});
