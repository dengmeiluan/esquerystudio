/* 1021 批组件契约：highlight 字段级参数 schema 化（RootExtrasPane 高亮分区挂接）——
   ① 字段参数表升具名控件：type 三档枚举（plain/postings/fvh）+ fragment_size 等数值档；
     枚举换值/数值编辑写回（整树 serializeTree 往返一致）
   ② 未登记键（matched_fields…）自由表加键零丢失；全局参数表不受影响 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import { createPinia } from 'pinia';
import RootExtrasPane from '../builder/RootExtrasPane.vue';
import { parseTree, serializeTree, type QueryTree } from '../../utils/queryAst';

const apps: App[] = [];
function mountPane(tree: QueryTree) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(tree);
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value, fields: ['body', 'title'], types: { body: 'text', title: 'text' },
      index: '', 'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
    }),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

describe('1021 highlight 字段参数 schema 化', () => {
  function mkTree() {
    const t = parseTree({ highlight: { fields: { body: { fragment_size: 100, number_of_fragments: 3, type: 'plain' } } } });
    if (!t.ok) throw new Error('parse failed');
    return t.tree;
  }
  function openFieldParams(host: HTMLElement) {
    (host.querySelector('button[aria-label="字段参数（fragment_size…）"]') as HTMLElement).click();
  }
  /* 页面多个 .rx-sub（各分区）——scope 到字段参数面板（.rx-hl-row 内） */
  const panelSel = '.rx-hl-row .rx-sub';

  it('type 枚举下拉渲染（三档 + 既有值选中）；fragment_size 既有值在数值档', async () => {
    const { host } = mountPane(mkTree());
    openFieldParams(host);
    await tick();
    const sel = [...host.querySelectorAll<HTMLSelectElement>(`${panelSel} select`)].find(s => [...s.options].some(o => o.value === 'fvh'));
    expect(sel, 'type 枚举下拉').toBeTruthy();
    expect(sel!.value).toBe('plain');
    expect([...sel!.options].map(o => o.value)).toEqual(['plain', 'postings', 'fvh']);
    const inputs = [...host.querySelectorAll<HTMLInputElement>(`${panelSel} input`)];
    expect(inputs.some(i => i.value === '100')).toBe(true);
  });

  it('枚举换值写回字段 params；整树序列化往返一致', async () => {
    const { host, cur } = mountPane(mkTree());
    openFieldParams(host);
    await tick();
    const sel = [...host.querySelectorAll<HTMLSelectElement>(`${panelSel} select`)].find(s => [...s.options].some(o => o.value === 'fvh'))!;
    sel.value = 'postings';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(cur.value.highlight!.fields[0].params.type).toBe('postings');
    expect(serializeTree(cur.value)).toEqual({
      highlight: { fields: { body: { fragment_size: 100, number_of_fragments: 3, type: 'postings' } } },
    });
  });

  it('未登记键自由加（matched_fields）零丢失', async () => {
    const { host, cur } = mountPane(mkTree());
    openFieldParams(host);
    await tick();
    const addKey = host.querySelector<HTMLInputElement>(`${panelSel} .gp-add input`)!;
    addKey.value = 'matched_fields';
    addKey.dispatchEvent(new Event('input'));
    (host.querySelector(`${panelSel} .gp-add button`) as HTMLElement).click();
    await tick();
    expect('matched_fields' in cur.value.highlight!.fields[0].params).toBe(true);
  });
});
