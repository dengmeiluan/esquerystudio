/**
 * 1439：Watcher watch 体（PUT /_watcher/watch/<id>，6.x 兼容 _xpack/watcher）。
 *
 * 体是 {trigger,input,condition,actions,metadata,throttle_period}；四段结构各自值域封闭
 * （触发器/调度/输入/条件/动作类型），此前落 search 档给 query/aggs 全属非法键。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, watchBodyKeyItems, watchTriggerKeyItems, watchScheduleKeyItems,
  watchInputKeyItems, watchConditionKeyItems, watchActionTypeKeyItems, watchBodyRootKeys,
  WATCH_TRIGGER_TYPES, WATCH_SCHEDULE_TYPES, WATCH_INPUT_TYPES, WATCH_CONDITION_TYPES,
  WATCH_ACTION_TYPES, watchRegionAt, watchActionParamsKeyItems, watchConditionParamsKeyItems,
  watchSearchInputKeyItems, watchSearchRequestKeyItems, watchHttpInputKeyItems, httpRequestKeyItems,
  watchChainTriggerKeyItems, watchChainNestedTriggerKeyItems, watchChainInputKeyItems,
  watchEmailBodyKeyItems, watchSlackMessageKeyItems, watchJiraFieldsKeyItems,
  httpAuthBasicKeyItems, httpProxyKeyItems, watchPagerdutyContextKeyItems,
  watchSlackAttachmentKeyItems, watchSlackAttachmentFieldKeyItems,
  watchArrayCompareKeyItems, watchArrayCompareOpKeyItems,
  watchEmailAttachmentKeyItems, watchEmailHttpAttachmentKeyItems, watchEmailReportingAttachmentKeyItems,
  watchEmailDataAttachmentKeyItems,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  trigger: { schedule: { interval: '5m' } },
  input: { search: { request: { indices: ['logs-*'], body: { query: { match_all: {} } } } } },
  condition: { compare: { 'ctx.payload.hits.total': { gt: 0 } } },
  actions: { notify: { logging: { text: 'watch fired' } } },
};

describe('1439 Watcher 体分档', () => {
  it('路径分派：PUT /_watcher/watch/<id>（含 _xpack）；GET/DELETE 不抢；_execute 单列试跑体', () => {
    expect(bodyKindForPath('/_watcher/watch/error-rate', 'PUT')).toBe('watch-body');
    expect(bodyKindForPath('/_watcher/watch/error-rate', 'POST')).toBe('watch-body');
    expect(bodyKindForPath('/_xpack/watcher/watch/error-rate', 'PUT')).toBe('watch-body');
    expect(bodyKindForPath('/_xpack/watcher/watch/error-rate', 'POST')).toBe('watch-body');
    expect(bodyKindForPath('/_watcher/watch/error-rate', 'GET')).toBe('search');
    expect(bodyKindForPath('/_watcher/watch/error-rate', 'DELETE')).toBe('search');
    /* 试跑体的根键是 trigger_data/action_modes 等，不是 watch 定义 */
    expect(bodyKindForPath('/_watcher/watch/error-rate/_execute', 'POST')).toBe('watch-execute-body');
    expect(bodyKindForPath('/_watcher/watch/error-rate/_execute', 'GET')).toBe('search');
    expect(bodyKindForPath('/_watcher/watch/error-rate/_execute', 'PUT')).toBe('search');
    expect(bodyKindForPath('/_watcher/watch/_execute', 'POST')).toBe('watch-inline-execute-body');
  });

  it('目录：根六键 + 触发器/调度/输入/条件/动作类型', () => {
    expect(watchBodyRootKeys).toEqual(['trigger', 'input', 'condition', 'actions', 'metadata', 'throttle_period']);
    expect(watchBodyKeyItems().find(i => i.label === 'actions')?.detail).toContain('动作');
    expect(WATCH_TRIGGER_TYPES).toEqual(['schedule', 'chain']);
    expect(WATCH_SCHEDULE_TYPES).toEqual(['interval', 'cron', 'daily', 'hourly', 'weekly', 'monthly', 'yearly']);
    expect(WATCH_INPUT_TYPES).toEqual(['search', 'simple', 'http', 'chain']);
    expect(WATCH_CONDITION_TYPES).toEqual(['always', 'never', 'compare', 'array_compare', 'script']);
    expect(WATCH_ACTION_TYPES).toEqual(['email', 'webhook', 'index', 'logging', 'slack', 'pagerduty', 'jira']);
    expect(watchTriggerKeyItems().map(i => i.label)).toEqual([...WATCH_TRIGGER_TYPES]);
    expect(watchScheduleKeyItems().map(i => i.label)).toEqual([...WATCH_SCHEDULE_TYPES]);
    expect(watchInputKeyItems().map(i => i.label)).toEqual([...WATCH_INPUT_TYPES]);
    expect(watchConditionKeyItems().map(i => i.label)).toEqual([...WATCH_CONDITION_TYPES]);
    expect(watchActionTypeKeyItems().map(i => i.label)).toEqual([...WATCH_ACTION_TYPES]);
    expect(watchActionParamsKeyItems('index').map(i => i.label)).toEqual([
      'index', 'doc_id', 'refresh', 'op_type', 'timeout', 'execution_time_field',
    ]);
    expect(watchActionParamsKeyItems('logging').map(i => i.label)).toEqual(['level', 'text', 'category']);
    expect(watchActionParamsKeyItems('webhook').map(i => i.label)).toContain('url');
    expect(watchActionParamsKeyItems('slack').map(i => i.label)).toEqual(['account', 'message']);
    expect(watchActionParamsKeyItems('jira').map(i => i.label)).toEqual(['account', 'fields']);
    expect(watchConditionParamsKeyItems('script').map(i => i.label)).toEqual(['source', 'lang', 'params', 'id']);
    expect(watchConditionParamsKeyItems('compare')).toEqual([]);
    expect(watchSearchInputKeyItems().map(i => i.label)).toEqual(['request', 'extract', 'timeout']);
    expect(watchSearchRequestKeyItems().map(i => i.label)).toEqual([
      'indices', 'body', 'template', 'search_type', 'indices_options', 'rest_total_hits_as_int',
    ]);
    expect(watchHttpInputKeyItems().map(i => i.label)).toEqual(['request', 'extract', 'response_content_type']);
    expect(httpRequestKeyItems().map(i => i.label)).toContain('url');
    expect(watchChainTriggerKeyItems().map(i => i.label)).toEqual(['inputs', 'trigger']);
    expect(watchChainNestedTriggerKeyItems().map(i => i.label)).toEqual(['schedule']);
    expect(watchChainInputKeyItems().map(i => i.label)).toEqual(['inputs']);
    expect(watchEmailBodyKeyItems().map(i => i.label)).toEqual(['text', 'html']);
    expect(watchSlackMessageKeyItems().map(i => i.label)).toEqual(['text', 'from', 'to', 'attachments']);
    expect(watchJiraFieldsKeyItems().map(i => i.label)).toContain('project');
    expect(httpAuthBasicKeyItems().map(i => i.label)).toEqual(['username', 'password']);
    expect(httpProxyKeyItems().map(i => i.label)).toEqual(['host', 'port']);
    expect(watchPagerdutyContextKeyItems().map(i => i.label)).toEqual(['type', 'href', 'src']);
    expect(watchSlackAttachmentKeyItems().map(i => i.label)).toContain('title');
    expect(watchSlackAttachmentKeyItems().map(i => i.label)).toContain('fields');
    expect(watchSlackAttachmentFieldKeyItems().map(i => i.label)).toEqual(['short', 'title', 'value']);
    expect(watchArrayCompareKeyItems().map(i => i.label)).toEqual([
      'path', 'eq', 'not_eq', 'lt', 'gt', 'lte', 'gte',
    ]);
    expect(watchArrayCompareOpKeyItems().map(i => i.label)).toEqual(['quantifier', 'value']);
    expect(watchEmailAttachmentKeyItems().map(i => i.label)).toEqual(['http', 'reporting', 'data']);
    expect(watchEmailHttpAttachmentKeyItems().map(i => i.label)).toEqual(['content_type', 'inline', 'request']);
    expect(watchEmailReportingAttachmentKeyItems().map(i => i.label)).toContain('url');
    expect(watchEmailDataAttachmentKeyItems().map(i => i.label)).toEqual(['format']);
  });

  it('区域：根 / trigger / schedule / input / condition / action / 更深', () => {
    const at = (s: string) => watchRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"trigger": {')).toBe('trigger');
    expect(at('{"trigger": {"schedule": {')).toBe('schedule');
    expect(at('{"input": {')).toBe('input');
    expect(at('{"input": {"search": {')).toBe('search-input');
    expect(at('{"input": {"search": {"request": {')).toBe('search-request');
    expect(at('{"input": {"http": {')).toBe('http-input');
    expect(at('{"input": {"http": {"request": {')).toBe('http-request');
    expect(at('{"input": {"chain": {')).toBe('chain-input-container');
    expect(at('{"input": {"chain": {"inputs": [{')).toBe('deep');
    expect(at('{"input": {"chain": {"inputs": [{"first": {')).toBe('chain-input');
    expect(at('{"input": {"search": {"request": {"body": {')).toBe('search-body');
    expect(at('{"input": {"search": {"request": {"body": {"query": {')).toBe('search-query');
    expect(at('{"condition": {')).toBe('condition');
    expect(at('{"condition": {"script": {')).toBe('condition-params');
    expect(at('{"condition": {"array_compare": {"ctx.payload.hits.hits": {')).toBe('array-compare-body');
    expect(at('{"condition": {"array_compare": {"ctx.payload.hits.hits": {"gte": {')).toBe('array-compare-op');
    expect(at('{"actions": {"notify": {')).toBe('action');
    expect(at('{"actions": {"notify": {"logging": {')).toBe('action-params');
    expect(at('{"actions": {"mail": {"email": {"body": {')).toBe('action-email-body');
    expect(at('{"actions": {"mail": {"email": {"attachments": {"report": {')).toBe('email-attachment');
    expect(at('{"actions": {"mail": {"email": {"attachments": {"report": {"http": {')).toBe('email-att-http');
    expect(at('{"actions": {"mail": {"email": {"attachments": {"report": {"reporting": {')).toBe('email-att-reporting');
    expect(at('{"actions": {"mail": {"email": {"attachments": {"report": {"data": {')).toBe('email-att-data');
    expect(at('{"actions": {"mail": {"email": {"attachments": {"report": {"http": {"request": {')).toBe('http-request');
    expect(at('{"actions": {"mail": {"email": {"attachments": {"report": {"reporting": {"request": {')).toBe('http-request');
    expect(at('{"actions": {"chat": {"slack": {"message": {')).toBe('action-slack-message');
    expect(at('{"actions": {"ticket": {"jira": {"fields": {')).toBe('action-jira-fields');
    expect(at('{"actions": {"hook": {"webhook": {"auth": {"basic": {')).toBe('http-auth-basic');
    expect(at('{"actions": {"hook": {"webhook": {"proxy": {')).toBe('http-proxy');
    expect(at('{"input": {"http": {"request": {"auth": {"basic": {')).toBe('http-auth-basic');
    expect(at('{"input": {"http": {"request": {"proxy": {')).toBe('http-proxy');
    expect(at('{"actions": {"pd": {"pagerduty": {"contexts": [{')).toBe('pagerduty-context');
    expect(at('{"actions": {"chat": {"slack": {"message": {"attachments": [{')).toBe('slack-attachment');
    expect(at('{"actions": {"chat": {"slack": {"message": {"attachments": [{"fields": [{')).toBe('slack-attachment-field');
    expect(at('{"trigger": {"chain": [')).toBe('deep');
    expect(at('{"trigger": {"chain": [{')).toBe('chain-trigger');
    expect(at('{"trigger": {"chain": [{"trigger": {')).toBe('chain-trigger-container');
    expect(at('{"trigger": {"chain": [{"trigger": {"schedule": {')).toBe('schedule');
  });

  it('lint：样例体静默；触发器/输入/条件/动作类型拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('watch-body', JSON.stringify(SAMPLE))).toEqual([]);

    const tr = lintStructuredBody('watch-body', JSON.stringify({ trigger: { scheduel: {} } }));
    expect(tr.some(f => f.message.includes('Watch 触发器') && f.message.includes('最接近：schedule'))).toBe(true);

    const inp = lintStructuredBody('watch-body', JSON.stringify({ input: { serch: {} } }));
    expect(inp.some(f => f.message.includes('Watch 输入') && f.message.includes('最接近：search'))).toBe(true);

    const cond = lintStructuredBody('watch-body', JSON.stringify({ condition: { alway: {} } }));
    expect(cond.some(f => f.message.includes('Watch 条件') && f.message.includes('最接近：always'))).toBe(true);

    const act = lintStructuredBody('watch-body', JSON.stringify({ actions: { notify: { loging: {} } } }));
    expect(act.some(f => f.message.includes('Watch 动作 notify') && f.message.includes('最接近：logging'))).toBe(true);

    const root = lintStructuredBody('watch-body', JSON.stringify({ query: {}, trigger: { schedule: { interval: '5m' } } }));
    expect(root.some(f => f.message.includes('Watch 体') && f.message.includes('query'))).toBe(true);
  });
});
