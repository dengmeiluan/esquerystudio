/**
 * 六百四十五批：G18 收口——概览「集群监控历史」自动刷新开启无可视反馈。
 *
 * 病灶（627 批 Phase 0 盘点 G18，备案低优）：`mhAuto` 勾选后 useAutoRefresh 每 60s 静默
 *   重查，勾选框只表「意图」不表「活动」——用户无从确认自动刷新确实在跑、上次何时刷新。
 * 收口：自动刷新 tick 时记录 `mhAutoAt`（毫秒时间戳），卡头在勾选且已有自动刷新后显示
 *   「上次自动 HH:mm:ss」弱提示（fmtTime 单源，与 TimeCell 同语汇），关闭时随 v-if 隐藏。
 *   九六四批随迁：布尔勾选收编 AutoRefreshSelect 档位件，门控升格为「档位>0 且已有 tick」。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const OV = codeOf('views/OverviewView.vue');

describe('六百四十五批：G18 自动刷新可视反馈（mhAutoAt 时间戳）', () => {
  it('自动刷新 tick 记录 mhAutoAt（毫秒时间戳 ref）', () => {
    expect(OV, 'mhAutoAt ref 在场').toContain('const mhAutoAt = ref<number | null>(null);');
    expect(OV, '自动刷新 tick 记录时间').toContain('mhAutoAt.value = Date.now()');
  });

  it('卡头在勾选且已刷新后显示「上次自动」时间（fmtTime 单源）', () => {
    expect(OV, '时间提示文案').toContain('上次自动');
    expect(OV, 'fmtTime 单源').toContain('fmtTime(mhAutoAt)');
    expect(OV, '门控（九六四批升格：档位>0 语义）').toContain('mhMs > 0 && mhAutoAt');
  });
});
