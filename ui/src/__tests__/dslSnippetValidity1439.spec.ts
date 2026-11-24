/**
 * 1439：补全骨架「接受即合法」总闸。
 *
 * Monaco 把 `${n:默认值}` 原样插入，长这样的一段骨架接受后必须仍是合法 JSON——
 * 否则用户点一下补全就得到一段非法 DSL。实测 `terms` 骨架的数组占位漏了引号
 * （`[${2:value}]` → `[value]`），是本文件要永久守住的缺陷形态。
 *
 * 覆盖面：查询骨架、聚合骨架、根键骨架、子句体键表、字段配置表、建议器体、检索器体。
 */
import { describe, it, expect } from 'vitest';
import {
  QUERY_BODY_KEYS, CLAUSE_VALUE_KEYS, SUGGEST_BODY_KEYS,
  QUERY_SNIPPETS, AGG_SNIPPETS, ROOT_KEY_SNIPPETS, ROOT_KEYS,
  retrieverBodyKeys, queryBodyKeys, clauseValueKeys, suggesterBodyKeys, aggBodyKeys,
  mappingKeyItems, mappingFieldKeyItems, templateKeyItems, indexBodyKeyItems, aliasKeyItems, reindexBodyKeyItems,
  sqlBodyKeyItems, updateBodyKeyItems, scriptObjectKeyItems, rolloverBodyKeyItems, rolloverConditionKeyItems,
  dbqBodyKeyItems, ubqBodyKeyItems, queryOnlyBodyKeyItems, templateSearchBodyKeyItems,
  mgetBodyKeyItems, mgetDocKeyItems,
  storedScriptBodyKeyItems, storedScriptKeyItems, scriptExecuteBodyKeyItems, msearchHeaderKeyItems, msearchTemplateBodyKeyItems,
  bulkActionKeyItems, bulkActionMetaKeyItems, fieldCapsBodyKeyItems, termsEnumBodyKeyItems,
  rankEvalBodyKeyItems, rankEvalRequestKeyItems, rankEvalMetricKeyItems,
  aliasesBodyKeyItems, aliasActionKeyItems, aliasAddConfigKeyItems, aliasRemoveConfigKeyItems, aliasRemoveIndexConfigKeyItems,
  scrollBodyKeyItems, clearScrollBodyKeyItems,
  termvectorsKeyItems, mtermvectorsBodyKeyItems, mtermvectorsDocKeyItems,
  eqlBodyKeyItems, clusterSettingsBodyKeyItems,
  rerouteBodyKeyItems, rerouteCommandKeyItems, rerouteCommandParamKeyItems, allocationExplainBodyKeyItems,
  snapshotRepoBodyKeyItems, snapshotCreateBodyKeyItems, snapshotRestoreBodyKeyItems,
  slmPolicyBodyKeyItems, slmConfigKeyItems, slmRetentionKeyItems,
  ilmPolicyBodyKeyItems, ilmPolicyKeyItems, ilmPhaseKeyItems, ilmPhaseConfigKeyItems, ilmActionKeyItems,
  watchBodyKeyItems, watchTriggerKeyItems, watchScheduleKeyItems, watchInputKeyItems, watchConditionKeyItems, watchActionTypeKeyItems,
  securityRoleBodyKeyItems, securityRoleIndexKeyItems, securityRoleFieldSecurityKeyItems, securityRoleAppKeyItems,
  securityUserBodyKeyItems, securityRoleTemplateKeyItems, securityRoleMappingBodyKeyItems, securityApiKeyBodyKeyItems,
  ingestPipelineBodyKeyItems, ingestProcessorKeyItems,
  enrichPolicyBodyKeyItems, enrichMatchPolicyKeyItems, enrichRangePolicyKeyItems,
  transformBodyKeyItems, transformSourceKeyItems, transformDestKeyItems, transformPivotKeyItems,
  transformTimeKeyItems, transformTimeConfigKeyItems,
  rollupJobBodyKeyItems, rollupGroupsKeyItems, rollupDateGroupKeyItems, rollupFieldGroupKeyItems, rollupMetricKeyItems,
  mlDatafeedBodyKeyItems, mlDelayedCheckKeyItems, mlChunkingKeyItems, mlIndicesOptionsKeyItems,
  mlJobBodyKeyItems, mlAnalysisConfigKeyItems, mlDetectorKeyItems, mlAnalysisLimitsKeyItems, mlDataDescriptionKeyItems,
  mlFilterBodyKeyItems, mlCalendarBodyKeyItems, mlCalendarEventsBodyKeyItems, mlCalendarEventKeyItems,
  graphExploreBodyKeyItems, graphVertexKeyItems, graphControlsKeyItems, graphSampleDiversityKeyItems, graphHopKeyItems,
  ccrFollowBodyKeyItems, ccrAutoFollowBodyKeyItems,
  securityApiKeyGrantBodyKeyItems, securityApiKeyGrantKeyItems,
  licenseBodyKeyItems, licenseEntryKeyItems,
  mlFilterUpdateBodyKeyItems, securityApiKeyQueryBodyKeyItems, securityApiKeyInvalidateBodyKeyItems,
  securityCrossClusterApiKeyBodyKeyItems, securityCrossClusterAccessKeyItems, securityCrossClusterAccessEntryKeyItems,
  watchExecuteBodyKeyItems, securityPrivilegeBodyKeyItems, ilmMoveBodyKeyItems, ilmMoveStepKeyItems,
  watchActionParamsKeyItems, watchConditionParamsKeyItems,
  watchSearchInputKeyItems, watchSearchRequestKeyItems, watchHttpInputKeyItems, httpRequestKeyItems,
  watchChainTriggerKeyItems, watchChainNestedTriggerKeyItems, watchChainInputKeyItems,
  watchEmailBodyKeyItems, watchSlackMessageKeyItems, watchJiraFieldsKeyItems, httpAuthBasicKeyItems, httpProxyKeyItems,
  watchPagerdutyContextKeyItems, watchSlackAttachmentKeyItems, watchSlackAttachmentFieldKeyItems,
  watchArrayCompareKeyItems, watchArrayCompareOpKeyItems,
  watchEmailAttachmentKeyItems, watchEmailHttpAttachmentKeyItems, watchEmailReportingAttachmentKeyItems,
  watchEmailDataAttachmentKeyItems,
  securityRoleMappingRuleKeyItems,
  snapshotCloneBodyKeyItems, watchInlineExecuteBodyKeyItems, snapshotMountBodyKeyItems,
  nodesReloadSecureSettingsBodyKeyItems,
} from '../utils/dslCompletionContext';
import { AGG_BODY_PARAMS } from '../utils/queryAstOps';

type Keyed = { text: string; key?: string };

/** Monaco snippet → 接受后的字面文本（choice 取首项、占位取默认值、转义还原） */
export function expandSnippet(s: string): string {
  return s
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, t) => String(t).split(',')[0])
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\\([$}\\])/g, '$1');
}

/** 把一组骨架包进对象解析；key 给出时还要求展开后确实写了这个键 */
export function snippetProblems(label: string, items: Keyed[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const body = expandSnippet(it.text);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse('{' + body + '}');
    } catch (e: any) {
      out.push(`${label} 接受后非法 JSON：${body}（${e.message}）`);
      continue;
    }
    if (it.key && !(it.key in obj)) out.push(`${label} 展开后缺少键 ${it.key}`);
  }
  return out;
}

function allProblems(): string[] {
  const out: string[] = [];
  /* 用函数而不是裸表：参数表并集（OPS_META/WRAP_PARAMS/MULTI_META/AGG_BODY_PARAMS）里
     自动生成的骨架同样是用户能接受进文档的，必须一起过闸。 */
  for (const op of Object.keys(QUERY_BODY_KEYS)) {
    out.push(...snippetProblems('QB:' + op, queryBodyKeys(op).map(k => ({ text: k.insert, key: k.key }))));
  }
  for (const op of Object.keys(CLAUSE_VALUE_KEYS)) {
    out.push(...snippetProblems('CV:' + op, clauseValueKeys(op).map(k => ({ text: k.insert, key: k.key }))));
  }
  for (const op of Object.keys(SUGGEST_BODY_KEYS)) {
    out.push(...snippetProblems('SB:' + op, suggesterBodyKeys(op).map(k => ({ text: k.insert, key: k.key }))));
  }
  for (const op of Object.keys(AGG_BODY_PARAMS)) {
    out.push(...snippetProblems('AB:' + op, aggBodyKeys(op).map(k => ({ text: k.insert, key: k.key }))));
  }
  for (const op of ['standard', 'knn', 'rrf', 'linear', 'text_similarity_reranker', 'rule', 'pinned', 'diversify', 'rescorer']) {
    out.push(...snippetProblems('RB:' + op, retrieverBodyKeys(op).map(k => ({ text: k.insert, key: k.key }))));
  }
  out.push(...snippetProblems('QS', Object.entries(QUERY_SNIPPETS).map(([k, t]) => ({ text: t, key: k }))));
  out.push(...snippetProblems('AS', Object.entries(AGG_SNIPPETS).map(([k, t]) => ({ text: t.text, key: k }))));
  out.push(...snippetProblems('RK', ROOT_KEYS.map(k => ({ text: ROOT_KEY_SNIPPETS[k].text, key: k }))));
  /* 1439：mapping/模板档的键骨架同样是「接受即写进文档」的整段键值 */
  out.push(...snippetProblems('MK', mappingKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MF', mappingFieldKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TK', templateKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IB', indexBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AL', aliasKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  for (const region of ['root', 'source', 'dest', 'script'] as const) {
    out.push(...snippetProblems('RX:' + region, reindexBodyKeyItems(region).map(i => ({ text: i.insertText, key: i.label }))));
  }
  out.push(...snippetProblems('SQ', sqlBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('UB', updateBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('US', scriptObjectKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RB2', rolloverBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RC', rolloverConditionKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('DQ', dbqBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('UQ', ubqBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('QO', queryOnlyBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TS', templateSearchBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MG', mgetBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MD', mgetDocKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SS', storedScriptBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SI', storedScriptKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SE', scriptExecuteBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MH', msearchHeaderKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MT2', msearchTemplateBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('BK', bulkActionKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('BM', bulkActionMetaKeyItems('update').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('BM2', bulkActionMetaKeyItems('index').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('FC', fieldCapsBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TE', termsEnumBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RE', rankEvalBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RR', rankEvalRequestKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RM', rankEvalMetricKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AB', aliasesBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AA', aliasActionKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AC', aliasAddConfigKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AR', aliasRemoveConfigKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AI', aliasRemoveIndexConfigKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SC', scrollBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('CC', clearScrollBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TV', termvectorsKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MT', mtermvectorsBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MD2', mtermvectorsDocKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('EQ', eqlBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('CS', clusterSettingsBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RR', rerouteBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RC', rerouteCommandKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  for (const cmd of ['move', 'cancel', 'allocate_replica', 'allocate_stale_primary', 'allocate_empty_primary']) {
    out.push(...snippetProblems('RP:' + cmd, rerouteCommandParamKeyItems(cmd).map(i => ({ text: i.insertText, key: i.label }))));
  }
  out.push(...snippetProblems('AE', allocationExplainBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SR', snapshotRepoBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SD', snapshotCreateBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('ST', snapshotRestoreBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('LP', slmPolicyBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('LC', slmConfigKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('LR', slmRetentionKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IP', ilmPolicyBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IL', ilmPolicyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IF', ilmPhaseKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IC', ilmPhaseConfigKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IA', ilmActionKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WB', watchBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WT', watchTriggerKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WS', watchScheduleKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WI', watchInputKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WC', watchConditionKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WA', watchActionTypeKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SRO', securityRoleBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SRI', securityRoleIndexKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SRF', securityRoleFieldSecurityKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SRA', securityRoleAppKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SU', securityUserBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SRT', securityRoleTemplateKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SRM', securityRoleMappingBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SAK', securityApiKeyBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IPL', ingestPipelineBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('IPR', ingestProcessorKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('EP', enrichPolicyBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('EM', enrichMatchPolicyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('ER', enrichRangePolicyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TF', transformBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TS', transformSourceKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TD', transformDestKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TP', transformPivotKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TSY', transformTimeKeyItems('sync').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TSYT', transformTimeConfigKeyItems('sync').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TRT', transformTimeKeyItems('retention').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('TRTT', transformTimeConfigKeyItems('retention').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RJ', rollupJobBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RG', rollupGroupsKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RD', rollupDateGroupKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RT', rollupFieldGroupKeyItems('terms').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RH', rollupFieldGroupKeyItems('histogram').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RM', rollupMetricKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MDF', mlDatafeedBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MDD', mlDelayedCheckKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MDC', mlChunkingKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MDI', mlIndicesOptionsKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MJ', mlJobBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MAC', mlAnalysisConfigKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MDT', mlDetectorKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MAL', mlAnalysisLimitsKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MDS', mlDataDescriptionKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MF', mlFilterBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MC', mlCalendarBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MCE', mlCalendarEventsBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MCEV', mlCalendarEventKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('GX', graphExploreBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('GV', graphVertexKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('GC', graphControlsKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('GSD', graphSampleDiversityKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('GH', graphHopKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('CF', ccrFollowBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('CAF', ccrAutoFollowBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AKG', securityApiKeyGrantBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AKGK', securityApiKeyGrantKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('LIC', licenseBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('LICE', licenseEntryKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('MFU', mlFilterUpdateBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AKQ', securityApiKeyQueryBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('AKI', securityApiKeyInvalidateBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('CCK', securityCrossClusterApiKeyBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('CCA', securityCrossClusterAccessKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('CCE', securityCrossClusterAccessEntryKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WEX', watchExecuteBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SPV', securityPrivilegeBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('ILM', ilmMoveBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('ILMS', ilmMoveStepKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SCL', snapshotCloneBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WIE', watchInlineExecuteBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  for (const t of ['email', 'webhook', 'index', 'logging', 'slack', 'pagerduty', 'jira']) {
    out.push(...snippetProblems('WAP:' + t,
      watchActionParamsKeyItems(t).map(i => ({ text: i.insertText, key: i.label }))));
  }
  out.push(...snippetProblems('WCP:script',
    watchConditionParamsKeyItems('script').map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WSI', watchSearchInputKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WSR', watchSearchRequestKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WHI', watchHttpInputKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('HRI', httpRequestKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WCT', watchChainTriggerKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WCN', watchChainNestedTriggerKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WCI', watchChainInputKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WEB', watchEmailBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WSM', watchSlackMessageKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WJF', watchJiraFieldsKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('HAB', httpAuthBasicKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('HPX', httpProxyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WPC', watchPagerdutyContextKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WSA', watchSlackAttachmentKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WSF', watchSlackAttachmentFieldKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WAC', watchArrayCompareKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WAO', watchArrayCompareOpKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WEA', watchEmailAttachmentKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WEH', watchEmailHttpAttachmentKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WER', watchEmailReportingAttachmentKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('WED', watchEmailDataAttachmentKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('RMR', securityRoleMappingRuleKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('SMT', snapshotMountBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  out.push(...snippetProblems('NRS', nodesReloadSecureSettingsBodyKeyItems().map(i => ({ text: i.insertText, key: i.label }))));
  return out;
}

describe('1439 补全骨架接受即合法', () => {
  it('全部骨架展开后都是合法 JSON，且键名一致', () => {
    expect(allProblems()).toEqual([]);
  });

  it('terms 骨架的数组占位带引号（修复点回归）', () => {
    const accepted = expandSnippet(QUERY_SNIPPETS.terms);
    expect(accepted).toContain('["');
    expect(() => JSON.parse('{' + accepted + '}')).not.toThrow();
  });

  it('负控：旧 terms 骨架（裸占位）必须被总闸点名', () => {
    const broken = snippetProblems('QS', [{ text: '"terms": {\n  "field": [value]\n}', key: 'terms' }]);
    expect(broken).not.toEqual([]);
    expect(broken[0]).toContain('非法 JSON');
  });

  it('负控：键名写错（骨架写了别的键）必须被点名', () => {
    const broken = snippetProblems('QB:x', [{ text: '"must": []', key: 'filter' }]);
    expect(broken).toEqual(['QB:x 展开后缺少键 filter']);
  });
});
