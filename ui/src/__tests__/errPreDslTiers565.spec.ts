/* 五百六十五批件③：errPre 升语义分档（highlightJson → highlightDslJson）。
 *  背景：errPreHtml 对含 '{' 的错误原文走 highlightJson（j-key 单色），而 highlightDslJson
 *  的 textContent 与之逐字一致（jsonc.ts 头注自证：span 只换类名不改文本）。换 import+调用
 *  一处，四处错误面（QueryXray/ScoreExplain/BoostTuner/SearchSandbox 经 errPre）自动语义
 *  分档（DSL 语义键 j-clause 着色），零渲染结构变化。
 *  锁面：
 *   A 含 DSL 语义键的错误 JSON：errPreHtml 输出 j-clause 类名（语义档在场）；
 *   B 纯文本一致性：strip tags 后与原文逐字一致（textContent 契约，errPre 全文回看语义）；
 *   C 无语义键 JSON：输出与 highlightJson 逐字一致（errEndpoint534:66 既有锁的语义说明）；
 *   D 平文错误（不含 '{'）：转义平文输出不沾高亮（既有契约零扰动）。 */
import { describe, it, expect } from 'vitest';
import { errPreHtml } from '../utils/errPre';
import { highlightJson } from '../utils/jsonc';

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '');

describe('五百六十五批件③：errPreHtml 语义分档', () => {
  it('DSL 语义键出 j-clause（语义档在场），普通键维持 j-key', () => {
    const html = errPreHtml('{"query": {"bool": {"must": [{"term": {"status": "down"}}]}}, "size": 10}');
    expect(html).toContain('j-clause');
    expect(html).toContain('<span class="j-clause">"query":</span>');
    expect(html).toContain('<span class="j-clause">"bool":</span>');
    expect(html).toContain('<span class="j-key">"status":</span>');
  });

  it('textContent 一致：strip tags 后与原文逐字相同（全文回看语义不变）', () => {
    const json = '{"query": {"range": {"@timestamp": {"gte": "now-1d"}}}, "size": 0, "aggs": {}}';
    expect(stripTags(errPreHtml(json))).toBe(json);
  });

  it('无语义键 JSON：输出与 highlightJson 逐字一致（errEndpoint534 既有锁语义不破）', () => {
    const json = '{"error":true}';
    expect(errPreHtml(json)).toBe(highlightJson(json));
  });

  it('平文错误（不含 {）：转义平文输出，零高亮零分档', () => {
    const msg = '连接失败: timeout after 30s';
    expect(errPreHtml(msg)).toBe(msg);
  });

  it('双参 meta 徽标行不受影响（code/endpoint 头部与语义正文并存）', () => {
    const html = errPreHtml('{"query": {}}', { code: 'ES_ERROR', endpoint: 'GET /x' });
    expect(html).toContain('ep-err-code');
    expect(html).toContain('j-clause');
  });
});
