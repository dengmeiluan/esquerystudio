/* W4 Task 12：DSL 补全上下文判定（dslContext）——文档文本+光标 offset → 上下文。
   root→根层键（query/sort/aggs/...）；query-type→查询类型（match/term/...）；
   field→叶子子句字段名位；agg-name→aggs 容器键位 / agg-type→实例值对象键位（2.6.0 Task 8）；
   none→非 query/aggs 区深层不出层。 */
import { describe, it, expect } from 'vitest';
import { dslContext, QUERY_SNIPPETS, ROOT_KEYS } from '../utils/dslCompletionContext';
import { bodyKindForPath, bodyLangForPath, settingsKeyItems, mappingKeyItems, mappingFieldKeyItems, mappingFieldConfigAt, MAPPING_TYPES, templateKeyItems, templateRegionAt, indexBodyRegionAt, indexBodyKeyItems, aliasKeyItems, aliasConfigAt, reindexBodyRegionAt, reindexBodyKeyItems, sqlBodyKeyItems, SQL_VALUE_SNIPPETS, SQL_KEYWORD_SNIPPETS } from '../utils/dslCompletionContext';
import { lineIndentAt, reindentSnippet, commaAffixes } from '../utils/dslCompletionContext';

const E = (doc: string) => dslContext(doc, doc.length); // 光标在尾

describe('dslCompletionContext', () => {
  it('根层空键位 → root', () => {
    const doc = '{\n  \n}';
    expect(dslContext(doc, 4).kind).toBe('root');
  });
  it('query 内空键位 → query-type', () => {
    const doc = '{\n  "query": {\n    \n  }\n}';
    expect(dslContext(doc, 16).kind).toBe('query-type');
  });
  it('match 字段名位 → field', () => {
    const doc = '{\n  "query": {\n    "match": {\n      "\n    }\n  }\n}';
    expect(dslContext(doc, 35).kind).toBe('field');
  });
  it('bool.must 数组元素内 → query-type', () => {
    const doc = '{\n  "query": {\n    "bool": {\n      "must": [\n        {\n          \n        }\n      ]\n    }\n  }\n}';
    expect(dslContext(doc, 62).kind).toBe('query-type');
  });
  it('aggs 容器键位 → agg-name（2.6.0 起不再 none）', () => {
    const doc = '{\n  "aggs": {\n    "\n  }\n}';
    expect(dslContext(doc, 17).kind).toBe('agg-name');
  });
  it('QUERY_SNIPPETS 覆盖 match/term/terms/range/bool/exists/wildcard/match_phrase', () => {
    for (const k of ['match', 'term', 'terms', 'range', 'bool', 'exists', 'wildcard', 'match_phrase']) {
      expect(QUERY_SNIPPETS[k], k).toBeTruthy();
    }
  });
  it('ROOT_KEYS 覆盖 query/sort/aggs/_source/highlight/from/size/track_total_hits', () => {
    for (const k of ['query', 'sort', 'aggs', '_source', 'highlight', 'from', 'size', 'track_total_hits']) {
      expect(ROOT_KEYS).toContain(k);
    }
  });

  /* —— 以下为对抗性自测固化的边界用例（W2 luceneContext 评审同法：先探针实测再断言锁定） —— */
  it.each([
    /* 转义口径：与 luceneContext 同规则——反斜杠 run 奇数才算转义。
       A1 键内 \" 奇数 run → 串不提前关闭，仍在 match 字段位 */
    ['{"query": {"match": {"fi\\"eld": "x", ', { kind: 'field', clause: 'match' }],
    /* A2 偶数 run（\\\\ 自身是转义反斜杠）后引号关闭字符串 → 全文平衡回 root。
       计划参考实现 text[i-1]!=='\\' 会把该引号误判为转义、吞掉后续全部结构而错判 field——已按授权修复 */
    ['{"query": {"match": {"k\\\\": "v"}}}', { kind: 'root' }],
    /* A3 偶数 run 键正确关闭后，逗号回到子句第二键位 */
    ['{"query": {"match": {"k\\\\": "v", ', { kind: 'field', clause: 'match' }],
    /* 字符串内含结构符：inStr 保护跳过，不污染括号栈 */
    ['{"query": {"wildcard": {"f": "a{b}c"}}}', { kind: 'root' }],
    ['{"query": {"wildcard": {"f": "a{b}", ', { kind: 'field', clause: 'wildcard' }],
    ['{"query": {"term": {"f": "v]"}}, "size": ', { kind: 'root' }],
    /* 残缺文档容忍：半截字符串=正在敲字段名；栈不平衡按已扫描信息兜底 */
    ['{"query": {"match": {"', { kind: 'field', clause: 'match' }],
    ['{"query": {"bool": {"must": [{', { kind: 'query-type' }],
    /* query 值位未进入（{ 未敲）→ qIdx 即栈顶不算在 query 内，按根层口径兜底（pin 实际行为） */
    ['{"query":', { kind: 'root' }],
    /* 嵌套 query：lastIndexOf 取最内层，光标在嵌套 query 空键位 */
    ['{"query": {"bool": {"should": [{"query": {', { kind: 'query-type' }],
    /* 非 query 区深层一律 none 不出层 */
    ['{"aggs": {"a": {"terms": {"field": "', { kind: 'none' }],
    ['{"sort": [{"@timestamp": {"order": "', { kind: 'none' }],
    /* 第二字段位：已填字段名（栈顶 lastKey='title'）不丢 field 上下文——
       参考实现反向找最近 lastKey 会错得 'title' 而误判 query-type，已修复 */
    ['{"query": {"match": {"title": "x", ', { kind: 'field', clause: 'match' }],
    /* query 值闭合后回根层：参考实现 qIdx 命中栈顶帧仍判 query-type，已修复为 root */
    ['{"query": {"match": {"a": "b"}}, ', { kind: 'root' }],
    /* 复合子句数组元素内的叶子子句字段位 */
    ['{"query": {"bool": {"filter": [{"term": {', { kind: 'field', clause: 'term' }],
    /* range 操作符键位三层（range帧/字段帧/栈顶{）→ 2.6.0 起落 range-op 档（旧「兜底 query-type」误导出档已退役） */
    ['{"query": {"range": {"date": {"gte": "', { kind: 'range-op' }],
    /* 病理：字段名恰为 'query' 会被 lastIndexOf 当作嵌套 query 且位于栈顶 → none（pin 实际行为） */
    ['{"query": {"match": {"query": "x"', { kind: 'none' }],
    /* 字段值串内：DslCtx 无 value 档，按子句 field 位口径（pin 实际行为） */
    ['{"query": {"match": {"title": "he', { kind: 'field', clause: 'match' }],
  ])('%j', (doc, want) => expect(E(doc as string)).toMatchObject(want as object));

  it('空文档/纯空白 → root', () => {
    expect(dslContext('', 0).kind).toBe('root');
    expect(E('  \n ').kind).toBe('root');
  });

  it('offset 越界 clamp：负值按 0、超尾按全文，均收敛不炸', () => {
    expect(dslContext('{"query": {', -3).kind).toBe('root');
    expect(dslContext('{"query": {"match": {"a": "b"}}}', 9999).kind).toBe('root');
  });
});

describe('dslContext 注释跳过（JSONC // 与 /* */，字符串内不算注释）', () => {
  it('行注释内 } 不弹栈（负向钉：未跳过会误判 none）', () => {
    expect(E('{"query": {\n  // }\n  "match": {')).toEqual({ kind: 'field', clause: 'match' });
  });
  it('块注释内 } 不弹栈、引号/冒号不污染 lastKey（负向钉）', () => {
    expect(E('{"query": { /* } */\n  "match": {')).toEqual({ kind: 'field', clause: 'match' });
    /* 任务示例：块注释里的 "x": 1 不写入 lastKey（后续 "match" 正常落位） */
    expect(E('{"query": { /* "x": 1 */\n  "match": {')).toEqual({ kind: 'field', clause: 'match' });
  });
  it('字符串内 // 与 /* 不算注释（inStr 保护优先，回归钉）', () => {
    expect(E('{"query": {"wildcard": {"f": "a//b{c"}}}')).toEqual({ kind: 'root' });
    expect(E('{"query": {"wildcard": {"f": "a/*b{c"}}}')).toEqual({ kind: 'root' });
  });
});

describe('1439 SQL 体', () => {
  it('bodyKind 分档 + 键表 + 值骨架可落进 JSON', () => {
    expect(bodyKindForPath('/_sql', 'POST')).toBe('sql-body');
    expect(bodyKindForPath('/_sql/translate', 'POST')).toBe('sql-body');
    const keys = sqlBodyKeyItems().map(i => i.label);
    /* 官方 8.x SQL 搜索 API 的体字段全表（少一个就少一处补全入口） */
    expect(keys).toEqual([
      'query', 'fetch_size', 'time_zone', 'columnar', 'params', 'runtime_mappings',
      'filter', 'field_multi_value_leniency', 'allow_partial_search_results',
      'keep_alive', 'keep_on_completion', 'wait_for_completion_timeout',
      'page_timeout', 'request_timeout', 'catalog', 'cursor', 'index_include_frozen',
    ]);
    for (const s2 of SQL_VALUE_SNIPPETS) {
      /* text 已按 JSON 串转义：包一层引号必须能被 JSON.parse 吃下，且内容含 SELECT */
      const parsed = JSON.parse('"' + s2.text + '"');
      expect(parsed).toContain('SELECT');
    }
    /* 串内中途关键字：不含引号/反斜杠，插进 JSON 串始终安全 */
    expect(SQL_KEYWORD_SNIPPETS.length).toBeGreaterThanOrEqual(12);
    for (const k of SQL_KEYWORD_SNIPPETS) {
      expect(k.text, k.label).not.toMatch(/["\\]/);
      expect(() => JSON.parse('{"q": "SELECT ' + k.text + '"}')).not.toThrow();
    }
  });
});

describe('1439 重建索引体（_reindex）', () => {
  it('bodyKind 分档 + 区域判定（根/source/dest/script/source.query，深层不出档）', () => {
    expect(bodyKindForPath('/_reindex', 'POST')).toBe('reindex-body');
    const at = (s: string) => reindexBodyRegionAt(s, s.length);
    expect(at('{ "')).toBe('root');
    expect(at('{"source": { "')).toBe('source');
    expect(at('{"source": {"index": "a", "')).toBe('source');
    expect(at('{"dest": { "')).toBe('dest');
    expect(at('{"dest": {"index": "b", "')).toBe('dest');
    /* 1439：source.query 内回落整棵查询补全（此前当深层压掉）；sort 元素仍不出档 */
    expect(at('{"source": {"query": { "')).toBe('query');
    expect(at('{"source": {"query": {"bool": {"')).toBe('query');
    expect(at('{"source": {"sort": [{ "')).toBe('deep');
    /* 1439：source.sort / source._source 的数组元素位是字段名位 */
    expect(at('{"source": {"sort": ["')).toBe('sort');
    expect(at('{"source": {"_source": ["')).toBe('source-fields');
    /* 1439：根层 script 对象给脚本键 */
    expect(at('{"script": { "')).toBe('script');
    expect(at('{"script": {"params": { "')).toBe('deep');
  });

  it('四档键表覆盖官方结构且深层/查询区为空', () => {
    const root = reindexBodyKeyItems('root').map(i => i.label);
    expect(root).toEqual(expect.arrayContaining(['source', 'dest', 'script', 'conflicts', 'max_docs']));
    const src = reindexBodyKeyItems('source').map(i => i.label);
    expect(src).toEqual(expect.arrayContaining(['index', 'query', 'size', '_source', 'sort', 'remote']));
    const dst = reindexBodyKeyItems('dest').map(i => i.label);
    expect(dst).toEqual(expect.arrayContaining(['index', 'op_type', 'pipeline', 'routing', 'version_type']));
    expect(reindexBodyKeyItems('script').map(i => i.label)).toEqual(['source', 'lang', 'params', 'id']);
    expect(reindexBodyKeyItems('deep')).toEqual([]);
    expect(reindexBodyKeyItems('query')).toEqual([]);
  });
});

describe('1439 别名体', () => {
  it('PUT /idx/_alias/<名> → alias-body；/_aliases 动作体 1439 起单列 aliases-body', () => {
    expect(bodyKindForPath('/idx/_alias/a1', 'PUT')).toBe('alias-body');
    expect(bodyKindForPath('/_alias/a1', 'PUT')).toBe('alias-body');
    expect(bodyKindForPath('/_aliases', 'POST')).toBe('aliases-body');
    expect(bodyKindForPath('/idx/_alias/a1', 'GET')).toBe('alias-body'); /* GET 无体，bodyKind 不影响 */
  });

  it('aliasConfigAt：别名配置对象内为真，命名位/别名容器为假', () => {
    const at = (s: string) => aliasConfigAt(s, s.length);
    expect(at('{"aliases": {"a": { "')).toBe(true);
    expect(at('{"aliases": {"a": {"filter": {}, "')).toBe(true);
    expect(at('{"aliases": { "')).toBe(false);
    expect(at('{"template": {"aliases": {"a": { "')).toBe(true);
  });

  it('aliasKeyItems 覆盖官方别名配置键', () => {
    const labels = aliasKeyItems().map(i => i.label);
    expect(labels).toEqual(['filter', 'index_routing', 'routing', 'search_routing', 'is_write_index', 'is_hidden']);
  });
});

describe('1439 创建索引体（PUT /<索引名>）', () => {
  it('PUT 单段路径 → index-body；GET/带下划线端点不受影响', () => {
    expect(bodyKindForPath('/new-idx', 'PUT')).toBe('index-body');
    expect(bodyKindForPath('/{index}', 'PUT')).toBe('index-body');
    expect(bodyKindForPath('/new-idx', 'GET')).toBe('search');
    expect(bodyKindForPath('/idx/_settings', 'PUT')).toBe('settings');
    expect(bodyKindForPath('/_index_template/t1', 'PUT')).toBe('template');
    expect(bodyKindForPath('/new-idx?pretty', 'put')).toBe('index-body');
  });

  it('indexBodyRegionAt：三块各自分区，根层为 root', () => {
    const at = (s: string) => indexBodyRegionAt(s, s.length);
    expect(at('{ "')).toBe('root');
    expect(at('{"settings": { "')).toBe('settings');
    expect(at('{"settings": {"number_of_shards": 1, "')).toBe('settings');
    expect(at('{"mappings": { "')).toBe('mapping');
    expect(at('{"mappings": {"properties": {"a": { "')).toBe('mapping');
    expect(at('{"aliases": { "')).toBe('aliases');
    /* 先写 mappings 再进 settings：区域取当前所在容器 */
    expect(at('{"mappings": {}, "settings": { "')).toBe('settings');
  });

  it('indexBodyKeyItems：三键骨架都写出键和值', () => {
    const items = indexBodyKeyItems();
    expect(items.map(i => i.label)).toEqual(['settings', 'mappings', 'aliases']);
    for (const it of items) expect(it.insertText).toMatch(new RegExp('^"' + it.label + '"\s*:'));
  });
});

describe('1439 mappingFieldConfigAt / mappingFieldKeyItems', () => {
  it('properties.<字段>.{} 与 fields.<子域>.{} 内为字段配置位；顶层不是', () => {
    const at = (s: string) => mappingFieldConfigAt(s, s.length);
    expect(at('{"properties": {"title": { "')).toBe(true);
    expect(at('{"properties": {"title": {"type": "text", "')).toBe(true);
    expect(at('{"properties": {"a": {"properties": {"b": { "')).toBe(true);
    expect(at('{"properties": {"a": {"fields": {"raw": { "')).toBe(true);
    expect(at('{ "')).toBe(false);
    expect(at('{"properties": { "')).toBe(false);
  });

  it('字段配置键表含 analyzer/format/ignore_above 等（骨架都写全了键和值）', () => {
    const items = mappingFieldKeyItems();
    const labels = items.map(i => i.label);
    expect(labels).toEqual(expect.arrayContaining([
      'type', 'analyzer', 'search_analyzer', 'normalizer', 'format', 'ignore_above',
      'ignore_malformed', 'index', 'doc_values', 'null_value', 'copy_to', 'fields', 'properties', 'dynamic',
    ]));
    for (const it of items) {
      expect(it.insertText, it.label).toMatch(new RegExp('^"' + it.label + '"\s*:'));
    }
  });
});

describe('1439 templateRegionAt（模板体内分区）', () => {
  it('顶层/模板名层 → template；template.settings/mappings/aliases 各自分区', () => {
    const at = (s: string) => templateRegionAt(s, s.length);
    expect(at('{"index_patterns": [], "')).toBe('template');
    expect(at('{"template": { "')).toBe('template');
    expect(at('{"template": {"settings": { "')).toBe('settings');
    expect(at('{"template": {"settings": {"number_of_shards": "1", "')).toBe('settings');
    expect(at('{"template": {"mappings": { "')).toBe('mapping');
    expect(at('{"template": {"mappings": {"properties": {"x": { "')).toBe('mapping');
    expect(at('{"template": {"aliases": { "')).toBe('aliases');
    expect(at('{"template": {"aliases": {"old": { "')).toBe('aliases');
    /* 注释内不产键链（扫描与 dslContext 同口径） */
    expect(at('{"template": {"settings": { // "mappings": { "')).toBe('settings');
  });
});

describe('bodyKindForPath', () => {
  it('_bulk → bulk-body（NDJSON 动作行补全；文档行不出键）', () => {
    expect(bodyKindForPath('/{index}/_bulk')).toBe('bulk-body');
    expect(bodyKindForPath('/_bulk')).toBe('bulk-body');
  });
  it('_settings → settings', () => {
    expect(bodyKindForPath('/{index}/_settings')).toBe('settings');
    expect(bodyKindForPath('/alarm_record-20260524/_settings')).toBe('settings');
  });
  it('_mapping → mapping', () => {
    expect(bodyKindForPath('/{index}/_mapping')).toBe('mapping');
  });
  it('1439：非 search 体端点不再误给 search 骨架', () => {
    for (const p of ['/{index}/_analyze', '/_analyze']) expect(bodyKindForPath(p), p).toBe('analyze');
    for (const p of ['/_index_template/t1', '/_component_template/c1', '/_template/legacy']) {
      expect(bodyKindForPath(p), p).toBe('template');
    }
    for (const p of ['/_script/p1', '/_scripts/p1', '/idx/_close',
      '/idx/_open', '/idx/_forcemerge']) {
      expect(bodyKindForPath(p), p).toBe('none');
    }
    /* 1439 迁移：_mget→mget-body、_aliases→aliases-body、游标两端点各自成档 */
    expect(bodyKindForPath('/idx/_mget')).toBe('mget-body');
    expect(bodyKindForPath('/idx/_aliases')).toBe('aliases-body');
    expect(bodyKindForPath('/idx/_search/scroll')).toBe('scroll-body');
    expect(bodyKindForPath('/idx/_clear_scroll')).toBe('clear-scroll-body');
    /* 1439 迁移：_rollover 从 none 升 rollover-body、_update 从 doc 升 update-body
       （两者的体都是结构化对象，键位应出官方键；见 updateRolloverBody1439.spec） */
    expect(bodyKindForPath('/idx/_rollover')).toBe('rollover-body');
    expect(bodyKindForPath('/idx/_update/1')).toBe('update-body');
    /* 既有语义不被吞：settings/mapping/doc/search 族照旧 */
    expect(bodyKindForPath('/idx/_settings')).toBe('settings');
    expect(bodyKindForPath('/idx/_mapping')).toBe('mapping');
    expect(bodyKindForPath('/idx/_doc/1')).toBe('doc');
    expect(bodyKindForPath('/idx/_search')).toBe('search');
  });

  it('search 族 → search', () => {
    for (const p of ['/{index}/_search', '/_search']) {
      expect(bodyKindForPath(p), p).toBe('search');
    }
    /* 1439 迁移：按查询删/改不再按 search 处理（根键是 query/max_docs/…，不是 search 全套） */
    expect(bodyKindForPath('/{index}/_update_by_query')).toBe('ubq-body');
    expect(bodyKindForPath('/{index}/_delete_by_query')).toBe('dbq-body');
    /* 1439 迁移：只收 query 的三端点单列 query-body；模板执行/渲染体单列 */
    expect(bodyKindForPath('/{index}/_count')).toBe('query-body');
    expect(bodyKindForPath('/{index}/_validate/query')).toBe('query-body');
    expect(bodyKindForPath('/{index}/_explain/1')).toBe('query-body');
    expect(bodyKindForPath('/{index}/_search/template')).toBe('template-search-body');
  });
  it('query string / 大小写容错', () => {
    expect(bodyKindForPath('/{index}/_Search?pretty')).toBe('search');
    expect(bodyKindForPath('/{index}/_SETTINGS?flat_settings=true')).toBe('settings');
  });
  it('自由路径默认 search（补全只是建议，零降级）', () => {
    expect(bodyKindForPath('/my-index')).toBe('search');
    expect(bodyKindForPath('')).toBe('search');
  });
  it('1439 bodyLangForPath：_bulk 与 _msearch 族（含相对写法）→ ndjson，其余 json', () => {
    expect(bodyLangForPath('/idx/_bulk')).toBe('ndjson');
    expect(bodyLangForPath('/_msearch')).toBe('ndjson');
    expect(bodyLangForPath('_msearch/template')).toBe('ndjson');
    expect(bodyLangForPath('/idx/_search')).toBe('json');
    expect(bodyLangForPath('/idx/_bulk_like_index/_search')).toBe('json');
    expect(bodyLangForPath('')).toBe('json');
  });
});

describe('settingsKeyItems / mappingKeyItems', () => {
  it('settings 档 ≥25 条且带中文 detail，insertText 自带引号', () => {
    const items = settingsKeyItems();
    expect(items.length).toBeGreaterThanOrEqual(25);
    for (const it of items) {
      expect(it.detail, it.label).toBeTruthy();
      expect(it.insertText.startsWith('"'), it.label).toBe(true);
    }
    expect(items.some(i => i.label === 'refresh_interval')).toBe(true);
  });
  it('mapping 档含 properties 骨架 snippet 与核心键', () => {
    const items = mappingKeyItems();
    const prop = items.find(i => i.label === 'properties');
    expect(prop?.snippet).toBe(true);
    expect(prop?.insertText).toContain('${1:field}');
    expect(items.some(i => i.label === 'type')).toBe(true);
  });
  it('ux2 template 档：十键齐、全 snippet、带中文 detail', () => {
    const items = templateKeyItems();
    expect(items.map(i => i.label)).toEqual([
      'index_patterns', 'priority', 'template', 'settings', 'mappings', 'aliases', 'composed_of',
      'data_stream', 'version', '_meta',
    ]);
    for (const it of items) {
      expect(it.snippet, it.label).toBe(true);
      expect(it.detail, it.label).toBeTruthy();
      expect(it.insertText.startsWith('"'), it.label).toBe(true);
    }
    /* 容器骨架钉：template 含 settings+mappings 双层；index_patterns 数组形态 */
    const tpl = items.find(i => i.label === 'template')!;
    expect(tpl.insertText).toContain('"settings"');
    expect(tpl.insertText).toContain('"mappings"');
    expect(items.find(i => i.label === 'index_patterns')!.insertText).toContain('["${1:');
  });
  it('MAPPING_TYPES 覆盖核心类型', () => {
    for (const t of ['keyword', 'text', 'long', 'integer', 'double', 'date', 'boolean', 'object', 'nested', 'ip']) {
      expect(MAPPING_TYPES).toContain(t);
    }
  });
});

describe('lineIndentAt / reindentSnippet（snippet 缩进适配）', () => {
  it('lineIndentAt 取 offset 所在行前导空白；首行非空白开头返回空', () => {
    const doc = '{\n    "a"\n}';
    expect(lineIndentAt(doc, 7)).toBe('    ');
    expect(lineIndentAt(doc, 1)).toBe('');
  });
  it('reindentSnippet 换行叠加缩进；空缩进原样返回（单行文档零影响回归）', () => {
    expect(reindentSnippet('a\n  b\nc', '  ')).toBe('a\n    b\n  c');
    expect(reindentSnippet('a\n  b\nc', '')).toBe('a\n  b\nc');
    expect(reindentSnippet('单行无换行', '    ')).toBe('单行无换行');
  });
});

describe('commaAffixes（2.6.0 逗号自适应）', () => {
  /* 判定表（spec §3.1）：prefix 看 range 起点左邻（跳空白），suffix 看 range 终点右邻（跳空白）。
     宁缺毋滥：suffix 只在确证后跟兄弟键（'"'）时补，绝不制造 trailing comma。 */
  it.each([
    // [doc, start, end, prefix, suffix, 备注]
    ['{', 1, 1, '', '', '文首/{后 → 双无'],
    ['{ ', 2, 2, '', '', '左邻 { 跳空白'],
    ['{\n  ', 4, 4, '', '', '左邻 { 跨行跳空白'],
    ['{,', 2, 2, '', '', '左邻 , → 无前逗号（第二键位）'],
    ['{"a": 1, ', 9, 9, '', '', '左邻 , 后缀无（EOF）'],
    ['{"a": 1 ', 8, 8, ',', '', '左邻字面量 → 前逗号（漏敲补）'],
    ['{"a": {} ', 9, 9, ',', '', '左邻 } → 前逗号'],
    ['{"a": [] ', 9, 9, ',', '', '左邻 ] → 前逗号'],
    ['{"a": "x" ', 10, 10, ',', '', '左邻闭合串 → 前逗号'],
    ['{ }', 1, 2, '', '', '右邻 } → 无后逗号'],
    ['{ ]', 1, 2, '', '', '右邻 ] → 无后逗号（残缺容忍）'],
    ['{ "b": 2 }', 1, 2, '', ',', '右邻 " → 后逗号（后跟兄弟键）'],
    ['{\n  "b": 2\n}', 1, 2, '', ',', '右邻 " 跨行跳空白'],
    ['{"a": 1 "b": 2}', 8, 8, ',', ',', '漏敲逗号中间插入 → 前后双补'],
    ['{ "b"', 1, 2, '', ',', '右邻 " 即补（即使文档残缺）'],
    ['{ x', 1, 2, '', '', '右邻残缺（非引号）→ 不猜'],
  ])('commaAffixes(%j, %i, %i) → {prefix:%j, suffix:%j}', (doc, s, e, prefix, suffix) => {
    expect(commaAffixes(doc as string, s as number, e as number))
      .toEqual({ prefix, suffix });
  });

  it('跳过注释：左扫落到注释前逗号、右扫跳过块注释见兄弟键（offset 逐字符复算）', () => {
    // doc = '{"a": 1, // 备注\n'：'{'0 '"'1 'a'2 '"'3 ':'4 ' '5 '1'6 ','7 ' '8 '/'9 '/'10 ' '11 '备'12 '注'13 '\n'14，
    // 光标在换行后 = offset 15（doc.length）。左扫跳过 '// 备注' 落到 ',' → prefix ''（第二键位，不补前逗号）。
    expect(commaAffixes('{"a": 1, // 备注\n', 15, 15)).toEqual({ prefix: '', suffix: '' });
    // doc = '{ /* c */ "b": 2 }'：'{'0 ' '1 '/'2 '*'3 ' '4 'c'5 ' '6 '*'7 '/'8 ' '9 '"'10，
    // start=1、end=2（{ 后光标）。右扫跳过块注释见 '"b"' 起始引号 → suffix ','。
    expect(commaAffixes('{ /* c */ "b": 2 }', 1, 2)).toEqual({ prefix: '', suffix: ',' });
  });
});

describe('2.6.0 判定精度：range-op / exists-key', () => {
  it.each([
    /* range → 字段名 → { 三层 → range-op（spec §3.2 规则 3） */
    ['{"query": {"range": {"date": {', 'range-op'],
    ['{"query": {"range": {"date": {"gte": "x", ', 'range-op'],
    /* range 值对象键位（字段名位）仍是 field 档——不抢 */
    ['{"query": {"range": {', 'field'],
    /* 嵌套 bool/filter 内 range 同出 range-op（尾三帧判定免疫嵌套深度） */
    ['{"query": {"bool": {"filter": [{"range": {"date": {', 'range-op'],
    /* exists 值对象键位 → exists-key（钉死 field，不再出字段名档） */
    ['{"query": {"exists": {', 'exists-key'],
    ['{"query": {"bool": {"filter": [{"exists": {', 'exists-key'],
  ])('dslContext(%j) → %s', (doc, kind) => {
    expect(E(doc as string).kind).toBe(kind);
  });
});

describe('2.6.0 聚合上下文（spec §3.2）', () => {
  it.each([
    ['{"aggs": {', 'agg-name'],
    ['{"aggs": {"by_user": {', 'agg-type'],
    ['{"aggregations": {"a": {', 'agg-type'],
    /* aggregations 别名容器级 → agg-name；兄弟实例位（前一实例闭合后）→ agg-name */
    ['{"aggregations": {', 'agg-name'],
    ['{"aggs": {"a": {"terms": {}}, ', 'agg-name'],
    /* lastKey 遮蔽已知边界（评审 M1 pin）：实例值键位在最近完成键为 aggs 时落 none——
       方向安全（不出档非出错档），主流程（snippet 引导类型先于嵌套 aggs）不触达；
       若需修复：命中帧即栈顶时向外回退找次近 aggs 帧再分档 */
    ['{"aggs": {"a": {"aggs": {}, ', 'none'],
    /* 嵌套：实例值内再 aggs → 容器键位回 agg-name；其值对象键位 agg-type */
    ['{"aggs": {"a": {"terms": {"field": "x"}, "aggs": {', 'agg-name'],
    ['{"aggs": {"a": {"aggs": {"b": {', 'agg-type'],
    /* 根层其他容器不受影响 */
    ['{"sort": [', 'none'],
    ['{"query": {', 'query-type'],
  ])('dslContext(%j) → %s', (doc, kind) => {
    expect(E(doc as string).kind).toBe(kind);
  });
});
