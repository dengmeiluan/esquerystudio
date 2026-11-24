/**
 * 五百五十七批 轨3：数据表格内核本体增量。
 * 锁定：
 * 1) typeTiers NON_SEMANTIC_TYPES_RE 扩容 8 型（point/shape/dense_vector/sparse_vector/
 *    percolator/completion/histogram/aggregate_metric_double）——16 型逐型真值+既有 8 型
 *    不回退+语义族/空值不误伤；消费点（QRT isNumericCol/isRangeCol/isContainsCol/colStats/
 *    numericOfCount/aggSpark、RT 对称、ColDetailModal）全走 isNonSemanticType 自动生效；
 * 2) QRT semOn 显示链：显式非语义类型自动抑制「按值推断」（binary 列 1500 不再判 1.5s、
 *    0.5 不再判 50%，tone 分档类随之沉默；普通列照旧推断）——534 批 semFormat 调用字面
 *    与 semRawSet 声明字面被锁，守卫走 if 条件位（改旁不改锚）；
 * 3) RT 对称件：semText/semToneCls 同款守卫（semFormat 调用字面 534 锁不动，同改条件位）+
 *    colMenuItems reset-order 补 prefsOn 门控（与 QRT:1329 对称；无记忆模式不再出假菜单项）；
 * 4) ColPicker 列管理重排：选中项行内 ▲▼ 微调钮——点击 emit update:selected 全量新序
 *    （首/末边界禁用；未选中行无钮；不误触勾选）；
 * 5) QRT 列头右键菜单「复制整表 JSON」——copyMatrix json 管道现成，行集=sortedRows
 *    （与整表 TSV 同口径）、列=shownCols、值=raw（qColVal）。
 * 挂载样板照抄 tableKernelWave534/552 与 colPicker（裸 createApp + pinia；n-popover/CellContextMenu
 * teleport 到 body 查 document）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import ColPicker from '../components/ColPicker.vue';
import { NON_SEMANTIC_TYPES_RE, isNonSemanticType } from '../utils/typeTiers';

const typeTiers = readFileSync(join(__dirname, '../utils/typeTiers.ts'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

async function mountPicker(props: { cols: string[]; selected: string[] }) {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
  emitted.length = 0;
  const sel = ref(props.selected);
  const app = createApp({
    setup() {
      return () => h(ColPicker as any, {
        cols: props.cols,
        selected: sel.value,
        'onUpdate:selected': (v: string[]) => { sel.value = v; emitted.push(v); },
      });
    },
  });
  app.mount(host);
  apps.push(app);
  await nextTick();
  (host.querySelector('button') as HTMLButtonElement).click();
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}

const emitted: string[][] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
  document.querySelectorAll('.ccm-mask, .cfp').forEach(e => e.remove());
});

const thOf = (root: HTMLElement, col: string) =>
  [...root.querySelectorAll('thead th')].find(t => (t as HTMLElement).dataset.col === col) as HTMLElement;

const menuButtons = () => [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];

async function openColMenu(root: HTMLElement, col: string) {
  thOf(root, col).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  await tick(4);
}

/* ═══════════ 一、typeTiers 8 型扩容（①） ═══════════ */
describe('五百五十七批 ①：NON_SEMANTIC_TYPES_RE 扩容 8 型', () => {
  it('16 型逐型真值：既有 8 型不回退 + 新 8 型合并', () => {
    const EXISTING = ['binary', 'nested', 'object', 'geo_point', 'geo_shape', 'attachment', 'flattened', 'join'];
    const ADDED = ['point', 'shape', 'dense_vector', 'sparse_vector', 'percolator', 'completion', 'histogram', 'aggregate_metric_double'];
    for (const t of [...EXISTING, ...ADDED]) {
      expect(isNonSemanticType(t), `非语义类型 ${t} 应判真`).toBe(true);
      expect(NON_SEMANTIC_TYPES_RE.test(t), `正则直判 ${t}`).toBe(true);
    }
  });

  it('语义族/空值不误伤（数值/日期/文本/keyword/ip 与 undefined 恒假）', () => {
    for (const t of ['long', 'double', 'scaled_float', 'date', 'date_nanos', 'keyword', 'text', 'ip', 'boolean', undefined, '']) {
      expect(isNonSemanticType(t), `语义类型 ${t} 不得误伤`).toBe(false);
    }
  });

  it('源码锚：typeTiers 新字面在场（16 型全量；五百六十一批并 ip_range → 17 型同步更新）', () => {
    expect(typeTiers).toContain('/^(binary|nested|object|geo_point|geo_shape|attachment|flattened|join|point|shape|dense_vector|sparse_vector|percolator|completion|histogram|aggregate_metric_double|ip_range)$/');
  });
});

/* ═══════════ 二、QRT semOn 显示链：显式非语义类型抑制按值推断（②） ═══════════ */
describe('五百五十七批 ②：QRT semOn 显示链非语义抑制', () => {
  it('源码锚：displayText/semToneCls 守卫位并上 isNonSemanticType（534 semFormat 调用字面不动）', () => {
    /* 534 批锁面（tableKernelWave534:66/67）字面原样在场——守卫走条件位不改锚 */
    expect(qrt).toMatch(/semFormat\(cell, effType\(col\) \?\? '', \{ noInfer: semRawSet\.value\.has\(col\) \}\)/);
    expect(qrt).toMatch(/const semRawSet = computed\(\(\) => new Set\(props\.semRawCols \?\? \[\]\)\);/);
    /* 1439 迁移：守卫位并上 semPref——「语义格式化」开关关掉时 semOn 也要回落 raw
       （与查询树/索引工作区同款开关表现一致）。534 semFormat 调用字面仍未动。 */
    expect(qrt, 'displayText 守卫位扩源（1439 并上 semPref）').toMatch(/if \(props\.semOn && semPref\.value && !isNonSemanticType\(effType\(col\)\)\) \{/);
    expect(qrt, 'semToneCls 守卫位扩源（1439 并上 semPref）').toMatch(/if \(!props\.semOn \|\| !semPref\.value \|\| cell === null/);
  });

  it('行为锚：binary 列 1500 显 1500 不判「1.5s」、0.5 显 0.5 不判「50%」且无 tone 类；普通列照旧推断', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['blob', 'n'],
      rows: [[1500, 1500], [0.5, 0.5]] as any,
      semOn: true,
      fieldTypes: { blob: 'binary' },
    });
    const cells = (col: string) =>
      [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'))
        .map(tr => [...tr.querySelectorAll('td.qrt-cell')][['blob', 'n'].indexOf(col)] as HTMLElement);
    expect(cells('blob')[0].textContent?.trim(), 'binary 列 ≥1000 不判 ms').toBe('1500');
    expect(cells('blob')[1].textContent?.trim(), 'binary 列 0..1 不判 percent').toBe('0.5');
    expect(cells('blob')[0].className, 'binary 列无语义 tone 分档类').not.toMatch(/qrt-sem-/);
    expect(cells('n')[0].textContent?.trim(), '无类型列照旧判 ms').toBe('1.5s');
    expect(cells('n')[1].textContent?.trim(), '无类型列照旧判 percent').toBe('50%');
  });
});

/* ═══════════ 三、RT 对称件（③） ═══════════ */
describe('五百五十七批 ③：RT semText/semToneCls 守卫对称 + reset-order prefsOn 门控', () => {
  const RHITS = [
    { _id: 'a', _source: { blob: 1500, n: 1500 } },
    { _id: 'b', _source: { blob: 0.5, n: 0.5 } },
  ] as any;

  const cellOf = (col: string) =>
    [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === col) as HTMLElement;

  it('源码锚：semText/semToneCls 守卫位（534 semFormat 调用字面不动）+ reset-order prefsOn 门控', () => {
    expect(rt).toMatch(/semFormat\(v, props\.fieldTypes\?\.\[c\] \?\? '', \{ noInfer: semRawSet\.value\.has\(c\) \}\)/);
    expect(rt, 'semText 守卫位扩源').toMatch(/if \(props\.semOn && !isNonSemanticType\(props\.fieldTypes\?\.\[c\]\)\) \{/);
    expect(rt, 'semToneCls 守卫位扩源').toMatch(/isNonSemanticType\(props\.fieldTypes\?\.\[c\]\)\) return \{\};/);
    expect(rt, 'reset-order 补 prefsOn 门控（与 QRT:1329 对称）').toMatch(/\.\.\.\(prefsOn\.value \? \[\{ key: 'reset-order'/);
  });

  it('行为锚：binary 标注列不产推断格式（1500 显 1500、0.5 显 0.5、无 tone 类）；普通列照旧', async () => {
    await mountTbl(ResultTable, { hits: RHITS, total: 2, index: 'w557rt', semOn: true, fieldTypes: { blob: 'binary' } });
    expect(cellOf('blob').textContent?.trim(), 'binary 列不判 ms').toBe('1500');
    expect(cellOf('blob').className, 'binary 列无语义 tone 分档类').not.toMatch(/rt-sem-/);
    expect(cellOf('n').textContent?.trim(), '无类型列照旧判 ms').toBe('1.5s');
  });

  it('reset-order 门控行为：无记忆（dimension 缺）不出项；有 storageKey 出项', async () => {
    await mountTbl(ResultTable, { hits: RHITS, total: 2 });
    await openColMenu(host, 'blob');
    expect(menuButtons().map(b => b.textContent?.trim()), '无记忆模式不出重置列序（假菜单项退役）').not.toContain('重置列序');
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    document.querySelectorAll('.ccm-mask').forEach(e => e.remove());
    await mountTbl(ResultTable, { hits: RHITS, total: 2, index: 'w557ro', storageKey: 'w557ro' });
    await openColMenu(host, 'blob');
    expect(menuButtons().map(b => b.textContent?.trim()), '记忆启用出重置列序').toContain('重置列序');
  });
});

/* ═══════════ 四、ColPicker ▲▼ 重排（④） ═══════════ */
describe('五百五十七批 ④：ColPicker 选中项 ▲▼ 重排', () => {
  it('点击 ▲/▼ emit update:selected 全量新序；首/末边界禁用；未选中行无钮；不误触勾选', async () => {
    await mountPicker({ cols: ['a', 'b', 'c'], selected: ['a', 'b'] });
    const rowOf = (c: string) =>
      [...document.querySelectorAll('.col-pick-item')].find(el => el.textContent?.includes(c)) as HTMLElement;
    const mvBtn = (row: HTMLElement, dir: '上移' | '下移') =>
      row.querySelector<HTMLButtonElement>(`button[aria-label="${dir}"]`);
    /* 边界：首列 ▲ 禁用、末选中列 ▼ 禁用 */
    expect(mvBtn(rowOf('a'), '上移')!.disabled, '首列上移禁用').toBe(true);
    expect(mvBtn(rowOf('b'), '下移')!.disabled, '末选中列下移禁用').toBe(true);
    /* 未选中行无重排钮 */
    expect(mvBtn(rowOf('c'), '上移'), '未选中行无上移钮').toBeNull();
    /* b 上移 → 全量新序 ['b','a']（受控回写，序即显示序） */
    mvBtn(rowOf('b'), '上移')!.click();
    await tick(4);
    expect(emitted, '上移发全量新序').toEqual([['b', 'a']]);
    /* 新序下 'a' 变末位：▼ 解禁、'b' 变首位：▲ 禁用（边界随受控序联动） */
    expect(mvBtn(rowOf('b'), '上移')!.disabled, '新首列上移禁用').toBe(true);
    expect(mvBtn(rowOf('a'), '下移')!.disabled, '新末列下移禁用').toBe(true);
  });

  it('aria-label 中文可达（上移/下移）', async () => {
    await mountPicker({ cols: ['a', 'b'], selected: ['a', 'b'] });
    const labels = [...document.querySelectorAll('.col-pick-item button')].map(b => b.getAttribute('aria-label'));
    expect(labels.filter(l => l === '上移').length, '每选中行一枚上移钮').toBe(2);
    expect(labels.filter(l => l === '下移').length, '每选中行一枚下移钮').toBe(2);
  });
});

/* ═══════════ 五、QRT 列头右键「复制整表 JSON」（⑤） ═══════════ */
describe('五百五十七批 ⑤：QRT 列头菜单「复制整表 JSON」', () => {
  it('列头右键出项 → 剪贴板=shownCols 全行 JSON 数组（raw 值、2 空格缩进）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl(QueryResultTable, {
      cols: ['name', 'age'],
      rows: [['x', 1], ['y', 2]] as any,
      storageKey: 'w557cp',
    });
    await openColMenu(host, 'name');
    const item = menuButtons().find(b => b.textContent?.includes('复制整表 JSON'));
    expect(item, '列头菜单含「复制整表 JSON」项').toBeTruthy();
    item!.click();
    await tick(6);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0], '整表 JSON=shownCols 键 + raw 值（matrixJson 2 空格缩进）')
      .toBe(JSON.stringify([{ name: 'x', age: 1 }, { name: 'y', age: 2 }], null, 2));
  });

  it('隐藏一列后复制收窄（列源=shownCols 所见即所复）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    localStorage.setItem('es_cols:w557cp2', JSON.stringify(['age']));
    await mountTbl(QueryResultTable, {
      cols: ['name', 'age'],
      rows: [['x', 1], ['y', 2]] as any,
      storageKey: 'w557cp2',
    });
    await openColMenu(host, 'age');
    menuButtons().find(b => b.textContent?.includes('复制整表 JSON'))!.click();
    await tick(6);
    expect(writeText.mock.calls[0][0]).toBe(JSON.stringify([{ age: 1 }, { age: 2 }], null, 2));
  });
});
