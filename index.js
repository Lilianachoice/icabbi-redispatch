import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_BASE = "https://api.coolnagour.com/v2/bookings"; // endpoint da iCabbi
const API_KEY = process.env.ICABBI_API_KEY; // chave segura do Render

// ===== Controle de redispatch =====
const activeRedispatch = new Set();
const attemptsCount = new Map(); // Armazena número de tentativas por trip_id

// ===== Função para reenviar reserva =====
async function resend_booking(trip_id, vehicle_id, driver_id) {
  const payload = {
    trip_id,
    vehicle_id,
    driver_id,
    allow_decline: true,
    enable_active_queue: false
  };

  console.log("===============================================");
  console.log("[DISPATCH] Enviando payload para iCabbi:", payload);

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
      console.log(`[OK] Reserva ${trip_id} reenviada para motorista ${driver_id}`);
    } else {
      console.log(`[ERRO] Não foi possível reenviar ${trip_id}:`, result);
    }

    console.log("[DISPATCH RESPONSE COMPLETO]", JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(`[EXCEÇÃO] Erro ao reenviar ${trip_id}:`, err);
  }

  console.log("===============================================");
}

// ===== Função de redispatch com limite de 3 tentativas =====
async function dispatchWithRetries(trip_id, vehicle_id, driver_id) {
  if (activeRedispatch.has(trip_id)) {
    console.log(`[INFO] Redispatch já ativo para ${trip_id}, ignorado`);
    return;
  }

  activeRedispatch.add(trip_id);

  // Inicializa contador de tentativas
  if (!attemptsCount.has(trip_id)) {
    attemptsCount.set(trip_id, 0);
  }

  console.log(`[INFO] Redispatch iniciado para ${trip_id}`);

  const attempts = [
    90 * 1000, // 1min30s
    90 * 1000, // 1min30s
    90 * 1000  // 1min30s
  ];

  for (let i = 0; i < attempts.length; i++) {
    let count = attemptsCount.get(trip_id);
    if (count >= 3) {
      console.log(`[INFO] Limite de 3 tentativas atingido para ${trip_id}, parando redispatch`);
      break;
    }

    const wait = attempts[i];
    console.log(`[INFO] Tentativa ${count + 1} para trip_id ${trip_id} - aguardando ${wait / 1000}s`);
    await new Promise(r => setTimeout(r, wait));

    await resend_booking(trip_id, vehicle_id, driver_id);

    // Incrementa contador
    attemptsCount.set(trip_id, count + 1);
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
  const vehicle_id = data.vehicle?.id; // mantemos exatamente como está

  console.log(`[INFO] Evento booking:missed detectado para trip_id ${trip_id}`);
  console.log(`[INFO] driver_id: ${driver_id}`);
  console.log(`[INFO] vehicle_id: ${vehicle_id}`);

  if (!trip_id || !driver_id || !vehicle_id) {
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
