import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 七百九十批·死码域新矿=views/components 组件域死导出清零（deadExport790）。
 * Phase 0 全域扫描（60 views+73 components+App.vue；.vue script 块 export 语句 12 处
 *   全分型〔789 修正版扫描器形态：resolve 相对路径+剥内联 type/import type+词边界〕）：
 *   产品活 8（BGN_COLLAPSE_EVENT=QueryTreePane 消费/MetaStripItem=29 视图/HistRow=RestView/
 *   TableExpandRow·TableBacktop=QRT+RT/WorkbenchPaneSpec=11 视图 import 路径消费）
 *   +内部活 3 留供豁免（parseHostRaw/formatHostRaw=remoteSourceFields.spec 直采，
 *   788-C1 测试资产保全口径；evalTopoClip=overviewFade681 spec 直采单源+OverviewView 自用）
 *   +真死 1（WorkbenchLayout BP_STACK re-export 兼容层：零 importers 走此路径，
 *   内部消费走自有 import——史志注释自证「视图侧一律从 utils/layout 取」）
 *   +export 私有化 2（RemoteSourceFields HostRawView/RemoteConn：内部活
 *   〔签名/props/emits 7 处自用〕零外部消费者）。
 * 整文件死组件 0；模板域死分支复查三形态〔literal-false/const-gate/true-gate-else〕
 *   零命中=786 后第二轮，维持低收益观察档。
 * 刀A=BP_STACK re-export 整行删+WorkbenchLayout 史志注释尾句诚实化
 *   +双文本锁前置同步更新（workbenchStackBp527:30+tasksProgress528:145
 *   export 形态断言→import 消费形态断言=787-C2 约定）；
 * 刀B=HostRawView/RemoteConn 去 export 关键字（typecheck 0=零漏判铁证）。 */

const rd = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('七百九十批：组件域死导出清零（BP_STACK re-export 退役+双 interface 私有化）', () => {
  const wbs = rd('../components/WorkbenchLayout.vue');
  const rsf = rd('../components/RemoteSourceFields.vue');
  const layoutUtil = rd('../utils/layout.ts');

  it('A1 WorkbenchLayout BP_STACK re-export 真死：任何 export 形态复发即红（780-C1 口径）', () => {
    expect(wbs, 'BP_STACK re-export 兼容层复发（790 已退役：零消费铁证在档）')
      .not.toMatch(/export\s*\{[^}]*BP_STACK[^}]*\}/);
  });

  it('A2 RemoteSourceFields HostRawView/RemoteConn export 前缀清零+声明本体保留（防全删）', () => {
    expect(rsf).not.toMatch(/^export\s+interface\s+(?:HostRawView|RemoteConn)\b/m);
    expect(rsf).toMatch(/^interface HostRawView \{ scheme/m);
    expect(rsf).toMatch(/^interface RemoteConn \{/m);
  });

  it('B1 活锚：BP_STACK 常量本体在 utils/layout + WorkbenchLayout import 消费在场（防全删绿）', () => {
    expect(layoutUtil).toMatch(/export const BP_STACK = 1100;/);
    expect(wbs).toMatch(/^import \{[^}]*\bBP_STACK\b[^}]*\} from '\.\.\/utils\/layout';/m);
  });

  it('B2 豁免锚：parseHostRaw/formatHostRaw/evalTopoClip export 保留（spec 直采=788 测试资产保全）', () => {
    expect(rsf).toMatch(/^export function parseHostRaw\(/m);
    expect(rsf).toMatch(/^export function formatHostRaw\(/m);
    expect(rd('../views/OverviewView.vue')).toMatch(/^export function evalTopoClip\(/m);
  });

  it('B3 消费锚：WorkbenchPaneSpec/HistRow/MetaStripItem export 保留（产品活）', () => {
    expect(wbs).toMatch(/^export interface WorkbenchPaneSpec \{/m);
    expect(rd('../components/QueryHistoryPanel.vue')).toMatch(/^export interface HistRow \{/m);
    expect(rd('../components/MetaStrip.vue')).toMatch(/^export interface MetaStripItem \{/m);
  });
});
