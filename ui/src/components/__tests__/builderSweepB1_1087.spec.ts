/**
 * builderSweepB1_1087：DSL 构造器「树/子句」族原生 input 清零（收敛 TextInput）。
 * 两层断言：
 *  A. 源码形态——每个改动组件至少 1 例：TextInput 在场、皮肤锚类经 input-class 落真实
 *     input、placeholder/aria/data-path/v-tip 字面保留、回写通道保留原生 @input/@change
 *     （只读 $event.target.value 的 handler）与 v-model（草稿态输入）、无残留原生 input；
 *     定宽/伸缩位落输入件根容器（:deep(.ti…)），高度/字号/内衬经 :deep 落真实 input。
 *  B. 挂载行为——原生 input / change / focus / keydown / paste / blur 仍驱动同一数据流
 *     （attrs 透传到真实 input，测试选择器零漂移）；焦点归还与 IME 守卫不漂移。
 * 清单内无原生 input 的文件（GenericNode/NodeRenderer/NodeSelectBox/QueryTreePane/
 * MultiNodeRow）不在本批改动范围。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, ref, shallowRef, type App, type VNode } from 'vue';
import { createPinia } from 'pinia';
import ClauseNode from '../builder/ClauseNode.vue';
import BoolGroupNode from '../builder/BoolGroupNode.vue';
import GenericParams from '../builder/GenericParams.vue';
import WrapNodeRow from '../builder/WrapNodeRow.vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import { vTip } from '../../directives/vTip';
import { parseQueryNode, parseTree, serializeTree, type LeafNode, type BoolNode, type QueryTree, type WrapNode } from '../../utils/queryAst';

/* json 文本位 JsonArea 内嵌 Monaco——happy-dom 挂不起真 Monaco（canvas 2d null），
 stub 掉编辑器本体（innerHitsQuick1159 同款范式）；本 spec 只走快捷行输入，不碰编辑器 */
vi.mock('../MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

const comp = (f: string) => readFileSync(join(__dirname, '../builder', f), 'utf-8');
/* 剥注释后再查残留（防注释里的字面误伤） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const NO_BARE_INPUT = /<input[\s>]/;

/* ═══════════ A. 源码形态锁 ═══════════ */

describe('B1·形态锁：树/子句族各组件收敛 TextInput 且无残留原生 input', () => {
  it('ClauseNode：十二处文本输入收敛——range 四操作符/多字段两位/主值两位/远程词项三位/值 chip', () => {
    const s = comp('ClauseNode.vue');
    expect((strip(s).match(/<TextInput[\s>]/g) || []).length, '十二处文本输入全部收敛').toBe(12);
    /* range 四操作符：皮肤类顺序、受控值、placeholder 字面保留 */
    expect(strip(s).match(/input-class="inp cn-val cn-range mono" :model-value="rangePart\('[a-z]+'\)" placeholder="[^"]+"/g))
      .toEqual([
        'input-class="inp cn-val cn-range mono" :model-value="rangePart(\'gte\')" placeholder="≥ gte"',
        'input-class="inp cn-val cn-range mono" :model-value="rangePart(\'lte\')" placeholder="≤ lte"',
        'input-class="inp cn-val cn-range mono" :model-value="rangePart(\'gt\')" placeholder="> gt"',
        'input-class="inp cn-val cn-range mono" :model-value="rangePart(\'lt\')" placeholder="< lt"',
      ]);
    /* 回写通道只读 $event.target.value，保留原生 @input；focus/keydown 候选弹层接线字面保留 */
    expect((strip(s).match(/@focus="onRangeFocus\('(gte|lte|gt|lt)', \$event\)" @input="setRange\('\1', \(\$event\.target as HTMLInputElement\)\.value\)" @keydown="onRangeComboKey"/g) || []).length).toBe(4);
    expect((strip(s).match(/:aria-controls="rcListId"/g) || []).length, '四 range 输入均接候选弹层').toBe(4);
    /* 多字段形态字段列表两位 */
    expect((strip(s).match(/input-class="inp cn-val mono cn-fields" :model-value="fieldsText" placeholder="字段列表，逗号分隔"\s+@input="onFields\(\(\$event\.target as HTMLInputElement\)\.value\)" \/>/g) || []).length).toBe(2);
    expect(s).toMatch(/<TextInput v-else input-class="inp cn-val mono" :model-value="valText"\s+:placeholder="mainKeyPlaceholder"\s+@input="onValue\(\(\$event\.target as HTMLInputElement\)\.value\)" \/>/);
    /* 远程词项三位：placeholder 与 v-tip 文案字面保留 */
    expect(s).toMatch(/<TextInput input-class="inp mono cn-tl-in" :model-value="tlText\('index'\)" placeholder="索引名 index" v-tip="'目标索引（要取词项的文档所在索引）'" @input="onTl\('index', \(\$event\.target as HTMLInputElement\)\.value\)" \/>/);
    expect(s).toMatch(/<TextInput input-class="inp mono cn-tl-in" :model-value="tlText\('id'\)" placeholder="文档 _id" v-tip="'目标文档 _id'" @input="onTl\('id', \(\$event\.target as HTMLInputElement\)\.value\)" \/>/);
    expect(s).toMatch(/<TextInput input-class="inp mono cn-tl-in" :model-value="tlText\('path'\)" placeholder="字段路径 path" v-tip="'词项来源字段路径（多值字段取全部值）'" @input="onTl\('path', \(\$event\.target as HTMLInputElement\)\.value\)" \/>/);
    /* 值 chip：草稿 v-model + combobox aria + 四事件 */
    expect(s).toMatch(/input-class="inp cn-val mono cn-chip-in" v-model="chipDraft"\s+:placeholder="arrVals\.length \? '' : valPlaceholder"\s+role="combobox" aria-autocomplete="list" :aria-expanded="valOpen \? 'true' : 'false'" :aria-controls="valListId"\s+@focus="onChipComboFocus"\s+@keydown="onChipComboKey"\s+@paste="onChipPaste"\s+@blur="commitChip\(\)"/);
    /* 单值位：combobox aria + 粘贴升 terms 通道 */
    expect(s).toMatch(/v-else input-class="inp cn-val mono" :model-value="valText"\s+:placeholder="valPlaceholder"\s+role="combobox" aria-autocomplete="list" :aria-expanded="valOpen \? 'true' : 'false'" :aria-controls="valListId"\s+@focus="onValComboFocus"\s+@input="onValue\(\(\$event\.target as HTMLInputElement\)\.value\)"\s+@paste="onValuePaste"\s+@keydown="onValComboKey"/);
    expect((strip(s).match(/:aria-controls="valListId"/g) || []).length, '主值与 chip 输入共用值候选弹层').toBe(2);
    /* 样式落位：伸缩位打输入件根容器，高度/字号/内衬经 :deep 落真实 input；
       .cn-val 原规则保留给 NSelect 三态 / NInput 多行的根元素 */
    expect(s).toContain('.cn-val { height: 30px; font-size: var(--fs-sm); padding: 3px var(--sp-2); flex: 1 1 120px; min-width: 0; }');
    expect(s).toContain('.cn > :deep(.ti:has(.cn-val)) { flex: 1 1 120px; min-width: 0; }');
    expect(s).toContain('.cn :deep(input.cn-val) { height: 30px; font-size: var(--fs-sm); padding: 3px var(--sp-2); }');
    expect(s).toContain('.cn > :deep(.ti:has(.cn-range)) { flex: 0 1 96px; min-width: 84px; }');
    expect(s).toContain('.cn > :deep(.ti:has(.cn-fields)) { flex: 1 1 150px; }');
    expect(s).toContain('.cn-tl-tip > :deep(.ti:has(.cn-tl-in)) { width: 128px; }');
    expect(s).toContain('.cn-tl-tip :deep(.cn-tl-in) { height: 26px; font-size: var(--fs-sm); }');
    expect(s).toContain('.cn-chips > :deep(.ti:has(.cn-chip-in)) { flex: 1 1 80px; min-width: 70px; width: auto; }');
    expect(s).toContain('.cn-chips :deep(input.cn-chip-in) { height: 26px; padding: 0 var(--sp-1h); }');
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('BoolGroupNode：高级算子搜索框收敛，v-model/esc.stop/keydown 字面保留，回焦走组件实例', () => {
    const s = comp('BoolGroupNode.vue');
    expect(s).toMatch(/<TextInput ref="advQEl" v-model="advQ" input-class="inp adv-q" placeholder="搜索算子（如 multi \/ geo \/ 跨度），Enter 插入命中项"/);
    expect(s).toMatch(/@keydown\.esc\.stop="advOpen = null" @keydown="onAdvKey" \/>/);
    expect(s, 'ref 由元素改组件实例，回焦经 TextInput 暴露的 focus()').toContain('const advQEl = ref<InstanceType<typeof TextInput>>();');
    expect(s).toContain('.adv-pop > :deep(.ti:has(.adv-q)) { grid-column: 1 / -1; margin-bottom: var(--sp-1); }');
    expect(s).toContain('.adv-pop :deep(.adv-q) { height: 28px; font-size: var(--fs-sm); }');
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('WrapNodeRow：置顶 id 输入收敛，placeholder 绑定与回车/键盘/失焦三事件字面保留', () => {
    const s = comp('WrapNodeRow.vue');
    expect(s).toMatch(/input-class="inp mono wnr-ids-in" v-model="idDraft"/);
    expect(s).toContain(`:placeholder="pinnedIds.length ? '' : '文档 _id，回车添加'"`);
    expect(s).toMatch(/@keydown\.enter\.prevent="onIdEnter\(\$event\)"/);
    expect(s).toMatch(/@keydown="onIdKey"/);
    expect(s).toMatch(/@blur="commitIds\(\)"/);
    expect(s).toContain('.wnr-ids > :deep(.ti:has(.wnr-ids-in)) { width: 160px; }');
    expect(s).toContain('.wnr-ids :deep(.wnr-ids-in) { height: 26px; font-size: var(--fs-sm); border: none; background: transparent; }');
    expect(s).toContain('.wnr-ids :deep(.wnr-ids-in:focus) { outline: none; }');
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });

  it('GenericParams：五处收敛——键名/json 快捷行两位/标量值/「+ 键名」', () => {
    const s = comp('GenericParams.vue');
    expect((strip(s).match(/<TextInput[\s>]/g) || []).length, '五处文本输入全部收敛').toBe(5);
    /* 键名：受控值 + 只读位 + change 改键（handler 直写 DOM 回显，只读 $event.target.value） */
    expect(s).toContain('input-class="inp gp-k mono" :model-value="row.key" :readonly="isArr"');
    expect(s).toContain('@change="renameKey(row.key, ($event.target as HTMLInputElement).value)');
    /* json 快捷行：name/source 值取 String（原生 input 的 :value 对数字同样按文本回显），
       source 不得降级数字框（type 恒 text），aria-label 与 change 回写字面保留 */
    expect(s).toMatch(/<TextInput v-if="q === 'name'" input-class="inp gp-v mono" :model-value="String\(jsonSub\(row\.val, 'name'\)\)"/);
    expect(s).toMatch(/<TextInput v-else-if="q === 'source'" input-class="inp gp-v mono gp-jq-src" :model-value="String\(jsonSub\(row\.val, 'source'\)\)"/);
    expect(s).toContain('placeholder="painless 表达式"');
    expect(s).toContain(`:aria-label="row.key + '.' + q" @change="setJsonSub(row.key, row.val, 'name', ($event.target as HTMLInputElement).value)"`);
    expect(s).toContain(`:aria-label="row.key + '.' + q" @change="setJsonSub(row.key, row.val, 'source', ($event.target as HTMLInputElement).value)"`);
    /* 标量值：警示类并入 input-class（皮肤类顺序稳定，首位不随警示态变化），data-path/v-tip/@input 字面保留 */
    expect(s).toContain(`<TextInput v-else :input-class="row.kind === 'numstr' ? 'inp gp-v mono warn' : 'inp gp-v mono'"`);
    expect(s).toContain(':data-path="pathPrefix + row.key"');
    expect(s).toContain(`:model-value="row.raw" v-tip="row.kind === 'numstr' ? '非数字，将作为字符串提交' : ''"`);
    expect(s).toContain('@input="onScalar(row.key, ($event.target as HTMLInputElement).value, row.kind)"');
    /* 「+ 键名」：v-model + combobox aria + focus/keydown */
    expect(s).toMatch(/<TextInput v-if="!isArr" ref="kcInpEl" input-class="inp mono" v-model="newKey" placeholder="\+ 键名"/);
    expect(s).toMatch(/role="combobox" aria-autocomplete="list" :aria-expanded="kcOpen \? 'true' : 'false'" :aria-controls="kcListId"/);
    expect(s).toMatch(/@focus="onNewKeyFocus" @keydown="onNewKeyKey"/);
    expect(s, '候选弹层锚点取组件根元素（ref 为组件实例）').toContain('anchor: () => kcInpEl.value?.$el,');
    expect(s).toContain('const kcInpEl = ref<InstanceType<typeof TextInput>>();');
    /* 样式落位：.gp-v 原规则保留给 NSelect/NInput/NInputNumber/JsonArea 的根元素 */
    expect(s).toContain('.gp-v { height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); flex: 1 1 100px; min-width: 0; }');
    expect(s).toContain('.gp-row > :deep(.ti:has(.gp-k)) { width: 110px; }');
    expect(s).toContain('.gp :deep(.gp-k) { height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }');
    expect(s).toContain('.gp :deep(.ti:has(.gp-v)) { flex: 1 1 100px; min-width: 0; }');
    expect(s).toContain('.gp :deep(input.gp-v) { height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }');
    expect(s).toContain('.gp-jq :deep(.ti:has(.gp-v)) { width: 84px; }');
    expect(s).toContain('.gp-jq :deep(.ti:has(.gp-jq-src)) { width: 220px; }');
    expect(s).toContain('.gp-row:has(.gp-src) > :deep(.ti:has(.gp-k)) { margin-top: 2px; }');
    expect(s).toContain('.gp :deep(.gp-v.warn) { border-color: var(--warn); }');
    expect(s).toContain('.gp-add :deep(.ti) { width: 110px; }');
    expect(s).toContain('.gp-add :deep(.inp) { height: 28px; font-size: var(--fs-sm); }');
    expect(strip(s)).not.toMatch(NO_BARE_INPUT);
  });
});

/* ═══════════ B. 挂载行为 ═══════════ */

const apps: App[] = [];
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

function mountHost(render: () => unknown, opts: { tip?: boolean; pinia?: boolean } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: (): VNode => render() as VNode });
  app.config.warnHandler = () => {};
  if (opts.pinia) app.use(createPinia());
  if (opts.tip) app.directive('tip', vTip);
  app.mount(host);
  apps.push(app);
  return host;
}

/** 设 DOM 值并派发原生 input 事件（走 TextInput 的 v-model 回写 / @input 透传） */
function typeInto(inp: HTMLInputElement, v: string) {
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}
/** 输入后让渲染落定再进行下一步：真实事件序列（input → keydown）之间本就有一次刷新 */
async function typeThen(inp: HTMLInputElement, v: string) {
  typeInto(inp, v);
  await nextTick();
}
function press(inp: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  inp.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}
const classOf = (el: Element) => [...el.classList];

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

const leaf = (patch: Partial<LeafNode> = {}): LeafNode => ({
  id: 't1', type: 'leaf', op: 'term', field: 'status', value: 'active', params: {}, raw: null, ...patch,
});

function mountLeaf(node: LeafNode, types: Record<string, string>, opts: { tip?: boolean } = {}) {
  const cur = ref(node);
  const host = mountHost(() => h(ClauseNode, {
    node: cur.value, fields: Object.keys(types), types,
    'onUpdate:node': (n: LeafNode) => { cur.value = n; },
  }), opts);
  return { host, cur };
}

describe('B1·挂载行为：原生事件链经真实 input 透传不漂移', () => {
  it('ClauseNode：单值位——皮肤类/placeholder/combobox aria 落真实 input，input 与 paste 事件驱动同一数据流', async () => {
    const { host, cur } = mountLeaf(leaf(), { status: 'keyword' });
    const inp = host.querySelector<HTMLInputElement>('.cn input.cn-val')!;
    expect(inp.tagName).toBe('INPUT');
    expect(inp.type, 'type 恒 text').toBe('text');
    for (const c of ['inp', 'cn-val', 'mono']) expect(classOf(inp), `皮肤类 ${c} 落真实 input`).toContain(c);
    expect(classOf(inp), '根容器的类不落内层').not.toContain('ti');
    expect(inp.closest('.cn > .ti'), '输入件根容器是条件行的直接子级（伸缩位规则落位）').toBeTruthy();
    expect(inp.placeholder).toBe('精确值（整串一致）');
    expect(inp.getAttribute('role')).toBe('combobox');
    expect(inp.getAttribute('aria-autocomplete')).toBe('list');
    expect(inp.getAttribute('aria-expanded')).toBe('false');
    expect(inp.value).toBe('active');
    typeInto(inp, 'inactive');
    await tick();
    expect(cur.value.value, '@input 透传回写').toBe('inactive');
    /* 粘贴一整列：onValuePaste 通道（attrs 透传）自动升 terms */
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } };
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => 'alpha\nbeta' } });
    inp.dispatchEvent(ev);
    await tick();
    expect(cur.value.op, '@paste 透传：多值粘贴升 terms').toBe('terms');
    expect(cur.value.value).toEqual(['alpha', 'beta']);
  });

  it('ClauseNode：range 四操作符——placeholder 顺序/皮肤类落位，input 写回 range 对象，focus 开形态候选层', async () => {
    const { host, cur } = mountLeaf(leaf({ id: 'r1', op: 'range', field: 'createTime', value: { gte: 'now-7d', lte: 'now' } }), { createTime: 'date' });
    const rs = [...host.querySelectorAll<HTMLInputElement>('.cn-range')];
    expect(rs.length).toBe(4);
    expect(rs.map(r => r.placeholder)).toEqual(['≥ gte', '≤ lte', '> gt', '< lt']);
    for (const r of rs) {
      expect(r.type).toBe('text');
      expect(classOf(r)).toContain('cn-val');
      expect(classOf(r)).toContain('mono');
      expect(r.closest('.cn > .ti'), 'range 输入件根容器是条件行直接子级').toBeTruthy();
    }
    expect(rs[0].value).toBe('now-7d');
    typeInto(rs[2], '5');
    await tick();
    expect(cur.value.value).toEqual({ gte: 'now-7d', lte: 'now', gt: '5' });
    typeInto(rs[1], '');
    await tick();
    expect(cur.value.value, '清空即删键').toEqual({ gte: 'now-7d', gt: '5' });
    rs[0].dispatchEvent(new Event('focus'));
    await tick();
    const hints = [...document.querySelectorAll('.cn-hint-item')].map(o => (o.textContent || '').trim());
    expect(hints, '@focus 透传开层：date 族形态候选').toEqual(['now-1d/d', 'now-1h/h']);
  });

  it('ClauseNode：值 chip——草稿 v-model 回写；回车/中文逗号提交，空输入退格删末项，IME 组合态回车不提交', async () => {
    const { host, cur } = mountLeaf(leaf({ op: 'terms', field: 'tag', value: ['a'] }), { tag: 'keyword' });
    const inp = host.querySelector<HTMLInputElement>('.cn-chip-in')!;
    expect(classOf(inp)).toContain('cn-val');
    expect(inp.placeholder, '已有值时占位为空').toBe('');
    expect(inp.closest('.cn-chips > .ti'), 'chip 输入件根容器是 chips 行的直接子级').toBeTruthy();
    await typeThen(inp, 'b');
    press(inp, 'Enter');
    await tick();
    expect(cur.value.value, '回车提交（草稿先经 v-model 入组件态）').toEqual(['a', 'b']);
    expect(inp.value, '提交后输入框清空').toBe('');
    await typeThen(inp, 'c');
    press(inp, '，');
    await tick();
    expect(cur.value.value, '中文逗号即刻提交').toEqual(['a', 'b', 'c']);
    press(inp, 'Backspace');
    await tick();
    expect(cur.value.value, '空输入退格删末项').toEqual(['a', 'b']);
    typeInto(inp, '半');
    inp.dispatchEvent(new CompositionEvent('compositionstart'));
    press(inp, 'Enter', { isComposing: true });
    await tick();
    expect(cur.value.value, 'IME 组合态回车不提交半截值').toEqual(['a', 'b']);
    inp.dispatchEvent(new CompositionEvent('compositionend'));
    press(inp, 'Enter');
    await tick();
    expect(cur.value.value).toEqual(['a', 'b', '半']);
  });

  it('ClauseNode：空数组的 chip 输入显示回车添加占位；多字段形态字段列表按逗号拆数组写回', async () => {
    const empty = mountLeaf(leaf({ op: 'terms', field: 'tag', value: [] }), { tag: 'keyword' });
    expect((empty.host.querySelector('.cn-val') as HTMLInputElement).placeholder).toBe('输入值后回车或逗号添加');
    empty.host.remove();

    const { host, cur } = mountLeaf(leaf({ id: 'm1', op: 'multi_match', field: null, fields: ['title', 'summary'], value: '债券' }), { title: 'text' });
    const vals = [...host.querySelectorAll<HTMLInputElement>('.cn-val')];
    expect(vals.length, '主值 + 字段列表两位').toBe(2);
    expect(vals.map(v => v.value)).toEqual(['债券', 'title,summary']);
    expect((vals[0] as HTMLInputElement).placeholder).toBe('主值（query）');
    expect((vals[1] as HTMLInputElement).placeholder).toBe('字段列表，逗号分隔');
    typeInto(vals[1], 'a, b ,c');
    await tick();
    expect(cur.value.fields).toEqual(['a', 'b', 'c']);
    typeInto(vals[0], '利率');
    await tick();
    expect(cur.value.value).toBe('利率');
  });

  it('ClauseNode：远程词项三位——placeholder/值落位，v-tip 经输入件根容器仍可由聚焦触发，input 写回', async () => {
    const { host, cur } = mountLeaf(
      leaf({ op: 'terms', field: 'order_no', value: { index: 'orders-lookup', id: '1', path: 'vip_no' } }),
      { order_no: 'keyword' }, { tip: true });
    const ins = [...host.querySelectorAll<HTMLInputElement>('.cn-tl-in')];
    expect(ins.map(i => i.placeholder)).toEqual(['索引名 index', '文档 _id', '字段路径 path']);
    expect(ins.map(i => i.value)).toEqual(['orders-lookup', '1', 'vip_no']);
    for (const i of ins) {
      expect(i.type).toBe('text');
      expect(classOf(i)).toContain('inp');
      expect(classOf(i)).toContain('mono');
      expect(i.closest('.cn-tl-tip > .ti'), '输入件根容器是提示行的直接子级（定宽规则落位）').toBeTruthy();
    }
    /* v-tip 指令挂在输入件根容器上（真实 input 聚焦时 focusin 冒泡到此）：键盘通道监听在位，
       文案不丢。直接在根容器上派发不冒泡的 focusin，排除外层提示行同名通道的干扰 */
    const tipHost = ins[1].closest('.ti')!;
    tipHost.dispatchEvent(new Event('focusin'));
    expect(document.getElementById('vt-tip')?.textContent, '悬浮说明文案不丢').toBe('目标文档 _id');
    typeInto(ins[1], '7');
    await tick();
    expect((cur.value.value as Record<string, unknown>).id).toBe('7');
    typeInto(ins[2], '');
    await tick();
    expect(cur.value.value, '清空即删键').toEqual({ index: 'orders-lookup', id: '7' });
  });

  it('BoolGroupNode：高级算子搜索框——打开即回焦真实 input；输入过滤、回车直插、Esc 关闭', async () => {
    let last: BoolNode | null = null;
    const group: BoolNode = { id: 'g1', type: 'bool', children: [{ occur: 'must', node: leaf({ id: 'c1' }) }], params: {}, arrForm: { must: true } };
    const cur = ref(group);
    const host = mountHost(() => h(BoolGroupNode, {
      node: cur.value, fields: ['status'], types: { status: 'keyword' },
      'onUpdate:node': (n: BoolNode) => { cur.value = n; last = n; },
    }));
    const advBtn = () => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === '高级') as HTMLButtonElement;
    advBtn().click();
    await tick();
    const q = document.body.querySelector<HTMLInputElement>('.adv-q')!;
    expect(q.tagName).toBe('INPUT');
    expect(q.type).toBe('text');
    for (const c of ['inp', 'adv-q']) expect(classOf(q), `皮肤类 ${c} 落真实 input`).toContain(c);
    expect(classOf(q), '根容器的类不落内层').not.toContain('ti');
    expect(q.parentElement!.classList.contains('ti'), '输入件根容器紧包真实 input（跨列/间距规则落位）').toBe(true);
    expect(q.placeholder).toBe('搜索算子（如 multi / geo / 跨度），Enter 插入命中项');
    expect(document.activeElement, '打开即回焦（ref 为组件实例，经其 focus() 落真实 input）').toBe(q);
    typeInto(q, 'geo_dis');
    await tick();
    const items = [...document.body.querySelectorAll('.adv-i')].map(b => b.textContent || '');
    expect(items.length, '输入驱动过滤（v-model 回写）').toBe(1);
    expect(items[0]).toContain('geo_distance');
    press(q, 'Enter');
    await tick();
    expect((last!.children[1].node as LeafNode).op, '回车直插首个命中').toBe('geo_distance');
    expect(document.body.querySelector('.adv-pop'), '插入后菜单关').toBeNull();
    advBtn().click();
    await tick();
    const q2 = document.body.querySelector<HTMLInputElement>('.adv-q')!;
    expect(document.activeElement).toBe(q2);
    press(q2, 'Escape');
    await tick();
    expect(document.body.querySelector('.adv-pop'), 'Esc 经 keydown.esc.stop 透传关闭菜单').toBeNull();
  });

  it('WrapNodeRow：置顶 id 输入——皮肤类/占位落真实 input；回车/逗号/失焦提交，空输入退格删末项', async () => {
    const mk = (ids: unknown): WrapNode => {
      const n = parseQueryNode({ pinned: { ids, organic: { term: { a: 1 } } } });
      if (n.type !== 'wrap') throw new Error('not wrap');
      return n;
    };
    const mount = (ids: unknown) => {
      const cur = ref(mk(ids));
      const host = mountHost(() => h(WrapNodeRow, {
        node: cur.value, fields: ['a'], types: { a: 'keyword' },
        'onUpdate:node': (n: WrapNode) => { cur.value = n; },
      }));
      return { host, cur };
    };
    const empty = mount([]);
    const emptyInp = empty.host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    expect(emptyInp.placeholder, '无置顶 id 时显示回车添加占位').toBe('文档 _id，回车添加');
    empty.host.remove();

    const { host, cur } = mount(['1', '2']);
    const inp = host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    expect(inp.tagName).toBe('INPUT');
    expect(inp.type).toBe('text');
    for (const c of ['inp', 'mono', 'wnr-ids-in']) expect(classOf(inp), `皮肤类 ${c} 落真实 input`).toContain(c);
    expect(inp.closest('.wnr-ids > .ti'), '输入件根容器是置顶 id 行的直接子级（定宽规则落位）').toBeTruthy();
    expect(inp.placeholder, '已有 id 时占位为空').toBe('');
    await typeThen(inp, '3');
    press(inp, 'Enter');
    await tick();
    expect(cur.value.params.ids, '回车提交').toEqual(['1', '2', '3']);
    expect(inp.value, '提交后输入框清空').toBe('');
    await typeThen(inp, '4');
    press(inp, ',');
    await tick();
    expect(cur.value.params.ids, '逗号即刻提交').toEqual(['1', '2', '3', '4']);
    await typeThen(inp, '5');
    inp.dispatchEvent(new Event('blur'));
    await tick();
    expect(cur.value.params.ids, '失焦提交残余草稿').toEqual(['1', '2', '3', '4', '5']);
    press(inp, 'Backspace');
    await tick();
    expect(cur.value.params.ids, '空输入退格删末项').toEqual(['1', '2', '3', '4']);
  });

  it('WrapNodeRow：IME 组合态回车不提交（守卫不变）', async () => {
    const n = parseQueryNode({ pinned: { ids: ['1', '2'], organic: { term: { a: 1 } } } });
    if (n.type !== 'wrap') throw new Error('not wrap');
    const cur = ref(n);
    const host = mountHost(() => h(WrapNodeRow, {
      node: cur.value, fields: ['a'], types: { a: 'keyword' },
      'onUpdate:node': (v: WrapNode) => { cur.value = v; },
    }));
    const inp = host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    typeInto(inp, '中文');
    inp.dispatchEvent(new CompositionEvent('compositionstart'));
    press(inp, 'Enter', { isComposing: true });
    await tick();
    expect(cur.value.params.ids, '组合态回车不提交半截值').toEqual(['1', '2']);
    inp.dispatchEvent(new CompositionEvent('compositionend'));
    press(inp, 'Enter');
    await tick();
    expect(cur.value.params.ids).toEqual(['1', '2', '中文']);
  });

  it('GenericParams：键名输入——change 改键；撞已有键名时拒绝并把显示改回原键名；数组通道只读', async () => {
    const mount = (value: Record<string, unknown> | unknown[]) => {
      const cur = ref(value);
      const host = mountHost(() => h(GenericParams, { value: cur.value, schema: [], onUpdate: (v: Record<string, unknown> | unknown[]) => { cur.value = v as never; } }), { pinia: true });
      return { host, cur };
    };
    const arr = mount(['x', 'y']);
    const arrKeys = [...arr.host.querySelectorAll<HTMLInputElement>('.gp-k')];
    expect(arrKeys.length).toBe(2);
    expect(arrKeys.every(k => k.readOnly), '数组通道键名只读（readonly 透传真实 input）').toBe(true);
    expect(arr.host.querySelector('.gp-add input'), '数组通道不出「+ 键名」').toBeNull();
    arr.host.remove();

    const { host, cur } = mount({ a: 1, b: 2 });
    const keys = () => [...host.querySelectorAll<HTMLInputElement>('.gp-k')];
    expect(keys().length).toBe(2);
    const first = keys()[0];
    expect(first.type).toBe('text');
    for (const c of ['inp', 'gp-k', 'mono']) expect(classOf(first), `皮肤类 ${c} 落真实 input`).toContain(c);
    expect(first.closest('.gp-row > .ti'), '输入件根容器是参数行的直接子级（定宽规则落位）').toBeTruthy();
    first.value = 'c';
    first.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(Object.keys(cur.value as Record<string, unknown>), '@change 透传改键').toEqual(['c', 'b']);
    const renamed = keys()[0];
    renamed.value = 'b';
    renamed.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(cur.value, '撞已有键名不改树').toEqual({ c: 1, b: 2 });
    expect(keys()[0].value, '撞名时显示改回原键名（handler 直写 DOM，受控值未变不打断）').toBe('c');
  });

  it('GenericParams：标量值输入——data-path/皮肤类落真实 input，原生 input 事件回写并保类型；警示态皮肤类并入 input-class', async () => {
    const cur = ref<Record<string, unknown>>({ size: 10, note: 'x' });
    const host = mountHost(() => h(GenericParams, { value: cur.value, schema: [], onUpdate: (v: Record<string, unknown> | unknown[]) => { cur.value = v as Record<string, unknown>; } }), { pinia: true });
    const sz = host.querySelector<HTMLInputElement>('input[data-path="size"]')!;
    expect(sz.tagName).toBe('INPUT');
    expect(sz.type, '数值标量走文本输入（容忍非数字并提示），不降级原生 number 框').toBe('text');
    expect(classOf(sz)).toEqual(expect.arrayContaining(['inp', 'gp-v', 'mono']));
    expect(classOf(sz), '常态不带警示类').not.toContain('warn');
    expect(sz.closest('.gp-row > .ti'), '输入件根容器是参数行的直接子级（伸缩位规则落位）').toBeTruthy();
    expect(sz.value).toBe('10');
    typeInto(sz, '12');
    await tick();
    expect(cur.value.size, '数字键仍写回 number').toBe(12);
    typeInto(sz, 'abc');
    await tick();
    expect(cur.value.size, '非数字按字符串保留').toBe('abc');
    expect(sz.value, '显示跟随模型').toBe('abc');
    expect(classOf(host.querySelector('input[data-path="note"]')!)).toEqual(expect.arrayContaining(['inp', 'gp-v', 'mono']));
  });

  it('GenericParams：「+ 键名」——v-model 同步、回车落体；↓ 开候选层并按输入件根元素定位', async () => {
    const cur = ref<Record<string, unknown>>({ field: 'price' });
    const host = mountHost(() => h(GenericParams, {
      value: cur.value, schema: [{ key: 'value', kind: 'json' }, { key: 'weight', kind: 'json' }],
      onUpdate: (v: Record<string, unknown> | unknown[]) => { cur.value = v as Record<string, unknown>; },
    }), { pinia: true });
    const add = host.querySelector<HTMLInputElement>('.gp-add input')!;
    expect(add.type).toBe('text');
    expect(add.placeholder).toBe('+ 键名');
    expect(add.getAttribute('role')).toBe('combobox');
    expect(add.getAttribute('aria-expanded')).toBe('false');
    await typeThen(add, 'missing');
    press(add, 'Enter');
    await tick();
    expect((cur.value as Record<string, unknown>).missing, '回车落体（草稿先经 v-model 入组件态）').toBe('');
    expect(add.value, '落体后输入框清空').toBe('');
    press(add, 'ArrowDown');
    await tick();
    const pop = document.body.querySelector<HTMLElement>('.gp-kc-pop');
    expect(pop, '↓ 开候选层').toBeTruthy();
    expect(pop!.style.left, '弹层按输入件根元素定位（锚点可达）').not.toBe('');
    expect(add.getAttribute('aria-expanded')).toBe('true');
    const list = document.getElementById(add.getAttribute('aria-controls')!);
    expect(list?.getAttribute('role'), 'aria-controls 指向候选列表').toBe('listbox');
    expect([...(list?.querySelectorAll('.gp-kc-item') || [])].map(i => i.getAttribute('data-v'))).toEqual(['value', 'weight']);
    press(add, 'Escape');
    await tick();
    expect(document.body.querySelector('.gp-kc-pop'), 'Esc 关层').toBeNull();
  });

  it('GenericParams：json 快捷行 name/source——文本类型不降级数字框，placeholder/aria 落位，change 回写', async () => {
    const cur = ref<Record<string, unknown>>({ inner_hits: { name: 5, size: 3 }, minimum_should_match_script: { source: 'Math.min(params.n, 2)', params: {} } });
    /* 外层键须登记为 json 档才出结构化快捷行（其余键仍走 JSON 文本位） */
    const host = mountHost(() => h(GenericParams, {
      value: cur.value,
      schema: [{ key: 'inner_hits', kind: 'json' }, { key: 'minimum_should_match_script', kind: 'json' }],
      onUpdate: (v: Record<string, unknown> | unknown[]) => { cur.value = v as Record<string, unknown>; },
    }), { pinia: true });
    const name = host.querySelector<HTMLInputElement>('[aria-label="inner_hits.name"]')!;
    expect(name.type, 'name 走文本输入').toBe('text');
    expect(name.value, '数字形态的 name 同样按文本回显').toBe('5');
    typeInto(name, 'c');
    name.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect((cur.value.inner_hits as Record<string, unknown>).name).toBe('c');
    expect((cur.value.inner_hits as Record<string, unknown>).size, '同对象其余键不动').toBe(3);

    const src = host.querySelector<HTMLInputElement>('.gp-jq-src')!;
    expect(src.type, 'source 是字符串（painless 表达式），不得降级数字框').toBe('text');
    expect(src.placeholder).toBe('painless 表达式');
    expect(src.getAttribute('aria-label')).toBe('minimum_should_match_script.source');
    expect(src.value).toContain('Math.min');
    src.value = 'params.n > 1 ? 2 : 1';
    src.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect((cur.value.minimum_should_match_script as Record<string, unknown>).source).toBe('params.n > 1 ? 2 : 1');
    expect((cur.value.minimum_should_match_script as Record<string, unknown>).params).toEqual({});
  });
});

describe('B1·焦点归还：条件树 Alt+↑/↓ 移动后的回焦目标不漂移', () => {
  /* QueryTreePane.nudgeFocused 按聚焦元素的首个类名回找同级行内的对应控件。原生 input 时代
     值输入的首类是 inp，回焦落到行内第一个 .inp（字段框）；收敛后首类是 TextInput 内层的
     ti-inp，回焦落到行内第一个 TextInput 真实 input——两者都必须是本行字段框，行为才一致。 */
  it('值输入上按 Alt+↑ 上移本行后，焦点仍归还到该行的字段输入框', async () => {
    const t = parseTree({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    if (!t.ok) throw new Error(t.reason);
    const cur = shallowRef<QueryTree>(t.tree);
    const host = mountHost(() => h(QueryTreePane, {
      tree: cur.value, fields: ['a', 'b', 'c'], types: { a: 'keyword', b: 'keyword', c: 'keyword' },
      'onUpdate:tree': (x: QueryTree) => { cur.value = x; },
    }));
    await tick();
    const vals = [...host.querySelectorAll<HTMLInputElement>('.cn input.cn-val')];
    expect(vals.length).toBe(3);
    const root = t.tree.root as BoolNode;
    const movedId = root.children[1].node.id;
    vals[1].focus();
    expect(document.activeElement, '前置：焦点在第二行的值输入').toBe(vals[1]);
    vals[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
    await tick();
    const keys = ((serializeTree(cur.value) as Record<string, any>).query.bool.must as Array<Record<string, Record<string, unknown>>>)
      .map(x => Object.keys(x.term)[0]);
    expect(keys, '行已上移').toEqual(['b', 'a', 'c']);
    const row = host.querySelector<HTMLElement>(`[data-nid="${movedId}"]`)!;
    const fieldInp = row.querySelector('.fs-inp');
    expect(fieldInp, '行内首个输入是字段框').toBeTruthy();
    expect(document.activeElement, '焦点归还到移动后本行的字段输入框（与原生 input 时代一致）').toBe(fieldInp);
  }, 15000);
});
