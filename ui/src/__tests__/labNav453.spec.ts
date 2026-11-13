/**
 * 四百五十三批：相关性实验室互跳导航——六 lab（评分解释/排名侦探/X 光/命中矩阵/
 * Boost 沙盒/火焰图）此前只能回查询工作台经 popover 中转；共享 LabNav 组件
 * （当前页禁用高亮+aria-current，其余一键直达）接入六视图页头，
 * labs 清单单点化 utils/relevanceLabs（QueryHub popover 共用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const labNav = readFileSync(join(SRC, 'components/LabNav.vue'), 'utf-8');
const labsUtil = readFileSync(join(SRC, 'utils/relevanceLabs.ts'), 'utf-8');
const qh = readFileSync(join(SRC, 'views/QueryHubView.vue'), 'utf-8');

describe('实验室互跳导航（453 批）', () => {
  it('LabNav 组件：单点清单+当前页禁用+aria-current', () => {
    expect(labNav).toContain("import { RELEVANCE_LABS } from '../utils/relevanceLabs';");
    expect(labNav).toMatch(/:disabled="l\.path === current"/);
    expect(labNav).toMatch(/:aria-current="l\.path === current \? 'page' : undefined"/);
  });

  it('labs 清单单点化：QueryHub 本地数组退役改 import', () => {
    expect(qh).toContain("import { RELEVANCE_LABS } from '../utils/relevanceLabs';");
    expect(qh).not.toMatch(/const RELEVANCE_LABS = \[/);
    expect(labsUtil.match(/path: '\/[a-z-]+'/g) ?? []).toHaveLength(6);
  });

  it('六 lab 视图全部接入 LabNav', () => {
    for (const [f, cur] of [
      ['ScoreExplainView.vue', '/score-explain'],
      ['RankDebugView.vue', '/rank-debug'],
      ['QueryXrayView.vue', '/query-xray'],
      ['MatchMatrixView.vue', '/match-matrix'],
      ['BoostTunerView.vue', '/boost-tuner'],
      ['ProfileFlameView.vue', '/profile-flame'],
    ] as const) {
      const s = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(s, f).toContain(`<LabNav current="${cur}" />`);
    }
  });

  it('454 补：返回查询工作台入口（lab 出口与入口对称）', () => {
    expect(labNav).toContain("@click=\"router.push('/search')\"".replace('\\"', '"'));
    expect(labNav).toContain('查询工作台');
  });
});
