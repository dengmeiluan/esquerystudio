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

package io.github.dengmeiluan.esquerystudio.console.boot4;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Phase 0 of the Boot 4 parallel artifact: the same shared REST/probe core as Boot 3,
 * bound to the Boot 4 / Java 17 baseline and the ES 9.x low-level client.
 */
@SpringBootApplication
public class Boot4ConsoleApplication {

    public static void main(String[] args) {
        SpringApplication.run(Boot4ConsoleApplication.class, args);
    }
}
