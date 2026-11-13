/* 242 批：vitest 全局 fetch 兜底（见 vitest.config.ts 注释）。
   只拦「相对路径」请求——组件内未经 spec mock 的 api 调用（如 store 首屏轮询）
   在并发慢时钟下会穿透到真实网络，以 unhandledrejection 击穿无关用例。
   返回空对象 200 与后端「未知端点」形态一致，不掩盖被测断言（断言仍走 spec 自己的 mock）。 */
const happyOrigin = typeof location !== 'undefined' ? location.origin : '';
const realFetch = globalThis.fetch?.bind(globalThis);
if (realFetch) {
  globalThis.fetch = ((input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isRelative = url.startsWith('/') || url.startsWith('./');
    if (isRelative || (happyOrigin && url.startsWith(happyOrigin))) {
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
