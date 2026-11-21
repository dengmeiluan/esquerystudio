/* KPI/指标卡栅格的窄屏挤压看守。
 *
 * 治理本体：指标卡栅格在本仓库长出了两套写法。
 *   stat 族（IndexHubView/SlmView/WatcherView）：repeat(auto-fit, minmax(140~150px, 1fr))
 *     —— 窄屏自动减列换行，数值不挤压。
 *   kpi 族（Aliases/Diag/Ilm/Snapshots/Tasks/Topology）：repeat(4, 1fr) / repeat(5, 1fr)
 *     —— 列数写死。TopologyView 5 列且 sub 行是「主 12 · 副 24」这类长文本，
 *        窄屏必然压到溢出或换行错位。
 * 同仓库两种写法并存、且正确的那套已有三处先例，故把 kpi 族并轨到 auto-fit。
 *
 * 复发方式很具体：下一个人加指标卡时照着旁边那行 `repeat(4, 1fr)` 抄一份。
 * 全量测试对此毫无反应——宽屏下 4 列确实好看，
 * 而单测环境（happy-dom）不切视口、scoped <style> 不参与计算，
 * getComputedStyle 取不到栅格值，任何「渲染后量列宽」的断言都是死断言。
 * 故断言落在源文本：指标卡栅格不许写死列数。
 *
 * ── 覆盖范围（按字面理解，不要外推）──────────────────────────
 * 只认类名以 -kpis / -stats / -metrics 结尾的栅格容器。
 * 新造 .xx-cards、.xx-tiles 一类名字就能完全绕过——扩命名时必须同步 CONTAINER_RE。
 *
 * ── 记名豁免 ────────────────────────────────────────────────
 * OverviewView 的 .ov-kpis 保留 repeat(4, minmax(0,1fr)) + @media 降列：
 * 那条 media 是 R66 iframe 实测（866px 下 3 列卡内宽仅 ~160px、Top10 行溢出）后
 * 有意做的分档降列，注释在 OverviewView.vue:470 记着实测依据。
 * auto-fit 在 900px 下会给出 4~5 列，反而退回它当初修掉的症状——
 * 已实测校准过的地方不该被通则覆盖。
 * 豁免同时反向断言「该页仍有 media 覆盖」，否则豁免会腐化成永久通行证。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..', 'views');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 指标卡栅格容器的命名约定 */
const CONTAINER_RE = String.raw`\.[a-z][a-z0-9]*-(?:kpis|stats|metrics)`;

/* 豁免：键为文件名，值为理由（必须逐条给理由，空着等于本测试失效） */
const EXEMPT: Record<string, string> = {}; /* v3.0.1:.ov-kpis 栅格随 KPI 卡墙退役整体删除,豁免随之清空 */

describe('KPI 栅格窄屏挤压防回退', () => {
  for (const f of readdirSync(dir).filter(x => x.endsWith('.vue'))) {
    it(`${f} 的指标卡栅格不得写死列数`, () => {
      const css = strip(readFileSync(join(dir, f), 'utf8'));
      /* 抓 grid-template-columns 上的 repeat(<数字>, …)；auto-fit/auto-fill 不算 */
      const bad = [...css.matchAll(
        new RegExp(String.raw`${CONTAINER_RE}[^{}]*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*\d+`, 'gi'),
      )].map(m => m[0].replace(/\s+/g, ' ').trim());

      if (EXEMPT[f]) {
        expect(
          bad.length,
          `${f} 已在豁免名单但栅格已不写死列数，请删除豁免`,
        ).toBeGreaterThan(0);
        /* 豁免的前提是它换了另一种降列手段，而不是干脆没有 */
        expect(
          /@media[^{]*\{[^}]*grid-template-columns/s.test(css),
          `${f} 的豁免理由是「以 @media 覆盖代替 auto-fit」，但已找不到 media 内的列数覆盖`,
        ).toBe(true);
        return;
      }

      expect(
        bad,
        `${f} 的指标卡栅格写死了列数，窄屏会把数值挤压/溢出。`
        + '并轨 repeat(auto-fit, minmax(150px, 1fr))（stat 族已有三处先例），'
        + '或改用 @media 分档降列并在本看守登记豁免理由',
      ).toEqual([]);
    });
  }
});
