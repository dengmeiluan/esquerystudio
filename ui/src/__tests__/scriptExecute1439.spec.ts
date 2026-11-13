/**
 * 1439：执行脚本体（POST /_scripts/<id>/<_context>/_execute）。
 *
 * 官方体为 {script, context, context_setup}：script 支持 source/id/lang/params，
 * context 是闭集（painless_test/score/filter），context_setup 是上下文初始化参数。
 * 此前该路径落 none 档零候选。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, scriptExecuteBodyKeyItems,
} from '../utils/dslCompletionContext';

describe('1439 执行脚本体', () => {
  it('bodyKind：POST execute 两种路径形态；PUT/POST 存脚本；GET 仍无体', () => {
    expect(bodyKindForPath('/_scripts/my-script/_execute', 'POST')).toBe('script-execute-body');
    expect(bodyKindForPath('/_scripts/my-script/painless_test/_execute', 'POST')).toBe('script-execute-body');
    expect(bodyKindForPath('_scripts/my-script/_execute', 'POST')).toBe('script-execute-body');
    expect(bodyKindForPath('/_scripts/my-script', 'PUT')).toBe('stored-script-body');
    /* 官方 spec 的 put_script 同时接受 POST；context 形态同体 */
    expect(bodyKindForPath('/_scripts/my-script', 'POST')).toBe('stored-script-body');
    expect(bodyKindForPath('/_scripts/my-script/painless_test', 'POST')).toBe('stored-script-body');
    expect(bodyKindForPath('/_scripts/my-script/painless_test', 'PUT')).toBe('stored-script-body');
    /* 脚本 id 含 _execute 不被执行体规则误伤 */
    expect(bodyKindForPath('/_scripts/my_execute', 'POST')).toBe('stored-script-body');
    expect(bodyKindForPath('/_scripts/my_execute', 'PUT')).toBe('stored-script-body');
    expect(bodyKindForPath('/_scripts/my-script/_execute', 'GET')).toBe('none');
  });

  it('键表：script / context / context_setup', () => {
    expect(scriptExecuteBodyKeyItems().map(i => i.label)).toEqual(['script', 'context', 'context_setup']);
  });
});
