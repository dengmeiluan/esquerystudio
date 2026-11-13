/**
 * 七百一十七批：MappingDesigner 首刀=G60+G61+G62「详情中文备注+死样式清+spinner 语义」
 * （R97 裁决表头号；铁律 F「任何英文参数必须有中文备注」）。
 * - G60（P3 铁律 F）：字段详情 pickedMeta 的 analyzer/search_analyzer/format 三段
 *   裸英文 label 悬停零备注（715 G55 同族）→ 三段 MetaStripItem tip 补齐
 *   （analyzer=写入分词器/search_analyzer=搜索分词器/format=字段存储格式）。
 * - G61（P3 死代码）：页头右组 flex 修饰规则与输入框 sm 后缀窄档两条死规则
 *   （R97 通杀扫描定案；前者注释宣称「保留」但模板 0 元素）→ 删+史志注释退役
 *   （713 G53/715 G56 同族）。
 * - G62（P3）：加载钮 busy 无 spinner 语义（713 G51 同族）→ 图标 spinning 绑 busy
 *   （在途可感知；同钮 :disabled 双语义归一）。
 *
 * 设施：flattenWave551 范式（api 出口可变 mock+settle 链+store.pick 索引链）；
 * 种子=title〔text+analyzer+search_analyzer〕/created_at〔date+format〕双顶层。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mappingDetailFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...args: any[]) => mappingDetailFn(...args),
    },
  };
});

import MappingDesignerView from '../views/MappingDesignerView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(MappingDesignerView) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* 种子双顶层：title 双分词段（analyzer+search_analyzer）/created_at 格式段——G60 三段全覆盖 */
function seedTree() {
  mappingDetailFn.mockResolvedValue({
    tree: [
      { name: 'title', type: 'text', analyzer: 'ik_max_word', searchAnalyzer: 'ik_smart' },
      { name: 'created_at', type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    ],
    stats: { total: 2, text: 1 },
  });
}

/* 点选字段树顶层节点（按 .md-nm 文本定位，flattenWave551 同款动线） */
async function pickField(host: HTMLElement, name: string) {
  const node = Array.from(host.querySelectorAll('.md-node')).find(n =>
    (n.querySelector('.md-nm')?.textContent || '') === name);
  (node as HTMLElement | undefined)?.click();
  await settle();
}

/* 详情区按 label 定位 MetaStrip 段（<span class="ms-i help" title=".."><b>值</b> <i>label</i></span>） */
function detailSeg(host: HTMLElement, label: string): HTMLElement | undefined {
  return Array.from(host.querySelectorAll<HTMLElement>('.md-detail .ms-i')).find(el => {
    const i = el.querySelector('i');
    return !!i && i.textContent?.trim() === label;
  });
}

function loadBtn(host: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(b =>
    (b.textContent || '').includes('加载') && !(b.textContent || '').includes('重新') && !(b.textContent || '').includes('立即')) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  mappingDetailFn.mockReset();
});

describe('G60：pickedMeta 三段英文 label 中文备注补齐（铁律 F）', () => {
  it('① title 双分词段：analyzer title=写入分词器；search_analyzer title=搜索分词器（help 悬停语义）', async () => {
    seedTree();
    const { host } = await mountView();
    const { useAppStore } = await import('../stores/app');
    useAppStore().pick('md_idx');
    await settle();
    await pickField(host, 'title');
    const segAn = detailSeg(host, 'analyzer');
    expect(segAn, 'analyzer 段必须在场（text 字段）').toBeTruthy();
    expect(segAn!.getAttribute('title'), 'analyzer 段中文备注').toBe('写入分词器');
    expect(segAn!.className, '有 tip 无 to 段挂 help（cursor:help）').toContain('help');
    const segSa = detailSeg(host, 'search_analyzer');
    expect(segSa, 'search_analyzer 段必须在场（种子含 searchAnalyzer）').toBeTruthy();
    expect(segSa!.getAttribute('title'), 'search_analyzer 段中文备注').toBe('搜索分词器');
    expect(segSa!.className).toContain('help');
  });

  it('② created_at 格式段：format title=字段存储格式', async () => {
    seedTree();
    const { host } = await mountView();
    const { useAppStore } = await import('../stores/app');
    useAppStore().pick('md_idx');
    await settle();
    await pickField(host, 'created_at');
    const segFmt = detailSeg(host, 'format');
    expect(segFmt, 'format 段必须在场（date 字段）').toBeTruthy();
    expect(segFmt!.getAttribute('title'), 'format 段中文备注').toBe('字段存储格式');
  });

  it('③ 负锚：备注只走悬浮 title，不进详情串可见文本（信息串保持紧凑）', async () => {
    seedTree();
    const { host } = await mountView();
    const { useAppStore } = await import('../stores/app');
    useAppStore().pick('md_idx');
    await settle();
    await pickField(host, 'title');
    const detail = host.querySelector('.md-detail');
    expect(detail!.textContent).not.toContain('写入分词器');
    expect(detail!.textContent).not.toContain('搜索分词器');
  });
});

describe('G60 源码锁：三段 tip 字面落 pickedMeta', () => {
  it('④ 三段 tip 字面在源码 pickedMeta 派生', () => {
    const v = readFileSync(join(__dirname, '../views/MappingDesignerView.vue'), 'utf-8');
    expect(v).toMatch(/label:\s*'analyzer',\s*tip:\s*'写入分词器'/);
    expect(v).toMatch(/label:\s*'search_analyzer',\s*tip:\s*'搜索分词器'/);
    expect(v).toMatch(/label:\s*'format',\s*tip:\s*'字段存储格式'/);
  });
});

describe('G61：两条死规则退役（PageHeader 合并后遗留，模板 0 元素）', () => {
  it('⑤ 源码锁：页头右组修饰与 sm 后缀窄档零残留；活规则 .md-ii 保留+「保留」史志注释退役', () => {
    const v = readFileSync(join(__dirname, '../views/MappingDesignerView.vue'), 'utf-8');
    expect(v, '页头右组 flex 修饰死规则必须退役（713 G53/715 G56 同族）')
      .not.toMatch(/\.md-hd-r\b/);
    expect(v, '输入框 sm 后缀窄档死规则必须退役')
      .not.toMatch(/\.md-ii\.sm\b/);
    expect(v, '活规则 .md-ii（加字段弹窗输入/选择器）保留').toMatch(/\.md-ii\s*\{/);
    expect(v, '「右组修饰…保留」失实史志注释必须随行为退役（R97 时点宣称保留但模板 0 元素）')
      .not.toContain('右组修饰，保留');
  });
});

describe('G62：加载钮 spinner 语义（busy 在途可感知，713 G51 同族）', () => {
  it('⑥ 行为：加载在途窗图标 spinning+钮 disabled；复常后移除+enabled', async () => {
    let resolveDetail: (v: any) => void = () => {};
    mappingDetailFn.mockImplementation(() => new Promise<any>(res => { resolveDetail = res; }));
    const { host } = await mountView();
    const { useAppStore } = await import('../stores/app');
    useAppStore().pick('md_idx');
    await settle();
    const btn = loadBtn(host);
    expect(btn, '加载钮必须在场').toBeTruthy();
    const inFlight = { disabled: btn!.disabled, spin: btn!.querySelector('svg')?.classList.contains('spinning') };
    resolveDetail({ tree: [{ name: 'title', type: 'text' }], stats: { total: 1 } });
    await settle();
    const done = { disabled: btn!.disabled, spin: btn!.querySelector('svg')?.classList.contains('spinning') };
    expect(inFlight.disabled, '在途窗 disabled（busy 守卫防连点）').toBe(true);
    expect(inFlight.spin, '在途窗图标 spinning（G62 病灶=R97 时点零旋转）').toBe(true);
    expect(done.disabled, '复常后 enabled').toBe(false);
    expect(done.spin, '复常后 spinning 移除').toBe(false);
  });

  it('⑦ 源码锁：加载钮图标 spinning 绑 busy', () => {
    const v = readFileSync(join(__dirname, '../views/MappingDesignerView.vue'), 'utf-8');
    expect(v).toMatch(/<RefreshCw :size="12" :class="\{ spinning: busy \}" \/>/);
  });
});
