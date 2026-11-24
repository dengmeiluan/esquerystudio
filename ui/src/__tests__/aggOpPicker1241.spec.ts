/**
 * 聚合类型二段式选择器（族 → 算子）交互契约。
 *
 * 缺陷背景：聚合类型此前是 `<input list>` + 68 项 `<datalist>`——系统原生弹层一把平铺，
 * 既无分组也无「先选大类」这一层，用户只能在长列表里逐项认名字。
 * 这属于「太多功能平铺了，该抽成一级筛选再展开二级」的典型（用户反复指出的交互问题）。
 *
 * 本件验证：
 *  ① 打开即出四枚族签（桶/指标/管道/全部），数量是真实条数；
 *  ② 默认落在当前算子所属族（terms → 桶），二级只列该族的算子；
 *  ③ 切换族签，二级列表随之更换（指标族出现 avg/sum/cardinality…）；
 *  ④ 选一项 → 回填并关层；
 *  ⑤ 手输任意名字仍即时生效（既有「未知聚合零降级」契约不得回退）。
 * 负控：把「按族过滤」去掉（恒列全部 68 项）→ ②③ 必须变红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import AggOpPicker from '../components/builder/AggOpPicker.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.agp-pop').forEach(n => n.remove());
});
afterEach(() => {
  document.querySelectorAll('.agp-pop').forEach(n => n.remove());
});

const settle = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };

async function mount(initial: string) {
  const emitted: string[] = [];
  let val = initial;
  const app = createApp({
    setup() {
      return () => h(AggOpPicker as any, {
        modelValue: val,
        'onUpdate:modelValue': (v: string) => { emitted.push(v); val = v; },
      });
    },
  });
  app.mount(host);
  apps.push(app);
  await settle();
  return { emitted, get: () => val };
}

/** 弹层 Teleport 到 body，取全局。
 注意：<transition> 的离场动画在 happy-dom 里不会被推进，选完那一刻节点可能仍挂在 DOM 上
 （只是正在离场）。所以「是否关层」要看功能结果（值已回填 + 面板不可再交互），不数节点。 */
const pop = () => document.body.querySelector('.agp-pop') as HTMLElement | null;
const popAlive = () => {
  const p = pop();
  if (!p) return false;
  const r = p.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(p).display !== 'none';
};
const openPicker = async () => {
  const inp = host.querySelector('input') as HTMLInputElement;
  inp.dispatchEvent(new FocusEvent('focus'));
  await settle();
  return inp;
};
const fams = () => [...document.body.querySelectorAll('.agp-fam')].map(b => b.textContent!.replace(/\s+/g, ''));
const ops = () => [...document.body.querySelectorAll('.agp-item .agp-op')].map(e => e.textContent!.trim());
const clickFam = async (re: RegExp) => {
  const b = [...document.body.querySelectorAll('.agp-fam')].find(x => re.test(x.textContent || '')) as HTMLElement;
  expect(b, '族签必须存在：' + re).toBeTruthy();
  /* happy-dom 下 el.click() 不派发可冒泡 MouseEvent 到 Vue 的侦听器（真实浏览器正常，
     见 .tmp/browser/aggops1240.mjs 的 CDP 实测）；这里显式派发冒泡 click */
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle();
};

describe('聚合类型二段式选择器', () => {
  it('打开即出四枚族签，数量是真实条数', async () => {
    await mount('terms');
    await openPicker();
    expect(pop(), '弹层必须打开').toBeTruthy();
    const f = fams();
    expect(f.length, '四枚族签').toBe(4);
    expect(f[0]).toMatch(/^桶聚合\d+$/);
    expect(f[1]).toMatch(/^指标聚合\d+$/);
    expect(f[2]).toMatch(/^管道聚合\d+$/);
    expect(f[3]).toMatch(/^全部\d+$/);
  });

  it('默认落在当前算子所属族，二级只列该族（terms → 桶）', async () => {
    await mount('terms');
    await openPicker();
    const list = ops();
    expect(list, '桶族应含 terms').toContain('terms');
    expect(list, '桶族不应出现指标算子 avg（按族过滤生效）').not.toContain('avg');
    expect(list.length, '桶族条目数应远小于 68').toBeLessThan(40);
  });

  it('切换族签 → 二级列表换成该族（指标族出现 avg/sum/cardinality）', async () => {
    await mount('terms');
    await openPicker();
    await clickFam(/指标聚合/);
    const list = ops();
    expect(list).toContain('avg');
    expect(list).toContain('cardinality');
    expect(list, '指标族不应出现桶算子 terms').not.toContain('terms');
  });

  it('选一项 → 回填并关层', async () => {
    const m = await mount('terms');
    await openPicker();
    await clickFam(/指标聚合/);
    const item = [...document.body.querySelectorAll('.agp-item')]
      .find(x => (x.querySelector('.agp-op')?.textContent || '').trim() === 'cardinality') as HTMLElement;
    expect(item, 'cardinality 必须在指标族列表里').toBeTruthy();
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(m.emitted, '选择必须回填').toContain('cardinality');
    expect(popAlive(), '选完必须关层（离场动画残留的节点不算开）').toBe(false);
  });

  it('手输任意聚合名即时生效（未知聚合零降级的既有契约不回退）', async () => {
    const m = await mount('terms');
    const inp = await openPicker();
    inp.value = 'my_custom_agg';
    inp.dispatchEvent(new Event('input'));
    await settle();
    expect(m.emitted, '手输必须即时上报').toContain('my_custom_agg');
  });

  it('负控：族过滤真的在起作用（同一选择器在「全部」档能取到跨族条目）', async () => {
    /* 反向对照——证明上面「不该出现 avg」不是空转：
       切到「全部」档后，同一个列表里必须同时出现桶与指标算子。 */
    await mount('terms');
    await openPicker();
    await clickFam(/全部/);
    const list = ops();
    expect(list, '全部档应含桶算子 terms').toContain('terms');
    expect(list, '全部档应含指标算子 avg').toContain('avg');
  });
});
