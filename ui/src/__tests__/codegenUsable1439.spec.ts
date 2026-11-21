/**
 * 一千四百三十九批：代码导出的产物必须「真的能跑」。
 *
 * 用户拿「复制为 curl / JS / Python」的命令去别处执行——产物不可用等于整条链路骗人。
 * 实测三个缺陷（都在 1439 修掉）：
 *  ① curl 写成 `-d'\n{...}\n'`：单引号里的 `\n` 是字面反斜杠+n，终端发出去的是
 *     非法 JSON 体（ES 直接 400）；
 *  ② JS 写成 `JSON.stringify({"a-b":1})`：把 JSON 文本当对象字面量，键含连字符即语法错误；
 *  ③ body 内含单引号（`{"q":"it's"}`）时，单引号包裹的 curl 会被截断。
 *
 * 验收判据（比「看起来对」硬）：
 *  · curl 必须能被仓库自己的 parseCurl 还原成同一 method/path/**逐字 body**；
 *  · JS 产物必须能通过语法编译；
 *  · 三者都必须带上 Content-Type 与完整 body。
 */
import { describe, it, expect } from 'vitest';
import { toCurl, toJs, toPython } from '../utils/codegen';
import { parseCurl } from '../utils/curlParse';

/* 覆盖容易炸的 body 形态：普通 / 键含连字符 / 含单引号 / 含双引号转义 /
   含 $ 与反引号 / 中文 / 深层嵌套 / 含换行 */
const BODIES = [
  '{"query":{"term":{"status":"A"}}}',
  '{"query":{"term":{"a-b":1}}}',
  '{"q":"it\'s"}',
  '{"q":"say \\"hi\\""}',
  '{"q":"$HOME `whoami`"}',
  '{"title":"中文查询","size":10}',
  '{"query":{"bool":{"must":[{"term":{"a":1}},{"range":{"b":{"gte":1}}}]}}}',
  '{\n  "query": {\n    "match_all": {}\n  }\n}',
];

describe('1439 代码导出产物可用性', () => {
  it('① curl：能被 parseCurl 还原成同一 method/path/逐字 body', () => {
    const bad: string[] = [];
    for (const body of BODIES) {
      const cmd = toCurl('POST', '/idx/_search', body);
      const back = parseCurl(cmd);
      if (!back) { bad.push('解析失败：' + JSON.stringify(body)); continue; }
      if (back.method !== 'POST' || back.path !== '/idx/_search') bad.push('method/path 不符：' + cmd);
      if (back.body !== body.trim()) bad.push('body 不一致\n  期望 ' + JSON.stringify(body.trim()) + '\n  实得 ' + JSON.stringify(back.body) + '\n  命令 ' + cmd);
    }
    expect(bad, 'curl 往返问题：\n' + bad.join('\n')).toEqual([]);
  });

  it('② curl 不含字面 \\n（旧实现把 \\n 写进了单引号里）', () => {
    const cmd = toCurl('POST', '/idx/_search', '{"a":1}');
    expect(cmd).not.toContain("\\n");
    /* 负控：手工拼出旧形态，断言能识别 */
    expect(`-d'\\n{"a":1}\\n'`).toContain("\\n");
  });

  it('③ JS：产物必须语法可编译，且 body 以**字符串字面量**逐字携带原 JSON 文本', () => {
    const bad: string[] = [];
    for (const body of BODIES) {
      const src = toJs('POST', '/idx/_search', body);
      try { new Function('return (async () => {' + src + '})'); } catch (e: any) { bad.push(JSON.stringify(body) + ' → 语法错误 ' + e?.message); }
      /* 真正要证明的是「发出去的体与原请求一致」。JSON.stringify(JSON.parse(t)) 会重新序列化：
         超长整数丢精度、换行被压缩。这里把产物里的 body 表达式求值再比对。 */
      const m = src.match(/body: (".*"),\n/);
      if (!m) { bad.push(JSON.stringify(body) + ' → 未找到 body 字面量'); continue; }
      const sent = new Function('return ' + m[1])();
      if (sent !== body.trim()) bad.push('body 失真\n  期望 ' + JSON.stringify(body.trim()) + '\n  实得 ' + JSON.stringify(sent));
    }
    expect(bad, 'JS 产物问题：\n' + bad.join('\n')).toEqual([]);
    /* 负控：重新序列化的写法确实会失真——多行体被压缩，证明上面的判据是有效力的 */
    const multiline = '{\n  "a": 1\n}';
    expect(JSON.stringify(JSON.parse(multiline))).not.toBe(multiline);
  });

  it('④ Python：带 headers 与原始 JSON 文本体，字符串里的 true/false/null 不被改写', () => {
    const src = toPython('POST', '/idx/_search', '{"a":true,"b":false,"c":null}');
    expect(src).toContain('requests.request');
    expect(src).toContain('headers={');
    expect(src).toContain('data=');
    /* 缺陷实证：旧实现 pyLiteral 用 /\btrue\b/g 全量替换，`"true"`（字符串）会变成 `"True"`，
       请求语义从「值为布尔 true 的字符串」悄悄变成「值为 True 的字符串」。 */
    const tricky = '{"query":{"term":{"title":"true","flag":true,"none":"null"}}}';
    const py = toPython('POST', '/idx/_search', tricky);
    expect(py, '字符串里的 true 被改写').not.toContain('"True"');
    expect(py, '字符串里的 null 被改写').not.toContain('"None"');
    /* 字面量里的引号被转义为 \"，故匹配转义形态 */
    expect(py).toContain('\\"title\\":\\"true\\"');
    expect(py).toContain('\\"none\\":\\"null\\"');
  });

  it('⑥ Python 产物的 data 字面量逐字等于原 JSON 文本', () => {
    const bad: string[] = [];
    for (const body of BODIES) {
      const src = toPython('POST', '/idx/_search', body);
      const m = src.match(/data=(.*),\n\)/s);
      if (!m) { bad.push(JSON.stringify(body) + ' → 未找到 data 字面量'); continue; }
      /* 用 JSON 作为 Python 字符串字面量的求值器：对这批字符集，转义规则一致。
         负控：若产物里残留未转义的裸引号，求值会失败——即见到 bad。 */
      let sent: string;
      try { sent = JSON.parse(m[1]); } catch { bad.push(JSON.stringify(body) + ' → 字面量无法求值: ' + m[1]); continue; }
      if (sent !== body.trim()) bad.push('body 失真\n  期望 ' + JSON.stringify(body.trim()) + '\n  实得 ' + JSON.stringify(sent));
    }
    expect(bad, 'Python 产物问题：\n' + bad.join('\n')).toEqual([]);
  });

  it('⑦ 路径缺前导 / 时 URL 仍然合法（DevTools 路径框允许裸写 products/_search）', () => {
    /* 缺陷实证（真实浏览器复现）：路径框键入 `products/_search` 后复制为代码，产出
       `fetch("http://localhost:9200products/_search")`——主机名被并进路径，命令必然跑不通。 */
    const bad: string[] = [];
    for (const [path, host] of [['products/_search', 'http://localhost:9200'],
      ['products/_search', 'http://localhost:9200/'], ['/products/_search', 'http://localhost:9200']]) {
      const want = 'http://localhost:9200/products/_search';
      const urls = [toCurl('GET', path, undefined, host), toJs('GET', path, undefined, host), toPython('GET', path, undefined, host)]
        .map(s => s.match(/https?:\/\/[^"\s]+/)?.[0]);
      for (const u of urls) if (u !== want) bad.push(`path=${path} host=${host} → ${u}`);
    }
    expect(bad, 'URL 拼接问题：\n' + bad.join('\n')).toEqual([]);
  });

  it('⑤ 无 body 时不带 -d / body 字段（GET 类请求不能多塞空体）', () => {
    expect(toCurl('GET', '/idx/_cat/indices')).not.toContain('-d ');
    expect(toJs('GET', '/idx/_cat/indices')).not.toContain('body:');
    expect(toPython('GET', '/idx/_cat/indices')).not.toContain('json=');
  });
});
