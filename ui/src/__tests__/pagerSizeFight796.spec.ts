/**
 * 七百九十六批：用户实报「点击（每页条数）按钮筛选不生效」根因修复（20261008 09:49 截图）。
 *
 * 根因（真机探针复现实锚：savedAfter=20/重查 body size=20/触发钮回 20）：
 * 五百六十二批「DSL 顶层档内 size 反向驱动分页档」与用户改分页打架——
 * 用户点 50/页 → setPageSize(50) → execQuery() → 执行组装段读到 DSL 文本里的旧
 * `"size": 20`（DEFAULT_DSL 与全部四套模板均内嵌 size:20=全用户必踩）→ 在档且 ≠50
 * → writePageSize(20) 把用户刚点的 50 静默回滚 → 重查仍按 20 行 → 用户视角「点了没反应」，
 * 且此后每次执行都再回滚=分页器被 DSL 旧值永久锁死。
 *
 * 约定（796 口径）：**执行发起方仲裁**——分页器发起的执行（setPageSize 链路）=分页档新值
 * 获胜，DSL size 反向同步让位；反向同步仅在非分页驱动的执行（用户改稿后执行/深链/会话
 * 恢复）生效（562 语义维持：显式 DSL 档内 size 驱动分页档三处一致）。模板内嵌 size:20
 * 不动（DSL 声明式意图保留）；分页器改档不回写 DSL 文本（562 既有备案维持）。
 *
 * 伴生观察备案（非本刀面）：pickSize 在 running 在途窗点击=弹层关+静默丢弃零反馈
 * （goPage 同构 running 早退）——低频形态，留独立裁决。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('796：分页改档驱动的执行=分页档获胜（DSL size 同步让位）', () => {
  it('执行发起方标志在场（pagerDrivenRun，模块级 let 声明形态）', () => {
    expect(dq).toMatch(/let pagerDrivenRun = false;/);
  });

  it('setPageSize 起手置位+finally 复位（try/finally 形态锁——execQuery 同步段含 size 同步块在首个 await 前，标志窗覆盖）', () => {
    const m = dq.match(/function setPageSize\(s: number\) \{[\s\S]*?\n\}/);
    expect(m, 'setPageSize 函数体在场').toBeTruthy();
    const body = m![0];
    expect(body).toContain('pagerDrivenRun = true');
    expect(body).toContain('} finally {');
    expect(body).toContain('pagerDrivenRun = false');
    expect(body.indexOf('pagerDrivenRun = true')).toBeLessThan(body.indexOf('writePageSize(s)'));
  });

  it('执行组装段 size 反向同步带 !pagerDrivenRun 守卫（562 块让位新形态）', () => {
    expect(dq).toMatch(/if \(!pagerDrivenRun && typeof obj\.size === 'number' && PAGER_SIZES\.includes\(obj\.size\) && obj\.size !== pageSize\.value\) \{\s*\n\s*writePageSize\(obj\.size\);/);
  });

  it('无守卫旧形态不得回流（562 原貌=本 bug 根因形态）', () => {
    expect(dq).not.toMatch(/if \(typeof obj\.size === 'number' && PAGER_SIZES\.includes\(obj\.size\) && obj\.size !== pageSize\.value\) \{\s*\n\s*writePageSize\(obj\.size\);/);
  });

  it('根因背景锚：DEFAULT_DSL 内嵌 size:20（模板家族维持不动——分页驱动让位修法，备案防误删）', () => {
    const m = dq.match(/const DEFAULT_DSL = `[\s\S]*?`;/);
    expect(m, 'DEFAULT_DSL 在场').toBeTruthy();
    expect(m![0]).toContain('"size": 20');
  });
});
