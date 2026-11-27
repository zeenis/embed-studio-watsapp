const express = require("express");
const crypto = require("crypto");
const sharp = require("sharp");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

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

function escapeXml(v) {
  return String(v || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&apos;"
  })[c]);
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }

  if (lines.length < maxLines && line) lines.push(line);
  const used = lines.join(" ").length;
  if (used < String(value || "").length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:!?]?$/, "…");
  }
  return lines;
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
  const rows = await db(`embeds?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] || null;
}

function publicBase(req) {
  return (process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

async function makePreviewPng(embed) {
  const width = 1200;
  const height = 630;
  let background;

  // Si el usuario añadió una imagen, se utiliza como fondo de la tarjeta.
  if (embed.image && /^https:\/\//i.test(embed.image)) {
    try {
      const response = await fetch(embed.image, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "EmbedStudioPreview/1.0" }
      });
      const type = response.headers.get("content-type") || "";
      const size = Number(response.headers.get("content-length") || 0);

      if (response.ok && type.startsWith("image/") && (!size || size < 8 * 1024 * 1024)) {
        const input = Buffer.from(await response.arrayBuffer());
        if (input.length < 8 * 1024 * 1024) {
          background = await sharp(input, { limitInputPixels: 40000000 })
            .rotate()
            .resize(width, height, { fit: "cover", position: "attention" })
            .jpeg({ quality: 88 })
            .toBuffer();
        }
      }
    } catch (error) {
      console.warn("No se pudo cargar la imagen del embed:", error.message);
    }
  }

  // Fondo alternativo si no hay imagen o no se puede descargar.
  if (!background) {
    const fallback = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#30344f"/>
            <stop offset="1" stop-color="#15161b"/>
          </linearGradient>
          <radialGradient id="glow">
            <stop offset="0" stop-color="${color(embed.color)}" stop-opacity=".55"/>
            <stop offset="1" stop-color="${color(embed.color)}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#bg)"/>
        <ellipse cx="980" cy="80" rx="520" ry="420" fill="url(#glow)"/>
        <circle cx="1080" cy="540" r="220" fill="${color(embed.color)}" opacity=".12"/>
      </svg>`);
    background = await sharp(fallback).png().toBuffer();
  }

  const titleLines = wrapText(embed.title || "Embed", 34, 2);
  const descriptionLines = wrapText(embed.description || "", 66, 3);
  const titleSvg = titleLines.map((line, i) =>
    `<text x="76" y="${390 + i * 64}" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`
  ).join("");
  const descriptionStart = 485 + Math.max(0, titleLines.length - 1) * 4;
  const descriptionSvg = descriptionLines.map((line, i) =>
    `<text x="80" y="${descriptionStart + i * 38}" font-family="Arial, sans-serif" font-size="27" fill="#f1f2f5">${escapeXml(line)}</text>`
  ).join("");

  const overlay = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity=".05"/>
          <stop offset=".38" stop-color="#000000" stop-opacity=".22"/>
          <stop offset="1" stop-color="#000000" stop-opacity=".88"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#shade)"/>
      <rect x="0" y="0" width="12" height="630" fill="${color(embed.color)}"/>
      ${embed.author ? `<text x="80" y="315" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="2" fill="#ffffff">${escapeXml(embed.author.toUpperCase())}</text>` : ""}
      ${titleSvg}
      ${descriptionSvg}
      ${embed.footer ? `<text x="80" y="595" font-family="Arial, sans-serif" font-size="19" fill="#d5d7dc">${escapeXml(embed.footer)}</text>` : ""}
    </svg>`);

  return sharp(background)
    .composite([{ input: overlay }])
    .png()
    .toBuffer();
}

// Crear embed
app.post("/api/embeds", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: "Supabase no configurado" });
  }

  const title = clean(req.body.title, 100);
  const description = clean(req.body.description, 500);
  const image = clean(req.body.image, 1000);

  if (!title) return res.status(400).json({ error: "Falta el título" });

  if (image && !/^https:\/\//i.test(image)) {
    return res.status(400).json({ error: "La imagen necesita una URL HTTPS" });
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
      url: `${publicBase(req)}/e/${embed.id}`
    });
  } catch {
    res.status(500).json({ error: "No se pudo guardar el embed" });
  }
});

// Página pública y metadatos Open Graph para WhatsApp
app.get("/e/:id", async (req, res) => {
  let embed;

  try {
    embed = await getEmbed(req.params.id);
  } catch {
    return res.status(500).send("Error al cargar el embed");
  }

  if (!embed) return res.status(404).send("Embed no encontrado");

  const base = publicBase(req);
  const title = escapeHtml(embed.title);
  const description = escapeHtml(embed.description);
  const url = `${base}${req.originalUrl}`;
  const imageUrl = `${base}/preview/${embed.id}.png`;

  res.set("Cache-Control", "public, max-age=300");
  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Embed Studio">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
<img src="${escapeHtml(imageUrl)}" alt="">
</body>
</html>`);
});

// Imagen PNG grande (1200 x 630) utilizada por WhatsApp
app.get("/preview/:id.png", async (req, res) => {
  try {
    const embed = await getEmbed(req.params.id);
    if (!embed) return res.status(404).end();

    const png = await makePreviewPng(embed);
    res.set({
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff"
    });
    res.send(png);
  } catch (error) {
    console.error("Error generando PNG:", error);
    res.status(500).send("No se pudo generar la imagen");
  }
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
