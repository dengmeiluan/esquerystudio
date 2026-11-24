/**
 * 二百八十二批+三百三十八批：复制链审计——假成功/静默失败清扫与防回潮。
 * `.then(() => notify('success'))`（无论成败都报成功）与裸 `copyText(...)`（无反馈）
 * 是复制链 v4 架构下的诚实性缺口；八视图清扫 + SqlBridge/SqlConsole 同型漏网补扫。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const files = ['AnalysisSettingsView', 'FavoritesView', 'DevToolsView', 'DslQueryView', 'QueryXrayView', 'RemoteClustersView', 'SlmView', 'SqlBridgeView', 'SqlConsoleView'];

describe('复制诚实性清扫（282+338 批）', () => {
  it('九视图假成功/静默点全部改为按结果反馈', () => {
    for (const f of files) {
      const s = read(`../views/${f}.vue`);
      expect(s, f).not.toMatch(/copyText\([^)]*\)\s*\.then\(\(\) => store\.notify\('success'/);
      expect(s, f).not.toMatch(/copyText\([^;]*\);\s*store\.notify\('success'/);
    }
  });

  it('SqlBridge：时序假成功根治（按结果反馈）', () => {
    const s = read('../views/SqlBridgeView.vue');
    expect(s).toMatch(/copyText\(dsl\.value\)\.then\(ok => store\.notify\(ok \? 'success' : 'error'/);
  });

  /* 三百四十批：全站终查实证清零后的守卫扩展——裸 copyText（无 then/await 消费）禁令全站化 */
  it('全站裸 copyText（无 then/await 消费）禁令（340 批终查固化）', () => {
    const { readdirSync, statSync } = require('node:fs');
    const SRC = join(__dirname, '..');
    function walk(dir: string, acc: string[] = []): string[] {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (p.includes('__tests__')) continue;
        const st = statSync(p);
        if (st.isDirectory()) walk(p, acc);
        else if (p.endsWith('.vue') || p.endsWith('.ts')) acc.push(p);
      }
      return acc;
    }
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      const lines = readFileSync(f, 'utf-8').split('\n');
      lines.forEach((line, li) => {
        if (/^\s*(?:void\s+)?copyText\([^)]*\);\s*$/.test(line) && !/\.then|await/.test(line)) {
          bad.push(`${f}:${li + 1} → ${line.trim().slice(0, 60)}`);
        }
      });
    }
    expect(bad, '裸 copyText（结果被丢弃=静默失败）').toEqual([]);
  });

  it('SqlConsole：copyDsl 按结果反馈（338 批同型漏网补扫）', () => {
    const s = read('../views/SqlConsoleView.vue');
    expect(s).toMatch(/copyText\(dslPreview\.value\)\.then\(ok => store\.notify\(ok \? 'success' : 'error'/);
  });
});
