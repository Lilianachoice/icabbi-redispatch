import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_KEY = "process.env.ICABBI_API_KEY"; // substitui pela tua
const API_BASE = "https://eu2.coolnagour.com/dispatch/operator/overview"; // URL real da API

// ===== Rota de teste =====
app.get("/teste", (req, res) => {
  res.send("Servidor a correr! ✅");
});

// ===== Função para reenviar reserva =====
async function resendBooking(trip_id, vehicle_id, driver_id) {
  const payload = {
    trip_id,
    vehicle_id,
    driver_id,
    allow_decline: true,
    enable_active_queue: false,
  };
  const headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
  };
  try {
    const response = await fetch(`${API_BASE}/dispatch_booking`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      console.log(`[OK] Reserva ${trip_id} reenviada para motorista ${driver_id}`);
    } else {
      const text = await response.text();
      console.log(`[ERRO] Não foi possível reenviar ${trip_id}: ${text}`);
    }
  } catch (err) {
    console.log(`[EXCEÇÃO] Erro ao reenviar ${trip_id}: ${err}`);
  }
}

// ===== Endpoint do webhook =====
app.post("/icabbi-hook", async (req, res) => {
  const data = req.body;
  const { _event, trip_id, driver, vehicle } = data;

  console.log(`[WEBHOOK] Recebido evento: ${_event} para trip_id: ${trip_id}`);

  if (_event === "booking:missed") {
    const driver_id = driver.id;
    const vehicle_id = vehicle.id;

    // Função para tentar reenviar até 3 vezes
    for (let attempt = 1; attempt <= 3; attempt++) {
      const delayMinutes = attempt === 1 ? 3 : 5; // 3 min na primeira tentativa, 5 min nas seguintes
      console.log(`[INFO] Tentativa ${attempt} - aguardando ${delayMinutes} minutos antes de reenviar`);
      
      // Esperar o tempo definido
      await new Promise(resolve => setTimeout(resolve, delayMinutes * 60 * 1000));

      console.log(`[INFO] Enviando reserva ${trip_id} para motorista ${driver_id} - tentativa ${attempt}`);
      await resendBooking(trip_id, vehicle_id, driver_id);
    }
  }

  res.json({ status: "ok" });
});

// ===== Rodar o app =====
app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor a correr");
});
