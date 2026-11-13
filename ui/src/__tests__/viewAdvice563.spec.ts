/**
 * 五百六十三批轨1：五视图输入面纠错建议 + 只读面语义分档高亮——
 *  A utils/inputAdvice 新单源（独占域新增，共享层本体）：
 *    - jsonShapeAdvice：SearchTemplates 参数值 JSON 形态纠错建议（{ [ 开头但解析失败
 *      才说话：中文引号/中文冒号/尾随逗号/括号不平衡逐一落因；普通字符串主形态零打扰）；
 *    - synonymFixHint：SynonymsManager 坏行「怎么改」建议（全角标点给半角改写结果、
 *      => 右项缺失给补法、分隔符混用给裁决口径；与既有 badLines 九类硬错互补——
 *      badLines 说「哪错了」，本函数说「怎么改」；只对确定可修形态说话）。
 *  B 视图接线源码锁（readSrc 字面，556 批先例）：
 *    - SearchTemplatesView：highlightDslJson(rendered) 改用（搜索 DSL 语义分档，
 *      QUERY_SNIPPETS/ROOT_KEYS 键真实命中）+ paramFixHints 纠错建议块接线；
 *    - SynonymsManagerView：highlightDslJson(previewBody) 改用（analysis 语义键
 *      ANALYSIS_PARAM_ZH 命中 filter/type 等）+ badFixHints 建议条接线；
 *    - RemoteClusters/ClusterSettings/ConfigValidator 三视图维持 highlightJson
 *      字面（备案裁决：cluster settings/remote 键不在语义表，分档零收益，
 *      严禁生造——词表扩容后下批同步更新）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 动态导入（新模块在实施前不存在——整段呈红而非载入崩，556 先例） */
const iaMod: any = await import('../utils/inputAdvice');

const SRC = join(__dirname, '..');
const readSrc = (rel: string) => readFileSync(join(SRC, rel), 'utf-8');
const st = readSrc('views/SearchTemplatesView.vue');
const sy = readSrc('views/SynonymsManagerView.vue');
const rc = readSrc('views/RemoteClustersView.vue');
const cs = readSrc('views/ClusterSettingsView.vue');
const cv = readSrc('views/ConfigValidatorView.vue');

describe('五百六十三批 A1：jsonShapeAdvice 参数值 JSON 形态纠错建议', () => {
  it('普通主形态零打扰：空串/单词/数字/布尔/合法 JSON 一律空建议', () => {
    expect(iaMod.jsonShapeAdvice('')).toBe('');
    expect(iaMod.jsonShapeAdvice('  ')).toBe('');
    expect(iaMod.jsonShapeAdvice('bond')).toBe('');
    expect(iaMod.jsonShapeAdvice('123')).toBe('');
    expect(iaMod.jsonShapeAdvice('true')).toBe('');
    expect(iaMod.jsonShapeAdvice('{"size":10}')).toBe('');
    expect(iaMod.jsonShapeAdvice('[1,2]')).toBe('');
  });

  it('{ [ 开头但解析失败才说话：尾随逗号/中文引号/括号不平衡逐一落因', () => {
    expect(iaMod.jsonShapeAdvice('{"a":1,}')).toContain('尾随逗号');
    expect(iaMod.jsonShapeAdvice('{"a"：“x”}')).toContain('中文');
    expect(iaMod.jsonShapeAdvice('{"a":[1,2')).toContain('括号');
    expect(iaMod.jsonShapeAdvice('{"a":}')).not.toBe('');
  });

  it('建议文案点破「静默按字符串下发」盲区（兜底落因档）', () => {
    expect(iaMod.jsonShapeAdvice('{"a":}')).toContain('字符串');
  });
});

describe('五百六十三批 A2：synonymFixHint 坏行纠错建议', () => {
  it('全角标点行：给半角改写结果', () => {
    const hint = iaMod.synonymFixHint('苹果，apple');
    expect(hint).toContain('苹果,apple');
  });

  it('=> 右项缺失：给补法示例；分隔符混用：给裁决口径', () => {
    expect(iaMod.synonymFixHint('word =>')).toContain('补');
    const mixed = iaMod.synonymFixHint('a, b => c');
    expect(mixed).not.toBe('');
    expect(mixed).toContain('=>');
  });

  it('健康行零打扰：半角逗号组/单向替换/注释行/空串出空', () => {
    expect(iaMod.synonymFixHint('elasticsearch, es')).toBe('');
    expect(iaMod.synonymFixHint('苹果 => apple')).toBe('');
    expect(iaMod.synonymFixHint('# 注释')).toBe('');
    expect(iaMod.synonymFixHint('')).toBe('');
  });
});

describe('五百六十三批 B：视图接线源码锁', () => {
  it('SearchTemplatesView：highlightDslJson 改用 + 参数纠错建议块接线', () => {
    /* 六百零七批同步更新：import 行扩 prettyJson（内建视图档 json 档数据源 co-import，
       577-C1 完整新字面同步更新——判别力不变=highlightDslJson 改用在场+rendered 消费锚） */
    expect(st).toContain("import { highlightDslJson, prettyJson } from '../utils/jsonc'");
    expect(st).toContain('highlightDslJson(rendered)');
    expect(st).toContain("from '../utils/inputAdvice'");
    expect(st).toContain('jsonShapeAdvice');
    expect(st).not.toContain('highlightJson('); /* 旧单参出口退役不残留 */
  });

  it('SynonymsManagerView：highlightDslJson 改用 + 坏行建议条接线', () => {
    expect(sy).toContain("import { highlightDslJson } from '../utils/jsonc'");
    expect(sy).toContain('highlightDslJson(previewBody)');
    expect(sy).toContain('synonymFixHint');
    expect(sy).not.toContain('highlightJson(');
  });

  it('RemoteClusters/ClusterSettings/ConfigValidator：维持 highlightJson 字面（备案裁决防生造）', () => {
    expect(rc).toContain('highlightJson(');
    expect(cs).toContain('highlightJson(');
    expect(cv).not.toContain('highlightDslJson');
  });
});
