import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/* 并发全量专用配置（scripts/test-parallel.mjs 按分片调用）。

   与 vitest.config.ts 的唯一差异是「并发下放宽单测超时」：
   AdhocRebuildView 等挂载用例引入 naive-ui 后，8 分片并行时最重的用例
   实测 6~14s（串行恒 <5s），5s 默认超时会把并发慢时钟误报成失败。
   保留 fileParallelism:false —— 每个分片进程内仍串行，规避同进程多 worker
   的内存/CPU 放大；并发度由进程级分片提供。
   cache:false 避免多个分片进程同时读写同一份 results.json。 */
const timeout = Number(process.env.VITEST_TEST_TIMEOUT || 20000);

export default mergeConfig(base, defineConfig({
  test: {
    testTimeout: timeout,
    hookTimeout: timeout,
    maxWorkers: 1,
    minWorkers: 1,
    cache: false,
    /* 并发全量会产生大量 [Vue warn] 注入噪声；只显示失败用例的 console，
       既保留排障信息，又减少 8 个分片同时写日志/走 IPC 的开销。串行配置不静默。 */
    silent: 'passed-only',
  },
}));
