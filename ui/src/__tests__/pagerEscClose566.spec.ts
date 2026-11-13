/**
 * 五百六十六批：分页每页条数弹层 Esc 收口（宪法铁律 D1#5「开弹层→Esc→焦点回触发器」）。
 *
 * 背景：563 四刀（0ab23b78）把原生 select 换 n-popover 受控弹层且漏 import NPopover
 * （组件不解析、触发钮不渲染、四枚选项胶囊裸平铺在工具行——indexHubQueryTab ② 随之红，
 * 该债已随补 import + 契约同步更新偿还）；但 Esc 关层语义在受控 :show 下悬空，
 * 补 document 捕获级 Esc 监听：关层 + 焦点还给触发钮 + 卸载兜底摘监听。
 *
 * naive-ui 用真的（indexHubQueryTab 五百六十六批同步更新先例：happy-dom 下 n-popover
 * 触发钮/选项胶囊均可渲染交互）。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import Pagination from '../components/Pagination.vue';

const settle = () => new Promise((r) => setTimeout(r, 40));

async function mountPager(onUpdatePageSize?: (s: number) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(Pagination, {
      page: 1,
      totalPages: 3,
      pageSize: 20,
      ...(onUpdatePageSize ? { 'onUpdate:pageSize': onUpdatePageSize } : {}),
    }),
  });
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  return { host, unmount: () => { app.unmount(); host.remove(); } };
}

describe('分页弹层 Esc 收口（五百六十六批；铁律 D1#5）', () => {
  it('开层→Esc→关层+焦点回触发钮；aria-expanded 全程受控', async () => {
    const { host, unmount } = await mountPager();
    const psel = host.querySelector<HTMLButtonElement>('.pgn-psel');
    expect(psel, '触发钮必须渲染（NPopover 已解析——563 四刀漏 import 先例在册）').toBeTruthy();
    expect(psel!.getAttribute('aria-expanded')).toBe('false');

    psel!.click();
    await settle();
    expect(psel!.getAttribute('aria-expanded'), '开层后 aria-expanded=true').toBe('true');
    const opts = [...document.querySelectorAll('.pgn-psize-opt')];
    expect(opts.length, '浮层须出选项胶囊（10/20/50/100）').toBeGreaterThanOrEqual(4);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(psel!.getAttribute('aria-expanded'), 'Esc 关层').toBe('false');
    expect(document.activeElement, '焦点回触发钮').toBe(psel);
    unmount();
  });

  it('点选项胶囊即关并 emit update:pageSize（选择即关回归锚）；Esc 以外按键不误关', async () => {
    const got: number[] = [];
    const { host, unmount } = await mountPager((s) => got.push(s));
    const psel = host.querySelector<HTMLButtonElement>('.pgn-psel')!;
    psel.click();
    await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(psel.getAttribute('aria-expanded'), '非 Esc 键不关层').toBe('true');
    const opt50 = [...document.querySelectorAll<HTMLButtonElement>('.pgn-psize-opt')]
      .find((o) => (o.textContent || '').trim().startsWith('50'));
    expect(opt50, '须有 50/页 选项').toBeTruthy();
    opt50!.click();
    await settle();
    expect(psel.getAttribute('aria-expanded'), '点选即关').toBe('false');
    expect(got, 'emit update:pageSize(50)').toEqual([50]);
    unmount();
  });

  it('源码锁：卸载兜底摘监听（onBeforeUnmount removeEventListener 与 watch 配对在场）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../components/Pagination.vue'), 'utf-8');
    expect(src).toContain("document.addEventListener('keydown', onSizeEsc, true)");
    expect(src).toContain("document.removeEventListener('keydown', onSizeEsc, true)");
    expect(src).toContain('onBeforeUnmount');
  });
});
