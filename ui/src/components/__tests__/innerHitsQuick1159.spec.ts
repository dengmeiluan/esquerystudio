/**
 * 1159 批：json 类参数的结构化快捷行（inner_hits 的 from / size / name）。
 *
 * 背景：`inner_hits` 在 nested / has_child 里几乎必用，此前只能整段手写 JSON——
 * 与「右侧 query 的双向映射要做到全面、交互尽可能智能便捷」相悖。
 * 现在：值确实是对象时，给 from/size/name 三个结构化输入（数字/文本控件），
 * JSON 文本框保留整段编辑能力（其余键如 sort/highlight/_source 仍可直接写）。
 * 数组/标量形态没有快捷键，回落原 JSON 单通道（避免误改结构）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import GenericParams from '../builder/GenericParams.vue';

const apps: App[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

function mount(val: Record<string, unknown>, schema: any[] = []) {
  const model = ref(val);
  const app = createApp({ setup: () => () => h(GenericParams as any, {
    value: model.value, schema, onUpdate: (v: any) => { model.value = v; },
  }) });
  app.mount(host);
  apps.push(app);
  return model;
}

afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; host.innerHTML = ''; });

describe('1159 inner_hits 结构化快捷行', () => {
  it('对象值 → 出现 from/size/name 三个结构化控件（并保留 JSON 位）', async () => {
    mount({ inner_hits: { size: 3, name: 'c' } }, [{ key: 'inner_hits', kind: 'json' }]);
    await tick();
    const quick = host.querySelector('.gp-jq');
    expect(quick, '结构化快捷行在场').toBeTruthy();
    for (const k of ['from', 'size', 'name']) {
      expect(host.querySelector(`[aria-label="inner_hits.${k}"]`), `缺控件：${k}`).toBeTruthy();
    }
    expect(host.querySelector('.gp-jq-json'), 'JSON 整段编辑位仍保留').toBeTruthy();
  });

  it('改 size → 回写数字类型（不是字符串）', async () => {
    const model = mount({ inner_hits: { name: 'c' } }, [{ key: 'inner_hits', kind: 'json' }]);
    await tick();
    const inp = host.querySelector('[aria-label="inner_hits.size"]') as HTMLInputElement;
    inp.value = '5';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect((model.value.inner_hits as any).size).toBe(5);
    expect(typeof (model.value.inner_hits as any).size).toBe('number');
  });

  it('改 name → 回写字符串，且不破坏已有 size', async () => {
    const model = mount({ inner_hits: { size: 3 } }, [{ key: 'inner_hits', kind: 'json' }]);
    await tick();
    const inp = host.querySelector('[aria-label="inner_hits.name"]') as HTMLInputElement;
    inp.value = 'dup';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect((model.value.inner_hits as any).name).toBe('dup');
    expect((model.value.inner_hits as any).size).toBe(3);
  });

  it('清空 number 控件 → 删除该键（不留空串污染 DSL）', async () => {
    const model = mount({ inner_hits: { from: 2, size: 3 } }, [{ key: 'inner_hits', kind: 'json' }]);
    await tick();
    const inp = host.querySelector('[aria-label="inner_hits.from"]') as HTMLInputElement;
    inp.value = '';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect('from' in (model.value.inner_hits as any)).toBe(false);
    expect((model.value.inner_hits as any).size).toBe(3);
  });

  it('数组形态没有快捷行（回落 JSON 单通道，不误改结构）', async () => {
    mount({ inner_hits: [{ size: 1 }] }, [{ key: 'inner_hits', kind: 'json' }]);
    await tick();
    expect(host.querySelector('.gp-jq'), '数组不给结构化快捷行').toBeNull();
    expect(host.querySelector('.gp-json'), 'JSON 文本位仍在').toBeTruthy();
  });

  it('JSON 位仍可整体改（快捷行不限制其余键）', async () => {
    const model = mount({ inner_hits: { size: 3 } }, [{ key: 'inner_hits', kind: 'json' }]);
    await tick();
    const ta = host.querySelector('.gp-jq-json') as HTMLTextAreaElement;
    ta.value = JSON.stringify({ size: 3, sort: [{ ts: 'desc' }] });
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect((model.value.inner_hits as any).sort).toEqual([{ ts: 'desc' }]);
  });
});
