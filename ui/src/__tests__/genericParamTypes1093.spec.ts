import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import GenericParams from '../components/builder/GenericParams.vue';

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
    const num = host.querySelector<HTMLInputElement>('.gp-row input[type="number"]');
    expect(num, 'number schema 必须用数值输入').toBeTruthy();
    num!.value = '2';
    num!.dispatchEvent(new Event('input'));
    await nextTick();
    expect(cur.value.prefix_length).toBe(2);
  });

  it('boolean schema 新增即显式 false，勾选落成 true', async () => {
    const { host, cur } = mount();
    await add(host, 'case_insensitive');
    expect(cur.value.case_insensitive).toBe(false);
    const cb = host.querySelector<HTMLInputElement>('.gp-row input[type="checkbox"]')!;
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await nextTick();
    expect(cur.value.case_insensitive).toBe(true);
  });
});
