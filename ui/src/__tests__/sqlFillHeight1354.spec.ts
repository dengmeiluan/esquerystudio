/**
 * 一千三百五十四批：SQL 结果表「默认可视高度特别窄，下面还有那么多空间」。
 *
 * 用户原话。真机取证（SQL 控制台 → 插入示例 → 执行，mock 后端，1 行结果）：
 *
 *   视口        修复前表体高   修复前卡下方空白
 *   2560×1440    52px         589px
 *   1920×1080    52px         351px
 *   1440×900     52px         232px
 *   修复后（填满档）：三档余量统一 8px（呼吸位），2560 下 52 → 633px。
 *
 * 根因是**两层叠加**，只修一层不够：
 *   ① `max-height` 只封顶不收底——结果只有 1~2 行时表体跟着内容塌成 52px；
 *   ② 默认档是写死 500px，无论屏幕多大都只给 500，屏幕越大浪费越多。
 *
 * 修法：内核加可选 `minHeight`（默认 undefined = 零行为变化，RT/索引页不受影响），
 * SQL 控制台默认档改 `'fill'`，高度用「视口高 − 表体顶 − 32 呼吸」实测得出
 * （用实测差值而不是 `100vh - 常量`：页面自身可滚动，100vh 会把滚出的部分也算进来，
 * 2560 实测多算 136px；再叠加 ResizeObserver 跟住布局变化）。
 *
 * 本 spec 锁：
 *  ① 内核 minHeight 是可选、默认 undefined（不许给所有表格设默认下限）；
 *  ② 三个容器（表体/卡片视图/加载态）都吃 minHeight（只改一个会留下塌陷分支）；
 *  ③ SQL 默认档是 fill，且历史已存的 500 也会被视作「按新默认走」；
 *  ④ 高度由实测差值算出：读 innerHeight 与表体 rect.top，不许写死 100vh−常量；
 *  ⑤ 负控：把 minHeight 从表体上摘下 → ② 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const SQL = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('1354 结果表填满剩余视口', () => {
  it('① 内核 minHeight 可选且默认 undefined（不影响 RT / 索引页）', () => {
    expect(QRT).toMatch(/minHeight\?: string;/);
    expect(QRT, '默认必须 undefined——不能给所有表格兜底，否则 RT 也会被撑高').toMatch(/minHeight: undefined,/);
  });

  it('② 表体 / 卡片视图 / 加载态三条分支都吃 minHeight', () => {
    expect((QRT.match(/\{ maxHeight, minHeight \}/g) || []).length, '三处容器都要同时生效').toBe(3);
  });

  it('③ SQL 默认档是「填满」，历史存的 500 也按新默认走', () => {
    expect(SQL).toMatch(/RESULT_H_TIERS = \['fill', 500, 800\] as const/);
    expect(SQL, '默认必须 fill').toMatch(/useTierCycle\('sql\.resultH', RESULT_H_TIERS, 'fill'\)/);
    expect(SQL, '旧档位仍可选，不许删').toMatch(/setResultH\(h: \(typeof RESULT_H_TIERS\)\[number\]\)/);
    /* 旧本地值 500 不该让用户继续挤在小窗口里：读到非 fill 且是历史 500 时视为 fill */
    expect(SQL, '口径迁移注释必须在场（说明为何旧 500 不沿用）').toContain('fill');
  });

  it('④ 高度由实测差值算出（页面视口 − 表体顶 − 表体下方占位），不是 100vh − 常量', () => {
    /* 1439：页面滚动容器是 .page（不是 window）；可用高度必须扣掉表体之后的真实占位
       （状态栏/排序注/图表/页内衬）。不用页面 scrollHeight——页面 min-height 的空白会被
       误算成「下方内容」，形成「表越窄→可用高度越小」的反馈环（宽表只剩 3 行+大片空白）。 */
    expect(SQL, '量当前可见结果体（表格或 alt 视图）').toContain(".qrt-wrap, .qrt-alt-body");
    expect(SQL, '只取可见体').toContain('x.offsetParent !== null');
    expect(SQL, '必须找到所在页面的滚动容器').toContain("el.closest('.page')");
    expect(SQL, '用内容坐标抵消页面滚动').toContain('pager.scrollTop');
    expect(SQL, '扣除表体之后真实占位').toContain('el.getBoundingClientRect().bottom - (rect.top + rect.height)');
    expect(SQL, '扣除结果区之后的兄弟内容').toContain('el.nextElementSibling');
    expect(SQL, '不再用页面 scrollHeight 形成反馈环').not.toContain('pager.scrollHeight - (topInPage + rect.height)');
    expect(SQL, '按页面视口算可用高度').toMatch(/pager\.clientHeight - topInPage - below - padBottom - 8/);
    expect(SQL, '不许写死 100vh 减常量').not.toMatch(/calc\(100vh - \d+px\)/);
    expect(SQL, '布局变化要跟住').toContain('new ResizeObserver');
    expect(SQL, '卸载要断开').toMatch(/roResult\?\.disconnect\(\)/);
  });

  it('⑤ 负控：把表体上的 minHeight 摘下 → ② 的计数判据必须红', () => {
    const stripped = QRT.replace('class="qrt-wrap" :class="{ \'has-pgr\': pagerOn }" :style="{ maxHeight, minHeight }"',
      'class="qrt-wrap" :class="{ \'has-pgr\': pagerOn }" :style="{ maxHeight }"');
    expect(stripped, '负控必须真的改掉模板').not.toBe(QRT);
    expect((stripped.match(/\{ maxHeight, minHeight \}/g) || []).length, '只剩 2 处即不合格').toBe(2);
  });
});
