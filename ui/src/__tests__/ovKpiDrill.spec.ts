/**
 * R130 第八十三批：概览 KPI 卡下钻联动（联动轴）——概览是天然导航枢纽，
 * 指标异常时一键去对应页面。ov-topo 卡已有 @click 跳转先例，KPI 卡对齐。
 * 映射：索引数→/indices、总文档→/browser、总存储→/topology（节点存储分布）、
 * 集群状态→/health-report（一键体检）。
 * 锁定：kpis 四卡均带 to；模板 role=link + keydown.enter 可达（焦点环走全局
 * :focus-visible）；hover 暗示样式 .link 在场。行为由 ov-topo 同款 @click 模式兜底。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const ovSrc = readFileSync(join(SRC, 'views/OverviewView.vue'), 'utf-8');

const TARGETS = ['/indices', '/browser', '/topology', '/health-report'];

describe('概览 KPI 卡下钻联动（八十三批）', () => {
  it('四张 KPI 卡均带下钻目标且映射正确', () => {
    for (const t of TARGETS) {
      expect(ovSrc, `KPI 卡应含下钻目标 ${t}`).toMatch(new RegExp(`to: '${t}'`));
    }
  });

  it('模板可点击+键盘可达（role=link / tabindex / keydown.enter）', () => {
    /* KPI 元信息串迁 MetaStrip 统一件后，下钻交互语义由组件统一实现：
       视图侧 kpis 仍逐项带 to（上行断言），role=link/tabindex/Enter/cursor 在组件侧锁定 */
    expect(ovSrc).toContain('<MetaStrip v-else class="ov-strip" :items="kpiMeta" />');
    const ms = readFileSync(join(SRC, 'components/MetaStrip.vue'), 'utf-8');
    expect(ms).toMatch(/:role="it\.to \? 'link' : undefined"/);
    expect(ms).toMatch(/:tabindex="it\.to \? 0 : undefined"/);
    expect(ms).toMatch(/@keydown\.enter\.prevent="it\.to && go\(it\)"/);
    expect(ms).toMatch(/@click="it\.to && go\(it\)"/);
    /* v3.0.1:KPI 卡墙退役,指针手型随统一件 .ms-i.link 延续 */
    expect(ms).toMatch(/\.ms-i\.link \{ cursor: pointer/);
  });
});
