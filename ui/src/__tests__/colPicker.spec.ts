/**
 * R130 三十二批：ColPicker 共享列选组件守卫。
 * 背景：col-pick（ResultTable）与 qpick（QueryResultTable）两份同构模板/样式合并为此组件。
 * 锁定（受控组件契约）：
 * 1) 勾选/取消一列 → emit update:selected 整组新数组（不原地变异，父直接落 useTablePrefs 持久化）；
 * 2) 「全选/前 6」按 cols 基准 emit；
 * 3) 搜索框仅在字段多（>8）时出现且过滤列表。
 * 挂载走 createApp + 受控 ref 回写 + 事件收集器（项目不依赖 @vue/test-utils）。
 * 注意：n-popover 内容 teleport 到 body——断言一律查 document；happy-dom 下卸载前勿清
 * teleport DOM（removeFragment 会炸），mountPicker 内先卸旧 app 再挂新的。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

import ColPicker from '../components/ColPicker.vue';

const COLS = Array.from({ length: 10 }, (_, i) => 'f' + i);

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
const emitted: any[][] = [];

/** 挂 ColPicker 并打开 popover（点击触发钮）。selected 走受控 ref（事件回调回写），
    与 ResultTable/QueryResultTable 的真实用法（父层 visibleCols ref）同构。 */
async function mountPicker(props: { cols: string[]; selected: string[] }) {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
  emitted.length = 0;
  const sel = ref(props.selected);
  const app = createApp({
    setup() {
      return () => h(ColPicker as any, {
        cols: props.cols,
        selected: sel.value,
        'onUpdate:selected': (v: string[]) => { sel.value = v; emitted.push([v]); },
      });
    },
  });
  app.mount(host);
  apps.push(app);
  await nextTick();
  (host.querySelector('button') as HTMLButtonElement).click();
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('ColPicker 受控契约', () => {
  it('勾选一列 emit 整组新数组；取消则移除', async () => {
    await mountPicker({ cols: COLS, selected: ['f0', 'f1'] });
    const boxes = [...document.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.length).toBe(COLS.length);
    /* 取消 f0 → emit ['f1'] */
    boxes[0].click();
    await nextTick();
    expect(emitted[0]).toEqual([['f1']]);
    /* 勾回 f0 → emit ['f1','f0']（追加在尾部，序与 ResultTable 历史行为一致） */
    boxes[0].click();
    await nextTick();
    expect(emitted[1]).toEqual([['f1', 'f0']]);
  });

  it('全选/前 6 按 cols 基准 emit', async () => {
    await mountPicker({ cols: COLS, selected: [] });
    const btns = [...document.querySelectorAll('.col-pick-row button')] as HTMLButtonElement[];
    btns[0].click(); await nextTick();
    expect(emitted[0]).toEqual([COLS]);
    btns[1].click(); await nextTick();
    expect(emitted[1]).toEqual([COLS.slice(0, 6)]);
  });

  it('搜索框仅在字段多（>8）时出现且过滤列表', async () => {
    await mountPicker({ cols: ['a', 'b'], selected: ['a'] });
    expect(document.querySelector('input.inp')).toBeNull();
    await mountPicker({ cols: COLS, selected: [] });
    const inp = document.querySelector('input.inp') as HTMLInputElement;
    expect(inp).not.toBeNull();
    inp.value = 'f1';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(document.querySelectorAll('.col-pick-item').length).toBe(1);
  });
});

/* ═══ 一百七十七批：「前 N」N 值偏好（usePref esquerystudio.pref.table.firstn，全站共享，
   默认 6 与历史硬编码一致）——−/＋ 只调 N 落盘，「前 N」按当前 N 应用 ═══ */
describe('ColPicker 前 N 值偏好（一百七十七批）', () => {
  it('＋ 调 N 落盘；「前 N」按当前 N emit；重挂载恢复', async () => {
    await mountPicker({ cols: COLS, selected: [] });
    const btns = () => [...document.querySelectorAll('.col-pick-row button')] as HTMLButtonElement[];
    expect(btns()[1].textContent?.trim()).toBe('前 6'); // 默认与历史行为一致
    /* ＋ → N=7 落盘 */
    btns()[3].click();
    await nextTick();
    expect(btns()[1].textContent?.trim()).toBe('前 7');
    expect(JSON.parse(localStorage.getItem('esquerystudio.pref.table.firstn') || '0')).toBe(7);
    /* 「前 7」按当前 N emit */
    btns()[1].click();
    await nextTick();
    expect(emitted[0]).toEqual([COLS.slice(0, 7)]);
    /* 重挂载恢复 N=7（不经过 beforeEach 清 LS） */
    await mountPicker({ cols: COLS, selected: [] });
    expect((([...document.querySelectorAll('.col-pick-row button')] as HTMLButtonElement[])[1]).textContent?.trim()).toBe('前 7');
  });

  it('− 下限 1 不下探；文案/aria 可达', async () => {
    localStorage.setItem('esquerystudio.pref.table.firstn', JSON.stringify(1));
    await mountPicker({ cols: COLS, selected: [] });
    const btns = () => [...document.querySelectorAll('.col-pick-row button')] as HTMLButtonElement[];
    expect((btns()[2] as HTMLButtonElement).disabled).toBe(true); // − 到下限
    expect(btns()[2].getAttribute('aria-label')).toContain('减少');
    expect(btns()[3].getAttribute('aria-label')).toContain('增加');
    btns()[3].click();
    await nextTick();
    expect(btns()[1].textContent?.trim()).toBe('前 2');
  });
});
