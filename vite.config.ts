import { defineConfig } from "vite";

// GitHub Pages のプロジェクトサイト（https://<user>.github.io/<repo>/）でも
// そのまま動くよう、アセット参照を相対パスにする。
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
