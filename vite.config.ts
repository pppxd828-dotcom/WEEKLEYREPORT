import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// 相對路徑可支援 GitHub Pages 的專案子目錄及本機預覽。
export default defineConfig({ base: './', plugins: [react(), tailwindcss()] });
