/**
 * 错误面板 pre 渲染内核——五处裸 `{{ err }}` 错误面板（DslQueryView/
 * BoostTunerView/ScoreExplainView/MatchMatrixView/ProfileFlameView）收口的统一出处。
 * 内容含 '{' 视为 JSON 现场走 highlightJson（转义安全 + 语法着色，与全站 json-view 范式
 * 同一内核）；否则 HTML 转义平文输出。两种形态都保证「原文全文可回看」语义不变：
 * 转义只改 &<> 三个字符的表示，textContent 与原文一致。
 *
 * 件③：JSON 现场高亮 highlightJson → highlightDslJson（DSL 语义键 j-clause
 * 分档；span 只换类名不改文本，textContent 与旧实现逐字一致，全文回看语义零变）。
 * 四处错误面（QueryXray:72/ScoreExplain:65/BoostTuner:107/SearchSandbox:129 经 errPre）
 * 自动同步更新语义分档。
 *
 * （纯增量，向后兼容）：可选第二参 meta——错误链一眼可辨。
 * - code：错误码徽标（LOCK_CONFLICT/ES_ERROR…），warn 档内联样式（theme.css 不在
 * 改动面，自包含零外依赖）；类名 ep-err-code 留作主题钩子。
 * - endpoint：后端新增的失败端点（如 "GET /internal/es/console/..."）——有则显示在
 * 顶部「失败于 …」行，无则不显（兼容旧后端）；类名 ep-err-endpoint。
 * meta 两个字段一律过 escHtml（与正文同安全级）；既有十余处单参调用零改动。
 *
 * （纯增量，向后兼容）：errMeta(err) 帮手——调用方不再手拼 meta。
 * ApiError 实例（api.ts 五百三十三/透传 code/endpoint）直接读两字段；
 * 普通 Error/字符串兼容降级：无 code/endpoint 的对象出空 meta（errPreHtml 对空 meta
 * 输出与单参一致，见既有行为锚），null/undefined 也不抛。双参改用由 Lead 收口波
 * 统一接线，只落帮手本体。
 */
import { highlightDslJson } from './jsonc';
/* 私造 escHtml 退役——三连转义（& < > → 实体）与 highlightSanitize.escapeHtml
 逐字等价（ IntegrationGuide/DiagView 同先例），合并单源防第四份漂移 */
import { escapeHtml } from './highlightSanitize';
import { ApiError } from '../api';

/** 错误链元信息（全可缺，缺哪个不显哪个） */
interface ErrPreMeta {
  /** 后端业务错误码（如 LOCK_CONFLICT / ES_ERROR / CONN_FORBIDDEN） */
  code?: string;
  /** 失败端点（后端下发，如 "GET /internal/es/console/cluster/snapshot/list"） */
  endpoint?: string;
}

/* 本地 escHtml 退役（与 highlightSanitize.escapeHtml 逐字等价，见头注 import） */

export function errPreHtml(err: string, meta?: ErrPreMeta): string {
  const t = err ?? '';
  /* 件③：highlightJson → highlightDslJson——JSON 现场升 DSL 语义分档
 （DSL 语义键 j-clause、普通键 j-key），span 只换类名不改文本，textContent 与
 highlightJson 输出逐字一致（jsonc 头注自证），全文回看语义与既有消费零扰动；
 QueryXray/ScoreExplain/BoostTuner/SearchSandbox 四处错误面经本函数自动同步更新。 */
  const body = t.includes('{') ? highlightDslJson(t) : escapeHtml(t);
  if (!meta) return body;
  const head: string[] = [];
  /* code 徽标：warn 档内联样式自包含（错误面板多嵌深色 pre，徽标要与正文拉开一档） */
  if (meta.code) head.push(`<span class="ep-err-code" style="display:inline-block;padding:0 6px;border-radius:3px;background:var(--warn-soft);color:var(--warn);font-size:11px;font-weight:600;letter-spacing:.02em;vertical-align:1px">${escapeHtml(meta.code)}</span>`);
  /* 失败端点行：暗色小字，一眼定位「哪条请求失败的」 */
  if (meta.endpoint) head.push(`<span class="ep-err-endpoint" style="color:var(--tx2)">失败于 ${escapeHtml(meta.endpoint)}</span>`);
  return head.length ? `<span class="ep-err-head">${head.join(' ')}</span>\n${body}` : body;
}

/** 错误对象 → errPre meta 的统一组装（双参改用帮手，消费方一行接线）。
 * ApiError 走 instanceof 精确分支；其它 Error 实例按鸭子类型读 code/endpoint（后端
 * 500 之类无业务码 → 空串回退，errPreHtml 对空值不显行）；字符串/未知类型出空 meta。 */
export function errMeta(err: unknown): ErrPreMeta {
  if (!err || typeof err !== 'object') return {};
  const e = err as Partial<ApiError>;
  return {
    code: typeof e.code === 'string' ? e.code : undefined,
    endpoint: typeof e.endpoint === 'string' ? e.endpoint : undefined,
  };
}
