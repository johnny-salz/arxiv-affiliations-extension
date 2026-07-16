const scholarHost = "https://scholar.google.com/";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "findScholarCitations") return;

    findScholarCitations(message.title, message.sourceUrl)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));

    return true;
});

async function findScholarCitations(title, sourceUrl) {
    const query = sourceUrl ? `${title} ${sourceUrl}` : title;
    const url = `${scholarHost}scholar?hl=en&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`Scholar search failed: ${response.status}`);

    const html = await response.text();
    const wantedTitle = normalize(title);
    const resultPattern = /<div[^>]+class=["'][^"']*gs_ri[^"']*["'][\s\S]*?<h3[^>]*class=["'][^"']*gs_rt[^"']*["'][^>]*>([\s\S]*?)<\/h3>[\s\S]*?<a[^>]+href=["']([^"']*cites=[^"']*)["'][^>]*>\s*Cited by\s+\d+/gi;
    let match;
    let citationHref;
    while ((match = resultPattern.exec(html))) {
        const resultTitle = normalize(match[1]);
        if (resultTitle === wantedTitle || resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle)) {
            citationHref = decodeHtml(match[2]);
            break;
        }
    }
    if (!citationHref) throw new Error("No Scholar citation link found");

    return { url: new URL(citationHref, scholarHost).href };
}

function normalize(value) {
    return decodeHtml(value).replace(/<[^>]*>/g, " ").toLowerCase().replace(/^\s*\[[^\]]+\]\s*/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function decodeHtml(value) {
    return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}
