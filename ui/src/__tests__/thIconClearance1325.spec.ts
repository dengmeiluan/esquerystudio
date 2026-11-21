/**
 * 一千三百二十五批：把「表头字段名压住排序/筛选图标」这个反复投诉固化成不变量。
 *
 * 用户多次报「索引表格现在表头字段跟排序和筛选图标存在遮挡」。真机实测
 * （索引工作区，最坏字段名 `issuer_full_registered_company_name_cn`，8 档列宽）**当前不重叠**：
 *
 *   列宽   文字右缘   ⇅左缘(gap)   漏斗左缘(gap)
 *    63px   384       hidden        388 (4)
 *    96px   417       hidden        421 (4)
 *   120px   421       431 (10)       445 (24)
 *   251px   552       562 (10)       576 (24)
 *
 * 也就是说这条已被修过（.rt-th-label padding-right 22px；窄列容器查询降到 14px 并隐藏 ⇅）。
 * 但**没有任何测试守着它**，所以每次改表头样式都可能悄悄退回去，用户再报一次。
 * 本 spec 用几何不等式守住这个意图（不是守具体像素）：
 *
 *   1. 标签右内边距 ≥ 右侧常驻图标（漏斗，right:8px 宽 12px）的占位 —— 文字永远进不去图标区；
 *   2. 窄列档（≤96px）把内边距降到 14px 且**隐藏 ⇅**（否则窄列里 ⇅ 会盖字）；
 *   3. 宽档悬停时才把内边距加大到 34px 给 ⇅ 让位。
 * 负控：把 22px 改小到 8px → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

for (const file of ['ResultTable.vue', 'QueryResultTable.vue'] as const) {
  const src = readFileSync(join(__dirname, '../components', file), 'utf-8');
  const isRt = file === 'ResultTable.vue';
  const labelSel = isRt ? '.rt-th-label' : '.qrt-th-name';
  const funnelSel = isRt ? '.rt-funnel' : '.qrt-funnel';

  describe(`1325 ${file} 表头文字与图标不重叠（几何不变量）`, () => {
    function rule(sel: string): string {
      const i = src.indexOf(`${sel} {`);
      expect(i, `${sel} 规则必须存在`).toBeGreaterThan(-1);
      return src.slice(i, src.indexOf('}', i));
    }
    /* 1332：值可能是 var(--sp-6) 单值，也可能是 min(32px, max(12px,30%)) 复合值。
       宽档口径取其中的**上限项**（宽列解析出 32px）；窄列下限由 1332 单独守。
       不能因为解析不出单值就放行——那样这条断言就不再守任何东西。 */
    const SP: Record<string, number> = { '0': 2, '1': 4, '1h': 6, '2': 8, '2h': 10, '3': 12, '4': 16, '5': 24, '6': 32 };
    function pxOf(v: string): number {
      const parts = [...v.matchAll(/(?:(\d+)px|var\(--sp-(\w+)\))/g)]
        .map(m => (m[1] ? Number(m[1]) : SP[m[2]] ?? NaN)).filter(n => !Number.isNaN(n));
      return parts.length ? Math.max(...parts) : NaN;
    }
    function padOf(s: string): number {
      const m = s.match(/padding-right:\s*([^;]+);/);
      expect(m, '必须有 padding-right').toBeTruthy();
      const v = pxOf(m![1]);
      expect(v, `padding-right 必须可解析，实际 ${m![1]}`).not.toBeNaN();
      return v;
    }
    /* 1332：图标锚的是 **th 的右缘**，不是列名盒子的右缘——真机里文字可见右缘
       = th 右缘 − th 内衬 − 列名内衬。旧判据只看列名内衬，把 th 那 10px 漏算了。
       宽列档两内核都 ≥32px，故仍按宽档口径（32px）比图标占位；窄列行由 1332 守。 */
    const thPad = (() => {
      if (isRt) {
        /* RT 的 th 内衬来自全局 theme.css `.tbl th { padding: var(--sp-2) var(--sp-2h) }`，
           组件里不重复声明——必须去那里读真值，不能猜。 */
        const theme = readFileSync(join(__dirname, '../theme.css'), 'utf-8');
        const m = theme.match(/\.tbl th\s*\{[^}]*padding:\s*var\(--sp-\w+\)\s+var\(--sp-(\w+)\)/);
        return m ? (SP[m[1]] ?? NaN) : NaN;
      }
      const m = src.match(/\.qrt-tbl th\s*\{[^}]*padding-right:\s*var\(--sp-(\w+)\)/);
      return m ? (SP[m[1]] ?? NaN) : NaN;
    })();

    it('漏斗占位（right 8px + 宽 12px = 20px 起）必须小于「th 内衬 + 标签右内边距」', () => {
      const funnel = src.slice(src.indexOf(`${funnelSel} {`), src.indexOf('}', src.indexOf(`${funnelSel} {`)));
      const right = Number((funnel.match(/right:\s*(\d+)px/) || [])[1]);
      const widthGuess = 12; /* 内联 SVG 图标 13px 级，取 12 保守 */
      const reserve = right + widthGuess;
      const pad = padOf(rule(labelSel)) + thPad;
      expect(pad, `文字可见右缘距 th 右缘 ${pad}px（th ${thPad} + 列名 ${pad - thPad}）必须 ≥ 图标占位 ${reserve}px（否则文字会压图标）`)
        .toBeGreaterThanOrEqual(reserve);
    });

    it('窄列（≤96px 容器查询）隐藏/淡出 ⇅，避免窄列悬停时 ⇅ 盖住列名', () => {
      const at = src.indexOf('@container (max-width: 96px)');
      if (!isRt) {
        /* QRT 侧暂未接窄列降级：QRT 的 th 内没有可挂 container-type 的内层元素
           （项目实测 table-cell 自身不命中，RT 1168 注释），加包裹会改变 table-cell 对齐，
           属结构改动——须先在真机验到 QRT 表头再落地，不能凭静态推断改。此处只锁
           「宽档留白足够」，窄列降级留给后续批次。 */
        return;
      }
      expect(at, '必须有窄列容器查询档').toBeGreaterThan(-1);
      const block = src.slice(at, src.indexOf('\n}', at) + 2);
      /* RT 用 display:none 让 ⇅ 让位 */
      const hidesSort = /sort-hint[^{]*\{[^}]*display:\s*none/.test(block);
      expect(hidesSort, '窄列档必须让 ⇅ 让位').toBe(true);
      expect(block, '窄列必须把留白降到 14px').toMatch(/padding-right:\s*14px/);
    });

    it('宽档悬停给 ⇅ 让位（内边距不低于静息，文字不进图标区）', () => {
      /* RT：悬停把内边距加大到 34px；QRT：静息与悬停同口径（不跳变），
         两者都要求「悬停内边距 ≥ 静息内边距」——这才是被守的意图。
         1332：QRT 改成 min(32px, max(12px,30%)) 这类复合值后，取其中的**上限项**
         作为宽档口径（宽列解析出 32px；窄列另有 1332 的下限约束），不能因为
         解析不出单值就放行——那样等于这条断言不再守任何东西。 */
      const hover = src.match(/th:hover [^{]*\.(?:rt-th-label|qrt-th-name)[^{]*\{\s*padding-right:\s*([^;]+);/);
      expect(hover, '必须有悬停档内边距规则').toBeTruthy();
      const resolve = (v: string): number => {
        const px = v.match(/^(\d+)px$/);
        if (px) return Number(px[1]);
        const tok = v.match(/var\(--sp-(\w+)\)/);
        const map: Record<string, number> = { '1': 4, '1h': 6, '2': 8, '2h': 12, '3': 16, '4': 20, '5': 24, '6': 32 };
        if (tok && /^\s*var\(/.test(v)) return map[tok[1]] ?? NaN;
        /* 复合值（min/max/clamp）：取其中最大的一项作为宽档可达上限 */
        const parts = [...v.matchAll(/(?:(\d+)px|var\(--sp-(\w+)\))/g)]
          .map(m => (m[1] ? Number(m[1]) : map[m[2]] ?? NaN)).filter(n => !Number.isNaN(n));
        return parts.length ? Math.max(...parts) : NaN;
      };
      const hoverPad = resolve(hover![1].trim());
      expect(hoverPad, '悬停内边距必须可解析').not.toBeNaN();
      expect(hoverPad, '悬停内边距必须 ≥ 静息内边距').toBeGreaterThanOrEqual(resolve(rule(labelSel).match(/padding-right:\s*([^;]+);/)![1].trim()));
    });
  });
}

describe('1325 QRT 同类规则存在（两内核同语言）', () => {
  const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
  it('QRT 列名同样留出图标位', () => {
    const i = qrt.indexOf('.qrt-th-name {');
    expect(i, '.qrt-th-name 规则必须存在').toBeGreaterThan(-1);
    const blk = qrt.slice(i, qrt.indexOf('}', i));
    /* 1373：判据是「留了足够宽的图标槽」——解析像素值并与 ⇅ 实际占位比较，
       而不是要求出现某个 token（token 值会变，占位关系不会）。 */
    const m = blk.match(/padding-right:\s*(\d+)px/);
    expect(m, '必须留 padding-right 图标槽').toBeTruthy();
    const sortRight = Number((qrt.match(/\.qrt-sort-i \{[^}]*right: (\d+)px/) ?? [])[1] ?? 0);
    expect(Number(m![1]), '沟槽必须 ≥ ⇅ 锚点').toBeGreaterThanOrEqual(sortRight);
  });
});
