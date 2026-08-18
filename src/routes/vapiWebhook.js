const express = require("express");
const { getAvailableSlots, isSlotAvailable, bookAppointment } = require("../services/calendar");
const { addAppointment } = require("../services/store");

const router = express.Router();

function checkSecret(req, res, next) {
  const expected = process.env.VAPI_SERVER_SECRET;
  const received = req.header("x-vapi-secret");
  if (expected && received !== expected) {
    return res.status(401).json({ error: "Secret invalide" });
  }
  next();
}

router.post("/webhook", checkSecret, async (req, res) => {
  try {
    const message = req.body?.message;
    if (!message || message.type !== "tool-calls") {
      return res.status(200).json({ received: true });
    }
    const toolCalls = message.toolCallList || message.toolCalls || [];
    const results = [];
    for (const call of toolCalls) {
      const name = call.name || call.function?.name;
      const args = call.arguments || call.function?.arguments || {};
      const toolCallId = call.id;
      let result;
      try {
        result = await runTool(name, args);
      } catch (err) {
        result = { error: err.message || "Erreur interne" };
      }
      results.push({ toolCallId, result: JSON.stringify(result) });
    }
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/check-availability", checkSecret, async (req, res) => {
  try {
    const result = await runTool("check_availability", req.body || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

router.post("/book-appointment", checkSecret, async (req, res) => {
  try {
    const result = await runTool("book_appointment", req.body || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

async function runTool(name, args) {
  switch (name) {
    case "check_availability": {
      const slots = await getAvailableSlots(args.date);
      return { available: slots.length > 0, slots: slots.slice(0, 8) };
    }
    case "book_appointment": {
      const { start_time, customer_name, customer_phone, reason } = args;
      const free = await isSlotAvailable(start_time);
      if (!free) {
        return { success: false, message: "Ce créneau vient d'être pris. Merci d'en proposer un autre au client." };
      }
      const event = await bookAppointment({ startISO: start_time, customerName: customer_name, customerPhone: customer_phone, reason });
      addAppointment({ customerName: customer_name, customerPhone: customer_phone, reason, startTime: start_time, calendarEventId: event.id, calendarLink: event.htmlLink });
      return { success: true, message: "Rendez-vous confirmé.", eventLink: event.htmlLink };
    }
    default:
      return { error: `Fonction inconnue : ${name}` };
  }
}

module.exports = router;
