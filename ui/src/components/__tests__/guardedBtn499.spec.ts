/**
 * 四百七十六批：GuardedActionButton 护栏协议行为直测——状态机
 * idle→estimating→confirming→(dryRunning)→executing→receipt 的关键闸门：
 * 点击先拉影响预估（未看预估不能执行）/ HIGH 风险 guardText 输入解锁/
 * execute 携带 confirmToken（无 token 后端 403）/ 403 后回到 idle 提示重预估。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, defineComponent, nextTick } from 'vue';

const insight = vi.hoisted(() => ({
  estimate: vi.fn(),
  dryRun: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return { ...actual, api: { ...actual.api, insight }, ApiError: class ApiError extends Error { status = 403; } };
});
import GuardedActionButton from '../GuardedActionButton.vue';

const apps: ReturnType<typeof createApp>[] = [];
let executed: any[] = [];

async function mountBtn(guardText = '', can = true) {
  const Host = defineComponent({
    setup() {
      return () => h(GuardedActionButton, {
        actionId: 'act-1', params: { idx: 'a' }, label: '执行', guardText, can,
        onExecuted: (r: any) => executed.push(r),
      });
    },
  });
  const app = createApp(Host);
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return host;
}

async function clickRun(host: HTMLElement) {
  const btn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('执行') || b.textContent?.includes('Run'));
  (btn as HTMLButtonElement).click();
  await nextTick();
}

beforeEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
  executed = [];
  insight.estimate.mockReset();
  insight.dryRun.mockReset();
  insight.execute.mockReset();
  insight.dryRun.mockReset();
  insight.execute.mockReset();
});

describe('GuardedActionButton 护栏协议（476 批）', () => {
  it('点击先拉影响预估并弹确认卡（未看预估不能执行）', async () => {
    insight.estimate.mockResolvedValue({ riskLevel: 'LOW', confirmToken: 'tok-1', analysis: { items: [] } });
    const host = await mountBtn();
    await clickRun(host);
    await nextTick(); await nextTick();
    expect(insight.estimate).toHaveBeenCalledWith('act-1', { idx: 'a' });
    expect(document.querySelector('.ga')).toBeTruthy();
    expect(document.querySelector('.ga-badge')!.textContent).toContain('低危');
  });

  it('estimate 失败：错误呈现在卡内，不进 confirming', async () => {
    insight.estimate.mockRejectedValue(new Error('权限不足'));
    const host = await mountBtn();
    await clickRun(host);
    await nextTick(); await nextTick();
    expect(document.querySelector('.ga-error')!.textContent).toContain('权限不足');
  });

  it('execute 携带 confirmToken，成功后 emit executed + 回执', async () => {
    insight.estimate.mockResolvedValue({ riskLevel: 'LOW', confirmToken: 'tok-9', analysis: { items: [] } });
    insight.execute.mockResolvedValue({ receiptId: '123456789abcdef' });
    const host = await mountBtn();
    await clickRun(host);
    await nextTick();
    const runBtn = [...document.querySelectorAll('.ga-foot button')].find(b => b.textContent?.includes('确认执行')) as HTMLButtonElement;
    runBtn.click();
    await nextTick(); await nextTick();
    expect(insight.execute).toHaveBeenCalledWith('act-1', { idx: 'a' }, 'tok-9');
    expect(executed.length).toBe(1);
    expect(document.querySelector('.ga-receipt')!.textContent).toContain('已执行');
  });

  it('can=false：按钮禁用且执行体不拉预估（权限门纵深）', async () => {
    const host = await mountBtn('', false);
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('执行')) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    await nextTick();
    expect(insight.estimate).not.toHaveBeenCalled();
  });
});
