// ============================================================================
// AEM-CONSEIL — Assistant IA (Edge Function Supabase)
// ----------------------------------------------------------------------------
// Reçoit l'historique de conversation du site et interroge l'API Claude
// (Anthropic) en gardant la clé côté serveur. Renvoie { reply }.
//
// Déploiement :
//   supabase functions deploy assistant --no-verify-jwt
// Secret requis (voir dashboard Supabase → Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY = sk-ant-...
// ============================================================================

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 800;          // plafond par réponse (maîtrise du coût)
const MAX_MESSAGES = 12;         // on ne garde que les derniers échanges
const MAX_CHARS = 4000;          // longueur max d'un message entrant

// Origines autorisées à appeler la fonction depuis le navigateur.
const ALLOWED_ORIGINS = [
  "https://aemconseil.eu",
  "https://www.aemconseil.eu",
  "http://localhost:8199",
  "http://localhost:8000",
];

const SYSTEM_PROMPT = `Tu es l'assistant virtuel du cabinet AEM-CONSEIL, cabinet de conseil et d'expertise comptable au service des entrepreneurs, TPE et PME en France.

TON RÔLE
- Répondre clairement, en français, aux questions sur la comptabilité, la fiscalité, la paie, la gestion et la création d'entreprise, ainsi que sur les services du cabinet.
- Style : professionnel, chaleureux, pédagogue, SANS jargon. Réponses concises (2 à 4 courts paragraphes maximum). Utilise le gras (**…**) avec parcimonie pour les points clés.

LE CABINET
- Services : expertise comptable (tenue, bilan, liasses), conseil & gestion (tableaux de bord, prévisionnels), paie & social (bulletins, DSN), fiscalité (TVA, optimisation), création d'entreprise (statut, formalités), accompagnement personnalisé avec interlocuteur dédié.
- Le premier rendez-vous est offert et sans engagement ; réponse sous 24 h.
- Tarifs indicatifs HT : micro-entreprise à partir de 140 €/mois, société (tenue) à partir de 250 €/mois, offre complète (compta + social + administratif) à partir de 450 €/mois. Toujours préciser que ce sont des estimations à personnaliser via un devis.
- Contact : e-mail aemconseil.sas@gmail.com, téléphone 06 65 90 83 25, horaires du lundi au vendredi 9h–18h.

RÈGLES IMPORTANTES
- Ne donne JAMAIS de conseil juridique, fiscal ou comptable définitif ni engageant : donne des informations générales et invite à un échange avec le cabinet pour une réponse adaptée à la situation précise.
- N'invente pas de chiffres, de délais ni de tarifs autres que ceux ci-dessus. En cas d'incertitude, propose de contacter le cabinet.
- Pour toute demande concrète (devis, prise en charge, rendez-vous), invite l'utilisateur à demander un devis gratuit ou à réserver le premier rendez-vous offert.
- Reste dans le périmètre du cabinet. Si la question est hors sujet, ramène poliment vers l'expertise comptable et les services d'AEM-CONSEIL.`;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    return json({ error: "not_configured" }, 500, origin);
  }

  let payload: { messages?: Array<{ role: string; content: string }> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400, origin);
  }

  // Nettoyage / validation des messages entrants.
  const raw = Array.isArray(payload.messages) ? payload.messages : [];
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return json({ error: "no_user_message" }, 400, origin);
  }

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("Anthropic error", resp.status, detail.slice(0, 500));
      return json({ error: "upstream_error", status: resp.status }, 502, origin);
    }

    const data = await resp.json();
    const reply = Array.isArray(data?.content)
      ? data.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim()
      : "";

    if (!reply) return json({ error: "empty_reply" }, 502, origin);
    return json({ reply }, 200, origin);
  } catch (e) {
    console.error("assistant fetch failed", e);
    return json({ error: "server_error" }, 500, origin);
  }
});
