import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, defineComponent, h } from 'vue';
import { friendlyEsError } from '../utils/esError';
import { permDeniedAdvice } from '../utils/esErrorAdvice';
import { errMeta, errPreHtml } from '../utils/errPre';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { ApiError } from '../api';

/* 五百五十六批 轨5（自适应与全栈·残面清零）：
 *  ① @media 全仓分类裁决反锁——独占文件（theme.css/App.vue/TopBar/EmptyState/SkeletonBox）
 *     现存 9 处 @media 全部定性：4 处 prefers-reduced-motion 豁免 + 5 处布局档互锚
 *     （901 补集锁步 responsiveGuard239 锚④ / 900 全站窄容器档 / 1920 超宽居中 queryWorkbenchW1
 *     逐字锚 / TopBar 1100·1000 adaptiveFullstack550 逐字锚、BP_STACK·BP_COMPACT 与
 *     utils/layout.ts 断点常量单源互锚）。容器查询迁移否决：断 JS↔CSS 锁步单源约定
 *     （layout.ts:5-9），且 TopBar/App 是视口级 chrome 非内容容器。此处锁计数恒定，
 *     新增 @media 必须先过分类裁决再改本 spec。
 *  ② --sp 残量合并：theme.css 精确等值（4/8/12/16/24 与半档 2/6/10）px 收 var(--sp-*)；
 *     刻意值（34px 空态契约/14px 垂直留白/奇数微调/1px 微衬）保字面；三行逐字锁
 *     （.kbd.inline=kbdUnify429、.chip.xs=themeDiscipline525、.focus-tools=focusVisual451）不收。
 *  ③ 错误体消费面：HTTP 401/403/404/409/502 映射补位（KNOWN 尾部追加——ES error.type
 *     同串共存时叶叶优先）；errMeta/errPreHtml/permDeniedAdvice 既有契约反锁。
 *     trace 提取审计结论：后端信封（EsErrorMapper.body）无 trace 字段可提，宿主
 *     GlobalWebExceptionHandler 的 traceId 拍平路径已在源头被 EsErrorMapper 挡住——无缺口。
 *  ④ useAutoRefresh 语义复核：11 消费面 setOn(true) 逐点核查结论——10 面合规
 *     （watches→restart 或逐 load restart 或 setOn(v>0)）；XmigrateView 违例备案
 *     （ms getter 动态依赖 RUNNING 态但 loadJobs/doResume 后无 restart，首 RUNNING 跃迁
 *     后轮询不启动——消费面在 views 黑名单，只备案不改）。本 describe 反锁 composable
 *     侧契约（0=不启动/隐藏页短路/卸载停表/restart 重估 ms）——契约本身零缺口。 */

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

describe('五百五十六批 ①：@media 分类裁决反锁（独占文件，783 批后 8 处恒定）', () => {
  it('theme.css 恰 3 处：901 补集锁步锚 + 2 处 reduced-motion 豁免（900 全站档 783 随 R66 兜底族退役）', () => {
    const s = srcOf('theme.css');
    expect([...s.matchAll(/@media/g)].length, '新增/移除 @media 必须先过分类裁决并改本计数（783 批：R66 窄容器表横滚兜底 @media 整块退役——两规则恒空匹配，theme.css 4→3）').toBe(3);
    expect(s).toContain('@media (min-width: 901px)'); // responsiveGuard239 锚④ 锁步补集（布局锚；901 补集=IndexSettings hint 桌面档，活）
    expect(s).not.toContain('@media (max-width: 900px)'); // BP_NARROW 全局档 783 批退役（视图级 scoped 900 档不受影响；themeDeadFamilies783 看守）
    expect(s.match(/@media \(prefers-reduced-motion: reduce\)/g)!.length).toBe(2); // 豁免
  });

  it('App.vue 恰 1 处：min-width:1920 超宽居中档（queryWorkbenchW1 逐字锚）', () => {
    const s = srcOf('App.vue');
    expect([...s.matchAll(/@media/g)].length).toBe(1);
    expect(s).toContain('@media (min-width: 1920px)');
  });

  it('TopBar.vue 恰 2 处：1100（BP_STACK 互锚）+ 1000（BP_COMPACT 同值档）', () => {
    const s = srcOf('components/TopBar.vue');
    expect([...s.matchAll(/@media/g)].length).toBe(2);
    expect(s).toContain('@media (max-width: 1100px)');
    expect(s).toContain('@media (max-width: 1000px)');
    expect(s).toContain('1100 档与 utils/layout BP_STACK 互锚');
  });

  it('EmptyState/SkeletonBox 各恰 1 处 reduced-motion 豁免；全仓无 prefers-color-scheme/print @media', () => {
    expect([...srcOf('components/EmptyState.vue').matchAll(/@media/g)].length).toBe(1);
    expect(srcOf('components/EmptyState.vue')).toContain('@media (prefers-reduced-motion: reduce)');
    expect([...srcOf('components/SkeletonBox.vue').matchAll(/@media/g)].length).toBe(1);
    expect(srcOf('components/SkeletonBox.vue')).toContain('@media (prefers-reduced-motion: reduce)');
    /* JS 侧 matchMedia('(prefers-color-scheme…)')（stores/app.ts 主题 auto 档）是合法 JS 判据，
       CSS @media 形态全仓应为零——出现即新裁决面 */
    expect(srcOf('theme.css')).not.toContain('@media (prefers-color-scheme');
    expect(srcOf('theme.css')).not.toContain('@media print');
  });
});

describe('五百五十六批 ②：theme.css --sp 精确等值合并（刻意值与逐字锁保字面）', () => {
  it('档位等值行已收 var(--sp-*)（混合行非档位刻值保字面）', () => {
    const s = srcOf('theme.css');
    expect(s, '.tbl th 8px/10px').toMatch(/\.tbl th \{[^}]*padding: var\(--sp-2\) var\(--sp-2h\);/);
    expect(s, '.tbl td 7px 刻意/10px 等值').toMatch(/\.tbl td \{ padding: 7px var\(--sp-2h\);/);
    expect(s, '.chip 2px 等值/9px 奇数刻意').toMatch(/\.chip \{[^}]*padding: var\(--sp-0\) 9px;/);
    expect(s, '.pill 1.5px 刻意/8px 等值').toMatch(/\.pill \{[^}]*padding: 1\.5px var\(--sp-2\);/);
    expect(s, '.btn 5px 刻意/12px 等值').toMatch(/\.btn \{[^}]*padding: 5px var\(--sp-3\);/);
    expect(s, '.btn.sm 3px 刻意/8px 等值').toMatch(/\.btn\.sm \{ padding: 3px var\(--sp-2\);/);
    expect(s, '.btn.xs 2px/6px 双等值').toMatch(/\.btn\.xs \{ padding: var\(--sp-0\) var\(--sp-1h\);/);
    expect(s, '.btn.xxs 6px 等值').toMatch(/\.btn\.xxs \{ padding: 0 var\(--sp-1h\);/);
    expect(s, '.inp/.ipt 6px/10px 双等值').toMatch(/\.inp, \.ipt \{[^}]*padding: var\(--sp-1h\) var\(--sp-2h\);/);
    expect(s, '.seg 三处 2px').toMatch(/\.seg \{ display: inline-flex; flex-wrap: wrap; row-gap: var\(--sp-0\); background: var\(--bg2\); border: 1px solid var\(--line\); border-radius: var\(--r-m\); padding: var\(--sp-0\); gap: var\(--sp-0\); \}/);
    expect(s, '.seg button 4px/12px 双等值').toMatch(/\.seg button \{[^}]*padding: var\(--sp-1\) var\(--sp-3\);/);
    expect(s, '.empty 34px 契约保字面/16px·8px 等值').toMatch(/\.empty \{ padding: 34px var\(--sp-4\);[^}]*gap: var\(--sp-2\); \}/);
    expect(s, '.err-bar 10px×3 等值/14px 刻意保字面').toMatch(/\.err-bar \{ display: flex; align-items: center; gap: var\(--sp-2h\); padding: var\(--sp-2h\) 14px; margin-bottom: var\(--sp-2h\);/);
    expect(s, '.il-hint 4px 等值').toMatch(/\.il-hint \{ margin-top: var\(--sp-1\);/);
    expect(s, '.toast-undo 12px/2px/10px').toMatch(/\.toast-undo \{ margin-left: var\(--sp-3\);[^}]*padding: var\(--sp-0\) var\(--sp-2h\);/);
    expect(s, '.toast-acts 8px/12px').toMatch(/\.toast-acts \{ display: inline-flex; align-items: center; gap: var\(--sp-2\); margin-left: var\(--sp-3\); \}/);
    expect(s, '.kbd-mini 4px').toMatch(/\.kbd-mini \{ font-family: var\(--mono\); font-size: var\(--fs-2xs\); padding: 0 var\(--sp-1\);/);
    expect(s, '.toolrow 6px/4px').toMatch(/\.toolrow \{ display: flex; gap: var\(--sp-1h\); align-items: center; flex-wrap: wrap; row-gap: var\(--sp-1\); \}/);
  });

  it('compact 密度档等值合并（3px 刻意保字面）', () => {
    const s = srcOf('theme.css');
    expect(s).toMatch(/\[data-density="compact"\] \.tbl th \{ padding: var\(--sp-1\) var\(--sp-2\);/);
    expect(s).toMatch(/\[data-density="compact"\] \.tbl td \{ padding: 3px var\(--sp-2\);/);
    expect(s).toMatch(/\[data-density="compact"\] \.card \{ padding: var\(--sp-2h\) var\(--sp-3\); \}/);
    expect(s).toMatch(/\[data-density="compact"\] \.card-t \{ margin-bottom: var\(--sp-1h\); \}/);
    expect(s).toMatch(/\[data-density="compact"\] \.btn\.sm \{ padding: var\(--sp-0\) var\(--sp-1h\);/);
  });

  it('逐字锁三行不合并（kbdUnify429/themeDiscipline525/focusVisual451 锚定保字面）', () => {
    const s = srcOf('theme.css');
    expect(s).toMatch(/\.kbd\.inline \{ display: inline-block; padding: 1px 4px; font-size: var\(--fs-xs\); background: var\(--hl\); border-radius: 2px; margin-left: 3px; \}/);
    expect(s).toMatch(/\.chip\.xs\s*\{\s*padding:\s*1px 6px;\s*border-radius:\s*var\(--r-s\);\s*\}/);
    expect(s).toContain('.focus-tools { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-bottom: 8px; }');
  });

  it('其余独占文件零可收 px（EmptyState 34px 契约/5px 奇数、SkeletonBox/App/TopBar 已零残量）', () => {
    const es = srcOf('components/EmptyState.vue');
    expect(es).toMatch(/padding: 34px var\(--sp-4\)/); // 契约首值保字面（emptyStatePadding 看守）
    expect(es).toMatch(/gap: 5px;/); // es-compact 奇数刻意
    for (const f of ['components/SkeletonBox.vue', 'components/TopBar.vue', 'App.vue']) {
      const s = srcOf(f);
      const hits = [...s.matchAll(/(?:padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;}]+)/g)]
        .filter(m => /(?:^|[^-\w.,])(?:2|4|6|8|10|12|16|24|32)px/.test(m[1]) && !m[1].includes('calc('));
      expect(hits, `${f} 出现档位裸 px（应收 var(--sp-*) 或备案）`).toEqual([]);
    }
  });

  it('五百五十七批扩锚：components 三件 --sp 精确等值合并（同行刻意值保字面同步更新在册）', () => {
    const li = srcOf('components/LuceneInput.vue');
    expect(li, '.li-inp 6px/10px 双等值').toMatch(/\.li-inp \{[^}]*padding: var\(--sp-1h\) var\(--sp-2h\);/);
    /* 560 同步更新：.li-syntax/.li-item 横向 8px/10px 精确等值收 var(--sp-2)/var(--sp-2h)
       （spSweep545 头注③整文件保字面备案修订合并），gap:5px 与 3px/5px 纵向仍保字面 */
    expect(li, '.li-syntax margin-top 4px 等值；gap:5px/3px 纵向保字面，8px 横向已收 sp-2')
      .toMatch(/\.li-syntax \{ display: flex; align-items: center; gap: 5px; margin-top: var\(--sp-1\); padding: 3px var\(--sp-2\);/);
    expect(li, '.li-hint 12px/10px 双等值').toMatch(/\.li-hint \{ padding: var\(--sp-3\) var\(--sp-2h\);/);
    expect(li, '.li-item 5px 纵向保字面，10px 横向已收 sp-2h').toMatch(/\.li-item \{ display: flex; align-items: center; gap: var\(--sp-2\); padding: 5px var\(--sp-2h\); cursor: pointer; \}/);
    expect(srcOf('components/QueryHistoryPanel.vue'), '.qhp-empty 34px 空态契约保字面/16px 等值（flattenWave554 st-list-empty 先例，spSweep538 抽查锚同步更新）')
      .toMatch(/\.qhp-empty \{ padding: 34px var\(--sp-4\);/);
    expect(srcOf('components/ExplainTree.vue'), '.xt-row 6px 等值/3px 微衬与 calc 链保字面')
      .toMatch(/\.xt-row \{[^}]*padding: 3px var\(--sp-1h\) 3px calc\(6px \+ var\(--xt-depth\) \* 14px\);/);
    expect(srcOf('components/builder/ClauseNode.vue'), '.cn 4px/8px→sp-1/sp-2 与 margin-bottom 2px→sp-0 三等值收官（全站最后一处精确等值 --sp 残量）')
      .toMatch(/\.cn \{ display: flex; flex-wrap: wrap; gap: var\(--sp-2\); align-items: center; padding: var\(--sp-1\) var\(--sp-2\); border-radius: var\(--r-m\); margin-bottom: var\(--sp-0\);/);
  });
});

describe('五百五十六批 ③：错误体消费面——HTTP 状态映射（401/403/404/409/502）', () => {
  it('HTTP 401 → 凭证失效指引', () => {
    const out = friendlyEsError('HTTP 401');
    expect(out).toContain('凭证');
    expect(out).toContain('重新登录');
  });
  it('HTTP 403 → 权限不足指引', () => {
    const out = friendlyEsError('HTTP 403');
    expect(out).toContain('权限不足');
    expect(out).toMatch(/管理员|切换.*账号/);
  });
  it('HTTP 404 → 资源不存在指引', () => {
    const out = friendlyEsError('HTTP 404');
    expect(out).toContain('不存在');
  });
  it('HTTP 409 → 冲突指引', () => {
    const out = friendlyEsError('HTTP 409');
    expect(out).toContain('冲突');
  });
  it('HTTP 502 → 上游 ES 不可达指引', () => {
    const out = friendlyEsError('HTTP 502');
    expect(out).toContain('不可达');
  });
  it('位置约定：ES error.type 同串共存时叶叶优先（HTTP 档列 KNOWN 尾不抢翻译）', () => {
    const raw = 'ResponseException: method [POST], host [http://10.0.0.1:9200], URI [/idx/_delete_by_query], '
      + 'status line [HTTP/1.1 502 Bad Gateway] {"error":{"root_cause":[{"type":"circuit_breaking_exception",'
      + '"reason":"Parent circuit breaker is open"}]}}';
    const out = friendlyEsError(raw);
    expect(out).toContain('熔断');
    expect(out).not.toContain('不可达');
  });
  it('既有行为不回退：网络层翻译与 _explain 404 结构化判据仍在前位', () => {
    expect(friendlyEsError('inspect 失败: Failed to fetch')).toContain('网络请求失败');
    const r102 = '诊断失败: ResponseException: method [POST], host [http://10.68.24.5:9200], '
      + 'URI [/idx/_explain/1], status line [HTTP/1.1 404 Not Found] '
      + '{"_index":"idx","_type":"_doc","_id":"1","matched":false}';
    expect(friendlyEsError(r102)).toContain('_explain 只能解释');
  });
});

describe('五百五十六批 ③b：错误消费面既有契约反锁（errMeta/errPreHtml/permDeniedAdvice）', () => {
  it('errMeta：ApiError 读 code/endpoint；普通 Error/字符串/null 出空 meta', () => {
    const e = new ApiError(409, '锁定冲突', 'LOCK_CONFLICT', 'POST /internal/es/index/rebuild');
    expect(errMeta(e)).toEqual({ code: 'LOCK_CONFLICT', endpoint: 'POST /internal/es/index/rebuild' });
    expect(errMeta(new Error('plain'))).toEqual({});
    expect(errMeta('str')).toEqual({});
    expect(errMeta(null)).toEqual({});
  });
  it('errPreHtml：code/endpoint 过 escHtml（XSS 面锁死），空 meta 与单参形态一致', () => {
    const html = errPreHtml('boom', { code: '<script>alert(1)</script>', endpoint: 'GET /a<b>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(errPreHtml('boom')).toBe(errPreHtml('boom', {}));
  });
  it('permDeniedAdvice：403 ApiError 补出路；CONN_FORBIDDEN 友好文案不再双拼（无误伤）', () => {
    const denied = permDeniedAdvice(new ApiError(403, '无权执行', undefined, undefined));
    expect(denied).toContain('角色不足');
    const conn = permDeniedAdvice(new ApiError(403,
      '当前角色无权访问该集群连接（需 OPERATOR 及以上），请联系管理员调整连接的最低角色或切换其他集群目标',
      'CONN_FORBIDDEN', undefined));
    expect(conn).not.toContain('角色不足'); // 已带出路指引，二次拼接是噪音
    expect(permDeniedAdvice(new ApiError(409, '版本冲突', undefined, undefined))).toBe('版本冲突'); // 非权限类透传
  });
});

describe('五百五十六批 ④：useAutoRefresh 语义复核（composable 契约反锁；消费面违例备案见头注）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  function mountAutoRefresh(msGetter: () => number) {
    let api: ReturnType<typeof useAutoRefresh> | undefined;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const fn = vi.fn();
    const app = createApp(defineComponent({
      setup() {
        api = useAutoRefresh(fn, { ms: msGetter });
        return () => h('div');
      },
    }));
    app.mount(el);
    return { fn, api: api!, stop: () => app.unmount() };
  }

  it('契约「0=不启动」：ms=0 时 setOn(true) 只翻意图不排表（tick 不触发）', () => {
    const { fn, api } = mountAutoRefresh(() => 0);
    api.setOn(true);
    expect(api.on.value).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('ms>0 开局即跑：setOn(true) 排表按当前 ms 逐轮触发', () => {
    const { fn, api } = mountAutoRefresh(() => 1000);
    api.setOn(true);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('动态 ms 变更须调用方重触发（restart/setOn）——XmigrateView 违例即本契约的消费者侧缺口', () => {
    let ms = 1000;
    const { fn, api } = mountAutoRefresh(() => ms);
    api.setOn(true);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    ms = 0; // getter 已归零，但旧表仍按 1000ms 排着——契约要求调用方 restart
    vi.advanceTimersByTime(1000);
    expect(fn, '旧表未停：契约明令「变更后由调用方重新 setOn/restart」，violation 在消费侧').toHaveBeenCalledTimes(2);
    api.restart(); // restart 重估 ms=0 → 停表
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('隐藏页短路面：visibilitychange hidden 停表、恢复可见续跑', () => {
    const { fn, api } = mountAutoRefresh(() => 1000);
    api.setOn(true);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    expect(fn, '页面隐藏期间不得轮询').toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(1000);
    expect(fn, '恢复可见后续跑').toHaveBeenCalledTimes(2);
  });

  it('卸载停表：unmount 后 tick 与 visibilitychange 均不再触发', () => {
    const { fn, api, stop } = mountAutoRefresh(() => 1000);
    api.setOn(true);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }).not.toThrow();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
