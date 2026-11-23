const express = require("express");
const fs = require("fs");
const path = require("path");
const { Transform, pipeline } = require("stream");

const app = express();
app.disable("x-powered-by");

// Logs de requêtes uniquement hors production
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

app.get("/", (req, res) => {
  res.send("Hello world — serveur optimisé");
});

const FILE_PATH = path.join(__dirname, "maybe-big-file.txt");

// Remplace les \n par <br/> au fil de l'eau, sans charger le fichier en mémoire
const lineBreaks = () =>
  new Transform({
    decodeStrings: false,
    transform(chunk, enc, cb) {
      cb(null, chunk.replace(/\n/g, "<br/>"));
    },
  });

app.get("/big", (req, res) => {
  const file = fs.createReadStream(FILE_PATH, { encoding: "utf8" });

  file.once("error", (err) => {
    if (res.headersSent) return res.destroy();
    if (err.code === "ENOENT")
      return res.status(404).send("Fichier introuvable");
    res.status(500).send("Erreur serveur");
  });

  file.once("open", () => {
    res.type("html");
    pipeline(file, lineBreaks(), res, () => {});
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Arrêt propre (docker stop envoie SIGTERM)
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
