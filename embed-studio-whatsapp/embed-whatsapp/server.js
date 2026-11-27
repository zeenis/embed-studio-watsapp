
const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function clean(v, max) {
  return String(v || "").trim().slice(0, max);
}

function color(v) {
  return /^#[0-9a-fA-F]{6}$/.test(v || "") ? v : "#5865F2";
}

function escapeHtml(v) {
  return String(v || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

async function db(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  if (!response.ok) {
    console.error(text);
    throw new Error("Error de base de datos");
  }

  return text ? JSON.parse(text) : null;
}

async function getEmbed(id) {
  const rows = await db(
    `embeds?id=eq.${encodeURIComponent(id)}&select=*`
  );
  return rows[0] || null;
}

// Crear embed
app.post("/api/embeds", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: "Supabase no configurado" });
  }

  const title = clean(req.body.title, 100);
  const description = clean(req.body.description, 500);
  const image = clean(req.body.image, 1000);

  if (!title) {
    return res.status(400).json({ error: "Falta el título" });
  }

  if (image && !/^https:\/\//i.test(image)) {
    return res.status(400).json({
      error: "La imagen necesita una URL HTTPS"
    });
  }

  const embed = {
    id: crypto.randomBytes(6).toString("hex"),
    title,
    description,
    image,
    color: color(req.body.color),
    author: clean(req.body.author, 80),
    footer: clean(req.body.footer, 100)
  };

  try {
    await db("embeds", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(embed)
    });

    res.json({
      id: embed.id,
      url: `${req.protocol}://${req.get("host")}/e/${embed.id}`
    });
  } catch {
    res.status(500).json({ error: "No se pudo guardar el embed" });
  }
});

// Página pública y metadatos de WhatsApp
app.get("/e/:id", async (req, res) => {
  let e;

  try {
    e = await getEmbed(req.params.id);
  } catch {
    return res.status(500).send("Error al cargar el embed");
  }

  if (!e) return res.status(404).send("Embed no encontrado");

  const title = escapeHtml(e.title);
  const description = escapeHtml(e.description);
  const image = e.image ||
    `${req.protocol}://${req.get("host")}/preview/${e.id}.svg`;

  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
${e.image ? `<img src="${escapeHtml(e.image)}">` : ""}
</body>
</html>`);
});

// Imagen automática para embeds sin imagen
app.get("/preview/:id.svg", async (req, res) => {
  let e;

  try {
    e = await getEmbed(req.params.id);
  } catch {
    return res.status(500).end();
  }

  if (!e) return res.status(404).end();

  const esc = escapeHtml;

  res.type("image/svg+xml").send(`
<svg xmlns="http://www.w3.org/2000/svg"
 width="1200" height="630">
 <rect width="1200" height="630" fill="#232428"/>
 <rect width="18" height="630" fill="${color(e.color)}"/>
 <text x="70" y="130" fill="#b5bac1"
 font-family="Arial" font-size="28">${esc(e.author || "EMBED")}</text>
 <text x="70" y="240" fill="white"
 font-family="Arial" font-size="54">${esc(e.title)}</text>
 <foreignObject x="70" y="290" width="1050" height="260">
 <div xmlns="http://www.w3.org/1999/xhtml"
 style="color:#dbdee1;font:30px Arial">
 ${esc(e.description)}
 </div></foreignObject>
 <text x="70" y="590" fill="#949ba4"
 font-family="Arial" font-size="22">${esc(e.footer)}</text>
</svg>`);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY)
  });
});

app.listen(PORT, () => {
  console.log("Embed Studio iniciado en el puerto " + PORT);
});
