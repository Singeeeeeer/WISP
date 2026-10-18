import { defineConfig } from "@playwright/test";
import base from "./playwright.offline.config";
import { resolve } from "node:path";
const root=process.cwd();
export default defineConfig({...base,webServer:(base.webServer as any[]).map(server=>({...server,cwd:root})),testDir:resolve(root,"e2e"),testMatch:["gemini.spec.ts","gemini-text.spec.ts"],testIgnore:["**/.english-run/**"],outputDir:resolve(root,"test-results/cup-gemini"),reporter:[["line"]]});