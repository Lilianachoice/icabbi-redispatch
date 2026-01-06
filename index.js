import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_BASE = "https://api.coolnagour.com/v2/bookings";
const API_KEY = process.env.ICABBI_API_KEY;

// ===== Controlo de redispatch ativo =====
const activeRedispatch = new Set();

// ===== Reenvio da reserva =====
async function resend_booking(trip_id, driver_id, vehicle_id = null) {
  const payload = {
    trip_id,
    driver_id,
    allow_decline: true,
    enable_active_queue: false
  };

  if (vehicle_id) {
    payload.vehicle_id = vehicle_id;
  }

  console.log("===============================================");
  console.log("[DISPATCH] Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${API_BASE}/dispatchbooking`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && !result.error) {
      console.log(`[OK] Reserva ${trip_id} reenviada para driver ${driver_id}`);
    } else {
      console.log(`[ERRO] Redispatch falhou:`, JSON.stringify(result, null, 2));
    }

  } catch (err) {
    console.log("[EXCEÇÃO] Erro no redispatch:", err);
  }

  console.log("===============================================");
}

// ===== Redispatch com tentativas =====
async function dispatchWithRetries(trip_id, driver_id, vehicle_id) {
  if (activeRedispatch.has(trip_id)) {
    console.log(`[INFO] Redispatch já ativo para ${trip_id}, ignorado`);
    return;
  }

  activeRedispatch.add(trip_id);
  console.log(`[INFO] Redispatch iniciado para ${trip_id}`);

  const attempts = [
  30 * 1000,
  30 * 1000,
  30 * 1000
  ];

  for (let i = 0; i < attempts.length; i++) {
    console.log(`[INFO] Tentativa ${i + 1} para ${trip_id}`);
    await new Promise(r => setTimeout(r, attempts[i]));
    await resend_booking(trip_id, driver_id, vehicle_id);
  }

  activeRedispatch.delete(trip_id);
  console.log(`[INFO] Redispatch finalizado para ${trip_id}`);
}

// ===== Webhook =====
app.post("/icabbi-hook", (req, res) => {
  const data = req.body;

  console.log("[WEBHOOK RECEBIDO]", JSON.stringify(data, null, 2));

  if (data._event !== "booking:missed") {
    return res.json({ status: "ignorado" });
  }

  const trip_id = data.trip_id;
  const driver_id = data.driver_id;
  const vehicle_id = data.vehicle?.id || null;

  console.log(`[INFO] trip_id: ${trip_id}`);
  console.log(`[INFO] driver_id: ${driver_id}`);
  console.log(`[INFO] vehicle_id: ${vehicle_id}`);

  if (!trip_id || !driver_id) {
    console.log("[ERRO] trip_id ou driver_id em falta");
    return res.status(400).json({ error: "Dados insuficientes" });
  }

  dispatchWithRetries(trip_id, driver_id, vehicle_id);
  res.json({ status: "ok" });
});

// ===== Teste =====
app.get("/teste", (req, res) => {
  res.send("Servidor a correr! ✅");
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
