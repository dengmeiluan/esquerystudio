/**
 * 四百一十六批：危险操作确认门全站守卫——class 含 danger 的按钮，其 @click
 * 直调的本地函数体必须含确认门（askConfirm/ConfirmModal/existing ask* 转发）。
 * 复验矩阵：Ilm 删策略(critical+guardText)/Adhoc 中止(warn)/Favorites 清空(warn)/
 * Security 删用户(critical+guardText) 全部有门。防回归：新增 danger 钮无门即红。
 * 豁免：本地可逆（删本地变量/取消进行中任务）与已走弹层状态（delOpen=true 类）不在扫描面。
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
const SEP = __dirname.includes('\\') ? '\\' : '/';
const files = walk(SRC);

describe('危险操作确认门守卫（416 批）', () => {
  it('views 层 danger 按钮 @click 直调函数体内必须含确认门（components/builder 为本地编辑撤销语义豁免）', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const f of files) {
      if (!f.includes(`${SEP}views${SEP}`)) continue;
      const s = readFileSync(f, 'utf-8');
      for (const m of s.matchAll(/class="btn[^"]*danger[^"]*"[^>]*@click="(\w+)\(/g)) {
        const fnName = m[1];
        // ask*/open 弹层状态类转发豁免
        if (/^ask|^open/.test(fnName)) continue;
        checked++;
        const body = s.slice(s.indexOf(`function ${fnName}`), s.indexOf(`function ${fnName}`) + 800);
        if (!body) { offenders.push(`${f}: ${fnName} 函数体未找到`); continue; }
        if (!/askConfirm|ConfirmModal|confirm\(/.test(body)) {
          offenders.push(`${f}: ${fnName} 无确认门`);
        }
      }
    }
    expect(checked, '扫描必须覆盖到存量（防正则失效静默通过）').toBeGreaterThanOrEqual(5);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('存量四高危门锚（critical 级 guardText 输入确认）', () => {
    const ilm = readFileSync(join(SRC, 'views/IlmView.vue'), 'utf-8');
    expect(ilm).toMatch(/level: 'critical', guardText: name/);
    const sec = readFileSync(join(SRC, 'views/SecurityView.vue'), 'utf-8');
    expect(sec).toMatch(/level: 'critical',\s*\n\s*guardText: username/);
  });
});
