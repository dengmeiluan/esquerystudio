/**
 * R130 三十批：弹窗确认文案守卫（askConfirm 全站审计）。
 * 分级约定（composables/confirm.ts §8.1）：info=可逆 / warn=真实写 / critical=不可逆毁灭性（强制 guardText）。
 * 锁定：
 * 1) level:'critical' 的调用必须显式传 guardText（ConfirmModal 会静默降级 warn 视觉——
 *    「看似 critical 实无守卫」是暗状态，全站禁止）；
 * 2) 全部调用必须显式 okText（动词与动作匹配，禁止缺省的模糊「确认执行」）；
 * 3) 标题含删除类词（删除/清空/物理/清场/中止）必须显式 level（不允许隐式缺省 warn）；
 * 4) message 中对象名统一「」包裹（禁止 [${...}] 旧形式）。
 * 解析方式：正则扫描 views/ components/ 源码中的 askConfirm({...}) 调用块。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(vue|ts)$/.test(f)) out.push(p);
  }
  return out;
}

interface Call { loc: string; body: string }

const srcRoots = [join(__dirname, '../views'), join(__dirname, '../components')];
const calls: Call[] = [];
for (const root of srcRoots) {
  for (const p of walk(root)) {
    const s = readFileSync(p, 'utf-8');
    const re = /askConfirm\(\{([\s\S]{0,600}?)\}\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const line = s.slice(0, m.index).split('\n').length;
      calls.push({ loc: `${p.replace(/\\/g, '/').split('/src/')[1]}:${line}`, body: m[1] });
    }
  }
}

function has(body: string, key: string): boolean {
  return new RegExp(`\\b${key}\\s*:`).test(body);
}

describe('askConfirm 全站文案守卫', () => {
  it('测试自检：扫描到足够的调用点（防止路径变动导致空跑假绿）', () => {
    expect(calls.length).toBeGreaterThanOrEqual(35);
  });

  it('critical 调用必须显式 guardText', () => {
    const bad = calls.filter(c => /level:\s*'critical'/.test(c.body) && !has(c.body, 'guardText'));
    expect(bad.map(c => `${c.loc} critical 缺 guardText`)).toEqual([]);
  });

  it('全部调用必须显式 okText（禁止模糊的「确认执行」缺省）', () => {
    const bad = calls.filter(c => !has(c.body, 'okText'));
    expect(bad.map(c => `${c.loc} 缺 okText`)).toEqual([]);
  });

  it('标题含删除类词必须显式 level', () => {
    const bad = calls.filter(c => {
      const t = /title:\s*'([^']*)'/.exec(c.body)?.[1] ?? '';
      return /删除|清空|物理|清场|中止/.test(t) && !has(c.body, 'level');
    });
    expect(bad.map(c => `${c.loc} 删除类操作缺显式 level`)).toEqual([]);
  });

  it('message 对象名统一「」包裹（禁止 [${...}] 旧形式）', () => {
    const bad = calls.filter(c => /\[\$\{/.test(c.body));
    expect(bad.map(c => `${c.loc} message 用 [${'{...}'} 包裹对象，应统一「」`)).toEqual([]);
  });

  /* R130 六十五批：反向审计——「清空本地历史类」danger 钮不得绕过 askConfirm 直删。
     RestView 清空请求历史此前 @click 内联直删（title 写着「不可恢复」却无确认），
     是 30 批「41 处调用点文案审计」的反向盲区：没调 askConfirm 的地方根本不在扫描集里。 */
  it('反向审计：RestView 清空历史必须走 askConfirm（禁止内联直删）', () => {
    const t = readFileSync(join(__dirname, '../views/RestView.vue'), 'utf-8');
    expect(t).toContain('askClearHist');
    expect(t).not.toMatch(/@click="history = \[\]; persistHist\(\)"/);
    expect(t).toMatch(/title: '清空请求历史'/);
    expect(t).toMatch(/level: 'warn'/);
  });
});

/* R130 六十六批：65 批反向审计的横向推广——不按「askConfirm 调用点」扫（那只能覆盖
   已确认的），按「破坏性 API 调用点」扫：凡引用删除/取消类 API 的视图文件，必须同时
   引用 askConfirm 或 ConfirmModal（BrowserView 等用 ConfirmModal 组件形态，两者等价）。
   2026-09-05 人工全量核对过 15+3 处调用点全绿，本守卫把结论资产化防回潮：
   未来新增删除类调用点（新视图/新 API）落地即被拦截，不会再出现 RestView 式裸删。 */
describe('破坏性 API 确认覆盖守卫（六十六批）', () => {
  /* api.ts 中全部破坏性/不可逆语义的 API（删除数据/取消任务；快照恢复走表单流另有 critical 确认） */
  const DESTRUCTIVE_APIS: Array<[string, RegExp]> = [
    ['deleteById', /\bapi\.deleteById\b/],
    ['deleteIndex', /\bapi\.deleteIndex\b/],
    ['deleteTemplate', /\bapi\.deleteTemplate\b/],
    ['snapshotDelete', /\bapi\.snapshotDelete\b/],
    ['ilmPolicyDelete', /\bapi\.ilmPolicyDelete\b/],
    ['deleteStoredScript', /\bapi\.deleteStoredScript\b/],
    ['auth.deleteUser', /\bapi\.auth\.deleteUser\b/],
    ['deleteByQuery', /\bapi\.deleteByQuery\b/],
    ['clustersDelete', /\bapi\.clustersDelete\b/],
    ['cancelTask', /\bapi\.cancelTask\b/],
  ];

  it('每个引用破坏性 API 的文件都必须有确认通道（askConfirm 或 ConfirmModal）', () => {
    const offenders: string[] = [];
    let pairs = 0;
    for (const root of srcRoots) {
      for (const p of walk(root)) {
        const s = readFileSync(p, 'utf-8');
        const hit = DESTRUCTIVE_APIS.filter(([, re]) => re.test(s)).map(([n]) => n);
        if (!hit.length) continue;
        pairs += hit.length;
        const hasConfirm = /\baskConfirm\b/.test(s) || /ConfirmModal/.test(s);
        if (!hasConfirm) offenders.push(`${p.replace(/\\/g, '/').split('/src/')[1]} 引用 ${hit.join(',')} 但无确认通道`);
      }
    }
    expect(pairs, '破坏性 API×文件对数（自检防空跑——API 更名会归零）').toBeGreaterThanOrEqual(12);
    expect(offenders).toEqual([]);
  });
});

/* R130 七十二批：IndexHub ops tab 的 raw 写操作确认对称性。
   opRaw 是语义化直执行封装（POST _refresh/_flush/_cache clear 等），**绕过了上面
   「破坏性 API 名单」守卫的雷达**（api.deleteXxx 命名法扫不到 raw 路径调用）——
   新盲区形态。锁定：「影响读写」组的 _close/_open 必各经一个 askConfirm 函数
   （askClose/askOpen），且模板按钮接线对应的 ask 函数；安全组的 refresh/flush/
   cache clear（可逆零影响）不在锁内。 */
describe('IndexHub ops raw 写操作确认对称性（七十二批）', () => {
  const src = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

  it('自检：opRaw 定义在场（防空跑）', () => {
    expect(src).toMatch(/async function opRaw\(method: string, path: string, okMsg: string/);
  });

  it('_close/_open 各只出现一次且必经 askClose/askOpen（对称性锁）', () => {
    expect(src.match(/opRaw\('POST', `\/\$\{cur\.value\}\/_close`/g)?.length).toBe(1);
    expect(src.match(/opRaw\('POST', `\/\$\{cur\.value\}\/_open`/g)?.length).toBe(1);
    expect(src).toMatch(/async function askClose\(\)/);
    expect(src).toMatch(/async function askOpen\(\)/);
    expect(src.indexOf('askOpen')).toBeLessThan(src.indexOf('opRaw(\'POST', src.indexOf('async function askOpen')));
    /* 模板接线：关闭/打开按钮都走 ask 函数（禁止回退为 @click 内联 opRaw 直执行） */
    expect(src).toMatch(/@click="askClose">关闭…/);
    expect(src).toMatch(/@click="askOpen">打开…/);
    expect(src).not.toMatch(/@click="opRaw\('POST', `\/\$\{cur\}\/_(open|close)`/);
  });
});
