import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: if you deploy to https://<usuario>.github.io/<repo>/
// this "base" must be "/<repo>/" (matching your repo name exactly).
// If you deploy to a custom domain or to <usuario>.github.io (a user/org
// page repo), set it to "/" instead.
export default defineConfig({
  plugins: [react()],
  base: "/gestor-gastos/",
});
