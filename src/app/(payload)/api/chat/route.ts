import { NextResponse } from 'next/server';

import { allowedOrigins } from '../../../../lib/allowed-origins';
import { NASTY_SYSTEM_PROMPT } from '../../../../lib/nasty';
import { isRateLimited } from '../../../../lib/rate-limit';

const ALLOWED_ORIGINS = allowedOrigins();

function corsHeaders(requestOrigin: string | null) {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip, 15, 60_000)) {
    return NextResponse.json(
      { error: 'Trop de messages envoyés. Merci de patienter une minute avant de réessayer.' },
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        reply:
          "Bonjour, je suis NASTY ! Mon accès aux réponses intelligentes n'est pas encore activé par l'équipe du site. " +
          'En attendant, vous pouvez joindre le CRN au +241 62 70 51 83 (appel ou WhatsApp) ou contact@crn-convention2026.events.',
      },
      { headers: corsHeaders(origin) },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400, headers: corsHeaders(origin) });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'Message manquant.' }, { status: 400, headers: corsHeaders(origin) });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 400,
        system: NASTY_SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic API error', res.status, detail);
      return NextResponse.json(
        { reply: "Désolée, je rencontre une difficulté technique passagère. Réessayez dans un instant, ou contactez-nous au +241 62 70 51 83 (appel ou WhatsApp)." },
        { headers: corsHeaders(origin) },
      );
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const reply = data.content?.find((b) => b.type === 'text')?.text?.trim() || 'Je suis désolée, je n’ai pas de réponse pour le moment.';

    return NextResponse.json({ reply }, { headers: corsHeaders(origin) });
  } catch (err) {
    console.error('Chat route error', err);
    return NextResponse.json(
      { reply: "Désolée, je rencontre une difficulté technique passagère. Réessayez dans un instant." },
      { headers: corsHeaders(origin) },
    );
  }
}
