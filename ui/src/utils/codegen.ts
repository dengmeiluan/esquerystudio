/** 三语言代码生成（Kibana Console "Copy as" 同款） */
export type CodeLang = 'curl' | 'js' | 'python';

/**
 * 1439：路径可能没有前导 `/`（DevTools 路径框里用户直接敲 `products/_search`，
 * 产品其他位置按 ES 习惯自动补），直接拼成 `${host}${path}` 会得到
 * `http://localhost:9200products/_search`——DNS 名都变了，命令必然跑不通。
 * 三种语言共用同一拼接，收口在这里。host 末尾若已带 `/` 也不重复。
 */
function joinUrl(host: string, path: string): string {
  const h = host.replace(/\/+$/, '');
  const p = path || '';
  return h + (p.startsWith('/') || p.startsWith('?') ? p : '/' + p);
}

export function toCurl(method: string, path: string, body?: string, host = 'http://localhost:9200'): string {
  const m = method.toUpperCase();
  let cmd = `curl -X${m} "${joinUrl(host, path)}"`;
  if (body && body.trim()) {
    /* 1439：此前写的是 -d'\n{...}\n'——单引号里的 \n 是**字面反斜杠+n**，
       复制到终端执行时 curl 会把这段字面量当请求体发出去，ES 直接报 JSON 解析失败。

       用双引号包裹并转义 shell 里在双引号内有语义的四个字符（\ " $ `）。
       选双引号而非单引号的原因：单引号无法转义自身，body 含 `'`（如 {"q":"it's"}）
       就得写成 '\'' 这种拼接形态，可读性差且容易在解析侧出错。 */
    const payload = body.trim().replace(/[\\"$`]/g, ch => '\\' + ch);
    cmd += ` -H "Content-Type: application/json" -d "${payload}"`;
  }
  return cmd;
}

export function toJs(method: string, path: string, body?: string, host = 'http://localhost:9200'): string {
  const m = method.toUpperCase();
  const hasBody = body && body.trim();
  /* 1439：body 是 JSON **文本**，不能直接塞进 JSON.stringify(...) 当对象字面量——
     `{"a-b":1}` 在 JS 里是语法错误（键含连字符），整段代码跑不起来。

     也不要写成 JSON.stringify(JSON.parse(text))：那会重新序列化，超长整数丢精度、
     换行被压缩，发出去的体与原请求不再一致；且 body 非法 JSON 时运行时直接抛错。
     直接把 JSON 文本作为字符串字面量传入，逐字节等同原请求。 */
  return `const resp = await fetch("${joinUrl(host, path)}", {
  method: "${m}",${hasBody ? `
  headers: { "Content-Type": "application/json" },
  body: ${JSON.stringify(body!.trim())},` : ''}
});
const data = await resp.json();
console.log(data);`;
}

export function toPython(method: string, path: string, body?: string, host = 'http://localhost:9200'): string {
  const m = method.toUpperCase();
  const hasBody = body && body.trim();
  /* 1439：此前用 json=<Python 字面量>，靠正则把 true/false/null 换成 True/False/None——
     它分不清「JSON 布尔」与「字符串里的同名词」，`{"term":{"title":"true"}}`
     会被改成 title = "True"，请求语义被悄悄改写。

     改成 data=<原始 JSON 文本>：不做任何文本替换，发出去的字节与原请求一致。
     Content-Type 已在 headers 里声明为 application/json，序列化行为与 json= 等价。 */
  return `import requests

resp = requests.request(
    "${m}",
    "${joinUrl(host, path)}",${hasBody ? `
    headers={"Content-Type": "application/json"},
    data=${pyStr(body!.trim())},` : ''}
)
print(resp.json())`;
}

/** JSON 文本 → Python 字符串字面量（仅转义，不改写内容）。 */
function pyStr(json: string): string {
  return JSON.stringify(json);
}

export function generate(lang: CodeLang, method: string, path: string, body?: string, host?: string): string {
  if (lang === 'js') return toJs(method, path, body, host);
  if (lang === 'python') return toPython(method, path, body, host);
  return toCurl(method, path, body, host);
}
