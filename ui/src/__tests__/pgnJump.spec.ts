/**
 * 二百三十三批 P2-6：分页页码输入跳页（dbx 页码 Enter 跳页对位）。
 * 锁定：合法页码 Enter/blur 提交 update:page；越界钳位首末页；非法输入回落 1；
 * 同页提交不派发（防冗余触发父级翻页）。
 * 挂载用裸 createApp + 事件收集器（项目不依赖 @vue/test-utils）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import Pagination from '../components/Pagination.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

async function mountPgn(page: number, totalPages: number) {
  const pageRef = ref(page);
  const emitted: number[] = [];
  const app = createApp({
    setup() {
      return () => h(Pagination as any, {
        page: pageRef.value,
        totalPages,
        'onUpdate:page': (p: number) => { emitted.push(p); pageRef.value = p; },
      });
    },
  });
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
  return { emitted, pageRef };
}

const inp = () => host.querySelector('input.pgn-jump') as HTMLInputElement;
const enter = async (el: HTMLInputElement) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  for (let i = 0; i < 3; i++) { await nextTick(); await Promise.resolve(); }
};

describe('Pagination 页码跳页（233 批 P2-6）', () => {
  it('合法页码 Enter 提交 update:page（受控回写）', async () => {
    const { emitted } = await mountPgn(1, 5);
    inp().value = '3';
    await enter(inp());
    expect(emitted).toEqual([3]);
    expect(inp().value).toBe('3');
  });

  it('越界钳位：99 → 末页；0 → 首页', async () => {
    const { emitted } = await mountPgn(1, 5);
    inp().value = '99';
    await enter(inp());
    expect(emitted).toEqual([5]);
    inp().value = '0';
    await enter(inp());
    expect(emitted).toEqual([5, 1]);
  });

  it('父级拒绝翻页（超窗口守卫）→ 输入框回显真实页', async () => {
    const pageRef = ref(1);
    const emitted: number[] = [];
    const app = createApp({
      setup() {
        return () => h(Pagination as any, {
          page: pageRef.value,
          totalPages: 1000,
          'onUpdate:page': (p: number) => { emitted.push(p); /* 拒绝：不回写 pageRef */ },
        });
      },
    });
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    inp().value = '501';
    await enter(inp());
    expect(emitted).toEqual([501]);
    expect(pageRef.value, '页面仍停真实页').toBe(1);
    expect(inp().value, '输入框不得残留被拒页码').toBe('1');
  });

  it('非法输入回落 1；同页提交不派发', async () => {
    const { emitted } = await mountPgn(2, 5);
    inp().value = 'abc';
    await enter(inp());
    expect(emitted).toEqual([1]);
    /* 当前页 1 输入 1 → 不派发 */
    inp().value = '1';
    await enter(inp());
    expect(emitted.length).toBe(1);
  });
});
