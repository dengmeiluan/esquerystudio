/**
 * 二百四十四批：行内编辑 Tab 链根治 + F2 键盘进编辑。
 * ① 数据丢失根治——旧实现指望 blur 提交，但 blur 触发时 editing 已被换成下一格状态，
 *    applyEdit 读到的是新格未变的值直接早退，旧格已敲的修改被静默丢弃；现 Tab 键内
 *    先同步 applyEdit（此刻 editing 仍是旧格），再开下一格。
 * ② Tab 跨行循环真实化——行尾跨到下一行首列、行首反向跨到上一行末列、表边界停住
 *    （128 批注释宣称、实现只有同行 ±1，注释与实现自此合一）。
 * ③ F2=编辑高亮行首列（Excel F2 惯例）——此前键盘无路径进入行内编辑。
 * 挂载样板照抄 rtImeEdit（裸 createApp + pinia + api mock；me=null 时 can()=true 可编辑）。
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

const HITS: SearchHit[] = [
  { _id: 'r1', _source: { a: 1, b: 2, c: 3 } },
  { _id: 'r2', _source: { a: 4, b: 5, c: 6 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl() {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 2, index: 'tab244' }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const settle = async () => { await new Promise(r => setTimeout(r, 8)); await tick(); };
const cell = (ri: number, col: string) => host.querySelector(`td[data-ri="${ri}"][data-col="${col}"]`) as HTMLElement;
const editInp = () => host.querySelector('input.rt-edit') as HTMLInputElement | null;

async function dblclickEdit(ri: number, col: string) {
  cell(ri, col).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await tick();
}
/** 编辑框内改值（v-model 监听 input 事件，直接赋值不触发须派发） */
function typeVal(v: string) {
  const inp = editInp()!;
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}
function tab(back = false) {
  editInp()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('行内编辑 Tab 链（244 批）', () => {
  it('Tab 先同步提交旧格（改值进 pending 不再丢）再跳同行下一格', async () => {
    await mountTbl();
    await dblclickEdit(0, 'a');
    expect(editInp(), '双击应进入编辑态').toBeTruthy();
    typeVal('999');
    tab();
    await settle();
    /* 旧格 a 的修改必须进待提交（数据丢失根治——旧实现此处 .rt-old 不现身） */
    const oldTag = host.querySelector('.rt-old') as HTMLElement | null;
    expect(oldTag, '旧格改值应进 pending（.rt-old 现身）').toBeTruthy();
    /* 焦点移到同行下一格 b：编辑框落位 td[data-col=b]、值预填原值 */
    const inp = editInp();
    expect(inp, 'Tab 后应开下一格编辑').toBeTruthy();
    const td = inp!.closest('td') as HTMLElement;
    expect(td.dataset.col, '同行下一格=b').toBe('b');
    expect(td.dataset.ri, '同行=ri 0').toBe('0');
    expect(inp!.value, '新格预填原值').toBe('2');
  });

  it('行尾跨到下一行首列；Shift+Tab 反向跨到上一行末列', async () => {
    await mountTbl();
    await dblclickEdit(0, 'c');
    tab();
    await settle();
    let inp = editInp();
    expect(inp, '行尾 Tab 应开下一行首格').toBeTruthy();
    let td = inp!.closest('td') as HTMLElement;
    expect(td.dataset.ri, '跨到下一行').toBe('1');
    expect(td.dataset.col, '下一行首列=a').toBe('a');
    /* Shift+Tab 反向：从 r2 的 a 回跨到 r1 的 c（上一行末列） */
    inp!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    inp = editInp();
    expect(inp, 'Shift+Tab 行首应开上一行末格').toBeTruthy();
    td = inp!.closest('td') as HTMLElement;
    expect(td.dataset.ri, '反向跨回上一行').toBe('0');
    expect(td.dataset.col, '上一行末列=c').toBe('c');
  });

  it('表边界停住：末行末格 Tab 只提交不回卷；值未变不进 pending', async () => {
    await mountTbl();
    await dblclickEdit(1, 'c');
    /* 未改值直接 Tab：提交空操作（不进 pending），且已到末行末格——无处可跳 */
    tab();
    await settle();
    expect(editInp(), '表边界外不应再开新编辑框').toBeNull();
    expect(host.querySelector('.rt-old'), '未改值不应进 pending').toBeNull();
  });

  it('F2 编辑高亮行首列（键盘进编辑）', async () => {
    await mountTbl();
    const root = host.querySelector('div.rt') as HTMLElement;
    /* ↑ 先置行焦点（focusIdx -1→0），再 F2 */
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    await tick();
    const inp = editInp();
    expect(inp, 'F2 应进入编辑态').toBeTruthy();
    const td = inp!.closest('td') as HTMLElement;
    expect(td.dataset.ri, '高亮行=第 1 行').toBe('0');
    expect(td.dataset.col, '首列=a').toBe('a');
    expect(inp!.value, '预填原值').toBe('1');
  });
});
