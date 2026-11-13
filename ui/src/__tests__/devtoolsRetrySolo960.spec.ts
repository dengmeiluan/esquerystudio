/**
 * DevToolsView 失败态重试入口收敛——同一动作（重跑当前 Tab 请求）不再双钮并排。
 *
 * 矿相：失败态下响应工具行与 err-bar 各有一枚「重试」钮同屏并存（同一 run()
 * 动作，两批独立叠加）。执行失败 catch 恒设 result（原始错误全文）与 errBrief
 * （人话摘要），err-bar 的在场条件（errBrief 非空）恒覆盖工具行钮的显示条件
 * （result 在场且失败）——工具行钮退役零覆盖损失，失败重试唯一入口落 err-bar
 * （紧邻错误摘要，物理就近；全站 err-bar 范式同语言），工具行不再随成败增删钮。
 * 锁定形态：源码锁（模板删钮类改动，行为面由既有 942 真失败/取消双锚覆盖）；
 * devtoolsGateCancel942（err-bar 行为锁）、dqDevtoolsWave554（err-bar 容器字面）、
 * devtoolsToolbarB563（复制响应常驻化）共处零扰动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('失败态重试唯一入口落 err-bar（源码锁）', () => {
  it('响应工具行不再有失败态重试钮（防回潮）', () => {
    expect(dt).not.toMatch(/v-if="cur\.result && !cur\.ok"[^>]*@click="run"/);
    expect(dt, '工具行重试钮专属小尺寸图标不在场（重置钮大尺寸保留）')
      .not.toContain('RotateCcw :size="11"');
  });
  it('err-bar 重试钮保留为唯一入口（守卫与在途图标态零降级）', () => {
    const bar = dt.slice(dt.indexOf('class="err-bar dt-err"'), dt.indexOf('class="dt-out"'));
    expect(bar, '重试动作仍在错误条内').toContain(':disabled="cur.busy" @click="run"');
    expect(bar, '重试动作仍带在途图标态').toContain('spinning: cur.busy');
  });
});
