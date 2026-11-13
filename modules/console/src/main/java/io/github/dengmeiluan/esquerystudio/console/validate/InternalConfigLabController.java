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

package io.github.dengmeiluan.esquerystudio.console.validate;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 *  配置实验室端点（校验器 + 漂移检测）。
 *
 * <p>路径 {@code internal/es/index/config-lab/**}：validate 为 POST → 拦截器默认 OPERATOR
 * （dry-run 会瞬时建删临时索引，OPERATOR 合理）；drift 为 GET → VIEWER 可读。
 * 「校验通过后建索引」复用既有 {@code cluster/create-index}（ADMIN），本控制器不重复暴露。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/config-lab")
public class InternalConfigLabController {

    private final ConfigLabService configLabService;

    public InternalConfigLabController(ConfigLabService configLabService) {
        this.configLabService = configLabService;
    }

    /**
     * 三层校验。body: {@code {settings, mapping, dryRun}}（settings/mapping 为 JSON 字符串，均可空）。
     */
    @PostMapping("/validate")
    public Map<String, Object> validate(@RequestBody Map<String, Object> req) {
        String settings = req.get("settings") == null ? null : String.valueOf(req.get("settings"));
        String mapping = req.get("mapping") == null ? null : String.valueOf(req.get("mapping"));
        boolean dryRun = Boolean.TRUE.equals(req.get("dryRun"));
        return configLabService.validate(settings, mapping, dryRun);
    }

    /** 漂移检测对象清单（注册 provider 的 indexKey；纯控制台宿主为空） */
    @GetMapping("/drift/keys")
    public List<Map<String, Object>> driftKeys() {
        return configLabService.driftKeys();
    }

    /** 单索引漂移详情：代码 @Setting/@Mapping vs 线上实际（归一化 JSON + diff 摘要） */
    @GetMapping("/drift")
    public Map<String, Object> drift(@RequestParam("indexKey") String indexKey) throws IOException {
        return configLabService.drift(indexKey);
    }
}
