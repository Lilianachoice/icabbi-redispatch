import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_BASE = "https://api.coolnagour.com/v2/bookings/dispatchbooking"; // endpoint correto
const API_KEY = process.env.ICABBI_API_KEY; // chave segura no Render

// ===== Função para reenviar reserva =====
async function resend_booking(trip_id, vehicle_id, driver_id) {
    const payload = {
        trip_id,
        vehicle_id,
        driver_id,
        allow_decline: true,
        enable_active_queue: false
    };

    const headers = {
        "Authorization": `Basic ${API_KEY}`,
        "Content-Type": "application/json"
    };

    console.log("===============================================");
    console.log("[DISPATCH] Enviando payload para iCabbi:", JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(API_BASE, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        const json = await response.json();
        if (response.ok && !json.error) {
            console.log(`[OK] Reserva ${trip_id} reenviada para motorista ${driver_id}`);
        } else {
            console.log(`[ERRO] Não foi possível reenviar ${trip_id}:`, JSON.stringify(json, null, 2));
        }
        console.log("[DISPATCH RESPONSE COMPLETO]", JSON.stringify(json, null, 2));
    } catch (err) {
        console.log(`[EXCEÇÃO] Erro ao reenviar ${trip_id}: ${err}`);
    }
}

// ===== Função para gerir redispatch automático =====
async function dispatchWithRetries(trip_id, vehicle_id, driver_id) {
    const attempts = [30 * 1000, 60 * 1000, 60 * 1000]; // 30s, 1min, 1min (ajusta se quiser 3min/5min)
    for (let i = 0; i < attempts.length; i++) {
        const wait = attempts[i];
        console.log(`[INFO] Tentativa ${i + 1} para trip_id ${trip_id} - aguardando ${wait / 1000} segundos`);
        await new Promise(r => setTimeout(r, wait));
        await resend_booking(trip_id, vehicle_id, driver_id);
    }
}

// ===== Endpoint do webhook =====
app.post("/icabbi-hook", (req, res) => {
    const data = req.body;
    console.log("[WEBHOOK RECEBIDO]", JSON.stringify(data, null, 2));

    if (!data.driver || !data.driver.id || !data.driver.vehicle || !data.driver.vehicle.id) {
        console.log("[ERRO] Driver ou Vehicle não encontrados no payload");
        return res.status(400).json({ error: "Driver ou Vehicle não encontrados" });
    }

    const driver_id = data.driver.id;
    const vehicle_id = data.driver.vehicle.id;
    const trip_id = data.external_booking_id;

    console.log("[INFO] driver_id:", driver_id);
    console.log("[INFO] vehicle_id:", vehicle_id);
    console.log("[INFO] Evento", data._event, "detectado para trip_id", trip_id);

    if (data._event === "booking:missed") {
        dispatchWithRetries(trip_id, vehicle_id, driver_id);
    }

    res.json({ status: "ok" });
});

// ===== Rota de teste =====
app.get("/teste", (req, res) => {
    res.send("Servidor a correr! ✅");
});

// ===== Rodar o app =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor a correr na porta ${PORT}`));
