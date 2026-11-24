#!/usr/bin/env node
/**
 * stdio → ESQueryStudio MCP bridge (server mode).
 *
 * Claude Desktop / Cursor / other MCP clients that only launch a stdio command
 * can use this bridge to reach the HTTP JSON-RPC endpoint exposed by the
 * Spring Boot console.
 *
 *   ESQ_MCP_URL=http://localhost:5601/mcp \
 *   ESQ_MCP_TOKEN=change-me \
 *   node mcp/esquerystudio-mcp-stdio.mjs
 *
 * Browser mode has no TCP listener; its MCP bridge is the in-page
 * `window.ESQueryStudioMCP` API described in docs/mcp.md.
 */
import readline from 'node:readline';

const url = process.env.ESQ_MCP_URL || 'http://localhost:5601/mcp';
const token = process.env.ESQ_MCP_TOKEN || '';

if (!token) {
  process.stderr.write('[esquerystudio-mcp] ESQ_MCP_TOKEN is required\n');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const write = (value) => process.stdout.write(JSON.stringify(value) + '\n');

rl.on('line', async (line) => {
  const text = String(line || '').trim();
  if (!text) return;
  let request;
  try { request = JSON.parse(text); }
  catch (e) {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(request),
    });
    if (response.status === 202) return; // notification
    const body = await response.text();
    if (!response.ok) {
      write({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32603, message: body || ('HTTP ' + response.status) } });
      return;
    }
    process.stdout.write(body.trim() + '\n');
  } catch (e) {
    write({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32603, message: String(e?.message || e) } });
  }
});
