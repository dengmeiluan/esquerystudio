/* 1000 批：检索器（retriever 8.14+）组件契约——RootExtrasPane chip/面板/自动展开 +
   RetrieverEditor 六变体渲染、knn 向量框防抖写、linear 权重行内编辑、变体切换换新节点。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import RootExtrasPane from '../builder/RootExtrasPane.vue';
import { parseTree, serializeTree, type QueryTree } from '../../utils/queryAst';

const apps: App[] = [];
const tick = () => nextTick();
beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

function mountPane(src: unknown) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = parseTree(src);
  if (!r.ok) throw new Error(r.reason);
  const cur = ref(r.tree);
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value, fields: ['status', 'emb'], types: { status: 'keyword', emb: 'dense_vector' }, index: '',
      'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
    }),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { host, cur };
}

describe('1000 检索器面板', () => {
  it('chip 常在场；解析含 retriever 的 DSL 自动展开面板且状态已设置', async () => {
    const { host } = mountPane({ retriever: { rrf: { retrievers: [
      { standard: { query: { match_all: {} } } },
      { knn: { field: 'emb', query_vector: [1], k: 5 } },
    ] } } });
    await tick();
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(b => b.textContent?.includes('retriever'))!;
    expect(chip.textContent).toContain('已设置');
    expect(host.querySelector('.rte'), '解析后自动展开检索器面板').toBeTruthy();
    /* 两路子检索器递归渲染（.rte 根 + 2 子） */
    expect(host.querySelectorAll('.rte')).toHaveLength(3);
  });

  it('standard 变体内嵌查询树（MiniTreeEditor 在场）', async () => {
    const { host } = mountPane({ retriever: { standard: { query: { bool: { must: [{ term: { status: 'active' } }] } } } } });
    await tick();
    expect(host.querySelector('.rte .mte'), 'standard 走 MiniTreeEditor').toBeTruthy();
  });

  it('knn 向量框：合法 JSON 写树、非法只标红不写、清空移除键', async () => {
    const { host, cur } = mountPane({ retriever: { knn: { field: 'emb', query_vector: [1, 2] } } });
    await tick();
    const ta = host.querySelector('.rte-ta') as HTMLTextAreaElement;
    expect(ta.value).toBe('[1,2]');
    ta.value = '[3,';
    ta.dispatchEvent(new Event('input'));
    await tick();
    expect(ta.classList.contains('bad'), '非法 JSON 标红').toBe(true);
    expect(serializeTree(cur.value).retriever, '非法不写树').toEqual({ knn: { field: 'emb', query_vector: [1, 2] } });
    ta.value = '[3,4]';
    ta.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).retriever).toEqual({ knn: { field: 'emb', query_vector: [3, 4] } });
    ta.value = '';
    ta.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).retriever).toEqual({ knn: { field: 'emb' } });
  });

  it('linear 权重行内编辑写回；删路清伴随键', async () => {
    const { host, cur } = mountPane({ retriever: { linear: {
      retrievers: [{ retriever: { standard: { query: { match_all: {} } } }, weight: 0.7 }],
    } } });
    await tick();
    const w = host.querySelector('.rte-w-in') as HTMLInputElement;
    expect(w.value).toBe('0.7');
    w.value = '0.9';
    w.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).retriever).toEqual({ linear: {
      retrievers: [{ retriever: { standard: { query: { match_all: {} } } }, weight: 0.9 }] } });
    /* 删掉唯一一路 → children 空但键保留（ES 侧报错即教育，树不吞用户操作） */
    const del = host.querySelector('.rte-item .rte button[aria-label="删除该检索器"]') as HTMLButtonElement;
    del.click();
    await tick();
    expect(serializeTree(cur.value).retriever).toEqual({ linear: { retrievers: [] } });
  });

  it('切换变体换新节点（payload 语义互斥）；删根键收回', async () => {
    const { host, cur } = mountPane({ retriever: { standard: { query: { match_all: {} } } } });
    await tick();
    const sel = host.querySelector('.rte > .rte-hd .rte-op') as HTMLSelectElement;
    sel.value = 'rrf';
    sel.dispatchEvent(new Event('change'));
    await tick();
    expect(serializeTree(cur.value).retriever).toEqual({ rrf: { retrievers: [{ standard: { query: { match_all: {} } } }] } });
    /* 根删除按钮（面板里最外层 rte 的删除）→ 整键收回 */
    const rootDel = host.querySelector('.rte > .rte-hd button[aria-label="删除该检索器"]') as HTMLButtonElement;
    rootDel.click();
    await tick();
    expect(serializeTree(cur.value).retriever).toBeUndefined();
  });

  it('空态加检索器给 standard 可用初值', async () => {
    const { host, cur } = mountPane({ size: 10 });
    await tick();
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(b => b.textContent?.includes('retriever'))!;
    chip.click();
    await tick();
    const add = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('+ 加检索器'))!;
    add.click();
    await tick();
    expect(serializeTree(cur.value).retriever).toEqual({ standard: { query: { match_all: {} } } });
  });

  it('畸形 retriever 留在「其他顶层键」，面板空态（不进结构化编辑）', async () => {
    const { host } = mountPane({ retriever: { ml_model: { model_id: 'x' } } });
    await tick();
    expect(host.querySelector('.rte')).toBeNull();
  });
});
