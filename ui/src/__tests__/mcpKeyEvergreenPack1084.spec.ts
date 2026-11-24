/**
 * MCP key 全量常青包（toolPack=full）UI 看守：签发/编辑表单的常青包语义与提交链。
 * 源码锁范式（McpPanel 3900+ 行挂具成本高，契约点以字面锁钉住）：
 * ① 点「全量」工具包 → form.toolPack='full'（其余包/null）；
 * ② 任何手动改勾（单 action / 组全选）→ 回落 null（常青只能由整包动作授予）；
 * ③ 提交体带 toolPack（create 与 update 同体）；编辑回填 key.toolPack；
 * ④ key 列表「常青包」徽标 + 工具包区常青文案在场。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const panel = read('../components/McpPanel.vue');
const browserMcp = read('../platform/browserMcp.ts');

describe('MCP key 全量常青包（toolPack=full）', () => {
  it('表单态与包按钮激活态：全量包以 toolPack 标记为准', () => {
    expect(panel).toContain('toolPack: null as string | null');
    expect(panel).toContain("form.toolPack = packId === 'full' ? 'full' : null;");
    expect(panel).toContain("function isToolPackActive(pack: { id: string; tools: string[] })");
    expect(panel).toContain("return form.toolPack === 'full'");
    expect(panel).toContain('v-tip="pack.description" @click="applyToolPack(pack.id)"');
  });

  it('手动改勾回落死枚举（常青只能由整包动作授予）', () => {
    expect(panel).toContain('toggleArrItem(form.allowedTools, action.qualified, v); form.toolPack = null;');
    expect(panel).toContain('form.allowedTools = [...selected];\n  form.toolPack = null;');
  });

  it('提交体带 toolPack；编辑回填；新建重置', () => {
    expect(panel).toContain('toolPack: form.toolPack,');
    expect(panel).toContain("form.toolPack = k.toolPack === 'full' ? 'full' : null;");
    expect(panel).toMatch(/form\.expiresInDays = 0;\n  form\.toolPack = null;/);
  });

  it('key 列表常青徽标与包区常青文案在场', () => {
    expect(panel).toContain("k.toolPack === 'full'");
    expect(panel).toContain('常青包');
    expect(panel).toContain('服务端新增 action 自动纳入');
  });

  it('全量包描述升级为常青语义（browserMcp 包定义）', () => {
    expect(browserMcp).toContain("id: 'full'");
    expect(browserMcp).toContain('常青包：服务端新增 action 自动纳入本 key');
  });
});
