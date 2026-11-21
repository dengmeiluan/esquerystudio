/**
 * 七百七十六批：Browser 深耕档小刀巡查·三族复查轮（R156；⑥775 次选建议落地=
 * RawIo/spinning/aria 三族横扫的应用面复查——深耕档 25+ 页中 Browser 为「执行面+
 * 无兜底」最强候选〔32 spec 锚核心页，未经 741~775 首刀族判据复查〕；browserFunnelCopy
 * 同源挂载/mock 形态：视图/组件全真，只 mock ../api 出口+vue-router 出口）。
 *
 * 三族横扫结论（G253+G254 两刀）：
 * ① G253（P3 铁律 F·头名）深链文档卡 openLinkedDoc 只取 r._source 展示，
 *    GET /{idx}/_doc/{id} 完整响应的 _index/_id/_version/_found/_seq_no 元数据
 *    不可见=768 G240「所见非所存」同构缝隙——修法=轻形态补位（Mapping R84
 *    「原始 JSON」/SqlBridge G240 先例，不引完整 RawIoModal 三件套：本卡数据源
 *    单一 _doc GET，无多端点切换诉求）：卡头 FileJson 双态钮（aria-pressed）
 *    切换 _source 精简视图 / 完整原始响应；highlightJson 着色管线复用
 *    （componentUnifySweep v-html="linkedDocHtml" 锚保形）；重开卡复位 _source 视图。
 * ② G254（弱 P3 aria·随批可裁）健康 tab seg 四钮无 aria-pressed（DiffEditor 140
 *    role=group+aria-pressed 先例同构）+ bw-foot 计数行无 role=status
 *    （G224/G229/G235 异步结果到达语义族）。
 * ③ 铁律 D（spinning）横扫=合规不立刀：刷新钮 RefreshCw :class spinning 既有
 *    （唯一页头执行钮；行内操作钮=瞬态提交+notify 反馈形态）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/browser', query: {} }) }));

const INDICES = [
  { index: 'orders-v9', health: 'green', status: 'open', 'docs.count': 12345, 'store.size': '2.1gb', pri: 3, rep: 1, 'creation.date.string': '2026-09-30T10:00:00Z' },
  { index: 'logs-x', health: 'yellow', status: 'open', 'docs.count': 890, 'store.size': '450mb', pri: 1, rep: 1, 'creation.date.string': '2026-10-01T08:30:00Z' },
  { index: 'bad-c', health: 'red', status: 'close', 'docs.count': 42, 'store.size': '5mb', pri: 1, rep: 0, 'creation.date.string': '2026-08-15T00:10:00Z' },
];
/* G253 主数据：完整 _doc 响应（元数据面在 _source 视图下不可见=断言差分锚） */
const DOC_FULL = {
  _index: 'orders-v9', _id: 'doc-776-1', _version: 3, _seq_no: 41, _primary_term: 1, found: true,
  _source: { orderId: 'A-776', productName: '钛合金轴承', qty: 12, status: 'PAID' },
};

const rawFn = vi.fn();
const getDocFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve(INDICES),
      raw: (...a: any[]) => rawFn(...a),
      getDoc: (...a: any[]) => getDocFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import BrowserView from '../views/BrowserView.vue';

const src = readFileSync(join(__dirname, '../views/BrowserView.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* 深链挂载：location.hash 承载 ?idx=&doc=（useUrlState init 读 hash query） */
async function mountBrowser(hash = '#/browser') {
  location.hash = hash;
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(BrowserView as any) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 20; i++) { await nextTick(); await Promise.resolve(); }
  return { app, host };
}

const docBody = () => host.querySelector('.bw-ld-body');
const rawBtn = () => [...host.querySelectorAll<HTMLButtonElement>('.bw-ld-hd button')]
  .find(b => (b.getAttribute('aria-label') || '').includes('原始响应'));
const closeBtn = () => [...host.querySelectorAll<HTMLButtonElement>('.bw-ld-hd button')]
  .find(b => b.getAttribute('aria-label') === '关闭文档详情');

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  rawFn.mockReset().mockImplementation(async (_m: string, path: string) => {
    if (String(path).includes('_doc/')) return JSON.parse(JSON.stringify(DOC_FULL));
    return { acknowledged: true };
  });
  /* 963：深链文档卡改走 VIEWER 可读的 GET /cluster/doc（api.getDoc），raw 是 ADMIN 域 */
  getDocFn.mockReset().mockImplementation(async (_idx: string, _id: string) => JSON.parse(JSON.stringify(DOC_FULL)));
});

describe('776 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('工具条六件+QRT 8 列+计数行+三行渲染（健康档差分）', async () => {
    await mountBrowser();
    const bar = host.querySelector('.bw-bar')!;
    expect(bar, 'bw-bar 在场').toBeTruthy();
    expect(bar.querySelector('.bw-search input'), '搜索框').toBeTruthy();
    const seg = [...bar.querySelectorAll<HTMLButtonElement>('.seg button')];
    expect(seg.length, '健康 tab 四钮').toBe(4);
    expect(seg.map(b => b.textContent!.trim()).join(',')).toBe('全部,green,yellow,red');
    const btnText = [...bar.querySelectorAll('button')].map(b => b.textContent || '');
    expect(btnText.some(t => t.includes('刷新')), '刷新钮').toBe(true);
    expect(btnText.some(t => t.includes('新建索引')), '新建索引钮（未登录态 canEndpoint 放行）').toBe(true);
    /* 九百四十七批随迁：CSV/Markdown 平铺双钮合并「导出 ▾」聚合菜单（菜单关闭态
     只验触发钮在场；两格式项可达性归 browserExportMenu947 行为锁） */
    expect(btnText.some(t => t.includes('导出')), '导出聚合触发钮').toBe(true);
    const ths = [...host.querySelectorAll('.bw-res table thead th')];
    /* 8 数据列+QRT row-actions 注入尾列=9（现状即守卫以实际为准） */
    expect(ths.length, 'QRT 八数据列+行尾注入列').toBe(9);
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));
    expect(rows.length, '三索引行').toBe(3);
    expect(host.querySelector('.bw-foot')!.textContent).toContain('3 / 3 个索引');
  });
});

describe('776 G253 文档卡原始响应轻形态（铁律 F·头名；768 G240/Mapping R84 同构）', () => {
  it('G253a 深链开卡：_source 精简视图（业务字段在场+元数据不可见）+FileJson 钮 aria-pressed=false', async () => {
    await mountBrowser('#/browser?idx=orders-v9&doc=doc-776-1');
    expect(getDocFn, 'openLinkedDoc 走 api.getDoc（GET /cluster/doc）').toHaveBeenCalledTimes(1);
    expect(getDocFn.mock.calls[0][0]).toBe('orders-v9');
    expect(getDocFn.mock.calls[0][1]).toBe('doc-776-1');
    const card = host.querySelector('.bw-linked-doc');
    expect(card, '深链文档卡开').toBeTruthy();
    expect(host.querySelector('.bw-ld-hd')!.textContent).toContain('doc-776-1');
    const body = docBody()!;
    expect(body.textContent).toContain('钛合金轴承');
    expect(body.textContent, '_source 视图不含 _version 元数据（缝隙差分锚）').not.toContain('_version');
    const btn = rawBtn();
    expect(btn, '卡头 FileJson 原始响应钮').toBeTruthy();
    expect(btn!.getAttribute('aria-pressed')).toBe('false');
    expect(btn!.getAttribute('title')).toContain('_doc');
  });

  it('G253b 切换原始响应：pressed=true+完整元数据在场（_index/_version/_found）', async () => {
    await mountBrowser('#/browser?idx=orders-v9&doc=doc-776-1');
    rawBtn()!.click();
    await settle(6);
    expect(rawBtn()!.getAttribute('aria-pressed')).toBe('true');
    const tx = docBody()!.textContent || '';
    expect(tx).toContain('_index');
    expect(tx).toContain('_version');
    expect(tx).toContain('found');
    expect(tx, '_source 嵌套在完整响应内（业务字段仍在场）').toContain('钛合金轴承');
  });

  it('G253c 再点复位：pressed=false+回 _source 视图（元数据移除）', async () => {
    await mountBrowser('#/browser?idx=orders-v9&doc=doc-776-1');
    rawBtn()!.click(); await settle(6);
    rawBtn()!.click(); await settle(6);
    expect(rawBtn()!.getAttribute('aria-pressed')).toBe('false');
    const tx = docBody()!.textContent || '';
    expect(tx).toContain('钛合金轴承');
    expect(tx).not.toContain('_version');
  });

  it('G253d 重开复位：原始响应态关卡→重开→_source 默认视图', async () => {
    await mountBrowser('#/browser?idx=orders-v9&doc=doc-776-1');
    rawBtn()!.click(); await settle(6);
    closeBtn()!.click(); await settle(6);
    expect(host.querySelector('.bw-linked-doc'), '关闭收卡').toBeNull();
    /* 重开=重挂载新深链（onMounted 消费即清+rawView 复位） */
    await mountBrowser('#/browser?idx=orders-v9&doc=doc-776-1');
    expect(host.querySelector('.bw-linked-doc'), '重开卡').toBeTruthy();
    expect(rawBtn()!.getAttribute('aria-pressed'), '重开复位 _source 视图').toBe('false');
    const tx = docBody()!.textContent || '';
    expect(tx).toContain('钛合金轴承');
    expect(tx).not.toContain('_version');
  });

  it('G253e 源码锁：完整响应留存（raw 字段）+highlightJson 单源+v-html 锚保形', () => {
    expect(src).toMatch(/raw:\s*r\s*\?\?\s*null/);
    expect(src).toMatch(/rawView\.value\s*\?\s*linkedDoc\.value\.raw\s*:\s*linkedDoc\.value\.src/);
    expect(src).toMatch(/v-html="linkedDocHtml"/);
    expect(src).not.toMatch(/>\{\{\s*JSON\.stringify\(linkedDoc/);
    /* openLinkedDoc 起手复位原始响应视图 */
    expect(src).toMatch(/rawView\.value = false/);
  });
});

describe('776 G254 aria 双补位（弱 P3·随批可裁）', () => {
  it('G254a 健康 tab 四钮 aria-pressed 随选中真翻转', async () => {
    await mountBrowser();
    const seg = () => [...host.querySelectorAll<HTMLButtonElement>('.bw-bar .seg button')];
    const read = () => seg().map(b => ({ t: (b.textContent || '').trim(), p: b.getAttribute('aria-pressed') }));
    const before = read();
    expect(before.map(b => b.t).join(',')).toBe('全部,green,yellow,red');
    expect(before[0].p, '修前：全部钮无 aria-pressed').toBe('true');
    seg().find(b => (b.textContent || '').includes('green'))!.click();
    await settle(6);
    const after = read();
    expect(after.find(b => b.t === 'green')!.p).toBe('true');
    expect(after.find(b => b.t === '全部')!.p).toBe('false');
    /* 行集联动收窄（aria 与过滤行为同源） */
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('orders-v9');
  });

  it('G254b bw-foot 计数行 role=status（异步结果到达语义公告）', async () => {
    await mountBrowser();
    const foot = host.querySelector('.bw-foot')!;
    expect(foot.getAttribute('role')).toBe('status');
    expect(foot.textContent).toContain('3 / 3 个索引');
  });
});
