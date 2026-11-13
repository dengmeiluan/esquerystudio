/**
 * 六百一十二批（轨3 表格内核消费面）：RT searchable 首消费面接线——IndexHubView docsTbl。
 * 背景：searchable=quickFilter 的 UI 面（546 批 QRT 约定自带 SystemView 示范接线；
 * 547 批平移 RT 后 RT 侧全站零消费面=571-C1 孤立 API 债六批）。IndexHub 文档 tab 是
 * 全站最高频文档浏览面，「可检索」（宪法 B 七能力）在此落地。接线同时让 606 口径
 * （全选/反选=sortedHits 当前视图）在 quickFilter 通道首次产品可达：输词过滤→全选只勾
 * 可见行→清词勾选保留（状态不重置）。⚠已核 Esc 零串扰：IH 抽屉/放大两级 capture
 * handler 均有 INPUT/TEXTAREA 守卫（onDrawerKeydown/onFsKeydown），TableQSearch
 * esc.prevent 清词后冒泡被两级守卫让路，抽屉不误关。
 *
 * 锁定：
 * 1) 接线源码锁（RED→接线后绿）：docsTbl rtTag 含 :searchable="true"（rtTag 提取法=
 *    ihUnify554 同款；qryTbl 不设负锚——下批接线不反锁）；
 * 2) 行为网（先行绿——RT 内核 searchable→quickFilterEff→quickHits→sortedHits→
 *    allChecked 全链 546/547/606 已实现，做组合防回归网）：输入框渲染+喂词过滤+
 *    全选口径+Esc 清词+清词勾选保留+过滤态反选同口径。
 *
 * 挂载样板照抄 aggSelectScope606（裸 createApp + pinia + api mock；点击/输入一律原生
 * 事件；叠挂勿先 unmount（T39））。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

/* rtTag 提取法（ihUnify554 同款）：从 <ResultTable ref="docsTbl" 切到 </ResultTable> */
function rtTag(src: string, ref: string): string {
  const start = src.indexOf('<ResultTable ref="' + ref + '"');
  expect(start, 'RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('</ResultTable>', start));
}

/* 3 行样例：喂 '行一' 恰滤剩 1 行（newsId/sentimentTitle 两列，词命中 title） */
const K612_HITS = [
  { _id: 'id-0', _index: 'idx-a', _source: { newsId: 'n-0', isShowSentiment: 1, sentimentTitle: '行零标题' } },
  { _id: 'id-1', _index: 'idx-a', _source: { newsId: 'n-1', isShowSentiment: 0, sentimentTitle: '行一标题' } },
  { _id: 'id-2', _index: 'idx-a', _source: { newsId: 'n-2', isShowSentiment: 1, sentimentTitle: '行二标题' } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(propsFactory: () => Record<string, unknown>) {
  const app = createApp({ setup: () => () => h(ResultTable as any, { ...propsFactory() }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const dataRows = () => host.querySelectorAll('.rt-wrap tbody tr:not(.rt-agg-row)');
const qInp = () => host.querySelector('.rt-qsearch-inp') as HTMLInputElement | null;
const chkBoxes = () => [...host.querySelectorAll('.rt-chk input[type="checkbox"]')] as HTMLInputElement[];
const aggRow = () => host.querySelector('tfoot tr.rt-agg-row') as HTMLElement | null;
/* 原生 setter 喂词+input 事件（561-C2 手法——TableQSearch @input 契约） */
async function feedKw(v: string) {
  const inp = qInp()!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(inp, v);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}
const aggOnProps = () => ({ hits: K612_HITS, total: 3, storageKey: 'k612x', fieldTypes: { newsId: 'keyword', isShowSentiment: 'integer', sentimentTitle: 'text' }, selectable: true, searchable: true });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* ═══════════ 一、接线源码锁（TDD RED——接线一行落地后转绿） ═══════════ */
describe('六百一十二批一：接线源码锁', () => {
  it('docsTbl 接线 :searchable="true"（571-C1 首消费面；qryTbl 不设负锚）', () => {
    expect(rtTag(ih, 'docsTbl'), 'IndexHub 文档表接内建搜索框').toContain(':searchable="true"');
  });
});

/* ═══════════ 二、行为网（先行绿——内核已实现，组合防回归） ═══════════ */
describe('六百一十二批二：searchable 通道 606 口径组合行为网', () => {
  it('输入框渲染+喂词过滤+全选只勾可见行+Esc 清词+清词勾选保留（状态不重置）', async () => {
    localStorage.setItem('es_tbl_agg:k612x', '1');
    await mountTbl(aggOnProps);
    expect(qInp(), 'searchable=true 输入框在场（TableQSearch 单源）').toBeTruthy();
    expect(dataRows().length, '喂词前 3 行').toBe(3);

    await feedKw('行一');
    expect(dataRows().length, '喂词后恰滤剩 1 行').toBe(1);

    /* 全选口径（606 红利×searchable 通道）：只勾可见 1 行+徽标「选中 1 行」 */
    chkBoxes()[0].click();
    await tick();
    const boxes = chkBoxes().slice(1);
    expect(boxes.filter(b => b.checked).length, '只勾可见 1 行（旧口径勾 3 行=判别点）').toBe(1);
    expect(aggRow()?.querySelector('.rt-agg-sel')?.textContent, '徽标=可见交集口径').toContain('选中 1 行');

    /* Esc 清词：行回 3+勾选保留（状态不重置） */
    qInp()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(qInp()!.value, 'Esc 清词').toBe('');
    expect(dataRows().length, '清词后行回 3').toBe(3);
    expect(chkBoxes().slice(1).filter(b => b.checked).length, '清词勾选保留=此前可见 1 行').toBe(1);
    expect(aggRow()?.querySelector('.rt-agg-sel')?.textContent, '徽标维持').toContain('选中 1 行');
  });
  it('过滤态反选=只翻可见行（606 同口径）', async () => {
    localStorage.setItem('es_tbl_agg:k612y', '1');
    await mountTbl(() => ({ ...aggOnProps(), storageKey: 'k612y' }));
    await feedKw('行一');
    /* 反选钮 v-if=selected.size——先勾可见行使钮渲染（606 it3 同款） */
    chkBoxes().slice(1)[0].click();
    await tick();
    const invBtn = [...host.querySelectorAll('button')]
      .find(b => b.textContent?.trim() === '反选') as HTMLButtonElement;
    expect(invBtn, '反选钮在场').toBeTruthy();
    invBtn.click();
    await tick();
    /* 只翻可见：可见 1 行已勾→翻成未勾；不可见 2 行未勾不动=全不勾（旧口径遍历全量
       亦得全不勾，但路径不同——此处锚定的是 606 sortedHits 口径通道在全站唯一 searchable
       接线下的行为一致性） */
    expect(chkBoxes().slice(1).filter(b => b.checked).length, '反选后全不勾').toBe(0);
    expect(aggRow()?.querySelector('.rt-agg-sel')?.textContent ?? '', '徽标移除（0 行）').not.toContain('选中');
  });
});
