/* 1058：SQL 场景模板按 mapping 角色绑定字段——缺字段模板置灰并解释，不插入假字段 SQL。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';
import { __clearFieldCache } from '../composables/useIndexFields';

const state = vi.hoisted(() => ({ mapping: {} as Record<string, unknown> }));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => [{ index: 'i', health: 'green', status: 'open' }]),
      mappingDetail: vi.fn(async () => ({ raw: { properties: state.mapping } })),
      clusterHealth: vi.fn(async () => ({})),
      overview: vi.fn(async () => ({})),
      nodesStatsBrief: vi.fn(async () => []),
      aliases: vi.fn(async () => []),
      sqlLenient: vi.fn(async () => ({ columns: [], rows: [] })),
      sqlTranslate: vi.fn(async () => ({ size: 100, query: { match_all: {} } })),
      resolveSchema: vi.fn(async () => ({ warnings: [] })),
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import SqlConsoleView from '../views/SqlConsoleView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const settle = async (n = 30) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const DRAFT = draftStorageKey({ route: 'sql-console' }, 'sql');

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady();
  const app = createApp({ render: () => h(SqlConsoleView) });
  apps.push(app); app.use(pinia); app.use(router);
  const host = document.createElement('div'); document.body.appendChild(host);
  app.mount(host); await settle();
  return host;
}
const tplRow = (host: ParentNode, key: string) =>
  [...host.querySelectorAll<HTMLLIElement>('.sq-tpl li')].find(li => li.querySelector('.sq-tpl-k')?.textContent?.trim() === key)!;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('es_picked', 'i');
  __clearFieldCache();
  state.mapping = {};
});
afterEach(() => { apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); apps.length = 0; });

describe('1058 SQL 场景模板角色绑定', () => {
  it('生产形态 mapping → 七模板可用，主体模板自动绑定 company_name', async () => {
    state.mapping = {
      company_name: { type: 'keyword' },
      publish_time: { type: 'date' },
      bond_rating: { type: 'keyword' },
      announcement_title: { type: 'text' },
      content: { type: 'text' },
    };
    const host = await mountView();
    expect(host.querySelectorAll('.sq-tpl li').length).toBe(7);
    const entityRow = tplRow(host, 'entity-top');
    expect(entityRow.classList.contains('off')).toBe(false);
    expect(tplRow(host, 'recent7d').classList.contains('off')).toBe(false);
    expect(tplRow(host, 'category-top').classList.contains('off')).toBe(false);

    /* 1101：可用模板在列表里直接亮出自动绑定字段（点开前可见） */
    expect(entityRow.textContent).toContain('company_name');
    expect(tplRow(host, 'recent7d').textContent).toContain('publish_time');
    entityRow.click(); await settle();
    const sql = sessionStorage.getItem(DRAFT) || '';
    expect(sql).toContain('FROM "i"');
    expect(sql).toContain('company_name');
    expect(sql).not.toContain('{entity}');
  });

  it('只有 text 字段 → 依赖 date/分类/主体的模板置灰并说明缺什么', async () => {
    state.mapping = { announcement_title: { type: 'text' } };
    const host = await mountView();
    const recent = tplRow(host, 'recent7d');
    expect(recent.classList.contains('off')).toBe(true);
    expect(recent.querySelector('.sq-tpl-miss')?.textContent).toContain('date 字段');
    expect(tplRow(host, 'text-like').classList.contains('off')).toBe(false);
    expect(tplRow(host, 'text-like').textContent, '可用模板显示自动绑定字段').toContain('announcement_title');

    recent.click(); await settle();
    expect(sessionStorage.getItem(DRAFT)).toBeNull(); // 未写入任何 SQL
  });

  it('无索引时仅“前 100 条”可插入（不伪造字段）', async () => {
    localStorage.removeItem('es_picked');
    const host = await mountView();
    expect(tplRow(host, 'top100').classList.contains('off')).toBe(false);
    expect(tplRow(host, 'recent7d').classList.contains('off')).toBe(true);
    tplRow(host, 'top100').click(); await settle();
    const sql = sessionStorage.getItem(DRAFT) || '';
    expect(sql).toContain('SELECT * FROM "my-index" LIMIT 100');
  });
});
