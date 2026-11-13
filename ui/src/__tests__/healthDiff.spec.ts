/**
 * R130 一百九十二批顺延（202 交付）→ 二百一十八批升级：HealthReport 报告历史对比——
 * 202：上一份存 PREV_KEY「与上次体检对比」；218：localStorage 环形存档（reportArchive，上限 8 份）
 * +任选「基准/对照」两份扁平 diff+得分差摘要+完全一致正向反馈。
 * 锁定：存档落档/默认对比对/扁平 diff 三态（202 核心保留）/对比卡接线。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/HealthReportView.vue'), 'utf-8');

describe('HealthReport 报告对比（202→218 升级）', () => {
  it('218 存档落档：run 成功 pushReport 环形档 + 默认对比对重置；PREV_KEY 退役', () => {
    expect(src).toContain('archive.value = pushReport(localStorage, data.value);');
    expect(src).toMatch(/const dp = defaultPair\(archive\.value\);\s*if \(dp\) \{ pickBase\.value = dp\.base; pickCmp\.value = dp\.cmp; \}/);
    expect(src).not.toContain('prevReport.value = prevRaw');
  });
  it('扁平 diff 三态核心保留（202 不变）：变化/新增/消失 + 基准=old 对照=new', () => {
    expect(src).toMatch(/function flatReport\(o: any, prefix = '', out: Record<string, string> = \{\}\)/);
    expect(src).toContain("out.push({ k, old: '', new: b[k] });");
    expect(src).toContain("out.push({ k, old: a[k], new: '' });");
    expect(src).toContain("if (a[k] !== b[k]) out.push({ k, old: a[k], new: b[k] });");
    expect(src).toContain('const a = flatReport(baseEntry.value.data);');
    expect(src).toContain('const b = flatReport(cmpEntry.value.data);');
  });
  it('对比卡接线：archive>=2 出卡，基准/对照弹层选择器 + 得分差徽标 + 完全一致正向反馈', () => {
    expect(src).toMatch(/v-if="archive\.length >= 2" class="hr-diff"/);
    /* usePopupList 弹层改用后：pickBase/pickCmp 仍为存档下标，点选回填 + 输入过滤；
       原生 select 的 v-model.number 接线退役 */
    expect(src).toContain('function chooseBase(o: ArchOpt) { pickBase.value = o.i;');
    expect(src).toContain('function chooseCmp(o: ArchOpt) { pickCmp.value = o.i;');
    expect(src).toMatch(/usePopupList<ArchOpt>\(\{ items: \(\) => baseItems\.value, onChoose: chooseBase \}\)/);
    expect(src).toMatch(/usePopupList<ArchOpt>\(\{ items: \(\) => cmpItems\.value, onChoose: chooseCmp \}\)/);
    expect(src).toContain('基准（旧）');
    expect(src).toContain('对照（新）');
    expect(src).toContain('{{ baseScore ?? \'—\' }} → {{ cmpScore ?? \'—\' }}');
    expect(src).toContain('两份报告内容完全一致');
  });

  it('二百二十三批：对比结果 Markdown 复制（工单/群聊直贴）', () => {
    expect(src).toContain('async function copyDiffMd()');
    expect(src).toContain('## 体检对比：${archiveLabel(baseEntry.value)} → ${archiveLabel(cmpEntry.value)}');
    expect(src).toContain('| 键 | 旧值 | 新值 | 变化 |');
    expect(src).toContain('复制对比 MD</button>');
    expect(src).toContain('已复制对比结果（Markdown）');
  });
});
