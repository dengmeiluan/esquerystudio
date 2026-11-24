/**
 * 五百六十一批：目录扩容看守。
 *  A indexSettingsCatalog.SETTINGS_CATALOG 补六键（default_pipeline / final_pipeline /
 *    lifecycle.name / lifecycle.rollover_alias / merge.scheduler.max_thread_count /
 *    store.type）——键在册 + 四字段齐 + 中文备注非空 + dynamic 口径（管道/ILM/merge 调度
 *    可热更，store.type 静态）；
 *  B CLUSTER_SETTINGS_CATALOG 补三键（indices.fielddata.cache.size /
 *    cluster.routing.allocation.balance.index / cluster.routing.allocation.balance.shard，
 *    键名以 ES 官方为准）同口径；
 *  C dslCompletionContext.ANALYSIS_PARAM_ZH 扩容十键（ngram / edge_ngram / shingle /
 *    pattern_replace / stemmer 高频参数）——键在册 + 释义非空。
 */
import { describe, it, expect } from 'vitest';
import { SETTINGS_CATALOG, CLUSTER_SETTINGS_CATALOG, type SettingEntry } from '../utils/indexSettingsCatalog';
import { ANALYSIS_PARAM_ZH } from '../utils/dslCompletionContext';

const byKey = (cat: SettingEntry[], key: string): SettingEntry | undefined => cat.find(s => s.key === key);

describe('A SETTINGS_CATALOG 五百六十一批补六键', () => {
  const newKeys = ['default_pipeline', 'final_pipeline', 'lifecycle.name', 'lifecycle.rollover_alias',
    'merge.scheduler.max_thread_count', 'store.type'];

  it('键全部在册且四字段齐、中文备注非空', () => {
    for (const k of newKeys) {
      const s = byKey(SETTINGS_CATALOG, k);
      expect(s, `${k} 必须在册`).toBeTruthy();
      expect(s!.desc.trim(), `${k} 中文备注非空`).toBeTruthy();
      expect(s!.example.trim(), `${k} example 非空`).toBeTruthy();
      expect(typeof s!.dynamic, `${k} dynamic 必须是 boolean`).toBe('boolean');
    }
  });

  it('dynamic 口径：管道 / ILM / merge 调度可热更，store.type 静态（建索引时定）', () => {
    expect(byKey(SETTINGS_CATALOG, 'default_pipeline')!.dynamic).toBe(true);
    expect(byKey(SETTINGS_CATALOG, 'final_pipeline')!.dynamic).toBe(true);
    expect(byKey(SETTINGS_CATALOG, 'lifecycle.name')!.dynamic).toBe(true);
    expect(byKey(SETTINGS_CATALOG, 'lifecycle.rollover_alias')!.dynamic).toBe(true);
    expect(byKey(SETTINGS_CATALOG, 'merge.scheduler.max_thread_count')!.dynamic).toBe(true);
    expect(byKey(SETTINGS_CATALOG, 'store.type')!.dynamic).toBe(false);
  });
});

describe('B CLUSTER_SETTINGS_CATALOG 五百六十一批补三键', () => {
  const newKeys = ['indices.fielddata.cache.size', 'cluster.routing.allocation.balance.index',
    'cluster.routing.allocation.balance.shard'];

  it('键全部在册且中文备注非空', () => {
    for (const k of newKeys) {
      const s = byKey(CLUSTER_SETTINGS_CATALOG, k);
      expect(s, `${k} 必须在册`).toBeTruthy();
      expect(s!.desc.trim(), `${k} 中文备注非空`).toBeTruthy();
      expect(s!.example.trim(), `${k} example 非空`).toBeTruthy();
    }
  });
});

describe('C ANALYSIS_PARAM_ZH 五百六十一批扩容十键', () => {
  const newKeys = ['min_gram', 'max_gram', 'pattern', 'replacement', 'flags', 'language',
    'stem_exclusion', 'max_shingle_size', 'min_shingle_size', 'separator'];

  it('键全部在册且释义非空', () => {
    for (const k of newKeys) {
      expect(ANALYSIS_PARAM_ZH[k], `${k} 释义必须非空`).toBeTruthy();
    }
  });

  it('既有十四键零变动（扩容只增不改）', () => {
    for (const k of ['analyzer', 'search_analyzer', 'tokenizer', 'filter', 'char_filter', 'normalizer',
      'max_token_length', 'synonyms_path', 'stopwords', 'stopwords_path', 'mapping', 'aliases', 'type',
      'preserve_original']) {
      expect(ANALYSIS_PARAM_ZH[k], `${k} 既有释义必须保留`).toBeTruthy();
    }
  });
});
