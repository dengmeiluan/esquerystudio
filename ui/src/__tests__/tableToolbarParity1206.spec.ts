/**
 * 1206：两内核**工具行**能力互查（右键那套已由 1205 覆盖，这里补工具行）。
 *
 * 用户问的「三处表格能力不一样」，工具行是同一问题的另一半：
 * 索引工作区有「视图 ⋯ / 导出」聚合钮，SQL 结果表有没有？两侧各自新增按钮时会不会又分叉？
 * 这里把两侧工具行的 aria-label 抽出来做差，**RT 有而 QRT 没有的每一项都要有理由**。
 *
 * 本批实测结论：工具行当前**没有真缺口**——
 *   · 「表格快照 PNG」(RT) 与「导出表格快照 PNG」(QRT) 是同一动作，只是 QRT 在导出菜单里多带了两个字；
 *   · 「转置视图」两侧都有（变量名 transpose / transposeOn 不同）；
 *   · 唯一 RT 独有的是「复制 bulk NDJSON」——它是**编辑待提交**的管理动作，
 *     而 QRT 压根没有 pending 编辑态（源码里 `pending` 出现 0 次），语义不适用。
 * 所以这条清单的作用不是"再补两个按钮"，而是**把"已核查、勿重复排查"钉住**，
 * 并让将来任一侧新增工具行钮时立刻暴露差集。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '../components', p), 'utf-8');
const rt = read('ResultTable.vue');
const qrt = read('QueryResultTable.vue');

/** 取 <TableShell …> … </TableShell> 之间的工具行 aria-label 集合 */
function toolbarAria(src: string): Set<string> {
  const i = src.indexOf('<TableShell');
  const j = src.indexOf('</TableShell>', i);
  const seg = src.slice(i, j);
  return new Set([...seg.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]!));
}

const rtAria = toolbarAria(rt);
const qrtAria = toolbarAria(qrt);

/* RT 工具行独有项的理由。新增差异必须在这里补一行，否则报红。 */
const EXEMPT: Record<string, string> = {
  '复制 bulk NDJSON（审计/复现/重放）': 'QRT 无 pending 编辑态（源码 pending 计数为 0），bulk NDJSON 只属于索引工作区的就地编辑链',
  "'表格快照 PNG'": 'QRT 同名动作在「导出 ⋯」菜单里（aria 为「导出表格快照 PNG」），只是菜单项 vs 菜单项',
  "transpose ? '转置视图：开' : '转置视图：关'": 'QRT 同名项变量是 transposeOn（both 都有转置）',
  /* RT 的导出是**直接导出**（按当前默认格式一键直出）；QRT 的导出是**菜单触发器**
     （aria 为静态「导出」+ aria-haspopup=menu，菜单里再选 CSV/XLSX/JSON/PNG/Markdown）。
     同一动作、两种交互形态，不是能力缺口。RT 的 aria 做成动态（带格式与范围）
     是因为窄档会隐藏可见文字「导出」，必须自带可访问名称——见 toolbarIconA11y1289。
     ⚠key 里含反引号与 ${}，用「含 expFmt 即视为已核查」的宽松判据，避免模板串字面量对不上。 */
  '导出（RT 直出 / QRT 菜单）': 'RT 直接导出 vs QRT 导出菜单（aria-haspopup=menu），形态不同非缺口；动态文案是窄档无文字时的可访问名称',
};

/** 除逐字 key 外，允许按前缀/特征认领（模板串字面量含 ${} 时逐字比对不可靠） */
function exemptReason(k: string): string | undefined {
  if (k in EXEMPT) return EXEMPT[k];
  if (k.includes('expFmt')) return EXEMPT['导出（RT 直出 / QRT 菜单）'];
  return undefined;
}

describe('1206 工具行互查', () => {
  it('RT 有而 QRT 没有的工具行 aria，必须全部有理由', () => {
    const onlyRt = [...rtAria].filter(k => !qrtAria.has(k));
    const unexplained = onlyRt.filter(k => !exemptReason(k));
    expect(unexplained, `这些工具行能力在 QRT 缺失且没写理由：${unexplained.join(' | ')}`).toEqual([]);
  });

  it('两侧都有的核心工具行能力不得被删（回归锚，按结构不按裸 aria）', () => {
    /* ⚠第一版只断言 aria 集合里有「视图设置」，负控删掉工具行那颗钮后**仍然绿**——
      因为 QRT 里同名 aria 还有菜单容器与聚焦态两处，集合照样命中。
       改为按结构锚：工具行里的触发钮必须同时带 aria-haspopup 与「视图设置」。 */
    const triggerOf = (src: string) => {
      const i = src.indexOf('<TableShell');
      const j = src.indexOf('</TableShell>', i);
      return /aria-label="视图设置"[^>]*aria-haspopup="menu"|aria-haspopup="menu"[^>]*aria-label="视图设置"/.test(src.slice(i, j));
    };
    expect(triggerOf(rt), 'RT 工具行缺「视图 ⋯」触发钮').toBe(true);
    expect(triggerOf(qrt), 'QRT 工具行缺「视图 ⋯」触发钮').toBe(true);
    for (const shared of ['展示形式']) {
      expect(rtAria.has(shared), `RT 缺 ${shared}`).toBe(true);
      expect(qrtAria.has(shared), `QRT 缺 ${shared}`).toBe(true);
    }
    const focus = "focused ? '还原结果表' : '放大结果表'";
    expect(rtAria.has(focus)).toBe(true);
    expect(qrtAria.has(focus)).toBe(true);
  });

  it('「没有真缺口」这一结论的前提仍成立：QRT 确实无 pending 编辑态', () => {
    const pendingHits = (qrt.match(/pending/g) || []).length;
    expect(pendingHits, 'QRT 若将来加了编辑态，bulk NDJSON 的豁免就要重新评估').toBe(0);
  });

  it('两侧的导出入口都在（RT 是单钮直出，QRT 是菜单）', () => {
    expect(rt).toMatch(/class="btn sm ghost rt-exp-btn"/);
    /* 1345：QRT 导出钮 aria 升级为带范围/格式的动态文案（RT 侧同名口径同批对齐）。 */
    expect(qrt).toMatch(/:aria-label="`导出当前视图（/);
  });
});
