import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/icabbi-hook", async (req, res) => {
  console.log("Webhook recebido:", req.body);

  res.json({ status: "ok" });
});

app.listen(3000, () => {
  console.log("Servidor a correr");
});
