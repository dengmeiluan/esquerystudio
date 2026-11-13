/**
 * 五百六十九批：ModalShell 壳层 Esc 升 document 捕获级（566 Pagination / 568 ColFilterPopover
 * 约定范式推广；568 弹层台账 B 档头号遗留，宪法铁律 D1#5「开弹层→Esc→焦点回触发器」）。
 *
 * 缺陷实锚（568 台账②-3）：壳层原 mask 元素级修饰符依赖 mask 持焦点（tabindex=-1 族）——
 * 第三消费方 RawIoModal 零键盘接管，焦点在页面任意处（真实路径：点「原始 IO」钮后焦点留钮上，
 * Monaco 只读区也不持焦点）按 Esc 关不掉=真缺陷；ConfirmModal/GAB 有自持 window handler 兜底
 * 才合规，但与壳层构成双路径（元素级+window 级并存）。
 *
 * 约定形态：开层（show→true）即存触发时焦点，document 捕获级收 Esc（stopPropagation+emit
 * close），关层（show→false）摘监听+焦点回触发时焦点（还档=关层伴随效果，拒关场景如 GAB
 * executing 中 show 不变则焦点不动）；卸载兜底摘监听；壳元素级修饰符与 ConfirmModal/GAB
 * 自持分支退役单源化（emit close 与两消费方 cancel/close 语义逐一等价：ConfirmModal
 * @close=cancel、GAB @close=close 自带 executing 保护）。RawIoModal 零改动自动受益。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ModalShell from '../components/ModalShell.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import RawIoModal from '../components/RawIoModal.vue';

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'readonly', 'height'],
    template: '<div class="monaco-stub" :data-lang="language"></div>',
  },
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      insight: {
        ...actual.api.insight,
        estimate: vi.fn(async () => ({ riskLevel: 'LOW', summary: '影响很小', analysis: { items: [] }, confirmToken: 'tok', supportsDryRun: false })),
      },
    },
  };
});

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const apps: ReturnType<typeof createApp>[] = [];

async function tick(n = 6) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

/** 触发钮替身：弹层外先落一枚钮并聚焦（真实点击触发钮后的焦点态） */
function mountTrigger(): HTMLButtonElement {
  const trigger = document.createElement('button');
  trigger.className = 'fake-trigger';
  trigger.textContent = '触发';
  document.body.appendChild(trigger);
  trigger.focus();
  expect(document.activeElement, '前置：触发钮持焦点').toBe(trigger);
  return trigger;
}

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

describe('ModalShell Esc 收口升 document 捕获级（五百六十九批；铁律 D1#5）', () => {
  it('① 壳层直挂：焦点在弹层外按 Esc → emit close（RawIoModal 缺陷回归锚：元素级下此路恒 0）', async () => {
    mountTrigger();
    const events = { close: 0 };
    const app = createApp({ render: () => h(ModalShell as any, { show: true, label: '测试壳', onClose: () => { events.close++; } }) });
    app.use(createPinia());
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl); app.mount(hostEl);
    apps.push(app);
    await tick(4);
    expect(document.querySelector('.msk-box'), '弹层已开').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    expect(events.close, 'document 捕获级收 Esc（原 mask 元素级依赖 mask 持焦点，此路关不掉）').toBe(1);
  });

  it('② RawIoModal（真实消费方，零键盘接管）：焦点在弹窗外按 Esc → update:show false + 焦点回触发钮', async () => {
    const trigger = mountTrigger();
    const show = ref(true);
    const app = createApp({
      setup: () => () => h(RawIoModal as any, {
        show: show.value, rec: null,
        'onUpdate:show': (v: boolean) => { show.value = v; },
      }),
    });
    app.use(createPinia());
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl); app.mount(hostEl);
    apps.push(app);
    await tick(4);
    expect(document.querySelector('.msk-box'), '原始 IO 弹窗已开（空态）').toBeTruthy();
    /* 开层后焦点已被 ConfirmModal 族接管的场景不适用 RawIoModal——此处焦点仍在外部触发钮（真实路径） */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(4);
    await new Promise(r => setTimeout(r, 220)); /* 壳 transition pop-leave 120ms：happy-dom 等真实延时走完离场再断 DOM */
    expect(show.value, 'Esc → 弹窗关闭（原壳元素级收不到=568 台账真缺陷）').toBe(false);
    expect(document.querySelector('.msk-box'), '关闭后 DOM 摘除').toBeNull();
    expect(document.activeElement, '焦点回触发钮（触发时焦点存档-还档）').toBe(trigger);
  });

  it('③ ConfirmModal：Esc → update:show false（原自持分支退役后由壳层等价承接）+ 焦点回触发钮', async () => {
    const trigger = mountTrigger();
    const show = ref(true);
    const app = createApp({
      setup: () => () => h(ConfirmModal as any, {
        show: show.value, title: '确认操作', message: '确认执行此操作？',
        'onUpdate:show': (v: boolean) => { show.value = v; },
      }),
    });
    app.use(createPinia());
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl); app.mount(hostEl);
    apps.push(app);
    await tick(4);
    expect(document.querySelector('.cf'), '确认弹窗已开').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(4);
    expect(show.value, 'Esc → 取消关闭（壳 @close=cancel 与原自持分支语义等价）').toBe(false);
    expect(document.activeElement, '焦点回触发钮').toBe(trigger);
  });

  it('④ 非 Esc 键不误关 + Enter 不被壳层掐断（ConfirmModal Enter 接管语义保真）', async () => {
    const emits: string[] = [];
    mountTrigger();
    const app = createApp({
      setup: () => () => h(ConfirmModal as any, {
        show: true, title: '确认操作', message: 'x',
        onConfirm: () => emits.push('confirm'),
      }),
    });
    app.use(createPinia());
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl); app.mount(hostEl);
    apps.push(app);
    await tick(4);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await tick(2);
    expect(document.querySelector('.cf'), '普通字符键不关层').toBeTruthy();
    /* 中性焦点（触发钮在弹窗外=非中性）——改 body 焦点走 Enter 接管路径 */
    (document.activeElement as HTMLElement)?.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick(2);
    expect(emits, 'Enter=确认路径不经壳层（壳只拦 Escape），自持接管保真').toEqual(['confirm']);
  });

  it('⑤ GuardedActionButton：Esc → 关层（close 自带 executing 保护语义不变）', async () => {
    const { default: GAB } = await import('../components/GuardedActionButton.vue');
    mountTrigger();
    const app = createApp({
      render: () => h(GAB as any, { actionId: 'a', params: {}, label: '执行', can: true }),
    });
    app.use(createPinia());
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl); app.mount(hostEl);
    apps.push(app);
    await tick(4);
    (document.querySelector('.btn.pri') as HTMLButtonElement)!.click();
    await tick(6);
    expect(document.querySelector('.ga'), '影响预估弹窗已开').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(4);
    await new Promise(r => setTimeout(r, 220)); /* 壳 transition pop-leave 120ms 离场等待（同②） */
    expect(document.querySelector('.ga'), 'Esc → 弹窗关闭（壳 @close=close，拒关保护在消费方函数内不变）').toBeNull();
  });

  it('⑥ 关层后监听摘除：show→false 再按 Esc 无 close（消费方主动关闭路径不残留）', async () => {
    mountTrigger();
    const events = { close: 0 };
    const show = ref(true);
    const app = createApp({
      setup: () => () => h(ModalShell as any, {
        show: show.value, label: '测试壳',
        onClose: () => { events.close++; },
        'onUpdate:show': undefined,
      }),
    });
    app.use(createPinia());
    const hostEl = document.createElement('div'); document.body.appendChild(hostEl); app.mount(hostEl);
    apps.push(app);
    await tick(4);
    show.value = false;
    await tick(4);
    const before = events.close;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    expect(events.close, '关层后 document 捕获级监听已摘').toBe(before);
  });

  it('⑦ 源码锁：壳元素级修饰符与 tabindex 退役 + ConfirmModal/GAB 自持分支退役单源化', () => {
    const ms = read('../components/ModalShell.vue');
    expect(ms, '壳模板元素级 esc 修饰符退役（document 捕获级单源，双源即回归）').not.toContain('@keydown');
    expect(ms, 'mask tabindex 孤儿退役（其唯一服务对象是元素级收键形态）').not.toContain('tabindex');
    const cf = read('../components/ConfirmModal.vue');
    expect(cf, 'ConfirmModal 自持 Esc 分支退役（壳层单源承接，语义等价 cancel）').not.toMatch(/'Escape'\s*\)\s*\{\s*cancel\(\)/);
    const gab = read('../components/GuardedActionButton.vue');
    expect(gab, 'GAB 自持 Esc 分支退役（壳层单源承接，语义等价 close）').not.toMatch(/'Escape'/);
  });
});
