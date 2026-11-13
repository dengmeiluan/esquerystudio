import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

/* Monaco stub 捕获——setup 收 props/emit 入档（现调现读响应式 props）。
   monacoCaps 只在 setup 闭包内迟引用（mount 时执行），无 TDZ（同 devtoolsSmartAssist L56-67 范式） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import JsonArea from '../components/JsonArea.vue';

const apps: ReturnType<typeof createApp>[] = [];

function mountArea(props: Record<string, any>, onUpdate?: (v: string) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  /* h 的组件重载不认 Record 条件展开（TS2769）——先组 any 形态 props 再传 */
  const p: any = { ...props };
  if (onUpdate) p['onUpdate:modelValue'] = onUpdate;
  const app = createApp({
    render: () => h(JsonArea, p),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { app, host };
}

beforeEach(() => {
  apps.splice(0).forEach(a => a.unmount());
  document.body.innerHTML = '';
  monacoCaps.length = 0;
});

describe('ux2 Task 10：JsonArea Monaco 内核', () => {
  it('props 透传：language=json + rows 换算 height（rows*19+16）', async () => {
    mountArea({ modelValue: '{"a":1}', rows: 4 });
    mountArea({ modelValue: '{}' }); /* 默认 rows=10 */
    await nextTick();
    expect(monacoCaps.length).toBe(2);
    expect(monacoCaps[0].props.language).toBe('json');
    expect(monacoCaps[0].props.height, 'rows=4 → 4*19+16=92px').toBe('92px');
    expect(monacoCaps[0].props.modelValue).toBe('{"a":1}');
    expect(monacoCaps[1].props.height, '默认 rows=10 → 206px').toBe('206px');
  });

  it('fill 模式：.ja.fill 类在位 + height 传 100%（内联由样式 !important 接管）', async () => {
    const { host } = mountArea({ modelValue: '{}', fill: true });
    await nextTick();
    expect(host.querySelector('.ja.fill'), 'fill 必须出 .ja.fill 类').toBeTruthy();
    expect(monacoCaps[0].props.height).toBe('100%');
  });

  it('Monaco 编辑 → update:modelValue 原样上抛', async () => {
    const got: string[] = [];
    mountArea({ modelValue: '' }, v => got.push(v));
    await nextTick();
    monacoCaps[0].emit('update:modelValue', '{"b":2}');
    expect(got).toEqual(['{"b":2}']);
  });

  it('工具栏：格式化/压缩/复制三按钮行为不回归', async () => {
    const writeFn = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeFn }, configurable: true });
    const got: string[] = [];
    const { host } = mountArea({ modelValue: '{"a":1}' }, v => got.push(v));
    await nextTick();
    const btns = Array.from(host.querySelectorAll<HTMLButtonElement>('.ja-btn'));
    const byText = (t: string) => btns.find(b => b.textContent?.includes(t))!;
    byText('格式化').click();
    expect(got[0], '格式化必须上抛 2 空格缩进').toBe(JSON.stringify({ a: 1 }, null, 2));
    byText('压缩').click();
    /* 压缩基于 props.modelValue（父未回写仍是原始串）→ 仍得压缩结果 */
    expect(got[1]).toBe('{"a":1}');
    byText('复制').click();
    expect(writeFn).toHaveBeenCalledWith('{"a":1}');
  });

  it('合法性圆点：empty/bad/ok 三态 + 非法出 err 文案', async () => {
    const { host: h1 } = mountArea({ modelValue: '' });
    const { host: h2 } = mountArea({ modelValue: '{ bad,,' });
    const { host: h3 } = mountArea({ modelValue: '{"a":1}' });
    await nextTick();
    expect(h1.querySelector('.ja-dot.ja-empty'), '空必须 ja-empty').toBeTruthy();
    expect(h2.querySelector('.ja-dot.ja-bad'), '非法必须 ja-bad').toBeTruthy();
    expect(h2.querySelector('.ja-err')!.textContent, '非法必须出 err 文案').toBeTruthy();
    expect(h3.querySelector('.ja-dot.ja-ok'), '合法必须 ja-ok').toBeTruthy();
  });
});
