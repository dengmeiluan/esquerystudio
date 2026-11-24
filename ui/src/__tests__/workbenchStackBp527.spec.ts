import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* 五百二十七批（W-E）：WorkbenchLayout stacked 断点单源锚。
   组件内 stacked 判据（宽 <1100 上下堆叠）此前裸写 `1100`，与全站 27 处 CSS
   `max-width: 1100px` 双写无锚。 JS 侧收口：组件导出 BP_STACK 常量、判据引用常量；
   CSS 侧合并（CSSOM 运行时读取）评估为过重、备案不做——两侧互为锚，改档必须同步。
   本 spec 锁三件事：①常量在场且值=1100；②判据引用常量（不允许回流裸 1100）；
   ③CSS 侧 1100 档仍在场（互锚前提；若某批把 CSS 侧全量迁走，本锚报警要求同步清理互锚约定）。
   五百二十八批（W-E）：常量本体迁 src/utils/layout.ts（工具层单源，getViewportProfile/
   WorkspaceView matchMedia 同步合并）；七百九十批：零消费的 re-export 兼容层退役，
   WorkbenchLayout 改锁 import 引用形态；
   ②的「禁裸 1100」从锁 WorkbenchLayout 单文件扩扫 src/views 目录层——视图 JS 侧
   （matchMedia/尺寸判断）一律引常量，CSS @media 行与约定/备案注释合法豁免。 */
const wbs = readFileSync(join(__dirname, '../components/WorkbenchLayout.vue'), 'utf-8');
const layoutUtil = readFileSync(join(__dirname, '../utils/layout.ts'), 'utf-8');

const SRC = join(__dirname, '..');
const listVue = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? listVue(join(dir, d.name)) : d.name.endsWith('.vue') ? [join(dir, d.name)] : []);

/* 剥三类注释再扫：约定注释里的 1100 备案是合法内容，只锁代码字面量 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');

describe('五百二十七批：stacked 断点常量单源（BP_STACK）', () => {
  it('常量本体在 utils/layout.ts（值=1100），WorkbenchLayout import 引用形态（790 re-export 退役）', () => {
    expect(layoutUtil).toMatch(/export const BP_STACK = 1100;/);
    expect(wbs).toMatch(/^import \{[^}]*\bBP_STACK\b[^}]*\} from '\.\.\/utils\/layout';/m);
  });

  it('stacked 判据引用 BP_STACK，JS 侧不允许回流裸 1100（WorkbenchLayout + src/views 扩扫）', () => {
    /* WorkbenchLayout：判据字面锚 + 组件代码无裸 1100 */
    const code = stripComments(wbs);
    expect(code).toMatch(/vp\.width\.value > 0 && vp\.width\.value < BP_STACK/);
    const offenders = code.split('\n')
      .filter(l => /(?<![\w.])1100(?![\w])/.test(l) && !l.includes('BP_STACK'));
    expect(offenders, `JS 侧裸 1100 双写回流（应引用 BP_STACK）：\n${offenders.join('\n')}`).toEqual([]);

    /* 五百二十八批扩扫：src/views 全目录 JS 侧裸 1100（WorkspaceView matchMedia 同类回流）。
       CSS @media 行是互锚的另一侧、合法在场；mq 变量名（mq1100）不匹配词边界不算 */
    const viewOffenders: string[] = [];
    for (const f of listVue(join(SRC, 'views'))) {
      const vcode = stripComments(readFileSync(f, 'utf-8'));
      for (const l of vcode.split('\n')) {
        if (!/(?<![\w.])1100(?![\w])/.test(l) || l.includes('@media') || l.includes('BP_STACK')) continue;
        viewOffenders.push(`${f.replace(/\\/g, '/').split('/src/')[1]}: ${l.trim()}`);
      }
    }
    expect(viewOffenders, `视图 JS 侧裸 1100 回流（应引 utils/layout 的 BP_STACK）：\n${viewOffenders.join('\n')}`).toEqual([]);
  });

  it('互锚前提：CSS 侧 1100 档仍在场（全量迁走时本锚报警同步清理约定注释）', () => {
    const cssHits = [...listVue(join(SRC, 'views')), ...listVue(join(SRC, 'components'))]
      .reduce((n, f) => n + (readFileSync(f, 'utf-8').match(/max-width: 1100px/g)?.length ?? 0), 0);
    expect(cssHits, 'CSS 侧 max-width:1100px 已全部消失——请同步更新 WorkbenchLayout.vue 的互锚约定注释与本 spec').toBeGreaterThan(0);
  });
});
