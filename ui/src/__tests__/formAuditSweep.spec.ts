/**
 * R130 一百九十五批：F 组三合一终扫固化——弹窗 Enter/表单防重入/确认文案四级。
 * 扫描结论（盘点，防下会话重扫）：
 *  - useModalEnter 已接 7 处表单型弹窗（Ilm/Mapping/Snapshots/CreateIndexModal/DslQuery/Xmigrate/ClusterSwitcher）；
 *    查看型弹窗（RT 待提交预览/REST 历史/IndexHub 文档 JSON[TEXTAREA 多行放行是设计]/WelcomeWizard 向导）Enter 不适用；
 *  - Escape：n-modal 默认 closeOnEsc 全站统一，无缺口；
 *  - 防重入：提交类函数走「按钮 disabled+函数体内 busy 门」双层，补 SecurityView.doUpsert 函数体级门；
 *  - 确认文案：41 处 askConfirm 全扫——critical 必须 guardText、对象名必须「」包裹、okText 必须动词化。
 * 本文件 = 三维审计的守卫固化（violation 清单为空即绿，新增违规自动 FAIL）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
function walk(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.vue')) acc.push(p);
  }
  return acc;
}
const files = walk(join(SRC, 'views')).concat(walk(join(SRC, 'components')));

/* 2.1.4：原实现忽略入参、每次调用都重读全部 .vue，调用方又在循环里逐文件调用 →
 O(n²) 次读盘（约 1 万次）。全量套件并行负载下 5s 默认超时随机假红；改为只解析传入源码。 */
function askConfirmBlocks(src: string, file = ''): { file: string; block: string }[] {
  const out: { file: string; block: string }[] = [];
  const re = /askConfirm\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1; let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    out.push({ file, block: src.slice(m.index, i) });
  }
  re.lastIndex = 0;
  return out;
}

describe('F 组三合一终扫（一百九十五批）', () => {
  it('① useModalEnter 表单型弹窗接线清单不回退（7 处）', () => {
    const expectFiles = ['IlmView.vue', 'MappingView.vue', 'SnapshotsView.vue', 'XmigrateView.vue', 'DslQueryView.vue'];
    for (const f of expectFiles) {
      const s = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(s, f + ' 应接 useModalEnter').toContain('useModalEnter(');
    }
    for (const f of ['CreateIndexModal.vue', 'ClusterSwitcher.vue']) {
      const s = readFileSync(join(SRC, 'components', f), 'utf-8');
      expect(s, f + ' 应接 useModalEnter').toContain('useModalEnter(');
    }
  });

  it('② 全站 askConfirm：critical 必须 guardText（防误删无输入确认）', () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf-8');
      for (const b of askConfirmBlocks(s, f.split(/[\\/]/).pop()!)) {
        if (/level:\s*'critical'/.test(b.block) && !/guardText/.test(b.block)) {
          bad.push(b.file + ' → critical 缺 guardText');
        }
      }
    }
    expect(bad, 'critical 确认缺 guardText:\n' + bad.join('\n')).toEqual([]);
  });

  it('③ 确认文案：okText 动词化（禁「确定/确认/OK」裸词）', () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf-8');
      for (const b of askConfirmBlocks(s, f.split(/[\\/]/).pop()!)) {
        const ok = b.block.match(/okText:\s*'([^']*)'/);
        if (ok && /^(确定|确认|OK|ok)$/.test(ok[1].trim())) {
          bad.push(b.file + ' → okText 裸词「' + ok[1] + '」');
        }
      }
    }
    expect(bad, 'okText 应动词化:\n' + bad.join('\n')).toEqual([]);
  });

  it('④ 对象名「」包裹：message 中含索引/任务/快照等宾语时用「」引用', () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf-8');
      for (const b of askConfirmBlocks(s, f.split(/[\\/]/).pop()!)) {
        const msg = b.block.match(/message:\s*[`']([^`']*)/);
        if (msg && /(索引|任务|快照|用户|插件)「?\$\{/.test(msg[1]) && !msg[1].includes('「${')) {
          bad.push(b.file + ' → ' + msg[1].slice(0, 60));
        }
      }
    }
    expect(bad, '对象名应「」包裹:\n' + bad.join('\n')).toEqual([]);
  });

  it('⑤ 写类提交函数防重入清单（函数体级 busy 门）', () => {
    const checks: [string, string, RegExp][] = [
      ['views/SecurityView.vue', 'doUpsert', /if\s*\(nuBusy\.value\)\s*return/],
      ['views/IndexHubView.vue', 'saveDoc', /if\s*\(docSaving\.value\)\s*return/],
      ['views/SnapshotsView.vue', 'doRestore', /if\s*\(restoring\.value\)\s*return/],
    ];
    const bad: string[] = [];
    for (const [f, fn, re] of checks) {
      const s = readFileSync(join(SRC, f), 'utf-8');
      const body = s.match(new RegExp('async function ' + fn + '\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}'));
      if (!body) { bad.push(f + ' → ' + fn + ' 未找到'); continue; }
      if (!re.test(body[1])) bad.push(f + ' → ' + fn + ' 函数体缺 busy 门（按钮 disabled 之外的第二道防线）');
    }
    expect(bad, '防重入缺口:\n' + bad.join('\n')).toEqual([]);
  });
});
