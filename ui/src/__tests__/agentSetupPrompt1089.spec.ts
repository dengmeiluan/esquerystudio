/* AI 一键搭建 / 接入提示词（deploy_and_connect）的契约看守：
 *   ① 默认输出（server / generic / localhost:5601 / auto）与仓库根 AGENT_SETUP.md 的
 *      契约正文逐字一致——GitHub 与运行中页面（prompts/get）不出现两份文案；
 *   ② 参数真实生效：host 带宿主 context-path、browser 明说没有外部 HTTP 端点、
 *      local-exe 指向单文件 exe、未知形态如实标注；
 *   ③ 四端（浏览器 / 服务端 / 本地 Node / docs）都登记该提示词，且正文共用同一组
 *      硬约束（180s 预算、异步续传、key 不进日志、跨云先预览）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleMcpRequest, MCP_PROMPTS } from '../platform/browserMcp';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const repoRead = (p: string) => readFileSync(join(__dirname, '../../../', p), 'utf8');
const ts = read('../platform/browserMcp.ts');
const local = repoRead('mcp/esquerystudio-local-mcp.mjs');
const java = repoRead('modules/mcp-server/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpServerCore.java');
const docs = repoRead('docs/mcp.md');
const agentSetup = repoRead('AGENT_SETUP.md');
const readme = repoRead('README.md');
const panel = read('../components/McpPanel.vue');

async function promptText(args: Record<string, string> = {}): Promise<string> {
  const response = await handleMcpRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'prompts/get',
    params: { name: 'deploy_and_connect', arguments: args },
  }) as any;
  return response.result.messages[0].content.text;
}

function contractBody(): string {
  const start = agentSetup.indexOf('<!-- AGENT_SETUP:START -->');
  const end = agentSetup.indexOf('<!-- AGENT_SETUP:END -->');
  expect(start, 'AGENT_SETUP.md 缺少契约开始标记').toBeGreaterThanOrEqual(0);
  expect(end, 'AGENT_SETUP.md 缺少契约结束标记').toBeGreaterThan(start);
  return agentSetup.slice(start + '<!-- AGENT_SETUP:START -->'.length, end)
    .replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

describe('deploy_and_connect：AI 一键搭建 / 接入提示词', () => {
  it('默认正文与 AGENT_SETUP.md 契约正文逐字一致（GitHub 与运行页面同文案）', async () => {
    expect(contractBody()).toBe(await promptText());
  });

  it('默认正文包含部署、签发、配置、验证与安全边界五个环节', async () => {
    const text = await promptText();
    for (const anchor of [
      '【产品事实】', '【本次选择】', '【执行步骤】', '【安全与边界】',
      'releases/latest', 'SHA256SUMS',
      'MCP 接入 → 密钥', 'esquerystudio-mcp-cli.mjs install --client generic',
      'server/discover', 'tools/list', 'resources/list', 'prompts/list',
      '180 秒', 'tasks/cancel', 'notifications/cancelled',
      'smart_sync', 'planDigest',
    ]) {
      expect(text, `默认正文缺少 ${anchor}`).toContain(anchor);
    }
  });

  it('参数真实生效：host / browser / local-exe / 未知形态各自给出正确端点与边界', async () => {
    const host = await promptText({ mode: 'host', client: 'workbuddy', endpoint: 'http://quotehub.internal:7788', os: 'linux' });
    expect(host).toContain('嵌入现有 Spring Boot 宿主');
    expect(host).toContain('http://quotehub.internal:7788/quotehub/esmcp');
    expect(host).toContain('客户端：workbuddy');
    expect(host).toContain('操作系统：linux');

    const browser = await promptText({ mode: 'browser' });
    expect(browser).toContain('Chrome MV3 扩展');
    expect(browser).toContain('本形态没有可被外部进程连接的 HTTP 端点');
    expect(browser).toContain('window.ESQueryStudioMCP');

    const exe = await promptText({ mode: 'local-exe' });
    expect(exe).toContain('esquerystudio-mcp.exe');
    expect(exe).toContain('本形态走 stdio');

    const unknown = await promptText({ mode: 'k8s-operator' });
    expect(unknown).toContain('k8s-operator（未知形态，按仓库文档核对）');
    expect(unknown).toContain('本形态走 stdio');
  });

  it('四端登记与关键约束逐字同源', () => {
    expect(MCP_PROMPTS.map((p) => p.name)).toContain('deploy_and_connect');
    for (const [label, source, quote] of [
      ['browserMcp.ts', ts, "'你是 ESQueryStudio 的部署与接入助手。目标：在 '"],
      ['Java McpController', java, '"你是 ESQueryStudio 的部署与接入助手。目标：在 "'],
      ['local Node', local, "'你是 ESQueryStudio 的部署与接入助手。目标：在 '"],
    ] as const) {
      expect(source, `${label} 缺少 deploy_and_connect 正文`).toContain(quote);
      expect(source, `${label} 缺少 180 秒预算`).toContain('180 秒');
      expect(source, `${label} 缺少跨云预览约束`).toContain('planDigest');
    }
    expect(docs).toContain('deploy_and_connect');
    expect(docs).toContain('AGENT_SETUP.md');
    expect(readme).toContain('AGENT_SETUP.md');
  });

  it('控制台接入总览有可折叠、可持久化、可复制的 AI 接入卡，且不引入裸控件', () => {
    for (const anchor of [
      'AI 一键搭建 / 接入', 'buildDeployAndConnectPrompt',
      'AI_SETUP_PREFS_KEY', 'copyAiSetupPrompt', 'downloadAiSetupPrompt',
      'mcp-ai-controls', 'mcp-ai-preview', 'aiSetupModeOptions', 'aiSetupClientOptions',
      'aiSetupNeedsEndpoint', 'aiSetupDefaultMode', 'mcpMountPath',
    ]) {
      expect(panel, `McpPanel 缺少 ${anchor}`).toContain(anchor);
    }
    /* 预览只读文本用 <pre>，控件走统一件（n-select / TextInput），不出现裸 input/textarea */
    expect(panel).toContain('<pre v-if="aiSetupOpen && aiSetupText" class="mcp-ai-preview"');
    expect(panel).not.toMatch(/<textarea[\s>]/);
    expect(panel).toContain('aria-label="AI 接入部署形态"');
    expect(panel).toContain('aria-label="AI 接入目标客户端"');
    expect(panel).toContain('aria-label="AI 接入端点"');
    expect(panel).toContain('aria-label="AI 接入操作系统"');
  });
});
