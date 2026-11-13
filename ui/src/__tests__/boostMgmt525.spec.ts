/**
 * 五百二十五批：BoostTunerView 权重行管理 + 排名表排序 + 表格化修边。
 * 锁定：
 * 1) 卡头计数徽标（bt-cnt，N>10 转 hot 语义）+ 字段名过滤（computed 真过滤行集）；
 * 2) 行级停用 checkbox + 「启停全部」；builtQuery 同步滤除停用行（DSL fields=[]）；
 * 3) 531 批同步更新：裸 .bt-tbl 换 QRT rows 型（排序/右键/导出归内核，升序起步）——
 *    排名语义锚同步更新（新排名列仍按真实排名，rankOf 回原始索引）；
 * 4) 行色档走 rowClass 契约（527 W-D），useTableSort 宿主胶水退役。
 * 设施照抄 boostFieldPrioW3b（vue-router 轻 mock + api mock）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/boost-tuner', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchRaw: (...a: any[]) => searchRawFn(...a),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ raw: { properties: { a_kw: { type: 'keyword' }, z_text: { type: 'text' } } } }),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import BoostTunerView from '../views/BoostTunerView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  const app = createApp({ render: () => h(BoostTunerView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

/** 加 n 行字段并把第 i 行填名 name_i */
async function seedFields(host: HTMLElement, names: string[]) {
  for (let i = 0; i < names.length; i++) {
    (host.querySelector('.bt-add') as HTMLElement).click();
    await settle();
    const inps = [...host.querySelectorAll('.bt-fname .fxp-inp')] as HTMLInputElement[];
    inps[inps.length - 1].value = names[i];
    inps[inps.length - 1].dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  searchRawFn.mockReset();
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
  history.replaceState(null, '', '#/');
});

describe('BoostTuner 权重行管理（五百二十五批）', () => {
  it('计数徽标 + 名字过滤真过滤行集 + 空匹配提示', async () => {
    const host = await mountView();
    await seedFields(host, ['alpha', 'beta', 'gamma']);
    const cnt = host.querySelector('.bt-cnt') as HTMLElement;
    expect(cnt.textContent).toContain('共 3 字段');
    const fkw = host.querySelector('.bt-fkw') as HTMLInputElement;
    expect(fkw, '有字段时应出过滤输入').toBeTruthy();
    fkw.value = 'be';
    fkw.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(host.querySelectorAll('.bt-field').length).toBe(1);
    expect(cnt.textContent).toContain('共 3 字段'); // 徽标恒全量口径
    fkw.value = 'zzz';
    fkw.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(host.querySelectorAll('.bt-field').length).toBe(0);
    expect(host.textContent).toContain('无匹配字段');
  }, 40000);

  it('行级停用：checkbox 勾停 → builtQuery fields 滤除；启停全部两态', async () => {
    const host = await mountView();
    /* 搜索词（canRun 需要） */
    const kw = host.querySelector('.bt-kw') as HTMLInputElement;
    kw.value = 'shoes';
    kw.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await seedFields(host, ['f1', 'f2']);
    const dslTxt = () => (host.querySelector('.bt-dsl') as HTMLElement).textContent || '';
    expect(dslTxt()).toContain('f1');
    /* 停用 f1（第一行 checkbox 点掉） */
    const chk = host.querySelector('.bt-field .bt-fen') as HTMLInputElement;
    expect(chk.checked).toBe(true);
    chk.click();
    await settle();
    expect(dslTxt()).not.toContain('f1');
    expect(dslTxt()).toContain('f2');
    expect((host.querySelector('.bt-cnt') as HTMLElement).textContent).toContain('停用 1');
    /* 启停全部：当前有停用 → 「全部启用」一键恢复 */
    const toggleAll = [...host.querySelectorAll('.bt-card-hd button')].find(b => b.textContent?.includes('全部启用')) as HTMLElement;
    expect(toggleAll).toBeTruthy();
    toggleAll.click();
    await settle();
    expect(dslTxt()).toContain('f1');
    expect(dslTxt()).toContain('f2');
    /* 全启用态再点 → 全部停用 → fields 空 */
    const toggleOff = [...host.querySelectorAll('.bt-card-hd button')].find(b => b.textContent?.includes('全部停用')) as HTMLElement;
    toggleOff.click();
    await settle();
    expect(dslTxt()).toContain('"fields": []');
  }, 40000);
});

/* 531 批同步更新：行/列锚换 QRT 壳（过滤 nomatch/截断行；_id 格=第 3 数据格） */
const rankRowsEl = (host: HTMLElement) =>
  [...host.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
const ids = (host: HTMLElement) => rankRowsEl(host).map(tr => (tr.querySelectorAll('td.qrt-cell')[2] as HTMLElement).textContent?.trim());

describe('BoostTuner 排名表排序（五百二十五批；531 同步更新 QRT 内核三态，升序起步）', () => {
  it('_id 表头点击排序翻转行序；新排名列保持真实排名语义', async () => {
    const host = await mountView();
    const kw = host.querySelector('.bt-kw') as HTMLInputElement;
    kw.value = 'shoes';
    kw.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await seedFields(host, ['f1']);
    searchRawFn.mockResolvedValue({ hits: { hits: [
      { _id: 'aaa', _score: 2.5 },
      { _id: 'bbb', _score: 1.5 },
    ] } });
    const runBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('跑基准')) as HTMLElement;
    runBtn.click();
    await settle(16);
    expect(ids(host)).toEqual(['aaa', 'bbb']);
    expect(host.textContent).toContain('#1');
    const thId = () => [...host.querySelectorAll<HTMLTableCellElement>('table.qrt-tbl thead th')].find(th => th.dataset.col === '_id') as HTMLElement;
    /* 点 _id 表头 → 首击升序（QRT 内核 227 批口径：升序起步，行序不变挂 aria-sort） */
    thId().click();
    await settle();
    expect(ids(host)).toEqual(['aaa', 'bbb']);
    expect(thId().getAttribute('aria-sort')).toBe('ascending');
    /* 再点翻转降序；真实排名语义：bbb 的「新排名」格仍显示 #2（行序变了但排名不漂） */
    thId().click();
    await settle();
    expect(ids(host)).toEqual(['bbb', 'aaa']);
    const firstRowCells = rankRowsEl(host)[0].querySelectorAll('td.qrt-cell');
    expect(firstRowCells[0].textContent).toContain('#2'); // bbb 原排名 2
    /* 三击取消回原始序 */
    thId().click();
    await settle();
    expect(ids(host)).toEqual(['aaa', 'bbb']);
  }, 40000);
});

describe('BoostTuner 表格化修边（五百二十五批源码锁；531 批同步更新 QRT 壳）', () => {
  it('QRT rows 接线 + 真实排名语义 + 行色档 rowClass + 管理件在位', () => {
    const v = readFileSync(join(__dirname, '../views/BoostTunerView.vue'), 'utf-8');
    /* 531 批同步更新：裸 .bt-tbl 退役换 QRT rows 型（useTableSort 宿主胶水随之退役） */
    expect(v).not.toContain('.bt-tbl');
    expect(v).not.toContain("from '../composables/tableSort'");
    expect(v).toMatch(/:cols="RANK_COLS" :rows="rankRows" sortable/);
    expect(v).toContain('storage-key="boost:rank"');
    expect(v).toContain(":field-types=\"{ 得分: 'double' }\"");
    /* 真实排名语义：rankRows 由 rankOf 回原始索引派生 */
    expect(v).toMatch(/const i = rankOf\(h\._id\);/);
    expect(v).toMatch(/return \[i \+ 1, delta\(h\._id, i\), h\._id, Number\(h\._score\) \|\| 0, b === null \? null : b \+ 1\];/);
    /* 行色档走 rowClass 契约（527 W-D） */
    expect(v).toContain(':row-class="btRowClass"');
    expect(v).toMatch(/function btRowClass\(row: any\[\]\): string \| undefined \{\s*return deltaClass\(row\[2\], row\[0\] - 1\) \|\| undefined;/);
    expect(v).toMatch(/\.bt-right :deep\(tr\.row-up td\)/);
    /* 531 批：裸 sessionStorage 接收换 useLinkCarry（键与 payload 逐字保持） */
    expect(v).toContain("useLinkCarry<{ index?: string; keyword?: string }>('boost')");
    expect(v).not.toContain("sessionStorage.getItem('esquerystudio.link.boost')");
    expect(v).toMatch(/@media \(max-width: 900px\)/);
    expect(v, '全文禁 min-width:901px 倒挂档').not.toMatch(/min-width:\s*901px/);
    /* 管理件在位（525 批契约不变；554 批同步更新：计数徽标改用 StatusPill 统一件，
       默认中性 n/N>10 热 y，bt-cnt 锚类保留——上方 .bt-cnt DOM 断言不受影响） */
    expect(v).toMatch(/<StatusPill class="bt-cnt xs" :tone="fields\.length > 10 \? 'y' : 'n'"/);
    expect(v).toContain('input-class="bt-fkw"'); /* 六百五十批同步更新：改用 SFB 后 bt-fkw 转运行时锚（sfbUnify650 锁） */
    expect(v).toContain('class="bt-fen"');
    /* builtQuery 滤除停用行 */
    expect(v).toContain('f.disabled !== true && f.name.trim()');
  });
});
