// content.js – displays the "Affiliations" block in the same format as "Authors"
// Works on /abs/<id> pages.

console.log("Content.js: script loaded.");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DEFAULT_PROMPT = `List unique (i.e. only non-duplicated affiliations) author affiliations found in the following fragment of the first page of an arXiv paper. Only pay attention to the organizations relevant to the list of authors, not mentioned elsewhere. Return only organization names, no department or specialization. Prefix the reply with emoji flags of countries for organizations you are aware of their home country. Sort by perceived importance (relevance, fame) first. If the text doesn't contain any relevant organizations just return nothing, do not try to imagine supposed affiliations. Return one affiliation per line:\n\n`;

function renderAffiliations(container, lines, orgList, className = "affiliations flag-text") {
  const affDiv = document.createElement("div");
  affDiv.className = className;
  const label = document.createElement("span");
  label.className = "descriptor";
  label.textContent = "Affiliations:";
  affDiv.append(label);
  const orgRegexes = orgList.map(org => new RegExp(org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  lines.slice(0, 10).forEach((aff, idx) => {
    const span = document.createElement("span");
    span.textContent = ` ${aff}`;
    if (orgRegexes.some(re => re.test(aff))) {
      span.style.background = "#ffe600";
      span.style.fontWeight = "bold";
    }
    affDiv.append(span);
    if (idx !== Math.min(lines.length, 10) - 1) affDiv.append(document.createTextNode(","));
  });
  container.insertAdjacentElement("afterend", affDiv);
}

function createFloatingStatusBar() {
  const bar = document.createElement('div');
  bar.id = 'affiliations-status-bar';
  bar.style.cssText = `
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 9999;
    background: rgba(30, 30, 40, 0.95);
    color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.18);
    padding: 14px 24px 18px 24px;
    min-width: 320px;
    font-size: 15px;
    text-align: center;
    pointer-events: auto;
  `;
  bar.innerHTML = `
    <button id="aff-status-close" style="position:absolute;top:6px;right:10px;background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;">&times;</button>
    <div style="margin-bottom: 6px;">
      <span id="aff-status-total"></span> |
      <span id="aff-status-current"></span> |
      <span id="aff-status-cached"></span>
    </div>
    <div id="aff-status-message" style="margin-bottom: 8px; font-size: 14px;"></div>
    <div style="width: 100%; height: 8px; background: #222; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
      <div id="aff-status-progress" style="height: 100%; width: 0; background: linear-gradient(90deg,#1976d2,#00c6fb); transition: width 0.2s;"></div>
    </div>
    <button id="aff-status-abort" style="margin-top: 4px; padding: 4px 16px; border-radius: 4px; border: none; background: #e74c3c; color: #fff; font-size: 14px; cursor: pointer;">Abort</button>
  `;
  document.body.appendChild(bar);
  document.getElementById('aff-status-close').onclick = () => bar.remove();
  return bar;
}

function updateFloatingStatusBar({ total, current, cached, status, progress, timeoutLeft }) {
  document.getElementById('aff-status-total').textContent = `Total: ${total}`;
  document.getElementById('aff-status-current').textContent = `Processing: ${current} / ${total}`;
  document.getElementById('aff-status-cached').textContent = `Cached: ${cached}`;
  let msg = '';
  if (status === 'processing') msg = 'Processing...';
  else if (status === 'timeout') msg = `Waiting for timeout (${timeoutLeft}s left)...`;
  else if (status === 'finished') msg = 'Finished!';
  else if (status === 'aborted') msg = 'Aborted.';
  else msg = status;
  document.getElementById('aff-status-message').textContent = msg;
  document.getElementById('aff-status-progress').style.width = `${Math.round(progress * 100)}%`;
  let hint = document.getElementById('aff-status-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'aff-status-hint';
    hint.style.cssText = 'margin-top:6px;font-size:13px;color:#ffe600;';
    document.getElementById('affiliations-status-bar').appendChild(hint);
  }
  if (status === 'timeout') {
    hint.textContent = 'Waiting for too long? Use paid Gemini key, should be faster.';
    hint.style.display = '';
  } else {
    hint.textContent = '';
    hint.style.display = 'none';
  }
}

function removeFloatingStatusBar() {
  document.getElementById('affiliations-status-bar')?.remove();
}

(async () => {
  try {
    // 1) Detect if we are on a list page or abs page
    if (location.pathname.match(/^\/abs\//)) {
      // 1) Check that we are on the /abs/<id> page
      const m = location.pathname.match(/^\/abs\/([^/?#]+)/);
      if (!m) return;
      const id = m[1];

      // Create a loading indicator
      // Find the insertion point – right after the authors block
      const authorsDiv = document.querySelector("div.authors");
      if (!authorsDiv) {
        console.error("Content.js: authorsDiv not found.");
        return;
      }
      document.querySelector("div.affiliations")?.remove();
      document.querySelector("div.affiliations-loading")?.remove();
      // affiliations cache check FIRST
      const cache = (await chrome.storage.local.get(["affiliationsCache"]))?.affiliationsCache || {};
      if (cache[id]) {
        // Render from cache
        const { orgs } = await chrome.storage.sync.get(["orgs"]);
        const orgList = orgs && Array.isArray(orgs) && orgs.length ? orgs : defaultOrgs;
        renderAffiliations(authorsDiv, cache[id], orgList, authorsDiv.className + " affiliations flag-text");
        return;
      }
      // Remove any previous loading or affiliations block
      document.querySelector("div.affiliations")?.remove();
      document.querySelector("div.affiliations-loading")?.remove();

      // Create a loading div styled like affiliations
      const loadDiv = document.createElement("div");
      loadDiv.className = authorsDiv.className + " affiliations affiliations-loading flag-text";

      const loadingLabel = document.createElement("span");
      loadingLabel.className = "descriptor";
      loadingLabel.textContent = "Affiliations:";

      const loadingText = document.createElement("span");
      loadingText.textContent = " Loading affiliations… (it takes loading whole PDF and LLM request, so it may take a while)";

      loadDiv.append(loadingLabel, loadingText);

      authorsDiv.insertAdjacentElement("afterend", loadDiv);


      // 2) Download PDF (without .pdf to avoid extra redirects)
      const pdfUrl = `https://arxiv.org/pdf/${id}`;
      const pdfResp = await fetch(pdfUrl);
      const arrayBuffer = await pdfResp.arrayBuffer();

      // 3) Initialize PDF.js
      const pdfjsLib = await import(chrome.runtime.getURL("pdf.mjs"));
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs");

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(i => i.str).join(" ");

      console.log("Content.js: PDF page text extracted.\n", pageText);

      // 4) Gemini API key
      const { apiKey } = await chrome.storage.sync.get(["apiKey"]);
      if (!apiKey) {
        alert("🔑 Please specify Gemini API key in the extension settings.");
        return;
      }
      // 5) Get custom prompt from local storage, or use default
      let customPrompt = '';
      try {
        const customPromptObj = await chrome.storage.local.get(["customPrompt"]);
        if (customPromptObj && typeof customPromptObj.customPrompt === 'string' && customPromptObj.customPrompt.trim()) {
          customPrompt = customPromptObj.customPrompt.trim();
        }
      } catch (e) { /* ignore */ }
      const prompt = (customPrompt || DEFAULT_PROMPT) + pageText;

      // 5) Request to Gemini Flash 2.5
      const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
      const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent";
      const res = await fetch(`${endpoint}?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (res.status === 429) {
        let retryDelay = null;
        let isDailyQuota = false;
        let quotaMessage = '';
        try {
          const errorData = await res.json();
          const quotaFailure = errorData?.error?.details?.find(
            d => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure'
          );
          const violation = quotaFailure?.violations?.[0];
          if (violation?.quotaId === 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') {
            isDailyQuota = true;
            quotaMessage = 'Gemini API daily quota exceeded. Please check your plan and billing details or try again tomorrow.';
          }
          const retryInfo = errorData?.error?.details?.find(
            d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
          );
          if (retryInfo && retryInfo.retryDelay) {
            const match = retryInfo.retryDelay.match(/([\d.]+)s/);
            if (match) retryDelay = Math.ceil(parseFloat(match[1]) * 1000);
          }
        } catch (e) { /* ignore, fallback to old logic */ }
        if (isDailyQuota) {
          loadingText.textContent = quotaMessage;
          status = quotaMessage;
          aborted = true;
          quotaAborted = true;
          updateFloatingStatusBar({
            total: totalCount,
            current: processedCount,
            cached: cachedCount,
            status,
            progress: processedCount / totalCount,
            timeoutLeft: 0
          });
          return;
        }
        let wait = retryDelay !== null ? retryDelay : 30000;
        loadingText.textContent = `Gemini rate limit hit. Pausing for ${Math.ceil(wait / 1000)} seconds...`;
        await sleep(wait);
        loadingText.textContent = "Retrying...";
        return location.reload();
      }
      const data = await res.json();
      let lines = (data.candidates?.[0]?.content?.parts?.[0]?.text || "")
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      if (!lines.length) return;
      if (lines.length > 10) lines = lines.slice(0, 10);
      const { orgs } = await chrome.storage.sync.get(["orgs"]);
      const orgList = orgs && Array.isArray(orgs) && orgs.length ? orgs : defaultOrgs;
      renderAffiliations(authorsDiv, lines, orgList, authorsDiv.className + " affiliations flag-text");
      // Save to cache
      cache[id] = lines;
      await chrome.storage.local.set({ affiliationsCache: cache });
      return;
    } else if (location.pathname.match(/^\/list\/[^/]+\/(new|recent)/)) {
      // New logic for /list/*/new and /list/*/recent with parallel processing
      // save current time to calculate timeout later
      let windowStartTime = Date.now(); // <-- moved outside processPaper, shared for all
      const articlesDl = document.querySelector("#articles");
      if (!articlesDl) return;
      const dts = Array.from(articlesDl.querySelectorAll("dt"));
      const concurrency = 1;
      let idx = 0;
      // Floating status bar state
      let cachedCount = 0;
      let processedCount = 0;
      const totalCount = dts.length;
      let status = 'processing';
      let timeoutLeft = 0;
      let aborted = false;
      let quotaAborted = false;
      createFloatingStatusBar();
      document.getElementById('aff-status-abort').onclick = () => {
        aborted = true;
        status = 'aborted';
        updateFloatingStatusBar({
          total: totalCount,
          current: processedCount,
          cached: cachedCount,
          status,
          progress: processedCount / totalCount,
          timeoutLeft: 0
        });
      };
      document.getElementById('aff-status-close').onclick = () => {
        document.getElementById('affiliations-status-bar')?.remove();
      };
      updateFloatingStatusBar({
        total: totalCount,
        current: processedCount,
        cached: cachedCount,
        status,
        progress: 0,
        timeoutLeft: 0
      });
      async function processPaper(dt) {
        if (aborted) return;
        const pdfLink = dt.querySelector('a[href^="/pdf/"]');
        const absLink = dt.querySelector('a[href^="/abs/"]');
        if (!pdfLink || !absLink) return;
        const id = absLink.getAttribute("href").split("/").pop();
        const dd = dt.nextElementSibling;
        if (!dd) return;
        let affDiv = dd.querySelector(".affiliations");
        if (affDiv) affDiv.remove();
        let loadingDiv = document.createElement("div");
        loadingDiv.className = "affiliations affiliations-loading flag-text";
        let loadingLabel = document.createElement("span");
        loadingLabel.className = "descriptor";
        loadingLabel.textContent = "Affiliations:";
        let loadingText = document.createElement("span");
        loadingText.textContent = " Loading affiliations… (PDF+LLM)";
        loadingDiv.append(loadingLabel, loadingText);
        dd.prepend(loadingDiv);
        try {
          // affiliations cache check
          const cache = (await chrome.storage.local.get(["affiliationsCache"]))?.affiliationsCache || {};
          if (cache[id]) {
            // Render from cache
            loadingDiv.remove();
            const { orgs } = await chrome.storage.sync.get(["orgs"]);
            const orgList = orgs && Array.isArray(orgs) && orgs.length ? orgs : defaultOrgs;
            let insertAfter = dd.querySelector(".list-authors") || dd.querySelector(".meta") || dd;
            renderAffiliations(insertAfter, cache[id], orgList, insertAfter.className + " affiliations flag-text");
            cachedCount++;
            processedCount++;
            updateFloatingStatusBar({
              total: totalCount,
              current: processedCount,
              cached: cachedCount,
              status,
              progress: processedCount / totalCount,
              timeoutLeft
            });
            return;
          }

          let success = false;
          while (!success && !aborted) {
            const pdfUrl = `https://arxiv.org/pdf/${id}`;
            const pdfResp = await fetch(pdfUrl);
            const arrayBuffer = await pdfResp.arrayBuffer();
            const pdfjsLib = await import(chrome.runtime.getURL("pdf.mjs"));
            pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs");
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(i => i.str).join(" ");
            await page.cleanup();
            await pdf.destroy();
            const { apiKey } = await chrome.storage.sync.get(["apiKey"]);
            if (!apiKey) {
              loadingText.textContent = " No Gemini API key.";
              return;
            }
            // Get custom prompt from local storage, or use default
            let customPrompt = '';
            try {
              const customPromptObj = await chrome.storage.local.get(["customPrompt"]);
              if (customPromptObj && typeof customPromptObj.customPrompt === 'string' && customPromptObj.customPrompt.trim()) {
                customPrompt = customPromptObj.customPrompt.trim();
              }
            } catch (e) { /* ignore */ }
            const prompt = (customPrompt || DEFAULT_PROMPT) + pageText;

            const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
            const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent";
            const res = await fetch(`${endpoint}?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
            if (res.status === 429) {
              let retryDelay = null;
              let isDailyQuota = false;
              let quotaMessage = '';
              try {
                const errorData = await res.json();
                const quotaFailure = errorData?.error?.details?.find(
                  d => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure'
                );
                const violation = quotaFailure?.violations?.[0];
                if (violation?.quotaId === 'GenerateRequestsPerDayPerProjectPerModel-FreeTier') {
                  isDailyQuota = true;
                  quotaMessage = 'Gemini API daily quota exceeded. Please check your plan and billing details or try again tomorrow.';
                }
                const retryInfo = errorData?.error?.details?.find(
                  d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
                );
                if (retryInfo && retryInfo.retryDelay) {
                  const match = retryInfo.retryDelay.match(/([\d.]+)s/);
                  if (match) retryDelay = Math.ceil(parseFloat(match[1]) * 1000);
                }
              } catch (e) { /* ignore, fallback to old logic */ }
              if (isDailyQuota) {
                loadingText.textContent = quotaMessage;
                status = quotaMessage;
                aborted = true;
                quotaAborted = true;
                updateFloatingStatusBar({
                  total: totalCount,
                  current: processedCount,
                  cached: cachedCount,
                  status,
                  progress: processedCount / totalCount,
                  timeoutLeft: 0
                });
                return;
              }
              let wait = retryDelay !== null ? retryDelay : 30000;
              loadingText.textContent = `Gemini rate limit hit. Pausing for ${Math.ceil(wait / 1000)} seconds...`;
              await sleep(wait);
              loadingText.textContent = "Retrying...";
              return location.reload();
            }
            const data = await res.json();
            let lines = (data.candidates?.[0]?.content?.parts?.[0]?.text || "")
              .split(/\r?\n/)
              .map(s => s.trim())
              .filter(Boolean);
            if (!lines.length) {
              loadingText.textContent = " No affiliations found.";
              processedCount++;
              updateFloatingStatusBar({
                total: totalCount,
                current: processedCount,
                cached: cachedCount,
                status,
                progress: processedCount / totalCount,
                timeoutLeft
              });
              return;
            }
            if (lines.length > 10) lines = lines.slice(0, 10);
            loadingDiv.remove();
            const { orgs } = await chrome.storage.sync.get(["orgs"]);
            const orgList = orgs && Array.isArray(orgs) && orgs.length ? orgs : defaultOrgs;
            let insertAfter = dd.querySelector(".list-authors") || dd.querySelector(".meta") || dd;
            renderAffiliations(insertAfter, lines, orgList, insertAfter.className + " affiliations flag-text");
            // Save to cache after each successful request
            const cacheToUpdate = (await chrome.storage.local.get(["affiliationsCache"]))?.affiliationsCache || {};
            cacheToUpdate[id] = lines;
            await chrome.storage.local.set({ affiliationsCache: cacheToUpdate });
            processedCount++;
            updateFloatingStatusBar({
              total: totalCount,
              current: processedCount,
              cached: cachedCount,
              status,
              progress: processedCount / totalCount,
              timeoutLeft
            });
            success = true;
          }
        } catch (err) {
          loadingText.textContent = " Error loading affiliations.";
          console.error("Affiliations error for ", id, err);
        }
      }
      // Move runInBatches here so it can access 'aborted'
      async function runInBatches(tasks, batchSize) {
        let pos = 0;
        let running = [];
        while (pos < tasks.length || running.length) {
          if (aborted) break;
          while (running.length < batchSize && pos < tasks.length) {
            if (aborted) break;
            const p = tasks[pos++]();
            running.push(p);
            p.finally(() => {
              running = running.filter(x => x !== p);
            });
          }
          if (running.length) await Promise.race(running);
        }
      }
      // create task functions for each dt element
      const tasks = dts.map(dt => () => processPaper(dt));
      // run tasks in batches of `concurrency`
      await runInBatches(tasks, concurrency);
      if (!quotaAborted) {
        status = 'finished';
        updateFloatingStatusBar({
          total: totalCount,
          current: processedCount,
          cached: cachedCount,
          status,
          progress: 1,
          timeoutLeft: 0
        });
        setTimeout(removeFloatingStatusBar, 4000);
      }
      return;
    }
  } catch (e) {
    console.error("Content.js error:", e);
  }
})();
