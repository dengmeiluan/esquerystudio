/**
 * builderSweepB3_1087：DSL 构造器「聚合/检索器/辅助」族原生 input 清零（收敛 TextInput）。
 * 两层断言：
 *  A. 源码形态——每个改动组件至少 1 例：TextInput 在场、皮肤锚类经 input-class 落真实
 *     input、placeholder/aria/data-k 字面保留、回写通道挂 update:model-value（读组件状态
 *     的 handler）或保留原生 @input（只读 $event.target.value 的 handler）、无残留原生 input；
 *  B. 挂载行为——原生 input 事件 / focus / keydown 仍驱动同一数据流（attrs 透传到
 *     真实 input，测试选择器零漂移）。
 * 清单内无原生 input 的文件（AggCompositePanel/RetrieverEditor/RetrieverJsonField/
 * SuggesterEditor/MiniTreeEditor/QuerySentenceBar）不在本批改动范围。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const comp = (f: string) => readFileSync(join(__dirname, '../builder', f), 'utf-8');
/* 剥注释后再查残留（防注释里的字面误伤） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const NO_BARE_INPUT = /<input[\s>]/;

describe('B3·形态锁：各组件收敛 TextInput 且无残留原生 input', () => {
  it('AggTreeNode：聚合名/非标量聚合体两处收敛，回写通道挂 update:model-value', () => {
    const s = comp('AggTreeNode.vue');
    expect(s).toMatch(/<TextInput :model-value="node\.name" input-class="inp agn-name mono" v-tip="'聚合名'"/);
    expect(s).toMatch(/@update:model-value="v => emit\('update:node', \{ \.\.\.node, name: v \}\)"/);
    expect(s).toMatch(/<TextInput v-else :model-value="String\(node\.body \?\? ''\)" input-class="inp mono agn-scalar"/);
    expect(s).toMatch(/@update:model-value="v => emit\('update:node', \{ \.\.\.node, body: v \}\)"/);
    /* 定宽由容器 .ti 承接；高度/字号/padding 经 :deep 打真实 input */
    expect(s).toMatch(/\.agn-hd > \.ti \{ flex: 0 1 110px; \}/);
    expect(s).toMatch(/\.agn-body > \.ti \{ width: 180px; \}/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('AggBoundsPanel：min/max 两处收敛，data-k 随 attrs 透传保留在输入上', () => {
    const s = comp('AggBoundsPanel.vue');
    expect(s).toMatch(/<TextInput :model-value="cellText\('min'\)" data-k="min" input-class="inp mono abp-in" placeholder="now-30d\/d 或 0"/);
    expect(s).toMatch(/<TextInput :model-value="cellText\('max'\)" data-k="max" input-class="inp mono abp-in" placeholder="now 或 100"/);
    expect(s).toMatch(/@update:model-value="v => onInput\('min', v\)"/);
    expect(s).toMatch(/@update:model-value="v => onInput\('max', v\)"/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('AggRangesPanel：from/to/key 三处收敛，setCell 回写通道保留', () => {
    const s = comp('AggRangesPanel.vue');
    expect(s).toMatch(/<TextInput :model-value="cellText\(i, 'from'\)" input-class="inp mono arp-in arp-from" placeholder="from 起（含）"/);
    expect(s).toMatch(/<TextInput :model-value="cellText\(i, 'to'\)" input-class="inp mono arp-in arp-to" placeholder="to 止（不含）"/);
    expect(s).toMatch(/<TextInput :model-value="cellText\(i, 'key'\)" input-class="inp mono arp-in arp-key" placeholder="key 桶名（可空）"/);
    expect(s).toMatch(/@update:model-value="v => setCell\(i, 'from', v\)"/);
    expect(s).toMatch(/@update:model-value="v => setCell\(i, 'key', v\)"/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('AggFiltersPanel：桶名收敛，setKey 回写通道保留', () => {
    const s = comp('AggFiltersPanel.vue');
    expect(s).toMatch(/<TextInput :model-value="b\.key" input-class="inp mono afp-name" placeholder="桶名"/);
    expect(s).toMatch(/@update:model-value="v => setKey\(i, v\)"/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('AggOrderPanel：排序键收敛，combobox aria 与 focus/keydown 透传字面保留', () => {
    const s = comp('AggOrderPanel.vue');
    expect(s).toMatch(/<TextInput :model-value="r\.key" input-class="inp mono aop-key"/);
    expect(s).toMatch(/placeholder="_count \/ _key \/ 子聚合名"/);
    expect(s).toMatch(/role="combobox" aria-autocomplete="list" :aria-expanded="kcOpen \? 'true' : 'false'" :aria-controls="kcListId"/);
    expect(s).toMatch(/@focus="onKeyComboFocus\(i, \$event\)" @update:model-value="v => setKey\(i, v\)" @keydown="onKeyComboKey"/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('MultiFieldPicker：搜索框收敛，v-model 与 esc.stop 关闭通道保留', () => {
    const s = comp('MultiFieldPicker.vue');
    expect(s).toMatch(/<TextInput ref="qEl" v-model="q" input-class="inp mfp-q" placeholder="搜索字段（Enter 无动作，勾选即生效）"/);
    expect(s).toMatch(/@keydown\.esc\.stop="\$emit\('close'\)"/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('FieldSelect：字段框收敛，combobox aria 全套与四事件透传字面保留', () => {
    const s = comp('FieldSelect.vue');
    expect(s).toMatch(/input-class="inp fs-inp mono" :model-value="modelValue" :placeholder="placeholder \|\| '选字段…'"/);
    expect(s).toMatch(/role="combobox" aria-autocomplete="list"/);
    expect(s).toMatch(/:aria-expanded="open \? 'true' : 'false'" :aria-controls="listId"/);
    expect(s).toMatch(/:aria-activedescendant="open && flat\[cursor\] \? itemId\(cursor\) : undefined"/);
    expect(s).toMatch(/@input="onInput" @focus="onFsFocus" @mousedown="pointerFocus = true" @keydown="onFsKey"/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('AggOpPicker：聚合类型输入收敛，手输即生效的三事件透传字面保留', () => {
    const s = comp('AggOpPicker.vue');
    expect(s).toMatch(/ref="inputEl"\s*\n\s*input-class="agp-inp mono"/);
    expect(s).toMatch(/:model-value="draft"/);
    expect(s).toMatch(/role="combobox"\s*\n\s*aria-autocomplete="list"/);
    expect(s).toMatch(/@input="onInput"\s*\n\s*@focus="onFocus"\s*\n\s*@keydown="onKey"/);
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });
});

describe('B3·挂载行为：原生事件链经真实 input 透传不漂移', () => {
  const tick = () => new Promise(r => setTimeout(r, 30));

  it('AggTreeNode：内层 input.agn-name 原生 input 事件仍驱动 update:node', async () => {
    const { createApp, h, ref } = await import('vue');
    const AggTreeNode = (await import('../builder/AggTreeNode.vue')).default;
    const nodeRef = ref({ id: 'a1', name: 'by_status', op: 'terms', body: { field: 'status' }, children: [], meta: {}, aggKey: 'aggs' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, {
      node: nodeRef.value, fields: ['status'], types: { status: 'keyword' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; },
    }) });
    app.mount(host);
    const inp = host.querySelector('input.agn-name') as HTMLInputElement;
    expect(inp, '锚类落真实 input（选择器零漂移）').toBeTruthy();
    inp.value = 'by_state';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(nodeRef.value.name).toBe('by_state');
    app.unmount();
    host.remove();
    /* 挂载链含重组件（GenericParams/FieldSelect 级联）慢机超默认 5s，queryAst1035 挂载档同款放宽 */
  }, 15000);

  it('AggOpPicker：手输聚合名即时上报（input/focus 透传到真实 input）', async () => {
    const { createApp, h } = await import('vue');
    const AggOpPicker = (await import('../builder/AggOpPicker.vue')).default;
    const emitted: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggOpPicker as any, {
      modelValue: 'terms',
      'onUpdate:modelValue': (v: string) => { emitted.push(v); },
    }) });
    app.mount(host);
    const inp = host.querySelector('input.agp-inp') as HTMLInputElement;
    inp.dispatchEvent(new FocusEvent('focus'));
    inp.value = 'my_custom_agg';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(emitted, '手输必须即时上报（未知聚合零降级契约）').toContain('my_custom_agg');
    app.unmount();
    host.remove();
  });

  it('MultiFieldPicker：搜索框 esc 透传仍触发 close；输入仍驱动过滤', async () => {
    const { createApp, h } = await import('vue');
    const MultiFieldPicker = (await import('../builder/MultiFieldPicker.vue')).default;
    let closed = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(MultiFieldPicker as any, {
      modelValue: [], fields: ['title', 'content'], types: {},
      style: { left: '10px', top: '10px' },
      'onUpdate:modelValue': () => {},
      onClose: () => { closed++; },
    }) });
    app.mount(host);
    await tick();
    const q = document.body.querySelector('input.mfp-q') as HTMLInputElement;
    expect(q, '弹层内搜索框锚类落真实 input').toBeTruthy();
    q.value = 'tit';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    const rows = Array.from(document.body.querySelectorAll('.mfp-row')) as HTMLElement[];
    expect(rows.filter(r => (r.textContent || '').includes('title')), '输入驱动候选过滤').toHaveLength(1);
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(closed, 'esc 经透传触发 close').toBe(1);
    app.unmount();
    host.remove();
    document.body.innerHTML = '';
  });

  it('FieldSelect：focus 开层 + 原生 input 过滤候选（combobox 事件链不变）', async () => {
    const { createApp, h, ref } = await import('vue');
    const FieldSelect = (await import('../builder/FieldSelect.vue')).default;
    const val = ref('');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(FieldSelect as any, {
      modelValue: val.value, fields: ['title', 'count'], types: { title: 'text', count: 'long' },
      'onUpdate:modelValue': (v: string) => { val.value = v; },
    }) });
    app.mount(host);
    const inp = host.querySelector('input.fs-inp') as HTMLInputElement;
    inp.dispatchEvent(new Event('focus', { bubbles: true }));
    await tick();
    inp.value = 'cou';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(val.value, '输入经透传回写模型').toBe('cou');
    const items = Array.from(document.body.querySelectorAll('.fs-item')).map(e => e.textContent || '');
    expect(items.some(t => t.includes('count')), '过滤后 count 在候选').toBe(true);
    expect(items.some(t => t.includes('title')), 'title 被过滤出局').toBe(false);
    app.unmount();
    host.remove();
    document.body.innerHTML = '';
  });

  it('AggBoundsPanel：data-k 输入位原生事件仍建 extended_bounds 键', async () => {
    const { createApp, h, ref } = await import('vue');
    const AggTreeNode = (await import('../builder/AggTreeNode.vue')).default;
    const nodeRef = ref({ id: 'n1', name: 'by_day', op: 'date_histogram', body: { field: 'created_at' }, children: [], meta: {}, aggKey: 'aggs' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, {
      node: nodeRef.value, fields: ['created_at'], types: { created_at: 'date' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; },
    }) });
    app.mount(host);
    const minInp = host.querySelector('.abp input[data-k="min"]') as HTMLInputElement;
    minInp.value = 'now-30d/d';
    minInp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect((nodeRef.value.body as any).extended_bounds).toEqual({ min: 'now-30d/d' });
    app.unmount();
    host.remove();
    /* 同上：挂载链慢机预算档 */
  }, 15000);
});
