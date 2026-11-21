/**
 * 五百二十五批（W9）：theme 纪律守卫——token 层 + 排版立直 + 分隔合并 + 微件归一。
 * 判据落在源文本上（happy-dom 不注入 theme.css，渲染后数值断言是死断言，pillSingleTrack 同理）；
 * MetaStrip 自动分隔一节走 createApp 手工 mount 看渲染结果（metaStripExt 同范式）。
 * 覆盖：
 *   ① 展示数字三档 token（--fs-num/--fs-num-l/--fs-num-xl）注册 + 字阶守卫注释声明
 *      展示数字 650+mono+tabular-nums；
 *   ② .pill 语义别名档 .err/.warn/.info（色值与 r/y/b 同源同 token）；
 *   ③ .float-pop.inplace 基座档合并（health scoped 拷贝退役）；
 *   ④ 9px 裸值清零（W9 锁内五处归 --fs-2xs）；
 *   ⑤ MetaStrip 默认插槽前自动补 ms-sep（items 空时不产前导悬挂点）；
 *   ⑥ .chip.xs 迷你档 + SnapshotsView 消费；.ph-tt 650；body 行高 1.5；
 *      pre.json-view/meta-strip 裸字号归 token；.meta-strip .sep 死规则清零；
 *   ⑦ spin 三组件本地 keyframes 退役走全局 .spinning；HealthReportView 大数字消费 token；
 *      SecurityView .card-title 并轨 .card-t（.sm 二档升 theme.css）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const theme = read('theme.css');

describe('525 批 theme 纪律：token 层', () => {
  it('展示数字三档 token 注册：--fs-num 21 / --fs-num-l 28 / --fs-num-xl 44', () => {
    expect(theme, '缺 --fs-num').toMatch(/--fs-num:\s*21px;/);
    expect(theme, '缺 --fs-num-l').toMatch(/--fs-num-l:\s*28px;/);
    expect(theme, '缺 --fs-num-xl').toMatch(/--fs-num-xl:\s*44px;/);
  });

  it('字阶守卫注释声明展示数字消费口径（650 + mono + tabular-nums，禁 700/800）', () => {
    const guard = theme.slice(theme.indexOf('【字阶守卫】'), theme.indexOf('【字阶守卫】') + 900);
    expect(guard).toContain('--fs-num');
    expect(guard).toMatch(/650\s*字重\s*\+\s*var\(--mono\)\s*\+\s*tabular-nums/);
  });

  it('.pill 语义别名档 .err/.warn/.info 在场，且与 r/y/b 同源（--err/--warn/--info 同一对 token）', () => {
    expect(theme).toMatch(/\.pill\.err\s*\{\s*background:\s*var\(--err-soft\);\s*color:\s*var\(--err\);\s*\}/);
    expect(theme).toMatch(/\.pill\.warn\s*\{\s*background:\s*var\(--warn-soft\);\s*color:\s*var\(--warn\);\s*\}/);
    expect(theme).toMatch(/\.pill\.info\s*\{\s*background:\s*var\(--info-soft\);\s*color:\s*var\(--info\);\s*\}/);
    /* 反向锚：单字母五档不许被别名档挤掉（pillColorTrack 的正面锚同口径） */
    for (const k of ['g', 'y', 'r', 'b', 'n']) {
      expect(new RegExp(String.raw`\.pill\.${k}\s*\{`).test(theme), `.pill.${k} 消失`).toBe(true);
    }
  });

  it('.chip.xs 迷你档在场（padding 1px 6px + --r-s 圆角），SnapshotsView 时间线 chip 已消费', () => {
    expect(theme).toMatch(/\.chip\.xs\s*\{\s*padding:\s*1px 6px;\s*border-radius:\s*var\(--r-s\);\s*\}/);
    const sv = read('views/SnapshotsView.vue');
    expect(sv, 'SnapshotsView 时间线索引 chip 必须挂 xs 迷你档').toContain('class="chip xs mono');
    expect(sv, '本地 .chip 迷你散写必须退役').not.toMatch(/\.sv-tl-chips \.chip\s*\{[^}]*padding/);
  });
});

describe('525 批 theme 纪律：分隔与浮层基座', () => {
  it('.float-pop.inplace 基座档在场；HealthReportView scoped 拷贝退役', () => {
    expect(theme).toMatch(/\.float-pop\.inplace\s*\{\s*position:\s*absolute;\s*top:\s*100%;\s*left:\s*0;\s*min-width:\s*100%;\s*\}/);
    const hr = read('views/HealthReportView.vue');
    expect(hr, '.hr-pop.inplace scoped 拷贝必须退役（归 theme.css 基座）').not.toMatch(/\.hr-pop\.inplace\s*\{/);
  });

  /* 五百三十五批反转：末条正向锁随 theme.css 全局块整块退役改为不回潮负向锁（sweep524 Ilm 先例形态） */
  it('.meta-strip .sep 死规则清零；全局块整块退役不回潮（535 批反转，原 flex/gap 基线正向锁随之退役）', () => {
    expect(theme, '.meta-strip .sep 死规则必须删除').not.toMatch(/\.meta-strip \.sep/);
    expect(theme, 'meta-strip 块不许残留裸 11px').not.toMatch(/\.meta-strip[^{]*\{[^}]*11px/);
    expect(theme, '.meta-strip 全局块必须整块退役（theme.css 不许回潮，形态归 MetaStrip 组件 .ms）').not.toMatch(/\.meta-strip/);
  });

  it('裸值合并：body 行高 1.55→1.5；pre.json-view 12px→var(--fs-sm)', () => {
    expect(theme).toMatch(/font:\s*13px\/1\.5\s+var\(--font\)/);
    expect(theme, 'body 行高不许回 1.55').not.toMatch(/font:\s*13px\/1\.55/);
    expect(theme).toMatch(/pre\.json-view\s*\{\s*margin:\s*0;\s*font:\s*var\(--fs-sm\)\/1\.6\s+var\(--mono\)/);
  });
});

describe('525 批 theme 纪律：排版立直', () => {
  it('页头 .ph-tt 字重 650（与 .card-t 同档，靠 16 vs 13 字号拉开）', () => {
    const ph = read('components/PageHeader.vue');
    expect(ph).toMatch(/\.ph-tt\s*\{[^}]*font-weight:\s*650/);
    expect(ph, '600 旧档不许回流').not.toMatch(/\.ph-tt\s*\{[^}]*font-weight:\s*600/);
  });

  it('9px 裸值清零（W9 锁内五处归 --fs-2xs）', () => {
    for (const f of ['views/DiagView.vue', 'views/LiveDashboardView.vue', 'components/ClusterSwitcher.vue', 'components/ExplainTree.vue']) {
      const s = read(f);
      expect(s, `${f} 仍有 font-size: 9px 裸值（低于 --fs-2xs 自守卫下限）`).not.toContain('font-size: 9px');
    }
    /* 五百二十五批 W5：.dg-role-chip 角色章随 DiagView 节点表换 QRT 壳退役（角色列改全量
       角色串纯文本），原「角色章默认字色提 --tx1」专项断言随之退役——9px 裸值清零守卫保留 */
  });

  it('HealthReportView 大数字消费 --fs-num-xl；SecurityView .card-title 并轨 .card-t（.sm 升 theme.css）', () => {
    const hr = read('views/HealthReportView.vue');
    expect(hr).toMatch(/\.hr-score-n\s*\{[^}]*font-size:\s*var\(--fs-num-xl\)/);
    const sec = read('views/SecurityView.vue');
    /* 精确形态判据：模板挂载点与 CSS 选择器都不许再有旧名（注释里的文档性提及不算） */
    expect(sec, '模板 .card-title 挂载点必须退役').not.toMatch(/class="card-title/);
    expect(sec, '.card-title CSS 选择器必须退役').not.toMatch(/\.card-title\s*[,{]/);
    expect(sec, '模板必须挂全局 .card-t').toContain('class="card-t"');
    expect(theme, 'theme.css 必须提供 .card-t.sm 二档').toMatch(/\.card-t\.sm\s*\{[^}]*font-size:\s*var\(--fs-sm\);[^}]*font-weight:\s*600/);
    /* 表头字重回 600 基线：scoped .tbl th 不再写 font-weight 覆写 */
    expect(sec, '.tbl th 的 font-weight:400 覆写必须删').not.toMatch(/\.tbl th\s*\{[^}]*font-weight/);
  });
});

describe('525 批 theme 纪律：spin 合并', () => {
  it('ClusterSwitcher/LoginOverlay/GuardedActionButton 本地 keyframes 退役，统一全局 .spinning', () => {
    expect(theme, '全局 .spinning 必须在场（spinUnify428 同锚）').toMatch(/\.spinning\s*\{\s*animation:\s*rot 1s linear infinite;\s*\}/);
    for (const [f, kf] of [
      ['components/ClusterSwitcher.vue', 'cs-spin'],
      ['components/LoginOverlay.vue', 'lo-rot'],
      ['components/GuardedActionButton.vue', 'ga-spin'],
    ] as const) {
      const s = read(f);
      /* 精确形态判据：@keyframes 定义与 animation 引用都不许再出现（注释里的文档性提及不算） */
      expect(s, `${f} 本地旋转 keyframes（${kf}）必须退役`).not.toMatch(new RegExp('@keyframes\\s*' + kf));
      expect(s, `${f} 不得再引用本地旋转动画`).not.toMatch(new RegExp('animation:[^;}]*' + kf));
      expect(s, `${f} 必须消费全局 .spinning`).toContain('spinning');
    }
  });
});

/* ═══ 528 批守卫扩容：字重 650 上限约定防回流 + 裸 b/strong 默认 bold 越轨典型位 ═══
 * 裁决记录：选择扩本 spec 而非新建——「font-weight 裸 700/800 清零」与 525 批已立的
 * 「650 为全站字重上限」守卫注释（字阶守卫块）同属 theme 纪律域，同文件同域避免守卫碎片化；
 * 既有断言零触碰，仅末尾追加 describe。
 *
 * ① 「font-weight 裸 700/800 全站断言」：扫 styles(theme.css) 与全部组件/视图 style 块，
 *    不得出现 font-weight: 700/800 字面（现全站 0 处，523 批「700·800 全站归 650」合并后的
 *    防回流锁）。裸 <b>/<strong> 的浏览器默认 bold≈700 不产生字面、抓不到——由 ② 的典型位
 *    显式 650 断言兜住高价值点位（数字徽标），其余文案强调位豁免备案（W-D 528 报告）。
 * ② 裸 b 默认 bold 越轨典型位：五个数字徽标消费点必须显式 font-weight: 650
 *    （TookBadge 耗时徽标 / RankDebug A·B 得分 / AnalyzerLab token 计数 / SynonymsManager
 *    解析计数 / ProfileFlame 摘要四格——最后者 525 前已 650，锁防回流）。
 */
import { readdirSync, statSync } from 'node:fs';

function walkVueCss(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkVueCss(p));
    else if (name.endsWith('.vue') || name.endsWith('.css')) out.push(p);
  }
  return out;
}

describe('528 批：字重 650 上限防回流 + 裸 b 默认 bold 越轨典型位', () => {
  it('全站（theme.css + 全部 .vue style 块）无 font-weight: 700/800 字面', () => {
    const files = walkVueCss(SRC);
    expect(files.length, '扫描面不得为空（目录结构变更时修 walk 根）').toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf-8');
      if (/font-weight:\s*[78]00\b/.test(s)) offenders.push(f);
    }
    expect(offenders, `发现裸 700/800 字面（须归 650）：${offenders.join(', ')}`).toEqual([]);
  });

  it('数字徽标裸 b 典型位显式 650（浏览器默认 bold≈700 越过 650 上限）', () => {
    /* TookBadge：整件是 b 元素徽标，唯一规则必须带 650 */
    expect(read('components/TookBadge.vue')).toMatch(/\.took-badge\s*\{[^}]*font-weight:\s*650/);
    /* RankDebug：A/B 对决得分 b（mono 数字） */
    expect(read('views/RankDebugView.vue')).toMatch(/\.rd-duel-side b\s*\{[^}]*font-weight:\s*650/);
    /* AnalyzerLab：lane token 计数合并 MetaStrip 统一件（五百三十一批）——裸 b 与其 650
       局部规则退役，计数 b 由统一件 .ms b（600，低于 650 上限）承担，改锁改用锚 */
    expect(read('views/AnalyzerLabView.vue')).toMatch(/<MetaStrip[^>]*class="al-lane-meta"/);
    /* SynonymsManager：解析/忽略计数 b */
    expect(read('views/SynonymsManagerView.vue')).toMatch(/\.sy-stat b\s*\{[^}]*font-weight:\s*650/);
    /* ProfileFlame：摘要四格大数字 b（525 批已归 650，防回流） */
    expect(read('views/ProfileFlameView.vue')).toMatch(/\.pf-sum-cell b\s*\{[^}]*font-weight:\s*650/);
  });

  it('528 批字距两档注册且既有消费合并（.card-t/.tbl th）；px 级微调豁免保字面', () => {
    expect(theme, '缺 --ls-tight').toMatch(/--ls-tight:\s*\.01em;/);
    expect(theme, '缺 --ls-wide').toMatch(/--ls-wide:\s*\.02em;/);
    expect(theme, '.card-t 字距须消费 --ls-tight').toMatch(/\.card-t\s*\{[^}]*letter-spacing:\s*var\(--ls-tight\)/);
    expect(theme, '.tbl th 字距须消费 --ls-wide').toMatch(/\.tbl th\s*\{[^}]*letter-spacing:\s*var\(--ls-wide\)/);
    /* 豁免备案（保字面）：.nf-code 404 展示宽距 4px、.cs-env 徽章微距 .3px——px 级字距族不入 em 梯 */
    expect(read('views/NotFoundView.vue')).toMatch(/letter-spacing:\s*4px/);
  });
});

/* ═══ MetaStrip 默认插槽自动分隔（渲染结果判据，metaStripExt 手工 mount 范式）═══ */
async function mountStrip(items: unknown[], withSlot: boolean) {
  const host = document.createElement('div');
  const MetaStrip = (await import('../components/MetaStrip.vue')).default;
  const app = createApp({
    render: () => h(MetaStrip, { items } as any, withSlot ? { default: () => h('span', { class: 'slot-probe' }, '插槽段') } : {}),
  });
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  return { host, cleanup: () => app.unmount() };
}

describe('525 批：MetaStrip 默认插槽前自动补段间分隔', () => {
  it('items 非空 + 插槽：ms-sep = items 间 (n-1) + 插槽前 1', async () => {
    const { host, cleanup } = await mountStrip([{ value: 1 }, { value: 2 }, { value: 3 }], true);
    expect(host.querySelectorAll('.ms-sep').length).toBe(3);
    expect(host.querySelector('.slot-probe')).toBeTruthy();
    cleanup();
  });

  it('items 为空 + 插槽：插槽即首段，不产前导悬挂点', async () => {
    const { host, cleanup } = await mountStrip([], true);
    expect(host.querySelectorAll('.ms-sep').length).toBe(0);
    expect(host.querySelector('.slot-probe')).toBeTruthy();
    cleanup();
  });

  it('无插槽：分隔数维持 items 间 n-1（既有消费不受自动档影响）', async () => {
    const { host, cleanup } = await mountStrip([{ value: 1 }, { value: 2 }], false);
    expect(host.querySelectorAll('.ms-sep').length).toBe(1);
    cleanup();
  });
});
