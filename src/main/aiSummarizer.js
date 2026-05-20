const PROVIDER_PRESETS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    model: 'claude-sonnet-4-20250514',
    baseUrl: 'https://api.anthropic.com/v1/messages',
  },
  openai: {
    name: 'OpenAI (GPT)',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  deepseek: {
    name: 'DeepSeek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  zhipu: {
    name: '智谱 GLM',
    model: 'glm-4-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  },
  qwen: {
    name: '通义千问 (Qwen)',
    model: 'qwen-turbo',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  },
  kimi: {
    name: '月之暗面 (Kimi)',
    model: 'moonshot-v1-8k',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
  },
  doubao: {
    name: '豆包 (Doubao)',
    model: 'doubao-lite-128k',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  },
};

const MAX_ANSWER_LENGTH = 8000;
const TIMEOUT_MS = 30000;

function isAnthropicEndpoint(baseUrl) {
  return baseUrl && baseUrl.includes('api.anthropic.com');
}

async function summarizeQA({ question, answer, config }) {
  const apiKey = config && config.apiKey;
  const model = (config && config.model) || 'gpt-4o';
  const baseUrl = (config && config.baseUrl) || '';

  if (!apiKey) {
    return { error: 'Please configure an API key in Settings' };
  }
  if (!baseUrl) {
    return { error: 'Please configure a Base URL in Settings' };
  }

  const truncatedAnswer = answer.length > MAX_ANSWER_LENGTH
    ? answer.slice(0, MAX_ANSWER_LENGTH) + '\n...[truncated]'
    : answer;

  const systemPrompt = 'You are a note-taking assistant. Summarize terminal Q&A interactions into concise learning notes.';

  const userPrompt = `Given this terminal interaction:
Question (command): ${question}
Answer (AI/tool output): ${truncatedAnswer}

Generate a learning note in JSON format with these fields:
- title: A concise descriptive title (max 60 characters)
- summary: 2-4 sentence summary of the most important learnings, insights, or solutions
- tags: 2-4 relevant keyword tags (e.g., "git", "react", "debugging", "cli")

Respond with ONLY valid JSON, no other text.`;

  let headers;
  let requestBody;

  if (isAnthropicEndpoint(baseUrl)) {
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
    requestBody = JSON.stringify({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } else {
    headers = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    };
    requestBody = JSON.stringify({
      model,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { error: 'Invalid API key. Check your key in Settings.' };
      }
      if (response.status === 429) {
        return { error: 'Rate limited. Wait a moment and try again.' };
      }
      const text = await response.text().catch(() => '');
      return { error: 'API error (HTTP ' + response.status + '): ' + (text || response.statusText) };
    }

    const data = await response.json();

    let content;
    if (isAnthropicEndpoint(baseUrl)) {
      content = data.content && data.content[0] && data.content[0].text;
    } else {
      content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    }

    if (!content || !content.trim()) {
      return { error: 'Empty response from AI' };
    }

    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        title: String(parsed.title || '').slice(0, 60),
        summary: String(parsed.summary || parsed.title || content),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      };
    } catch (_parseErr) {
      return {
        title: (question || 'Note').slice(0, 60),
        summary: content.trim(),
        tags: [],
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'Request timed out after ' + TIMEOUT_MS / 1000 + 's' };
    }
    return { error: 'Network error: ' + (err.message || 'Unknown error') };
  }
}

module.exports = { summarizeQA, PROVIDER_PRESETS };
