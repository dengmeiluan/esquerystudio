import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import GenericParams from '../components/builder/GenericParams.vue';

/* JSON 文本位升档 JsonArea 统一件（内嵌 Monaco）——happy-dom 挂不起真 Monaco（canvas 2d
 context null），stub 掉编辑器本体；本 spec 的 number/boolean 行不渲染该分支，纯保模块可加载 */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: `<div class="monaco-stub"></div>`,
  },
}));

/* 1093：GenericParams schema 数值/布尔参数落成正确 JSON 类型。
 * 真实缺口：通过「+键名」新增的 prefix_length/boost 等 number schema 参数此前落成
 * 字符串（"2"），布尔参数落成空串；ES 会拒绝或静默按默认处理。 */
describe('1093 GenericParams schema 类型', () => {
  const mount = () => {
    const cur = ref<Record<string, unknown>>({});
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp({
      render: () => h(GenericParams, {
        value: cur.value,
        schema: [
          { key: 'prefix_length', kind: 'number' },
          { key: 'case_insensitive', kind: 'boolean' },
        ],
        onUpdate: (v: Record<string, unknown> | unknown[]) => { cur.value = v as Record<string, unknown>; },
      }),
    }).mount(host);
    return { host, cur };
  };
  const add = async (host: HTMLElement, key: string) => {
    const inp = host.querySelector<HTMLInputElement>('.gp-add input')!;
    inp.value = key;
    inp.dispatchEvent(new Event('input'));
    (host.querySelector('.gp-add button') as HTMLButtonElement).click();
    await nextTick();
  };

  it('number schema 新增后渲染数值控件，输入落成 number', async () => {
    const { host, cur } = mount();
    await add(host, 'prefix_length');
    expect(cur.value.prefix_length).toBe('');
    /* 控件升级随迁：数值位 NInputNumber（内部原生 input type=text），设值+input 事件即输入 */
    const num = host.querySelector<HTMLInputElement>('.gp-row .n-input-number input');
    expect(num, 'number schema 必须用数值输入').toBeTruthy();
    expect(host.querySelector('.gp-row input[type="number"]'), '防回潮：不得回落原生 number 框').toBeNull();
    num!.value = '2';
    num!.dispatchEvent(new Event('input'));
    await nextTick();
    expect(cur.value.prefix_length).toBe(2);
  });

  it('boolean schema 新增即显式 false，勾选落成 true', async () => {
    const { host, cur } = mount();
    await add(host, 'case_insensitive');
    expect(cur.value.case_insensitive).toBe(false);
    /* 控件升级随迁：NCheckbox（role=checkbox 的 ARIA 实现，无原生 input），点击根元素翻转 */
    expect(host.querySelector('.gp-row input[type="checkbox"]'), '防回潮：不得回落原生 checkbox').toBeNull();
    const cb = host.querySelector<HTMLElement>('.gp-row [role="checkbox"]')!;
    expect(cb.getAttribute('aria-checked')).toBe('false');
    cb.click();
    await nextTick();
    expect(cur.value.case_insensitive).toBe(true);
  });
});
