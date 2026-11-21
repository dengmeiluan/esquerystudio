/**
 * 五百五十二批 轨2（工蚁2）四页深化 —— 六刀（源码锁 + QueryHistoryPanel curl 行为锁）。
 * ① XmigrateView 原始 IO 钮常驻化：钮原被 COPY_FROM_SOURCE 专属的 .xm-cfg 分节 v-if 包裹，
 *    NONE/FROM_ENTITY/REBUILD 三档模式下连接检查/启动迁移 IO 都入记录环（'/xmigrate/'）
 *    却全页无取数入口——钮上移 .xm-actions 行常驻渲染（钮形/aria/特征串零触，rawIo545 锁保全）。
 * ② IndexHubView ops tab 补原始 IO 口：行级执行 opRaw 走 api.raw（'/cluster/raw'）入环，
 *    但 openRawIo 只认 '/cluster/query'——ops 分节行尾补 Terminal 钮 + 特征串扩双参
 *    （last('/cluster/query') ?? last('/cluster/raw')，551 ⑦c DslQueryView 双特征同形；
 *    判空 notify 口径逐字平移）。
 * ③ QueryHistoryPanel 加可选 action 'curl'：行级按钮对齐 play/fill/copy 既有形态，仅 emit、
 *    curl 组装归宿主；不传 'curl' 的宿主零变化（默认行为零增量）。
 * ④ DevToolsView 宿主接线：actions 加 'curl' + @curl=histCurl（本页 copyCurl 既有 curl 手法
 *    逐字平移）；历史行补 body 截断摘要（80 字符截断，面板可选 sub 行承接，不传不渲染）。
 * ⑤ XmigrateView formOpen 落盘：ref(true) → usePref('xm.formOpen', true)
 *    （550 轨2 ② dt.histOpen 同范式，默认 true 既有行为零变化）。
 * ⑥ XmigrateView 源配置预览行数三档：540 封顶 10 → useTierCycle 10/20/40（落盘键 xm.cfgRows，
 *    默认档 10=原封顶值既有视觉零变化；cfgRows 纯内容函数 min(内容行数,档值) 不变，
 *    高度红线不触——无 DOM 测量、无回写回路）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const xm = read('../views/XmigrateView.vue');
const ih = read('../views/IndexHubView.vue');
const dt = read('../views/DevToolsView.vue');
const qhp = read('../components/QueryHistoryPanel.vue');

/* ═══ ① XmigrateView 原始 IO 钮常驻化（.xm-cfg → .xm-actions） ═══ */
describe('552 ①：XmigrateView 原始 IO 钮常驻化（三档模式全可见）', () => {
  const actionsRow = xm.slice(xm.indexOf('<div class="xm-actions">'), xm.indexOf('</template>', xm.indexOf('<div class="xm-actions">')));
  const cfgSec = xm.slice(xm.indexOf('class="xm-cfg"'), xm.indexOf('<div class="xm-actions">'));

  it('钮在 .xm-actions 行内（v-if 门禁外常驻渲染）', () => {
    expect(actionsRow, '原始 IO 钮上移 .xm-actions 行').toContain('aria-label="查看原始 IO（迁移接口）"');
    expect(actionsRow, '@click="openRawIo" 接线随钮迁').toContain('@click="openRawIo"');
    expect(actionsRow, 'Terminal 图标随钮迁').toContain('<Terminal :size="11" />');
  });
  it('COPY_FROM_SOURCE 专属 .xm-cfg 分节不再包钮（NONE/FROM_ENTITY/REBUILD 档有入口）', () => {
    expect(cfgSec, '原始 IO 钮撤离 .xm-cfg 分节').not.toContain('查看原始 IO（迁移接口）');
    expect(cfgSec, '.xm-cfg 分节自身保留（拉取预览钮不动）').toContain('@click="fetchCfg"');
  });
  it('钮形/取数特征/弹窗挂载零触（rawIo545 锁语义保全）', () => {
    expect(xm).toContain('title="最近一次迁移接口调用的请求/响应原文"');
    expect(xm).toContain("ioRecorder.last('/xmigrate/')");
    expect(xm).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
  });
});

/* ═══ ② IndexHubView ops tab 补原始 IO 口 ═══ */
describe('552 ②：IndexHubView ops tab 原始 IO 补口（/cluster/raw 通道）', () => {
  const opsSec = ih.slice(ih.indexOf(`<template v-else-if="tab === 'ops'">`), ih.indexOf('</template>', ih.indexOf(`<template v-else-if="tab === 'ops'">`)));

  it('ops 分节行尾 Terminal 钮在场（canOps || canAdmin 门禁）', () => {
    expect(opsSec, 'ops 分节 Terminal 钮').toContain('aria-label="查看原始 IO（运维操作）"');
    /* 五百六十批同步更新（击穿者：560 轨2 刀⑤——scope 分流，ops 行尾钮显式传 'ops'） */
    expect(opsSec, "@click=\"openRawIo('ops')\" 接线").toContain("@click=\"openRawIo('ops')\"");
    expect(opsSec, '与行级执行同权门禁').toContain('v-if="canOps || canAdmin"');
  });
  it("openRawIo 取数特征（560 同步更新：scope 分流后 ops 档保留双参回退先 /cluster/raw 后 query），判空口径逐字平移", () => {
    expect(ih).toContain("? (ioRecorder.last('/cluster/raw') ?? ioRecorder.last('/cluster/query'))");
    expect(ih).toContain('暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看');
  });
  it('弹窗挂载与既有 docs/query 两条入口零触（rawIo545 锁语义保全）', () => {
    /* 1357：行内钮收进「更多 ⋯」菜单（同 rawIo545 迁移口径）——入口仍在，只是换了位置。 */
    expect(ih).toContain("key: 'ih-raw-io-docs'");
    expect(ih).toContain("key: 'ih-raw-io-query'");
    expect(ih).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
  });
});

/* ═══ ③ QueryHistoryPanel 可选 'curl' action（行为锁 + 源码锚） ═══ */
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/devtools' }),
  useRouter: () => ({ push: vi.fn() }),
}));
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

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import { useAppStore } from '../stores/app';

const ROW = { id: 'r1', query: 'GET /_cat/indices?v&format=json', index: 'idx-a', ts: Date.now() - 1000,
  method: 'GET', path: '/_cat/indices?v&format=json', body: '{"size":5}' };

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

type Emitted = Record<string, unknown[][]>;
async function mountPanel(props: Record<string, any>) {
  const emitted: Emitted = {};
  const app = createApp({
    setup() {
      const store = useAppStore();
      void store;
      return () => h(QueryHistoryPanel as any, {
        items: [ROW],
        onCurl: (it: unknown) => (emitted.curl = [...(emitted.curl || []), [it]]),
        ...props,
      }, undefined);
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return emitted;
}
beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));

describe('552 ③：QueryHistoryPanel 可选 curl action（行为锁）', () => {
  it("actions 含 'curl' 出行级钮，点击 emit('curl', 行)——组装归宿主", async () => {
    const emitted = await mountPanel({ actions: ['curl'] });
    const btn = host.querySelector<HTMLButtonElement>('[aria-label="复制为 curl"]');
    expect(btn, "'curl' 行级钮在场").toBeTruthy();
    btn!.click();
    await nextTick();
    expect(emitted.curl?.length).toBe(1);
    expect(emitted.curl![0]![0]).toMatchObject({ method: 'GET', path: '/_cat/indices?v&format=json' });
  });
  it("不传 'curl' 的宿主零变化：按钮不渲染（默认行为零增量）", async () => {
    await mountPanel({ actions: ['play', 'fill', 'copy'] });
    expect(host.querySelector('[aria-label="复制为 curl"]'), '无 curl 配置不出钮').toBeNull();
  });
  it('源码锚：actions 联合类型 + emit 契约 + 行级钮对齐 play/fill/copy 形态', () => {
    /* 五百六十一批同步更新（击穿者：561 B2 刀①——actions 联合类型末位加 'newtab'，行级仅 emit、
       mkTab+激活跳转归宿主 histNewTab）：枚举字面同步更新，curl 在册语义零回退 */
    expect(qhp).toMatch(/actions\?: \('play' \| 'fill' \| 'copy' \| 'curl' \| 'del' \| 'rename' \| 'fav' \| 'newtab'\)\[\];/);
    expect(qhp).toMatch(/\(e: 'curl', it: HistRow\): void;/);
    expect(qhp).toMatch(/<button v-if="actions\.includes\('curl'\)" aria-label="复制为 curl" class="btn xs ghost" title="复制为 curl" @click="\$emit\('curl', it\)">/);
  });
});

/* ═══ ④ DevToolsView 宿主接线（curl 组装 + body 截断摘要） ═══ */
describe('552 ④：DevToolsView 历史行 curl 接线 + body 截断摘要', () => {
  it("actions 窄集加 'curl'（六动作形）+ @curl=histCurl 接线", () => {
    /* 五百六十一批同步更新（击穿者：561 B2 刀①——actions 窄集加 'newtab' 回放到新 Tab，
       面板行级仅 emit、mkTab+激活跳转归宿主 histNewTab）：六动作形随字面迁为七动作形 */
    expect(dt).toContain(`:actions="['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']"`);
    expect(dt).toContain('@curl="histCurl"');
  });
  it('histCurl 复用本页 copyCurl 手法（origin + method + Content-Type + body 单引号转义）', () => {
    expect(dt).toMatch(/function histCurl\(h: any\) \{\s*const c = `curl -X \$\{h\.method\} '\$\{window\.location\.origin\}\$\{h\.path\}'` \+\s*\(h\.body \? ` -H 'Content-Type: application\/json' -d '\$\{h\.body\.replace\(\/'\/g, "'\\\\''"\)\}'` : ''\);\s*copyText\(c\)\.then\(ok => store\.notify\(ok \? 'success' : 'error', ok \? 'curl 已复制' : '复制失败'\)\);\s*\}/);
  });
  it('histRows 补 body 截断摘要（80 字符截断，面板可选 sub 行承接）', () => {
    expect(dt).toContain("sub: h.body ? (h.body.length > 80 ? h.body.slice(0, 80) + '…' : h.body) : undefined,");
  });
  it('面板可选 sub 行：不传不渲染（既有宿主零增量）', () => {
    expect(qhp).toContain('<div v-if="it.sub" class="qhp-sub mono" :title="it.sub">{{ it.sub }}</div>');
  });
});

/* ═══ ⑤ XmigrateView formOpen 落盘（usePref 范式） ═══ */
describe('552 ⑤：XmigrateView formOpen 落盘（xm.formOpen，默认开）', () => {
  it("ref(true) 退役 → usePref('xm.formOpen', true)", () => {
    expect(xm).toContain("const formOpen = usePref('xm.formOpen', true);");
    expect(xm, '会话内 ref 初值形态退役').not.toContain('const formOpen = ref(true);');
    expect(xm, "usePref 既有 import 在场（xm.recentKeys 同源）").toContain("import { usePref } from '../composables/urlState';");
  });
  it('页头折叠钮接线零触（formOpen = !formOpen）', () => {
    expect(xm).toContain('@click="formOpen = !formOpen"');
  });
});

/* ═══ ⑥ XmigrateView 源配置预览行数三档（useTierCycle） ═══ */
describe('552 ⑥：XmigrateView 配置预览行数三档（xm.cfgRows 10/20/40）', () => {
  it('useTierCycle 三件套接线（档值数组 + usePref 落盘 + cycle）', () => {
    expect(xm).toContain("import { useTierCycle } from '../composables/useTierCycle';");
    expect(xm).toContain("useTierCycle('xm.cfgRows', [XM_CFG_CAP_ROWS, 20, 40], XM_CFG_CAP_ROWS)");
    expect(xm, '默认档常量在场（10=540 封顶值，既有视觉零变化）').toMatch(/XM_CFG_CAP_ROWS = 10/);
  });
  it('cfgRows 纯内容函数不变形：min(内容行数, 档值)，无 DOM 测量无回写回路', () => {
    expect(xm).toMatch(/function cfgRows\(text: string\) \{ return Math\.min\(text\.split\('\\n'\)\.length, cfgCapRows\.value\); \}/);
  });
  it('档位循环钮在 .xm-cfg 分节（消费形态照抄 IlmView 宽/CV 高钮）', () => {
    const cfgSec = xm.slice(xm.indexOf('class="xm-cfg"'), xm.indexOf('<div class="xm-actions">'));
    expect(cfgSec).toContain('@click="cycleCfgRows"');
    expect(cfgSec).toContain(`:title="'配置预览行数档：' + cfgCapRows + ' 行（点击切换）'"`);
  });
  it('JsonArea 两路 readonly 接线零触（rows 仍走 cfgRows）', () => {
    expect(xm).toContain(':rows="cfgRows(cfgMappingText)"');
    expect(xm).toContain(':rows="cfgRows(cfgSettingsText)"');
  });
});
