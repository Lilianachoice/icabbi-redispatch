import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_BASE = "https://api.coolnagour.com/v2/bookings"; // endpoint da iCabbi
const API_KEY = process.env.ICABBI_API_KEY; // chave segura do Render

// ===== CONTROLO DE REDISPATCH ATIVO =====
const activeRedispatch = new Set();

// ===== Função para reenviar reserva =====
async function resend_booking(trip_id, vehicle_id, driver_id) {
  const payload = {
    trip_id,
    driver_id,
    allow_decline: true,
    enable_active_queue: false
  };

  // adiciona vehicle_id apenas se existir
  if (vehicle_id) {
    payload.vehicle_id = vehicle_id;
  }

  console.log("===============================================");
  console.log("[DISPATCH] Payload:", JSON.stringify(payload, null, 2));

  const headers = {
    "Authorization": `Basic ${API_KEY}`,
    "Content-Type": "application/json"
  };

  try {
    const response = await fetch(`${API_BASE}/dispatchbooking`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && !result.error) {
      console.log(`[OK] Reserva ${trip_id} reenviada para driver ${driver_id}`);
    } else {
      console.log(`[ERRO] Não foi possível reenviar ${trip_id}:`, JSON.stringify(result, null, 2));
    }

    console.log("[DISPATCH RESPONSE COMPLETO]", JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(`[EXCEÇÃO] Erro ao reenviar ${trip_id}:`, err);
  }

  console.log("===============================================");
}

// ===== Função de redispatch com controlo e limite de 3 tentativas =====
async function dispatchWithRetries(trip_id, vehicle_id, driver_id) {
  if (activeRedispatch.has(trip_id)) {
    console.log(`[INFO] Redispatch já ativo para ${trip_id}, ignorado`);
    return;
  }

  activeRedispatch.add(trip_id);
  console.log(`[INFO] Redispatch iniciado para ${trip_id}`);

  // Limite de 3 tentativas de 30 segundos cada
  const attempts = [
    30 * 1000, // 30s
    30 * 1000, // 30s
    30 * 1000  // 30s
  ];

  for (let i = 0; i < attempts.length; i++) {
    const wait = attempts[i];
    console.log(`[INFO] Tentativa ${i + 1} para trip_id ${trip_id} - aguardando ${wait / 1000}s`);
    await new Promise(r => setTimeout(r, wait));
    await resend_booking(trip_id, vehicle_id, driver_id);
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
  const vehicle_id = data.vehicle?.id; // opcional, pode ser undefined

  console.log(`[INFO] Evento booking:missed detectado para trip_id ${trip_id}`);
  console.log(`[INFO] driver_id: ${driver_id}`);
  console.log(`[INFO] vehicle_id: ${vehicle_id}`);

  if (!trip_id || !driver_id) {
    console.log("[ERRO] Dados insuficientes para redispatch");
    return res.status(400).json({ error: "Dados insuficientes" });
  }

  dispatchWithRetries(trip_id, vehicle_id, driver_id);
  res.json({ status: "ok" });
});

// ===== Rota de teste =====
app.get("/teste", (req, res) => {
  res.send("Servidor a correr! ✅");
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
