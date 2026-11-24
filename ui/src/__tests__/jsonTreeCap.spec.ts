/**
 * 二百二十九批 P0-2：JsonTree maxChildren / maxStrLen 渲染裁剪（单元格详情弹层防 MB 级值）。
 * 锁定：maxChildren 只渲染前 N 子+「… 共 N 项」提示行；maxStrLen 叶子截断+title 标注；
 * 默认参数（Infinity）下既有行为零变化。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import JsonTree from '../components/JsonTree.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTree(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(JsonTree as any, props) });
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('JsonTree 渲染裁剪（229 批 P0-2）', () => {
  it('maxChildren：只渲染前 N 子 + 裁剪提示行', async () => {
    await mountTree({ data: { a: 1, b: 2, c: 3, d: 4 }, maxChildren: 2 });
    const rows = [...host.querySelectorAll('.jnode .jrow')];
    const keys = rows.filter(r => !r.classList.contains('jmore')).map(r => r.querySelector('.j-key')?.textContent?.trim());
    expect(keys).toEqual(['a', 'b']);
    const more = host.querySelector('.jmore');
    expect(more?.textContent).toContain('共 4 项');
    expect(more?.textContent).toContain('前 2 项');
  });

  it('maxStrLen：叶子字符串截断 + title 标注全文', async () => {
    await mountTree({ data: { txt: 'a'.repeat(50) }, maxStrLen: 10 });
    const leaf = host.querySelector('.j-str') as HTMLElement;
    expect(leaf.textContent?.trim().length).toBeLessThanOrEqual(11);
    expect(leaf.textContent).toContain('…');
    expect(leaf.getAttribute('title')).toContain('已截断');
    expect(leaf.getAttribute('title')).toContain('a'.repeat(50));
  });

  it('默认参数（Infinity）：全量渲染无裁剪痕迹', async () => {
    await mountTree({ data: { a: 1, b: 2, c: 3, d: 4, txt: 'x'.repeat(50) } });
    expect(host.querySelectorAll('.jmore').length).toBe(0);
    const leaf = host.querySelector('.j-str') as HTMLElement;
    expect(leaf.textContent).toContain('x'.repeat(50));
  });
});
