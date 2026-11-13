/**
 * 1439：SQL 体的 filter 回落 + 存储脚本体（PUT /_scripts/<id>）。
 *
 * · SQL 体的 "filter" 是 Query DSL——此前 filter 对象内零候选，现在回落到整棵查询补全；
 *   params/runtime_mappings 内是自由命名，不能把 SQL 根键灌进去。
 * · PUT /_scripts/<id> 的体是 {script:{lang,source,params}}——此前落 none 档零候选。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, sqlFilterRegionAt, storedScriptRegionAt,
  storedScriptBodyKeyItems, storedScriptKeyItems,
} from '../utils/dslCompletionContext';

describe('1439 SQL filter / 存储脚本体', () => {
  it('bodyKind：PUT /_scripts/<id> → stored-script-body；GET 仍 none；_execute 1439 起单列执行体', () => {
    expect(bodyKindForPath('/_scripts/my-script', 'PUT')).toBe('stored-script-body');
    expect(bodyKindForPath('_scripts/my-script', 'PUT')).toBe('stored-script-body');
    expect(bodyKindForPath('/_scripts/my-script', 'GET')).toBe('none');
    expect(bodyKindForPath('/_scripts/painless/_execute', 'POST')).toBe('script-execute-body');
    expect(bodyKindForPath('/_scripts/painless/_execute', 'GET')).toBe('none');
    expect(bodyKindForPath('/_scripts', 'PUT')).toBe('none');
    expect(bodyKindForPath('/idx/_sql', 'POST')).toBe('sql-body');
  });

  it('SQL 区域：根 / filter（查询）/ params·runtime_mappings（深层）', () => {
    const at = (s: string) => sqlFilterRegionAt(s, s.length);
    expect(at('{"')).toBe('root');
    expect(at('{"filter": {"')).toBe('query');
    expect(at('{"filter": {"bool": {"')).toBe('query');
    expect(at('{"params": {"')).toBe('deep');
    expect(at('{"runtime_mappings": {"')).toBe('deep');
    expect(at('{"filter": {"term": {"f": "x"}}}, "')).toBe('root');
  });

  it('存储脚本区域：根 / script / params 深层', () => {
    const at = (s: string) => storedScriptRegionAt(s, s.length);
    expect(at('{"')).toBe('root');
    expect(at('{"script": {"')).toBe('script');
    expect(at('{"script": {"params": {"')).toBe('deep');
    expect(at('{"script": {"lang": "painless"}, "')).toBe('root');
    expect(at('{"unexpected": {"')).toBe('deep');
  });

  it('键表：存脚本根 script；脚本对象 lang/source/params（无 id）', () => {
    expect(storedScriptBodyKeyItems().map(i => i.label)).toEqual(['script']);
    expect(storedScriptKeyItems().map(i => i.label)).toEqual(['lang', 'source', 'params']);
    expect(storedScriptKeyItems().map(i => i.label)).not.toContain('id');
  });
});
