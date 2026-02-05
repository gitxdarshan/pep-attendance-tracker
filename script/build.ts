import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm(path.join(rootDir, "dist"), { recursive: true, force: true });

  console.log("building client...");
  
  const isReplit = !!process.env.REPL_ID;
  const configFile = isReplit 
    ? path.join(rootDir, "vite.config.ts")
    : path.join(rootDir, "vite.config.production.ts");
  
  await viteBuild({
    configFile,
    root: path.join(rootDir, "client"),
    build: {
      outDir: path.join(rootDir, "dist/public"),
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        "@": path.join(rootDir, "client", "src"),
        "@shared": path.join(rootDir, "shared"),
        "@assets": path.join(rootDir, "attached_assets"),
      },
    },
  });

  console.log("building server...");
  const pkg = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: [path.join(rootDir, "server/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.join(rootDir, "dist/index.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
