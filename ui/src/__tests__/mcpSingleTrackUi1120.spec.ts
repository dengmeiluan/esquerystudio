/* MCP 工具面单轨看守：浏览器桥、本地 Node 桥与控制台面板只保留 17 个 action 组。
 *
 * 锁面（源文本按字面匹配）：
 *   - browserMcp：tools/list 恰 17 组零细粒度直调名；legacy 名调用（协议入口与
 *     window.ESQueryStudioMCP.callTool 同源的 mcpCallTool）一律未知工具错误。
 *   - McpPanel：目录/签发不再有「细粒度兼容视图」切换，试跑固定以「组 + action」调用。
 *   - 本地 Node 桥与 App HTML/说明文案不再出现 legacy 计数或表述。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../platform/browserApi', () => ({ browserFetch: vi.fn(), abortAllEsRequests: vi.fn() }));
import { browserFetch } from '../platform/browserApi';
import { handleMcpRequest, mcpCallTool, MCP_GROUP_ACTIONS, MCP_TOOLS } from '../platform/browserMcp';

const fetchMock = browserFetch as unknown as ReturnType<typeof vi.fn>;
const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const browserMcpSrc = read('../platform/browserMcp.ts');
const panelSrc = read('../components/McpPanel.vue');
const localMcpSrc = read('../../../mcp/esquerystudio-local-mcp.mjs');

describe('1120 MCP 工具面单轨', () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it('browserMcp tools/list 恰好 17 组 action 工具，零细粒度直调名', async () => {
    const groups = Object.keys(MCP_GROUP_ACTIONS);
    expect(groups).toHaveLength(17);
    const list = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = list.result.tools as any[];
    expect(tools).toHaveLength(17);
    expect(tools.map(tool => tool.name)).toEqual(groups);
    const listed = new Set(tools.map(tool => tool.name));
    /* 组名之外的实现名（如 es_get_mapping）不得出现在客户端面；组与实现同名的 es_search 等按组语义存在 */
    for (const tool of MCP_TOOLS) {
      if (!groups.includes(tool.name)) expect(listed.has(tool.name), tool.name + ' 不得直出').toBe(false);
    }
    for (const tool of tools) {
      expect(tool.inputSchema.required).toEqual(['action']);
      expect(tool.inputSchema.properties.action.enum.length).toBeGreaterThan(0);
      expect(tool.description).not.toContain('legacy');
    }
  });

  it('legacy 名直调一律错误：协议入口、无 action 的组调用与页面内入口', async () => {
    const direct = await handleMcpRequest({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'es_get_mapping', arguments: { index: 'i' } },
    });
    expect(direct.result.isError).toBe(true);
    expect(direct.result.content[0].text).toContain('Unknown tool es_get_mapping');
    const noAction = await handleMcpRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'es_indices', arguments: { index: 'i' } },
    });
    expect(noAction.result.isError).toBe(true);
    expect(noAction.result.content[0].text).toContain('Missing action for es_indices');
    await expect(mcpCallTool('es_get_doc', { index: 'i', id: '1' })).rejects.toThrow('Unknown tool es_get_doc');
    await expect(mcpCallTool('es_search', { index: 'i' })).rejects.toThrow('Missing action for es_search');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('McpPanel 无「细粒度兼容视图」切换，试跑固定组 + action', () => {
    expect(panelSrc, '目录视图切换不得回流').not.toContain('catalogView');
    expect(panelSrc, '细粒度兼容视图开关不得回流').not.toContain('showLegacyTools');
    expect(panelSrc, '试跑组调用开关不得回流').not.toContain('trialAsGroup');
    expect(panelSrc, '细粒度兼容入口文案不得回流').not.toContain('细粒度兼容');
    expect(panelSrc, '兼容调试文案不得回流').not.toContain('兼容调试');
    expect(panelSrc, '旧目录切换按钮样式不得回流').not.toContain('mcp-tool-view-toggle');
    expect(panelSrc, '目录只展示 action 组').toContain('组 action 型工具');
    expect(panelSrc, '试跑以组 + action 调真实端点').toContain('以组 + action 调真实 MCP 端点');
    expect(panelSrc, '试跑固定走 groupCallForLegacy').toContain('const groupCall = groupCallForLegacy.value;');
  });

  it('三文件单轨源码锚：归一入口、实现层分发与文案计数', () => {
    /* browserMcp：严格归一 + 实现层分发分离，window 面只挂组级工具 */
    expect(browserMcpSrc).toContain('单轨归一：客户端只允许 17 个 action 组');
    expect(browserMcpSrc).toContain('async function dispatchBrowserTool(');
    expect(browserMcpSrc).toContain('export async function mcpCallTool(');
    expect(browserMcpSrc).toContain('tools: browserGroupTools(),');
    expect(browserMcpSrc).not.toContain('151 legacy actions');
    expect(browserMcpSrc).not.toContain('legacy arguments');
    expect(browserMcpSrc).toContain('<b>17 groups</b><span>171 actions</span>');
    /* 本地 Node 桥：同款严格归一，callTool 只做实现层分发 */
    expect(localMcpSrc).toContain('单轨归一：客户端只允许 17 个 action 组');
    expect(localMcpSrc).toContain('async function callTool(name, args = {}) {');
    expect(localMcpSrc, 'callTool 不得再自行归一（归一只在协议入口做一次）').not.toContain('= normalizeGroupCall(name, args)');
    expect(localMcpSrc).not.toContain('151 legacy actions');
    expect(localMcpSrc).not.toContain('legacy arguments');
    expect(localMcpSrc).toContain('<b>17 groups</b><span>171 actions</span>');
    /* 面板：目录计数与组数同源，复制面挂组级工具 */
    expect(panelSrc).toContain('totalActionCount');
    expect(panelSrc).toContain('browserGroupTools(true)');
    expect(panelSrc).not.toContain('15 组 · 130');
    expect(panelSrc).not.toContain('130 个工具');
  });

  it('面板 allowedTools 与服务端词表同域：勾选/匹配/包输出全走「组:action」限定名', () => {
    /* 服务端 key 元数据（availableToolsFor）返回限定名；面板若仍以实现名匹配，
       保存后编辑回显勾选全空、签发面整组消失——限定名为唯一存储/匹配单位 */
    expect(panelSrc).toContain('qualified: `${name}:${action}`');
    expect(panelSrc).toContain('form.allowedTools.includes(action.qualified)');
    expect(panelSrc).toContain('toggleArrItem(form.allowedTools, action.qualified');
    expect(panelSrc).toContain('LEGACY_TO_QUALIFIED[tool] || tool');
    expect(panelSrc).toContain('QUALIFIED_TO_LEGACY[tool] || tool');
    expect(panelSrc).not.toContain('form.allowedTools.includes(action.legacy)');
  });
});
