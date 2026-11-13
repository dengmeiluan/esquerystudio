/**
 * Lucene 查询页在途示能三刀：
 * ① busy 混态甄别——busy 被执行链（useQueryRun）与字段体检链（doSchema）共享：
 *    体检在途时执行钮误显「执行中（Ns）…」（qr.elapsedMs 是上一查询的陈旧值）、
 *    取消钮 v-if="busy" 误现（qr 无在途 abort 可取消=死钮）；反向同理：查询在途时
 *    体检钮误显「体检中…」。修：示能/读秒归位语义所属链（SqlConsole 同语言）——
 *    执行钮读秒/Play spinning/取消钮随 qr.running，体检钮「体检中…」/ShieldAlert
 *    spinning 随新增 schemaBusy；互斥闸门（disabled）保持共享 busy 不变。
 *    另补 doRun 再入守卫（SqlBridge 同口径 busy||qr.running 双查）：执行钮 disabled
 *    挡得住点击，但 LuceneInput @enter（查询在途按 Enter）/历史回放/setSize 三通道
 *    可绕过 disabled 并发双跑——旧请求被 begin() abort 后其 finally 提前熄灭在途示能
 *    （qr.running 置假），第二跑全程无进度无取消。
 * ② useQueryRun begin() 计时器泄漏——begin 的连查形态（新查询即作废旧查询）下旧
 *    interval 句柄被直接覆盖不清：泄漏计时器在 finish 后继续用旧起点覆写 elapsedMs
 *    读数（finish 只清最新句柄）。修：begin 首段清旧计时器。
 * ③ copyLink 静默失败——copyText false（剪贴板被拒）零反馈，与域内五页双分支
 *    notify 口径冲突。修：ok 三元双分支（success 原文案 / error「复制失败」）。
 *
 * 挂载范式同 abortCancelVerdict924（api mock + 按钮点击）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      resolveSchema: vi.fn(() => Promise.resolve({ warnings: [] })),
      luceneSearch: vi.fn(() => Promise.resolve({})),
    },
  };
});

vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: vi.fn(() => Promise.resolve(true)) };
});

import LuceneQueryView from '../views/LuceneQueryView.vue';
import { useAppStore } from '../stores/app';
import { useQueryRun } from '../composables/useQueryRun';
import { copyText } from '../utils/format';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLucene() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(LuceneQueryView as never) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  const store = useAppStore(pinia);
  const notify = vi.spyOn(store, 'notify');
  return { host, notify };
}

function btnByText(host: ParentNode, text: string): HTMLButtonElement {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(x => x.textContent?.includes(text));
  expect(b, `「${text}」按钮必须在场`).toBeTruthy();
  return b!;
}

function findBtn(host: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(x => x.textContent?.includes(text));
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/?idx=i1';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/?idx=i1');
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('字段体检链与执行链示能归位（busy 混态甄别）', () => {
  it('体检在途：执行钮不误显读秒、取消死钮不在场、体检钮自显体检中', async () => {
    const { api } = await import('../api');
    let resSchema!: (v: unknown) => void;
    (api.resolveSchema as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(r => { resSchema = r; }));
    const { host } = await mountLucene();
    btnByText(host, '字段体检').click();
    await settle();
    const runBtn = btnByText(host, '执行');
    expect(runBtn.textContent, '体检在途时执行钮不得误显执行读秒（qr 读数是陈旧值）').not.toContain('执行中');
    expect(findBtn(host, '取消'), '体检在途时取消钮不得在场（qr 无在途可取消）').toBeUndefined();
    expect(btnByText(host, '体检中').textContent).toContain('体检中');
    resSchema({ warnings: [] });
    await settle();
    expect(btnByText(host, '字段体检').textContent, '体检完成后示能复位').toContain('字段体检');
  });

  it('查询在途：取消钮在场且读秒在场，体检钮不误显体检中', async () => {
    const { api } = await import('../api');
    let resSearch!: (v: unknown) => void;
    (api.luceneSearch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(r => { resSearch = r; }));
    const { host } = await mountLucene();
    btnByText(host, '执行').click();
    await settle();
    expect(findBtn(host, '取消'), '查询在途时取消钮必须在场').toBeTruthy();
    expect(btnByText(host, '执行中').textContent).toContain('执行中');
    expect(btnByText(host, '字段体检').textContent, '查询在途时体检钮不得误显体检中').toContain('字段体检');
    resSearch({ took: 5, hits: { total: { value: 0 }, hits: [] } });
    await settle();
  });

  it('doRun 再入守卫：首行 busy||qr.running 双查（SqlBridge 同口径）', () => {
    const src = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
    const body = src.slice(src.indexOf('async function doRun'), src.indexOf('页内历史回放'));
    expect(body, 'Enter/历史回放/改页大小通道绕过 disabled 时不得并发双跑')
      .toContain('if (!index.value.trim() || !qs.value.trim() || busy.value || qr.running.value) return;');
  });

  it('示能归位逐字锁：读秒/取消/Play 随 qr.running，体检示能随 schemaBusy', () => {
    const src = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
    expect(src).toContain(`<Play :size="12" :class="{ spinning: qr.running.value }" />`);
    expect(src).toContain(`{{ qr.running.value ? '执行中（' + (qr.elapsedMs.value / 1000).toFixed(1) + 's）…' : '执行' }}`);
    expect(src).toContain(`<button v-if="qr.running.value" class="btn sm" @click="qr.cancel()">`);
    expect(src).toContain(`<ShieldAlert :size="12" :class="{ spinning: schemaBusy }" /> {{ schemaBusy ? '体检中…' : '字段体检' }}`);
  });
});

describe('useQueryRun begin() 计时器泄漏', () => {
  it('finish 后读数冻结（begin 必须清理旧计时器句柄，防泄漏 interval 持续覆写）', () => {
    vi.useFakeTimers();
    try {
      const qr = useQueryRun();
      qr.begin();
      vi.advanceTimersByTime(1000);
      expect(qr.elapsedMs.value).toBeGreaterThanOrEqual(1000);
      qr.begin();
      vi.advanceTimersByTime(1000);
      qr.finish();
      const frozen = qr.elapsedMs.value;
      vi.advanceTimersByTime(500);
      expect(qr.elapsedMs.value, '泄漏的旧计时器会在 finish 后继续覆写读数').toBe(frozen);
      qr.finish();
    } finally { vi.useRealTimers(); }
  });
});

describe('copyLink 失败反馈', () => {
  it('copyText false → error「复制失败」toast；true → success 原文案', async () => {
    (copyText as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { host, notify } = await mountLucene();
    btnByText(host, '复制链接').click();
    await settle();
    expect(notify, '剪贴板失败不得静默').toHaveBeenCalledWith('error', expect.stringContaining('复制失败'));
    (copyText as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    btnByText(host, '复制链接').click();
    await settle();
    expect(notify).toHaveBeenCalledWith('success', expect.stringContaining('链接已复制'));
  });
});
