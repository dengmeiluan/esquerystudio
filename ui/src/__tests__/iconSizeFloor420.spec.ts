/**
 * 四百二十批：图标尺寸下限统一——文本标签内的功能图标 <10px 视觉发糊，
 * 三处 size=9 统一升至 10；HealthReportView size=8 的 Circle 是刻意的状态圆点
 * 指示器（fill 实心+与 warn/octagon 形成分级），保留不在列。
 * 全站尺寸分布复验：10-14 为主力档（按容器缩放），8 以下仅剩刻意圆点。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, '..');

describe('图标尺寸下限（420 批）', () => {
  it('三处标签图标 9→10', () => {
    /* 550 同步更新：AnalysisSettingsView 的 BookText 徽标随 syn/flt 徽标 StatusPill 合并退役（flattenWave550）
       ——原 9→10 尺寸锁随退役失效，改锚退役负锁（防复活）+其余两处
       551 同步更新：MatchMatrixView 的 TriangleAlert 随 mm-dead-tag StatusPill 合并退役（flattenWave551）
       ——同款改锚退役负锁（防复活） */
    const as = readFileSync(join(SRC, 'views/AnalysisSettingsView.vue'), 'utf-8');
    expect(as).not.toContain('<BookText');
    const mm = readFileSync(join(SRC, 'views/MatchMatrixView.vue'), 'utf-8');
    expect(mm).not.toContain('<TriangleAlert');
    expect(mm).toContain('<StatusPill v-if="c.count === 0" tone="r" label="没起作用" />');
    expect(readFileSync(join(SRC, 'views/ScoreExplainView.vue'), 'utf-8')).toContain('<Tags :size="10" />');
  });

  it('全站无 <9px 功能图标（8px 仅剩 HealthReport 状态圆点特例）', () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      const s = readFileSync(f, 'utf-8');
      for (const m of s.matchAll(/:size="([0-8])"/g)) {
        if (f.includes('HealthReportView')) continue; // 状态圆点特例
        bad.push(`${f}: size=${m[1]}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
