/**
 * 单页分页器收纳：结果只有一页时，「上一页 / 页码 / 下一页」整组恒失效却常驻占宽
 * （实测索引工作区单页档 219px，页大小 + 翻页合计；翻页部分 ≈102px），
 * 而工具行在 1280px 已经折成两行——最纯粹的无效占位先收掉。
 *
 * 判据（真实挂载，不靠源码正则）：totalPages=1 时这三件都不在 DOM；
 * totalPages>1 时全部回来且可点。反向对照：把 v-if 条件改坏必须变红。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import Pagination from '../components/Pagination.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

async function mount(page: number, totalPages: number, pageSize?: number) {
  const app = createApp({ setup: () => () => h(Pagination as any, { page, totalPages, pageSize }) });
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
}

describe('单页分页器不占位', () => {
  it('totalPages=1：上一页/跳页/下一页都不渲染', async () => {
    await mount(1, 1, 20);
    expect(host.querySelector('[aria-label="上一页"]'), '上一页必须收掉').toBeNull();
    expect(host.querySelector('[aria-label="下一页"]'), '下一页必须收掉').toBeNull();
    expect(host.querySelector('input.pgn-jump'), '页码输入必须收掉').toBeNull();
    expect(host.querySelector('.pgn-pos'), '「/ N」必须收掉').toBeNull();
  });

  it('totalPages=1：每页条数保留（单页也能放大页大小看更多行）', async () => {
    await mount(1, 1, 20);
    expect(host.querySelector('.pgn-psel'), '每页条数是有效控件，不得一并收掉').toBeTruthy();
  });

  it('totalPages=2：三件全部回来，且下一页可点', async () => {
    await mount(1, 2, 20);
    expect(host.querySelector('.pgn-jump'), '多页时页码输入必须在场').toBeTruthy();
    expect(host.querySelector('.pgn-pos')!.textContent).toContain('2');
    const next = host.querySelector('[aria-label="下一页"]') as HTMLButtonElement;
    expect(next, '多页时下一页必须在场').toBeTruthy();
    expect(next.disabled, '1/2 页时下一页必须可点').toBe(false);
    expect((host.querySelector('[aria-label="上一页"]') as HTMLButtonElement).disabled, '首页上一页禁用').toBe(true);
  });

  it('负控：单页判据真的在拦（改成恒渲染必须变红）', async () => {
    /* 反向对照——证明上面 it1 的四个 toBeNull 不是「本来就查不到」：
       同一套选择器在 totalPages>1 时全都命中，说明选择器有效、
       差异只来自 v-if 判据本身。 */
    await mount(1, 3, 20);
    const hits = [
      '[aria-label="上一页"]', '[aria-label="下一页"]', 'input.pgn-jump', '.pgn-pos',
    ].filter(s => !!host.querySelector(s));
    expect(hits.length, '同一选择器在多页档必须 4/4 命中（否则 it1 是空转）').toBe(4);
  });
});
