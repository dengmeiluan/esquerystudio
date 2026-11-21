/**
 * 1192：本地排序的**作用域**必须写在提示里。
 *
 * 表头点击走 `chain.sortBy`（纯前端），只排「已加载的这几行」。分页/游标通道
 * （Lucene、SQL…）看到的结果常常远多于这些行——旧文案只说「点击排序」，
 * 等于承诺了全量序。SQL 侧早有「仅作用于已加载 N 行」的诚实标注，
 * 本批把同一口径下沉到 QRT 内核的 th title。
 *
 * 锁：① total > 已加载 → 标题带「仅排序已加载的 N 行」；
 *     ② 全量已加载 → 不带（不制造噪音）；
 *     ③ 查询级排序（useAsCondition）不叠加这句（那条链本来就改查询）；
 *     ④ 负控：把条件写反（total < loaded）→ ①转红。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import QueryResultTable from '../components/QueryResultTable.vue';
import { vTip } from '../directives/vTip';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mountQrt(props: Record<string, any>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(QueryResultTable as any, props) });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] });
  app.use(createPinia());
  app.use(router);
  app.directive('tip', vTip); /* 表头提示已迁 v-tip 指令，注册后经浮层读取 */
  await router.push('/');
  await router.isReady();
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}
/* th 提示从原生 title 属性改读 v-tip 浮层：hover 通道 300ms 显示延迟 + 80ms 隐藏延迟，
   空值不显示（浮层不可见返回空串，与旧 th[title] 缺属性同口径）。
   旧锚取「第一个带 title 的 th」——序号等无提示列需跳过，故遍历取首个非空提示 */
const hoverTip = async (th: HTMLElement): Promise<string> => {
  const fire = (type: 'pointerover' | 'pointerout') => {
    const e = new MouseEvent(type, { bubbles: true });
    Object.defineProperty(e, 'pointerType', { value: 'mouse', configurable: true });
    th.dispatchEvent(e);
  };
  fire('pointerover');
  await new Promise(r => setTimeout(r, 360));
  const pop = document.getElementById('vt-tip');
  const text = pop && pop.style.display !== 'none' ? (pop.textContent ?? '') : '';
  fire('pointerout');
  await new Promise(r => setTimeout(r, 100));
  return text;
};
const thTitle = async (): Promise<string> => {
  const ths = [...host.querySelectorAll('.qrt-tbl thead th')] as HTMLElement[];
  for (const th of ths) {
    const t = await hoverTip(th);
    if (t) return t;
  }
  return '';
};

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  const pop = document.getElementById('vt-tip'); /* 卸载只隐藏浮层不删元素 */
  document.body.innerHTML = '';
  /* v-tip 单例浮层随 body 清空被 detach，指令内部持引用不重建——挂回供下一用例复用 */
  if (pop) document.body.appendChild(pop);
});

const hits = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: String(i), _index: 'idx', _score: 1, _source: { a: i } }));

describe('1192 表头排序作用域诚实标注', () => {
  it('total > 已加载 → 标题点名「仅排序已加载的 N 行」', async () => {
    await mountQrt({ hits: hits(5), total: 128, sortable: true });
    const t = await thTitle();
    expect(t).toContain('仅排序已加载的 5 行');
    expect(t).toContain('全部结果请改查询侧排序');
  });

  it('全量已加载 → 不加这句（不制造噪音）', async () => {
    await mountQrt({ hits: hits(5), total: 5, sortable: true });
    const t = await thTitle();
    expect(t).toContain('点击排序');
    expect(t).not.toContain('仅排序已加载');
  });

  it('查询级排序通道（useAsCondition）不叠加这句', async () => {
    await mountQrt({ hits: hits(3), total: 999, sortable: true, useAsCondition: true });
    const t = await thTitle();
    expect(t).toContain('不改 SQL');
    expect(t, '该通道本来就改查询，不该再说「仅排序已加载」').not.toContain('仅排序已加载');
  });

  it('负控：把判据写反（total < loaded）就不该出现这句', async () => {
    /* 用一个不可能成立的输入验证判据方向：total 小于行数时不得提示「仅排序」 */
    await mountQrt({ hits: hits(5), total: 2, sortable: true });
    expect(await thTitle()).not.toContain('仅排序已加载');
  });
});
