/**
 * 七百三十三批：AnalyzerLab 首刀五小刀（R114；R113 裁决表 G109+G110+G111+G112+G113）。
 *
 * ① G109（P3 死代码·头号）PageHeader 合并后页头左组/图标/标题/副题/右组五条死规则删
 *    （styleSheets 各 1 命中+DOM 0 引用双实锚；713 G53/715 G56/717 G61/721 G72/
 *    727 G86/729 G94 同族）——页头行活规则保留（模板 :3 唯一消费）。
 * ② G110（P3 铁律 D 在途可感知）全部试跑钮 Play/加载 text 字段钮 FolderSearch/
 *    lane 试跑钮 Play 三钮补 spinning+文案切换（729 G95/731 G104 同款；lane 级
 *    busy 行在场而触发钮半缺=730 G104 同形态）。
 * ③ G111（P3 加载态三段式）字段清单在途窗显示「暂无字段清单」误导 → busy 行
 *    「加载字段中…」在场+空态移除（加载/错误/空/有值四态互斥）。
 * ④ G112（P3 铁律 F）lane MetaStrip tokens 段补中文 tip「分词结果条数」
 *    （G55/G60/G74/G79/G87/G101 同族；tip 走 MetaStrip :title 悬停通道+help 档）。
 * ⑤ G113（P3 铁律 B 高频两跳）analyzer 输入 Enter 直达该列试跑
 *    （R113 三跑实锚 Enter 后请求 0 次=值已生效但不跑）。
 *
 * 驱动方式照 analyzerLabAssist547（vue-router 轻 mock + 只 mock ../api）+
 * diffEditorFirstCut731 的在途窗双读（deferred 分桶 release）与源码锁范式。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const routeMock = { path: '/analyzer-lab', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

const analyzeTextFn = vi.fn();
const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analyzeText: (...a: any[]) => analyzeTextFn(...a),
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      clusterQuery: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import AnalyzerLabView from '../views/AnalyzerLabView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const app = createApp({ render: () => h(AnalyzerLabView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: HTMLElement, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

function collapse(s: string | null): string { return (s || '').replace(/\s+/g, ''); }

/* 在途窗分桶 deferred（731 G104b 课：单 release 变量会被多 Promise 覆盖，按桶收集） */
const TOKENS_OK = { tokens: [
  { token: 'elas', position: 0, start_offset: 0, end_offset: 4, type: 'ENGLISH' },
  { token: '是', position: 1, start_offset: 5, end_offset: 6, type: 'IDEOGRAPHIC' },
] };
const FIELDS_OK = { raw: { properties: {
  title: { type: 'text', analyzer: 'ik_max_word', search_analyzer: 'ik_smart' },
  bondName: { type: 'text' },
} } };
let anRes: Array<(v: any) => void> = [];
let fldRes: Array<(v: any) => void> = [];
const relAll = (bag: Array<(v: any) => void>, v: any) => { bag.splice(0).forEach(r => r(v)); };

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
  anRes = []; fldRes = [];
  analyzeTextFn.mockReset().mockImplementation(() => new Promise<any>(res => { anRes.push(res); }));
  mappingDetailFn.mockReset().mockImplementation(() => new Promise<any>(res => { fldRes.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('733 A0 挂载不变量负锚（现状即守卫）', () => {
  it('title+3 lane 默认+空态文案+零自动请求', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('分词实验室');
    expect(host.querySelectorAll('.al-lane').length, '默认 3 lane').toBe(3);
    expect(host.textContent).toContain('尚未运行');
    expect(host.textContent).toContain('暂无字段清单');
    expect(analyzeTextFn, '挂载零自动试跑').not.toHaveBeenCalled();
    expect(mappingDetailFn, '挂载零自动拉字段').not.toHaveBeenCalled();
  });
});

describe('733 G109 页头五条死规则退役（源码锁；729 G94 同族）', () => {
  it('五死族零残留+页头行活锚保留（CSS 规则+模板消费）', () => {
    const v = read('../views/AnalyzerLabView.vue');
    /* 死族字面量须连注释一并零残留（705-C1：史志注释不得引用待清符号字面量自伤清零锁） */
    for (const dead of ['.al-hd-l', '.al-hd-ic', '.al-hd-tt', '.al-hd-sub', '.al-hd-r']) {
      expect(v.includes(dead), `死规则残留：${dead}`).toBe(false);
    }
    /* 单参形态（TS2554 两参在部分字面量上报错，724/726/731 课同款） */
    expect((v.match(/\.al-hd \{/g) || []).length).toBe(2); // 活锚页头行规则（基础档+900 断点 flex-wrap 两处）
    expect(v).toMatch(/<div class="al-hd">/); // 模板页头容器消费在场
  });
});

describe('733 G110 三钮在途可感知（铁律 D；729 G95/731 G104 同款）', () => {
  it('全部试跑：在途窗 spinning+「试跑中…」；完成复常+3 lane 出 token 区', async () => {
    const host = await mountView();
    const btn = findBtn(host, /全部试跑/);
    expect(btn.disabled, '默认文本在场起手可点').toBe(false);
    btn.click();
    await settle(4);
    expect(analyzeTextFn, '3 lane 并发').toHaveBeenCalledTimes(3);
    expect(btn.disabled, 'busy 守卫既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G110 病灶：在途窗 Play 零 spinning').toBeTruthy();
    expect(collapse(btn.textContent), 'G110 病灶：在途窗文案不变').toBe('试跑中…');
    relAll(anRes, TOKENS_OK);
    await settle();
    expect(btn.disabled, '完成复常可点').toBe(false);
    expect(btn.querySelector('.spinning')).toBeNull();
    expect(collapse(btn.textContent)).toBe('全部试跑');
    expect(host.querySelectorAll('.al-toks').length, '3 lane 全出 token 区').toBe(3);
  });

  it('加载 text 字段：在途窗 spinning+「加载中…」；完成复常+字段清单 2 行', async () => {
    localStorage.setItem('es_picked', 'probe-a');
    const host = await mountView();
    const btn = findBtn(host, /加载text字段/);
    expect(btn.disabled, '索引在场起手可点').toBe(false);
    btn.click();
    await settle(4);
    expect(mappingDetailFn).toHaveBeenCalledTimes(1);
    expect(btn.disabled, 'fieldsBusy 守卫既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G110 病灶：在途窗 FolderSearch 零 spinning').toBeTruthy();
    expect(collapse(btn.textContent), 'G110 病灶：在途窗文案不变').toBe('加载中…');
    relAll(fldRes, FIELDS_OK);
    await settle();
    expect(btn.disabled, '完成复常可点').toBe(false);
    expect(btn.querySelector('.spinning')).toBeNull();
    expect(collapse(btn.textContent)).toBe('加载text字段');
    expect(host.querySelectorAll('.al-field').length, '字段清单 2 行').toBe(2);
  });

  it('lane 试跑：在途窗 spinning+「分析中…」；完成复常+该 lane 出 token 区', async () => {
    const host = await mountView();
    /* lane 级钮（3 枚取第一枚；精确文本匹配与页头「全部试跑」区分） */
    const laneBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => collapse(b.textContent) === '试跑')!;
    expect(laneBtn, 'lane 试跑钮在场').toBeTruthy();
    expect(laneBtn.disabled).toBe(false);
    laneBtn.click();
    await settle(4);
    expect(analyzeTextFn).toHaveBeenCalledTimes(1);
    expect(laneBtn.disabled, 'l.busy 守卫既有').toBe(true);
    expect(laneBtn.querySelector('.spinning'), 'G110 病灶：lane 钮在途窗零 spinning').toBeTruthy();
    expect(collapse(laneBtn.textContent), 'G110 病灶：lane 钮在途窗文案不变').toBe('分析中…');
    relAll(anRes, TOKENS_OK);
    await settle();
    expect(laneBtn.disabled).toBe(false);
    expect(laneBtn.querySelector('.spinning')).toBeNull();
    expect(collapse(laneBtn.textContent)).toBe('试跑');
    expect(host.querySelectorAll('.al-toks').length, '仅该 lane 出 token 区').toBe(1);
  });
});

describe('733 G111 字段清单加载态三段式（在途「加载字段中…」不再误显空态）', () => {
  it('在途窗 busy 行在场+「暂无字段清单」移除；完成后字段卡上位', async () => {
    localStorage.setItem('es_picked', 'probe-a');
    const host = await mountView();
    expect(host.textContent).toContain('暂无字段清单'); // 起手（未加载）空态在场
    findBtn(host, /加载text字段/).click();
    await settle(4);
    expect(host.textContent, 'G111 病灶：在途窗仍显空态误导').not.toContain('暂无字段清单');
    expect(host.textContent, 'G111 病灶：在途窗无加载反馈').toContain('加载字段中…');
    relAll(fldRes, FIELDS_OK);
    await settle();
    expect(host.textContent).not.toContain('加载字段中…');
    expect(host.querySelectorAll('.al-field').length).toBe(2);
  });
});

describe('733 G112 lane MetaStrip tokens 段中文 tip（铁律 F；G101 同族）', () => {
  it('title=分词结果条数+help 档+tip 不进可见文本', async () => {
    const host = await mountView();
    findBtn(host, /全部试跑/).click();
    await settle(4);
    relAll(anRes, TOKENS_OK);
    await settle();
    const ms = host.querySelector('.al-lane-meta .ms-i');
    expect(ms, 'lane meta 段在场').toBeTruthy();
    expect(ms!.getAttribute('title'), 'G112 病灶：tokens 段无 tip').toBe('分词结果条数');
    expect(ms!.classList.contains('help'), 'tip 悬停通道 help 档').toBe(true);
    expect(ms!.textContent, 'tip 只走 title 悬停通道，不进可见文本').not.toContain('分词结果条数');
  });
});

describe('733 G113 analyzer 输入 Enter 直达（铁律 B 高频两跳）', () => {
  it('改 analyzer 值+Enter → 该列试跑触发（修前 Enter 零请求）', async () => {
    const host = await mountView();
    const inp = host.querySelector<HTMLInputElement>('input[list="al-analyzer-opts"]');
    expect(inp, 'analyzer 输入在场').toBeTruthy();
    inp!.value = 'ik_smart';
    inp!.dispatchEvent(new Event('input', { bubbles: true }));
    inp!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await settle(4);
    expect(analyzeTextFn, 'G113 病灶：Enter 不触发试跑（R113 实锚 0 次）').toHaveBeenCalledTimes(1);
    const body = JSON.parse(analyzeTextFn.mock.calls[0][1]);
    expect(body.analyzer, 'v-model 值随 Enter 生效').toBe('ik_smart');
    relAll(anRes, TOKENS_OK);
    await settle();
    expect(host.querySelectorAll('.al-toks').length).toBe(1);
  });
});

describe('733 源码锁（五刀字面锚）', () => {
  it('spinning 三钮+Enter+tip+加载行字面在场', () => {
    const v = read('../views/AnalyzerLabView.vue');
    expect(v).toContain('FolderSearch :size="12" :class="{ spinning: fieldsBusy }"'); // G110 加载字段钮
    expect(v).toContain('Play :size="12" :class="{ spinning: busy }"'); // G110 全部试跑钮
    expect(v).toContain('Play :size="10" :class="{ spinning: l.busy }"'); // G110 lane 试跑钮
    expect(v).toContain("@keyup.enter=\"doRun(i)\""); // G113 Enter 直达
    expect(v).toContain("tip: '分词结果条数'"); // G112 tip
    expect(v).toContain('加载字段中…'); // G111 在途行
    expect(v).toContain("fieldsBusy ? '加载中…'"); // G110 文案切换
  });
});
