/** ux2 Task 1：语言能力层——ensureLanguages 幂等 + 5 语言注册钉 + monarch 关键规则快照。
 *  stub：editor.api mock 捕获 register/setMonarchTokensProvider/setLanguageConfiguration；
 *  sql.contribution 以副作用 flag 钉「模块链已加载官方 SQL 包」。 */
import { describe, it, expect, vi } from 'vitest';

const caps = vi.hoisted(() => ({
  registered: [] as string[],
  monarchs: {} as Record<string, any>,
  confs: {} as Record<string, any>,
  sqlLoaded: false,
}));

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  languages: {
    register: (def: { id: string }) => { caps.registered.push(def.id); },
    setMonarchTokensProvider: (id: string, def: any) => { caps.monarchs[id] = def; },
    setLanguageConfiguration: (id: string, conf: any) => { caps.confs[id] = conf; },
  },
}));
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => {
  caps.sqlLoaded = true; /* 模块副作用钉：import 链加载即置位 */
  return {};
});

import { ensureLanguages } from '../utils/monacoLanguages';

const srcOf = (re: any) => (re instanceof RegExp ? re.source : String(re));

describe('monacoLanguages', () => {
  it('幂等：二次调用零重复注册，四语言各一次', () => {
    ensureLanguages();
    ensureLanguages();
    expect(caps.registered).toEqual(['lucene', 'painless', 'ndjson', 'synonyms']);
  });

  it('sql 官方包随模块链加载', () => {
    expect(caps.sqlLoaded).toBe(true);
  });

  it('四语言 monarch 就位', () => {
    for (const id of ['lucene', 'painless', 'ndjson', 'synonyms']) {
      expect(caps.monarchs[id], id + ' monarch 缺失').toBeTruthy();
    }
  });

  it('lucene 关键规则：布尔操作符 keyword / 字段名 type / 短语串 string / 区间括号', () => {
    const root: any[] = caps.monarchs.lucene.tokenizer.root;
    expect(root.some(r => r[1] === 'keyword' && srcOf(r[0]).includes('AND'))).toBe(true);
    expect(root.some(r => r[1] === 'type' && srcOf(r[0]).includes(':'))).toBe(true);
    expect(root.some(r => r[1] === 'string' && srcOf(r[0]).includes('"'))).toBe(true);
    expect(root.some(r => r[1] === '@brackets')).toBe(true);
  });

  it('painless：ctx/doc/params 内置 type 色 + 块注释状态机', () => {
    const m = caps.monarchs.painless;
    expect(m.builtins).toContain('ctx');
    expect(m.builtins).toContain('doc');
    expect(m.builtins).toContain('params');
    expect(m.tokenizer.comment).toBeTruthy();
  });

  it('ndjson：键消费冒号着 string.key.json（复用 JSON 主题规则），值串 string.value.json', () => {
    const root: any[] = caps.monarchs.ndjson.tokenizer.root;
    expect(root.some(r => r[1] === 'string.key.json' && srcOf(r[0]).includes(':'))).toBe(true);
    expect(root.some(r => r[1] === 'string.value.json')).toBe(true);
    /* 括号配对/自动闭合配置必须给（autoClosingBrackets:'languageDefined' 读它） */
    expect(caps.confs.ndjson?.autoClosingPairs?.length).toBeGreaterThan(0);
  });

  it('synonyms：# 注释 + => 箭头 keyword', () => {
    const root: any[] = caps.monarchs.synonyms.tokenizer.root;
    expect(root.some(r => r[1] === 'comment' && srcOf(r[0]).includes('#'))).toBe(true);
    expect(root.some(r => r[1] === 'keyword' && srcOf(r[0]).includes('=>'))).toBe(true);
  });
});
