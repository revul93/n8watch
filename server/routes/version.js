"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const VERSION_FILE = path.join(__dirname, "..", "..", "data", "version.json");

router.get("/", (req, res) => {
  try {
    const content = fs.readFileSync(VERSION_FILE, "utf-8");
    const data = JSON.parse(content);
    res.json(data);
  } catch {
    res.json({ version: "0" });
  }
});

module.exports = router;
