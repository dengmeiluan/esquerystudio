/**
 * 七百批④·安全中心 G30 残量合并：控制集群页芯片 .pc-page → 全局 .chip（chip static）。
 *
 * G30 原文：同类场景未共用单源（.pg-chip×8/.pc-page×10 自绘芯片+.me-row×7 未走
 * MetaStrip）。642 批已收 .pg-chip 半边；收 .pc-page 半边（自绘基座退役）。
 * ⚠me-row 半边裁决=**豁免约定**（651「精确等值才收」同族）：me-row=两栏定义列表
 * （label 左 value 右 space-between 纵排），MetaStrip=inline 串（值前标签后）——
 * 形态语义不同构，且行内嵌 StatusPill/双值列超出 MetaStrip item 契约，强收=布局
 * 语义变更（铁律 E 降层禁变高度结构的镜像约束）。豁免注记落代码注释看守。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const secSrc = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const sec = strip(secSrc).replace(/\s+/g, ' ');

describe('七百批④ G30 残量：.pc-page 合并 .chip（自绘退役）+me-row 豁免约定', () => {
  it('负锚：自绘 .pc-page 类退役（模板+CSS 双面）', () => {
    expect(sec, '模板不再用 pc-page 类').not.toMatch(/class="pc-page"/);
    expect(secSrc, 'CSS 自绘基座退役').not.toMatch(/\.pc-page \{/);
  });

  it('正锚：控制集群页芯片走全局 .chip（chip static 非交互档）', () => {
    expect(sec).toContain('chip static');
  });

  it('容器保留：.pc-pages 弹性容器是布局层非芯片本体，不在合并射程', () => {
    expect(secSrc).toMatch(/\.pc-pages \{/);
  });

  it('豁免看守：me-row 形态不同构豁免注记在档（防后续批次误合并）', () => {
    /* 855 清洗随迁：源注记「G30 豁免」批史标记已清（「④ 豁免」承接），锁语义不变 */
    expect(secSrc).toContain('④ 豁免');
    expect(secSrc).toContain('形态语义不同构');
  });
});
