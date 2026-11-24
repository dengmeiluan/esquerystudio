/**
 * 九百六十四批：轨6 记档小刀——概览监控历史「自动」刷新收编 AutoRefreshSelect 统一件。
 *
 * 病灶（⑥961-3 观察级候选「Overview『自动』60s 无档位选择」）：监控历史自动刷新是
 * 全站唯一仍用「布尔勾选+写死 60s」的自动刷新控制面——DiagView 等消费点均已走
 * AutoRefreshSelect 档位件，用户无法选更快的盯盘节奏（10s/30s）。
 * 收口：checkbox 退役 → AutoRefreshSelect v-model:ms（关/10s/30s/60s 默认档）；间隔走
 * usePref 落盘（新键 overview.mhAutoMs；旧布尔键一次性迁移 true→60s，旧键退役不清除，
 * 与 urlState 历史遗留键同口径）；档位切换→即刷+重启定时（restart 通道，557 先例）；
 * 选关→停表；setOn 接线守恒（551 审计：OverviewView 双接线恰 2）；「上次自动」可视
 * 反馈门控升格为「档位>0 且已有 tick」（645 语义同型升格）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const codeOf = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const OV = codeOf('views/OverviewView.vue');

describe('九百六十四批：监控历史自动刷新收编 AutoRefreshSelect 档位件', () => {
  it('checkbox 退役 + 统一件在场（v-model:ms 单点）', () => {
    expect(OV, 'AutoRefreshSelect 统一件收编').toContain('<AutoRefreshSelect v-model:ms="mhMs"');
    expect(OV, '布尔勾选退役').not.toContain('v-model="mhAuto"');
    expect(OV, '.ov-mh-auto 类与 scoped 规则同步退役').not.toContain('ov-mh-auto');
  });

  it('间隔档 usePref 落盘 + 旧布尔键一次性迁移（true→60s）', () => {
    expect(OV, '旧布尔键读（迁移源）').toContain("usePref<boolean>('overview.mhAuto', false)");
    expect(OV, '新档位键落盘（迁移默认：旧开=60s）').toContain(
      "usePref<number>('overview.mhAutoMs', legacyAuto.value ? 60000 : 0)",
    );
  });

  it('档位切换→即刷+重启；选关→停表（restart 通道守恒）', () => {
    expect(OV, 'watch(mhMs) 双向接线（DiagView/557 restart 先例同型）').toContain(
      'watch(mhMs, (v) => { if (v) void loadHistory(); mhRefresher.restart(); });',
    );
  });

  it('ms getter 单源（useAutoRefresh 契约：间隔变更由调用方重启）', () => {
    expect(OV, 'ms getter 直读档位').toContain('{ ms: () => mhMs.value }');
  });

  it('setOn 接线守恒（551 审计：OverviewView 双接线恰 2 的 mh 半边）', () => {
    expect(OV).toContain('mhRefresher.setOn(true);');
  });

  it('「上次自动」可视反馈门控升格：档位>0 且已有 tick（645 同型）', () => {
    expect(OV, '门控随档位语义升格').toContain('mhMs > 0 && mhAutoAt');
    expect(OV, '645 tick 记账不回退').toContain('mhAutoAt.value = Date.now()');
  });
});
