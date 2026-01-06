import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_BASE = "https://api.coolnagour.com/v2/bookings"; // endpoint da iCabbi
const API_KEY = process.env.ICABBI_API_KEY; // chave segura do Render

// ===== CONTROLO DE REDISPATCH ATIVO =====
const activeRedispatch = new Map(); // trip_id => { attempts: 0 }

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

    const data = await response.json();

    if (response.ok && !data.error) {
      console.log(`[OK] Reserva ${trip_id} reenviada para motorista ${driver_id}`);
    } else {
      console.log(`[ERRO] Não foi possível reenviar ${trip_id}:`, JSON.stringify(data, null, 2));
    }

    console.log("[DISPATCH RESPONSE COMPLETO]", JSON.stringify(data, null, 2));
  } catch (err) {
    console.log(`[EXCEÇÃO] Erro ao reenviar ${trip_id}:`, err);
  }

  console.log("===============================================");
}

// ===== Função de redispatch com controlo de tentativas =====
async function dispatchWithRetries(trip_id, vehicle_id, driver_id) {
  if (!activeRedispatch.has(trip_id)) {
    activeRedispatch.set(trip_id, { attempts: 0 });
  }

  const entry = activeRedispatch.get(trip_id);
  const attemptsArray = [
    90 * 1000, // 1min30s
    90 * 1000,
    90 * 1000
  ];

  while (entry.attempts < attemptsArray.length) {
    const wait = attemptsArray[entry.attempts];
    console.log(`[INFO] Tentativa ${entry.attempts + 1} para trip_id ${trip_id} - aguardando ${wait / 1000}s`);
    
    await new Promise(r => setTimeout(r, wait));

    await resend_booking(trip_id, vehicle_id, driver_id);
    entry.attempts++;
  }

  console.log(`[INFO] Redispatch finalizado para ${trip_id} após ${entry.attempts} tentativas`);
  activeRedispatch.delete(trip_id);
}

// ===== Webhook =====
app.post("/icabbi-hook", (req, res) => {
  const data = req.body;

  if (data._event !== "booking:missed") {
    return res.json({ status: "ignorado" });
  }

  const trip_id = data.trip_id; // ID da iCabbi correto
  const driver_id = data.driver_id;
  const vehicle_id = data.vehicle?.id || data.driver?.vehicle?.id;

  console.log(`[INFO] Evento booking:missed detectado para trip_id ${trip_id}`);
  console.log(`[INFO] driver_id: ${driver_id}`);
  console.log(`[INFO] vehicle_id: ${vehicle_id}`);

  // Ignorar se trip_id já está ativo
  if (activeRedispatch.has(trip_id)) {
    console.log(`[INFO] Redispatch já ativo para ${trip_id}, ignorando novo evento`);
    return res.json({ status: "ja_ativo" });
  }

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

// ===== Start do servidor =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
