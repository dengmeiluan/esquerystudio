/**
 * 【W3b】QueryXrayView：
 *  ① 改写透视输出错误分支 err 档——ex.error 无档时与正常解释同视觉，错误现场不显眼；
 *     挂载断言最终 DOM：.qx-lucene.err（IlmView pre.err 手法）只落在 error 行；
 *  ② 词频取证 fields FieldPicker text 置顶（「空 = 全部 text 字段」主战场）——源码锁
 *     （FieldPicker 弹层链路由 fieldPicker 既有 spec 护住，此处锁接线）。
 *
 * 设施：vue-router 轻 mock + 只 mock ../api + MonacoEditor stub（JsonArea 内层，隔离施工竞争）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/query-xray', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup() { return () => h('div', { class: 'monaco-host' }); },
    }),
  };
});

const validateQueryFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      validateQuery: (...a: any[]) => validateQueryFn(...a),
      termVectors: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ raw: { properties: { a_kw: { type: 'keyword' }, z_text: { type: 'text' } } } }),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import QueryXrayView from '../views/QueryXrayView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  const app = createApp({ render: () => h(QueryXrayView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  validateQueryFn.mockReset();
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
  history.replaceState(null, '', '#/');
});

describe('QueryXray 改写透视错误分支 err 档（W3b）', () => {
  it('explanation 行无 err 档、error 行挂 .qx-lucene.err（IlmView pre.err 同手法）', async () => {
    validateQueryFn.mockResolvedValue({
      valid: false, error: ' 监督失败 ',
      explanations: [
        { index: 'i-ok', explanation: 'TermQuery(field:a)' },
        { index: 'i-bad', error: 'Failed to parse query [>>>]' },
      ],
    });
    const host = await mountView();
    const run = host.querySelector('.qx-run') as HTMLButtonElement;
    expect(run, '已选索引时透视可点').toBeTruthy();
    run.click();
    await settle();
    const pres = host.querySelectorAll('pre.qx-lucene');
    expect(pres.length).toBe(2);
    expect(pres[0].className, '正常解释不挂 err 档').not.toContain('err');
    expect(pres[1].className, 'error 行挂 err 档（err-soft 底 + err 字色）').toContain('err');
    expect(pres[1].textContent).toContain('Failed to parse query');
    /* 源码锁：五百二十五批 W5 起 error 分支换 errPreHtml v-html 内核（含 { 走 highlightJson
       着色，否则转义平文——textContent 与原文一致，DOM 断言不受影响），err 档走 v-else
       分支；explanation 是纯文本 explain，保持插值 pre 不走 v-html */
    const v = readFileSync(join(__dirname, '../views/QueryXrayView.vue'), 'utf-8');
    expect(v).toContain('<pre v-if="ex.explanation" class="qx-lucene">{{ ex.explanation }}</pre>');
    expect(v).toContain('<pre v-else class="qx-lucene err" v-html="errPreHtml(ex.error || \'-\')"></pre>');
    expect(v).toContain("import { errPreHtml, errMeta } from '../utils/errPre'");
    expect(v).toMatch(/\.qx-lucene\.err \{[^}]*var\(--err-soft\)/);
  });

  it('词频取证 fields FieldPicker text 置顶（源码锁：typePriority 接线在位）', () => {
    const v = readFileSync(join(__dirname, '../views/QueryXrayView.vue'), 'utf-8');
    expect(v).toMatch(/<FieldPicker v-model="tvFields" :index="index" multi placeholder="逗号分隔，空 = 全部 text 字段" width="100%" class="qx-ii wide" :type-priority="\['text'\]" \/>/);
  });
});
