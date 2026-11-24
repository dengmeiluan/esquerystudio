/**
 * 五百六十五批·轨2 W2 件⑥：Xmigrate 预览摘框 + IndexHub 1100 窄档补齐。
 *
 *  ① XmigrateView 源配置预览两块只读 JsonArea（mapping/settings）摘默认框——
 *     .ja 的 border/radius 双层框感剥掉（:deep(.ja){border:none} 全站口径，DQ :2181/
 *     IH :2181/AR :2170 同款；JsonArea 组件本体零触，视图 style 追加独立规则）。
 *  ② IndexHubView 全页仅 900 微调档（responsive900Sweep529 入册）无 1100 档 →
 *     补 @media (max-width:1100px)：治 ih-hd 行（索引名+5 钮+MetaStrip 元信息串）与
 *     ih-tabs 行窄档挤压——头部与页签行折行让宽、侧距收窄，对齐 DevToolsView 900 档
 *     「只加换行容许与钳制、高度链基础值零触」口径。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const xm = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('565 件⑥①：Xmigrate 源配置预览 JsonArea 摘默认框', () => {
  it('.xm-cfg-grid 内 .ja 摘框（border/radius 剥除，JsonArea 组件零触）', () => {
    expect(xm).toMatch(/\.xm-cfg-grid :deep\(\.ja\) \{ border: none; border-radius: 0; \}/);
    /* 两块预览仍在场（552 cfgRows 锚随档保留） */
    expect(xm).toContain(':rows="cfgRows(cfgMappingText)"');
    expect(xm).toContain(':rows="cfgRows(cfgSettingsText)"');
  });
});

describe('565 件⑥②：IndexHub 补 1100 窄档', () => {
  it('@media (max-width:1100px) 档在场且含 ih-hd 折行规则（治窄档挤压）', () => {
    const block = ih.match(/@media \(max-width: 1100px\) \{[\s\S]*?\n\}/);
    expect(block, '1100 档在场').toBeTruthy();
    expect(block![0], '档内含 ih-hd 折行让宽规则').toMatch(/\.ih-hd \{/);
    expect(block![0]).toContain('.ih-tabs');
  });
  it('900 档零触（responsive900Sweep529 入册口径不变，两档并存职责不合并）', () => {
    expect(ih).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.ih-op-inline \{ flex-wrap: wrap; \}/);
  });
});
