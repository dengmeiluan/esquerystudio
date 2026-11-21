/**
 * 三百九十四批：契约一致性与依赖预算守卫——两项零缺口核验固化：
 * ① 页面契约（Java 侧 META-INF esquerystudio-pages.json，53 页）每条 route 必须在
 *   前端路由表有注册——契约驱动架构的单源一致性（新增页面漏注册路由即红）；
 * ② 生产依赖（dependencies 9 个）每个必须在 src 引用——防僵尸依赖混入产物包；
 *   工具链（eslint/typescript/vitest 等）在 devDependencies 不进产物，豁免。
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
    else if (name.endsWith('.vue') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const ROOT = join(__dirname, '../../..');
const SRC = join(__dirname, '..');

const contract = JSON.parse(readFileSync(join(ROOT, 'platform/src/main/resources/META-INF/esquerystudio-pages.json'), 'utf-8'));
const pages = contract.pages ?? contract;
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

describe('契约一致性（394 批）', () => {
  it('契约每条 route 在前端路由表有注册', () => {
    const rt = readFileSync(join(SRC, 'router.ts'), 'utf-8');
    const routerPaths = new Set((rt.match(/path: '([^']+)'/g) ?? []).map(s => s.slice(7, -1)));
    const missing = (pages as { route: string }[]).map(p => p.route).filter(r => r && !routerPaths.has(r));
    expect(missing, missing.join(',')).toEqual([]);
  });
});

describe('依赖预算（394 批）', () => {
  it('生产依赖每个都被 src 引用（防僵尸依赖进产物）', () => {
    const prodDeps = Object.keys(pkg.dependencies ?? {});
    expect(prodDeps.length, '生产依赖应保持小面').toBeLessThanOrEqual(12);
    const srcText = walk(SRC)
      .map(f => readFileSync(f, 'utf-8'))
      .join('\n');
    const unused = prodDeps.filter(d => {
      const esc = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      /* 引号+包名（含子路径 import 如 monaco-editor/esm/...）+引号 */
      const pat = new RegExp(`['"]${esc}(/[^'"]*)?['"]`);
      return !pat.test(srcText);
    });
    expect(unused, unused.join(',')).toEqual([]);
  });

  it('工具链不混入生产依赖', () => {
    const prod = new Set(Object.keys(pkg.dependencies ?? {}));
    for (const tool of ['eslint', 'typescript', 'vitest', 'vue-tsc', 'happy-dom', 'vite']) {
      expect(prod.has(tool), `${tool} 必须留在 devDependencies`).toBe(false);
    }
  });
});
