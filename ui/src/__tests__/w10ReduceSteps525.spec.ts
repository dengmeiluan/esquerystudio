/**
 * 五百二十五批 W10：高频流减步 + 确认频次防呆 + 杂项收尾。
 *
 * ① confirm 机制契约（composables/confirm.ts + ConfirmModal.vue）：
 *    dismissable（仅 warn/info 显式开；critical/guardText 永不）→ 勾「本次会话不再询问」
 *    并确认 → 按 title 哈希写 sessionStorage（es_confirm_skip:<hash>）→ askConfirm 命中直接
 *    resolve true 不弹。缺省 false：存量调用点零行为变化。
 * ② SetupWizard Enter 一键串联：无测试结果 → doTest；已 ok → doApply
 *    （disabled 提交钮此前把 form 隐式提交静默吃掉）。
 * ③ WelcomeWizard 步 1 Enter=选中并前进（键盘连续性；鼠标点击仍仅选中）。
 * ④ AdhocRebuildView 六点源码锁：timeField 智能预填 / 步卡单行 input Enter=该步主钮 /
 *    .ar-diff 42vh 弹性 / 粘贴导入 JsonArea 弹性档 / .tbl th 回 600 基线 /
 *    .pi-pl sep 口径 .45 / .val-sev 退役统一 .pill / doAbort 开 dismissable。
 * ⑤ SqlConsoleView 三件：run 成功后台顺带 translate（试跑→落 DSL 2 击并 1 击）/
 *    执行钮 title 随态 / 空态「插入示例」action。
 * ⑥ AliasesView create 连续录入：成功面板保留、清输入重聚焦；execActions 返回成功与否。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

/* ───────────────────────── ① confirm 机制契约 ───────────────────────── */

let app: any = null;
const mountModal = async (props: Record<string, unknown> = {}) => {
  const { createApp, h, nextTick } = await import('vue');
  const Modal = (await import('../components/ConfirmModal.vue')).default;
  app = createApp({ render() { return h(Modal as any, { show: true, title: '中止重建作业', level: 'warn', ...props }); } });
  app.mount(document.createElement('div'));
  await nextTick();
};
const unmount = () => { if (app) { app.unmount(); app = null; } document.body.innerHTML = ''; };

const skipInput = () => document.querySelector('.cf-skip input[type="checkbox"]') as HTMLInputElement | null;

beforeEach(() => { unmount(); sessionStorage.clear(); });
afterEach(async () => {
  const { resolveConfirm } = await import('../composables/confirm');
  resolveConfirm(false); /* 清悬挂 resolver，防用例间串扰 */
  unmount();
  sessionStorage.clear();
});

describe('W10 确认频次防呆机制', () => {
  it('缺省 dismissable=false：不渲染 checkbox，存量调用点零行为变化', async () => {
    const { confirmState } = await import('../composables/confirm');
    expect(confirmState.dismissable).toBe(false);
    await mountModal({ title: '普通确认' });
    expect(skipInput(), '未开 dismissable 不得出现 checkbox').toBeNull();
  });

  it('critical / guardText 永不带 checkbox（即便调用方误传 dismissable）', async () => {
    await mountModal({ level: 'critical', guardText: 'old-index', dismissable: true });
    expect(skipInput(), 'critical+guardText 不得出现 checkbox').toBeNull();
    unmount();
    await mountModal({ level: 'critical', dismissable: true });
    expect(skipInput(), 'critical（无守卫降级 warn 视觉）同样不得出现 checkbox').toBeNull();
  });

  it('勾选并确认 → sessionStorage 写 es_confirm_skip:<hash>；askConfirm(dismissable) 命中直接 true 不弹', async () => {
    const mod = await import('../composables/confirm');
    await mountModal({ title: '中止重建作业', dismissable: true });
    const box = skipInput();
    expect(box, 'warn+dismissable 渲染 checkbox').not.toBeNull();
    box!.click();
    (document.querySelector('.cf-foot .btn:last-child') as HTMLElement).click();
    const key = 'es_confirm_skip:' + mod.confirmTitleHash('中止重建作业');
    expect(sessionStorage.getItem(key), '确认后才落 skip 键').toBe('1');
    expect(mod.isConfirmSkipped('中止重建作业')).toBe(true);
    await expect(mod.askConfirm({ title: '中止重建作业', dismissable: true })).resolves.toBe(true);
    expect(mod.confirmState.show, '命中 skip 不再弹窗').toBe(false);
  });

  it('勾选但取消 → 不写键；再确认弹窗 checkbox 每次重新置空', async () => {
    await mountModal({ title: '另一个动作', dismissable: true });
    skipInput()!.click();
    (document.querySelector('.cf-foot .btn:first-child') as HTMLElement).click(); /* 取消 */
    expect(sessionStorage.length, '取消不落键').toBe(0);
    const mod = await import('../composables/confirm');
    expect(mod.isConfirmSkipped('另一个动作')).toBe(false);
  });

  it('skip 键只被显式 dismissable 的调用消费：未开 dismissable 照常弹', async () => {
    const mod = await import('../composables/confirm');
    mod.rememberConfirmSkip('高危动作');
    const p = mod.askConfirm({ title: '高危动作' }); /* 未开 dismissable */
    expect(mod.confirmState.show, '存量调用（缺省 false）不被 skip 键短路').toBe(true);
    mod.resolveConfirm(false);
    await expect(p).resolves.toBe(false);
    await expect(mod.askConfirm({ title: '高危动作', dismissable: true })).resolves.toBe(true);
  });

  it('confirmTitleHash：同 title 同键、异 title 异键（djb2 base36）', async () => {
    const { confirmTitleHash } = await import('../composables/confirm');
    expect(confirmTitleHash('a')).toBe(confirmTitleHash('a'));
    expect(confirmTitleHash('a')).not.toBe(confirmTitleHash('b'));
  });
});

/* ───────────────────────── ② SetupWizard Enter 一键串联 ───────────────────────── */

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: {
        ...actual.api.setup,
        status: vi.fn(async () => ({ bound: false, mode: 'NONE', endpoint: null, appName: 't', hostVisible: true })),
        test: vi.fn(async () => ({ ok: true, clusterName: 'c1', version: '8.0.0' })),
        apply: vi.fn(async () => { throw new Error('已被并发绑定'); }), /* 成功会 reload，mock 走失败路径断言调用即可 */
      },
    },
  };
});

import { api } from '../api';

describe('W10 SetupWizard Enter 分派', () => {
  it('无测试结果 Enter→doTest；testResult.ok 后 Enter→doApply（键盘一键串联）', async () => {
    const { createApp, h, nextTick } = await import('vue');
    const Wizard = (await import('../components/SetupWizard.vue')).default;
    app = createApp({ render: () => h(Wizard) });
    app.mount(document.createElement('div'));
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    const urlInput = document.querySelector('.sw-ipt') as HTMLInputElement;
    expect(urlInput, '向导表单渲染').not.toBeNull();
    /* 先填地址（onSubmit 有空值守卫，与「测试连接」钮 disabled !url 同语义） */
    urlInput.value = 'http://es-host:9200';
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    const settle = () => new Promise(r => setTimeout(r, 0));
    /* 第一次 Enter：未测试 → 走 doTest */
    urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle(); await settle();
    expect(api.setup.test, 'Enter 触发测试连接').toHaveBeenCalledTimes(1);
    /* 测试成功后第二次 Enter：testResult.ok → 走 doApply */
    urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle(); await settle();
    expect(api.setup.apply, '已 ok 后 Enter 直接触发绑定').toHaveBeenCalledTimes(1);
    unmount();
    vi.mocked(api.setup.test).mockClear();
    vi.mocked(api.setup.apply).mockClear();
  });
});

/* ───────────────── ③④⑤⑥ 视图源码锁（键盘/CSS/减步落点逐一对位） ───────────────── */

describe('W10 视图落点源码锁', () => {
  it('WelcomeWizard：步 1 Enter=选中并前进（pickIdx）；鼠标 click 仍仅选中', () => {
    const v = read('components/WelcomeWizard.vue');
    expect(v).toContain('@click="chosenIdx = idx" role="button" tabindex="0" @keydown.enter.prevent="pickIdx(idx)"');
    expect(v).toMatch(/function pickIdx\(idx: string\) \{\s*chosenIdx\.value = idx;\s*next\(\);\s*\}/);
  });

  it('SetupWizard：submit 分派接线（form + 四 input，含可选首连令牌）', () => {
    const v = read('components/SetupWizard.vue');
    expect(v).toContain('<form @submit.prevent="onSubmit">');
    expect((v.match(/@keydown\.enter\.prevent="onSubmit"/g) ?? []).length).toBe(4);
    expect(v).toMatch(/if \(!testResult\.value\?\.ok\) void doTest\(\);\s*else void doApply\(\);/);
  });

  it('Adhoc：timeField 智能预填只盯 INCREMENTAL，不碰 WRITE_BLOCK 确认门', () => {
    const v = read('views/AdhocRebuildView.vue');
    expect(v).toMatch(/if \(strategy\.value !== 'INCREMENTAL' \|\| timeField\.value\) return;/);
    expect(v).toMatch(/const first = prep\.value\?\.timeFieldCandidates\?\.\[0\]\?\.field;/);
    /* 确认门语义原样：needAckFullBlock 仍要求 WRITE_BLOCK 且无 timeField */
    expect(v).toContain("const needAckFullBlock = computed(() => strategy.value === 'WRITE_BLOCK' && !timeField.value);");
  });

  it('Adhoc：步卡单行 input Enter=该步主钮（守卫与主钮 disabled 对应）', () => {
    const v = read('views/AdhocRebuildView.vue');
    expect(v).toContain('@keydown.enter="destIndexEnter"');
    expect(v).toContain('@keydown.enter="strategyNextEnter"');
    expect(v).toMatch(/function destIndexEnter\(\) \{\s*if \(!validating\.value\) void doValidateConfig\(true\);/);
    expect(v).toMatch(/function strategyNextEnter\(\) \{\s*if \(\(strategy\.value !== 'INCREMENTAL' \|\| !!timeField\.value\) && canStart\.value\) step\.value = 3;/);
  });

  it('Adhoc CSS：.ar-diff 42vh 弹性档 / 粘贴导入 JsonArea 弹性 wrapper / th 回 600 基线 / sep .45 / .val-sev 退役', () => {
    const v = read('views/AdhocRebuildView.vue');
    expect(v).toContain('max-height: max(240px, 42vh);');
    expect(v).not.toContain('max-height: 320px');
    /* 五百五十八批同步更新：粘贴导入弹窗定高字面退役→adhoc.piH 四档 useTierCycle（:style 绑定，
       默认档 min(60vh,600px) 与原定高零漂移） */
    expect(v).toContain(':style="{ height: piH }"');
    expect(v).toContain("'min(60vh, 600px)'");
    expect(v).toContain('<JsonArea');
    expect(v).not.toContain(':rows="12"');
    /* th 字重回全局 600 基线：页内不再覆写 400（554 同步更新：padding 8px 收 var(--sp-2)，5px 奇数保字面） */
    expect(v).toMatch(/\.tbl th \{ text-align: left; padding: 5px var\(--sp-2\); color: var\(--tx2\); border-bottom: 1px solid var\(--line\); \}/);
    expect(v).not.toContain('font-weight: 400; border-bottom');
    expect(v).toContain("content: '· '; opacity: .45;");
    /* .val-sev 类定义与模板引用均已退役（注释里的退役说明可提及字样） */
    expect(v).not.toContain('.val-sev {');
    expect(v).not.toContain('class="val-sev"');
    /* 五百三十一批同步更新：severity 手滚 .pill+sevPill 改用 StatusPill（sevZh 中文主体+en 英文小字；
       tone 色档经 sevTone 字面量收窄，口径 err→r/warn→y/info→b 不变） */
    expect(v).toContain('<StatusPill :tone="sevTone(iss.severity)" :label="sevZh(iss.severity)" :en="iss.severity" />');
    /* 五百二十五批 W4：sevPill 收口 utils/esEnumZh（error→r / warn→y / info→b / 兜底 n），
       本地实现体退役——同步更新锁 import 接线与不回潮。
       五百二十八批：jobStatusZh 状态中文接线走独立 import 行，本行锁形不变 */
    expect(v).toContain("import { sevPill } from '../utils/esEnumZh'");
    expect(v).not.toMatch(/function sevPill\(/);
  });

  it('Adhoc：doAbort 开 dismissable（全站首批）；critical 确认门零触碰', () => {
    const v = read('views/AdhocRebuildView.vue');
    const abortBlock = v.slice(v.indexOf("title: '中止重建作业'"), v.indexOf("title: '中止重建作业'") + 260);
    expect(abortBlock).toContain('dismissable: true');
    expect(v).toMatch(/level: 'critical',\s*title: '将删除旧物理索引'/);
  });

  it('SqlConsole：run 成功后台顺带 translate / 执行钮 title 随态 / 空态插入示例', () => {
    const v = read('views/SqlConsoleView.vue');
    /* 1071：translate 与执行共用同一份 body 快照（含 params），避免 await 期间改稿串味 */
    /* 1386：body 改用 execSql（execSnapshot 的补引号版本，无改动时逐字相同）——
       translate 与执行仍共用同一份 body 快照。 */
    expect(v).toContain('const body = buildBody(execSql);');
    expect(v).toContain('void api.sqlTranslate(withoutColumnar(body)).then(r => {');
    expect(v).toContain(":title=\"sql.trim() ? (selScope ? '仅执行选中的 ' + selScope.lines + ' 行（' + execHint + '）；清除选区后执行整篇' : (multiStmt ? '仅执行光标所在语句（第 ' + cursorStmtNo + ' 条 / 共 ' + stmtScopes.length + ' 条；' + execHint + '）；选中一段可只跑选段' : '执行（' + execHint + '）')) : '请输入 SQL 语句'\"");
    expect(v).toContain('action-text="插入示例" @action="loadSample"');
  });

  it('AliasesView：create 连续录入（面板保留+清输入+重聚焦）；switch/unbind 行为不变', () => {
    const v = read('views/AliasesView.vue');
    expect(v).toMatch(/opts\?: \{ stayOpen\?: boolean \}/);
    expect(v).toMatch(/if \(!opts\?\.stayOpen\) panel\.value = null;/);
    expect(v).toContain("execActions([{ add }], `别名 ${add.alias} → ${add.index} 已创建`, { stayOpen: true })");
    expect(v).toMatch(/cAlias\.value = ''; cWrite\.value = false; cRouting\.value = ''; cFilter\.value = '';/);
    expect(v).toContain('cAliasEl.value?.focus();');
    /* 五百二十七批：inplace 定位合并 theme.css .float-pop.inplace 基座档——scoped 拷贝退役
       （HealthReportView .hr-pop.inplace 合并先例；基座在场由 themeDiscipline525 正面锚看守） */
    expect(v, '.alv-pop.inplace scoped 拷贝必须退役（归 theme.css 基座）').not.toMatch(/\.alv-pop\.inplace\s*\{/);
  });

  it('confirm 机制：ConfirmModal 契约（checkbox 渲染条件 / 确认时落键）', () => {
    const v = read('components/ConfirmModal.vue');
    const ts = read('composables/confirm.ts');
    expect(v).toContain("computed(() => !!props.dismissable && props.level !== 'critical' && !props.guardText)");
    expect(v).toContain('if (canDismiss.value && skipForever.value) rememberConfirmSkip(props.title);');
    expect(ts).toContain("es_confirm_skip:");
    expect(ts).toContain('if (opts.dismissable && isConfirmSkipped(opts.title)) return Promise.resolve(true);');
  });
});
