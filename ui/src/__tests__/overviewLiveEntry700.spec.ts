/**
 * 七百批③·概览 G15 复盘收口：运行时指标入口（627 批 Phase 0 差距清单最后一项活口）。
 *
 * G15 原文：运行时指标入口缺位（对标阿里云概览组 26 卡）——当时裁决「两页分工约定
 * 防重复建设，622 落码后复盘」。622 稿 P1~P4 已于 684 批全闭，复盘结论=**入口
 * 缺位补入口，指标本体不搬**：概览=历史回看+探活（/monitor-history），实时监控页=
 * 运行时指标（/live）——监控历史卡头补「实时监控」深链钮，两页分工约定定案。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ovSrc = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');
const routerSrc = readFileSync(join(__dirname, '../router.ts'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const ov = strip(ovSrc).replace(/\s+/g, ' ');

describe('七百批③ 概览 G15 复盘：运行时指标入口深链（两页分法定案）', () => {
  it('路由靶在场：/live = LiveDashboardView', () => {
    expect(routerSrc).toContain("path: '/live'");
  });

  it('源码锁：监控历史卡头「实时监控」深链钮恰一处', () => {
    expect(ov.split("router.push('/live')").length - 1).toBe(1);
    expect(ov).toContain('实时监控</button>');
  });

  it('负锚：概览不重复建设运行时指标卡（两页分工——无 QPS/Heap 走势图）', () => {
    expect(ov).not.toContain('HistoryChart');
    expect(ov).not.toContain('sparklinePoints');
  });
});
