/**
 * 三百七十一批：导航/切换卡类键盘可达同口径推广（369 批 Overview 范式）——
 * WelcomeWizard 四快捷入口（新用户引导页主路径）/ClusterSwitcher 三切换项
 * （宿主/自定义连接/管理连接，全站高频）/DiagView 重建锁 KPI 下钻卡。
 * 此前均纯 @click div，键盘用户不可达。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wz = readFileSync(join(__dirname, '../components/WelcomeWizard.vue'), 'utf-8');
const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');
const dg = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('导航/切换卡键盘可达（371 批）', () => {
  it('WelcomeWizard 四快捷入口 role+tabindex+Enter+aria-label', () => {
    for (const [path, name] of [['/overview', '概览'], ['/health-report', '一键体检'], ['/templates-gallery', '模板画廊'], ['/search', '查询工作台']] as const) {
      const re = new RegExp(`<div class="wz-act" role="button" tabindex="0" aria-label="[^"]*" @click="go\\('${path}'[^)]*\\)" @keydown\\.enter\\.prevent="go\\('${path}'[^)]*\\)"`);
      expect(wz, `入口 ${name}`).toMatch(re);
    }
  });

  it('ClusterSwitcher 三切换项 role+tabindex+Enter（373 起 Enter+Space 双键）', () => {
    /* 1439f：宿主/连接行改统一 onConnKey（Enter/Space 选择 + 菜单键），双键语义在 handler 内 */
    /* 1443：行内 @mousedown.stop 吞冒泡（右键不被 n-popover 抢先关），位于 @click 之前 */
    expect(cs).toMatch(/<div v-if="store\.hostVisible && hostAllowed" class="cs-item"[^>]*role="button" tabindex="0" aria-label="切换到宿主集群" @mousedown\.stop @click="pickTarget\('', ''\)" @contextmenu\.prevent="openConnMenu\(\$event, null\)" @keydown="onConnKey\(\$event, null\)"/);
    expect(cs).toMatch(/<div v-for="c in sortedConns"[^>]*role="button" tabindex="0" :aria-label="'切换到 ' \+ c\.name" @mousedown\.stop @click="pickTarget\(c\.id, c\.name\)" @contextmenu\.prevent="openConnMenu\(\$event, c\)" @keydown="onConnKey\(\$event, c\)"/);
    expect(cs).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
    expect(cs).toMatch(/<div v-if="canAdmin" class="cs-item manage" role="button" tabindex="0" aria-label="管理连接" @click="openManage" @keydown\.enter\.prevent="openManage" @keydown\.space\.prevent="openManage">/);
  });

  it('DiagView 重建锁 KPI 下钻卡 role+tabindex+Enter（373 起 Enter+Space 双键）', () => {
    /* v3.0.1 三横幅重造:重建锁 KPI 卡退役,下钻迁到 dg-meta 串内 dg-meta-link(Enter+Space 双键契约延续) */
    expect(dg).toMatch(/<span class="dg-meta-link" role="button" tabindex="0" title="点击查看锁明细（系统索引 · 分布式锁）" @click="router\.push\('\/system'\)" @keydown\.enter\.prevent="router\.push\('\/system'\)" @keydown\.space\.prevent="router\.push\('\/system'\)">/);
  });
});
