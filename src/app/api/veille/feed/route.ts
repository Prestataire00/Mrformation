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

const FEEDS = [
  { url: "https://www.centre-inffo.fr/feed", source: "Centre Inffo" },
  { url: "https://travail-emploi.gouv.fr/feed", source: "Ministère du Travail" },
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

async function fetchFeed(url: string, source: string): Promise<FeedArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LMSBot/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!res.ok) return [];

    const xml = await res.text();
    return parseRss(xml, source, 5);
  } catch {
    return [];
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
    for (const result of results) {
      if (result.status === "fulfilled") {
        articles.push(...result.value);
      }
    }

    articles.sort((a, b) => {
      const da = new Date(a.pubDate).getTime() || 0;
      const db = new Date(b.pubDate).getTime() || 0;
      return db - da;
    });

    return NextResponse.json({ articles });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "veille feed GET"), articles: [] },
      { status: 500 }
    );
  }
}
