/**
 * 三百八十批：导出文件名口径守卫——全站下载文件名统一「语义前缀-exportStamp().扩展名」
 * （exportStamp=本地时间 YYYYMMDD-HHMMSS，255 批引入）。SecurityView 审计 CSV 漏网：
 * 自造 toISOString().slice(0,10)——UTC 日期在 UTC+8 凌晨 0-8 点导出会标成昨天，
 * 且与全站 16 处口径割裂。修复并钉死两条全站约束。
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

const files = [...walk(join(__dirname, '../views')), ...walk(join(__dirname, '../components'))];
const sec = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');

describe('导出文件名口径（380 批）', () => {
  it('SecurityView 审计 CSV 归一 exportStamp', () => {
    /* 五百二十九批锚同步更新：视图 downloadText(`ops-audit-${exportStamp()}.csv`) → QRT 换壳
       export-name（时间戳后缀由内核 exportCsv 统一拼 exportStamp()，口径不变）；
       五百三十二批更名 ops-audit → sec-audit（与页域 security:* 记忆键同前缀） */
    expect(sec).toContain('export-name="sec-audit"');
    expect(sec, '旧名不回潮').not.toContain('export-name="ops-audit"');
    expect(sec).not.toMatch(/toISOString\(\)\.slice/);
    /* 五百二十九批锚同步更新：QRT 内核接线在场（导出走内核 CSV，含 BOM+exportStamp） */
    expect(sec).toMatch(/import QueryResultTable from '\.\.\/components\/QueryResultTable\.vue';/);
    expect(sec).toContain(':export-cell="auditExportCell"');
  });

  it('全站约束：views 下禁用 toISOString 造下载文件名（UTC 日期陷阱）', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf-8');
      if (/downloadText\(`[^`]*toISOString/.test(s) || /`\w[\w-]*-\$\{new Date\(\)\.toISOString/.test(s)) offenders.push(f);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('exportStamp 覆盖规模守卫（≥15 处，防口径静默流失）', () => {
    let n = 0;
    for (const f of files) {
      n += (readFileSync(f, 'utf-8').match(/exportStamp\(\)/g) ?? []).length;
    }
    expect(n).toBeGreaterThanOrEqual(15);
  });
});
