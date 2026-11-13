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

package io.github.dengmeiluan.esquerystudio.console.client;

import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 *  业务侧唯一的运维端点：暴露「期望的索引配置」供人一键复制到 宿主。
 *
 * <p>两条路径刻意分开，不做 Accept 内容协商 —— curl 默认 {@code Accept: *}{@code /*}，
 * 内容协商会让命令行与 e2e 拿到不确定结果。</p>
 *
 * <p>本控制器<b>零 ES 读取</b>：数据全部来自 {@link IndexMetaRegistry} 从实体注解解析出的元数据。
 * 这是 client 模式敢不装 {@code EsIndexAdmin} 的前提。</p>
 *
 * <p><b>无鉴权，依赖内网隔离。</b>{@code ConsoleAuthInterceptor} 在 console 模式下保护
 * {@code /internal/es/index/**}，client 模式下它不装 —— 同一路径前缀在两个模式下保护级别不同。
 * 这个约束同时印在页面显著位置，让部署的人看得见，而不是只活在设计文档里。</p>
 */
@RestController
@RequestMapping("internal/es/index")
public class DesiredStateController {

    private static final String PAGE = "esquerystudio/desired-state.html";

    private final IndexMetaRegistry registry;
    private final EntityMappingDeriver mappingDeriver;

    public DesiredStateController(IndexMetaRegistry registry, EntityMappingDeriver mappingDeriver) {
        this.registry = registry;
        this.mappingDeriver = mappingDeriver;
    }

    /**
     * 期望配置 JSON（可直接粘贴到 宿主的 adhoc 重建向导）。
     *
     * <p>返回<b>预序列化字符串</b>而非 {@code List<Map>}：交给宿主的 {@code ObjectMapper} 会让
     * 键序与 null 透出这两个契约保证被宿主的 Jackson 配置推翻，详见 {@link DesiredStateJson}。</p>
     */
    /** 2026-09-02:启动期 Mapping 对账报告(仅 client 模式 runner 执行后有内容)。 */
    @GetMapping("/mapping-reconcile/report")
    public java.util.Map<String, Object> mappingReconcileReport() {
        java.util.Map<String, Object> body = new java.util.LinkedHashMap<String, Object>();
        body.put("reports", io.github.dengmeiluan.esquerystudio.console.config.MappingReconcileBootstrapRunner.latestReportsSnapshot());
        return body;
    }

    @GetMapping("/desired-state")
    public ResponseEntity<String> desiredState() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(DesiredStateJson.write(DesiredStatePayload.of(registry.listMetas(), mappingDeriver)));
    }

    /** 自包含单页：列出全部登记索引，每行一个「复制期望配置」按钮。 */
    @GetMapping("/desired-state.html")
    public ResponseEntity<String> desiredStatePage() throws IOException {
        try (InputStream is = new ClassPathResource(PAGE).getInputStream()) {
            String html = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, "text/html;charset=UTF-8")
                    .body(html);
        }
    }
}
