// backend/src/index.js
// Accurova Workflow Dashboard — Express + Supabase API

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

// ── SUPABASE ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service role key — never expose to frontend
);

// ── APP ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "PATCH", "DELETE"],
}));

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ── PROJECTS ──────────────────────────────────────────────────────────────────

// GET /projects — list all, optional ?stage= ?priority= filter
app.get("/projects", async (req, res) => {
  try {
    let query = supabase
      .from("projects")
      .select("*")
      .order("deadline", { ascending: true });

    if (req.query.stage)    query = query.eq("stage", req.query.stage);
    if (req.query.priority) query = query.eq("priority", req.query.priority);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /projects/:id — single project
app.get("/projects/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /projects — create new project
app.post("/projects", async (req, res) => {
  try {
    const {
      name, client, type, stage, priority,
      deadline, shoot_date, photo_count, video_count,
      progress, notes, tags,
    } = req.body;

    if (!name || !client || !type || !deadline) {
      return res.status(400).json({ error: "name, client, type, deadline are required" });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name, client, type,
        stage:       stage       ?? "Shoot",
        priority:    priority    ?? "Medium",
        deadline,
        shoot_date:  shoot_date  ?? null,
        photo_count: photo_count ?? 0,
        video_count: video_count ?? 0,
        progress:    progress    ?? 0,
        notes:       notes       ?? "",
        tags:        tags        ?? [],
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /projects/:id — partial update (stage, progress, notes, etc.)
app.patch("/projects/:id", async (req, res) => {
  try {
    const allowed = [
      "name", "client", "type", "stage", "priority",
      "deadline", "shoot_date", "photo_count", "video_count",
      "progress", "notes", "tags",
    ];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /projects/:id
app.delete("/projects/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
export { app };

const PORT = process.env.PORT || 3001;
// Only bind the port when run directly, not when imported by tests.
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`[accurova-api] listening on :${PORT}`);
  });
}
