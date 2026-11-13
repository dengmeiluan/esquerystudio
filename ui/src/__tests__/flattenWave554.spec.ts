/**
 * 五百五十四批（工蚁D）：全站扁平化·去壳扫荡。静态源码断言仿 flattenWave546/550/551/552 范式。
 *
 * ① SecurityView 四张顶层 .card（我的账号/用户管理/控制集群/审计流水）退壳——border-top
 *    分节承接（约定④；XmigrateView xm-new/xm-res 551 先例同语言），card-t 行首横排保留。
 * ② OverviewView 三卡（Top10×2/健康）退壳 border-top 分节；空态 EmptyState 直贴不留整块
 *    空框；ov-alerts 摘 .card 保 sev 色带（语义边框豁免）；ov-topo 交互带同退。
 * ③ DiagView 巨型观测卡退壳 border-top 分节。
 * ④ TopologyView tp-canvas/tp-palette 两 .card 退壳（552 只退了 tp-bar）。
 * ⑤ AnalyzeView av-bar card 工具条卡退壳（552 is-bar/ss-bar/tp-bar 同族漏网）——裸行
 *    border-bottom 分界。
 * ⑥ IndexSettingsView is-raw/ir-card 两残壳退（552 只退了 is-form）；MappingView 右列
 *    「类型分布/Settings」双 .card 退（左栏 547 已裸，同页双标根治）。
 * ⑦ SearchTemplatesView 三 .st-card 退壳：编辑器外框退役（约定③，st-card-hd border-bottom
 *    承接分界）。
 * ⑧ ScoreExplainView se-card / MatchMatrixView mm-card JsonArea 编辑器外框退役
 *    （⚠脚本零触：se/mm 脚本段零改动，QRT import/表格结构零触）。
 * ⑨ WatcherView wt-card / FavoritesView fv-card 列表项卡带框降层为 border-top 行
 *    （slm-card 551 先例：悬停反馈由顶部 hairline 变色承接）。
 * ⑩ --sp 合并四刀：st-list-empty/nf-card「34px 16px」→「34px var(--sp-4)」（34px 空态
 *    契约保字面）；mm-busy「gap:6px」→var(--sp-1h)「padding:14px 16px」→「14px var(--sp-4)」
 *    （14px 无档位刻值保字面）；wt-act「padding:1px 6px」→「1px var(--sp-1h)」（1px 边框豁免）。
 *
 * 范围铁律：纯视觉层重构——display 流向零变动（退壳不改高度结构）、<script> 段零触
 * （ScoreExplain/MatchMatrix 脚本零触）、语义边框（err 红框/sev 色带）豁免保留。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('五百五十四批①：SecurityView 四张顶层 .card 退壳 → border-top 分节', () => {
  const s = read('../views/SecurityView.vue');
  it('全局 .card 壳类消费清零（模板全形态）；card-t 行首横排标题保留', () => {
    expect(strip(s), 'card 壳类退役').not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    expect(s, '卡头档消费保留').toContain('class="card-t"');
  });
  it('四分节新锚在场（me/us/ctl/audit），border-top + 原卡 padding 迁入（盒模型等值）', () => {
    expect(s).toContain('<div class="me-card">');
    expect(s).toContain('<div class="us-card">');
    expect(s).toContain('<div class="ctl-card">');
    expect(s).toContain('<div class="audit-card">');
    expect(s, '分节流样式锚（border-top 承接 + 14px var(--sp-4) 等值迁入）')
      .toContain('.me-card, .us-card, .ctl-card, .audit-card { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }');
  });
});

describe('五百五十四批②：OverviewView 三卡/交互带/预警条退壳', () => {
  const s = read('../views/OverviewView.vue');
  it('全局 .card 壳类消费清零；四网格分节 ov-cell 锚在场', () => {
    expect(strip(s), 'card 壳类退役').not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    /* 六百三十四批 G12 同步更新：三胞 → 四胞（「健康分布」「最近作业」分家，1600 四列满编）——
       判别力同步更新=计数 4（三裸胞 + ov-jobs 修饰胞；.ov-mh 非网格胞不入数）+ ov-jobs 独立胞锚
       （拆胞形态锁在 overviewPolish634.spec.ts） */
    expect((s.match(/class="ov-cell"|class="ov-cell ov-jobs"/g) || []).length, '四胞同锚').toBe(4);
    expect(s, '最近作业独立胞锚（634 拆胞）').toContain('class="ov-cell ov-jobs"');
    expect(s, '分节流样式锚').toContain('.ov-cell { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }');
  });
  it('空态 EmptyState 直贴三处在场（空态不留整块空框）', () => {
    expect(s).toContain('<EmptyState v-if="!topBySize.length"');
    expect(s).toContain('<EmptyState v-if="!topByDocs.length"');
    expect(s).toContain('<EmptyState v-else compact :icon="History"');
  });
  it('ov-alerts 摘 .card 保 sev 色带（语义边框豁免）；ov-topo 交互带同退', () => {
    expect(s).toContain('class="ov-alerts"');
    expect(s).toContain('class="ov-topo"');
    expect(s, 'sev 色带语义边框保留').toContain('.ov-alerts.sev-r { border-color:');
    expect(s, 'sev 色带语义边框保留').toContain('.ov-alerts.sev-y { border-color:');
    expect(s, '交互带分节 hairline 在场').toMatch(/\.ov-topo \{[^}]*border-top: 1px solid var\(--border\);/);
  });
});

describe('五百五十四批③：DiagView 巨型观测卡退壳 → border-top 分节', () => {
  const s = read('../views/DiagView.vue');
  it('全局 .card 壳类消费清零；dg-ops 分节锚在场（padding 迁入盒模型等值）', () => {
    expect(strip(s), 'card 壳类退役').not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    expect(s).toContain('<div class="dg-ops">');
    expect(s, '分节流样式锚').toContain('.dg-ops { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }');
  });
});

describe('五百五十四批④：TopologyView tp-canvas/tp-palette 两 .card 退壳', () => {
  const s = read('../views/TopologyView.vue');
  it('canvas/palette card 壳退役；本类 padding 原样保留（自带 padding 零触）', () => {
    expect(strip(s), 'card 壳类退役').not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    expect(s).toContain('class="tp-canvas"');
    expect(s).toContain('class="tp-palette"');
    expect(s, '画布 padding 零触').toContain('.tp-canvas { padding: var(--sp-4); min-height: 300px;');
    expect(s, '画布分节 hairline 在场').toMatch(/\.tp-canvas \{[^}]*border-top: 1px solid var\(--border\);/);
    expect(s, '调色板分节 hairline 在场').toMatch(/\.tp-palette \{[^}]*border-top: 1px solid var\(--border\);/);
  });
});

describe('五百五十四批⑤：AnalyzeView av-bar card 工具条卡退壳（552 同族漏网）', () => {
  const s = read('../views/AnalyzeView.vue');
  it('裸行 + border-bottom 分界（is-bar/ss-bar/tp-bar 552 先例同语言）', () => {
    expect(strip(s), 'card 壳类退役').not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    expect(s).toContain('class="av-bar"');
    expect(s, 'border-bottom 分界在场').toContain('.av-bar { padding: var(--sp-2h) 0; border-bottom: 1px solid var(--line);');
  });
});

describe('五百五十四批⑥：IndexSettingsView is-raw/ir-card 残壳退 + MappingView 右列双卡退', () => {
  it('IndexSettingsView：is-raw/ir-card 壳退役，border-top 分节承接（552 is-form 同页同语言）', () => {
    const s = read('../views/IndexSettingsView.vue');
    expect(strip(s), 'card 壳类退役').not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    expect(s).toContain('class="is-raw"');
    expect(s).toContain('class="ir-card"');
    expect(s, 'is-raw 分节 hairline 在场').toMatch(/\.is-raw \{[^}]*border-top: 1px solid var\(--border\);/);
    expect(s, 'ir-card 分节 hairline 在场').toMatch(/\.ir-card \{[^}]*border-top: 1px solid var\(--border\);/);
  });
  it('MappingView：右列类型分布/Settings 双 .card 退（左栏 547 已裸，同页双标根治）', () => {
    const s = read('../views/MappingView.vue');
    expect(strip(s), 'card 壳类退役').not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    /* 五百六十二批同步更新：Settings 迁出窄右栏→全宽折叠节后，右栏只剩类型分布一分节
       （迁移锁=新形态 mappingSettings562.spec.ts 在档） */
    expect((s.match(/class="mp-sec"/g) || []).length, '右列一分节（类型分布独占）').toBe(1);
    expect(s, '分节流样式锚').toContain('.mp-sec { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }');
  });
});

describe('五百五十四批⑦：SearchTemplatesView 三 .st-card 退壳（编辑器外框退役·约定③）', () => {
  const s = read('../views/SearchTemplatesView.vue');
  it('st-card 框壳（border+radius）退役；分界归 st-card-hd border-bottom 承接', () => {
    expect(s, '框壳退役').toContain('.st-card { border: 0; border-radius: 0; overflow: hidden; }');
    expect(strip(s), 'border 框不再现').not.toMatch(/\.st-card \{[^}]*border: 1px solid/);
    expect(s, '卡头 border-bottom 分界保留').toMatch(/\.st-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });
});

describe('五百五十四批⑧：ScoreExplain se-card / MatchMatrix mm-card 编辑器外框退役（脚本零触）', () => {
  it('ScoreExplainView：se-card 框壳退役（se-card-hd border-bottom 承接）', () => {
    const s = read('../views/ScoreExplainView.vue');
    expect(s, '框壳退役').toContain('.se-card { border: 0; border-radius: 0; overflow: hidden; display: flex; flex-direction: column; flex: none; }');
    expect(s, '卡头 border-bottom 分界保留').toMatch(/\.se-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
  });
  it('MatchMatrixView：mm-card 框壳退役；布局/拖拽语义（flex:none/resize/min-height）零触', () => {
    const s = read('../views/MatchMatrixView.vue');
    expect(s, '框壳退役').toContain('.mm-card { overflow: hidden; display: flex; flex-direction: column; flex: none; min-height: 200px; resize: vertical; }');
    expect(s, '卡头 border-bottom 分界保留').toMatch(/\.mm-card-hd \{[^}]*border-bottom: 1px solid var\(--border\);/);
    expect(s, 'QRT import 零触').toContain("import QueryResultTable from '../components/QueryResultTable.vue';");
  });
});

describe('五百五十四批⑨：Watcher wt-card / Favorites fv-card 列表项卡降层 border-top 行（slm-card 先例）', () => {
  it('WatcherView：panel 底+全框+radius 退役 → padding var(--sp-3) 0 + border-top hairline', () => {
    const s = read('../views/WatcherView.vue');
    expect(s, '降层新形态').toContain('.wt-card { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3) 0; border-top: 1px solid var(--border-subtle); }');
    expect(s, 'hover 反馈由 hairline 变色承接').toContain('.wt-card:hover { border-color: var(--brand); }');
    expect(s, '1100 堆叠档零触').toMatch(/\.wt-card \{ flex-direction: column; \}/);
  });
  it('FavoritesView：同款降层；点选/命中态（fv-sel/hit-cur）语义边框豁免保留', () => {
    const s = read('../views/FavoritesView.vue');
    expect(s, '降层新形态').toContain('.fv-card { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3) 0; border-top: 1px solid var(--border-subtle); }');
    expect(s, '点选态保留').toMatch(/\.fv-card\.fv-sel \{/);
    expect(s, '命中态保留').toMatch(/\.fv-card\.hit-cur \{/);
  });
});

describe('五百五十四批⑩：--sp 合并四刀（刻值豁免保字面）', () => {
  it('空态契约 34px 保字面（nf-card）；st-list-empty 死码随 561 批退役（负锁防回流）', () => {
    /* 五百六十一批同步更新：.st-list-empty 死码规则立删（557 批已清模板消费），改负锁防回流
       （剥注释口径同 flattenWave556——历史备案注释里的字面不算数） */
    const stripped = read('../views/SearchTemplatesView.vue')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    expect(stripped).not.toMatch(/\.st-list-empty/);
    expect(read('../views/NotFoundView.vue')).toMatch(/\.nf-card \{[^}]*padding: 34px var\(--sp-4\);/);
  });
  it('mm-busy 混合刻值行合并（6px→--sp-1h；14px 刻值保字面、16px→--sp-4）', () => {
    expect(read('../views/MatchMatrixView.vue')).toMatch(/gap: var\(--sp-1h\); padding: 14px var\(--sp-4\);/);
  });
  it('wt-act 微型内衬 1px 边框豁免保字面、6px 收 --sp-1h', () => {
    expect(read('../views/WatcherView.vue')).toMatch(/padding: 1px var\(--sp-1h\);/);
  });
});
