const express = require("express");
const { getAvailableSlots, isSlotAvailable, bookAppointment } = require("../services/calendar");
const { addAppointment } = require("../services/store");

const router = express.Router();

/**
 * Sécurité : VAPI peut envoyer un secret dans l'en-tête "x-vapi-secret"
 * (configuré dans Vapi > Assistant > Server URL Secret). On vérifie
 * qu'il correspond à VAPI_SERVER_SECRET pour éviter que n'importe qui
 * puisse déclencher des réservations sur ton calendrier.
 */
function checkSecret(req, res, next) {
  const expected = process.env.VAPI_SERVER_SECRET;
  if (!expected || expected === "change-moi-avec-une-valeur-aleatoire") {
    console.warn("⚠️  VAPI_SERVER_SECRET n'est pas configuré correctement.");
  }
  const received = req.header("x-vapi-secret");
  if (expected && received !== expected) {
    return res.status(401).json({ error: "Secret invalide" });
  }
  next();
}

/**
 * Point d'entrée unique appelé par VAPI pendant l'appel téléphonique,
 * à chaque fois que l'assistant vocal décide d'utiliser un "tool"
 * (fonction). Le format suit le protocole "tool-calls" de VAPI :
 * https://docs.vapi.ai/server-url
 */
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
        console.error(`Erreur dans l'outil "${name}" :`, err);
        result = { error: err.message || "Erreur interne" };
      }

      results.push({ toolCallId, result: JSON.stringify(result) });
    }

    return res.json({ results });
  } catch (err) {
    console.error("Erreur webhook VAPI :", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * Exécute la fonction demandée par l'assistant vocal.
 * Ces trois fonctions doivent être déclarées côté VAPI (voir
 * vapi-assistant-config.json) avec exactement ces noms de paramètres.
 */
async function runTool(name, args) {
  switch (name) {
    case "check_availability": {
      // args.date attendu au format YYYY-MM-DD
      const slots = await getAvailableSlots(args.date);
      return {
        available: slots.length > 0,
        slots: slots.slice(0, 8), // on ne propose pas plus de 8 créneaux à l'oral
      };
    }

    case "book_appointment": {
      const { start_time, customer_name, customer_phone, reason } = args;

      const free = await isSlotAvailable(start_time);
      if (!free) {
        return {
          success: false,
          message: "Ce créneau vient d'être pris. Merci d'en proposer un autre au client.",
        };
      }

      const event = await bookAppointment({
        startISO: start_time,
        customerName: customer_name,
        customerPhone: customer_phone,
        reason,
      });

      addAppointment({
        customerName: customer_name,
        customerPhone: customer_phone,
        reason,
        startTime: start_time,
        calendarEventId: event.id,
        calendarLink: event.htmlLink,
      });

      return {
        success: true,
        message: "Rendez-vous confirmé.",
        eventLink: event.htmlLink,
      };
    }

    default:
      return { error: `Fonction inconnue : ${name}` };
  }
}

module.exports = router;
