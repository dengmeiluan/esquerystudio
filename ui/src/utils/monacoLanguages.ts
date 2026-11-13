/* ux2 语言能力层：sql 官方 contribution + lucene/painless/ndjson/synonyms 四个自研 monarch。
 ensureLanguages() 幂等（模块级 flag）——MonacoEditor onMounted 每实例调用，重复零开销。
 token 全用标准名/复用 json 系 token 名（string.key.json 等）→ 既有 es-dark/es-light 主题规则自动生效。
 monarch 规则一律消费式正则（无 lookahead）：键名规则连冒号一起吃下着 key 色。
 ndjson 独立语言不挂 JSON LS——多根对象不会被 json diagnostics 整片误报（高亮有、校验无）。 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'; // 官方 SQL 高亮（模块加载即自注册）

let done = false;

/* lucene/painless/ndjson 共用括号配置：bracketPairColorization 与 autoClosingBrackets
 （'languageDefined'）都读语言配置——不给则自研语言无自动闭合/无括号对着色。 */
const BRACKET_CONF: monaco.languages.LanguageConfiguration = {
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
};

export function ensureLanguages() {
  if (done) return;
  done = true;

  /* lucene query_string：字段名（word+: 含冒号整体）、布尔/范围操作符、短语串、
 区间括号、通配 *?、模糊 ~n、boost ^n、_exists_、ISO 日期 */
  monaco.languages.register({ id: 'lucene' });
  monaco.languages.setMonarchTokensProvider('lucene', {
    tokenizer: {
      root: [
        [/"([^"\\]|\\.)*"/, 'string'],                                  // 短语串（含转义）
        [/(_exists_)?[a-zA-Z_][\w.]*:/, 'type'],                        // 字段名:（冒号整体着色）
        [/&&|\|\||\b(AND|OR|NOT|TO)\b/, 'keyword'],                     // 布尔/范围操作符
        [/\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?/, 'number'], // ISO 日期（先于纯数字）
        [/[\^~]\d*(\.\d+)?/, 'number'],                                 // boost ^2 / 模糊 ~1、~0.8
        [/\b\d+(\.\d+)?\b/, 'number'],
        [/[-+!*?]/, 'operator'],                                        // 必需/禁止/通配
        [/[[\]{}()]/, '@brackets'],                                     // 区间/分组括号
      ],
    },
  });
  monaco.languages.setLanguageConfiguration('lucene', BRACKET_CONF);

  /* painless（java/groovy 近似子集）：控制流/类型关键字 + ctx/doc/params 等内置标识符 + 注释状态机 */
  monaco.languages.register({ id: 'painless' });
  monaco.languages.setMonarchTokensProvider('painless', {
    keywords: ['if', 'else', 'for', 'while', 'do', 'return', 'def', 'new', 'try', 'catch', 'throw',
      'finally', 'break', 'continue', 'instanceof', 'in', 'switch', 'case', 'default',
      'void', 'boolean', 'byte', 'short', 'int', 'long', 'float', 'double', 'char',
      'null', 'true', 'false'],
    builtins: ['ctx', 'doc', 'params', '_source', '_score', '_index', '_id',
      'System', 'Math', 'String', 'List', 'Map', 'Set', 'HashMap', 'ArrayList', 'StringBuilder',
      'Collections', 'Date', 'ZonedDateTime', 'Debug', 'Random'],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/\b\d+(\.\d+)?[lLdDfF]?\b/, 'number'],
        [/[a-zA-Z_$][\w$]*/, { cases: { '@keywords': 'keyword', '@builtins': 'type', '@default': 'identifier' } }],
        [/[{}()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
        [/[+\-*/%=!<>&|^~?:]+/, 'operator'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration('painless', BRACKET_CONF);

 /* ndjson：json 系 token 名复用（吃既有主题规则），独立语言不挂 JSON LS */
  monaco.languages.register({ id: 'ndjson' });
  monaco.languages.setMonarchTokensProvider('ndjson', {
    tokenizer: {
      root: [
        [/"([^"\\]|\\.)*"\s*:/, 'string.key.json'],   // 键（消费冒号整体着色）
        [/"([^"\\]|\\.)*"/, 'string.value.json'],
        [/\b(true|false|null)\b/, 'keyword.json'],
        [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
        [/[{}[\]]/, '@brackets'],
        [/,/, 'delimiter'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration('ndjson', BRACKET_CONF);

  /* synonyms 同义词集：# 整行注释 + => 显式映射箭头 + 逗号分隔 */
  monaco.languages.register({ id: 'synonyms' });
  monaco.languages.setMonarchTokensProvider('synonyms', {
    tokenizer: {
      root: [
        [/^\s*#.*$/, 'comment'],
        [/=>/, 'keyword'],
        [/,/, 'delimiter'],
        [/\s+/, 'white'],
        [/[^,=>\s#]+/, 'string'],                     // 词元
      ],
    },
  });
}
