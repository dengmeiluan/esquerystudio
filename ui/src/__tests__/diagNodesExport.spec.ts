/**
 * R130 一百三十四批：DiagView 节点资源快照导出（容量汇报双通道）。
 * DiagView 沿用源码级锁形态（diagRetryAlloc 同款）：
 * 1) exportNodes 双格式：CSV 走 downloadText（BOM 防中文乱码）、Markdown 走剪贴板；
 * 2) 行序=QRT 内核所见（五百二十五批 W5 换壳同步更新：nodesSorted 胶水退役，行集/列集改走
 *    QRT ref.getCsvBlock()——漏斗+排序+列选所见即所得；% 后缀/FS 人性化字节按列名就地回填）；
 * 3) 工具区双按钮接线（CSV/Markdown）且空数据 disabled；「数值」TSV 钮/「Σ 聚合行」开关
 *    随换壳退役（QRT 右键整表 TSV 与列头菜单聚合行内核接管）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('Diag 节点资源导出（134 批）', () => {
  it('exportNodes 双格式：CSV BOM 下载 + Markdown 剪贴板', () => {
    expect(src).toMatch(/function exportNodes\(fmt: 'csv' \| 'md'\)/);
    expect(src).toMatch(/nodesQrt\.value\?\.getCsvBlock\(\)/);
    expect(src).toMatch(/bom: true/);
    expect(src).toMatch(/已复制 \$\{rows\.length\} 个节点（Markdown）/);
  });

  it('双按钮接线且空数据 disabled', () => {
    expect(src).toMatch(/:disabled="!nodes\.length" @click="exportNodes\('csv'\)"/);
    expect(src).toMatch(/:disabled="!nodes\.length" @click="exportNodes\('md'\)"/);
  });

  it('列头含容量汇报关键字段（拒绝数计入；CJK-ASCII 补空格后为「Search 拒绝」形态）', () => {
    expect(src).toContain('Search 拒绝');
    expect(src).toContain('Bulk 拒绝');
    expect(src).toContain('FS 可用');
  });
});

describe('Diag 热线程复制（138 批）', () => {
  it('复制按钮接线（无采样禁用恒在场）+原始文本保真复制', () => {
    expect(src).toMatch(/<button class="btn sm ghost" :disabled="!hotThreads" @click\.prevent="copyHot"/);
    expect(src).toMatch(/async function copyHot\(\)/);
    expect(src).toMatch(/await copyText\(hotThreads\.value\)/);
    expect(src).toContain('热线程文本已复制');
  });
});

describe('Diag pending tasks Markdown 复制（一百八十批）', () => {
  it('复制按钮接线（无 task 禁用恒在场）+三列表（priority/source/queue）', () => {
    expect(src).toMatch(/<button class="btn sm ghost" :disabled="!pending\.length" style="margin-left:auto" @click\.prevent="copyPending"/);
    expect(src).toMatch(/async function copyPending\(\)/);
    expect(src).toContain('| priority | source | time_in_queue |');
    /* 九百五十九批：time_in_queue 与 time_in_queue_millis 两字段全缺时落
       '-' 占位（与视图单元格 semFormat 兜底同语言）；"undefinedms" 裸拼形态退役 */
    expect(src).toContain("p.time_in_queue || (p.time_in_queue_millis != null ? p.time_in_queue_millis + 'ms' : '-')");
    expect(src, '"undefinedms" 裸拼形态退役').not.toContain("(p.time_in_queue_millis + 'ms')");
    expect(src).toContain('个 pending task（Markdown）');
  });
});
