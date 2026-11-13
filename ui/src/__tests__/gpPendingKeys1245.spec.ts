/**
 * GenericParams：未入体的已注册参数必须以「可点键签」出现。
 *
 * 缺陷：schema 只升级「已在体」键的控件形态，未入体键此前只有「+ 键名」输入框上的
 * datalist 提示——新建一个聚合时用户看到的是一个空框，不点开、不试输就根本发现不了
 * 这个聚合要哪些键（weighted_avg 的 value/weight、t_test 的 a/b 都属此列）。
 * 本轮把未入体键列成一排可点的 `+ key` 键签，点一下按类型补默认值并落进体。
 *
 * 判据：键签出现在 schema\body 的差集上；点击落体后该键变类型化行、键签消失；
 * 没有 schema 的通道（自由表）完全不出键签。
 * 负控：把 pendingSchema 的过滤去掉（把已在体的键也算进去）→ 「落体后键签减少」变红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import GenericParams from '../components/builder/GenericParams.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});
afterEach(() => { host.innerHTML = ''; });

const settle = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };

async function mount(value: Record<string, unknown> | unknown[], schema: any[]) {
  /* 必须是响应式：非响应式局部变量改值不会触发重渲染（第一版就栽在这） */
  const cur = ref<any>(Array.isArray(value) ? [...value] : { ...value });
  const app = createApp({
    setup() {
      return () => h(GenericParams as any, {
        value: cur.value,
        schema,
        pathPrefix: '',
        'onUpdate': (v: any) => { cur.value = v; },
      });
    },
  });
  app.mount(host);
  apps.push(app);
  await settle();
  return { get: () => cur.value as Record<string, any> };
}

const chips = () => [...host.querySelectorAll('.gp-pkey')].map(b => b.textContent!.replace(/^\+\s*/, '').trim());
const rowKeys = () => [...host.querySelectorAll('.gp-k')].map(i => (i as HTMLInputElement).value);

const SCHEMA = [
  { key: 'value', kind: 'json' },
  { key: 'weight', kind: 'json' },
  { key: 'format', kind: 'text' },
];

describe('未入体参数键签', () => {
  it('schema\body 的差集逐个出键签', async () => {
    await mount({ field: 'price' }, SCHEMA);
    expect(chips()).toEqual(['value', 'weight', 'format']);
  });

  it('已在体的键不出键签（只提示「还没加的」）', async () => {
    await mount({ field: 'price', format: '0.00' }, SCHEMA);
    expect(chips()).toEqual(['value', 'weight']);
  });

  it('点键签 → 落体成类型化行，键签随之减少', async () => {
    const m = await mount({ field: 'price' }, SCHEMA);
    const btn = [...host.querySelectorAll('.gp-pkey')].find(b => b.textContent!.includes('value')) as HTMLElement;
    expect(btn, 'value 键签必须在').toBeTruthy();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(m.get(), '必须落进体里').toHaveProperty('value');
    expect(m.get().value, 'json 档默认给空对象承接文本位').toEqual({});
    expect(rowKeys(), '落体后应出现同名编辑行').toContain('value');
    expect(chips(), '落体的键不再出键签').toEqual(['weight', 'format']);
  });

  it('布尔参数落体给 false（不是空串）', async () => {
    const m = await mount({ field: 'x' }, [{ key: 'wrap_longitude', kind: 'boolean' }]);
    const btn = host.querySelector('.gp-pkey') as HTMLElement;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(m.get().wrap_longitude).toBe(false);
  });

  it('无 schema 的通道完全不出键签（全站零增量的自由表不受影响）', async () => {
    await mount({ field: 'x' }, []);
    expect(chips(), '空 schema 不该有键签').toEqual([]);
    expect(host.querySelector('.gp-pkey'), '连容器都不该有').toBeNull();
  });

  it('数组值通道不出键签（数组侧用的是尾部推空串语义）', async () => {
    await mount(['a', 'b'] as any, SCHEMA);
    expect(chips(), '数组通道不该出键签').toEqual([]);
  });

  it('负控：「已在体的键不出键签」真在过滤（同一实例加完剩下的仍在）', async () => {
    /* 反向对照——证明上面「键签减少」不是空转：
       同一实例连点两次，第二次剩下的键签必须只少那一个。 */
    const m = await mount({ field: 'price' }, SCHEMA);
    for (const k of ['value', 'weight']) {
      const b = [...host.querySelectorAll('.gp-pkey')].find(x => x.textContent!.includes(k)) as HTMLElement;
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
    }
    expect(m.get()).toMatchObject({ value: {}, weight: {} });
    expect(chips()).toEqual(['format']);
  });
});
