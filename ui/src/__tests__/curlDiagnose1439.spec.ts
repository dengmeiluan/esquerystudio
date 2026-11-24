/**
 * 1439：curl 导入诊断（引号感知）。
 *
 * 缺陷实证（真实浏览器）：DevTools「复制为 curl」产出的命令若 body 含 `it's`，
 * 粘进「从 curl 导入」被判「单引号未闭合」直接拒收——产品自己的产物导不回自己。
 * 根因是诊断分别数两种引号，而不是按引用状态扫描。
 *
 * 判据：凡是 toCurl 能生成的 body 形态，diagnoseCurl 必须返回空串且 parseCurl 能还原；
 * 真正未闭合的引号仍要点名。
 */
import { describe, it, expect } from 'vitest';
import { diagnoseCurl, parseCurl } from '../utils/curlParse';
import { toCurl } from '../utils/codegen';

const BODIES = [
  '{"query":{"match_all":{}}}',
  '{"q":"it\'s"}',
  '{"q":"say \\"hi\\""}',
  '{"q":"$HOME `whoami`"}',
  '{"title":"中文查询"}',
  '{\n  "query": { "match_all": {} }\n}',
];

describe('1439 curl 导入诊断', () => {
  it('复制为 curl 的每种产物都能导回来（诊断空 + 解析还原 body）', () => {
    const bad: string[] = [];
    for (const body of BODIES) {
      const cmd = toCurl('POST', '/idx/_search', body);
      const why = diagnoseCurl(cmd);
      if (why) bad.push(JSON.stringify(body) + ' → ' + why);
      else if (parseCurl(cmd)?.body !== body.trim()) bad.push(JSON.stringify(body) + ' → 解析 body 不一致');
    }
    expect(bad, '自家产物导不回来：\n' + bad.join('\n')).toEqual([]);
  });

  it('负控：旧判据（分别数两种引号）会误伤 it\'s，证明这条用例真的有约束力', () => {
    const cmd = toCurl('POST', '/idx/_search', '{"q":"it\'s"}');
    const one = cmd.replace(/\r?\n/g, ' ').trim();
    const bare = one.replace(/\\./g, '');
    const oldVerdict = (bare.match(/'/g) || []).length % 2 === 1;
    expect(oldVerdict, '旧判据本应误报').toBe(true);
    expect(diagnoseCurl(cmd), '新判据必须放行').toBe('');
  });

  it('真正未闭合的引号仍要点名', () => {
    expect(diagnoseCurl('curl -XGET "http://es:9200/_cat/indices')).toContain('双引号未闭合');
    expect(diagnoseCurl("curl -XGET 'http://es:9200/_cat/indices")).toContain('单引号未闭合');
  });

  it('单引号包里含双引号是合法的（不能按 " 计数误报）', () => {
    const cmd = `curl -XPOST 'http://es:9200/idx/_search' -d '{"query":{"match_all":{}}}'`;
    expect(diagnoseCurl(cmd)).toBe('');
    expect(parseCurl(cmd)?.body).toBe('{"query":{"match_all":{}}}');
  });

  it('其余诊断分支保持原样', () => {
    expect(diagnoseCurl('')).toContain('未粘贴');
    expect(diagnoseCurl('GET /_search')).toContain('不是 curl');
    expect(diagnoseCurl('curl -XGET')).toContain('未找到 URL');
  });
});
