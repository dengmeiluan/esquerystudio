/**
 * 五百三十四批：errMeta 帮手契约——错误对象 → errPre 双参 meta 的统一组装。
 *  ① ApiError import 形态：class extends Error，构造器四参 (status,message,code,endpoint)，
 *     五百三十三/五十四批透传字段在实例上可读；
 *  ② errMeta 组装：ApiError 实例出 {code,endpoint}；普通 Error/字符串/null 兼容降级不抛；
 *  ③ 负向锚：既有 errPreHtml 单参调用形态不破——errMeta 产出空 meta 时输出与单参逐字一致。
 */
import { describe, it, expect } from 'vitest';
import { ApiError } from '../api';
import { errMeta, errPreHtml } from '../utils/errPre';
import { highlightJson } from '../utils/jsonc';

describe('errEndpoint534：ApiError import 形态', () => {
  it('ApiError extends Error；code/endpoint 经构造器落实例（Lead 先行契约，只消费）', () => {
    const err = new ApiError(409, '目标物理索引已存在', 'STAGE_GUARD', 'POST /internal/es/index/adhoc-rebuild/start');
    expect(err instanceof Error).toBe(true);
    expect(err.status).toBe(409);
    expect(err.message).toBe('目标物理索引已存在');
    expect(err.code).toBe('STAGE_GUARD');
    expect(err.endpoint).toBe('POST /internal/es/index/adhoc-rebuild/start');
  });

  it('code/endpoint 均可选：两参构造缺省 undefined（旧后端兼容形态）', () => {
    const err = new ApiError(500, '内部错误');
    expect(err.code).toBeUndefined();
    expect(err.endpoint).toBeUndefined();
  });
});

describe('errEndpoint534：errMeta 组装', () => {
  it('ApiError 实例 → {code, endpoint} 全量组装', () => {
    expect(errMeta(new ApiError(409, '锁冲突', 'LOCK_CONFLICT', 'POST /internal/es/index/adhoc-rebuild/start')))
      .toEqual({ code: 'LOCK_CONFLICT', endpoint: 'POST /internal/es/index/adhoc-rebuild/start' });
  });

  it('ApiError 缺 endpoint（旧后端）→ code 有值、endpoint 不产出', () => {
    expect(errMeta(new ApiError(409, '锁冲突', 'LOCK_CONFLICT'))).toEqual({ code: 'LOCK_CONFLICT' });
  });

  it('普通 Error → 空字段降级不抛（无业务码的 500 等）', () => {
    const m = errMeta(new Error('boom'));
    expect(m.code).toBeUndefined();
    expect(m.endpoint).toBeUndefined();
  });

  it('字符串/null/undefined → 空 meta，宁缺勿炸', () => {
    expect(errMeta('连接失败')).toEqual({});
    expect(errMeta(null)).toEqual({});
    expect(errMeta(undefined)).toEqual({});
  });
});

describe('errEndpoint534：errPreHtml 双参联动（负向锚：单参形态不破）', () => {
  it('errMeta 产出的 meta 过 errPreHtml 出徽标与「失败于」行', () => {
    const err = new ApiError(409, '需要 confirmDirectSwap', 'STAGE_GUARD', 'POST /internal/es/index/adhoc-rebuild/confirm-switch');
    const html = errPreHtml(err.message, errMeta(err));
    expect(html).toContain('ep-err-code');
    expect(html).toContain('STAGE_GUARD');
    expect(html).toContain('ep-err-endpoint');
    expect(html).toContain('失败于 POST /internal/es/index/adhoc-rebuild/confirm-switch');
  });

  it('既有单参调用形态输出不变（不传 meta = 传空 meta，与 524 批锚同源复锁）', () => {
    const json = '{"error":true}';
    expect(errPreHtml(json)).toBe(errPreHtml(json, errMeta(json)));
    expect(errPreHtml(json)).toBe(highlightJson(json));
  });

  it('errMeta(普通 Error) 空 meta 过 errPreHtml 输出与单参逐字一致', () => {
    const msg = 'NetworkError when attempting to fetch resource.';
    expect(errPreHtml(msg, errMeta(new Error(msg)))).toBe(errPreHtml(msg));
  });
});
