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

package io.github.dengmeiluan.esquerystudio.console.boot3;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Phase 0 of the Boot 3 parallel artifact: an independent Spring Boot 3.5 / Java 17
 * application that serves the existing Vue console assets and proves low-level
 * Elasticsearch REST connectivity against 8.x/9.x clusters.
 *
 * <p>The REST/probe core lives in {@code esquerystudio-boot-support}; this class only
 * binds the Boot 3 baseline. The full engine port is tracked in
 * {@code docs/boot3-migration.md}.</p>
 */
@SpringBootApplication
public class Boot3ConsoleApplication {

    public static void main(String[] args) {
        SpringApplication.run(Boot3ConsoleApplication.class, args);
    }
}
