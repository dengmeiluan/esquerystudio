/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.console.mcp;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * MCP raw REST 的语义分类器。
 *
 * <p>不能用 HTTP 方法粗判读写：ES 的大量查询走 POST（_search、_msearch、_count、
 * _mget、_sql、_field_caps、_validate/query、_search/template…）。本类按
 * “方法 + 路径”识别真实语义，未知 POST 一律按写操作 fail-closed，避免把写操作
 * 误放给只读 key。GET/HEAD 天然只读；少量 DELETE 是游标/PIT 清理，按读处理。</p>
 */
public final class McpRestClassifier {

    private static final List<Pattern> POST_READ = Arrays.asList(
            Pattern.compile("^/(?:[^/]+/)?_search(?:/.*)?$"),
            Pattern.compile("^/(?:[^/]+/)?_count$"),
            Pattern.compile("^/_msearch(?:/template)?$"),
            Pattern.compile("^/(?:[^/]+/)?_mget$"),
            Pattern.compile("^/(?:[^/]+/)?_search/template$"),
            Pattern.compile("^/_search/scroll$"),
            Pattern.compile("^/_search/scroll/[^/]+$"),
            Pattern.compile("^/_search_shards$"),
            Pattern.compile("^/_render/template$"),
            Pattern.compile("^/_msearch/template$"),
            Pattern.compile("^/(?:_sql|_xpack/sql)(?:/(?:translate|close))?$"),
            Pattern.compile("^/_sql/query$"),
            Pattern.compile("^/(?:[^/]+/)?_field_caps$"),
            Pattern.compile("^/(?:[^/]+/)?_analyze$"),
            Pattern.compile("^/(?:[^/]+/)?_validate/query$"),
            Pattern.compile("^/(?:[^/]+/)?_explain/[^/]+$"),
            Pattern.compile("^/(?:[^/]+/)?_terms_enum$"),
            Pattern.compile("^/(?:[^/]+/)?_termvectors(?:/[^/]+)?$"),
            Pattern.compile("^/(?:[^/]+/)?_mtermvectors$"),
            Pattern.compile("^/(?:[^/]+/)?_rank_eval$"),
            Pattern.compile("^/_pit$"),
            Pattern.compile("^/_pit/[^/]+$"),
            Pattern.compile("^/_scripts/painless/_execute$")
    );

    private static final List<Pattern> DELETE_READ = Arrays.asList(
            Pattern.compile("^/_search/scroll$"),
            Pattern.compile("^/_search/scroll/[^/]+$"),
            Pattern.compile("^/_pit$"),
            Pattern.compile("^/_pit/[^/]+$"),
            Pattern.compile("^/_sql/close$")
    );

    private McpRestClassifier() {
    }

    public static boolean isReadOnly(String method, String path) {
        String m = method == null ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        if ("GET".equals(m) || "HEAD".equals(m)) return true;
        String p = normalize(path);
        if ("POST".equals(m)) {
            for (Pattern pattern : POST_READ) if (pattern.matcher(p).matches()) return true;
            return false;
        }
        if ("DELETE".equals(m)) {
            for (Pattern pattern : DELETE_READ) if (pattern.matcher(p).matches()) return true;
            return false;
        }
        return false;
    }

    private static String normalize(String path) {
        String p = path == null ? "" : path.trim().toLowerCase(Locale.ROOT);
        int query = p.indexOf('?');
        if (query >= 0) p = p.substring(0, query);
        if (!p.startsWith("/")) p = "/" + p;
        while (p.contains("//")) p = p.replace("//", "/");
        if (p.length() > 1 && p.endsWith("/")) p = p.substring(0, p.length() - 1);
        return p;
    }
}
