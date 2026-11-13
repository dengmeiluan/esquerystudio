/**
 * 二百二十八批 M6：就地编辑 IME 组字守卫。
 * 组字中的 Enter 是候选确认不是提交——此前会误触发 applyEdit 把拼音串存进 pending
 * （dbx 在 IME 上修过三轮：v0.5.62/v0.5.64/v0.6.6，同类坑）。
 * 锁定：compositionstart 期间 Enter 不提交；compositionend 后 Enter 正常提交进 pending。
 * 挂载样板照抄 multiSort（裸 createApp + pinia + api mock；me=null 时 can()=true 可编辑）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
 
void vi;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [{ _id: 'a', _source: { name: 'banana' } }] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl() {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 1, index: 'ime1' }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('就地编辑 IME 守卫（228 批 M6）', () => {
  it('组字中 Enter 不提交；组字结束 Enter 提交进 pending', async () => {
    await mountTbl();
    /* 双击进入编辑态 */
    const td = host.querySelector('td.rt-cell') as HTMLElement;
    td.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const inp = host.querySelector('input.rt-edit') as HTMLInputElement;
    expect(inp, '双击应进入编辑态').toBeTruthy();
    inp.value = '香蕉';
    /* v-model 监听 input 事件——直接赋值不触发，须派发 */
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    /* 组字中的 Enter=候选确认——组件守卫应拦截，不进 pending。
       （断言目标用 .rt-old 旧值划线元素：纯模板渲染；.pend-chip 经 n-popover trigger
       在 happy-dom 不挂载，不可作断言锚点） */
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(host.querySelector('.rt-old')).toBeNull();
    /* 组字结束（候选上屏）：compositionend + 值落定 input，此刻 Enter 才是提交语义 */
    inp.dispatchEvent(new Event('compositionend', { bubbles: true }));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    const oldTag = host.querySelector('.rt-old') as HTMLElement | null;
    expect(oldTag, '组字结束后的 Enter 应提交进待提交更改（旧值划线现身）').toBeTruthy();
    expect(oldTag?.textContent?.trim()).toBe('banana');
  });
});
