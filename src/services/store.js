const fs = require("fs");
const path = require("path");

/**
 * Stockage local très simple (fichier JSON) des rendez-vous pris,
 * uniquement pour alimenter le tableau de bord. La source de vérité
 * reste Google Calendar.
 */

const DATA_FILE = path.join(__dirname, "..", "..", "data", "appointments.json");

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}

function listAppointments() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function addAppointment(appointment) {
  ensureFile();
  const all = listAppointments();
  all.push({ ...appointment, createdAt: new Date().toISOString() });
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), "utf-8");
  return appointment;
}

module.exports = { listAppointments, addAppointment };
