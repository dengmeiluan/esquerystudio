/* 五百六十二批轨5【自适应三件】看守。
 *
 * A1 useQueryRun.ts 100ms elapsed tick 补 document.hidden 短路——561 批 useNow.ts 先例
 *    平移（后台标签页里读秒不可见，tick 纯属空转唤醒；100ms 频率约定不动，仅隐藏页跳过，
 *    回前台下个 tick 自动续上）。行为用 fake timers（esErrorCode561 F6 同款）；
 * A2 ColPicker.vue .cp-mv-btn font-size 10px 裸值 → var(--fs-2xs)（theme.css:94 已约定
 *    10px 档；同行 line-height/height 16px 属形状系保字面不动）；
 * A3 IndexOptimizerView force_merge 成功 toast「看任务」action 升格 taskId 深链——
 *    /tasks?taskId=... 直达命中行（TasksView 已消费 route.query.taskId 做 tv-hit 高亮，
 *    深链端点既有零前端新契约）。
 * A2/A3 走源文本匹配理由同 esErrorCode561.spec.ts 头注：组件样式/路由实参只能源断言。
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('A1 useQueryRun elapsed tick hidden 短路（562）', () => {
  afterAll(() => { vi.useRealTimers(); });

  it('hidden=true 时 elapsed 停走，回前台续走（100ms 频率约定不动）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const { useQueryRun } = await import('../composables/useQueryRun');
    const q = useQueryRun();
    const signal = q.begin();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(q.running.value).toBe(true);
    /* 可见：100ms tick 正常推进 */
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.advanceTimersByTime(100);
    expect(q.elapsedMs.value).toBe(100);
    /* 隐藏：跳过 tick（后台标签页读秒不可见，空转唤醒纯属浪费——useNow 561 先例） */
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    vi.advanceTimersByTime(500);
    expect(q.elapsedMs.value).toBe(100);
    /* 回前台：续走（步长恰等于周期时 fake timers 有边界 double-fire quirk，
       断不等式锁「继续推进」意图即可，短路本体由上一精确断言锁定） */
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.advanceTimersByTime(300);
    expect(q.elapsedMs.value).toBeGreaterThan(100);
    q.finish();
    expect(q.running.value).toBe(false);
  });

  it('源文本看守：tick 回调体内有 document.hidden 短路（useNow 先例字面）', () => {
    const code = src('composables/useQueryRun.ts');
    expect(code).toContain('if (document.hidden) return;');
    /* 100ms 约定不动 */
    expect(code).toContain('}, 100);');
  });
});

describe('A2 ColPicker 微字号 token 化（562）', () => {
  const css = strip(src('components/ColPicker.vue'));

  it('.cp-mv-btn font-size 裸 10px 退役换 var(--fs-2xs)（theme.css 约定档单源）', () => {
    expect(css).toMatch(/\.cp-mv-btn\s*\{[^}]*font-size:\s*var\(--fs-2xs\)/);
    expect(css, '裸 px 微字号不得回潮').not.toMatch(/\.cp-mv-btn\s*\{[^}]*font-size:\s*10px/);
  });

  it('16px 形状系不动（line-height/height 保字面，与 font-size 同行共存的判据）', () => {
    expect(css).toMatch(/\.cp-mv-btn\s*\{[^}]*line-height:\s*16px;\s*height:\s*16px[^}]*font-size/);
  });
});

describe('A3 force_merge toast taskId 深链（562）', () => {
  const view = strip(src('views/IndexOptimizerView.vue'));

  it('「看任务」action 带 taskId 查询参跳任务页（不再裸 /tasks）', () => {
    expect(view).toContain("path: '/tasks'");
    expect(view).toContain('query: { taskId');
  });

  it('深链端点既有：TasksView 消费 route.query.taskId 做 tv-hit 命中高亮（零新契约）', () => {
    expect(src('views/TasksView.vue')).toContain('route.query.taskId');
  });
});
