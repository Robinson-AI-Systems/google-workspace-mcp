import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['.rtc-hub/packages/conformance/test/**/*.test.js'],environment:'node'}});
