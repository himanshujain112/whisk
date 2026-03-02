import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			"/upload": "https://api.whisk.codemeoww.com",
			"/download": "https://api.whisk.codemeoww.com",
			"/verify": "https://api.whisk.codemeoww.com",
		},
	},
});
