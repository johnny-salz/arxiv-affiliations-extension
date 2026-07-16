const scholarHost = "https://scholar.google.com/";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "findScholarCitations") return;

    findScholarCitations(message.title, message.arxivUrl)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));

    return true;
});

async function findScholarCitations(title, arxivUrl) {
    const query = arxivUrl ? `${title} ${arxivUrl}` : title;
    const url = `${scholarHost}scholar?hl=en&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`Scholar search failed: ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const wantedTitle = normalize(title);
    const results = [...doc.querySelectorAll(".gs_ri")];
    const result = results.find(item => {
        const resultTitle = normalize(item.querySelector(".gs_rt")?.textContent ?? "");
        return resultTitle === wantedTitle || resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle);
    });
    const citationHref = result?.querySelector('a[href*="cites="]')?.getAttribute("href");
    if (!citationHref) throw new Error("No Scholar citation link found");

    return { url: new URL(citationHref, scholarHost).href };
}

function normalize(value) {
    return value.toLowerCase().replace(/^\s*\[[^\]]+\]\s*/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
