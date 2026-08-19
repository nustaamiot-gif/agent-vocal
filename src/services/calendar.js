const { google } = require("googleapis");

function getAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!process.env.GOOGLE_CLIENT_EMAIL || !privateKey) {
    throw new Error("Variables GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY manquantes.");
  }
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getAuth() });
}

const CALENDAR_ID = () => process.env.GOOGLE_CALENDAR_ID || "primary";
const TZ = () => process.env.BUSINESS_TIMEZONE || "Pacific/Noumea";
const DURATION_MIN = () => parseInt(process.env.APPOINTMENT_DURATION_MINUTES || "30", 10);

function parseDateOrThrow(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`${label} manquant ou invalide : "${value}". Format attendu YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss.`);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`${label} invalide : "${value}". Format attendu YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss.`);
  }
  return date;
}

async function isSlotAvailable(startISO) {
  const calendar = getCalendarClient();
  const start = parseDateOrThrow(startISO, "start_time");
  const end = new Date(start.getTime() + DURATION_MIN() * 60000);
  const res = await calendar.freebusy.query({
    requestBody: { timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: TZ(), items: [{ id: CALENDAR_ID() }] },
  });
  const busy = res.data.calendars?.[CALENDAR_ID()]?.busy || [];
  return busy.length === 0;
}

async function getAvailableSlots(dateISO) {
  const calendar = getCalendarClient();
  const startHour = process.env.BUSINESS_HOURS_START || "09:00";
  const endHour = process.env.BUSINESS_HOURS_END || "18:00";
  const duration = DURATION_MIN();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO || "")) {
    throw new Error(`Date invalide : "${dateISO}". Format attendu strictement YYYY-MM-DD, par exemple 2026-08-21.`);
  }

  const dayStart = parseDateOrThrow(`${dateISO}T${startHour}:00`, "date");
  const dayEnd = parseDateOrThrow(`${dateISO}T${endHour}:00`, "date");

  const res = await calendar.freebusy.query({
    requestBody: { timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), timeZone: TZ(), items: [{ id: CALENDAR_ID() }] },
  });

  const busy = (res.data.calendars?.[CALENDAR_ID()]?.busy || []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  const slots = [];
  let cursor = new Date(dayStart);
  while (cursor.getTime() + duration * 60000 <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + duration * 60000);
    const overlaps = busy.some((b) => cursor < b.end && slotEnd > b.start);
    if (!overlaps) slots.push(cursor.toISOString());
    cursor = slotEnd;
  }
  return slots;
}

async function bookAppointment({ startISO, customerName, customerPhone, reason }) {
  const calendar = getCalendarClient();
  const start = parseDateOrThrow(startISO, "start_time");
  const end = new Date(start.getTime() + DURATION_MIN() * 60000);
  const event = {
    summary: `Rendez-vous — ${customerName || "Client"}`,
    description: [reason ? `Motif : ${reason}` : null, customerPhone ? `Téléphone : ${customerPhone}` : null, "Rendez-vous pris automatiquement par l'agent vocal IA."].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString(), timeZone: TZ() },
    end: { dateTime: end.toISOString(), timeZone: TZ() },
  };
  const res = await calendar.events.insert({ calendarId: CALENDAR_ID(), requestBody: event });
  return res.data;
}

module.exports = { isSlotAvailable, getAvailableSlots, bookAppointment }
