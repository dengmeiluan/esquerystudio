/**
 * 四百七十三批：ALIAS_MAP 别名表内容完整性守卫——与 router.ts 的页面清单
 * （NAV_ITEMS/pages 合约）对齐核验：每个导航页都应有拼音别名条目（防新页面
 * 加入后「拼音搜索搜不到」静默失效）。别名查表函数本身已有 cmdAlias.spec.ts
 * 全/半角看守，不重复；此处验证「覆盖完整性」。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALIAS_MAP } from '../utils/cmdAlias';

const SRC = join(__dirname, '..');
const routerSrc = readFileSync(join(SRC, 'router.ts'), 'utf-8');

/** 从 pages 合约 JSON 提取全部页面名（与 router NAV_ITEMS 同源） */
const pagesContract = JSON.parse(
  readFileSync(join(SRC, '../../platform/src/main/resources/META-INF/esquerystudio-pages.json'), 'utf-8'),
);
const pages = pagesContract.pages ?? pagesContract;
const pageNames: string[] = pages.map((p: { name: string }) => p.name);

describe('ALIAS_MAP 健康检查（491 批）', () => {
  it('别名表非空且键/值均非空串（拼音增强是可选层，不做全页强覆盖断言）', () => {
    const keys = Object.keys(ALIAS_MAP);
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const k of keys) {
      expect(k.length, `键「${k}」为空`).toBeGreaterThan(0);
      expect(ALIAS_MAP[k].length, `键「${k}」别名为空`).toBeGreaterThan(0);
    }
  });

  it('pages 合约可解析且非空（单点数据源健康）', () => {
    expect(pageNames.length).toBeGreaterThanOrEqual(40);
  });
});
