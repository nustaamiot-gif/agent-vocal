require("dotenv").config();
const express = require("express");
const path = require("path");

const vapiWebhook = require("./routes/vapiWebhook");
const { listAppointments } = require("./services/store");

const app = express();

// CORS minimal fait à la main (pas de dépendance externe nécessaire) :
// autorise le tableau de bord et les appels VAPI depuis n'importe où.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-vapi-secret");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// Sert le tableau de bord (fichiers statiques dans /public)
app.use(express.static(path.join(__dirname, "..", "public")));

// Route appelée par VAPI pendant les appels téléphoniques
app.use("/vapi", vapiWebhook);

// API simple pour alimenter le tableau de bord
app.get("/api/appointments", (req, res) => {
  const appointments = listAppointments().sort(
    (a, b) => new Date(b.startTime) - new Date(a.startTime)
  );
  res.json(appointments);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Agent IA vocal démarré sur le port ${PORT}`);
  console.log(`   Webhook VAPI à configurer sur : https://<ton-domaine>/vapi/webhook`);
});
