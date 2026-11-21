/* MCP 契约门禁自看守：锁 scripts/check-mcp-parity.mjs 的单轨口径本身，
 * 防止口径被静默放宽（删组数断言、退掉 MRTR/Tasks 清单、放松实现名覆盖、
 * 拿掉负控或回退到旧的 151 细粒度三端注册断言）。
 *
 * 锁面：
 *   - 源码锚：17 组断言、五份清单（写/破坏性/系统管理/MRTR/Tasks）三端比对、
 *     「组必须覆盖全部内部实现名」双向断言、docs 17 组表对齐、负控保留。
 *   - 行为锚：门禁脚本在当前仓库终态上必须真实跑绿（含负控自检）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = join(__dirname, '../../..');
const gatePath = join(repoRoot, 'scripts/check-mcp-parity.mjs');
const gateSrc = readFileSync(gatePath, 'utf8');

function runGate(args: string[] = []): string {
  return execFileSync(process.execPath, [gatePath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('1120 MCP 契约门禁口径看守', () => {
  it('组数断言必须是 17，不得放宽', () => {
    expect(gateSrc, '必须保留 17 组数量断言').toContain('!== 17');
    expect(gateSrc).toContain('服务端分组数异常');
  });

  it('五份静态清单纳入三端比对：写 / 破坏性 / 系统管理 / MRTR / Tasks', () => {
    /* 写与破坏性三端（服务端 / 浏览器 / 本地 Node） */
    for (const anchor of ['WRITE_TOOLS', 'DESTRUCTIVE_TOOLS', 'MCP_WRITE_TOOLS', 'MCP_DESTRUCTIVE_TOOLS']) {
      expect(gateSrc, `清单锚 ${anchor} 不得被移除`).toContain(anchor);
    }
    /* 系统管理两端（本地 Node 无角色模型，不适用） */
    expect(gateSrc).toContain('ADMIN_ONLY_TOOLS');
    expect(gateSrc).toContain('MCP_ADMIN_ONLY_TOOLS');
    /* 本批新纳入的两份清单 */
    expect(gateSrc, 'MRTR 二次确认清单必须进门禁').toContain('MRTR_CONFIRM_TOOLS');
    expect(gateSrc).toContain('MCP_MRTR_CONFIRM_TOOLS');
    expect(gateSrc, 'Tasks 任务化清单必须进门禁').toContain('TASK_TOOLS');
    expect(gateSrc).toContain('MCP_TASK_TOOLS');
    expect(gateSrc, 'MRTR 清单不一致必须有失败文案').toContain('MRTR 确认清单不一致');
    expect(gateSrc, 'Tasks 清单不一致必须有失败文案').toContain('Tasks 工具清单不一致');
  });

  it('组必须双向覆盖三端内部实现名', () => {
    /* 三端实现名锚：服务端 case 分派、浏览器 MCP_TOOLS、本地 TOOL_DEFINITIONS */
    expect(gateSrc).toContain('parseJavaImplNames');
    expect(gateSrc).toContain('parseTsImplNames');
    expect(gateSrc).toContain('parseLocalImplNames');
    expect(gateSrc).toContain('MCP_TOOLS');
    expect(gateSrc).toContain('TOOL_DEFINITIONS');
    /* 双向覆盖：有实现没进组、进了组没有实现，都必须失败 */
    expect(gateSrc).toContain('分组未覆盖实现名');
    expect(gateSrc).toContain('分组映射到不存在的实现名');
  });

  it('docs 工具表必须按 17 组行 + action 枚举对齐', () => {
    expect(gateSrc).toContain('docs/mcp.md 工具表与 17 组不一致');
    expect(gateSrc).toContain('parseDocsGroups');
  });

  it('负控保留，旧口径（151 细粒度三端注册）不得回流', () => {
    expect(gateSrc).toContain('--negative-control');
    expect(gateSrc).toContain('negative control 未触发');
    /* 旧口径锚：151 个细粒度工具的注册解析与 OK 输出文案必须退役 */
    expect(gateSrc, '不得恢复细粒度工具注册解析').not.toContain('legacy tools');
    expect(gateSrc, '不得恢复单轨前的三端工具集比对口径').not.toContain('工具集不一致');
  });

  it('门禁在当前仓库终态上真实跑绿（含负控自检）', () => {
    const ok = runGate();
    expect(ok).toContain('17 action groups');
    expect(ok).toContain('166 actions');
    const negative = runGate(['--negative-control']);
    expect(negative).toContain('negative control OK');
  });
});
