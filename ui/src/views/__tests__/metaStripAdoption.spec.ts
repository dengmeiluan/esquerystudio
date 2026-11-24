/**
 * 六视图手写 .sep meta 串换装 MetaStrip 统一件——源码契约看守（navCardA11y371 同款范式）。
 * 判据：
 *   1) DiagView/SlmView/SnapshotsView/WatcherView/TasksView/TopologyView 均挂 MetaStrip，
 *      模板内不再有 <span class="sep"> 手写分隔、scoped 里不再有 `.xx-meta b` 基础形态声明
 *      （flex/值亮/标签暗/mono/sep 形态单一出处归组件）；
 *   2) 落位类名保留（slm-meta 被 protectThreeState 用作 stats 区在/不在的看守锚，其余类
 *      是各页落位/窄屏钩子）；
 *   3) 行为性收编各有专条：DiagView 副行 text 段+friendlyEsError、TasksView Action 尾巴
 *      插槽、SearchSandboxView TookBadge、SnapshotsView 默认排序 start_time 降序看守
 *      （排序 UI 已落地，默认序契约改形态保留，不许被顺手改掉）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf-8');

const SWAPPED: Array<[string, string]> = [
  /* 五百三十五批：Diag 落位锚随全局 .meta-strip 类退役迁移 meta-strip→dg-meta（ IlmView .ilm-meta 同款本地落位） */
  ['views/DiagView.vue', 'dg-meta'],
  ['views/SlmView.vue', 'slm-meta'],
  ['views/SnapshotsView.vue', 'sv-meta'],
  ['views/WatcherView.vue', 'wt-meta'],
  ['views/TasksView.vue', 'tv-meta'],
  ['views/TopologyView.vue', 'top-meta'],
];

describe('六视图 meta 串 MetaStrip 换装', () => {
  it.each(SWAPPED)('%s：挂 MetaStrip，手写 sep 与私有基础形态声明退役，落位类名保留', (rel, cls) => {
    const src = read(rel);
    expect(src, '必须引入统一件').toContain("from '../components/MetaStrip.vue'");
    expect(src, '模板必须挂 <MetaStrip').toMatch(/<MetaStrip\s/);
    expect(src, '手写 .sep 分隔必须退役').not.toMatch(/class="sep"/);
    expect(src, `落位类名 ${cls} 必须保留（看守锚/落位钩子）`).toContain(cls);
    expect(src, `.${cls} b 基础形态声明必须删（形态归组件）`).not.toMatch(new RegExp('\\.' + cls + ' b\\b'));
  });

  it('DiagView：dg-sub 副行收编为 items text 段，类与状态点私样式退役', () => {
    const dg = read('views/DiagView.vue');
    expect(dg, '副行文本必须以 text 段进 items').toContain("{ text: '节点资源快照 · 热线程采样 · pending tasks · shard 分配诊断' }");
    expect(dg, '集群状态必须走 dot 冗余色标').toMatch(/dot:\s*clusterColor\.value/);
    expect(dg, 'tone 与 clusterColor 同判据（green→ok/yellow→warn/red→err）').toMatch(/cluster\.value\?\.status === 'green' \? 'ok' : cluster\.value\?\.status === 'yellow' \? 'warn' : cluster\.value\?\.status === 'red' \? 'err'/);
    expect(dg, 'class="dg-sub" 必须退役').not.toMatch(/class="dg-sub"/);
    expect(dg, '.dg-sub 样式声明必须退役').not.toMatch(/\.dg-sub \{/);
    expect(dg, '.dg-status-dot 私样式必须退役（dot 归组件 .ms-dot）').not.toContain('dg-status-dot');
    expect(dg, '重建锁下钻插槽锚 dg-meta-link 必须保留（navCardA11y371 契约）').toContain('class="dg-meta-link"');
  });

  it('DiagView：retryFailedAlloc 失败提示走 friendlyEsError，不再裸拼 e?.message', () => {
    const dg = read('views/DiagView.vue');
    expect(dg).toContain("store.notify('error', '重试失败：' + friendlyEsError(String(e?.message ?? e)));");
    expect(dg, '裸拼形态必须消失').not.toContain("'重试失败：' + (e?.message || e)");
  });

  it('TasksView：Action 类型清单拆 text 项进 items（五百二十五批：插槽尾巴+ksep+join 串三来源混 · 节奏收编组件 sep 统一节奏）', () => {
    const tv = read('views/TasksView.vue');
    /* kinds 前 3 清单以 text 段追加进 items（与同条 items 共用组件 sep 节奏） */
    expect(tv, 'kinds 必须拆 text 项追加进 items').toMatch(/actionKinds\.value\.slice\(0, 3\)\.map\(\(k: string\) => \(\{ text: k \}\)\)/);
    expect(tv, '手写 ksep 必须退役').not.toMatch(/class="tv-meta-ksep"/);
    expect(tv, 'ksep 私样式声明必须退役').not.toMatch(/\.tv-meta-ksep \{/);
    expect(tv, '插槽尾巴 join 串必须退役').not.toMatch(/class="tv-meta-kinds"/);
    expect(tv, 'kinds 私样式声明必须退役').not.toMatch(/\.tv-meta-kinds \{/);
    expect(tv, '超 5m 长任务 >0 必须走 tone:warn').toMatch(/tone: longRunning\.value \? 'warn' : undefined/);
  });

  it('SnapshotsView：默认排序仍 start_time 降序（排序 UI 已落地，默认序不许静默漂移）', () => {
    const sv = read('views/SnapshotsView.vue');
    /* 原「列表固定 start_time 降序」锁随排序 UI 迁移为默认值锁：默认键+默认方向（sortRev=false
       =自然方向=新→旧）+比较器仍 b-a 降序形态，三者任一漂移即用户默认视图被静默改序 */
    expect(sv, '默认排序键必须 start_time').toMatch(/usePref\('sv\.sortBy', 'start_time'\)/);
    expect(sv, '默认方向必须是自然序（false=降序，不许默认翻转）').toMatch(/usePref\('sv\.sortRev', false\)/);
    expect(sv, 'start_time 比较器必须保持 b-a 降序形态（原固定 sort 表达式）')
      .toMatch(/start_time: \(a: any, b: any\) => \(b\.start_time_in_millis \|\| 0\) - \(a\.start_time_in_millis \|\| 0\)/);
    expect(sv, '部分完成>0 走 tone:warn').toMatch(/tone: partialCount\.value \? 'warn' : undefined/);
    expect(sv, '失败>0 走 tone:err').toMatch(/tone: failedCount\.value \? 'err' : undefined/);
  });

  it('SlmView：RUNNING 之外一律 warn（原 meta-ok/meta-warn 三元语义等价收编 tone）', () => {
    const slm = read('views/SlmView.vue');
    /* 五百三十四批锚随迁：operation_mode 中文主显（slmOpModeZh）+ tone 收口件 slmOpModeTone
       （RUNNING→ok/其余 warn 语义等价，与 533 遗留「SLM op-mode 词汇缺口」兑现合流） */
    expect(slm).toMatch(/tone: slmOpModeTone\(statusMode\.value\)/);
    expect(slm, '清理耗时 ms 原值必须留段 tip').toMatch(/tip: statRetentionDeletion\.value \+ ' ms'/);
  });

  it('SearchSandboxView：裸 took 串退役，MetaStrip items + TookBadge 徽标接线', () => {
    const ss = read('views/SearchSandboxView.vue');
    expect(ss, '裸串模板必须消失').not.toMatch(/took \{\{ took \}\}ms/);
    expect(ss, '必须引入 TookBadge 统一件').toContain("from '../components/TookBadge.vue'");
    expect(ss, 'took 必须走 TookBadge 徽标').toMatch(/<TookBadge :ms="took" \/>/);
    expect(ss, 'hits 段必须走 MetaStrip items（gte 估计口径带 ≥ 前缀）').toMatch(/totalGte\.value \? '≥ ' : ''/);
    expect(ss, '旧 .ss-took 裸串样式必须退役').not.toMatch(/\.ss-took \{/);
  });
});
