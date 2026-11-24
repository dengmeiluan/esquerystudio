/**
 * 546 批轨1：FieldPicker hl() → MarkText 收官（全站最后一处 v-html 高亮残留退役）。
 *
 *  A 源锚：v-html 零残留、本地 hl()/esc 整段删除、MarkText import + 模板在場
 *    （kw 口径=与 searchFields 内部一致的已 trim 末段 lastSeg）、.fxp-name :deep(mark)
 *    样式零动（specificity 压过 .mt-mark，视觉不变）；
 *  B 行为：MarkText 头注契约（textContent 与原文一致）在 FieldPicker 场景自证——
 *    空 query 无 mark 全名平文 / 命中段 <mark> 包裹且整名 textContent 等价 /
 *    大小写不敏感命中（mark 段落回原文大小写，旧 hl() 同款口径）。
 *
 * mount 范式与 fieldPicker.spec.ts 一致（createApp+h+pinia，mock ../api 出口）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import FieldPicker from '../components/FieldPicker.vue';
import { __clearFieldCache } from '../composables/useIndexFields';

const SRC = join(__dirname, '..');
const fp = readFileSync(join(SRC, 'components/FieldPicker.vue'), 'utf-8');
const mt = readFileSync(join(SRC, 'components/MarkText.vue'), 'utf-8');

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
} } };

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountPicker(init: { index?: string } = {}) {
  const state = reactive({ modelValue: '', index: init.index ?? 'logs-2026.08' });
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({
    render: () => h(FieldPicker, {
      modelValue: state.modelValue,
      index: state.index,
      'onUpdate:modelValue': (v: string) => { state.modelValue = v; },
    }),
  });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, state };
}

const pop = () => document.body.querySelector('.fxp-pop');
const nameTexts = () => Array.from(document.body.querySelectorAll('.fxp-item .fxp-name')).map(el => el.textContent);
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.fxp-inp')!;
async function focus(host: ParentNode) { inp(host).dispatchEvent(new Event('focus')); await settle(); }
async function type(host: ParentNode, v: string) {
  const el = inp(host);
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await settle();
}

afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
});

describe('A hl() 注入通道退役 + MarkText 合并（源锚）', () => {
  it('v-html 零残留（全站最后一处高亮注入面收口）', () => {
    expect(fp).not.toContain('v-html');
  });

  it('本地 hl()/esc 整段删除（单一渲染分支=MarkText）', () => {
    expect(fp).not.toMatch(/\bhl\(/);
    expect(fp).not.toContain("'<mark>'");
    expect(fp).not.toContain('replace(/[&<>"]/g');
  });

  it('MarkText import + 模板在場：kw 口径=已 trim 末段 lastSeg（与 searchFields 内部 rawQ 同源）', () => {
    expect(fp).toContain("import MarkText from './MarkText.vue'");
    expect(fp).toContain('<MarkText :text="r.f!.path" :kw="lastSeg" />');
  });

  it('MarkText 头注契约自证（textContent 与原文一致）+ FieldPicker 样式零动（.fxp-name :deep(mark) 视觉不变锚）', () => {
    expect(mt).toContain('textContent 与原文一致');
    expect(fp).toContain('.fxp-name :deep(mark)');
  });
});

describe('B MarkText 渲染行为（textContent 等价 + mark 结构）', () => {
  it('空 query：候选全名平文无 mark（等价旧 esc 平文渲染）', async () => {
    const { host } = await mountPicker();
    await focus(host);
    expect(nameTexts()).toEqual(['message', 'message.keyword', 'status', 'user', 'user.age', 'user.name']);
    expect(document.body.querySelector('.fxp-item .fxp-name mark'), '空 query 不许出 mark').toBeNull();
  });

  it('命中：mark 包裹匹配段且 .fxp-name 整体 textContent=完整字段名（结构锁 fieldPicker.spec:167-176 同口径）', async () => {
    const { host } = await mountPicker();
    await focus(host);
    await type(host, 'user.n');
    expect(nameTexts()).toEqual(['user.name']);
    const mark = document.body.querySelector('.fxp-item .fxp-name mark');
    expect(mark, '匹配片段必须 <mark> 高亮').toBeTruthy();
    expect(mark!.textContent).toBe('user.n');
    expect(mark!.parentElement!.textContent, 'textContent 与原文一致（MarkText 头注契约）').toBe('user.name');
  });

  it('大小写不敏感命中：mark 段落回原文大小写（旧 hl() toLowerCase 口径不回退）', async () => {
    const { host } = await mountPicker();
    await focus(host);
    await type(host, 'MESSAGE');
    expect(nameTexts()).toEqual(['message', 'message.keyword']);
    const marks = Array.from(document.body.querySelectorAll('.fxp-item .fxp-name mark'));
    expect(marks.length).toBe(2);
    expect(marks.every(m => m.textContent === 'message'), 'mark 段必须=原文切片 message').toBe(true);
  });
});
