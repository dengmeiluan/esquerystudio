/**
 * 六百三十四批【概览】质感第一刀：627 批 R75 差距 G12/G13/G14 同批落码（全前端零 Java）。
 *
 *  G12 拆胞满编：ov-grid 自 3 胞 → 4 胞（「健康分布」「最近作业」分家）——1600 四列约定下
 *      原 3 胞令第 4 列整列空置；拆胞后四列满编。3 列区间（1101~1599）4 胞会余 1 胞孤悬
 *      次行左侧 → 「最近作业」整行横跨（同时治作业列被压 1/3 宽的拥挤）。
 *  G13 筛选行紧凑横排：`.ov-mh-filters .inp` 容器级宽度约束——theme.css `.inp` width:100%
 *      全局下容器无宽度约束，三件曾各吃一整行（~430px 纵向堆叠）。
 *  G14 健康词汇单源：KPI 集群状态 / 健康分布 / MH 状态 pill / 状态 option 四处接
 *      `CLUSTER_HEALTH_ZH`（esEnumZh 单源；HealthReportView #cell-health 534 约定同源），
 *      raw 枚举留 title/tip 保检索——原三形态（小写 green / 大写 RED / GREEN）不统一。
 *
 *  判据=源码锁：happy-dom 无布局计算、scoped style 不参与计算，列宽/同行/横向位置类
 *  断言在单测里是死断言，故「4 胞满编」「三件同行」由真机 probe-634-overview 兜底
 *  （S1 满编 trailingGap / S2 整行横跨 / S4 同 top 单行），本 spec 只锁结构与字面。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const ov = readFileSync(join(SRC, 'views/OverviewView.vue'), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('六百三十四批 G12：概览网格拆胞满编', () => {
  it('ov-grid 自 3 胞拆为 4 胞（健康分布 / 最近作业 分家）', () => {
    /* 计数口径：三裸胞 + 一 ov-jobs 修饰胞 = 网格四胞（.ov-mh 监控历史分区非网格胞，不入数） */
    const gridCells = ov.match(/class="ov-cell"|class="ov-cell ov-jobs"/g) || [];
    expect(gridCells.length, '四胞同锚').toBe(4);
    expect(ov, '最近作业独立胞锚').toContain('class="ov-cell ov-jobs"');
    expect(strip(ov), '最近作业自卡内分节档升为胞头档（.card-t）')
      .toContain('<div class="card-t"><History :size="13" /> 最近作业</div>');
    expect(strip(ov), '健康分布仍为胞头档').toContain('<div class="card-t"><Activity :size="13" /> 健康分布</div>');
  });

  it('拆胞不动网格约定（obsStack530 基线锁原样：基 3 列 + 1600 四列）', () => {
    expect(ov).toMatch(/\.ov-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(ov).toMatch(/@media \(min-width: 1600px\) \{\s*\n\s*\.ov-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
  });

  it('3 列区间（1101~1599）「最近作业」整行横跨——避拆胞后孤悬次行', () => {
    expect(ov).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1599px\) \{\s*\n\s*\.ov-jobs \{ grid-column: 1 \/ -1; \}/);
  });
});

describe('六百三十四批 G13：监控历史筛选行紧凑横排', () => {
  it('.ov-mh-filters .inp 容器级宽度约束在场（width:auto + flex 档 + min-width 保底）', () => {
    expect(ov).toMatch(/\.ov-mh-filters \.inp \{ width: auto; flex: 0 1 178px; min-width: 150px; \}/);
  });

  it('满宽堆叠退回即红（裸 min-width 单条旧形态不得回潮）', () => {
    expect(ov).not.toMatch(/\.ov-mh-filters \.inp \{ min-width: 150px; \}/);
  });
});

describe('六百三十四批 G14：健康词汇 CLUSTER_HEALTH_ZH 单源接线', () => {
  it('单源 import 在场（esEnumZh 黑名单只消费不新增符号）', () => {
    expect(ov).toContain("import { jobStatusZh, clusterHealthZh } from '../utils/esEnumZh';");
  });

  it('健康分布：裸英文换单源中文主显；raw 键保留下钻与检索', () => {
    expect(ov).toContain('{{ clusterHealthZh(h.name) || h.name }}');
    expect(ov, '下钻 raw 键零触').toMatch(/@click="goHealth\(h\.name\)"/);
    expect(ov, 'raw 键仍在 title').toMatch(/:title="'查看 ' \+ h\.name \+ ' 索引清单'"/);
  });

  it('KPI 集群状态：单源中文主显 + raw 枚举入 tip', () => {
    expect(ov).toContain('clusterHealthZh(clusterHealth.value?.status) || clusterHealth.value?.status');
    expect(ov).toMatch(/tip: String\(clusterHealth\.value\?\.status \|\| ''\)\.toUpperCase\(\)/);
  });

  it('预警条：中文主体 + 原枚举括注（533 约定同语言）', () => {
    expect(ov).toContain("集群状态 ${clusterHealthZh('red')}（RED）");
    expect(ov).toContain("集群状态 ${clusterHealthZh('yellow')}（YELLOW）");
    expect(strip(ov), '裸英文预警主体退役').not.toContain('集群状态 RED');
    expect(strip(ov), '裸英文预警主体退役').not.toContain('集群状态 YELLOW');
  });

  it('MH 状态 pill：单源中文 label + raw title（tone 口径 mhTone 零触）', () => {
    expect(ov).toContain(':label="clusterHealthZh(value) || String(value)" :title="String(value)"');
  });

  it('状态筛选项：单源派生（中文主显 + 原枚举括注），option value 契约不变', () => {
    expect(ov).toContain("const MH_STATUS_OPTS = ['GREEN', 'RED'].map(v => ({ v, label: `${clusterHealthZh(v)}（${v}）` }));");
    expect(ov).toContain('<option v-for="o in MH_STATUS_OPTS" :key="o.v" :value="o.v">{{ o.label }}</option>');
  });
});

describe('六百三十四批：拆胞/接线回归护栏（既有锁零迁移面）', () => {
  it('mhTone / watch / 时间偏好键 三处字面原样（monitorHistoryPanel 契约不破）', () => {
    expect(ov).toContain("function mhTone(s: string): 'g' | 'r' | 'n' { return s === 'GREEN' ? 'g' : s === 'RED' ? 'r' : 'n'; }");
    expect(ov).toContain('watch([mhConn, mhStatus, mhRange], () => { void loadHistory(); });');
    expect(ov).toContain("usePref<string>('live.histRange', '24h')");
  });

  it('最近作业胞内容零触（TimeCell / EmptyState / StatusPill en 档锚原样）', () => {
    expect(ov).toMatch(/<TimeCell class="ov-job-time" :ts="j\.updateTime \|\| j\.createTime" \/>/);
    expect(ov).toContain('<EmptyState v-else compact :icon="History" text="暂无作业记录"');
    expect(ov).toContain(':en="jobStatusZh(j.status) ? j.status : undefined"');
  });

  it('键盘可达五处 role/tabindex/Enter+Space 成对契约不变（spaceKeyPair373 计数）', () => {
    /* 1439g：四行改统一 onOvKey，显式 Space 只剩拓扑入口；Enter/Space 语义在 handler 内 */
    expect((ov.match(/@keydown\.space\.prevent=/g) ?? []).length, 'Space 绑定数').toBe(1);
    expect(ov).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
    expect(ov, '五处下钻卡 role=button 齐备').toMatch(/<div class="ov-topo" role="button" tabindex="0"/);
  });

  it('分节样式与三处 EmptyState 在场（flattenWave554 / emptyStateSweep 契约）', () => {
    expect(ov).toContain('.ov-cell { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }');
    expect(ov).toContain('<EmptyState v-if="!topBySize.length"');
    expect(ov).toContain('<EmptyState v-if="!topByDocs.length"');
  });

  it('扁平化禁令不回潮（本地 meta 定义 / ov-h-dot / ov-st-en 三负锁）', () => {
    /* 剥注释口径：历史备案注释里的类名字面不算数（unifyWave561 codeOf / flattenWave554 strip 同一教训） */
    expect(strip(ov)).not.toMatch(/\.ov-meta[\s{.:]/);
    expect(strip(ov)).not.toContain('ov-h-dot');
    expect(strip(ov)).not.toContain('ov-st-en');
  });
});
