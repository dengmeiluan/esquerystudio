/**
 * 【W3b】AnalysisSettingsView：原始 settings.analysis JSON 区的 dsl-assist 补 bodyKind: 'settings'
 * （BodyKind 既有档位）——此前缺省按 'search' 冒充查询根键，"analyzer": 键位出 must/filter
 * 等查询键噪音。挂载断言：加载后 JsonArea 内层 Monaco 收到的 dslAssist.bodyKind() === 'settings'
 * 且 fields() 为空数组（五百一十九批 fields 契约不回归）。
 * 558b 同步更新：dsl-assist 收口 setup 常量 asAssist 并补 analyzers() 候选通道（AnalyzeView
 * avBodyAssist 同通道）——fields 空/ bodyKind settings 原断言不破，新增 analyzers 正向断言；
 * 源码锁从模板内联字面迁到 asAssist 接线 + script 侧档位/通道字面。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/analysis-settings', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* MonacoEditor stub：捕获 JsonArea 透传的 dslAssist（挂载型断言的观测点） */
vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup(props: any) {
        (window as any).__asCapturedAssist = props.dslAssist;
        return () => h('div', { class: 'monaco-host' });
      },
    }),
  };
});

const analysisSettingsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analysisSettings: (...a: any[]) => analysisSettingsFn(...a),
      analysisUpdate: () => Promise.resolve({}),
      reloadAnalyzers: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import AnalysisSettingsView from '../views/AnalysisSettingsView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).__asCapturedAssist;
  analysisSettingsFn.mockReset().mockResolvedValue({
    analysis: { analyzer: { my_std: { type: 'pattern' } }, filter: { my_stop: { type: 'stop' } } },
  });
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
  history.replaceState(null, '', '#/');
});

describe('AnalysisSettings dsl-assist bodyKind=settings（W3b）', () => {
  it('加载后 Monaco 收到 bodyKind() === \'settings\'，fields() 仍空数组（零降级契约不回归）', async () => {
    const app = createApp({ render: () => h(AnalysisSettingsView as any) });
    apps.push(app);
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await settle();
    const loadBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('加载'));
    expect(loadBtn, '「加载」按钮在位').toBeTruthy();
    loadBtn!.click();
    await settle();
    expect(analysisSettingsFn).toHaveBeenCalledWith('logs-x');
    const assist = (window as any).__asCapturedAssist;
    expect(assist, 'JsonArea 内层 Monaco 必须收到 dslAssist').toBeTruthy();
    expect(assist.fields()).toEqual([]);
    expect(assist.bodyKind()).toBe('settings');
    /* 558b 同步更新：analyzers() 候选通道（mock analysis 只有 analyzer.my_std；filter 不入通道） */
    expect(assist.analyzers()).toEqual(['my_std']);
  });

  it('源码锁：asAssist 接线在場，bodyKind 显式 settings（缺省 search 冒充不回归）+ fields 空数组 + analyzers 通道（558b 同步更新）', () => {
    const v = readFileSync(join(__dirname, '../views/AnalysisSettingsView.vue'), 'utf-8');
    expect(v).toContain(':dsl-assist="asAssist"');
    expect(v).toContain("bodyKind: (): BodyKind => 'settings'");
    expect(v).toContain('fields: () => []');
    expect(v).toContain('analyzers: () => [');
  });
});
