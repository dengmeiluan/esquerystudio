/**
 * 976 前后端权限映射对拍：共享写/读端点表与只读 POST 清单必须逐项一致。
 * 这两张表是前后端门禁的共同真源；任何一侧新增/改名而另一侧漏改，都会制造
 * 「前端可见后端 403」或「后端放行前端不显示」的漂移。源码级对拍把漂移拦在测试期。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const java = readFileSync(join(root, 'modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/auth/ConsoleAuthInterceptor.java'), 'utf-8');
const ts = readFileSync(join(__dirname, '../stores/auth.ts'), 'utf-8');

function javaMap(startMarker: string, endMarker: string): Record<string, string[]> {
  const start = java.indexOf(startMarker);
  const end = java.indexOf(endMarker, start + 1);
  expect(start, 'Java 映射起点存在').toBeGreaterThanOrEqual(0);
  expect(end, 'Java 映射终点存在').toBeGreaterThan(start);
  const block = java.slice(start, end);
  const out: Record<string, string[]> = {};
  const re = /m\.put\("([^"]+)",\s*(?:Arrays\.asList|java\.util\.Collections\.singletonList)\(([\s\S]*?)\)\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  }
  return out;
}

function tsMap(name: string): Record<string, string[]> {
  const start = ts.indexOf(`const ${name}: Record<string, string[]> = {`);
  const end = ts.indexOf('};', start);
  expect(start, `${name} 存在`).toBeGreaterThanOrEqual(0);
  const block = ts.slice(start, end);
  const out: Record<string, string[]> = {};
  const re = /'([^']+)':\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  }
  return out;
}

function normalize(map: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(map).sort()) out[k] = [...map[k]].sort();
  return out;
}

describe('976 前后端权限表对拍', () => {
  it('共享写端点表一致', () => {
    const backend = normalize(javaMap(
      'private static final java.util.Map<String, List<String>> SHARED_WRITE_PAGES;',
      '共享读端点 → 允许读取的页面写/读键'));
    const frontend = normalize(tsMap('SHARED_WRITE_PAGE_KEYS'));
    expect(frontend).toEqual(backend);
  });

  it('共享读端点表一致', () => {
    const backend = normalize(javaMap(
      'private static final java.util.Map<String, List<String>> SHARED_READ_PAGES;',
      '/** 最长片段匹配的共享读页面集合'));
    const frontend = normalize(tsMap('SHARED_READ_PAGE_KEYS'));
    expect(frontend).toEqual(backend);
  });

  it('只读 POST 关键字清单一致', () => {
    const jStart = java.indexOf('READONLY_POST_KEYWORDS = Arrays.asList(');
    const jEnd = java.indexOf(');', jStart);
    const javaKeys = [...java.slice(jStart, jEnd).matchAll(/"([^"]+)"/g)].map(x => x[1]).sort();
    const fStart = ts.indexOf('const READONLY_POST_KEYWORDS = [');
    const fEnd = ts.indexOf('];', fStart);
    const tsKeys = [...ts.slice(fStart, fEnd).matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
    expect(tsKeys).toEqual(javaKeys);
  });

  /* rank3 写关键词档：前端 OPS_WRITE_HINTS 必须等于后端 REBUILD ∪ CLUSTER 关键词并集。
     漏项方向=前端放行后端 403（假入口）；多项方向=前端过度拦截（有权限的人被拦）。 */
  it('rank3 写关键词并集一致（OPS_WRITE_HINTS ↔ REBUILD∪CLUSTER）', () => {
    const javaList = (name: string): string[] => {
      const start = java.indexOf(`${name} = Arrays.asList(`);
      expect(start, `${name} 存在`).toBeGreaterThanOrEqual(0);
      const end = java.indexOf(');', start);
      /* 剥块注释：清单注释里的退役词（如 "/adhoc-rebuild"）不是清单成员 */
      const block = java.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
      return [...block.matchAll(/"([^"]+)"/g)].map(x => x[1]);
    };
    const backend = [...new Set([...javaList('REBUILD_KEYWORDS'), ...javaList('CLUSTER_KEYWORDS')])].sort();
    const fStart = ts.indexOf('const OPS_WRITE_HINTS = [');
    const fEnd = ts.indexOf('];', fStart);
    expect(fStart, 'OPS_WRITE_HINTS 存在').toBeGreaterThanOrEqual(0);
    const frontend = [...ts.slice(fStart, fEnd).matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
    expect(frontend).toEqual(backend);
  });

  /* ADMIN 档双向对拍：前端 ADMIN_WRITE_HINTS 不得超出后端 ADMIN_KEYWORDS；
     后端缺的项（setup/apply|test）必须被前端 BOOTSTRAP 豁免集覆盖——这两跳兜底
     此前无锁，后端调整 setup 语义时前端零提示。 */
  it('ADMIN 关键词档双向一致（缺口必须由 BOOTSTRAP 豁免覆盖）', () => {
    const jStart = java.indexOf('ADMIN_KEYWORDS = Arrays.asList(');
    expect(jStart, 'ADMIN_KEYWORDS 存在').toBeGreaterThanOrEqual(0);
    const jEnd = java.indexOf(');', jStart);
    const backend = [...java.slice(jStart, jEnd).matchAll(/"([^"]+)"/g)].map(x => x[1]);
    const feList = (name: string): string[] => {
      const s = ts.indexOf(`const ${name} = [`);
      expect(s, `${name} 存在`).toBeGreaterThanOrEqual(0);
      const e = ts.indexOf('];', s);
      return [...ts.slice(s, e).matchAll(/'([^']+)'/g)].map(x => x[1]);
    };
    const adminFe = feList('ADMIN_WRITE_HINTS');
    const bootstrapFe = new Set(feList('BOOTSTRAP_WRITE_HINTS'));
    const backendSet = new Set(backend);
    for (const h of adminFe) {
      expect(backendSet.has(h), `前端 ADMIN 档 ${h} 必须在后端 ADMIN_KEYWORDS 内`).toBe(true);
    }
    for (const h of backend) {
      expect(adminFe.includes(h) || bootstrapFe.has(h),
        `后端 ADMIN 关键词 ${h} 前端缺失且未被 BOOTSTRAP 豁免覆盖（将成假入口）`).toBe(true);
    }
  });
});
