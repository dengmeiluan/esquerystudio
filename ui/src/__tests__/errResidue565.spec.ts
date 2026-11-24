/* 五百六十五批轨5件①【错误文案合并残面】看守。
 *
 * E1 IndexOptimizerView force_merge 的 r.error 分支此前裸拼后端原文
 *    `'force_merge 失败：' + r.message`，而同函数 catch（:440）已走 friendlyEsError ——
 *    同一操作两条出口口径不一致：r.error 路径把 ES 原始 JSON 大块摔给用户。
 *    合并单源 utils/esError.friendlyEsError（应用失败 :401 / 扫描失败 :360 同款形态）。
 * E2 AliasesView doCreate 的 filter JSON.parse catch 同病：裸 `e.message`（浏览器原生
 *    JSON 解析文案）—— 并轨 friendlyEsError（:522 别名操作失败同源口径）。
 * 走源文本匹配理由同 esErrorCode561/adaptiveWave562 头注：notify 出参口径只能源断言。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('五百六十五批件①：force_merge r.error 分支合并 friendlyEsError', () => {
  const view = strip(src('views/IndexOptimizerView.vue'));

  it('r.error 分支走 friendlyEsError（与同函数 catch 同口径单源）', () => {
    expect(view).toContain(
      "store.notify('error', 'force_merge 失败：' + friendlyEsError(String(r.message ?? r)))",
    );
  });

  it('裸 r.message 拼接不回潮（后端原文不再直出）', () => {
    expect(view, '裸 + r.message 拼接不得回潮').not.toContain('+ r.message)');
  });
});

describe('五百六十五批件①：filter DSL 解析失败合并 friendlyEsError', () => {
  const view = strip(src('views/AliasesView.vue'));

  it('doCreate 的 JSON.parse catch 走 friendlyEsError（别名操作失败 :522 同源口径）', () => {
    expect(view).toContain(
      "store.notify('error', 'filter DSL 解析失败：' + friendlyEsError(String(e?.message ?? e)))",
    );
  });

  it('裸 e.message 拼接不回潮', () => {
    expect(view, '裸 + e.message 拼接不得回潮').not.toContain("解析失败：' + e.message");
  });
});
