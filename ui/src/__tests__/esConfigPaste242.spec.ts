/**
 * 242 批：parseEsConfigPaste 多形态识别锁定。
 * 校准铁律：识别只拆壳，值原样透传——「Mapping 页复制全部 → 托管重建粘贴导入」
 * 全链内容必须与源严格一致（deepEqual 级），不允许任何静默重写。
 */
import { describe, it, expect } from 'vitest';
import { parseEsConfigPaste } from '../utils/esConfigPaste';

const MAPPING = { properties: { title: { type: 'text', analyzer: 'my_analyzer' }, code: { type: 'keyword', ignore_above: 256 } } };
const SETTINGS = { index: { number_of_shards: '3', refresh_interval: '1s' } };

describe('parseEsConfigPaste（242 批粘贴导入）', () => {
  it('完整配置 {mappings, settings}（Mapping 页复制全部形态）→ 拆双框且原值透传', () => {
    const src = { mappings: MAPPING, settings: SETTINGS };
    const r = parseEsConfigPaste(JSON.stringify(src, null, 2));
    expect(r.ok).toBe(true);
    expect(r.mappings).toEqual(MAPPING);
    expect(r.settings).toEqual(SETTINGS);
    expect(r.notes!.join()).toContain('完整配置');
  });

  it('GET _mapping 响应（索引名包裹）→ 剥壳取 mappings', () => {
    const r = parseEsConfigPaste(JSON.stringify({ my_index_2026: { mappings: MAPPING } }));
    expect(r.ok).toBe(true);
    expect(r.mappings).toEqual(MAPPING);
    expect(r.settings).toBeUndefined();
    expect(r.notes!.join()).toContain('my_index_2026');
  });

  it('GET _settings 响应（索引名包裹）→ 剥壳取 settings', () => {
    const r = parseEsConfigPaste(JSON.stringify({ my_index_2026: { settings: SETTINGS } }));
    expect(r.ok).toBe(true);
    expect(r.settings).toEqual(SETTINGS);
    expect(r.mappings).toBeUndefined();
  });

  it('纯 mapping 片段 {properties} → mapping 框', () => {
    const r = parseEsConfigPaste(JSON.stringify(MAPPING));
    expect(r.ok).toBe(true);
    expect(r.mappings).toEqual(MAPPING);
  });

  it('{mappings:{...}} 单侧 → mapping 框', () => {
    const r = parseEsConfigPaste(JSON.stringify({ mappings: MAPPING }));
    expect(r.ok).toBe(true);
    expect(r.mappings).toEqual(MAPPING);
  });

  it('{settings:{...}} 单侧 → settings 框', () => {
    const r = parseEsConfigPaste(JSON.stringify({ settings: SETTINGS }));
    expect(r.ok).toBe(true);
    expect(r.settings).toEqual(SETTINGS);
  });

  it('{index:{...}} 裸 settings → settings 框', () => {
    const r = parseEsConfigPaste(JSON.stringify(SETTINGS));
    expect(r.ok).toBe(true);
    expect(r.settings).toEqual(SETTINGS);
  });

  it('扁平化 settings 键（Kibana 风格）→ settings 框', () => {
    const flat = { 'index.number_of_shards': '3', 'index.refresh_interval': '1s' };
    const r = parseEsConfigPaste(JSON.stringify(flat));
    expect(r.ok).toBe(true);
    expect(r.settings).toEqual(flat);
  });

  it('识别不重写：deepEqual 级校准（键序之外的值/嵌套必须一字不差）', () => {
    const src = { mappings: MAPPING, settings: SETTINGS };
    const r = parseEsConfigPaste(JSON.stringify(src, null, 2));
    /* parse→stringify 往返等价：源串再 parse 后与拆出结果逐值相等 */
    expect(r.mappings).toEqual(JSON.parse(JSON.stringify(MAPPING)));
    expect(r.settings).toEqual(JSON.parse(JSON.stringify(SETTINGS)));
  });

  it('垃圾输入逐类拒绝', () => {
    expect(parseEsConfigPaste('').ok).toBe(false);
    expect(parseEsConfigPaste('not json').ok).toBe(false);
    expect(parseEsConfigPaste('[1,2]').ok).toBe(false);
    expect(parseEsConfigPaste('"str"').ok).toBe(false);
    expect(parseEsConfigPaste(JSON.stringify({ aliases: { a1: {} } })).ok).toBe(false);
  });

  /* ============ 503 批：ES 原样形态宽容（校准误差第二案，用户实报固化） ============ */

  const IDX_FLAT_SETTINGS = {
    'index.analysis.analyzer.my_hanlp_index_analyzer.tokenizer': 'hanlp_index',
    'index.number_of_shards': '5',
    'index.uuid': 'AA2dO9yQQy6ODPKku1IZlA',
  };
  const IDX_MAPPING = { properties: { title: { type: 'text', analyzer: 'my_hanlp_index_analyzer' } } };

  it('503 Mapping 页 rawJson 合体形态（段内带索引名壳）→ 段内剥壳拆双框', () => {
    /* inspect 保留索引名维度：rawJson={mappings:{idx:{properties}},settings:{idx:{"index.*"平铺}}} */
    const src = { mappings: { sentiment_news_published: IDX_MAPPING }, settings: { sentiment_news_published: IDX_FLAT_SETTINGS } };
    const r = parseEsConfigPaste(JSON.stringify(src, null, 2));
    expect(r.ok).toBe(true);
    expect(r.mappings).toEqual(IDX_MAPPING);
    expect(r.settings).toEqual(IDX_FLAT_SETTINGS);
    expect(r.notes!.join()).toContain('sentiment_news_published');
  });

  it('503 inspect mapping 形态 {idx:{properties}} 直贴 → 兜底剥壳', () => {
    const r = parseEsConfigPaste(JSON.stringify({ sentiment_news_published: IDX_MAPPING }));
    expect(r.ok).toBe(true);
    expect(r.mappings).toEqual(IDX_MAPPING);
    expect(r.notes!.join()).toContain('sentiment_news_published');
  });

  it('503 flat GET _settings 响应 {idx:{"index.*"}} 直贴 → 兜底剥壳', () => {
    const r = parseEsConfigPaste(JSON.stringify({ sentiment_news_published: IDX_FLAT_SETTINGS }));
    expect(r.ok).toBe(true);
    expect(r.settings).toEqual(IDX_FLAT_SETTINGS);
    expect(r.notes!.join()).toContain('sentiment_news_published');
  });
});
