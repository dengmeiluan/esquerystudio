/* 1443：只靠点击的文本控件补键盘入口（迁移源信息芯片 / 查询语句片段）。 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QuerySentenceBar from '../components/builder/QuerySentenceBar.vue';

const xm = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
const qsb = readFileSync(join(__dirname, '../components/builder/QuerySentenceBar.vue'), 'utf-8');
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('1443 可点击文本补键盘入口', () => {
  it('迁移源信息芯片：role/tabindex/Enter/Space 与点击同函数', () => {
    expect(xm).toContain(`role="button" tabindex="0" :aria-label="'复制源信息：'`);
    expect(xm).toContain('@click.stop="copySrc(row)"');
    expect(xm).toContain('@keydown.enter.prevent="copySrc(row)"');
    expect(xm).toContain('@keydown.space.prevent="copySrc(row)"');
    expect(xm).toContain('function copySrc');
  });

  it('语句片段：仅可定位片段成为按钮并接 Enter/Space', () => {
    expect(qsb).toContain(`:role="p.nodeId ? 'button' : undefined"`);
    expect(qsb).toContain(':tabindex="p.nodeId ? 0 : undefined"');
    expect(qsb).toContain(`@keydown.enter.prevent="p.nodeId && emit('locate', p.nodeId)"`);
    expect(qsb).toContain(`@keydown.space.prevent="p.nodeId && emit('locate', p.nodeId)"`);
  });

  it('行为：聚焦可定位片段按 Enter/Space 触发 locate', async () => {
    const tree: any = { root: { id: 'b0', type: 'bool', params: {}, arrForm: {}, children: [
      { occur: 'filter', node: { id: 'n1', type: 'leaf', op: 'match', field: 'title', value: 'x', params: {}, raw: null } },
    ] } };
    const located: string[] = [];
    const app = createApp({ setup: () => () => h(QuerySentenceBar as any, { tree, onLocate: (id: string) => located.push(id) }) });
    app.mount(host);
    apps.push(app);
    await tick();
    const part = document.querySelector('.qsb-p.clk') as HTMLElement;
    expect(part, '可定位片段已渲染').toBeTruthy();
    expect(part.tabIndex).toBe(0);
    expect(part.getAttribute('role')).toBe('button');
    part.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(located, 'Enter 定位').toEqual(['n1']);
    part.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await tick();
    expect(located, 'Space 定位').toEqual(['n1', 'n1']);
  });
});
