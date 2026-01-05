import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== Configurações =====
const API_BASE = "https://api.coolnagour.com/v2/bookings"; // URL da API iCabbi
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
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
    };

    try {
        const response = await fetch(`${API_BASE}/dispatch_booking`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
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

// ===== Função para gerir redispatch automático =====
async function dispatchWithRetries(trip_id, vehicle_id, driver_id) {
    const attempts = [3 * 60 * 1000, 5 * 60 * 1000, 5 * 60 * 1000]; // 3min, 5min, 5min

    for (let i = 0; i < attempts.length; i++) {
        const wait = attempts[i];
        console.log(`[INFO] Tentativa ${i + 1} para trip_id ${trip_id} - aguardando ${wait / 60000} minutos`);
        await new Promise(r => setTimeout(r, wait));
        await resend_booking(trip_id, vehicle_id, driver_id);
    }
}

// ===== Endpoint do webhook =====
app.post("/icabbi-hook", (req, res) => {
    const data = req.body;
    console.log("[WEBHOOK RECEBIDO]", JSON.stringify(data, null, 2));

    const driver_id = data.driver ? data.driver.id : null;
    const vehicle_id = data.driver && data.driver.vehicle ? data.driver.vehicle.id : null;

    if (!driver_id) {
        console.log("[ERRO] Driver não encontrado no payload");
        return res.status(400).json({ error: "Driver não encontrado" });
    }

    if (data._event === "booking:missed") {
        dispatchWithRetries(data.external_booking_id, vehicle_id, driver_id);
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
