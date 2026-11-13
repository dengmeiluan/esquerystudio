/**
 * 940 批：SecurityView 走查三刀。
 *
 * 刀① doRebind 执行闸读缺失+置位后移：函数体首行直接 askConfirm，rbBusy 置位在
 *   确认窗 await 之后——确认窗挂起期间 rbBusy=false、重绑钮可点，二击穿透闸双开
 *   确认窗（全局单例状态覆写非队列），两支都确认后 /setup/rebind 双发（集群级高危写）。
 *   修法口径=闸读收本体首行+置位前移到第一个 await 之前+try/finally 包裹（取消路径
 *   finally 复位防闸死；成功路径保持置位至 reload；templateSaveGate937/diagOpsGate938
 *   同族口径）。
 * 刀② doUpsert 置位后移：闸读首行已在案（formAuditSweep 锁面），置位在确认窗
 *   await 之后——同名用户更新确认窗挂起期间保存钮可点，二击穿透双开确认窗，
 *   两支都确认 upsertUser 双发（更新角色+重置密码双发）。
 * 刀③ doDelete 置位后移：同②形态——删除用户 critical 确认窗挂起期间行内删除钮
 *   可点，二击穿透双发 deleteUser。
 * 刀④ .detail 死规则退役：旧审计裸表详情列截断样式，QRT 换壳后零消费（模板唯一
 *   detail 系类=detail-txt 单 token，不匹配 .detail 选择器）。
 *
 * 锁定形态：行为锚（视图全真挂载+askConfirm 手控回包）+源码锁双通道；
 * formAuditSweep 的 doUpsert 闸读字面、dangerConfirmGuard416 的 askConfirm 参数
 * 形态、inflightPatrol798 的模板钮面锚共处零扰动。rebind 出口挂起（成功 reload 链
 * 不排程，测试环境零导航副作用）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const askConfirmFn = vi.fn();
const usersFn = vi.fn();
const upsertFn = vi.fn();
const delUserFn = vi.fn();
const opsAuditFn = vi.fn();
const opsAuditMineFn = vi.fn();
const facetsFn = vi.fn();
const statusFn = vi.fn();
const rebindFn = vi.fn();
const changePwFn = vi.fn();

vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        ...actual.api.auth,
        users: (...a: any[]) => usersFn(...a),
        upsertUser: (...a: any[]) => upsertFn(...a),
        deleteUser: (...a: any[]) => delUserFn(...a),
        changePassword: (...a: any[]) => changePwFn(...a),
        auditFacets: (...a: any[]) => facetsFn(...a),
        opsAudit: (...a: any[]) => opsAuditFn(...a),
        opsAuditMine: (...a: any[]) => opsAuditMineFn(...a),
      },
      setup: {
        ...actual.api.setup,
        status: (...a: any[]) => statusFn(...a),
        rebind: (...a: any[]) => rebindFn(...a),
      },
    },
  };
});

import SecurityView from '../views/SecurityView.vue';
import { useAuthStore } from '../stores/auth';

const apps: ReturnType<typeof createApp>[] = [];
let pendingConfirms: { res: (v: boolean) => void }[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const USER_BOB = { username: 'bob', role: 'VIEWER', updatedAt: 1750000000000 };
const AUDIT_ROW = { timestamp: 1750000000000, username: 'bob', displayName: 'bob', role: 'VIEWER', source: 'console', action: 'LOGIN', method: 'GET', uri: '/internal/es/index/auth/me', connName: 'c1', connId: 'c1', ip: '127.0.0.1', httpStatus: 200, costMs: 5, detail: '' };

async function mountSec(): Promise<HTMLElement> {
  pendingConfirms = [];
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore(pinia);
  auth.me = { username: 't', role: 'ADMIN', fallback: false };
  const app = createApp({ render: () => h(SecurityView as any) });
  app.use(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle();
  return host;
}

function btnByText(host: ParentNode, label: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b => (b.textContent || '').trim() === label);
  if (!btn) throw new Error('button not found: ' + label);
  return btn;
}

function releaseConfirm(v: boolean) {
  const p = pendingConfirms.shift();
  if (!p) throw new Error('no pending confirm');
  p.res(v);
}

async function fill(host: ParentNode, placeholder: string, value: string) {
  const el = [...host.querySelectorAll<HTMLInputElement>('input')].find(i => i.placeholder === placeholder);
  if (!el) throw new Error('input not found: ' + placeholder);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(2); /* v-model ref 同步接住，:disabled 绑定的 DOM patch 待 flush（764 setKw 同范式） */
}

const RB_URL_PH = 'http://es-host:9200';
const NU_NAME_PH = '用户名';
const NU_PASS_PH = '密码（更新时留空=只改角色）';

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  pendingConfirms = [];
  askConfirmFn.mockReset().mockImplementation(() => new Promise<boolean>((res) => { pendingConfirms.push({ res }); }));
  usersFn.mockReset().mockResolvedValue([USER_BOB]);
  upsertFn.mockReset().mockResolvedValue({});
  delUserFn.mockReset().mockResolvedValue({});
  opsAuditFn.mockReset().mockResolvedValue({ records: [AUDIT_ROW] });
  opsAuditMineFn.mockReset().mockResolvedValue({ records: [] });
  facetsFn.mockReset().mockResolvedValue({ actions: [], conns: [], users: [], uris: [] });
  statusFn.mockReset().mockResolvedValue({ bound: true, mode: 'BOOTSTRAP', endpoint: 'http://es1:9200', appName: 't', hostVisible: true });
  rebindFn.mockReset().mockImplementation(() => new Promise<void>(() => { /* 挂起 */ }));
  changePwFn.mockReset().mockResolvedValue({});
});
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('940 SecurityView 重绑执行闸（刀①）', () => {
  it('确认窗在途期间二击不穿透：确认计数恒 1、确认窗期间钮面即禁用、单发', async () => {
    const host = await mountSec();
    await fill(host, RB_URL_PH, 'http://new-cluster:9200');
    const btn = btnByText(host, '重绑');
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    /* 闸置位前移后钮面在确认窗期间即禁用（穿透窗消除） */
    expect(btn.disabled).toBe(true);
    btn.click();                                   /* 二击：闸读+钮面禁用双保险 */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(6);
    expect(rebindFn).toHaveBeenCalledTimes(1);     /* 单发铁证（出口挂起=成功 reload 链不排程） */
  });

  it('取消路径复位防闸死：确认窗取消后可再次发起', async () => {
    const host = await mountSec();
    await fill(host, RB_URL_PH, 'http://new-cluster:9200');
    const btn = btnByText(host, '重绑');
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(false);
    await settle(6);
    expect(btn.disabled).toBe(false);
    expect(rebindFn).not.toHaveBeenCalled();
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2); /* 可再进确认 */
    releaseConfirm(true);
    await settle(6);
    expect(rebindFn).toHaveBeenCalledTimes(1);
  });
});

describe('940 SecurityView 用户保存执行闸（刀②）', () => {
  it('同名用户更新确认窗在途期间二击不穿透：确认恒 1、保存钮即禁用、单发', async () => {
    const host = await mountSec();
    await fill(host, NU_NAME_PH, 'bob');
    await fill(host, NU_PASS_PH, 'secret1');
    const btn = btnByText(host, '保存');
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    expect(btn.disabled).toBe(true);
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(6);
    expect(upsertFn).toHaveBeenCalledTimes(1);
  });

  it('取消路径复位：确认窗取消后可再次发起且提交未发生', async () => {
    const host = await mountSec();
    await fill(host, NU_NAME_PH, 'bob');
    await fill(host, NU_PASS_PH, 'secret1');
    const btn = btnByText(host, '保存');
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(false);
    await settle(6);
    expect(btn.disabled).toBe(false);
    expect(upsertFn).not.toHaveBeenCalled();
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);
    releaseConfirm(true);
    await settle(6);
    expect(upsertFn).toHaveBeenCalledTimes(1);
  });
});

describe('940 SecurityView 用户删除执行闸（刀③）', () => {
  it('删除确认窗在途期间二击不穿透：确认恒 1、行内钮即禁用、单发', async () => {
    const host = await mountSec();
    const del = host.querySelector<HTMLButtonElement>('button[aria-label="删除"]');
    expect(del, '行内删除钮必须在场（users 表渲染）').toBeTruthy();
    del!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    expect(del!.disabled).toBe(true);
    del!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(true);
    await settle(6);
    expect(delUserFn).toHaveBeenCalledTimes(1);
  });

  it('取消路径复位：确认窗取消后可再次发起且提交未发生', async () => {
    const host = await mountSec();
    const del = host.querySelector<HTMLButtonElement>('button[aria-label="删除"]');
    expect(del).toBeTruthy();
    del!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    releaseConfirm(false);
    await settle(6);
    expect(del!.disabled).toBe(false);
    expect(delUserFn).not.toHaveBeenCalled();
    del!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);
    releaseConfirm(true);
    await settle(6);
    expect(delUserFn).toHaveBeenCalledTimes(1);
  });
});

describe('940 SecurityView 源码锁（刀①②③④）', () => {
  const src = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');

  it('三执行体置位先于确认窗 await（闸读收本体首行已在案域）', () => {
    const cut = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to));
    const rebind = cut('async function doRebind', 'onMounted(');
    expect(rebind, '闸读收本体首行').toContain('if (rbBusy.value) return;');
    expect(rebind.indexOf('rbBusy.value = true;')).toBeGreaterThan(-1);
    expect(rebind.indexOf('rbBusy.value = true;'), '置位必须先于确认窗').toBeLessThan(rebind.indexOf('askConfirm'));
    const upsert = cut('async function doUpsert', 'async function doDelete');
    expect(upsert.indexOf('nuBusy.value = true;'), '置位必须先于确认窗').toBeLessThan(upsert.indexOf('askConfirm'));
    const del = cut('async function doDelete', 'async function fetchAuditPage');
    expect(del.indexOf('deleting.value = true;'), '置位必须先于确认窗').toBeLessThan(del.indexOf('askConfirm'));
  });

  it('.detail 死规则零残留（旧审计裸表截断样式，QRT 换壳后无消费面）', () => {
    expect(src).not.toMatch(/^\.detail \{/m);
  });
});
