/**
 * 复制诚实性横切补扫（282/364 收口后的全站守卫升格）。
 * 340 禁令只覆盖语句级裸调用（零反馈）；两类「无条件成功反馈」形态此前
 * 无全站守卫——await 后紧跟无条件 notify('success')（跨行形态，282 点名
 * 清单为单行形态）、.then(() => 零参回调内 notify('success')（282 仅九
 * 视图点名）。全站清点定谳存量漏网 = ScoreExplainView copyExplain，
 * 修复后由本守卫防回潮。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

function walkSrc(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (p.includes('__tests__') || p.includes('node_modules')) continue;
    const st = statSync(p);
    if (st.isDirectory()) walkSrc(p, acc);
    else if (p.endsWith('.vue') || p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

describe('复制诚实性横切补扫（全站无条件成功反馈禁令）', () => {
  it('ScoreExplainView copyExplain 按结果反馈（失败不再假报已复制）', () => {
    const s = read('../views/ScoreExplainView.vue');
    expect(s).toMatch(/const ok = await copyText\(/);
    expect(s).toMatch(/store\.notify\(ok \? 'success' : 'error'/);
  });

  it('全站禁令：await copyText 后无条件成功反馈（跨行假成功形态）', () => {
    const bad: string[] = [];
    for (const f of walkSrc(join(__dirname, '..'))) {
      const text = readFileSync(f, 'utf-8');
      const re = /await copyText\([^;]*\);\s*\n\s*store\.notify\('success'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const name = f.replace(/\\/g, '/').split('/').slice(-2).join('/');
        bad.push(`${name}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(bad, 'await copyText 后无条件报成功').toEqual([]);
  });

  it('全站禁令：.then 零参回调内报成功（282 点名形态全站化防回潮）', () => {
    const bad: string[] = [];
    for (const f of walkSrc(join(__dirname, '..'))) {
      const text = readFileSync(f, 'utf-8');
      const re = /copyText\([^)]*\)\s*\.then\(\s*\(\s*\)\s*=>\s*store\.notify\('success'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const name = f.replace(/\\/g, '/').split('/').slice(-2).join('/');
        bad.push(`${name}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(bad, '.then(() => 无条件报成功').toEqual([]);
  });
});
