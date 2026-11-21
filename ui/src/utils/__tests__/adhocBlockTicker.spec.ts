import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* R93-9 / I-2 的看守。项目无 @vue/test-utils 且本轮硬约束是零新增依赖（含测试依赖），
   故无法 mount 组件断言运行时行为。退而求其次：对源码做结构断言。

   这类断言的已知弱点必须明说 —— 它测的是「代码长什么样」而不是「代码做了什么」，
   绕过方式是存在的（例如把 clearInterval 写进一个永不被调用的函数）。
   它能可靠抓住的是本轮真正的风险：**后续编辑顺手删掉清理、或把 1s 改回共享心跳**。
   运行时行为已用真实定时器单独验证（见 task-9-report-r93.md 的 I-2 证据段：
   2.6s 内跳 2 次、卸载后增量 0）。 */

const SRC = readFileSync(resolve(__dirname, '../../views/AdhocRebuildView.vue'), 'utf8');
const USENOW = readFileSync(resolve(__dirname, '../../composables/useNow.ts'), 'utf8');

/* #86 第二轮：把锚从「文件里出现过这个词」推进到「它在真正的执行体里」。
   普查发现两条断言可被「保留字面、销毁行为」的变异绕过（详见 task-86-round2-report.md）：
     · 卸载钩子只停轮询，stopBlockTicker/clearInterval 挪进同行尾注释 → 原断言全绿
     · stopBlockTicker 函数体掏空，clearInterval(blockTimer) 只剩注释 → 原断言全绿
   注释是「代码长什么样」与「代码做了什么」之间最薄的那层伪装，先剥掉它。 */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 块注释
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 行注释（避开 URL 里的 //）

describe('AdhocRebuildView 阻断计时（I-2）', () => {
  /* 防的失败模式 X：blockedSec 又接回 useNow 的 30s 共享心跳，
     界面显示「已阻断 7 秒」然后静止 30 秒。
     断言针对**导入与调用**，不针对「文中是否出现 useNow 字样」——
     本文件注释里就写着 useNow（在解释为什么不用它），按字样断言会假红。 */
  it('阻断秒数不依赖 useNow 的分钟级共享心跳', () => {
    expect(SRC).not.toMatch(/import\s*\{[^}]*\buseNow\b[^}]*\}\s*from/);
    expect(SRC).not.toMatch(/\buseNow\s*\(/);
  });

  /* 防的失败模式 X：有人为了让秒数跳动，直接把全站共享心跳改成 1s，
     给 NotifyCenter/DslQuery/History 白加 30 倍重渲染。
     useNow 是单例，它的 30s 是本视图**不许**动的前提。 */
  it('useNow 仍是 30s，未被本次修复波及', () => {
    expect(USENOW).toMatch(/setInterval\([\s\S]*?,\s*30000\s*\)/);
  });

  /* 防的失败模式 X：局部心跳周期不是秒级（显示秒数却按更粗的粒度刷新）。 */
  it('本视图自建 1s 局部心跳', () => {
    expect(SRC).toMatch(/blockTimer\s*=\s*setInterval\([\s\S]*?,\s*1000\s*\)/);
  });

  /* 防的失败模式 X：组件卸载后定时器还在跑（泄漏）。
     onBeforeUnmount 必须同时停轮询与停心跳 —— 原来它只停了轮询。

     #86：锚必须落在钩子的**回调体**里。原断言用 /onBeforeUnmount\(([\s\S]*?)\);\s*$/m
     取捕获组，一旦有人在同一行 `);` 后补尾注释，行末条件失配，正则就顺着往下吞到文件末尾，
     把 <style> 段乃至那句尾注释里的 stopBlockTicker 一并算进「钩子体」——于是
     「卸载只停轮询」这个真实泄漏被判为绿。改成在剥注释文本上取**花括号内**的回调体。 */
  it('onBeforeUnmount 同时清理轮询与阻断心跳', () => {
    const hook = CODE.match(/onBeforeUnmount\(\s*\(\)\s*=>\s*\{([^}]*)\}\s*\)/);
    expect(hook).toBeTruthy();
    expect(hook![1]).toMatch(/stopPolling\s*\(\)/);
    expect(hook![1]).toMatch(/stopBlockTicker\s*\(\)/);
  });

  /* 防的失败模式 X：心跳只在某几个 job 赋值点开关，漏掉一处就留下常驻定时器。
     开关必须与横幅渲染条件（stage === 'AWAIT_CONFIRM'）绑定同一个来源。

     #86：后两条原来是「全文出现过即可」。把 stopBlockTicker 的函数体掏空、
     clearInterval(blockTimer) 只留在体内一句注释里，定时器永远不停（真实泄漏），
     原断言依旧全绿 —— 正是本文件顶部注释预言过的那种绕过。
     改成：① 停表调用必须落在 watch 的回调体里；② clearInterval 必须落在
     stopBlockTicker 的**函数体**里，且都在剥注释文本上匹配。 */
  it('心跳开关与 AWAIT_CONFIRM 横幅条件同源', () => {
    expect(SRC).toMatch(/watch\(\s*\(\)\s*=>\s*job\.value\?\.stage === 'AWAIT_CONFIRM'/);
    const cb = CODE.match(/job\.value\?\.stage === 'AWAIT_CONFIRM',\s*\(\w+\)\s*=>\s*\{([^}]*)\}/);
    expect(cb).toBeTruthy();
    expect(cb![1]).toMatch(/stopBlockTicker\s*\(\)/);
    const body = CODE.match(/function\s+stopBlockTicker\s*\(\)\s*\{([\s\S]*?)\n\}/);
    expect(body).toBeTruthy();
    expect(body![1]).toMatch(/clearInterval\s*\(\s*blockTimer\s*\)/);
  });
});
