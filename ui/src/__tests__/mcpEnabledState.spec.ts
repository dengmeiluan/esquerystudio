import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panel = readFileSync(join(__dirname, '../components/McpPanel.vue'), 'utf-8');

describe('MCP 未启用状态与 AI 默认端点', () => {
  it('setup/status.mcpEnabled=false 时不再假装服务端在线/可签发', () => {
    expect(panel).toContain('const mcpEnabled = ref(true)');
    expect(panel).toContain('const mcpStateKnown = ref(false)');
    expect(panel).toContain('(s as any)?.mcpEnabled');
    expect(panel).toContain('const serverReady = computed(() => serverMode.value && mcpEnabled.value && mcpStateKnown.value)');
    expect(panel).toContain('MCP 未启用');
    expect(panel).toContain('正在检查 MCP 状态');
    expect(panel).toContain('v-else-if="!mcpEnabled"');
    expect(panel).toContain('esquerystudio.mcp.enabled=true');
    expect(panel).toContain('if (!serverReady.value) return;');
    expect(panel).toContain('MCP 密钥存储不可用');
  });

  it('独立服务端的 AI 端点默认取服务根而非 /esquerystudio', () => {
    expect(panel).toContain('serviceRootFromLocation(location.origin, location.pathname)');
    expect(panel).toContain("aiSetupDefaultMode === 'server'");
  });
});
