/* 五百六十五批轨5件③【Snapshots 创建成功 notify 升格 action】看守。
 *
 * doCreate 成功 notify 此前纯文本「快照已提交（异步）：xxx」——快照是异步任务，toast 即逝后
 * 用户没有下一步指引（进度虽在列表行，但页面可能已切走）。对齐同文件 doRestore 先例
 * （恢复异步指路 notify action「去查询验证」）升格带 action「查状态」：深链 DevTools 预填
 * GET /_snapshot/<repo>/<name>（:686 行级「状态」动作同一契约，零新端点）。
 * 走源文本匹配理由同 adaptiveWave562 A3：notify action 载荷只能源断言。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('五百六十五批件③：快照创建成功 notify 带 action', () => {
  const view = strip(src('views/SnapshotsView.vue'));

  it('doCreate 成功 notify 调用含 action 段（不再纯文本）', () => {
    expect(view).toMatch(
      /store\.notify\('success', '快照已提交（异步）：' \+ createName\.value, \{[^]*?action:/,
    );
  });

  it('action 深链 DevTools 预填 GET /_snapshot/<repo>/<name>（1007：sessionStorage 契约）', () => {
    expect(view).toContain("openInDevtools('GET'");
    expect(view).toContain("`/_snapshot/${encodeURIComponent(currentRepo.value || '')}/${encodeURIComponent(createName.value)}`");
    expect(view).not.toContain('query: { _prefill:');
  });

  it('恢复先例不动：doRestore 的「去查询验证」action 仍在（升级不覆盖既有指路）', () => {
    expect(view).toContain("action: { label: '去查询验证'");
  });
});
