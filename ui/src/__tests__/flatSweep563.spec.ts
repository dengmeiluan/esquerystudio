/**
 * 五百六十三批·轨4（轨4道侣·全站扁平化扫荡）：第七波残量清账 · 契约备案。
 *
 * 仿 flattenWave546 静态源码断言范式（happy-dom 不挂载）。534 轨4 开账以来七波扫荡后，
 * 30 views 独占域残量清单（全量审计记 docs/GOAL-534-563-FLAT-SWEEP.md）：
 * ① FavoritesView fv-prefs / HealthReportView hr-diff 两处 dashed 大容器框退役（刀④）
 *    → border-top 分节承接（556 ws-w / 554 hr-sec 同语言）；hr-diff 模板类名被
 *    healthDiff.spec.ts:28 字面锁——只动 CSS 不动模板。
 * ② 代码面 border 残量四处摘除（df-code/hr-code/tg-c-code 全站「bg+radius 无 border」
 *    代码面语言）：DiagView dg-alloc-pre/dg-hot-pre、PluginsView pl-code、
 *    SnapshotsView sv-form-preview（模态卡内嵌预览框降一层）。
 * ③ SnapshotsView sv-prog 行内进度面板框三件退役——bg1 面保留作分组语义
 *    （.sv-tl-row 无底色；obsProgress533 挂载锁只锚 .sv-prog-fill 不涉壳）。
 * ④ ConfigDriftView cd-ns-kids 子键组 dashed 盒退役——gap/padding 缩进分组语义保留。
 * ⑤ OverviewView ov-job-time 手写「:title=fmtTime + relTime(…, now)」合并 R99 TimeCell
 *    统一件（列内相对+悬浮绝对同构）；孤儿 import（fmtTime/relTime/useNow）同步更新清除。
 *
 * 范围铁律：纯 CSS chrome 退役 + 组件单源合并——模板结构/高度链（定高字面/max-height/
 * vh 档）零变动；语义边框（err/warn/info 警示条）与浮层壳（bw-ld/sv-tl-json/tp-tip）
 * 豁免保留； PitScrollView pt-card-hd 四头条（flattenWave538/550 锁）与 PluginsView
 * pl-mo-b（flattenWave546 豁免册）禁动已备案。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① dashed 大容器框退役 ×2 → border-top 分节 ═══════════ */

describe('五百六十三批①：fv-prefs / hr-diff dashed 容器框退役（刀④ border-top 承接）', () => {
  it('FavoritesView fv-prefs：dashed 框+圆角不回流；border-top 分节形在场', () => {
    const fv = read('../views/FavoritesView.vue');
    expect(fv, 'fv-prefs dashed 框不回流').not.toMatch(/\.fv-prefs \{[^}]*dashed/);
    expect(fv, 'fv-prefs 圆角壳不回流').not.toMatch(/\.fv-prefs \{[^}]*border-radius/);
    expect(fv, '556 ws-w 同款 border-top 分节形在场')
      .toMatch(/\.fv-prefs \{ margin-top: var\(--sp-4\); border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
  });

  it('HealthReportView hr-diff：dashed 框+圆角不回流；border-top 分节形在场；模板类名保活', () => {
    const hr = read('../views/HealthReportView.vue');
    expect(hr, 'hr-diff dashed 框不回流').not.toMatch(/\.hr-diff \{[^}]*dashed/);
    expect(hr, 'hr-diff 圆角壳不回流').not.toMatch(/\.hr-diff \{[^}]*border-radius/);
    expect(hr, 'hr-sec 636 同款 border-top 分节形在场')
      .toMatch(/\.hr-diff \{ margin-bottom: var\(--sp-3\); border-top: 1px solid var\(--line\); padding-top: var\(--sp-2\); \}/);
    expect(hr, 'healthDiff.spec.ts:28 字面锁保活（模板类名不动）')
      .toMatch(/v-if="archive\.length >= 2" class="hr-diff"/);
  });
});

/* ═══════════ ② 代码面 border 残量摘除 ×4 ═══════════ */

describe('五百六十三批②：代码框 border 摘除（df-code/hr-code 代码面语言：bg+radius 无 border）', () => {
  it('DiagView dg-alloc-pre / dg-hot-pre：border 不回流（border-radius 代码面豁免）；bg 代码面保留', () => {
    const dg = read('../views/DiagView.vue');
    expect(dg, 'dg-alloc-pre border 摘除').not.toMatch(/\.dg-alloc-pre \{[^}]*border(?!-radius)/);
    expect(dg, 'dg-alloc-pre bg1 代码面保留').toMatch(/\.dg-alloc-pre \{[^}]*background: var\(--bg1\);/);
    expect(dg, 'dg-hot-pre border 摘除').not.toMatch(/\.dg-hot-pre \{[^}]*border(?!-radius)/);
    expect(dg, 'dg-hot-pre bg1 代码面保留').toMatch(/\.dg-hot-pre \{[^}]*background: var\(--bg1\);/);
  });

  it('PluginsView pl-code：border 不回流（border-radius 代码面豁免）；bg2 代码面保留', () => {
    const pl = read('../views/PluginsView.vue');
    expect(pl, 'pl-code border 摘除').not.toMatch(/\.pl-code \{[^}]*border(?!-radius)/);
    expect(pl, 'pl-code bg2 代码面保留').toMatch(/\.pl-code \{[^}]*background: var\(--bg2\);/);
  });

  it('SnapshotsView sv-form-preview：模态内嵌预览框 border 摘除（border-radius 豁免）；bg2 预览面保留', () => {
    const sv = read('../views/SnapshotsView.vue');
    expect(sv, 'sv-form-preview border 摘除').not.toMatch(/\.sv-form-preview \{[^}]*border(?!-radius)/);
    expect(sv, 'sv-form-preview bg2 预览面保留').toMatch(/\.sv-form-preview \{[^}]*background: var\(--bg2\);/);
  });
});

/* ═══════════ ③④ 行内面板/子键组框退役 ═══════════ */

describe('五百六十三批③④：sv-prog 框三件退役 / cd-ns-kids dashed 盒退役', () => {
  it('SnapshotsView sv-prog：border+radius 不回流；bg1 分组面保留作锚', () => {
    const sv = read('../views/SnapshotsView.vue');
    expect(sv, 'sv-prog border 不回流').not.toMatch(/\.sv-prog \{[^}]*border[^-]/);
    expect(sv, 'sv-prog 圆角壳不回流').not.toMatch(/\.sv-prog \{[^}]*border-radius/);
    expect(sv, 'bg1 分组面保留（.sv-tl-row 无底色，面即分组语义）')
      .toMatch(/\.sv-prog \{[^}]*background: var\(--bg1\);/);
  });

  it('ConfigDriftView cd-ns-kids：dashed 盒+圆角不回流；gap 缩进分组语义保留', () => {
    const cd = read('../views/ConfigDriftView.vue');
    expect(cd, 'cd-ns-kids dashed 盒不回流').not.toMatch(/\.cd-ns-kids\) \{[^}]*dashed/);
    expect(cd, 'cd-ns-kids 圆角壳不回流').not.toMatch(/\.cd-ns-kids\) \{[^}]*border-radius/);
    expect(cd, 'gap/padding 缩进分组语义保留').toMatch(/\.cd-ns-kids\) \{[^}]*gap: var\(--sp-1\);[^}]*\}/);
  });
});

/* ═══════════ ⑤ OverviewView 作业时间合并 TimeCell 单源 ═══════════ */

describe('五百六十三批⑤：ov-job-time 合并 TimeCell 统一件（R99 列内相对+悬浮绝对）', () => {
  it('OverviewView：TimeCell 改用在场（ov-job-time 锚类同步更新）；手写 relTime 退役', () => {
    const ov = read('../views/OverviewView.vue');
    expect(ov, 'TimeCell 单源改用在场（锚类保留，相对+绝对语义归组件）')
      .toMatch(/<TimeCell class="ov-job-time" :ts="j\.updateTime \|\| j\.createTime" \/>/);
    expect(ov, '手写 relTime 时间位退役').not.toMatch(/relTime\(j\.updateTime/);
    expect(ov, '孤儿 import 同步更新（relTime 不再被本页消费）')
      .not.toMatch(/import \{[^}]*\brelTime\b[^}]*\} from '\.\.\/utils\/format'/);
  });
});
