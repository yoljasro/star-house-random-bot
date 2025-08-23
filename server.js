const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Statik fayllar (index.html ham shu orqali / da chiqadi)
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"]  // / ni index.html ga yechadi
}));

// SPA fallback — hech qanday path pattern YO'Q (shuning uchun path-to-regexp ishlamaydi)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Giveaway app running: http://localhost:${PORT}`);
});
