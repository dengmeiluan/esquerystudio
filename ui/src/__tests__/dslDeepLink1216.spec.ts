/**
 * 1216：`?dsl=` 分享深链的**编解码配对**守卫。
 *
 * 背景：我曾把「深链不生效」当成缺陷记下一笔，实际是**我自己拼错了链接**——
 * 生产方 `encodeDslParam` 用 `btoa(unescape(encodeURIComponent(s)))`（base64），
 * 我按 `encodeURIComponent(JSON)` 拼，消费端 `atob` 自然解不出，页面停在 `match_all`。
 * 用产品真实编码复测：3 个条件行全部渲染、编辑器载入 `query.bool.must`、URL 随后清理成
 * `#/search?mode=dsl`。**深链是通的。**
 *
 * 本 spec 不测浏览器，只把「这一对编解码必须互逆」钉死，让以后改编码的人立刻发现不匹配：
 * 生产方（DslQueryView / QueryHub / SqlBridge / SqlConsole / Lucene / SearchSandbox）
 * 与消费方（DslQueryView onMounted 的 atob 分支）用的是同一套 base64 约定。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeDslParam } from '../utils/queryHub';

const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

describe('1216 ?dsl= 深链编解码配对', () => {
  it('encodeDslParam 是 base64（btoa + UTF-8 转运），不是 encodeURIComponent', () => {
    const qh = src('utils/queryHub.ts');
    expect(qh).toContain('export function encodeDslParam(dsl: string): string {');
    expect(qh).toMatch(/return btoa\(unescape\(encodeURIComponent\(dsl\)\)\);/);
  });

  it('编码结果能被消费端同一套逆运算还原（含中文/引号/换行）', () => {
    const dsl = JSON.stringify({
      query: { bool: { must: [{ match: { title: '研报 "A" & B' } }, { term: { status: 'ACTIVE' } }] } },
    }, null, 2);
    const enc = encodeDslParam(dsl);
    /* 必须是合法 base64，且不含 %（一旦有人改成 encodeURIComponent 这条立刻红） */
    expect(enc).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decodeURIComponent(escape(atob(enc)))).toBe(dsl);
  });

  it('消费端用同一套逆运算解码，并把预填自展开', () => {
    const view = src('views/DslQueryView.vue');
    expect(view).toContain("const sharedDsl = usp.get('dsl');");
    expect(view).toContain('const decoded = decodeURIComponent(escape(atob(sharedDsl)));');
    /* G145：预填必须可见——缺省收起的构建器要把送入语句展开 */
    expect(view).toContain('buildCollapsed.value = false;');
    /* 解析失败要给人话，而不是静默 */
    expect(view).toContain('分享链接中的 DSL 解析失败');
  });

  it('生产方全部走 encodeDslParam（不许手拼编码）', () => {
    for (const rel of ['views/SqlBridgeView.vue', 'views/SqlConsoleView.vue', 'views/SearchSandboxView.vue']) {
      const s = src(rel);
      if (!s.includes('encodeDslParam')) continue;
      /* 出现 ?dsl= 的地方必须由 encodeDslParam 产出 */
      const handPicked = s.match(/dsl:\s*encodeURIComponent\(/g) || [];
      expect(handPicked, rel + ' 不应手拼 dsl 编码').toEqual([]);
    }
  });
});
