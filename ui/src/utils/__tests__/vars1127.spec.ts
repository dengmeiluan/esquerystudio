import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyVars, missingVars, hasVars, loadVars, saveVars } from '../vars';

/* Console Variables（Kibana Console 同款 ${var} 插值）的语义锁。
   DevTools 此前**完全没接**这套插值：用户在 REST 控制台写 ${idx} 会原样发给 ES，
   拿到难懂的语法错误。补接线前先把插值语义与「未定义变量」检测钉死。 */

beforeEach(() => localStorage.clear());

describe('applyVars 插值语义', () => {
  const vars = { idx: 'orders', n: '3', obj: '{"a":1}', arr: '[1,2]', text: 'hello' };

  it('引号内 → 纯字符串替换（保留为用户写的字符串）', () => {
    expect(applyVars('{"index": "${idx}"}', vars)).toBe('{"index": "orders"}');
  });

  it('裸位置且值是合法 JSON → 按 JSON 注入（数字不加引号）', () => {
    expect(applyVars('{"size": ${n}}', vars)).toBe('{"size": 3}');
  });

  it('裸位置注入对象/数组', () => {
    expect(applyVars('${obj}', vars)).toBe('{"a":1}');
    expect(applyVars('${arr}', vars)).toBe('[1,2]');
  });

  it('裸位置且值不是合法 JSON → 加引号成字符串（保证产出仍是合法 JSON）', () => {
    expect(applyVars('{"q": ${text}}', vars)).toBe('{"q": "hello"}');
  });

  it('未定义变量原样保留（由 missingVars 负责提示，不在这里猜）', () => {
    expect(applyVars('{"index": "${nope}"}', vars)).toBe('{"index": "${nope}"}');
  });

  it('同一变量多次引用全部替换（JSON 体档，非 JSON 值加引号）', () => {
    expect(applyVars('${idx}-${idx}', vars)).toBe('"orders"-"orders"');
  });

  /* 路径档：一律原文替换，绝不加引号——加引号会得到合法但错误的路径 */
  it('路径档按字符串替换，不加引号', () => {
    expect(applyVars('/${idx}/_search', vars, { pathMode: true })).toBe('/orders/_search');
  });

  it('路径档同样支持多次引用', () => {
    expect(applyVars('/${idx}/${idx}', vars, { pathMode: true })).toBe('/orders/orders');
  });

  it('路径档未定义变量同样原样保留', () => {
    expect(applyVars('/${nope}/_search', vars, { pathMode: true })).toBe('/${nope}/_search');
  });

  it('变量名支持点与连字符', () => {
    expect(applyVars('${a.b-c}', { 'a.b-c': 'v' }, { pathMode: true })).toBe('v');
  });

  it('无占位符时原样返回', () => {
    expect(applyVars('{"a":1}', vars)).toBe('{"a":1}');
  });
});

describe('missingVars 未定义变量检测', () => {
  const vars = { idx: 'orders' };

  it('全部已定义 → 空数组', () => {
    expect(missingVars('${idx}', vars)).toEqual([]);
  });

  it('列出未定义的名字', () => {
    expect(missingVars('{"i":"${idx}","j":"${nope}"}', vars)).toEqual(['nope']);
  });

  it('去重且保持首现序', () => {
    expect(missingVars('${b} ${a} ${b}', vars)).toEqual(['b', 'a']);
  });

  it('无占位符 → 空数组', () => {
    expect(missingVars('{"a":1}', vars)).toEqual([]);
  });

  it('路径与 body 两处都扫（调用方拼接后传入）', () => {
    expect(missingVars('/${x}/_search ${y}', vars)).toEqual(['x', 'y']);
  });
});

describe('hasVars', () => {
  it('有占位符为 true', () => expect(hasVars('${a}')).toBe(true));
  it('无占位符为 false', () => expect(hasVars('{"a":1}')).toBe(false));
  it('未闭合不误判', () => expect(hasVars('${a')).toBe(false));
});

describe('变量表持久化', () => {
  it('saveVars → loadVars 往返', () => {
    saveVars({ a: '1', b: 'x' });
    expect(loadVars()).toEqual({ a: '1', b: 'x' });
  });

  it('存储被写坏时回落空对象（不抛错）', () => {
    localStorage.setItem('es_vars', '{oops');
    expect(loadVars()).toEqual({});
  });
});

/* ═══ 两个 REST 执行入口都必须接同一套变量语义（1127） ═══ */
describe('DevTools / RestView 接入变量（1127）', () => {
  const readView = (f: string) => readFileSync(join(__dirname, '../../views', f), 'utf-8');
  const files = ['DevToolsView.vue', 'RestView.vue'];

  for (const f of files) {
    it(`${f} 导入并使用 applyVars / missingVars`, () => {
      const src = readView(f);
      expect(src).toContain("from '../utils/vars'");
      expect(src).toContain('applyVars(');
      expect(src).toContain('missingVars(');
    });

    it(`${f} 路径用 pathMode（绝不加引号）`, () => {
      const src = readView(f);
      expect(src).toMatch(/applyVars\([^)]*\{ pathMode: true \}\)/);
    });

    it(`${f} 未定义变量先拦下再发车（提示里带变量名）`, () => {
      const src = readView(f);
      const at = src.indexOf('missingVars(');
      const seg = src.slice(at, at + 500);
      expect(seg).toContain('if (miss.length)');
      expect(seg).toContain('变量未定义');
    });
  }

  it('判定在展开之前（权限/范围看原始请求）', () => {
    const src = readView('DevToolsView.vue');
    const scope = src.indexOf('if (!requestInScope(');
    const vars = src.indexOf('const miss = missingVars(');
    expect(scope).toBeGreaterThan(-1);
    expect(vars).toBeGreaterThan(scope);
  });
});

/* ═══ 变量展开不得绕过前端范围门（1129 审计发现） ═══
   漏洞形态：守卫看「用户写的原始路径」，发送的是「展开后的路径」。
   非 ADMIN 写 /${v}/_snapshot、变量值含控制面段时，前端会放行一个越权请求。 */
describe('展开后必须再过一次范围门', () => {
  for (const f of ['DevToolsView.vue', 'RestView.vue']) {
    it(`${f} 在展开值与原始值不同时重新校验 requestInScope`, () => {
      const src = readFileSync(join(__dirname, '../../views', f), 'utf-8');
      /* 必须存在「比较展开前后 + 再调 requestInScope」这一对 */
      expect(src).toMatch(/pathOut !== t\.path|pathFinal !== pathRaw/);
      const at = src.indexOf('requestInScope');
      expect(at).toBeGreaterThan(-1);
      /* 至少出现两次：原始判定 + 展开后判定 */
      const calls = (src.match(/requestInScope\(/g) || []).length;
      expect(calls).toBeGreaterThanOrEqual(2);
    });
  }

  it('DevTools 的展开后判定发生在发车之前', () => {
    const src = readFileSync(join(__dirname, '../../views/DevToolsView.vue'), 'utf-8');
    const reGuard = src.indexOf('变量展开后的实际请求已越出当前授权范围');
    const send = src.indexOf('api.devtoolsExecute(t.method, pathOut, bodyFinal, signal)');
    expect(reGuard).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(reGuard).toBeLessThan(send);
  });

  it('RestView 的展开后判定也发生在发车之前', () => {
    const src = readFileSync(join(__dirname, '../../views/RestView.vue'), 'utf-8');
    const reGuard = src.indexOf('变量展开后的实际请求已越出当前授权范围');
    const send = src.indexOf('api.raw(method.value, pathFinal, bodyFinal, signal)');
    expect(reGuard).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(reGuard).toBeLessThan(send);
  });
});

/* 1132：Kibana 的三引号强制字符串替换。
   官方文档：「Triple quotes force string substitution」——当变量值本身是合法 JSON
   （如 `{"a":1}` / `5`），但用户希望它作为**字符串**塞进去时，写成 """${var}"""。
   我们此前只有「引号内=字符串、裸值=按 JSON 注入」两档，缺这一档：
   想把 5 当字符串写进 {"code": ...} 时无路可走（"${n}" 也行，但值含引号/换行会破行）。 */
describe('1132 三引号强制字符串替换', () => {
  const vars = { n: '5', obj: '{"a":1}', quoted: 'he said "hi"', multiline: 'a\nb' };

  it('三引号内 → 一律按字符串替换，不做 JSON 注入', () => {
    expect(applyVars('{"code": """${n}"""}', vars)).toBe('{"code": "5"}');
  });

  it('三引号内对象值也被当成字符串（而不是展开成对象）', () => {
    /* 值里含引号时必须转义，产出才是合法 JSON——"当成字符串"不等于原样拼接 */
    const out = applyVars('{"raw": """${obj}"""}', vars);
    expect(JSON.parse(out)).toEqual({ raw: '{"a":1}' });
  });

  it('普通双引号与三引号在同一文本里各自生效', () => {
    expect(applyVars('{"a":"${n}","b":"""${n}"""}', vars)).toBe('{"a":"5","b":"5"}');
  });

  it('路径档不受三引号影响（路径永远是原文）', () => {
    expect(applyVars('/"""${n}"""/_search', vars, { pathMode: true })).toBe('/"""5"""/_search');
  });
});
