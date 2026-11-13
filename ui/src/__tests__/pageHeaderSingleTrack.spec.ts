/* 页头单轨看守。
 *
 * 治理本体：全站页头曾有两条并存路径——
 *   1) PageHeader 组件（31 个 view）
 *   2) 全局 .page-head + <h2> + .hd-ic + .sub（9 个 view，从未被上一轮收敛）
 * 二者视觉形态实测不同，用户在 40 个页面间切换会看到页头跳变：
 *   - 副标题位置：.page-head 是 align-items:baseline 与标题同行；PageHeader 换行在标题下
 *   - 图标色：.hd-ic 用 var(--ac-hi)（暗色 #2dd4bf）；.ph-ic 用 var(--brand)→var(--ac)（暗色 #14b8a6）
 *   - 标题字重：<h2> 取浏览器默认 700；.ph-tt 是 600
 *   - 右侧操作：.page-head 无 actions 位，靠手写 <span style="flex:1"> 撑开；PageHeader 有 .ph-r 插槽
 * （副标题颜色一度以为也是差异，核实后 --muted: var(--tx2) 是同色别名，不算。）
 *
 * 本看守防的是「有人给新页面重新写一套 .page-head 页头」——
 * 那会静默退回双轨，而全量测试不会有任何反应（两套都能正常渲染）。
 *
 * ── 覆盖范围（按字面理解，不要外推）─────────────────────────
 * 断言落在源文本上，不是渲染结果：本仓库 vitest 环境是 happy-dom，
 * scoped <style> 与 theme.css 都不参与计算，getComputedStyle 取不到值，
 * 任何「两套页头视觉一致」的数值断言都会是死断言（恒真或恒假）。
 * 故这里断言唯一可靠且与症状同构的量：源码里不许再出现第二条页头路径。
 *
 * 不覆盖：页头内部的视觉细节（那是 components/__tests__/pageHeader.spec.ts 的职责）、
 * 也不覆盖「每个 view 都必须有页头」（有些页面如 QueryHubView 本就是 tab 容器，无页头是对的）。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const viewsDir = join(__dirname, '..', 'views');
const componentsDir = join(__dirname, '..', 'components');
const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const vueFiles = (dir: string) =>
  readdirSync(dir).filter(f => f.endsWith('.vue')).map(f => ({ f, path: join(dir, f) }));

describe('页头单轨（.page-head 旧路径已退役）', () => {
  for (const { f, path } of [...vueFiles(viewsDir), ...vueFiles(componentsDir)]) {
    it(`${f} 不使用退役的 .page-head 页头`, () => {
      const tpl = strip(readFileSync(path, 'utf8')).split('</template>')[0] ?? '';
      expect(
        /class\s*=\s*["'][^"']*\bpage-head\b/.test(tpl),
        `${f} 用了退役的全局 .page-head；页头统一走 <PageHeader>（图标/标题/副标题/#actions 插槽齐备）`,
      ).toBe(false);
    });

    it(`${f} 不使用退役的 .hd-ic 图标类`, () => {
      const tpl = strip(readFileSync(path, 'utf8')).split('</template>')[0] ?? '';
      expect(
        /class\s*=\s*["'][^"']*\bhd-ic\b/.test(tpl),
        `${f} 用了 .hd-ic（var(--ac-hi)）；PageHeader 的 .ph-ic 用 var(--brand)，混用会出两种青色`,
      ).toBe(false);
    });

    /* 780 批：样式侧同守。模板 class= 已有断言，但 ".page-head h2" / ".page-head:hover"
       一类后代/伪类/链式选择器只可能出现在 <style> 里——旧守卫正则只匹配顶层
       "{"/"," 形态，theme.css 曾漏过一条 ".page-head h2" 死规则整整一轮。 */
    it(`${f} 样式里不写 .page-head 选择器（任何形态）`, () => {
      const src = strip(readFileSync(path, 'utf8'));
      expect(
        /\.page-head(?![\w-])/.test(src),
        `${f} 样式里仍有 .page-head 选择器；页头类名已统一为 PageHeader 的 .ph，这是合并前遗留的死规则（含后代/伪类/链式形态）`,
      ).toBe(false);
    });
  }

  /* 与上面对称的另一半：theme.css 里那三条旧规则必须真的删干净。
     只删模板引用、留着 CSS，下个人照 theme.css 里的现成类名抄回来毫无阻力。 */
  it('theme.css 不再保留 .page-head / .hd-ic 规则（含后代选择器形态）', () => {
    const css = strip(readFileSync(join(__dirname, '..', 'theme.css'), 'utf8'));
    expect(
      /\.page-head(?![\w-])/.test(css),
      'theme.css 仍有 .page-head 选择器（含 ".page-head h2" 一类后代形态）；模板引用已清零，规则留着就是复发入口',
    ).toBe(false);
    expect(
      /\.hd-ic(?![\w-])/.test(css),
      'theme.css 仍有 .hd-ic 规则；图标色统一由 PageHeader 的 .ph-ic 决定',
    ).toBe(false);
  });

  /* 反向断言：PageHeader 组件本身必须还在，且仍提供三个装载位。
     否则上面全部断言会在「组件被删掉、所有页头都没了」时依然全绿。 */
  it('PageHeader 仍提供 icon/subtitle/actions 三个装载位', () => {
    const src = readFileSync(join(componentsDir, 'PageHeader.vue'), 'utf8');
    expect(src, 'PageHeader 丢了 actions 插槽——9 个页面的右侧操作区无处可去').toContain('$slots.actions');
    expect(src, 'PageHeader 丢了 subtitle 插槽——MappingView 的富副标题无处可去').toContain('$slots.subtitle');
    expect(/ph-ic/.test(src), 'PageHeader 丢了图标位').toBe(true);
  });

  /* 收敛结果的正向锚：转换的 9 个 view 必须都真的在用 PageHeader。
     只有否定断言时，把 <PageHeader> 整段删掉也能让上面全绿。 */
  const CONVERTED = [
    'AdhocRebuildView.vue', 'BulkEditorView.vue', 'IndexHubView.vue',
    'MappingDesignerView.vue', 'MappingView.vue', 'OverviewView.vue',
    'RestView.vue', 'SecurityView.vue', 'SystemView.vue',
  ];
  for (const f of CONVERTED) {
    it(`${f} 已接入 PageHeader`, () => {
      const src = readFileSync(join(viewsDir, f), 'utf8');
      expect(src, `${f} 页头回退了`).toContain('<PageHeader');
      expect(src, `${f} 缺 PageHeader 导入`).toContain("components/PageHeader.vue");
    });
  }
});
