/**
 * 五百三十一批「状态徽标合并 + 数值单源退役」契约看守（WC 工蚁）。
 *
 * 三条主契约：
 *  A jobKindTone 收口：LiveDashboardView 本地 jobTone 字典迁 utils/esEnumZh 单源
 *    （与 taskActionTone 口径差异备案：action 串 delete 族出红档 r，kindName 无红档）；
 *  B StatusPill 改用锚：Aliases(7)/Browser(状态槽)/ConfigValidator(sev)/IndexOptimizer
 *    (io-rec-sv ×3)/LiveDashboard(ld-al-badge+kind 徽标)/Overview(作业状态+en)/HealthReport
 *    (hr 状态)/IndexSettings(gate severity) 源码锚——锚类保名（pillSingleTrack MERGED 同口径），
 *    色值/小字形态归组件单源不回潮；
 *  C semFormat 数值单源退役：Snapshots/Slm fmtMs、ReindexPreview fmtSize+fmtN、
 *    IndexSettings fmtBytes 全部合并 useSemFormat（或 fmtNum）单源，本地实现退役。
 *
 * 附加锚：TasksView tookMs 真值展示（后端 listTasks 已下发，缺失回落 runningMs 折算，
 * ES _tasks 无 finished 概念——完成即消失，非「运行中=-1」）、SystemView QRT fieldTypes
 * （实地核自 EsAdhocJobStore.MAPPING_PROPERTIES）、SnapshotsView repoOpts 分组排序。
 *
 * 断言全部落在源文本上（emptyStatePadding.spec.ts:24-27 同理由：happy-dom 不参与
 * scoped <style> 计算，渲染后样式数值断言是死断言）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const esEnumSrc = read('utils/esEnumZh.ts');
const readView = (name: string) => read(`views/${name}.vue`);

describe('A jobKindTone 收口（utils/esEnumZh 单源）', () => {
  it('esEnumZh 导出 jobKindTone（五主档签名）与 JobKindTone 类型，口径注释备案', () => {
    expect(esEnumSrc).toMatch(/^type JobKindTone = 'g' \| 'y' \| 'r' \| 'b' \| 'n';/m)/* 788 刀B 锁同步更新：类型转模块私有 */;
    expect(esEnumSrc).toMatch(/export function jobKindTone\(kind: string\): JobKindTone \{/);
    /* 口径差异备案在案（与 taskActionTone：kindName 展示名无 delete 语义故无红档） */
    expect(esEnumSrc).toContain('taskActionTone');
    expect(esEnumSrc).toContain('kindName');
  });

  it('行为：kindName 三档映射（Reindex 任务=y 写类 / 快照=n / 托管重建·迁移=b）', async () => {
    const { jobKindTone } = await import('../utils/esEnumZh');
    expect(jobKindTone('Reindex 任务')).toBe('y');
    expect(jobKindTone('快照')).toBe('n');
    expect(jobKindTone('托管重建')).toBe('b');
    expect(jobKindTone('跨集群迁移')).toBe('b');
    expect(jobKindTone('未知种类')).toBe('b');
  });

  it('LiveDashboardView：本地 jobTone 字典退役，模板换 StatusPill+jobKindTone', () => {
    const live = readView('LiveDashboardView');
    expect(live).not.toMatch(/function jobTone\(/);
    expect(live).toContain("import { isDataNode, nodeRoleLabel, nodeRoleClass, jobKindTone } from '../utils/esEnumZh';");
    expect(live).toContain('<StatusPill :tone="jobKindTone(j.kindName)" :label="j.kindName" />');
  });
});

/* 五百三十二批（语义族）：sevZh 别名域随消费点扩容的行为看守——date 兼容风险行
   （AdhocRebuildView ar-risk-lv）level 用 warning，落「建议」与 sevPill 的 y 档错位 */
describe('A2 sevZh warning 别名（utils/esEnumZh 单源）', () => {
  it('行为：warning→警告（warn 同档）；critical/error/info 旧口径不变', async () => {
    const { sevZh } = await import('../utils/esEnumZh');
    expect(sevZh('warning')).toBe('警告');
    expect(sevZh('WARNING')).toBe('警告');
    expect(sevZh('warn')).toBe('警告');
    expect(sevZh('critical')).toBe('严重');
    expect(sevZh('error')).toBe('错误');
    expect(sevZh('info')).toBe('建议');
  });
});

describe('B StatusPill 改用锚（锚类保名，色档归组件单源）', () => {
  it('AliasesView：组头四处 + 行内三处（alv-write-badge 锚保留），手写 .pill 裸挂清零', () => {
    const s = readView('AliasesView');
    expect(s).toContain('<StatusPill tone="b" :label="g.rows.length + \' 索引\'" />');
    expect(s).toContain('<StatusPill v-if="g.writeCount > 1" tone="r" label="多写"');
    expect(s).toContain('tone="n" label="只读" title="未指定 write index：跨索引聚合的只读用法（常态）；如需通过该别名写入，请先「设写」"');
    expect(s).toContain('<StatusPill v-else-if="g.writeCount === 1" tone="g" label="正常" />');
    expect(s.match(/class="alv-write-badge"/g)?.length).toBe(3);
    expect(s, '手写 pill 裸挂不回潮').not.toMatch(/class="pill /);
    expect(s).toContain("import StatusPill from '../components/StatusPill.vue'");
  });

  it('BrowserView：状态槽换 StatusPill+indexStatusZh(en 档)，.bw-st-en 本地小字退役；存储列 bytes 单源显示、文档数列恒 long', () => {
    const s = readView('BrowserView');
    expect(s).toContain(':tone="value === \'open\' ? \'g\' : \'n\'"');
    expect(s).toContain(':label="indexStatusZh(value) || (value || \'\')"');
    expect(s).toContain(':en="indexStatusZh(value) ? value : undefined"');
    expect(s, '.bw-st-en 本地小字类退役（en 归组件 .sp-en）').not.toContain('bw-st-en');
    expect(s).toContain('const BW_TYPES: Record<string, string> = { 文档数: \'long\', 存储: \'bytes\' };');
    /* 五百三十四批锚同步更新（零删用例）：531 批「槽内 bytes 单源+表级语义开关刻意不开」的内核遗留
       备案，随内核 semRawCols 抑制守卫落地而合并——存储列 bytes 显式标注由内核直出（矩阵/导出/
       复制恒 raw 口径不变），文档数列入 BW_SEM_RAW_COLS 抑制按值推断，#cell-存储 槽退役 */
    expect(s, '#cell-存储 槽退役（bytes 显式标注由内核直出，531 备案由 semRawCols 兑现）')
      .not.toContain('<template #cell-存储');
    expect(s).toContain("const BW_SEM_RAW_COLS = ['文档数'];");
    const qrtTag = s.match(/<QueryResultTable[\s\S]*?>/)![0];
    expect(qrtTag, 'QRT 表级语义开+semRawCols 抑制名单接线（视图注释含「sem-on」字样自此为真实 prop）')
      .toContain('sem-on');
    expect(qrtTag).toContain(':sem-raw-cols="BW_SEM_RAW_COLS"');
  });

  it('ConfigValidatorView：cv-iss-sev 换 StatusPill（tone 仍走 cvSevPill 同源），label 收 sevZh 中文', () => {
    const s = readView('ConfigValidatorView');
    expect(s).toContain('<StatusPill class="cv-iss-sev" :tone="cvSevPill(iss.severity)" :label="cvSevZh(iss.severity)" />');
    expect(s).toContain("import { sevPill as cvSevPill, sevZh as cvSevZh } from '../utils/esEnumZh';");
    expect(s, '裸 severity 渲染退役').not.toContain('>{{ iss.severity }}</span>');
  });

  it('IndexOptimizerView：io-rec-sv 三处换 StatusPill（锚类保留，sv-* 手写文字色档退役）', () => {
    const s = readView('IndexOptimizerView');
    expect(s).toContain('<StatusPill class="io-rec-sv" :tone="ioSevPill(r.severity)" :label="svLabel(r.severity)" />');
    expect(s).toContain('<StatusPill v-if="segAdvice.flagged" tone="y" :label="svLabel(segAdvice.severity)" class="io-rec-sv" />');
    expect(s).toContain('<StatusPill v-else tone="b" label="正常" class="io-rec-sv" />');
    expect(s, 'sv-* 手写文字色档退役').not.toMatch(/\.io-rec-sv\.sv-/);
    expect(s).toContain("import { sevZh as svLabel, sevPill as ioSevPill } from '../utils/esEnumZh';");
  });

  it('LiveDashboardView：ld-al-badge 两枚计数徽标换 StatusPill（锚类保留，.bd/.wn 手写色档退役）', () => {
    const live = readView('LiveDashboardView');
    expect(live).toContain('<StatusPill v-if="badCount" tone="r" class="ld-al-badge" :label="badCount + \' 严重\'" />');
    expect(live).toContain('<StatusPill v-if="warnCount" tone="y" class="ld-al-badge" :label="warnCount + \' 警告\'" />');
    expect(live, '.bd/.wn 手写色档退役').not.toMatch(/\.ld-al-badge\.(bd|wn)/);
  });

  it('OverviewView：最近作业状态换 StatusPill+en 档，dot-pulse 呼吸点保留本地（组件无插槽不硬塞——备案）', () => {
    const s = readView('OverviewView');
    expect(s).toContain(':tone="jobTone(j.status)"');
    expect(s).toMatch(/return statusColor\(s\) as 'g' \| 'y' \| 'r' \| 'b' \| 'n';/);
    expect(s).toContain(':label="jobStatusZh(j.status) || j.status || \'-\'"');
    expect(s).toContain(':en="jobStatusZh(j.status) ? j.status : undefined"');
    expect(s, '呼吸点保留本地（StatusPill 无插槽）').toContain('class="dot-pulse"');
    expect(s, '英文小字本地类退役').not.toContain('ov-st-en');
  });

  it('HealthReportView：hr 状态 toUpperCase 裸串换 StatusPill（tone 走 healthPill 同源窄化绿黄红），statCls 手配色退役', () => {
    const s = readView('HealthReportView');
    expect(s).toContain(':tone="statusTone"');
    expect(s).toMatch(/healthPill\(String\(data\.value\?\.summary\?\.status \|\| ''\)\) as 'g' \| 'y' \| 'r'/);
    /* 五百三十四批锚同步更新（healthThreeState 先例，零删用例）：status label 中文化——
       clusterHealthZh 主显 + 未收录枚举回落原裸串 toUpperCase；原 label 字面锁随改用退役 */
    expect(s, 'clusterHealthZh 接线在场（esEnumZh 单源别名 healthZh）')
      .toContain("healthZh(String(data.summary?.status || '')) || String(data.summary?.status || '').toUpperCase()");
    expect(s).not.toMatch(/const statCls = computed\(/);
    /* 七百八十七批锁同步更新：786 刀A 删 HealthReport fmtNum 未同步更新本行（fmtNum 出锁）——
       786 全量 3 红归因「全在 xmProgress529」漏此条，787 基线归因补账 */
    expect(s).toContain("import { exportStamp, fmtTime, downloadText, copyText, healthPill } from '../utils/format';");
  });

  it('IndexSettingsView：gate severity 裸枚举换 StatusPill+sevZh，g-err/g-warn 手写色档退役（is-kind 锚不在面）', () => {
    const s = readView('IndexSettingsView');
    expect(s).toContain('<StatusPill class="is-gate-sv" :tone="gateSevPill(gi.severity)" :label="gateSevZh(gi.severity)" />');
    expect(s).toContain("import { sevPill as gateSevPill, sevZh as gateSevZh } from '../utils/esEnumZh';");
    expect(s, 'g-err/g-warn 手写色档退役').not.toMatch(/\.g-(err|warn)/);
    /* 五百五十批同步更新：is-kind 裸 pill 改用 StatusPill 统一件（kindTone 语义映射，flattenWave550⑤），
       锚同步更新到改用形态；is-kind 落位锚类仍在（pillSingleTrack MERGED 看守不变） */
    expect(s, 'is-kind 行内判定徽标改用锚（550 同步更新：pill n 裸形态退役）')
      .toContain('<StatusPill v-if="kindOf(d.key)" class="is-kind" :tone="kindTone(kindOf(d.key))" :label="kindText(kindOf(d.key))" />');
  });
});

describe('C semFormat/fmtNum 数值单源退役', () => {
  it('SnapshotsView：fmtMs 合并 semFormat duration 单源', () => {
    const s = readView('SnapshotsView');
    expect(s).toContain("import { semFormat } from '../composables/useSemFormat';");
    expect(s).toMatch(/function fmtMs\(ms: number\): string \{\s*\n\s*return semFormat\(ms, 'duration'\)\?\.text \?\? \(ms \+ ' ms'\);/);
    expect(s, '本地三元实现退役').not.toMatch(/Math\.floor\(ms \/ 60000\)/);
  });

  it('SlmView：fmtMs 合并 semFormat duration 单源（metaStripAdoption 的 ms 原值 tip 锚不受影响）', () => {
    const s = readView('SlmView');
    expect(s).toContain("import { semFormat } from '../composables/useSemFormat';");
    expect(s).toMatch(/return semFormat\(ms, 'duration'\)\?\.text \?\? \(ms \+ ' ms'\);/);
    expect(s, '本地三元实现退役').not.toMatch(/if \(ms < 1000\)/);
    expect(s).toContain("tip: statRetentionDeletion.value + ' ms'");
  });

  it('ReindexPreviewView：fmtN→fmtNum 千分位、fmtSize→semFormat bytes，K/M/B 缩写与本地字节三元退役', () => {
    const s = readView('ReindexPreviewView');
    expect(s).toContain("import { fmtNum } from '../utils/format';");
    expect(s).toContain("import { semFormat } from '../composables/useSemFormat';");
    expect(s).toMatch(/const fmtN = \(n\?: number \| null\): string => \(n == null \? '—' : fmtNum\(n\)\);/);
    expect(s).toMatch(/const fmtSize = \(bytes\?: number \| null\): string => semFormat\(bytes, 'bytes'\)\?\.text \?\? '—';/);
    expect(s, 'K/M/B 缩写退役').not.toMatch(/toFixed\(1\) \+ 'K'/);
    expect(s, '本地字节档位表退役').not.toMatch(/const u = \['B', 'KB', 'MB', 'GB', 'TB'\]/);
  });

  it('IndexSettingsView：fmtBytes 合并 semFormat bytes 单源', () => {
    const s = readView('IndexSettingsView');
    expect(s).toMatch(/return semFormat\(Number\(n\) \|\| 0, 'bytes'\)\?\.text \?\? '0 B';/);
    expect(s, '本地字节档位表退役').not.toMatch(/const units = \['B', 'KB', 'MB', 'GB', 'TB'\]/);
  });

  it('OverviewView：Top10 存储值走 semFormat bytes（parseBytes 先归一，解析失败回落原串）', () => {
    const s = readView('OverviewView');
    expect(s).toMatch(/function storeSizeText\(v: any\): string \{\s*\n\s*return semFormat\(parseBytes\(v\), 'bytes'\)\?\.text \?\? String\(v \?\? '-'\);/);
    expect(s).toContain('{{ storeSizeText(idx[\'store.size\']) }}');
  });
});

describe('D 附加契约锚', () => {
  it('TasksView：tookMs 真值展示（缺失回落 runningMs 折算，-1 兜底退役；semFormat duration 人话化）', () => {
    const s = readView('TasksView');
    expect(s).toMatch(/Number\.isFinite\(Number\(t\.tookMs\)\) && Number\(t\.tookMs\) >= 0/);
    expect(s, '「-1 显 -」兜底退役').not.toContain(": '-' }}");
    expect(s).toContain('{{ tookText(t.tookMs) }}');
    expect(s).toMatch(/return semFormat\(ms, 'duration'\)\?\.text \?\? fmtDur\(ms\);/);
    /* 口径备案在案：ES _tasks 无 finished 概念，完成即消失 */
    expect(s).toContain('ES _tasks 无 finished 概念');
  });

  it('SystemView：QRT 补 fieldTypes（实地核自 EsAdhocJobStore mapping：keyword×6 + created_ts/updated_ts=long）', () => {
    const s = readView('SystemView');
    expect(s).toContain(':field-types="SY_TYPES"');
    expect(s).toContain("job_id: 'keyword', status_name: 'keyword', index_name: 'keyword',");
    expect(s).toContain('created_ts: \'long\', updated_ts: \'long\',');
  });

  it('SystemView：裸 took ms → TookBadge（组件 props=ms/title）', () => {
    const s = readView('SystemView');
    expect(s).toContain('<TookBadge :ms="resp.took" title="查询耗时" />');
    expect(s).toContain("import TookBadge from '../components/TookBadge.vue'");
    expect(s, '裸 ms 拼接退役').not.toContain('{{ resp.took }}ms');
  });

  it('SnapshotsView：repoOpts localeCompare 排序 + 按 type 分组（分组不触 snapshotRepoMemory 的 value=name 链路）', () => {
    const s = readView('SnapshotsView');
    expect(s).toMatch(/\.sort\(\(a, b\) => String\(a\.name \|\| ''\)\.localeCompare\(String\(b\.name \|\| ''\)\)\)/);
    expect(s).toContain("{ type: 'group' as const, label: t, key: t, children: byType.get(t) }");
    expect(s, '子项 label 口径不变').toContain("r.name + ' (' + t + ')'");
  });

  it('ConfigValidatorView：cv-rp-meta 手写计数串换 MetaStrip（tone 三档），TookBadge 走组件默认插槽', () => {
    const s = readView('ConfigValidatorView');
    expect(s).toContain('<MetaStrip class="cv-rp-meta" :items="cvRpMeta">');
    expect(s).toContain("{ value: r.errorCount, label: '错误', tone: 'err' as const }");
    expect(s).toMatch(/\{ text: 'Dry-run ' \+ \(r\.dryRunPassed \? '✔ ES 实测可建' : '✘ ES 拒绝'\) \}/);
    expect(s, '.c-err/.c-warn/.c-info 手配色退役').not.toMatch(/\.cv-rp-meta \.c-/);
  });

  it('响应式顺带：四视图补档且档内非空、不踩 ≥300px 裸 width 与 901 补集单源口径', () => {
    const wants900 = ['IndexOptimizerView', 'ReindexPreviewView', 'SnapshotsView', 'SystemView'];
    for (const name of wants900) {
      const s = readView(name);
      expect(s, `${name} 缺 900 紧凑档`).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
      expect(s, `${name} 视图侧不得自写 901 补集（单源在 theme.css）`).not.toContain('min-width: 901px');
    }
    /* SnapshotsView 时间线为单列流式（1100 无堆叠落点），补 JSON 弹层防溢出档；
       其余三视图为单列 flex（1100 空壳档不造，900 档即紧凑微调） */
    expect(readView('SnapshotsView')).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.sv-tl-json/);
    for (const name of wants900) {
      const s = readView(name);
      const block = s.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/)![0];
      for (const line of block.split('\n')) {
        const m = line.match(/(?:^|[^-.\w])width:\s*(\d{3,})px/);
        expect(!!m && Number(m[1]) >= 300, `${name} 900 档出现 ≥300px 裸 width：${line.trim()}`).toBe(false);
      }
    }
  });
});
