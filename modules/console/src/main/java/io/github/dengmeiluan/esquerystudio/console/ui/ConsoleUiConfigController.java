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

package io.github.dengmeiluan.esquerystudio.console.ui;

import io.github.dengmeiluan.esquerystudio.platform.branding.ConsoleUiConfigService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 运行时 UI 配置端点：品牌 + 功能包开关 + 单页排除。
 *
 * <p>零敏感信息（无连接/账号/权限数据），属于自举面：空页面授权的身份也要能读到，
 * 否则前端无法区分「模块未启用」与「无权限」。授权判定仍由页面门负责。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/ui")
public class ConsoleUiConfigController {

    private final ConsoleUiConfigService uiConfigService;

    public ConsoleUiConfigController(ConsoleUiConfigService uiConfigService) {
        this.uiConfigService = uiConfigService;
    }

    @GetMapping("config")
    public Map<String, Object> config() {
        return uiConfigService.view();
    }
}
