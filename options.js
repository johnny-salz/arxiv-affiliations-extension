// options.js – saving/loading Gemini LLM key in chrome.storage.sync

document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('apiKey');
  const status = document.getElementById('status');
  const promptInput = document.getElementById('customPrompt');
  const promptStatus = document.getElementById('promptStatus');

  // --- Organizations ---
  const newOrgInput = document.getElementById('newOrg');
  const addOrgBtn = document.getElementById('addOrgBtn');
  const orgStatus = document.getElementById('orgStatus');
  const orgListElem = document.getElementById('orgList');

  // Default organizations (parsed and shortened for search)
  const defaultOrgs = [
    'baidu',
    'alibaba',
    'huawei',
    'tencent',
    'bytedance',
    'deepseek',
    'baai',
    'zhipu',
    'baichuan',
    '01.ai',
    'minimax',
    'moonshot',
    'inspur',
    'jd',
    'sensetime',
    'iflytek',
    'fudan',
    'shanghai ai lab',
    'qihoo',
    'meituan',
    'kunlun',
    '4paradigm',
    'air',
    'state key labs',
    'openai',
    'google',
    'anthropic',
    'meta',
    'microsoft',
    'amazon',
    'nvidia',
    'apple',
    'salesforce',
    'ibm',
    'mistral',
    'aleph alpha',
    'hugging face',
    'stability',
    'alan turing',
    'cohere',
    'mila',
    'ai21',
    'tii',
    'g42',
    'mbzuai',
    'sakana',
    'preferred networks',
    'naver',
    'kakao',
    'lg',
    'sarvam',
    'ai4bharat',
    'krutrim',
    'bunos',
    'data61',
    // ...add more as needed
  ];

  // Function to render the list of organizations
  function renderOrgs(orgs) {
    orgListElem.innerHTML = '';
    orgs.forEach((org, idx) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.marginBottom = '0.3em';
      li.textContent = org;
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Delete';
      delBtn.style.marginLeft = '0.7em';
      delBtn.style.background = '#e74c3c';
      delBtn.style.color = '#fff';
      delBtn.style.border = 'none';
      delBtn.style.borderRadius = '50%';
      delBtn.style.width = '1.7em';
      delBtn.style.height = '1.7em';
      delBtn.style.cursor = 'pointer';
      delBtn.onclick = async () => {
        const newOrgs = orgs.filter((_, i) => i !== idx);
        await chrome.storage.sync.set({ orgs: newOrgs });
        renderOrgs(newOrgs);
        orgStatus.textContent = 'Deleted';
        setTimeout(() => (orgStatus.textContent = ''), 1200);
      };
      li.appendChild(delBtn);
      orgListElem.appendChild(li);
    });
    if (orgs.length === 0) {
      orgListElem.innerHTML = '<li style="color:#888;">List is empty</li>';
    }
  }

  // Load saved data
  chrome.storage.sync.get(['apiKey', 'orgs']).then(({ apiKey, orgs }) => {
    if (apiKey) input.value = apiKey;
    let orgArr = orgs && Array.isArray(orgs) ? orgs : defaultOrgs.slice();
    // If no orgs in storage, save defaults immediately
    if (!orgs) chrome.storage.sync.set({ orgs: orgArr });
    renderOrgs(orgArr);
  });
  // Load custom prompt from local storage
  chrome.storage.local.get(['customPrompt']).then(({ customPrompt }) => {
    if (promptInput && typeof customPrompt === 'string') {
      promptInput.value = customPrompt;
    }
  });

  // Save API key
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const key = input.value.trim();
    await chrome.storage.sync.set({ apiKey: key });
    status.textContent = 'Saved';
    setTimeout(() => (status.textContent = ''), 1500);
  });

  // Save custom prompt
  if (promptInput) {
    document.getElementById('savePromptBtn').addEventListener('click', async () => {
      const prompt = promptInput.value.trim();
      await chrome.storage.local.set({ customPrompt: prompt });
      promptStatus.textContent = 'Saved';
      setTimeout(() => (promptStatus.textContent = ''), 1500);
    });
  }

  // Add new organization
  addOrgBtn.addEventListener('click', async () => {
    const newOrg = newOrgInput.value.trim();
    if (!newOrg) return;
    chrome.storage.sync.get(['orgs'], ({ orgs }) => {
      let orgList = orgs && Array.isArray(orgs) ? orgs : defaultOrgs.slice();
      if (!orgList.includes(newOrg)) {
        orgList.push(newOrg);
        chrome.storage.sync.set({ orgs: orgList }, () => {
          renderOrgs(orgList);
          orgStatus.textContent = 'Added';
          setTimeout(() => (orgStatus.textContent = ''), 1200);
        });
      } else {
        orgStatus.textContent = 'Already exists';
        setTimeout(() => (orgStatus.textContent = ''), 1200);
      }
      newOrgInput.value = '';
    });
  });
});
