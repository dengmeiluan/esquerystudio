/**
 * 五百六十五批·轨2 W2 件①：原始 IO 特征链扩容（openRawIo 判定链覆盖写路径动作）。
 *
 *  背景：DslQueryView openRawIo 只认 '/cluster/query' ?? '/cluster/profile'（551 双特征）——
 *  但本页还有五类动作入环后无法回看现场：
 *    · 文档保存 updateDocument   → /cluster/update-document
 *    · 新建文档 putDoc           → /cluster/doc
 *    · 删文档 deleteById（单条/批量）→ /cluster/delete-by-id
 *    · 按查询删除 deleteByQuery  → /cluster/delete-by-query
 *    · PIT 导出 pitOpen/pitSearch → /cluster/pit/
 *  修法：首段（query??profile，track2Wave551 黑名单锁面）零触，二段链扩容五特征；
 *  判空口径不变（五段全未命中才 notify 引导）。
 *
 *  ⚠IndexHubView 同项跳过备案（前提不成立，不硬改）：track2Wave551.spec:72（黑名单禁改）
 *  正则把 openRawIo 全函数体逐字冻结（scope 三元两分支到 rawIoShow=true 逐段钉死），
 *  query 分支扩任何特征串即击穿黑名单锁——IH 侧扩容留给锁同步更新批。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* ═══════════ 源码锁：特征链扩容在判定链中 ═══════════ */

describe('565 件①：DslQueryView openRawIo 特征链扩容（源码锁）', () => {
  it('首段 551 双特征零触（track2Wave551 黑名单锁面保全）', () => {
    expect(dq).toContain("const rec = ioRecorder.last('/cluster/query') ?? ioRecorder.last('/cluster/profile');");
  });

  it('二段扩容五特征逐一在判定链中（每类动作命名在册）', () => {
    const fn = dq.slice(dq.indexOf('function openRawIo()'), dq.indexOf('async function confirmSave'));
    expect(fn, 'openRawIo 函数体切片非空（防空跑）').toContain('rawIoShow.value = true;');
    /* 文档保存 updateDocument */
    expect(fn).toContain("ioRecorder.last('/cluster/update-document')");
    /* 新建文档 putDoc */
    expect(fn).toContain("ioRecorder.last('/cluster/doc')");
    /* 删文档 deleteById（单条/批量同通道） */
    expect(fn).toContain("ioRecorder.last('/cluster/delete-by-id')");
    /* 按查询删除 deleteByQuery */
    expect(fn).toContain("ioRecorder.last('/cluster/delete-by-query')");
    /* PIT 导出 pitOpen/pitSearch（open/search/close 同前缀） */
    expect(fn).toContain("ioRecorder.last('/cluster/pit/')");
    /* 二段链承接首段空档：rec2 承接 rec 回退（首段命中不重复扫描） */
    expect(fn).toMatch(/const rec2 = rec\s*\?\?/);
  });

  it('判空口径零触：五段全未命中才 notify 引导（550 口径）', () => {
    const fn = dq.slice(dq.indexOf('function openRawIo()'), dq.indexOf('async function confirmSave'));
    expect(fn).toContain("if (!rec2) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }");
  });

  it('IndexHubView 保持 scope 双参现状（扩容跳过备案：黑名单 551:72 全函数体冻结）', () => {
    const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
    expect(ih).toContain("? (ioRecorder.last('/cluster/raw') ?? ioRecorder.last('/cluster/query'))");
  });
});

/* ═══════════ 行为锁：写路径动作入环后 openRawIo 可开（挂载范式同 dqResilience546） ═══════════ */

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
  },
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

import DslQueryView from '../views/DslQueryView.vue';
import { ioRecorder } from '../api';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  localStorage.setItem('es_picked', 'idx-a');
  localStorage.setItem('es_dsl:idx-a', '{"query":{"match_all":{}}}');
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DslQueryView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle();
  return host;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  ioRecorder.clear();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('565 件①：写路径动作 → 原始 IO 可开（行为锁）', () => {
  it('文档保存动作（api.updateDocument 入环）后点原始 IO 钮：弹窗开出且展示 /cluster/update-document 现场', async () => {
    /* 走真实 request 内核让记录环真实落账（rawIo545 同手法——api 壳 mock 不触碰 ioRecorder） */
    const { post } = (await import('../api')) as unknown as { post: (p: string, b?: unknown) => Promise<unknown> };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    await post('/cluster/update-document?index=idx-a&id=1', '{"f":1}');
    vi.unstubAllGlobals();
    const host = await mountView();
    const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.getAttribute('aria-label') === '查看原始 IO（DSL 查询）');
    expect(btn, '工具行常驻原始 IO 钮在场').toBeTruthy();
    btn!.click();
    await settle();
    const url = document.body.querySelector('.rim-url');
    expect(url, 'RawIoModal 已开出').toBeTruthy();
    expect(url!.textContent).toContain('/cluster/update-document');
  });

  it('记录环全空：点钮不开空弹窗（判空引导口径零触）', async () => {
    const host = await mountView();
    const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('[aria-label="查看原始 IO（DSL 查询）"]'))[0];
    btn!.click();
    await settle();
    expect(document.body.querySelector('.rim-url'), '空环不开弹窗').toBeNull();
  });
});
