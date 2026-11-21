import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* 二百三十九批：可伸缩布局响应式守卫（用户窄视口截图驱动——健康过滤 chips 溢出截断）。
   锁定三类不变量：
   1) 可伸缩侧列宽度必须带视口钳制（min(..., calc(100vw - …)) 双重钳）；
   2) 全站分段控件 .seg 必须可换行（flex-wrap: wrap——窄列不再横向溢出）；
   3) 折叠恢复竖条（ih-rail）样式在场。
   防空跑：断言锚点计数 ≥1。 */
const rt = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const theme = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

describe('可伸缩布局响应式守卫（239 批）', () => {
  /* 五百三十批同步更新：抽屉宽度改三档数据驱动（usePref 记忆，内联 style 承载）——
     原「单档 clamp(400px,32vw,560px)」静态锁退役，改锁：
     ① .ih-left 保留定位 + 86vw 视口钳制不变量（任何档位都不得溢出视口）；
     ② 三档 CSS 全部带钳制（常规/宽 clamp，吃满=86vw 恰为钳制上限）；
     ③ 宽度由 DRAWER_W_TIERS 数据驱动并 usePref 记忆。 */
  it('索引列表抽屉视口钳制（max-width 86vw 不变量 + 三档宽度数据驱动）', () => {
    expect(rt).toMatch(/\.ih-left \{ position: relative; max-width: 86vw;/);
    expect(rt).toMatch(/\.ih-drawer \{ position: fixed; left: 16px; top: 16px; bottom: 16px;/);
    expect(rt).toMatch(/\{ k: 'regular', t: '常规', css: 'clamp\(400px, 32vw, 560px\)' \}/);
    expect(rt).toMatch(/\{ k: 'wide', t: '宽', css: 'clamp\(480px, 40vw, 720px\)' \}/);
    expect(rt).toMatch(/\{ k: 'full', t: '吃满', css: '86vw' \}/);
    expect(rt).toContain("usePref<DrawerWKey>('ih.drawerW', 'regular')");
    expect(rt).toContain(':style="{ width: drawerWCss }"');
  });

  it('全站 .seg 分段控件可换行（theme.css 基类）', () => {
    expect(theme).toMatch(/\.seg \{ display: inline-flex; flex-wrap: wrap;/);
  });

  it('抽屉遮罩与面板样式在场（v3.0.1 替代 ih-rail）', () => {
    expect(rt).toMatch(/\.ih-drawer-mask \{ position: fixed; inset: 0;/);
    expect(rt).toMatch(/\.ih-left \{ position: relative; max-width: 86vw;/);
  });

  /* 五百三十批回补：放大/还原钮 + .fs-active 聚焦面（历史注释声称的形态终于落地）。
     锁三件事：①工具行双态钮（Maximize2/Minimize2 同钮双态）；②聚焦面 fixed inset12 + z-focus；
     ③面内还原钮在场（历史事故防线：放大面盖页头时还原路径必须在面内可点）。 */
  it('放大/还原双态钮与聚焦面（面内还原钮防盖死）', () => {
    expect(rt).toContain('<Maximize2 v-else :size="13" />');
    expect(rt).toContain('<Minimize2 v-if="fsActive" :size="13" />');
    expect(rt).toMatch(/\.ih\.fs-active \{ position: fixed; inset: 12px; z-index: var\(--z-focus, 300\); background: var\(--bg0\); \}/);
    expect(rt).toContain('<button v-if="fsActive" aria-label="还原工作区"');
  });
});

/* ═══ 五百二十四批追加三锚（W3） ═══
   4) 弹窗 max-width 不变量：src 全扫固定 width ≥300px 的样式/内联行，同行必须带 max-width
      视口钳制（现存合法豁免白名单：InsightRail 侧栏 / NotifyCenter 通知面板 / DslQueryView
      exp-pop 就地气泡——非弹窗或自有定位契约）；合并全站最后一个无钳制弹窗
      （DevTools curl 导入 NModal，width:560px 补 max-width:94vw）；
   5) --vh-offset 不变量：禁新增裸 calc(100vh - Npx)——聚焦态一律走
      calc(100vh - var(--vh-offset) + Npx) 收敛式（存量白名单仅 CellContextMenu 菜单 16px）；
   6) AnalyzerLab 五五/四六分屏窄屏（≤1100 标准断点）回单列堆叠。 */
const SRC = join(__dirname, '..');
const listVue = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? listVue(join(dir, d.name)) : d.name.endsWith('.vue') ? [join(dir, d.name)] : []);
const ALL_VUE = [...listVue(join(SRC, 'views')), ...listVue(join(SRC, 'components')), join(SRC, 'App.vue')];
const relOf = (f: string) => f.slice(SRC.length + 1).replace(/\\/g, '/');

describe('五百二十四批：响应式守卫三锚追加', () => {
  const dt524 = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
  const pit524 = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');
  const al524 = readFileSync(join(__dirname, '../views/AnalyzerLabView.vue'), 'utf-8');

  it('锚① 弹窗 max-width 不变量：固定 width ≥300px 行必须同行带 max-width（豁免列白名单）', () => {
    const exemptions = [
      'components/InsightRail.vue', /* 侧栏 rail 固定列宽，非弹窗 */
      'components/NotifyCenter.vue', /* 通知面板自有 fixed 定位契约 */
      'views/DslQueryView.vue', /* exp-pop 就地气泡（absolute 随锚） */
      'views/OverviewView.vue', /* 内联骨架占位条（.sk width:340px），非弹窗 */
    ];
    const hitsByFile = new Map<string, number>();
    for (const f of ALL_VUE) {
      const rel = relOf(f);
      for (const line of readFileSync(f, 'utf-8').split('\n')) {
        /* 窄口径：只抓非 min-/max- 前缀的固定 width（min-width/max-width 自带语义不在锁内） */
        const m = line.match(/(?:^|[^-.\w])width:\s*(\d{3,})px/);
        if (!m || Number(m[1]) < 300) continue;
        hitsByFile.set(rel, (hitsByFile.get(rel) || 0) + 1);
        expect(line.includes('max-width') || exemptions.includes(rel),
          `${rel} 固定宽 ≥300px 无视口钳制：${line.trim()}`).toBe(true);
      }
    }
    /* 防空跑：扫描确实覆盖了源；白名单条目确实仍有命中（失效即应移出清单） */
    expect(hitsByFile.size).toBeGreaterThan(0);
    for (const e of exemptions) {
      expect(hitsByFile.get(e) ?? 0, `白名单 ${e} 已无 ≥300px 命中，请从豁免清单移除`).toBeGreaterThan(0);
    }
    /* 合并锚定：全站最后一块无钳制弹窗（DevTools curl 导入 NModal）已带 94vw */
    expect(dt524).toMatch(/style="width: 560px; max-width: 94vw"/);
  });

  it('锚② --vh-offset 不变量：禁新增裸 calc(100vh - Npx)，聚焦态走收敛式（白名单仅存量）', () => {
    const vhWhitelist = ['components/CellContextMenu.vue'];
    let whitelistHits = 0;
    for (const f of ALL_VUE) {
      const rel = relOf(f);
      for (const line of readFileSync(f, 'utf-8').split('\n')) {
        if (!/calc\(100vh - \d+px\)/.test(line)) continue;
        expect(vhWhitelist, `${rel} 出现裸 vh 偏移（应折算 var(--vh-offset) 口径）：${line.trim()}`).toContain(rel);
        whitelistHits++;
      }
    }
    /* 防空跑：存量白名单确实在场；四处收敛锚定（PIT 预览表 + DevTools 请求/响应面） */
    expect(whitelistHits).toBeGreaterThan(0);
    expect(pit524).toContain("'calc(100vh - var(--vh-offset) + 80px)'");
    expect(dt524).toContain("'calc(100vh - var(--vh-offset) + 120px)'");
    expect(dt524).toContain("'calc(100vh - var(--vh-offset) + 20px)'");
  });

  it('锚③ AnalyzerLab 五五/四六分屏窄屏（≤1100）回单列堆叠（525 批 lane 重构同步更新：duo 档并锁+柄隐藏）', () => {
    expect(al524).toMatch(/@media \(max-width: 1100px\) \{\s*\.al-lanes\.split-half, \.al-lanes\.split-4060, \.al-lanes\.duo \{ grid-template-columns: minmax\(0, 1fr\); \}\s*\.al-lanes :deep\(\.split-handle\) \{ display: none; \}\s*\}/);
  });
});

/* ═══ 五百二十七批追加锚④（W-E） ═══
   901/900 锁步守卫：theme.css @media (min-width: 901px)（.is-row > .il-hint 的 grid-column:2
   限宽约束，避免窄屏单列媒体查询下炸出幽灵列）是全站 max-width: 900px 窄档的**手工补集**——
   两侧数字互为锚，改 900 档（改值/删档）而 901 不同步会静默漏缝（861~900 双判或 901~改后值 漏判）。
   判据（可静态执行）：src 下全部 .vue 与 theme.css 中存在 `max-width: 900px`（豁免清单外）
   ⇒ theme.css 必须存在 `min-width: 901px` 补集。
   豁免清单初始为空：仅登记「用 900px 但确认与 901 补集锁步无关」的特例（备案范式同锚①白名单）；
   TopBar 1280/1000、Aliases 760 是其他档位的 max-width 特例，不匹配本扫描正则、不进本清单。
   补集单源在 theme.css（勿散落视图侧），视图侧若出现 min-width:901px 应合并进 theme.css。 */
describe('五百二十七批：锚④ 901/900 锁步守卫', () => {
  /* 初始为空：尚无「与 901 锁步无关」的 900px 用法登记（登记须附理由，范式同锚①豁免） */
  const LOCKSTEP_EXEMPT_527: string[] = [];

  it('900 窄档在场 ⇒ min-width:901px 补集必须在 theme.css（改档双处同步）', () => {
    const files = [...ALL_VUE, join(SRC, 'theme.css')];
    const hits = files
      .filter(f => !LOCKSTEP_EXEMPT_527.includes(relOf(f)))
      .filter(f => /max-width:\s*900px/.test(readFileSync(f, 'utf-8')))
      .map(relOf);
    /* 防空跑：900 档确实在场（783 批后=视图级 scoped 窄屏档 ≥6 处；theme.css 全局档
       已随 R66 表横滚兜底族退役——兜底两规则恒空匹配，themeDeadFamilies783 看守），
       锁步前提由视图级 900 档承载 */
    expect(hits, '900 视图窄屏档已全站消失——请同步移除 theme.css 的 901 补集并注销本锚').toContain('views/IndexSettingsView.vue');
    expect(hits.length).toBeGreaterThan(3);
    /* 锁步断言：补集必须在场且恰在 theme.css（单源），缺位=有人改 900 档未同步。
       901 补集=IndexSettings .is-row>.il-hint 桌面档，与其 scoped 900 档配对（活） */
    expect(theme).toMatch(/@media \(min-width: 901px\)/);
    expect(theme).not.toMatch(/@media \(max-width: 900px\)/); // 全局档退役（783）；视图级不受此限
  });
});

/* ═══ 五百二十八批追加锚⑤（W-E） ═══
   弹层 :width prop 视口钳制：锚①只扫 CSS `width:\s*Npx` 行，抓不到 naive 组件的
   `:width="620"` prop 数字绑定（ReconcileReportDrawer 620 抽屉在 ≤620px 视口整条溢出，
   锚①零命中假绿）。同口径扩一条：全站 .vue 的 `:width="N{3+}"`（≥300 才入锁）必须
   同行带视口钳制证据（drawer-style maxWidth / style max-width）或入豁免单（备案范式同锚①）。
   豁免单仅收「popper 就地定位的非抽屉弹层」——n-popover 由 popper flip/shift 就地约束，
   不属抽屉/模态整条溢出事故面；SVG 图形 width 是画布尺寸非弹层，且 <300 不达锁线。
   ReconcileReportDrawer(620)/QueryHubView(440) 两抽屉改 computed 94% 视口钳制，不进豁免单。 */
describe('五百二十八批：锚⑤ 弹层 :width prop 视口钳制', () => {
  const rrd = readFileSync(join(__dirname, '../components/ReconcileReportDrawer.vue'), 'utf-8');
  const qh = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');

  it('锚⑤ :width 数字绑定 ≥300 必须同行带钳制或入豁免单（抽屉类合并 computed 94%）', () => {
    const exemptions = [
      'views/AliasesView.vue', /* 别名行筛选 n-popover：popper 就地翻转定位，非抽屉 */
      'views/DslQueryView.vue', /* exp-pop 就地气泡（absolute 随锚，同锚①豁免口径） */
      'views/WatcherView.vue', /* 告警测试 n-popover：popper 就地翻转定位，非抽屉 */
      'views/QueryHubView.vue', /* 五百四十三批：日常场景下拉 n-popover（bottom-start）popper 就地翻转定位，非抽屉 */
    ];
    const hitsByFile = new Map<string, number>();
    for (const f of ALL_VUE) {
      const rel = relOf(f);
      for (const line of readFileSync(f, 'utf-8').split('\n')) {
        const m = line.match(/:width="(\d{3,})"/);
        if (!m || Number(m[1]) < 300) continue;
        hitsByFile.set(rel, (hitsByFile.get(rel) || 0) + 1);
        const clamped = /max-width|drawer-style|:style="\{[^"]*maxWidth/.test(line);
        expect(clamped || exemptions.includes(rel),
          `${rel} 弹层 :width=${m[1]} 无视口钳制（窄视口整条溢出）：${line.trim()}`).toBe(true);
      }
    }
    /* 防空跑：扫描确实覆盖源（IntegrationGuide 560 抽屉自带 drawer-style 钳制恒在场）；
       豁免条目确实仍有命中（失效即应移出清单） */
    expect(hitsByFile.get('components/IntegrationGuide.vue') ?? 0).toBeGreaterThan(0);
    for (const e of exemptions) {
      expect(hitsByFile.get(e) ?? 0, `豁免 ${e} 已无 ≥300px :width 命中，请从豁免清单移除`).toBeGreaterThan(0);
    }
    /* 合并锚定：两抽屉数字字面量退役改 computed 钳制（94% 视口、原宽为上限；
       视口宽走 app store 响应式单源，window 直读在嵌入容器挂载早期会读到 0 并永久缓存） */
    expect(rrd).toContain('const drawerW = computed(() => Math.min(620, Math.round(store.viewportW * 0.94)));');
    expect(qh).toContain('const histDrawerW = computed(() => Math.min(440, Math.round(store.viewportW * 0.94)));');
    expect(rrd).toContain(':width="drawerW"');
    expect(qh).toContain(':width="histDrawerW"');
  });
});
