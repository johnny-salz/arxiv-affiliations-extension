const seenCitationLinks = new WeakSet();

scanGoogleResults();
new MutationObserver(scanGoogleResults).observe(document.body, { childList: true, subtree: true });

function scanGoogleResults() {
    for (const node of document.querySelectorAll("a")) {
        if (/^Cited by \d+$/i.test(node.textContent.trim())) prepareCitationLinkOnce(node);
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const textNode of textNodes) {
        if (textNode.parentElement.closest("a") || !/Cited by \d+/i.test(textNode.data)) continue;
        const match = textNode.data.match(/Cited by \d+/i);
        const link = document.createElement("a");
        link.textContent = match[0];
        const before = textNode.data.slice(0, match.index);
        const after = textNode.data.slice(match.index + match[0].length);
        const fragment = document.createDocumentFragment();
        if (before) fragment.append(before);
        fragment.append(link);
        if (after) fragment.append(after);
        textNode.replaceWith(fragment);
        prepareCitationLinkOnce(link);
    }
}

function prepareCitationLinkOnce(link) {
    if (seenCitationLinks.has(link)) return;
    seenCitationLinks.add(link);
    prepareCitationLink(link);
}

async function prepareCitationLink(link) {
    let result = link.parentElement;
    for (let depth = 0; result && depth < 8; depth++, result = result.parentElement) {
        if (result.querySelector("h3")) break;
    }
    const title = result?.querySelector("h3")?.textContent?.trim();
    const resultUrl = result?.querySelector('a[href^="http"]:not([href*="google."])')?.href;
    if (!title) return;

    link.dataset.scholarState = "loading";
    link.title = "Finding Google Scholar citation page...";
    link.addEventListener("click", event => {
        if (link.dataset.scholarState === "loading") event.preventDefault();
    });

    try {
        const answer = await chrome.runtime.sendMessage({
            type: "findScholarCitations",
            title,
            sourceUrl: resultUrl || ""
        });
        if (!answer?.url) throw new Error(answer?.error || "No Scholar URL");
        link.href = answer.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.dataset.scholarState = "ready";
        link.title = "Open Google Scholar citations";
    } catch (error) {
        console.warn("ArXiv Affiliations: Scholar lookup failed", error);
        link.dataset.scholarState = "failed";
        link.title = "Google Scholar citation page not found";
    }
}
