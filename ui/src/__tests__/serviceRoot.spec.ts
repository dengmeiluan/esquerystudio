import { describe, expect, it } from 'vitest';
import { serviceRootFromLocation } from '../utils/serviceRoot';

describe('serviceRootFromLocation：MCP 服务根', () => {
  it('standalone（/esquerystudio/index.html）回到 origin', () => {
    expect(serviceRootFromLocation('http://127.0.0.1:5611', '/esquerystudio/index.html'))
      .toBe('http://127.0.0.1:5611');
    expect(serviceRootFromLocation('http://127.0.0.1:5611', '/esquerystudio.html'))
      .toBe('http://127.0.0.1:5611');
  });

  it('host（/quotehub/esquerystudio*.html）保留 context-path', () => {
    expect(serviceRootFromLocation('http://host:7788', '/quotehub/esquerystudio.html'))
      .toBe('http://host:7788/quotehub');
    expect(serviceRootFromLocation('http://host:7788', '/quotehub/esquerystudio/index.html'))
      .toBe('http://host:7788/quotehub');
  });

  it('根路径与普通 index 不产生尾斜杠', () => {
    expect(serviceRootFromLocation('http://host', '/')).toBe('http://host');
    expect(serviceRootFromLocation('http://host', '/index.html')).toBe('http://host');
  });
});
