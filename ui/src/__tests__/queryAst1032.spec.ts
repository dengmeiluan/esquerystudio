/* 1032 批：GenericParams「+ 键名」schema 键提示——注册在册但尚未入体的键升 datalist
   建议（带类型释义：数值/布尔/枚举档连选项串）。此前 schema 只升级「已在体内」键的
   控件形态，未入体键对用户完全不可见=具名参数可发现性断层；添加仍不限制（任何键
   都可手输，datalist 只提示不约束）。零 AST 关联，纯组件投影增强。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1032 schema 键提示接线', () => {
  it('添加行挂 datalist：pendingSchema 过滤在体键 + :list 绑定在场', () => {
    const src = srcOf('components/builder/GenericParams.vue');
    expect(src).toContain(':list="\'gpkeys-\' + uid"');
    expect(src).toContain('pendingSchema');
    // 在体键不进建议（filter 排除已在体内的键）
    expect(src).toMatch(/!\s*\(?p\.key in/);
    // datalist 只在建议非空时渲染（零建议零 DOM）
    expect(src).toMatch(/v-if="!isArr && pendingSchema\.length"/);
  });
  it('建议项带类型释义（数值/布尔/枚举档连选项串）', () => {
    const src = srcOf('components/builder/GenericParams.vue');
    expect(src).toContain('KIND_ZH');
    expect(src).toContain("p.options?.length");
  });
});

describe('1032 添加行为回归（挂载）', () => {
  it('datalist 只含未入体 schema 键；添加键 emit 全量 map', async () => {
    const { createApp, h } = await import('vue');
    const GenericParams = (await import('../components/builder/GenericParams.vue')).default;
    let last: Record<string, unknown> | null = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(GenericParams as any, {
      value: { size: 10 },
      schema: [
        { key: 'size', kind: 'number' },
        { key: 'min_doc_count', kind: 'number' },
        { key: 'execution_hint', kind: 'enum', options: ['map', 'global_ordinals'] },
      ],
      'onUpdate': (v: Record<string, unknown>) => { last = v; },
    }) });
    app.mount(host);
    // datalist 建议排除在体键
    const opts = Array.prototype.map.call(host.querySelectorAll('datalist option'), (o: HTMLOptionElement) => o.value);
    expect(opts).toEqual(['min_doc_count', 'execution_hint']);
    // 手输新键 + 添加 → emit 全量 map（含在体键与新键）
    const inp = host.querySelector('.gp-add input') as HTMLInputElement;
    inp.value = 'missing';
    (inp as any).dispatchEvent(new Event('input', { bubbles: true }));
    const addBtn = host.querySelector('.gp-add button') as HTMLButtonElement;
    addBtn.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last).toEqual({ size: 10, missing: '' });
    app.unmount();
    host.remove();
  });
  it('无 schema（裸键值表）零建议零 DOM（现状零增量）', async () => {
    const { createApp, h } = await import('vue');
    const GenericParams = (await import('../components/builder/GenericParams.vue')).default;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(GenericParams as any, { value: { a: 1 } }) });
    app.mount(host);
    expect(host.querySelectorAll('datalist').length).toBe(0);
    app.unmount();
    host.remove();
  });
});
