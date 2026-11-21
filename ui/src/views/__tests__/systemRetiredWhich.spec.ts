/**
 * 台账 #72（存疑 #2 裁定后修复）：系统索引页的死 tab 与老书签回落契约。
 *
 * 事故现场：R93 阶段⑤ 删掉 job/audit 两张系统索引后，SystemView 的 WHICHS 仍列三个 tab，
 * 且 useUrlState('which', 'job') 的默认值就是已退役的 job。
 * 实测后端 EsIndexRebuildService.systemIndexName() 对非 lock 抛 IllegalArgumentException，
 * 经 InternalEsRebuildExceptionAdvice 映射为 400 BAD_REQUEST（不是 500，实测非推定）：
 *   which=job   -> 400 {code=BAD_REQUEST, message=which 参数必须为 lock，实际=job}
 *   which=audit -> 400 同上
 * 即：打开系统索引页，默认落在死 tab 上，一进来就吃两个 400。
 *
 * 契约：
 *   1) 默认（无 ?which=）进入 -> 落在 lock，且发出的请求参数只能是 lock（绝不能是 job/audit）
 *   2) ?which=job / ?which=audit -> 就地回落 lock + 出现退役说明，且不得把 job/audit 透传给后端
 *   3) 退役说明只陈述事实，不许出现「失败/错误/出错」——它没有失败，是不存在了
 *   4) 正向对照：?which=lock 确实发出了请求（证明「没发 job 请求」不是因为整个页面没动）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 记录所有打到后端的 which 值——契约的核心证据 */
const calls: { fn: string; which: string }[] = [];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      systemInspect: (which: string) => {
        calls.push({ fn: 'systemInspect', which });
        return Promise.resolve({ name: 'idx_' + which, docCount: 0 });
      },
      systemQuery: (which: string) => {
        calls.push({ fn: 'systemQuery', which });
        return Promise.resolve({ total: 0, took: 1, hits: [] });
      },
    },
  };
});

/* Monaco 在 happy-dom 下起不来，且与本契约无关 */
vi.mock('../../components/MonacoEditor.vue', () => ({
  default: { name: 'MonacoEditor', props: ['modelValue'], template: '<div class="monaco-stub" />' },
}));

import SystemView from '../SystemView.vue';

async function mountAt(hash: string) {
  location.hash = hash;
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: SystemView }],
  });
  const app = createApp({ render: () => h(SystemView) });
  app.use(createPinia());
  app.use(router);
  await router.isReady();
  const host = document.createElement('div');
  app.mount(host);
  await settle();
  return { app, host, router };
}

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  location.hash = '';
});

describe('#72 系统索引页：退役 tab 不许把死值透传给后端', () => {
  it('默认进入（无 ?which=）→ 只请求 lock，绝不请求 job/audit', async () => {
    const { app } = await mountAt('#/system');
    expect(calls.length, '默认进入恰好一轮 inspect+query').toBe(2);
    expect(calls.every(c => c.which === 'lock')).toBe(true);
    expect(calls.some(c => c.which === 'job' || c.which === 'audit')).toBe(false);
    app.unmount();
  });

  it('?which=job（老书签）→ 回落 lock，后端只收到 lock', async () => {
    const { app, host } = await mountAt('#/system?which=job');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some(c => c.which === 'job')).toBe(false);   // 死值没被透传
    expect(calls.every(c => c.which === 'lock')).toBe(true);
    expect(host.textContent).toContain('已在 2.0.0 退役');
    app.unmount();
  });

  it('?which=audit（老书签）→ 回落 lock + 退役说明点名该视图', async () => {
    const { app, host } = await mountAt('#/system?which=audit');
    expect(calls.some(c => c.which === 'audit')).toBe(false);
    expect(calls.every(c => c.which === 'lock')).toBe(true);
    /* 锚收窄到 .sy-retired 内文本：「写操作审计」在全仓另有出处（CmdPalette 等），
       用整页 textContent 当锚，日后别处出现同形文本就会假绿 */
    const note = host.querySelector('.sy-retired');
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain('写操作审计');
    expect(note!.textContent).toContain('已为你切到');
    app.unmount();
  });

  it('退役说明只陈述事实，不许谎报「失败/错误」', async () => {
    const { app, host } = await mountAt('#/system?which=job');
    const txt = host.textContent || '';
    expect(txt).toContain('已在 2.0.0 退役');
    for (const lie of ['加载失败', '查询失败', '出错', '错误']) {
      expect(txt).not.toContain(lie);
    }
    app.unmount();
  });

  /* 正向对照：证明上面的「没请求 job」不是因为页面根本没发请求 */
  it('对照组：?which=lock 确实发出了 lock 请求（对照是活的）', async () => {
    const { app } = await mountAt('#/system?which=lock');
    expect(calls.some(c => c.which === 'lock')).toBe(true);
    expect(calls.some(c => c.fn === 'systemInspect')).toBe(true);
    app.unmount();
  });
});

describe('#72 源码级防回退：死 tab 不许再长回来', () => {
  const src = readFileSync(join(__dirname, '..', 'SystemView.vue'), 'utf8');

  it('WHICHS 只剩 lock（job/audit 不再是可选 tab）', () => {
    const m = src.match(/const WHICHS = \[([\s\S]*?)\] as const;/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain("k: 'lock'");
    expect(m![1]).not.toContain("k: 'job'");
    expect(m![1]).not.toContain("k: 'audit'");
  });

  /* 评审建议改成运行时值断言。实测两层都能抓住「默认值改成另一个活 tab」（变异 E），
     但源码断言是唯一「字面陈述契约」的那条，且默认值退化时运行时断言会被回落逻辑
     掩盖（变异 1 实证）。故两条都留：合法重构成 DEFAULT_WHICH 常量时源码断言会假红，
     但假红比静默放过好，且改一行即可。 */
  it('useUrlState 默认值字面量是 lock，不是已退役的 job', () => {
    expect(src).toMatch(/useUrlState\('which',\s*'lock'\)/);
    expect(src).not.toMatch(/useUrlState\('which',\s*'job'\)/);
  });

  it('面向用户的文案不再宣称有 job/audit 两张表（intro 与空态各一处）', () => {
    /* 变异实测：只改代码不钉文案时，把空态文案改回「作业 / 审计 / 锁」12 条全绿 ——
       与样式契约同类的「零看守」。这里把两处文案一并钉住。 */
    const tmpl = src.slice(0, src.indexOf('</template>'));
    expect(tmpl).not.toContain('作业 / 审计 / 锁');
    expect(tmpl).not.toContain('重建作业进度、ES 写操作审计流水');
    // 「按时间倒序」对 lock 不成立（WHICHS.lock 的 sort 为空、DEFAULT_DSL.lock 无 sort）
    expect(tmpl).not.toContain('按时间倒序');
  });

  it('DEFAULT_DSL 不再残留 job/audit 的模板', () => {
    const m = src.match(/const DEFAULT_DSL[\s\S]*?\n\};/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/^\s*job:/m);
    expect(m![0]).not.toMatch(/^\s*audit:/m);
  });
});

/**
 * 真机漏网补丁：单测最初只覆盖「首次挂载即带 ?which=job」，
 * 而真实用户是在 SPA 内从别处跳到老书签 —— 组件被复用、setup 不重跑，
 * 回落只改了 which（lock→job→lock 绕回原值），不触发任何 watcher，
 * 结果页面一发请求都没有、停在空白。这条锁死「回落后必须把数据重新拉起来」。
 */
describe('#72 SPA 内跳老书签：回落后必须重新拉数据（真机漏网）', () => {
  it('已挂载状态下 URL 变成 ?which=job → 回落 lock 并重新发起请求', async () => {
    const { app, router } = await mountAt('#/system');
    const before = calls.length;
    expect(before).toBeGreaterThan(0);

    /* 真实 SPA 内跳转走 router，而不是手改 location.hash */
    await router.push('/system?which=job');
    await settle();

    const after = calls.slice(before);
    expect(after.length, 'SPA 内跳老书签重拉恰好一轮，不是两轮').toBe(2);
    expect(after.every(c => c.which === 'lock')).toBe(true);
    expect(after.some(c => c.which === 'job')).toBe(false);
    app.unmount();
  });
});

/**
 * 评审必修 #1：样式契约此前零看守 —— 把 class 换成 err-bar、文案一字不改，9 条全绿。
 * 任务原文要求「中性 .sy-retired 而非 .err-bar（染成错误红是另一种谎报）」。
 * 正反各一半：只断言「带 sy-retired」的话，额外再加个 err-bar 照样过。
 */
describe('#72 退役提示的样式契约（不许染成错误红）', () => {
  it('退役提示节点带 .sy-retired，且不带 .err-bar', async () => {
    const { app, host } = await mountAt('#/system?which=job');
    const note = host.querySelector('.sy-retired');
    expect(note, '退役提示必须挂在 .sy-retired 上').toBeTruthy();
    expect(note!.textContent).toContain('已在 2.0.0 退役');
    // 反向那半：这个节点不许同时挂错误色类
    expect(note!.classList.contains('err-bar'), '退役提示不是错误，不许用 err-bar 染红').toBe(false);
    // 整页也不该因为「退役」而冒出错误条
    expect(host.querySelector('.err-bar'), '退役场景不该出现任何 .err-bar').toBeNull();
    app.unmount();
  });
});

/**
 * 评审必修 #2：完整失效域。
 * useUrlState 的 writeBack 在「值 === 默认值」时删掉 query key，而默认值就是 lock，
 * 故每次回落后 URL 都变回裸 /system。此时再 push 同一个老书签，
 * route.query.which 与当前值相同 -> router 视作无变化 -> 整条反应式链全哑。
 * 失效域 = 「push 的 which 等于 route.query.which 当前值」，与 job/audit 无关。
 * 下面把评审那五步逐步钉住，每步都断言实际请求列表。
 */
describe('#72 连点同一老书签：完整失效域', () => {
  it('五步序列每一步都必须重新拉到 lock 的数据（含连点）', async () => {
    /* 断言的是「恰好 2 发」而不是「>0」：重复请求在功能上看起来完全正常
       （每发都打到 lock、页面也有数据），只有锚条数才照得出来。
       本轮实测：afterEach 与 watch(which) 两条路径都调 reloadAll() 时这里是 4 发。 */
    const { app, router } = await mountAt('#/system');
    const step = async (to: string) => {
      calls.length = 0;
      await router.push(to);
      await settle();
      return calls.slice();
    };

    const s1 = await step('/system?which=job');
    expect(s1.length, '第1次 ?which=job 应重拉恰好一轮（inspect+query=2）').toBe(2);
    expect(s1.every(c => c.which === 'lock')).toBe(true);

    // 关键：连点同一个老书签（此前这里是 []）
    const s2 = await step('/system?which=job');
    expect(s2.length, '连点同一个 ?which=job 仍必须重拉恰好一轮（此前为空白）').toBe(2);
    expect(s2.every(c => c.which === 'lock')).toBe(true);

    const s3 = await step('/system?which=audit');
    expect(s3.length, '换成 ?which=audit 应重拉恰好一轮').toBe(2);
    expect(s3.every(c => c.which === 'lock')).toBe(true);

    const s4 = await step('/system?which=audit');
    expect(s4.length, '连点同一个 ?which=audit 仍必须重拉恰好一轮').toBe(2);
    expect(s4.every(c => c.which === 'lock')).toBe(true);

    // 全程都不许把死值透传出去
    for (const s of [s1, s2, s3, s4]) {
      expect(s.some(c => c.which === 'job' || c.which === 'audit')).toBe(false);
    }
    app.unmount();
  });

  it('回到活着的视图后，上一次的退役提示必须撤掉（不许挂着陈提示）', async () => {
    const { app, host, router } = await mountAt('#/system?which=job');
    expect(host.textContent).toContain('已在 2.0.0 退役');
    await router.push('/system?which=lock');
    await settle();
    expect(host.querySelector('.sy-retired'), '显式回到 lock 后退役提示应消失').toBeNull();
    app.unmount();
  });
});
