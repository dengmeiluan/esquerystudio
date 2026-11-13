/**
 * 五百七十批：FocusableSurface Esc 退出焦点回置收口（宪法铁律 D1#5「开弹层→Esc→焦点回
 * 触发器」在放大面上的全站执法；566/568/569 弹层 Esc 立法同主题延伸）。
 *
 * 缺陷实锚（570 开工静态侦察）：焦点存档只存在于 activate()（fs-btn 点击路径）——
 * ①headless 消费面（RT/QRT/LiveDashboard/SearchSandbox，放大钮在自家工具行，
 *   @click="focused = !focused" 外部直切）②focusPaneId 消费面（DevTools×2/
 *   SearchTemplates/LuceneQuery/PitScroll，focusPane(id) 外部直切）两条路径全站
 *   9+ 消费面都绕过 activate()：triggerEl 恒 null，Esc 退出后焦点滞留 fs 根
 *   （tabindex 已随 fs-active 摘除）或 body=键盘用户丢位置。
 * 立法形态：存档统一上移 watch(enabled) on 分支（与 569 ModalShell「触发时焦点存档-
 * 还档」同范式单源），fs-btn 路径语义等价（emit→watch 同步链内 activeElement 仍是
 * 触发钮）；IndexHub 自制放大态（530 批 onFsKeydown）同批补存还档（源码锁⑤）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, defineComponent, ref, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import FocusableSurface from '../FocusableSurface.vue';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const apps: ReturnType<typeof createApp>[] = [];

async function tick(n = 4) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }
/** 等待 watch on 分支的 requestAnimationFrame(() => rootEl.focus()) 真正执行 */
async function rafSettle() {
  await new Promise(r => requestAnimationFrame(() => r(null)));
  await new Promise(r => requestAnimationFrame(() => r(null)));
  await tick(1);
}

/** 触发钮替身：放大面前先落一枚钮并持焦点（真实点击触发钮后的焦点态，567-C2 显式 focus 手段） */
function mountTrigger(): HTMLButtonElement {
  const trigger = document.createElement('button');
  trigger.className = 'fake-fs-trigger';
  trigger.textContent = '触发';
  document.body.appendChild(trigger);
  trigger.focus();
  expect(document.activeElement, '前置：触发钮持焦点').toBe(trigger);
  return trigger;
}

beforeEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
});

afterEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
});

describe('FocusableSurface Esc 退出焦点回置（五百七十批；铁律 D1#5）', () => {
  it('① headless 外部钮路径：Esc 退出放大 → 焦点回外部触发钮（RT/QRT 等全站 headless 消费面同构）', async () => {
    const trigger = mountTrigger();
    const enabled = ref(false);
    const Host = defineComponent({
      setup() {
        return () => h('div', [
          h('button', { class: 'ext-toggle', onClick: () => { enabled.value = !enabled.value; } }, '外部放大钮'),
          h(FocusableSurface, {
            paneId: 'x.table', title: '结果表', headless: true, enabled: enabled.value,
            'onUpdate:enabled': (v: boolean) => { enabled.value = v; },
          }, { default: () => h('div', 'body-content') }),
        ]);
      },
    });
    const app = createApp(Host);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    apps.push(app);
    await tick();

    const extBtn = host.querySelector<HTMLButtonElement>('.ext-toggle')!;
    extBtn.focus();
    extBtn.click();
    await tick();
    expect(enabled.value, '外部钮切换进入放大态').toBe(true);
    await rafSettle();
    const section = host.querySelector('section.fs')!;
    expect(section.classList.contains('fs-active'), '放大态在').toBe(true);
    expect(document.activeElement, '前置：放大态焦点已被面根接住（rAF focus rootEl）').toBe(section);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(enabled.value, 'Esc 退出放大态').toBe(false);
    expect(document.activeElement, '焦点回外部触发钮（修复前 triggerEl 恒 null=焦点滞留 fs 根）').toBe(extBtn);
    expect(document.activeElement, '回的是外部钮而非触发替身').not.toBe(trigger);
    expect(document.body.style.overflow, '退出还滚动').toBe('');
  });

  it('② fs-btn 路径：存档上移 watch 后语义等价（Esc 退出焦点仍回触发钮）', async () => {
    mountTrigger();
    const enabled = ref(false);
    const Host = defineComponent({
      setup() {
        return () => h(FocusableSurface, {
          paneId: 'y.pane', title: '响应', enabled: enabled.value,
          'onUpdate:enabled': (v: boolean) => { enabled.value = v; },
        }, { default: () => h('div', 'body-content') });
      },
    });
    const app = createApp(Host);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    apps.push(app);
    await tick();

    const fsBtn = host.querySelector<HTMLButtonElement>('.fs-btn')!;
    fsBtn.focus();
    fsBtn.click();
    await tick();
    expect(enabled.value).toBe(true);
    await rafSettle();
    const section = host.querySelector('section.fs')!;
    expect(document.activeElement, '前置：放大态焦点在面根').toBe(section);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(enabled.value, 'Esc 退出').toBe(false);
    expect(document.activeElement, '焦点回 fs-btn（activate 存档退役由 watch 单源承接，403 语义保真）').toBe(fsBtn);
  });

  it('③ 非 Esc 键不误退放大态；输入控件内 Esc 让位（四四五批语义保真）', async () => {
    const enabled = ref(true);
    const Host = defineComponent({
      setup() {
        return () => h(FocusableSurface, {
          paneId: 'z.pane', title: '面', enabled: enabled.value,
          'onUpdate:enabled': (v: boolean) => { enabled.value = v; },
        }, { default: () => h('input', { class: 'in-face' }) });
      },
    });
    const app = createApp(Host);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    apps.push(app);
    await tick();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    await tick();
    expect(enabled.value, '普通字符键不退放大态').toBe(true);

    const input = host.querySelector('input')!;
    input.focus();
    /* 从 input 元素派发（target=input 走捕获→目标链路）；document.dispatchEvent 的 target 恒为
       document，永远命中不了 INPUT 让位分支——567-C3 断言对象先行甄别 */
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(enabled.value, '焦点在 INPUT：Esc 让位给输入控件自消费（Monaco 查找/撤销），不直接退面').toBe(true);
  });

  it('④ 源码锁：焦点存档单源化到 watch(on) 分支（activate 存档退役，双源即回归）', () => {
    const src = read('../FocusableSurface.vue');
    /* 切片语义锁（判例 568-C1 姊妹：toMatch 的 \s* 跨不过注释块，锚语义不锚排版） */
    const activateBody = src.slice(src.indexOf('function activate'), src.indexOf('function deactivate'));
    expect(activateBody, 'activate() 体内不再存档（emit 前存档与 watch 存档构成双源，单源化到 watch）')
      .not.toContain('triggerEl');
    const watchBody = src.slice(src.indexOf('watch(() => props.enabled'));
    expect(watchBody, 'watch on 分支存触发时焦点（headless/focusPaneId 外部直切路径的存档单源）')
      .toContain('triggerEl = (document.activeElement');
    expect((src.match(/triggerEl = \(document\.activeElement/g) || []).length, '全文件存档恰好一处').toBe(1);
  });

  it('⑤ 源码锁：IndexHub 自制放大态（530 批 onFsKeydown）同批补焦点存还档', () => {
    const src = read('../../views/IndexHubView.vue');
    expect(src, 'toggleFs 放大时存触发钮（Esc 还档的档源）')
      .toContain('fsTrigger = (document.activeElement');
    const onFsBody = src.slice(src.indexOf('function onFsKeydown'), src.indexOf('watch(fsActive'));
    expect(onFsBody, 'onFsKeydown Esc 退出分支内还档到触发钮')
      .toContain('if (fsTrigger && document.contains(fsTrigger)) fsTrigger.focus();');
    expect(onFsBody, '触发钮已随抽屉卸载时（放大即收抽屉）兜底回页头「索引列表」钮=放大链路入口')
      .toContain('[aria-label="索引列表"]');
  });
});
