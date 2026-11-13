/* theme.css 死全局族看守（783 批·四族横扫第二刀）。
 *
 * 治理本体：theme.css 里四族「选择器恒空匹配」的死规则——渲染 DOM 上永不出现
 * 能命中它们的类组合，规则躺着就是复发入口（下个人照全局类名抄回来毫无阻力）。
 *
 * ── 四族死因证据链（Phase 0 全域核对，783 实勘）──────────────────
 * ① 可排序表头族（.tbl th.sortable 七规则+两注释，原 425~437 区）：
 *    全站 th 挂 sortable 类的只有 QueryResultTable（:class="{ sortable, ... }"），
 *    但其 table 根类是 .qrt-tbl（无 .tbl token）且 scoped 自带全套四态
 *    （.qrt-tbl th.sortable cursor/:hover、.qrt-tbl th.on、.qrt-sort-i——531 批
 *    内核化；BoostTunerView 477 行注释自证「旧排名裸表样式全家随换 QRT」）。
 *    另两个 .tbl 渲染源都不挂 sortable：ResultTable 的 th 用 .rt-th 自有类系；
 *    AdhocRebuild/MappingFieldTree 的裸 .tbl 表无排序表头。
 *    ⚠ App.vue 418/425 的键盘可达委托用「无前缀 th.sortable」querySelectorAll
 *    （JS 域、活、服务 QRT）——退役的是 theme.css 的 .tbl 前缀 CSS，不是委托。
 * ② fade-* 三规则（原 612~614）：R124 移除路由级过渡后孤儿。全站 transition
 *    name 值全集={pop×15, hk-fade, sw-fade, ga-slide}，无裸 "fade"；hk-fade/
 *    sw-fade 生成的前缀类（hk-fade-enter-active）不等于 fade-enter-active，
 *    CSS 类选择器按整 token 匹配，故 .fade-* 恒空。.pop-* 是活族（15 处
 *    name="pop" 消费：CmdPalette/IndexPicker/FieldPicker/ResultTable 等），不动。
 * ③ .ih-type[data-t], .ih-type（原 880）：全站零字符串（含模板/TS/样式）。
 *    伴生 .mft-type 字段类型徽标色卡是活的（MappingFieldTree/FieldPicker/
 *    ColPicker/LuceneInput/FieldSelect 五组件消费），保留。
 * ④ .scroll-x / .tbl-wrap / .card > .tbl（原 R66 窄容器 @media 区块，783 实勘整块退役）：
 *    「.tbl-wrap 半支活」的 781 备案是误判——全站模板零裸 .tbl-wrap 挂载，三个近似命中
 *    （av-tk-tbl-wrap / lc-tbl-wrap / ddm-tbl-wrap）都是复合类名，CSS 按 token 整串匹配
 *    不命中 .tbl-wrap 选择器；.card > .tbl 直插形态同样全站零（819 注释点名的
 *    「安全中心审计流水」782 批已换 QRT 壳）。窄容器表横滚由表格内核（QRT/RT 自带）
 *    与 scroll-y 容器承担。
 *
 * ── 断言口径（按字面理解，不要外推）─────────────────────────────
 * 落在源文本上（happy-dom 不计算 scoped/theme.css 样式，渲染数值断言是死断言）。
 * 正则「任何形态」=后代/组合/伪类/链式全命中（780-C1 先例：顶层 {, 形态漏网
 * 整一轮）；尾界 (?![\w-]) 防 .qrt-sort-i / .ih-t-docs 一类前缀近亲误伤。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const viewsDir = join(srcDir, 'views');
const componentsDir = join(srcDir, 'components');
const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const vueFiles = (dir: string) =>
  readdirSync(dir).filter(f => f.endsWith('.vue')).map(f => ({ f, path: join(dir, f) }));

describe('theme.css 死全局族看守（四族已退役）', () => {
  /* —— theme.css 侧：四族任何形态不得回魂（先红主战场） —— */
  it('theme.css 零 th.sortable 选择器（可排序表头已内核化进 QRT 的 .qrt-tbl scoped）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(
      /th\.sortable/.test(css),
      'theme.css 仍有 th.sortable 选择器；手写裸表排序表头已被 QRT（.qrt-tbl 自带四态）改用合并，这条规则恒空匹配，留着就是照抄复发入口',
    ).toBe(false);
  });

  it('theme.css 零 .sort-i 裸类（QRT 用自己的 .qrt-sort-i scoped 版）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(
      /\.sort-i(?![\w-])/.test(css),
      'theme.css 仍有 .sort-i 规则；排序图标样式由 QueryResultTable 的 .qrt-sort-i scoped 单源承担',
    ).toBe(false);
  });

  it('theme.css 零 .fade-* 过渡类（R124 路由过渡孤儿；.pop-* 活族不受此限）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(
      /\.fade-(enter|leave|move)/.test(css),
      'theme.css 仍有 .fade-* 规则；路由级过渡 R124 已移除，全站无 name="fade" 消费方（hk-fade/sw-fade 是不同前缀类）。弹层过渡统一走 .pop-*',
    ).toBe(false);
  });

  it('theme.css 零 .ih-type 徽标类（字段类型徽标由 .mft-type 单方承担）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(
      /\.ih-type(?![\w-])/.test(css),
      'theme.css 仍有 .ih-type 规则；全站零消费，字段类型徽标色卡的唯一消费方是 .mft-type',
    ).toBe(false);
  });

  it('theme.css 零 .scroll-x / .tbl-wrap / .card>.tbl 横滚兜底族（R66 区块整体退役）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(
      /\.scroll-x(?![\w-])/.test(css),
      'theme.css 仍有 .scroll-x 规则；模板/TS 全站零消费',
    ).toBe(false);
    expect(
      /\.tbl-wrap(?![\w-])/.test(css),
      'theme.css 仍有 .tbl-wrap 规则；全站零裸 .tbl-wrap 挂载（av-tk-/lc-/ddm-tbl-wrap 是复合类名不命中），窄容器表横滚由表格内核承担',
    ).toBe(false);
    expect(
      /\.card\s*>\s*\.tbl(?![\w-])/.test(css),
      'theme.css 仍有 .card > .tbl 规则；裸 .tbl 直插 card 形态全站零（审计流水已换 QRT），恒空匹配',
    ).toBe(false);
  });

  /* —— views/components 侧：四族不得以 scoped 形态回流 ——
     theme.css 删干净只堵了全局入口；scoped 里重写一份同样恒空（或复活第二套）。 */
  for (const { f, path } of [...vueFiles(viewsDir), ...vueFiles(componentsDir)]) {
    it(`${f} 样式里不写四族死类选择器（任何形态）`, () => {
      const src = strip(readFileSync(path, 'utf8'));
      expect(
        /\.sort-i(?![\w-])|\.ih-type(?![\w-])|\.scroll-x(?![\w-])|\.fade-(enter|leave|move)/.test(src),
        `${f} 样式里出现四族死类（.sort-i/.ih-type/.scroll-x/.fade-*）之一；排序图标走 QRT 的 .qrt-sort-i、字段徽标走 .mft-type、横滚容器走 .tbl-wrap、弹层过渡走 .pop-*`,
      ).toBe(false);
    });

    it(`${f} 模板不挂 .sort-i / .ih-type / .scroll-x 死类`, () => {
      const tpl = strip(readFileSync(path, 'utf8')).split('</template>')[0] ?? '';
      expect(
        /class\s*=\s*["'][^"']*\b(sort-i|ih-type|scroll-x)\b/.test(tpl),
        `${f} 模板挂了死类（sort-i/ih-type/scroll-x）；这些类没有任何样式规则承载，挂了也是裸奔`,
      ).toBe(false);
    });
  }

  /* —— fade 的另一半：全站不许出现裸 name="fade" 过渡（无样式承载=裸奔） —— */
  it('全站无 transition name="fade"（fade 全局规则已退役，新写裸 fade 名拿不到样式）', () => {
    for (const { f, path } of [...vueFiles(viewsDir), ...vueFiles(componentsDir)]) {
      const src = strip(readFileSync(path, 'utf8'));
      expect(
        /name\s*=\s*["']fade["']/.test(src),
        `${f} 出现 <transition name="fade">；.fade-* 全局规则 783 批已退役，弹层过渡用 name="pop"`,
      ).toBe(false);
    }
  });

  /* —— 正向锚：活规则/活消费方必须在场，防「全删绿」—— */
  it('QRT 内核仍自带排序表头四态（内核化自足铁证）', () => {
    const src = readFileSync(join(componentsDir, 'QueryResultTable.vue'), 'utf8');
    expect(src, 'QRT 丢了 .qrt-tbl th.sortable cursor 规则').toContain('.qrt-tbl th.sortable { cursor: pointer; }');
    expect(src, 'QRT 丢了表头 hover 色').toContain('.qrt-tbl th.sortable:hover');
    expect(src, 'QRT 丢了 on 态色').toContain('.qrt-tbl th.on');
    expect(src, 'QRT 丢了排序图标').toContain('.qrt-sort-i');
  });

  it('theme.css 仍保留 .pop-* 弹层过渡活族（15 处 name="pop" 消费）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(css, '.pop-enter-active 丢失——fade 退役时误伤了活族').toContain('.pop-enter-active');
    expect(css, '.pop-leave-active 丢失（离场 pointer-events:none 纪律载体）').toContain('.pop-leave-active');
  });

  it('theme.css 仍保留 .mft-type 字段徽标色卡（五组件消费）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(css, '.mft-type 色卡丢失').toMatch(/\.mft-type\[data-t/);
  });

  it('theme.css 仍保留 .tbl 基础样式族（RT/裸表消费，R66 兜底退役零波及铁证）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(css, '.tbl 基础规则丢失（RT 的 table class="tbl rt-tbl" 消费中）').toMatch(/\.tbl\s*\{\s*width:\s*100%/);
    expect(css, '.tbl td 规则丢失').toMatch(/\.tbl td\s*\{/);
    expect(css, '.tbl.zebra 斑马纹丢失').toMatch(/\.tbl\.zebra/);
  });

  it('theme.css 仍保留 .tbl th.sortable 的同区块活邻居（键盘可达/工具类不受族退役波及）', () => {
    const css = strip(readFileSync(join(srcDir, 'theme.css'), 'utf8'));
    expect(css, 'v3.0.0 键盘可达 focus 环误删——该规则若在族内一并退役须同步核 QRT scoped 焦点样式').toMatch(/th\.sortable:focus-visible|:focus-visible/);
    expect(css, '.dim/.sm-txt 工具类丢失（431 批合并、多视图在用）').toMatch(/\.dim\s*\{/);
  });

  it('App.vue 仍保留 th.sortable 键盘可达委托（JS 域，服务 QRT 表头）', () => {
    const src = readFileSync(join(srcDir, 'App.vue'), 'utf8');
    expect(src, 'App.vue 键盘可达委托丢失——CSS 族退役不应波及 JS 委托').toContain("querySelectorAll('th.sortable')");
  });
});
