package io.github.dengmeiluan.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 最小嵌入式宿主：除 @SpringBootApplication 外零接线——
 * 实体声明见 {@link Article}，控制台与重建端点由 starter 自动装配。
 */
@SpringBootApplication
public class DemoHostApplication {

    public static void main(String[] args) {
        SpringApplication.run(DemoHostApplication.class, args);
    }
}
