/**
 * 1232：SQL 通道「能力边界」错误的提示。
 *
 * ES SQL 引擎对表达不了的东西统一抛 `verification_exception`（nested/数组字段/未知函数/
 * 窗口函数边界…）。此前该 type 没进 `friendlyEsError` 的 KNOWN 表，
 * 真浏览器实测错误面板只显示原始 JSON：
 * `{"error":{"type":"verification_exception","reason":"Nested fields not supported by SQL"},"status":400}`
 * —— 用户既不知道"为什么"，也不知道"该换哪个通道"。
 *
 * 现在 KNOWN 表补了该 type，并给出**行动**（换 DSL / Lucene 通道），reason 仍保留在后面。
 * 浏览器复验：标题行 = `SQL 执行失败 · SQL 通道表达不了这个查询——换 DSL / Lucene 通道可完整表达（原因见下）：Nested fields not supported by SQL`。
 *
 * 位置约定：该条必须排在 `parsing_exception` 等**包装型**异常之前——真实错误串里包装 type
 * 与叶子原因常同串共存，indexOf 先命中先赢（文件头注既有约定）。
 */
import { describe, it, expect } from 'vitest';
import { friendlyEsError } from '../utils/esError';

describe('1232 SQL 能力边界错误的提示', () => {
  it('verification_exception（JSON 形态）给出行动指引并保留原因', () => {
    const raw = '{"error":{"type":"verification_exception","reason":"Nested fields not supported by SQL"},"status":400}';
    const out = friendlyEsError(raw);
    expect(out).toContain('SQL 通道表达不了这个查询');
    expect(out).toContain('换 DSL / Lucene 通道');
    /* 原因不能被吞掉——用户仍需知道具体是哪条不支持 */
    expect(out).toContain('Nested fields not supported by SQL');
  });

  it('纯串形态同样命中（不是只认 JSON）', () => {
    expect(friendlyEsError('verification_exception: Nested fields not supported by SQL'))
      .toContain('SQL 通道表达不了这个查询');
  });

  it('未知函数/数组等同类原因都走这条（不要求逐个枚举）', () => {
    for (const reason of ['Unknown function [DATE_TRUNCC]', 'Arrays are not supported for field [tags]']) {
      const out = friendlyEsError(`verification_exception: ${reason}`);
      expect(out, reason).toContain('SQL 通道表达不了这个查询');
    }
  });

  it('不影响既有翻译（illegal_argument / index_not_found 等仍按原样）', () => {
    expect(friendlyEsError('{"error":{"type":"illegal_argument_exception","reason":"Result window is too large"},"status":400}'))
      .toContain('参数不合法');
    expect(friendlyEsError('index_not_found_exception')).toContain('索引不存在');
  });
});
