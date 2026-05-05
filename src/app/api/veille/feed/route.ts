import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";

interface FeedArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

// Sources RSS vérifiées (mai 2026). L'ancien flux Ministère du Travail
// (travail-emploi.gouv.fr/feed) renvoyait du HTML — site refondu sans
// alternative RSS. Remplacé par France Compétences + CP Formation qui
// couvrent l'actu OF/Qualiopi/CPF/OPCO.
const FEEDS = [
  { url: "https://www.centre-inffo.fr/feed", source: "Centre Inffo" },
  { url: "https://www.francecompetences.fr/feed/", source: "France Compétences" },
  { url: "https://www.cpformation.com/feed/", source: "CP Formation" },
];

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return "";
  const raw = (match[1] ?? match[2] ?? "").trim();
  return raw.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

function parseRss(xml: string, source: string, limit: number): FeedArticle[] {
  const articles: FeedArticle[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  for (const item of items.slice(0, limit)) {
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const pubDate = extractTag(item, "pubDate");
    const description = extractTag(item, "description");

    if (title) {
      articles.push({ title, link, pubDate, description, source });
    }
  }

  return articles;
}

interface FeedFetchResult {
  source: string;
  articles: FeedArticle[];
  error?: string;
}

async function fetchFeed(url: string, source: string): Promise<FeedFetchResult> {
  // Timeout 10s : Netlify cold-start + serveurs gov peuvent être lents
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // UA réel — certains sites filtrent les bots avec UA "Bot" custom
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });

    if (!res.ok) {
      return { source, articles: [], error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") || "";
    const xml = await res.text();

    // Détecte le cas où le serveur renvoie du HTML (site refondu, URL morte
    // qui redirige vers une page 404 stylisée). Sinon on parse du HTML
    // comme du RSS et on retourne 0 article silencieusement.
    if (!contentType.includes("xml") && !xml.trimStart().startsWith("<?xml") && !xml.includes("<rss")) {
      return { source, articles: [], error: `Réponse non-RSS (${contentType.split(";")[0] || "html"})` };
    }

    const articles = parseRss(xml, source, 5);
    return { source, articles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur réseau";
    return { source, articles: [], error: msg.includes("aborted") ? "Timeout 10s" : msg };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const results = await Promise.allSettled(
      FEEDS.map((f) => fetchFeed(f.url, f.source))
    );

    const articles: FeedArticle[] = [];
    const sourceStatus: Array<{ source: string; ok: boolean; error?: string; count: number }> = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const feed = FEEDS[i];
      if (r.status === "fulfilled") {
        articles.push(...r.value.articles);
        sourceStatus.push({
          source: feed.source,
          ok: !r.value.error,
          error: r.value.error,
          count: r.value.articles.length,
        });
      } else {
        sourceStatus.push({
          source: feed.source,
          ok: false,
          error: r.reason instanceof Error ? r.reason.message : "Promise rejected",
          count: 0,
        });
      }
    }

    articles.sort((a, b) => {
      const da = new Date(a.pubDate).getTime() || 0;
      const db = new Date(b.pubDate).getTime() || 0;
      return db - da;
    });

    return NextResponse.json({ articles, sources: sourceStatus });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "veille feed GET"), articles: [], sources: [] },
      { status: 500 }
    );
  }
}
