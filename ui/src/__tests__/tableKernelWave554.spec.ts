/**
 * 五百五十四批 工蚁C（数据表格内核轨）：六件。
 * 五百五十四批 工蚁1 追加 F 段（工具行勾选态单行纪律）：
 * ⑦ 根因=①.rt-bar（RT:2331/QRT:1839）无 flex-wrap 单行纪律，勾选态反选钮（RT:127-130
 *    bar-right 尾部）使右簇变宽后，收缩压力全落在左簇文本类 flex item（rt-info/qrt-coln
 *    min-content=单字宽）→ 文本折行把工具行撑成两行、右簇溢出「反选」孤立悬挂；
 *   ②隐藏共因=527 批 TableShell 合并后内核 scoped 的 .rt-bar-r/.qrt-bar-r 规则因 scopeId
 *    不传播而死（壳内部元素无内核 scopeId，F6 实锤）——右簇实际裸 inline 排列无 flex/gap/
 *    垂直居中，挤压下排布失控。修法=壳级右簇纪律新家（TableShell 全局 style，双内核类名
 *    锚定 flex+nowrap+shrink:0）+两内核 .rt-bar/.qrt-bar 显式 nowrap+左簇文本项 ellipsis
 *    吸收收缩（rt-info/qrt-coln）+nowrap 防折（rt-filtered/qrt-filtered）；
 *    缺省（未勾选）态 DOM 逐字节不变（模板零动，纯 CSS），26px 控制线零触（ nowrap 后
 *    无折行撑高），291 内建钮字面零触。QRT selectable 勾选态工具行 DOM 零变化（F7 同病
 *    检查结论锁）。538:174 形态代表锚同步更新 TableShell（锁意图=--sp 合并纪律，字面新家）。
 * 锁定：
 * ① RT 漏斗激活并集收尾（552 对称件）——funnelOn=等值勾选 ∪ 区间 ∪ 包含，RT 漏斗此前只认
 *    等值的暗状态缺口修复（锁形镜像 552:278-306 口径）；
 * ② RT contains 包含筛选档接入——弹层 contains 行 + @set-contains 接线 + 解构补齐
 *    （containsFilters/containsOn/setContainsFilter）；
 * ③ 筛选入口非语义类型守卫 isContainsCol——binary/geo_point/nested/object/ip 列无文本包含
 *    语义，弹层不出包含行（QRT 静态 contains 收守卫；RT 新接行同守卫）；无显式类型列
 *    不抑制（552:292 'name' 自洽）；
 * ④ ColDetailModal 非语义类型降级——binary/geo 等照出高频值 top5（base64 串无意义）→
 *    藏 rt-cd-top 段，空值/空值率行保留；.rt-cd 根类名契约不动（rtColDetailFreeze236/
 *    qrtColDetail519 按 .rt-cd 查询）；
 * ⑤ tfoot 空值率档——RT/QRT 聚合行「· med」之后 append「 · 空值率 N%」（rt-agg-empty /
 *    qrt-agg-empty），口径与 ColDetailModal.emptyRatePct 同源（Math.round 取整 %）；
 *    数值列才出（aggFoot 在场=装配守卫，与非语义守卫一致）；numericOfCount 装配 return 行
 *    538 源码锁逐字禁动——空值率从 statsOf 另取（aggEmptyPct computed），不塞装配层；
 * ⑥ range 判据合并 typeTiers——RANGE_DATE_RE/isRangeType/rangePlaceholderTxt 单源导出，
 *    RT isRangeCol 本体 545 源码锁逐字不动（只改判据引用），两表行为逐字节等值。
 * 挂载样板照抄 tableKernelWave552（裸 createApp + pinia harness）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import ColDetailModal from '../components/ColDetailModal.vue';
import { RANGE_DATE_RE, isRangeType, rangePlaceholderTxt } from '../utils/typeTiers';

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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .cfp-mask, .ccm-mask').forEach(e => e.remove());
});

/* 漏斗/弹层/行集取法（552 同款口径；QRT qrt-funnel / RT rt-funnel 同 aria 语言） */
const funnelOf = (tbl: 'rt' | 'qrt', col: string) =>
  [...host.querySelectorAll(`thead th .${tbl}-funnel`)]
    .find(b => b.getAttribute('aria-label') === '筛选 ' + col + ' 列') as HTMLButtonElement;

const containsInp = (col: string) =>
  document.querySelector(`.cfp input[aria-label="${col} 包含文本筛选"]`) as HTMLInputElement | null;

const rangeInp = (col: string) =>
  document.querySelector(`.cfp input[aria-label="${col} 最小值（含）"]`) as HTMLInputElement | null;

const rtDataRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.rt-cell'));
const qrtDataRows = () => [...host.querySelectorAll('tbody tr td.qrt-idx')].map(e => e.textContent);

async function typeIn(inp: HTMLInputElement, v: string) {
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(6);
}

/* ═══════════ 一、RT 漏斗激活并集 + contains 接入（①②） ═══════════ */
describe('五百五十四批 A：RT 漏斗并集（等值∪区间∪包含）+ contains 接入', () => {
  const HITS = [
    { _id: 'a', _source: { name: 'banana', age: 2 } },
    { _id: 'b', _source: { name: 'apple', age: 5 } },
    { _id: 'c', _source: { name: 'cherry', age: 9 } },
  ] as any;

  it('① RT：区间档点亮漏斗（此前只认等值勾选——并集口径收尾）', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w554r1' });
    funnelOf('rt', 'age')!.click();
    await tick(4);
    const minp = rangeInp('age');
    expect(minp, '数值采样列区间输入在场（520 采样口径不回退）').toBeTruthy();
    await typeIn(minp!, '3');
    expect(rtDataRows().length, '区间过滤行集（age≥3 → 2 行）').toBe(2);
    expect(funnelOf('rt', 'age')!.classList.contains('on'), '区间档点亮漏斗（并集口径）').toBe(true);
    expect(host.querySelector('.rt-filtered')!.textContent).toContain('已筛选 1 列');
  });

  it('② RT：弹层包含输入行 → 行过滤 + 漏斗点亮（552 QRT 对称件）', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w554r2' });
    funnelOf('rt', 'name')!.click();
    await tick(4);
    const cinp = containsInp('name');
    expect(cinp, 'RT 弹层包含筛选输入行在场').toBeTruthy();
    await typeIn(cinp!, 'an');
    expect(rtDataRows().length, 'contains 过滤行集（只剩 banana）').toBe(1);
    expect(funnelOf('rt', 'name')!.classList.contains('on'), '包含档点亮漏斗').toBe(true);
    expect(host.querySelector('.rt-filtered')!.textContent).toContain('已筛选 1 列');
    /* 弹层「清除」=该列三档同清（useColFilters.clearFilter 内置） */
    (document.querySelector('.cfp .cfp-clear') as HTMLButtonElement).click();
    await tick(6);
    expect(rtDataRows().length, '清除后恢复全行').toBe(3);
    expect(host.querySelector('.rt-filtered')).toBeNull();
  });
});

/* ═══════════ 二、筛选入口非语义/ip 守卫（③） ═══════════ */
describe('五百五十四批 B：isContainsCol 守卫（binary/geo_point/nested/object/ip 抑制）', () => {
  const RT_HITS = [
    { _id: 'a', _source: { name: 'x', blob: 'AAAA', host: '10.0.0.1', loc: '1,2', obj: { n: 1 }, nest: [{ k: 1 }] } },
    { _id: 'b', _source: { name: 'y', blob: 'BBBB', host: '10.0.0.2', loc: '3,4', obj: { n: 2 }, nest: [{ k: 2 }] } },
  ] as any;
  const RT_TYPES = { blob: 'binary', host: 'ip', loc: 'geo_point', obj: 'object', nest: 'nested' };

  it('③ RT：显式非语义族与 ip 列弹层无包含行；无类型列照出（552:292 自洽）', async () => {
    await mountTbl(ResultTable, { hits: RT_HITS, total: 2, index: 'w554r3', fieldTypes: RT_TYPES });
    for (const c of ['blob', 'host', 'loc', 'obj', 'nest']) {
      funnelOf('rt', c)!.click();
      await tick(4);
      expect(containsInp(c), `${c} 列（显式类型）不出包含行`).toBeNull();
      (document.querySelector('.cfp-mask') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
      await tick(2);
    }
    funnelOf('rt', 'name')!.click();
    await tick(4);
    expect(containsInp('name'), '无显式类型列不抑制（守卫只压显式标注）').toBeTruthy();
  });

  it('③ QRT：静态 contains 收守卫——非语义族/ip 列无包含行；untyped 列 contains 照常工作', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['name', 'blob', 'host', 'loc'],
      rows: [['x', 'AAAA', '10.0.0.1', '1,2'], ['y', 'BBBB', '10.0.0.2', '3,4']] as any,
      storageKey: 'w554q3', fieldTypes: { blob: 'binary', host: 'ip', loc: 'geo_point' },
    });
    for (const c of ['blob', 'host', 'loc']) {
      funnelOf('qrt', c)!.click();
      await tick(4);
      expect(containsInp(c), `${c} 列（显式类型）不出包含行`).toBeNull();
      (document.querySelector('.cfp-mask') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
      await tick(2);
    }
    funnelOf('qrt', 'name')!.click();
    await tick(4);
    const cinp = containsInp('name');
    expect(cinp, 'untyped 列包含行照出（552:292 ' + "'name'" + ' 口径不回退）').toBeTruthy();
    await typeIn(cinp!, 'y');
    expect(qrtDataRows(), 'QRT contains 管线照常（滤后剩 1 行；qrt-idx=行序号，552:291 同口径）').toEqual(['1']);
  });
});

/* ═══════════ 三、ColDetailModal 非语义类型降级（④） ═══════════ */
describe('五百五十四批 C：ColDetailModal 非语义类型藏高频值段', () => {
  function mkStats(type: string) {
    return reactive({
      col: 'blob', type, distinct: 2, empty: 1, count: 2, numeric: null, median: null,
      emptyRate: 1 / 3, topTotal: 2, top: [{ v: 'AAAA…', n: 2 }, { v: 'BBBB…', n: 1 }],
    });
  }
  async function mountCdm(type: string) {
    const app = createApp({ setup: () => () => h(ColDetailModal as any, { show: true, stats: mkStats(type), labelOf: (v: any) => String(v) }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    await tick(6);
  }

  it('④ binary 类型：无高频值段（base64 串无意义）；空值/空值率行保留；.rt-cd 根类名契约不动', async () => {
    await mountCdm('binary');
    const card = document.body.querySelector('.rt-cd') as HTMLElement | null;
    expect(card, '列详情弹窗打开（.rt-cd 根类名不动）').toBeTruthy();
    expect(card!.querySelector('.rt-cd-top'), '非语义类型不出高频值段').toBeNull();
    expect(card!.textContent, '去重/空值统计行保留').toContain('去重值');
    expect(card!.textContent, '空值率行保留').toContain('空值率');
    expect(card!.textContent, '1/3 空值 → 33%').toContain('33%');
  });

  it('④ geo_point/nested 同抑制；keyword/无类型照出高频值段（回归）', async () => {
    await mountCdm('geo_point');
    expect(document.body.querySelector('.rt-cd .rt-cd-top'), 'geo_point 同抑制').toBeNull();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    host.innerHTML = '';
    document.body.querySelectorAll('.rt-cd').forEach(e => e.remove());
    await mountCdm('keyword');
    expect(document.body.querySelector('.rt-cd .rt-cd-top'), '语义类型照出高频值段').toBeTruthy();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    host.innerHTML = '';
    document.body.querySelectorAll('.rt-cd').forEach(e => e.remove());
    await mountCdm('');
    expect(document.body.querySelector('.rt-cd .rt-cd-top'), '无类型（缺省徽标空）照出高频值段').toBeTruthy();
  });
});

/* ═══════════ 四、tfoot 空值率档（⑤） ═══════════ */
describe('五百五十四批 D：tfoot 空值率 append 档（「· med」后，Σ/avg 前缀不动）', () => {
  it('⑤ QRT：数值列 append「 · 空值率 N%」；非数值列不出；前缀 contains 锁兼容', async () => {
    localStorage.setItem('es_tbl_agg:w554q5', '1');
    await mountTbl(QueryResultTable, { cols: ['name', 'v'], rows: [['a', 50], ['b', null], ['c', 80]] as any, storageKey: 'w554q5' });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row') as HTMLElement;
    expect(tfoot, '聚合行渲染').toBeTruthy();
    expect(tfoot.textContent, '既有 Σ/avg 前缀逐字节不动').toContain('Σ 130 · avg 65.00');
    const empty = tfoot.querySelector('.qrt-agg-empty') as HTMLElement | null;
    expect(empty, 'qrt-agg-empty 档在场').toBeTruthy();
    expect(empty!.textContent, '1/3 空值 → Math.round 33%（emptyRatePct 同源口径）').toBe(' · 空值率 33%');
    const cells = [...tfoot.querySelectorAll('.qrt-agg-cell')] as HTMLElement[];
    expect(cells[0].textContent!.trim(), '非数值 name 列不出空值率').toBe('');
  });

  it('⑤ RT：同构 append（rt-agg-empty）；chk/act 占位保位；零空值列出 0%', async () => {
    localStorage.setItem('es_tbl_agg:w554r5', '1');
    const HITS = [
      { _id: 'a', _source: { name: 'a', v: 50 } },
      { _id: 'b', _source: { name: 'b', v: null } },
      { _id: 'c', _source: { name: 'c', v: 80 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w554r5' });
    const tfoot = host.querySelector('tfoot tr.rt-agg-row') as HTMLElement;
    expect(tfoot, 'RT 聚合行渲染').toBeTruthy();
    expect(tfoot.textContent, '前缀不动').toContain('Σ 130 · avg 65.00');
    const empty = tfoot.querySelector('.rt-agg-empty') as HTMLElement | null;
    expect(empty, 'rt-agg-empty 档在场').toBeTruthy();
    expect(empty!.textContent, '同源口径 33%').toBe(' · 空值率 33%');
    const cells = [...tfoot.querySelectorAll('td')] as HTMLElement[];
    expect(cells[0].className, 'chk 占位保位').toBe('rt-chk');
    expect(cells[cells.length - 1].className, 'act 占位保位').toBe('rt-act');
    lastUnmountCheck();
  });

  async function lastUnmountCheck() {
    /* 零空值列：空值率 0% 常驻（数值列才出=aggFoot 装配守卫口径） */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    localStorage.setItem('es_tbl_agg:w554r5b', '1');
    await mountTbl(ResultTable, { hits: [{ _id: 'a', _source: { v: 1 } }, { _id: 'b', _source: { v: 2 } }] as any, total: 2, index: 'w554r5b' });
    const empty2 = host.querySelector('tfoot tr.rt-agg-row .rt-agg-empty') as HTMLElement | null;
    expect(empty2, '数值列空值率常驻（0% 也出）').toBeTruthy();
    expect(empty2!.textContent).toBe(' · 空值率 0%');
  }
});

/* ═══════════ 五、range 判据合并 typeTiers（⑥） ═══════════ */
describe('五百五十四批 E：range 判据单源合并（行为逐字节等值）', () => {
  it('⑥ typeTiers 单元：RANGE_DATE_RE/isRangeType/rangePlaceholderTxt 单源', () => {
    expect(RANGE_DATE_RE.source, '日期族正则与两表原字面同值').toBe('^(date|date_nanos)$');
    expect(isRangeType('long'), '数值族在档').toBe(true);
    expect(isRangeType('date_nanos'), '日期族在档').toBe(true);
    expect(isRangeType('keyword'), '文本族不在档').toBe(false);
    expect(isRangeType('ip'), 'ip 不在档').toBe(false);
    expect(isRangeType('binary'), '非语义族不在档').toBe(false);
    expect(isRangeType(undefined), '缺类型=false（RT 采样兜底归 RT 本体，QRT 缺类型不出区间）').toBe(false);
    expect(rangePlaceholderTxt('date', 'min'), 'date 列占位带 ISO/epoch 示例（520 原文案逐字）')
      .toBe('最小值（含），如 2024-01-01 或 epoch 毫秒');
    expect(rangePlaceholderTxt('long', 'max')).toBe('最大值（含）');
    expect(rangePlaceholderTxt(undefined, 'min')).toBe('最小值（含）');
  });

  it('⑥ RT：date 列占位/区间判定、keyword 列无区间——合并后回归', async () => {
    await mountTbl(ResultTable, {
      hits: [
        { _id: 'a', _source: { ts: '2024-01-01', n: 1, s: 'x' } },
        { _id: 'b', _source: { ts: '2024-06-15', n: 2, s: 'y' } },
      ] as any,
      total: 2, index: 'w554r6', fieldTypes: { ts: 'date', n: 'long', s: 'keyword' },
    });
    funnelOf('rt', 'ts')!.click();
    await tick(4);
    expect(rangeInp('ts')!.placeholder, 'date 占位含示例（tableRangeAggCopy 同口径）').toContain('2024-01-01 或 epoch 毫秒');
    (document.querySelector('.cfp-mask') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    await tick(2);
    funnelOf('rt', 'n')!.click();
    await tick(4);
    expect(rangeInp('n'), '数值列区间输入在场').toBeTruthy();
    expect(containsInp('n'), '数值列包含行照出（守卫不误伤）').toBeTruthy();
  });

  it('⑥ QRT：rangePlaceholder 委托单源——date 占位/缺省占位等值', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['ts', 'n'], rows: [['2024-01-01', 1], ['2024-06-15', 2]] as any,
      storageKey: 'w554q6', fieldTypes: { ts: 'date', n: 'long' },
    });
    funnelOf('qrt', 'ts')!.click();
    await tick(4);
    expect(rangeInp('ts')!.placeholder).toContain('2024-01-01 或 epoch 毫秒');
    (document.querySelector('.cfp-mask') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    await tick(2);
    funnelOf('qrt', 'n')!.click();
    await tick(4);
    expect(rangeInp('n')!.placeholder, '非 date 列缺省占位逐字').toBe('最小值（含）');
  });
});

/* ═══════════ 六、工具行勾选态单行纪律（⑦ 工蚁1） ═══════════ */
const rtSrc = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrtSrc = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const shellSrc = readFileSync(join(__dirname, '../components/TableShell.vue'), 'utf-8');
/* 五百六十一批同步更新：筛选态提示 span 合并 TableFilteredHint 片段组件（nowrap 纪律字面新家） */
const filteredHintSrc = readFileSync(join(__dirname, '../components/TableFilteredHint.vue'), 'utf-8');

describe('五百五十四批 F：工具行勾选态单行纪律（工蚁1）', () => {
  it('⑦ 源码锁：两内核 bar 显式 nowrap+文本项收缩/防折纪律；旧 .rt-bar-r/.qrt-bar-r 内核死规则已迁出', () => {
    expect(rtSrc, 'RT bar 显式单行纪律').toMatch(/\.rt-bar \{[^}]*flex-wrap: nowrap/);
    expect(qrtSrc, 'QRT bar 显式单行纪律').toMatch(/\.qrt-bar \{[^}]*flex-wrap: nowrap/);
    expect(rtSrc, 'rt-info=ellipsis 吸收收缩（左簇文本不折行不撑高）').toMatch(/\.rt-info \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/);
    expect(qrtSrc, 'qrt-coln 同构 ellipsis 纪律').toMatch(/\.qrt-coln \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/);
    /* 五百六十一批同步更新：filtered 防折行纪律字面新家=TableFilteredHint（两内核字面各自保形） */
    expect(filteredHintSrc, 'rt-filtered 防折行（561 片段组件新家）').toMatch(/\.rt-filtered \{[^}]*white-space: nowrap/);
    expect(filteredHintSrc, 'qrt-filtered 防折行（561 片段组件新家）').toMatch(/\.qrt-filtered \{[^}]*white-space: nowrap/);
    /* 死规则迁出反断言（字面新家=TableShell，538:174 同步更新）——防内核再留一份永不命中的假规则 */
    expect(rtSrc, 'RT 内核不再持有 .rt-bar-r 规则（scopeId 不传播=死规则）').not.toContain('.rt-bar-r { display: flex;');
    expect(qrtSrc, 'QRT 内核同迁出').not.toContain('.qrt-bar-r { display: flex;');
  });

  it('⑦ 源码锁：壳级右簇纪律新家（TableShell 全局 style——flex+nowrap+shrink:0 双内核锚定）', () => {
    expect(shellSrc, '右簇规则单源新家（538:174 同步更新锚同址）')
      .toContain('.rt-bar-r, .qrt-bar-r { display: flex; gap: var(--sp-1); align-items: center; flex-wrap: nowrap; flex-shrink: 0; }');
    expect(shellSrc, '右簇子项零收缩（按钮/分隔条/ColPicker 不被压缩折行）')
      .toContain('.rt-bar-r > *, .qrt-bar-r > * { flex-shrink: 0; }');
    expect(shellSrc, '纪律住非 scoped style（壳模板元素无自身 scopeId，scoped 打不中）').toMatch(/<style>/);
  });

  it('⑦ 行为锁：RT 勾选态新增 DOM 全部收敛在 .rt-bar-r 内（bar 顶层 flex item 数零变=单行结构前提）；反选钮可达且功能不回退', async () => {
    const HITS = [
      { _id: 'a', _source: { n: 1 } },
      { _id: 'b', _source: { n: 2 } },
      { _id: 'c', _source: { n: 3 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w554r7' });
    const bar = () => host.querySelector('.rt-bar') as HTMLElement;
    const barR = () => host.querySelector('.rt-bar-r') as HTMLElement;
    /* 缺省态：无反选钮；bar 顶层 item 基线 */
    expect(barR().querySelector('button[title="反选当前视图行"]'), '缺省态无反选钮（DOM 零增）').toBeNull();
    const topCount = bar().children.length;
    const topClass = [...bar().children].map(c => (c as HTMLElement).className).join('|');
    /* 勾选一行 */
    (host.querySelector('tbody td.rt-chk input') as HTMLInputElement).click();
    await tick(6);
    expect(bar().children.length, '勾选后 bar 顶层 item 数零变（反选+分隔条不进顶层）').toBe(topCount);
    expect([...bar().children].map(c => (c as HTMLElement).className).join('|'), '顶层 item 清单零变（仅右簇内部增员）').toBe(topClass);
    const inv = barR().querySelector('button[title="反选当前视图行"]') as HTMLButtonElement;
    expect(inv, '反选钮在右簇内可达（title 不变）').toBeTruthy();
    expect((inv.closest('.rt-bar-r') as HTMLElement).className, '反选钮宿主=壳级纪律容器 .rt-bar-r').toContain('rt-bar-r');
    /* 反选功能不回退：勾 1 行 → 反选 → 1 行取消、另 2 行选中 */
    inv.click();
    await tick(6);
    const checked = [...host.querySelectorAll('tbody td.rt-chk input')].map(i => (i as HTMLInputElement).checked);
    expect(checked, '反选翻转（T/T/F → F/T/T）').toEqual([false, true, true]);
  });

  it('⑦ 诊断锁：.rt-bar 带内核 scopeId（内核规则命中根）；.rt-bar-r 无 scopeId（右簇纪律必须住壳——防搬回内核变死规则）', async () => {
    await mountTbl(ResultTable, { hits: [{ _id: 'a', _source: { n: 1 } }], total: 1, index: 'w554r8' });
    const scopeAttrs = (el: Element) => el.getAttributeNames().filter(a => a.startsWith('data-v'));
    expect(scopeAttrs(host.querySelector('.rt-bar')!).length, 'bar 根继承内核 scopeId（.rt-bar 内核规则生效面）').toBeGreaterThan(0);
    expect(scopeAttrs(host.querySelector('.rt-bar-r')!).length, '右簇容器无 scopeId（内核 scoped 永不命中，纪律必须住 TableShell）').toBe(0);
  });

  it('⑦ 行为锁：QRT selectable 勾选态工具行 DOM 逐字节零变化（同病检查结论——QRT 无勾选态加钮通道，回归防线）', async () => {
    await mountTbl(QueryResultTable, { cols: ['n'], rows: [[1], [2], [3]] as any, storageKey: 'w554q7', selectable: true });
    const bar = host.querySelector('.qrt-bar') as HTMLElement;
    expect(bar, 'QRT 工具行在场（storageKey=prefsOn 门控）').toBeTruthy();
    expect(bar.querySelector('.qrt-bar-r button[title="反选当前视图行"]'), 'QRT 无反选钮（勾选动作通道不存在）').toBeNull();
    const before = bar.outerHTML;
    (host.querySelector('tbody td.qrt-sel-col input') as HTMLInputElement).click();
    await tick(6);
    expect((host.querySelector('.qrt-bar') as HTMLElement).outerHTML, '勾选后 qrt-bar outerHTML 逐字节相等').toBe(before);
  });
});
