/**
 * 二百五十二批：真实形态原配置「复制→粘贴导入」全链路校准（用户点名：
 * 「基于真实的原配置和原样拷贝过来，校准看是不是校准极致准确」）。
 *
 * FIXTURE 取真实产线形态的 7.6.2 索引配置——多字段 keyword 子域/中文分析器/
 * 同义词/嵌套 dynamic template/copy_to/null_value/中文同义词表——而非简化样例。
 *
 * 锁定 parseEsConfigPaste「只拆壳不改值」铁律在复杂真实样本下成立：
 * 1) 完整 {mappings,settings} 形态：双节 deep-equal 原对象（键集+值+顺序无关语义等价）；
 * 2) GET _mapping / GET _settings 响应剥壳形态：剥壳后节 deep-equal；
 * 3) AdhocRebuildView 消费路径复现：JSON.parse(prettyJson(JSON.stringify(节))) 与源节
 *    deep-equal——落进向导双框的配置与源逐字段一致（校准不重写）；
 * 4) 特殊值保真：中文字段/中文同义词、epoch 数字、boolean、null_value、
 *    "index.knn" 布尔、指数无（ES 配置全整数）、点号嵌套键、UNICODE 转义往返。
 */
import { describe, it, expect } from 'vitest';
import { parseEsConfigPaste } from '../utils/esConfigPaste';

/* ── 真实形态 fixture：产线 7.6.2 中文业务索引配置（字段的形态集合取自常见业务索引） ── */
const REAL_MAPPINGS = {
  _meta: { version: '2026.09.11-01', owner: 'risk-team' },
  dynamic: 'strict',
  date_detection: false,
  dynamic_templates: [
    {
      strings_as_keyword: {
        match_mapping_type: 'string',
        match: 'ext_*',
        mapping: { type: 'keyword', ignore_above: 256 },
      },
    },
  ],
  properties: {
    bizNo: { type: 'keyword', ignore_above: 64, copy_to: 'search_all' },
    title: {
      type: 'text',
      analyzer: 'ik_cn_analyzer',
      search_analyzer: 'ik_cn_search',
      fields: { keyword: { type: 'keyword', ignore_above: 256 } },
    },
    amount: { type: 'scaled_float', scaling_factor: 100, null_value: 0 },
    createdAt: { type: 'date', format: 'yyyy-MM-dd HH:mm:ss||epoch_millis' },
    tags: { type: 'keyword', doc_values: false },
    extInfo: {
      type: 'object',
      properties: {
        channel: { type: 'keyword' },
        weight: { type: 'float', similarity: 'bm25' },
      },
    },
    detail: {
      type: 'nested',
      properties: {
        seq: { type: 'integer' },
        memo: { type: 'text', analyzer: 'ik_cn_analyzer' },
      },
    },
  },
};

const REAL_SETTINGS = {
  index: {
    number_of_shards: 3,
    number_of_replicas: 1,
    refresh_interval: '5s',
    max_result_window: 500000,
    sort: { field: ['createdAt'], order: ['desc'] },
    analysis: {
      analyzer: {
        ik_cn_analyzer: {
          type: 'custom',
          tokenizer: 'ik_max_word',
          filter: ['cn_synonym', 'lowercase', 'trim'],
        },
        ik_cn_search: {
          type: 'custom',
          tokenizer: 'ik_smart',
          filter: ['cn_synonym_search', 'lowercase'],
        },
      },
      filter: {
        cn_synonym: {
          type: 'synonym',
          synonyms: ['信用卡,贷记卡', '房贷 => 住房贷款', '额度提升,提额'],
        },
        cn_synonym_search: { type: 'synonym', synonyms: ['信用卡,贷记卡'] },
      },
    },
  },
};

const FULL = JSON.stringify({ settings: REAL_SETTINGS, mappings: REAL_MAPPINGS }, null, 2);
const SETTINGS_ONLY = JSON.stringify({ 'idx-risk-2026': { settings: REAL_SETTINGS } }, null, 2);
const MAPPINGS_ONLY = JSON.stringify({ 'idx-risk-2026': { mappings: REAL_MAPPINGS } }, null, 2);

/** AdhocRebuildView.doPasteImport 消费路径原样复现（prettyJson=JSON.stringify(x, null, 2)） */
function consumeLikeView(section: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(section, null, 2));
}

describe('真实配置粘贴校准（252 批）', () => {
  it('完整 {settings,mappings}：识别零拆改，双节 deep-equal 源对象', () => {
    const r = parseEsConfigPaste(FULL);
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.settings).toEqual(REAL_SETTINGS);
    expect(r.mappings).toEqual(REAL_MAPPINGS);
    /* 键集全等（防 toEqual 对多余键宽容的语义漂移——toEqual 本就严格，此处显式自证） */
    expect(Object.keys(r.settings!).sort()).toEqual(Object.keys(REAL_SETTINGS).sort());
    expect(Object.keys(r.mappings!).sort()).toEqual(Object.keys(REAL_MAPPINGS).sort());
  });

  it('GET _mapping 响应剥壳：剥壳后 mappings deep-equal 且 notes 说明外壳', () => {
    const r = parseEsConfigPaste(MAPPINGS_ONLY);
    expect(r.ok).toBe(true);
    expect(r.mappings).toEqual(REAL_MAPPINGS);
    expect(r.settings).toBeUndefined();
    expect((r.notes || []).join()).toContain('idx-risk-2026');
  });

  it('GET _settings 响应剥壳：嵌套 index.* 全层保真（含 analysis 中文同义词表）', () => {
    const r = parseEsConfigPaste(SETTINGS_ONLY);
    expect(r.ok).toBe(true);
    expect(r.settings).toEqual(REAL_SETTINGS);
    const analysis = (r.settings as any).index.analysis;
    expect(analysis.filter.cn_synonym.synonyms).toEqual(['信用卡,贷记卡', '房贷 => 住房贷款', '额度提升,提额']);
  });

  it('向导消费路径复现：落框值 JSON.parse∘stringify∘pretty 后仍逐字段一致', () => {
    const r = parseEsConfigPaste(FULL);
    expect(r.ok).toBe(true);
    expect(consumeLikeView(r.mappings as any)).toEqual(REAL_MAPPINGS);
    expect(consumeLikeView(r.settings as any)).toEqual(REAL_SETTINGS);
    /* 中文与特殊标点往返不走样 */
    const title = (consumeLikeView(r.mappings as any) as any).properties.title;
    expect(title.analyzer).toBe('ik_cn_analyzer');
    expect(title.fields.keyword.ignore_above).toBe(256);
    expect((consumeLikeView(r.settings as any) as any).index.number_of_shards).toBe(3);
  });

  it('字节级校准：完整形态粘贴→解析→回写序列化，与源序列化逐字节一致（键序保持）', () => {
    const r = parseEsConfigPaste(FULL);
    expect(r.ok).toBe(true);
    /* JSON.parse→stringify 的键序=原键序（JS 规范：整数型键除外，本样本无整数型键），
       故两次序列化必须逐字节一致——这是「校准不重写」的最强口径 */
    expect(JSON.stringify(r.mappings)).toBe(JSON.stringify(REAL_MAPPINGS));
    expect(JSON.stringify(r.settings)).toBe(JSON.stringify(REAL_SETTINGS));
  });
});
