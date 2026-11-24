/* 三百三十四批：ESLint 从宽接入（flat config）——首期只开「真 bug」类规则，
   风格类全部关闭（已有三道门禁兜底：vitest/build/typecheck）。后续按批收紧。 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/main/resources/**', '*.timestamp-*.mjs', 'prove/**', 'scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/**/*.{vue,ts}'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
  {
    files: ['**/*.vue', '**/*.ts'],
    rules: {
      /* —— 首期关闭清单（从宽）—— */
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/no-v-html': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/require-default-prop': 'off', /* 项目统一 withDefaults() 显式默认，与该规则风格冲突 */
      'vue/no-template-shadow': 'off', /* v-for 影子变量（i/h）为惯用形态 */
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      /* —— 首期开启（真 bug 类）—— */
      'no-const-assign': 'error',
    'no-async-promise-executor': 'error',
    'no-compare-neg-zero': 'error',
    'require-atomic-updates': 'off', // 存量形态多，保持关闭
      'no-dupe-keys': 'error',
      'no-func-assign': 'error',
      'no-unreachable': 'error',
      'vue/no-duplicate-attributes': ['error', { allowCoexistClass: true, allowCoexistStyle: true }],
    },
  },
  {
    /* 三百三十四批：域外豁免——tests 故意用超精度字面量断言「不丢精度」，且 require 形态既有 */
    files: ['src/**/__tests__/**', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-loss-of-precision': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'vue/one-component-per-file': 'off', /* 测试内联多组件为既有范式 */
      'vue/no-template-shadow': 'off',
    },
  },
  {
    files: ['src/**/*.{vue,ts}'],
    rules: {
      /* —— 首期从宽清单（存量形态，另行排批清偿）—— */
      'vue/no-side-effects-in-computed-properties': 'off', /* JsonArea errMsg 回写为既有刻意行为 */
      'vue/no-deprecated-filter': 'off',
      'vue/use-v-on-exact': 'off',
      'no-loss-of-precision': 'off',
      'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipTemplates: true }],
      'no-undef': 'off', /* typecheck 门禁已覆盖（BlobPart 等 lib 类型），eslint 环境感知不足 */
      'prefer-const': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-escape': 'off', /* 存量正则/字符串转义形态，另行清偿 */
      'vue/no-unused-vars': 'off', /* 存量 v-for/未用变量，另行清偿 */
      '@typescript-eslint/no-unused-vars': 'off', /* unused 存量 43 处分批清偿，首期全关 */
    },
  },
  {
    files: ['src/utils/minijq.ts'],
    rules: { 'no-irregular-whitespace': 'off' }, /* 正则字面量内的全角空白是业务语义 */
  },
  {
    files: ['src/views/AliasesView.vue'],
    rules: { 'vue/no-unused-vars': 'off' }, /* slot-scope i 未用（既有） */
  },
);
