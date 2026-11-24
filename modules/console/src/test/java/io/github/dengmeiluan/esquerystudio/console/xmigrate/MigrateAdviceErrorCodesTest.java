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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import io.github.dengmeiluan.esquerystudio.console.web.InternalEsMigrateExceptionAdvice;
import org.junit.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.Assert.assertEquals;

/**
 * 迁移端点错误码三态契约（对齐浏览器端口径）：plan drift → 409 PLAN_DRIFT；
 * diff 目标不存在 → 404 DEST_NOT_FOUND；sync 目标已存在 → 409 DEST_EXISTS。
 * 判定按消息前缀精确匹配（服务层消息为固定模板），其余目标索引类报错沿用 DEST_INDEX。
 * 2026-11-21 统一契约批。
 */
public class MigrateAdviceErrorCodesTest {

    /** plan drift：expectPlanDigest 与当前计划不一致（sync_structure 执行拒绝，未 PUT）。 */
    @Test
    public void planDrift给409与PLAN_DRIFT() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsMigrateExceptionAdvice().illegalState(
                new IllegalStateException("计划摘要不匹配，拒绝执行：期望 abc123，实际 def456"
                        + "（source structure drifted, re-run dryRun）"), null);
        assertEquals(HttpStatus.CONFLICT.value(), resp.getStatusCodeValue());
        assertEquals("PLAN_DRIFT", resp.getBody().get("code"));
        assertEquals("message 原文保留（含两个摘要值）",
                "计划摘要不匹配，拒绝执行：期望 abc123，实际 def456（source structure drifted, re-run dryRun）",
                resp.getBody().get("message"));
    }

    /** diff 目标索引不存在/不可读：404 DEST_NOT_FOUND（不冒充 409 规则拒绝）。 */
    @Test
    public void diff目标不存在给404与DEST_NOT_FOUND() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsMigrateExceptionAdvice().illegalState(
                new IllegalStateException("目标索引不存在或不可读 [orders_v2]: index_not_found_exception"), null);
        assertEquals(HttpStatus.NOT_FOUND.value(), resp.getStatusCodeValue());
        assertEquals("DEST_NOT_FOUND", resp.getBody().get("code"));
    }

    /** sync 目标索引已存在：409 DEST_EXISTS（原 DEST_INDEX 统一为分态码）。 */
    @Test
    public void sync目标已存在给409与DEST_EXISTS() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsMigrateExceptionAdvice().illegalState(
                new IllegalStateException("目标索引已存在：orders_v2（本能力不覆盖既有索引，如需重建请先删除或换名）"),
                null);
        assertEquals(HttpStatus.CONFLICT.value(), resp.getStatusCodeValue());
        assertEquals("DEST_EXISTS", resp.getBody().get("code"));
    }

    /** 其余目标索引类报错（如 destCreateMode=NONE 目标缺失）沿用 DEST_INDEX，不受分态影响。 */
    @Test
    public void 其余目标索引报错沿用DEST_INDEX() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsMigrateExceptionAdvice().illegalState(
                new IllegalStateException("destCreateMode=NONE 要求目标索引已存在，但新集群无索引: orders_v2"
                        + "（请先由应用建好，或改用 COPY_FROM_SOURCE / FROM_ENTITY）"), null);
        assertEquals(HttpStatus.CONFLICT.value(), resp.getStatusCodeValue());
        assertEquals("DEST_INDEX", resp.getBody().get("code"));
    }
}
