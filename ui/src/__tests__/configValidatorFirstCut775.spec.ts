/**
 * 七百七十五批：ConfigValidator 首刀三刀（R155；⑥774 头号建议落地=R154 裁决表
 * G249+G250+G251；741 G148/743 G152/745/747/749/751/753/755/757/760/762/764/766/
 * 768/770/772 首刀族同构；本页首例真挂载首刀后 spec——configValidatorAdjustW2/
 * pickedIdxSync528 同源挂载/mock 形态：视图/组件全真，只 mock ../api 出口+ioRecorder
 * 记录环；Monaco 内核 happy-dom canvas 崩统一 stub＝757 同款）。
 *
 * ① G249（P3 铁律 F·头名）RawIo 三件套补位——本页无任何原始请求/响应入口
 *    （774 D-RawIo 四扫全零命中）；修法=Terminal 钮+判空 toast 引导+.rim 弹窗，
 *    端点锚 '/config-lab/validate'（IndexOptimizer 557/ConfigDrift 757 同款）。
 * ② G250（P3 铁律 D·次刀）快速 Lint 钮 Play→Loader2 双态+拉取钮 Download→Loader2
 *    双态（文案通道在场=半合规→图标态补位；快速 Lint/Dry-run 共享 busy 走
 *    lastDryRun 门控＝772 G246 lastMode 族：只由本钮发起的执行亮在途态）。
 * ③ G251（弱 P3 aria·随批可裁）双 toggle 钮 aria-pressed+cv-find 搜框
 *    aria-label ×2+cv-issues 容器 role=status（G192/G224/G235/G247 族）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RawIoRec } from '../api';

const src = readFileSync(join(__dirname, '../views/ConfigValidatorView.vue'), 'utf-8');

/* ---- 网络出口 mock：757 同源（视图/组件全真） ---- */
const validateFn = vi.fn();
const clusterInspectFn = vi.fn();
const createIndexFn = vi.fn();
const pendingValidate: Array<(v: any) => void> = [];
const pendingImport: Array<(v: any) => void> = [];
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      configLab: {
        ...actual.api.configLab,
        validate: (settings?: string, mapping?: string, dryRun?: boolean) => validateFn(settings, mapping, dryRun),
      },
      clusterInspect: (...a: any[]) => clusterInspectFn(...a),
      createIndex: (...a: any[]) => createIndexFn(...a),
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745/747/755/757 spec 同款；RawIoModal 内两分节消费） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import ConfigValidatorView from '../views/ConfigValidatorView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: ConfigValidatorView }],
  });
  const pinia = createPinia();
  const app = createApp({ render: () => h(ConfigValidatorView) });
  app.use(pinia);
  app.use(router);
  await router.isReady();
  location.hash = '#/config-validator';
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

function findBtn(host: HTMLElement, re: RegExp) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => re.test(b.textContent || ''))!;
}

/* 校验报告球（issues 形态）：L1 Lint 一条 error + 一条 warn */
const REPORT_ISSUES = {
  valid: false, dryRunExecuted: false, dryRunPassed: false, elapsedMs: 5,
  errorCount: 1, warnCount: 1, infoCount: 0,
  issues: [
    { severity: 'ERROR', layer: 'LINT', code: 'settings.unknown_key', message: '未知配置键', suggestion: '检查拼写' },
    { severity: 'WARN', layer: 'ADVISOR', code: 'replicas.low', message: '副本数偏低' },
  ],
};
const REPORT_OK = { valid: true, dryRunExecuted: true, dryRunPassed: true, elapsedMs: 3, errorCount: 0, warnCount: 0, infoCount: 0, issues: [] };

/* 模拟真实 fetch 包装层的记录环行为：resolve 同拍落一条记录（api.ts recordIo 语义） */
function releaseValidate(body: any = REPORT_ISSUES, dryRun = false) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'POST', url: '/config-lab/validate', requestBody: JSON.stringify({ settings: undefined, mapping: undefined, dryRun }), status: 200, ok: true, durationMs: 5, responseRaw: JSON.stringify(body) });
  pendingValidate.shift()!(body);
}
const IMPORT_OK = { settings: { 'pre_idx': { 'index.number_of_shards': '1' } }, mappings: { 'pre_idx': { properties: { f: { type: 'keyword' } } } } };
function releaseImport(body: any = IMPORT_OK) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url: '/cluster/inspect?index=pre_idx', requestBody: '', status: 200, ok: true, durationMs: 5, responseRaw: JSON.stringify(body) });
  pendingImport.shift()!(body);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pendingValidate.length = 0;
  pendingImport.length = 0;
  ioRing.length = 0;
  ioSeq = 0;
  validateFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendingValidate.push(res); }));
  clusterInspectFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendingImport.push(res); }));
  createIndexFn.mockReset().mockResolvedValue({});
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('775 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('页头四既有钮+双栏编辑器+引导空态', async () => {
    const { app, host } = await mountView();
    expect(host.textContent).toContain('索引配置校验器');
    for (const t of ['模板画廊', '从现有索引导入', '快速 Lint', '校验 + Dry-run']) {
      expect(findBtn(host, new RegExp(t.replace(/([+])/g, '\\$1').replace(/\s+/g, '\\s*'))), `${t} 钮在场`).toBeTruthy();
    }
    expect(host.querySelectorAll('.cv-card').length, '双栏编辑卡').toBe(2);
    expect(host.textContent).toContain('粘贴 settings / mapping');
    app.unmount();
  });
});

describe('775 G249 RawIo 三件套（铁律 F·头名·557/757 同构）', () => {
  it('三件套接线源码锁：RawIoModal 组件+ioRecorder 取 /config-lab/validate+Terminal 图标钮', () => {
    expect(src.includes("import RawIoModal from '../components/RawIoModal.vue';"), '弹窗组件接入').toBe(true);
    expect(src.includes("ioRecorder.last('/config-lab/validate')"), '按页端点取最近记录').toBe(true);
    expect(src.includes('<Terminal'), 'Terminal 图标钮').toBe(true);
  });

  it('判空链：无记录点「原始 IO」→不开空弹窗（toast 引导）', async () => {
    const { app, host, store } = await mountView();
    const spy = vi.spyOn(store, 'notify');
    findBtn(host, /原始\s*IO/).click();
    await settle(4);
    expect(document.querySelector('.rim'), '无记录不开弹窗').toBeFalsy();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.some(c => String(c[0]) === 'info' && String(c[1]).includes('原始 IO'))).toBe(true);
    app.unmount();
  });

  it('直达链：校验后点「原始 IO」→弹窗开+url 含 /config-lab/validate+请求/响应两分节', async () => {
    const { app, host } = await mountView();
    findBtn(host, /快速\s*Lint/).click();
    await settle(4);
    releaseValidate();
    await settle(8);
    findBtn(host, /原始\s*IO/).click();
    await settle(6);
    const rim = document.querySelector('.rim');
    expect(rim, '弹窗开（ModalShell 挂 body 层）').toBeTruthy();
    expect(rim!.textContent).toContain('/config-lab/validate');
    expect(rim!.textContent).toContain('原始请求');
    expect(rim!.textContent).toContain('原始响应');
    app.unmount();
  });
});

describe('775 G250 快速 Lint/校验+Dry-run/拉取钮在途态（铁律 D·次刀·772 G246 lastMode 族）', () => {
  it('快速 Lint busy→Loader2 spinning+「校验中…」+Play 让位+Dry-run 钮恒静（lastDryRun 门控对称）；完成复常', async () => {
    const { app, host } = await mountView();
    const lintBtn = findBtn(host, /快速\s*Lint/);
    const dryBtn = findBtn(host, /校验\s*\+\s*Dry-run/);
    lintBtn.click();
    await settle(6);
    expect(lintBtn.disabled, 'busy 期间禁用').toBe(true);
    expect((lintBtn.textContent || '').replace(/\s+/g, ''), '在途文案').toContain('校验中');
    expect(lintBtn.querySelector('.spinning'), 'Loader2 spinning 在场').toBeTruthy();
    expect(lintBtn.querySelector('[class*="lucide-play"]'), 'busy 期 Play 静态图标让位').toBe(null);
    expect((dryBtn.textContent || '').replace(/\s+/g, ''), 'Dry-run 钮文案恒定（lastDryRun=false 门控）').toBe('校验+Dry-run');
    expect(dryBtn.querySelector('.spinning'), 'Dry-run 钮不亮他钮在途态').toBe(null);
    releaseValidate();
    await settle(10);
    expect(lintBtn.disabled, '完成复常解禁').toBe(false);
    expect((lintBtn.textContent || '').replace(/\s+/g, ''), '复常文案').toBe('快速Lint');
    expect(lintBtn.querySelector('.spinning'), 'spinning 移除').toBe(null);
    expect(lintBtn.querySelector('[class*="lucide-play"]'), 'Play 图标复位').toBeTruthy();
    app.unmount();
  });

  it('Dry-run busy→Loader2 spinning+「校验中…」+快速 Lint 钮恒静；完成复常 FlaskConical 复位', async () => {
    const { app, host } = await mountView();
    const lintBtn = findBtn(host, /快速\s*Lint/);
    const dryBtn = findBtn(host, /校验\s*\+\s*Dry-run/);
    dryBtn.click();
    await settle(6);
    expect(dryBtn.disabled, 'busy 期间禁用').toBe(true);
    expect((dryBtn.textContent || '').replace(/\s+/g, ''), '在途文案').toContain('校验中');
    expect(dryBtn.querySelector('.spinning'), 'Loader2 spinning 在场').toBeTruthy();
    expect((lintBtn.textContent || '').replace(/\s+/g, ''), '快速 Lint 钮文案恒定（lastDryRun=true 门控）').toBe('快速Lint');
    expect(lintBtn.querySelector('.spinning'), '快速 Lint 钮不亮他钮在途态').toBe(null);
    expect(lintBtn.querySelector('[class*="lucide-play"]'), '快速 Lint 钮 Play 恒在（本钮未发起执行）').toBeTruthy();
    releaseValidate(REPORT_OK, true);
    await settle(10);
    expect((dryBtn.textContent || '').replace(/\s+/g, ''), '复常文案').toBe('校验+Dry-run');
    expect(dryBtn.querySelector('.spinning'), 'spinning 移除').toBe(null);
    expect(dryBtn.querySelector('[class*="lucide-flask-conical"]'), 'FlaskConical 图标复位').toBeTruthy();
    app.unmount();
  });

  it('拉取钮 importing→Loader2 spinning+「拉取中…」+Download 让位；完成复常', async () => {
    localStorage.setItem('es_picked', 'pre_idx');
    const { app, host } = await mountView();
    findBtn(host, /从现有索引导入/).click();
    await settle(4);
    const fetchBtn = findBtn(host, /拉取\s*settings/);
    expect(fetchBtn.disabled, '起点就绪拉取解禁').toBe(false);
    fetchBtn.click();
    await settle(6);
    expect(fetchBtn.disabled, 'importing 期间禁用').toBe(true);
    expect((fetchBtn.textContent || '').replace(/\s+/g, ''), '在途文案').toContain('拉取中');
    expect(fetchBtn.querySelector('.spinning'), 'Loader2 spinning 在场').toBeTruthy();
    expect(fetchBtn.querySelector('[class*="lucide-download"]'), 'busy 期 Download 静态图标让位').toBe(null);
    releaseImport();
    await settle(10);
    /* 导入成功后导入行按设计收起（528 批 showImport=false）——脱管按钮读数不可用，
       重开导入行取新按钮读复常态 */
    expect(host.querySelector('.cv-import'), '导入成功行收起（528 批设计）').toBe(null);
    findBtn(host, /从现有索引导入/).click();
    await settle(4);
    const fetchBtn2 = findBtn(host, /拉取\s*settings/);
    expect((fetchBtn2.textContent || '').replace(/\s+/g, ''), '复常文案').toContain('拉取settings');
    expect(fetchBtn2.querySelector('.spinning'), 'spinning 移除').toBe(null);
    expect(fetchBtn2.querySelector('[class*="lucide-download"]'), 'Download 图标复位').toBeTruthy();
    app.unmount();
  });

  it('源码锁：三钮双态形态在场（Loader2 互换+lastDryRun 门控文案）', () => {
    expect(src, '快速 Lint 钮双态（Loader2/Play 互换+门控文案）')
      .toMatch(/<Loader2 v-if="busy && !lastDryRun" :size="12" class="spinning" \/>\s*<Play v-else :size="12" \/>\s*\{\{ busy && !lastDryRun \? '校验中…' : '快速 Lint' \}\}/);
    expect(src, 'Dry-run 钮双态（Loader2/FlaskConical 互换+门控文案）')
      .toMatch(/<Loader2 v-if="busy && lastDryRun" :size="12" class="spinning" \/>\s*<FlaskConical v-else :size="12" \/>\s*\{\{ busy && lastDryRun \? '校验中…' : '校验 \+ Dry-run' \}\}/);
    expect(src, '拉取钮双态（Loader2/Download 互换+在途文案）')
      .toMatch(/<Loader2 v-if="importing" :size="12" class="spinning" \/>\s*<Download v-else :size="12" \/>\s*\{\{ importing \? '拉取中…' : '拉取 settings \+ mapping' \}\}/);
  });
});

describe('775 G251 aria 补位（弱 P3·随批可裁·G247 族）', () => {
  it('双 toggle 钮 aria-pressed 随开合翻转（模板画廊/从现有索引导入）', async () => {
    const { app, host } = await mountView();
    const g = findBtn(host, /模板画廊/);
    const i = findBtn(host, /从现有索引导入/);
    expect(g.getAttribute('aria-pressed'), '画廊钮初始收起').toBe('false');
    expect(i.getAttribute('aria-pressed'), '导入钮初始收起').toBe('false');
    g.click();
    i.click();
    await settle(4);
    expect(g.getAttribute('aria-pressed'), '画廊钮展开态').toBe('true');
    expect(i.getAttribute('aria-pressed'), '导入钮展开态').toBe('true');
    expect(host.querySelector('.cv-gallery'), '画廊区随开').toBeTruthy();
    expect(host.querySelector('.cv-import'), '导入行随开').toBeTruthy();
    app.unmount();
  });

  it('cv-find 双搜框 aria-label 分栏可区分（settings/mapping）', async () => {
    const { app, host } = await mountView();
    const finds = [...host.querySelectorAll<HTMLInputElement>('.cv-find')];
    expect(finds.length, '双栏搜索框').toBe(2);
    expect(finds[0].getAttribute('aria-label')).toBe('搜 settings');
    expect(finds[1].getAttribute('aria-label')).toBe('搜 mapping');
    app.unmount();
  });

  it('cv-issues 容器 role=status（校验结果到达语义公告）', async () => {
    const { app, host } = await mountView();
    findBtn(host, /快速\s*Lint/).click();
    await settle(4);
    releaseValidate();
    await settle(8);
    const issues = host.querySelector('.cv-issues');
    expect(issues, '问题清单在场').toBeTruthy();
    expect(issues!.getAttribute('role'), 'G251 语义公告 role=status').toBe('status');
    app.unmount();
  });
});
