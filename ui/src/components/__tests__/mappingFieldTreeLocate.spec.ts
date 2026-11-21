/* MappingFieldTree 搜索定位升级契约（ancestor-preserving filter + hit nav）：
 *   1) 过滤保留祖先：命中节点的祖先以结构行出现（不再只是灰显路径前缀）；
 *   2) 自身命中的行按渲染序带 data-hit-idx（祖先结构行不占号）；
 *   3) 输入框 Enter → 游标前进，.hit-cur 只落在当前命中行；
 *   4) 受控 keyword prop 仍驱动过滤（MappingView v-model:keyword 契约不破）；
 *   5) 命中字段名出 <mark> 片段（插值转义，无 v-html）。
 * 范式同 clusterThreeState.spec：无 @vue/test-utils，createApp + pinia + router 手工 mount。 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import MappingFieldTree from '../MappingFieldTree.vue';

let app: VueApp | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = '';
  location.hash = '#/';
  app = null;
  host = null;
});

async function mountTree(props: Record<string, unknown>): Promise<HTMLElement> {
  const pinia = createPinia();
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:all(.*)', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(MappingFieldTree, { ...props } as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  for (let i = 0; i < 4; i++) await nextTick();
  return host;
}

async function settle() { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } }

/* 嵌套 + multi-field 的最小 mapping：
 * user(object)→name(text)/age(long)；order(object)→status(keyword)/total(double)；title(text)→title.keyword */
const PROPS = {
  user: { properties: { name: { type: 'text' }, age: { type: 'long' } } },
  order: { properties: { status: { type: 'keyword' }, total: { type: 'double' } } },
  title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
};

describe('MappingFieldTree 搜索定位', () => {
  it('过滤保留祖先：搜 status 出 order(结构行) + order.status(命中行)', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'status' });
    const trs = [...root.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(trs.length).toBe(2);
    expect(trs[0].textContent).toContain('order');
    expect(trs[0].hasAttribute('data-hit-idx'), '祖先结构行不占命中号').toBe(false);
    expect(trs[1].getAttribute('data-hit-idx')).toBe('1');
    expect(trs[1].textContent).toContain('status');
  });

  it('命中字段名渲染 <mark> 片段', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'name' });
    const mark = root.querySelector('tbody mark.mft-mark');
    expect(mark, '命中片段必须包 <mark class="mft-mark">').toBeTruthy();
    expect(mark!.textContent).toBe('name');
  });

  it('命中行按渲染序编号 data-hit-idx 1..n（type 命中也算，但字段名不含关键字则不出 <mark>）', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'text' });
    /* type=text 的行：user.name、title；user 与 title.keyword 不命中 */
    const idx = [...root.querySelectorAll('tbody tr')]
      .map(tr => tr.getAttribute('data-hit-idx'))
      .filter(Boolean);
    expect(idx).toEqual(['1', '2']);
    /* 高亮只落在字段名的命中片段上：本轮经 type 命中、name 不含 'text'，不应有 mark */
    expect(root.querySelector('tbody mark.mft-mark')).toBeNull();
  });

  it('Enter 前进游标：.hit-cur 只落当前命中行，上一行摘掉', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'text' });
    /* 六百五十批随迁：过滤胞换装 SearchFilterBar（sfbUnify650 锁）——手作 .mft-filter 壳退役，
       SFB 内建 @keydown.enter.prevent → emit('enter', $event)（shiftKey 保留）→ @enter="onHitKey"
       语义等价；选择器随 SFB 根落位类 */
    const inp = root.querySelector('.mft-sfb input') as HTMLInputElement;
    expect(inp).toBeTruthy();
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    const cur = root.querySelector('tbody tr.hit-cur') as HTMLElement | null;
    expect(cur, '当前命中行必须带 .hit-cur').toBeTruthy();
    expect(cur!.getAttribute('data-hit-idx'), 'Enter 后游标 1→2').toBe('2');
    expect(root.querySelectorAll('tbody tr.hit-cur').length).toBe(1);
  });

  it('Shift+Enter 后退游标（wrap 到最后一个）', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'text' });
    const inp = root.querySelector('.mft-sfb input') as HTMLInputElement;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    const cur = root.querySelector('tbody tr.hit-cur') as HTMLElement | null;
    expect(cur?.getAttribute('data-hit-idx'), '1 号位 Shift+Enter 回绕到 2').toBe('2');
  });

  it('受控 keyword prop 仍驱动过滤（v-model:keyword 契约）', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'age' });
    const trs = [...root.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(trs.length, 'user(祖先) + user.age(命中)').toBe(2);
    expect(trs[1].getAttribute('data-hit-idx')).toBe('1');
  });

  it('零命中：空态文案在 + HitNav 计数显示「0 命中」+ 按钮禁用', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'zzz_no_match' });
    expect(root.querySelector('tbody tr')).toBeNull();
    expect(root.textContent).toContain('无匹配字段');
    expect(root.querySelector('.hn-count')?.textContent?.trim()).toBe('0 命中');
    const btns = [...root.querySelectorAll('.hn button')] as HTMLButtonElement[];
    expect(btns.every(b => b.disabled)).toBe(true);
  });

  it('有命中时 HitNav 计数显示 current/count', async () => {
    const root = await mountTree({ properties: PROPS, keyword: 'text' });
    expect(root.querySelector('.hn-count')?.textContent?.trim()).toBe('1/2');
  });
});
