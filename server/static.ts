import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In production, __dirname is inside dist/, so public is a sibling folder
  // Try multiple possible paths
  const possiblePaths = [
    path.resolve(__dirname, "public"),           // dist/public when running from dist/
    path.resolve(__dirname, "..", "dist", "public"), // from project root
    path.resolve(process.cwd(), "dist", "public"),   // from cwd
  ];
  
  let distPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      distPath = p;
      break;
    }
  }
  
  if (!distPath) {
    throw new Error(
      `Could not find the build directory. Tried: ${possiblePaths.join(", ")}. Make sure to build the client first.`,
    );
  }
  
  console.log(`[Static] Serving files from: ${distPath}`);

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
