/**
 * server/index.js
 * Lightweight HTTP server (zero dependencies) that:
 * 1. Serves static files from public/
 * 2. Provides /api/ai-decision endpoint calling CodeBuddy CLI
 * 3. Provides /api/models endpoint listing available models
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const url = require('url');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// MIME types
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Available models
const MODELS = [
  { id: 'deepseek-v3-2-volc', name: 'DeepSeek V3', icon: '🧠' },
  { id: 'kimi-k2.5', name: 'Kimi K2.5', icon: '🌙' },
  { id: 'hunyuan-2.0-thinking', name: '混元 2.0', icon: '🔥' },
  { id: 'glm-5.0', name: 'GLM-5.0', icon: '🤖' },
  { id: 'glm-4.7', name: 'GLM-4.7', icon: '⚡' },
  { id: 'minimax-m2.7', name: 'MiniMax M2.7', icon: '🎯' },
  { id: 'minimax-m2.5', name: 'MiniMax M2.5', icon: '💫' },
  { id: 'glm-5.0-turbo', name: 'GLM-5.0 Turbo', icon: '🚀' },
];

// JSON Schema for structured AI output
const AI_DECISION_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['move_forward', 'move_backward', 'rotate_left', 'rotate_right', 'fire', 'wait'],
    },
    thought: {
      type: 'string',
      description: 'Brief reasoning in Chinese, under 30 characters',
    },
  },
  required: ['action', 'thought'],
});

/**
 * Call CodeBuddy CLI with a specific model and prompt
 * Uses --json-schema for structured output when possible
 */
function callCodeBuddy(model, prompt, useSchema = true) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--model', model,
      '--output-format', 'text',
      '--max-turns', '1',
      '--tools', '',
    ];

    // Add JSON schema for structured output
    if (useSchema) {
      args.push('--json-schema', AI_DECISION_SCHEMA);
    }

    args.push(prompt);

    let stdout = '';
    let stderr = '';
    const child = spawn('codebuddy', args, {
      timeout: 60000,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        console.error(`[CodeBuddy ${model}] Exit code: ${code}`);
        if (stderr) console.error(`[CodeBuddy ${model}] Stderr:`, stderr.substring(0, 300));
        reject(new Error(`CodeBuddy exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.on('error', (err) => {
      reject(new Error(`CodeBuddy spawn error: ${err.message}`));
    });
  });
}

/**
 * Parse JSON from LLM response (handles various formats)
 */
function parseAIResponse(text) {
  // Try direct JSON parse
  try {
    return JSON.parse(text);
  } catch (e) {}

  // Try extracting from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e) {}
    const fixed = fixJson(jsonMatch[1].trim());
    try { return JSON.parse(fixed); } catch (e) {}
  }

  // Try finding JSON object in text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch (e) {}
    const fixed = fixJson(objMatch[0]);
    try { return JSON.parse(fixed); } catch (e) {}
  }

  // Last resort: regex extraction
  const actionMatch = text.match(/["']?action["']?\s*[:=]\s*["'](\w+)["']/i);
  const thoughtMatch = text.match(/["']?thought["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (actionMatch) {
    return {
      action: actionMatch[1],
      thought: thoughtMatch ? thoughtMatch[1] : '...',
    };
  }

  return null;
}

/**
 * Fix common JSON issues from LLM output
 */
function fixJson(str) {
  let fixed = str.replace(/"\s*\n\s*"/g, '",\n"');
  fixed = fixed.replace(/}\s*\n\s*{/g, '},\n{');
  fixed = fixed.replace(/]\s*\n\s*\[/g, '],\n[');
  fixed = fixed.replace(/(true|false|null|\d+)\s*\n\s*"/g, '$1,\n"');
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');
  return fixed;
}

/**
 * Build the prompt for the AI (shortened for speed)
 */
function buildPrompt(gameState, playerId) {
  const me = gameState.tanks[playerId];
  const enemyId = playerId === 'red' ? 'blue' : 'red';
  const enemy = gameState.tanks[enemyId];

  return `Tank battle game. You are ${playerId}.
Map: ${gameState.mapWidth}x${gameState.mapHeight}, Round: ${gameState.round}/${gameState.maxRounds}
YOU: pos(${me.x},${me.y}) angle=${me.angle}° HP=${me.hp}/${me.maxHp} canFire=${me.canFire}
ENEMY: pos(${enemy.x},${enemy.y}) HP=${enemy.hp}/${enemy.maxHp}
Distance=${gameState.distance} AngleToEnemy=${gameState.angleToEnemy}° NeedRotate=${gameState.angleDiff > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(gameState.angleDiff).toFixed(0)}°
LineOfSight=${gameState.lineOfSight ? 'CLEAR' : 'BLOCKED'}
Obstacles: ${gameState.obstacles.map(o => `${o.type}(${o.x},${o.y})`).join(', ')}
Bullets: ${gameState.bullets.length > 0 ? gameState.bullets.map(b => `${b.owner}(${b.x},${b.y})@${b.angle}°`).join(', ') : 'None'}

Actions: move_forward(30px), move_backward(30px), rotate_left(30°), rotate_right(30°), fire(if canFire), wait
Rules: bullet=20dmg, brick walls break, steel walls reflect.

Reply ONLY JSON: {"action":"chosen_action","thought":"brief Chinese reason <30chars"}`;
}

/**
 * Sanitize and validate AI decision
 */
function sanitizeDecision(parsed, gameState, playerId) {
  const validActions = ['move_forward', 'move_backward', 'rotate_left', 'rotate_right', 'fire', 'wait'];
  let action = parsed.action || 'wait';

  if (!validActions.includes(action)) {
    action = 'wait';
  }

  // Can't fire if on cooldown
  const me = gameState.tanks[playerId];
  if (action === 'fire' && !me.canFire) {
    action = 'wait';
  }

  return {
    action,
    thought: (parsed.thought || '...').substring(0, 50),
  };
}

/**
 * Fallback decision when AI fails
 */
function generateFallbackDecision() {
  const actions = ['move_forward', 'rotate_left', 'rotate_right'];
  return {
    action: actions[Math.floor(Math.random() * actions.length)],
    thought: '[AI离线] 随机行动',
  };
}

/**
 * Handle AI decision request (single)
 */
async function handleAIDecision(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { model, gameState, playerId } = JSON.parse(body);

      const prompt = buildPrompt(gameState, playerId);
      const startTime = Date.now();
      console.log(`\n[Round ${gameState.round}] Requesting ${model} for ${playerId}...`);

      let rawResponse;
      let parsed;
      let parseMethod = 'none';

      console.log(`[${model}] Prompt:\n${prompt}`);

      // Try with JSON schema first, fallback to plain text
      try {
        rawResponse = await callCodeBuddy(model, prompt, true);
        console.log(`[${model}] Raw response:\n${rawResponse}`);
        parsed = parseAIResponse(rawResponse);
        if (parsed) parseMethod = 'schema';
      } catch (schemaErr) {
        console.warn(`[${model}] Schema mode failed, retrying without schema...`);
        try {
          rawResponse = await callCodeBuddy(model, prompt, false);
          console.log(`[${model}] Fallback response:\n${rawResponse}`);
          parsed = parseAIResponse(rawResponse);
          if (parsed) parseMethod = 'fallback';
        } catch (fallbackErr) {
          throw fallbackErr;
        }
      }

      const elapsed = Date.now() - startTime;

      if (!parsed) {
        throw new Error('Failed to parse AI response as JSON');
      }

      const decision = sanitizeDecision(parsed, gameState, playerId);
      console.log(`[${model}] Decision: ${decision.action} - ${decision.thought} (${elapsed}ms)`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        decision,
        detail: {
          raw: rawResponse.substring(0, 800),
          elapsed,
          parseMethod,
          model,
          playerId,
        },
      }));

    } catch (err) {
      const elapsed = Date.now() - (Date.now()); // fallback
      console.error('[AI Decision Error]', err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: err.message,
        decision: generateFallbackDecision(),
        detail: {
          raw: '',
          elapsed: 0,
          parseMethod: 'fallback_random',
          error: err.message,
        },
      }));
    }
  });
}

/**
 * Handle batch AI decision request (parallel red + blue)
 */
async function handleAIDecisionBatch(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { requests } = JSON.parse(body);
      // requests is an array of { model, gameState, playerId }

      const results = await Promise.all(requests.map(async (r) => {
        const { model, gameState, playerId } = r;
        const prompt = buildPrompt(gameState, playerId);
        const startTime = Date.now();
        console.log(`\n[Round ${gameState.round}] Requesting ${model} for ${playerId}...`);

        let rawResponse = '';
        let parsed = null;
        let parseMethod = 'none';
        let error = null;

        console.log(`[${model}] Prompt:\n${prompt}`);

        try {
          rawResponse = await callCodeBuddy(model, prompt, true);
          console.log(`[${model}] Raw response:\n${rawResponse}`);
          parsed = parseAIResponse(rawResponse);
          if (parsed) parseMethod = 'schema';
        } catch (schemaErr) {
          console.warn(`[${model}] Schema mode failed, retrying without schema...`);
          try {
            rawResponse = await callCodeBuddy(model, prompt, false);
            console.log(`[${model}] Fallback response:\n${rawResponse}`);
            parsed = parseAIResponse(rawResponse);
            if (parsed) parseMethod = 'fallback';
          } catch (fallbackErr) {
            error = fallbackErr.message;
          }
        }

        const elapsed = Date.now() - startTime;

        if (!parsed) {
          const fallback = generateFallbackDecision();
          console.error(`[AI Decision Error] ${model}: ${error || 'parse failed'} (${elapsed}ms)`);
          return {
            success: false,
            playerId,
            decision: fallback,
            detail: {
              raw: rawResponse.substring(0, 800),
              elapsed,
              parseMethod: 'fallback_random',
              model,
              playerId,
              error: error || 'Failed to parse AI response',
            },
          };
        }

        const decision = sanitizeDecision(parsed, gameState, playerId);
        console.log(`[${model}] Decision: ${decision.action} - ${decision.thought} (${elapsed}ms)`);

        return {
          success: true,
          playerId,
          decision,
          detail: {
            raw: rawResponse.substring(0, 800),
            elapsed,
            parseMethod,
            model,
            playerId,
          },
        };
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results }));

    } catch (err) {
      console.error('[Batch AI Decision Error]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * Serve static files
 */
function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Create server
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/api/ai-decision' && req.method === 'POST') {
    handleAIDecision(req, res);
  } else if (parsedUrl.pathname === '/api/ai-decision-batch' && req.method === 'POST') {
    handleAIDecisionBatch(req, res);
  } else if (parsedUrl.pathname === '/api/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: MODELS }));
  } else if (parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║     🎮  AI Tank Battle Server  🎮       ║
║                                          ║
║  Open: http://localhost:${PORT}              ║
║                                          ║
║  Using CodeBuddy CLI for AI decisions    ║
║  Supported models:                       ║
║    - deepseek-v3-2-volc (DeepSeek V3)   ║
║    - kimi-k2.5 (Kimi)                   ║
║    - hunyuan-2.0-thinking (混元)         ║
║    - glm-5.0 / glm-4.7 (GLM)           ║
║    - minimax-m2.7 / m2.5 (MiniMax)      ║
╚══════════════════════════════════════════╝
  `);
});
