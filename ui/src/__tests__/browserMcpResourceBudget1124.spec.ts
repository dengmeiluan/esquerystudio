/* 浏览器桥资源读取/补全的 180s 预算：resources/read 与 completion/complete 也会打 ES，
 * 到点必须撤掉本页 fetch 并返回 MCP_CALL_TIMEOUT，不能只保护 tools/call。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/browserApi', () => ({
  browserFetch: vi.fn(),
  abortAllEsRequests: vi.fn(),
}));
import { abortAllEsRequests, browserFetch } from '../platform/browserApi';
import { handleMcpRequest } from '../platform/browserMcp';

const fetchMock = browserFetch as unknown as ReturnType<typeof vi.fn>;
const abortMock = abortAllEsRequests as unknown as ReturnType<typeof vi.fn>;

describe('browserMcp 资源读取 180s 预算', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    abortMock.mockReset();
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'qa', name: 'QA', url: 'http://localhost:9200' },
    ]));
    localStorage.removeItem('esquerystudio.browser.active');
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('resources/read 慢 ES：到点撤 fetch 并回 MCP_CALL_TIMEOUT', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = handleMcpRequest({
      jsonrpc: '2.0', id: 91, method: 'resources/read',
      params: { uri: 'esquerystudio://index/qa/orders/mapping' },
    });
    await vi.advanceTimersByTimeAsync(180_001);
    const response = await pending;
    expect(abortMock).toHaveBeenCalledTimes(1);
    expect(response.error.message).toContain('MCP_CALL_TIMEOUT');
  });

  it('completion/complete 慢 ES：到点撤 fetch 并回 MCP_CALL_TIMEOUT', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = handleMcpRequest({
      jsonrpc: '2.0', id: 92, method: 'completion/complete',
      params: { ref: { type: 'ref/prompt' }, argument: { name: 'index', value: 'o' } },
    });
    await vi.advanceTimersByTimeAsync(180_001);
    const response = await pending;
    expect(abortMock).toHaveBeenCalledTimes(1);
    expect(response.error.message).toContain('MCP_CALL_TIMEOUT');
  });
});
