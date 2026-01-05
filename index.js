import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_BASE = "https://api.coolnagour.com/v2/bookings"; // endpoint da iCabbi
const API_KEY = process.env.ICABBI_API_KEY; // chave segura do Render

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

    try {
        console.log("===============================================");
        console.log("[DISPATCH] Enviando payload para iCabbi:", JSON.stringify(payload, null, 2));
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
        console.log("===============================================");

    } catch (err) {
        console.log(`[EXCEÇÃO] Erro ao reenviar ${trip_id}: ${err}`);
    }
}

// ===== Função para gerir redispatch automático =====
async function dispatchWithRetries(trip_id, vehicle_id, driver_id) {
    const attempts = [30 * 1000, 5 * 60 * 1000, 5 * 60 * 1000]; // 30s, 5min, 5min

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

    if (!data.driver || !data.driver.id) {
        console.log("[ERRO] Driver não encontrado no payload");
        return res.status(400).json({ error: "Driver não encontrado" });
    }

    const driver_id = data.driver.id;
    const vehicle_id = data.driver.vehicle ? data.driver.vehicle.ref : null;

    if (!vehicle_id) {
        console.log("[ERRO] Vehicle não encontrado no payload");
        return res.status(400).json({ error: "Vehicle não encontrado" });
    }

    if (data._event === "booking:missed") {
        console.log(`[INFO] Evento booking:missed detectado para trip_id ${data.trip_id}`);
        dispatchWithRetries(data.trip_id, vehicle_id, driver_id);
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
