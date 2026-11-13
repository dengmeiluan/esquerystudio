/**
 * 七百三十五批：Lifecycle 首刀五小刀（R116；R115 裁决表 G120+G121+G122+G123+G124）。
 *
 * ① G120（P3 死代码·头号）PageHeader 合并后页头旧壳四条死规则删（styleSheets 各 1 命中
 *    合计 4+模板 0 引用双实锚；活锚副题行/右组钮容器保留；713 G53/715 G56/717 G61/
 *    721 G72/727 G86/729 G94/733 G109 先例链）。
 * ② G121（P3 铁律 D·族内最重形态）Dry Run 预检/执行 Rollover 两钮补 roPending 守卫
 *    +spinning+文案切换「预检中…」「执行中…」（修前 disabled=false+spinning=false+
 *    文本不变三读实锚——doRollover 无 pending 守卫连点可重复触发；729 G95/731 G104/
 *    733 G110 同族但本页连 disabled 都无）。
 * ③ G122（P3 铁律 D）Start/Stop ILM 双钮补 spinning（ilmOpPending 已有 disabled 半合规）。
 * ④ G123（P3 铁律 D·源码同构）推进钮补 mvPending 守卫+spinning+「推进中…」，随 G121 同修同验。
 * ⑤ G124（P3 体验断链）moveIndex 一次性回填（同步赋值）发生在 watch 注册之前——回填后
 *    explain 零发+curStepInfo 空+六输入保持默认（R115 A0 实锚）；修法=抽出 prefillCurStep
 *    供 watch 与回填两路共用，回填处显式补发（KeepAlive 重挂不重跑 setup 不重触）。
 *
 * 驱动方式照 analyzerLabFirstCut733（vue-router 轻 mock + 只 mock ../api）+
 * protectThreeState 的 ilm 端点分桶；askConfirm 全程 mock 放行（确认门行为归
 * protectThreeState/probe 域，只锁在途窗与回填链）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const routeMock = { path: '/lifecycle', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* askConfirm 放行（G121b/G123 在途窗测试需要越过确认门直落 pending 态） */
vi.mock('../composables/confirm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/confirm')>();
  return { ...actual, askConfirm: () => Promise.resolve(true) };
});

/* JsonArea 内核=Monaco——happy-dom canvas 崩（protectThreeState 同款 stub；本 spec 对 JsonArea
   内容零驱动，rolloverCond 走默认稿） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

const ilmStatusFn = vi.fn();
const ilmPoliciesFn = vi.fn();
const ilmExplainFn = vi.fn();
const rolloverFn = vi.fn();
const ilmMoveFn = vi.fn();
const ilmStartFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      ilmStatus: (...a: any[]) => ilmStatusFn(...a),
      ilmPolicies: (...a: any[]) => ilmPoliciesFn(...a),
      ilmExplain: (...a: any[]) => ilmExplainFn(...a),
      rolloverAlias: (...a: any[]) => rolloverFn(...a),
      ilmMove: (...a: any[]) => ilmMoveFn(...a),
      ilmStart: (...a: any[]) => ilmStartFn(...a),
      ilmStop: () => Promise.resolve({ acknowledged: true }),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import LifecycleView from '../views/LifecycleView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const app = createApp({ render: () => h(LifecycleView as any) });
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

/* 甘特 3 策略 10 相位条（R115 A0 同构口径）+ explain 预填球 */
const POLICIES_OK = [
  { name: 'orders-hot', policy: { phases: { hot: { min_age: '0s' }, warm: { min_age: '10d' }, cold: { min_age: '30d' }, delete: { min_age: '90d' } } } },
  { name: 'logs-short', policy: { phases: { hot: { min_age: '0s' }, delete: { min_age: '2d' } } } },
  { name: 'metrics-wide', policy: { phases: { hot: { min_age: '0s' }, warm: { min_age: '5d' }, frozen: { min_age: '20d' }, delete: { min_age: '60d' } } } },
];
const EXPLAIN_OK = { phase: 'warm', action: 'shrink', step: 'wait_for_shard' };
const DRY_OK = { dry_run: true, conditions: { max_docs: true, max_age: false } };
const ROLL_OK = { acknowledged: true, old_index: 'probe-lc-000001', new_index: 'probe-lc-000002' };
const MOVE_OK = { acknowledged: true };

/* 在途窗分桶 deferred（731 G104b 课：单 release 变量会被多 Promise 覆盖，按桶收集） */
let roRes: Array<(v: any) => void> = [];
let mvRes: Array<(v: any) => void> = [];
let stRes: Array<(v: any) => void> = [];
const relAll = (bag: Array<(v: any) => void>, v: any) => { bag.splice(0).forEach(r => r(v)); };

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
  roRes = []; mvRes = []; stRes = [];
  ilmStatusFn.mockReset().mockResolvedValue({ operation_mode: 'RUNNING' });
  ilmPoliciesFn.mockReset().mockResolvedValue(POLICIES_OK);
  ilmExplainFn.mockReset().mockResolvedValue(EXPLAIN_OK);
  rolloverFn.mockReset().mockImplementation(() => new Promise<any>(res => { roRes.push(res); }));
  ilmMoveFn.mockReset().mockImplementation(() => new Promise<any>(res => { mvRes.push(res); }));
  ilmStartFn.mockReset().mockImplementation(() => new Promise<any>(res => { stRes.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('735 A0 挂载不变量负锚（现状即守卫）', () => {
  it('title+RUNNING 徽标+甘特 3 行 10 bar+图例五相+别名空时双钮禁用+零 explain', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('索引生命周期视图');
    expect(host.textContent).toContain('RUNNING');
    expect(host.querySelectorAll('.lc-gantt-row').length, '甘特 3 策略').toBe(3);
    expect(host.querySelectorAll('.lc-gantt-bar').length, '10 相位条').toBe(10);
    expect(host.querySelectorAll('.lc-legend > span').length, '图例五相').toBe(5);
    const dry = findBtn(host, /DryRun预检/);
    expect(dry.disabled, '别名空禁用既有').toBe(true);
    expect(ilmExplainFn, '无选中索引零 explain').not.toHaveBeenCalled();
  });
});

describe('735 G124 回填链 explain 补发（R115 A0 实锚：修前回填后零发）', () => {
  it('es_picked 回填 moveIndex → explain 即发+curStepInfo 在场+六输入改用', async () => {
    localStorage.setItem('es_picked', 'probe-lc');
    const host = await mountView();
    await settle(6);
    expect(ilmExplainFn, 'G124 病灶：回填同步赋值早于 watch 注册——explain 零发').toHaveBeenCalledWith('probe-lc');
    expect(host.textContent, '当前所处行在场（修前 curstep 恒空）').toContain('当前所处：warm / shrink / wait_for_shard');
    const curInp = host.querySelectorAll<HTMLInputElement>('input.lc-inp-sm')[0];
    expect(curInp.value, 'curPhase 随 explain 改用').toBe('warm');
  });

  it('改值触发预填链不回归（watch 路径守卫：抽出共用函数后仍发）', async () => {
    const host = await mountView();
    const mv = host.querySelectorAll<HTMLInputElement>('input.ixp-inp')[1];
    mv.value = 'probe-x';
    mv.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(6);
    expect(ilmExplainFn, 'watch 改值路径必须仍发（D5 链守卫）').toHaveBeenCalledWith('probe-x');
  });
});

describe('735 G121 Rollover 两钮在途窗（铁律 D·族内最重形态）', () => {
  it('Dry Run：在途窗 disabled+spinning+「预检中…」；完成复常+条件命中双行', async () => {
    const host = await mountView();
    const al = host.querySelectorAll<HTMLInputElement>('input.ixp-inp')[0];
    al.value = 'probe-alias';
    al.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(2);
    const dry = findBtn(host, /DryRun预检|预检中…/);
    expect(dry.disabled, '别名在场起手可点').toBe(false);
    dry.click();
    await settle(4);
    expect(rolloverFn).toHaveBeenCalledTimes(1);
    expect(dry.disabled, 'G121 病灶：在途窗零禁用').toBe(true);
    expect(dry.querySelector('.spinning'), 'G121 病灶：在途窗零 spinning').toBeTruthy();
    expect(collapse(dry.textContent), 'G121 病灶：在途窗文案不变').toBe('预检中…');
    const run = findBtn(host, /执行Rollover|执行中…/);
    expect(run.disabled, '共用 pending：另一钮同步禁用防连点').toBe(true);
    relAll(roRes, DRY_OK);
    await settle();
    expect(dry.disabled, '完成复常可点').toBe(false);
    expect(dry.querySelector('.spinning')).toBeNull();
    expect(collapse(dry.textContent)).toBe('DryRun预检');
    expect(host.textContent, '条件命中 ✓ 双行').toContain('✓ 命中');
    expect(host.textContent, '条件未命中 ✗ 双行').toContain('✗ 未命中');
  });

  it('执行 Rollover：确认后在途窗「执行中…」+spinning；完成 new_index 行+双跳转钮', async () => {
    const host = await mountView();
    const al = host.querySelectorAll<HTMLInputElement>('input.ixp-inp')[0];
    al.value = 'probe-alias';
    al.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(2);
    const run = findBtn(host, /执行Rollover|执行中…/);
    run.click();
    await settle(4);
    expect(rolloverFn).toHaveBeenCalledTimes(1);
    expect(rolloverFn.mock.calls[0][2], '非 dry-run 实弹档').toBe(false);
    expect(run.disabled, 'G121 病灶：执行钮在途窗零禁用').toBe(true);
    expect(run.querySelector('.spinning'), 'G121 病灶：执行钮零 spinning').toBeTruthy();
    expect(collapse(run.textContent), 'G121 病灶：执行钮文案不变').toBe('执行中…');
    const dry = findBtn(host, /DryRun预检|预检中…/);
    expect(dry.disabled, '共用 pending：Dry Run 同步禁用').toBe(true);
    relAll(roRes, ROLL_OK);
    await settle();
    expect(collapse(run.textContent)).toBe('执行Rollover');
    expect(host.textContent).toContain('probe-lc-000002');
    expect(host.textContent).toContain('打开新索引工作区');
    expect(host.textContent).toContain('看别名图');
  });
});

describe('735 G122 Start/Stop ILM 双钮 spinning（ilmOpPending 半合规补全）', () => {
  it('Start ILM 在途窗 disabled（既有）+spinning（G122 病灶：修前零）；完成复常+load 复拉', async () => {
    const host = await mountView();
    expect(ilmPoliciesFn).toHaveBeenCalledTimes(1);
    const st = findBtn(host, /StartILM/);
    st.click();
    await settle(4);
    expect(ilmStartFn).toHaveBeenCalledTimes(1);
    expect(st.disabled, '防重入既有').toBe(true);
    expect(st.querySelector('.spinning'), 'G122 病灶：在途窗零 spinning').toBeTruthy();
    const sp = findBtn(host, /StopILM/);
    expect(sp.disabled, '姊妹钮同步禁用既有').toBe(true);
    relAll(stRes, { acknowledged: true });
    await settle();
    expect(st.querySelector('.spinning')).toBeNull();
    expect(st.disabled, '完成复常可点').toBe(false);
    expect(ilmPoliciesFn, '成功后 load 复拉双源').toHaveBeenCalledTimes(2);
  });
});

describe('735 G123 推进钮在途窗（源码同构随 G121 同修同验）', () => {
  it('回填就位 → 推进在途窗 disabled+spinning+「推进中…」；完成复常+结果区上位', async () => {
    localStorage.setItem('es_picked', 'probe-lc');
    const host = await mountView();
    await settle(6);
    const mvBtn = findBtn(host, /推进/);
    expect(mvBtn.disabled, '索引在场起手可点').toBe(false);
    mvBtn.click();
    await settle(4);
    expect(ilmMoveFn).toHaveBeenCalledTimes(1);
    expect(ilmMoveFn.mock.calls[0][0]).toBe('probe-lc');
    const body = JSON.parse(ilmMoveFn.mock.calls[0][1]);
    expect(body.current_step.phase, 'explain 预填随 body 带出（G124 联动）').toBe('warm');
    expect(mvBtn.disabled, 'G123 病灶：在途窗零禁用').toBe(true);
    expect(mvBtn.querySelector('.spinning'), 'G123 病灶：在途窗零 spinning').toBeTruthy();
    expect(collapse(mvBtn.textContent), 'G123 病灶：在途窗文案不变').toBe('推进中…');
    relAll(mvRes, MOVE_OK);
    await settle();
    expect(collapse(mvBtn.textContent)).toBe('推进');
    expect(mvBtn.disabled).toBe(false);
    expect(host.querySelectorAll('pre.lc-result').length, '结果区上位').toBeGreaterThan(0);
  });
});

describe('735 G120 页头四条死规则退役（源码锁；733 G109 同族）', () => {
  it('死族零残留+活锚副题行/右组钮容器保留（CSS+模板双锚）', () => {
    const v = read('../views/LifecycleView.vue');
    /* 死族字面量须连注释一并零残留（705-C1：史志注释不得引用待清符号字面量自伤清零锁）；
       基壳规则用「选择器+花括号」锚——带后缀的活类不匹配 */
    expect((v.match(/\.lc-hd\s*\{/g) || []).length, '基壳死规则残留').toBe(0);
    for (const dead of ['.lc-hd-l', '.lc-hd-ic', '.lc-hd-tt']) {
      expect(v.includes(dead), `死规则残留：${dead}`).toBe(false);
    }
    /* 活锚保留：CSS 规则+模板消费双锚 */
    expect(v).toMatch(/\.lc-hd-sub \{/);
    expect(v).toMatch(/\.lc-hd-r \{/);
    expect(v).toMatch(/class="lc-hd-sub"/);
    expect(v).toMatch(/class="lc-hd-r"/);
  });
});

describe('735 源码锁（四钮 spinning 家族+G124 回填补发字面锚）', () => {
  it('五刀字面在场：四钮 spinning/文案切换/守卫/回填显式补发', () => {
    const v = read('../views/LifecycleView.vue');
    expect(v).toContain('Search :size="12" :class="{ spinning: roPending === \'dry\' }"'); // G121 Dry Run
    expect(v).toContain('Rocket :size="12" :class="{ spinning: roPending === \'run\' }"'); // G121 执行
    expect(v).toContain('PlayCircle :size="12" :class="{ spinning: ilmOpPending }"'); // G122 Start
    expect(v).toContain('PauseCircle :size="12" :class="{ spinning: ilmOpPending }"'); // G122 Stop
    expect(v).toContain('FastForward :size="12" :class="{ spinning: mvPending }"'); // G123 推进
    expect(v).toContain("roPending === 'dry' ? '预检中…'"); // G121 文案切换
    expect(v).toContain("roPending === 'run' ? '执行中…'"); // G121 文案切换
    expect(v).toContain("mvPending ? '推进中…'"); // G123 文案切换
    expect(v).toContain('!rolloverAlias.trim() || roPending !== null'); // G121 守卫进 disabled
    expect(v).toContain('!moveIndex.trim() || mvPending'); // G123 守卫进 disabled
    expect(v).toMatch(/if \(roPending\.value\) return;/); // G121 入口防重入
    expect(v).toMatch(/if \(mvPending\.value\) return;/); // G123 入口防重入
    expect(v).toMatch(/function prefillCurStep\(/); // G124 共用预填函数
    expect(v).toContain('prefillCurStep(store.pickedIdx)'); // G124 回填处显式补发
  });
});
