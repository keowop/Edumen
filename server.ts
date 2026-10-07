import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { GoogleGenAI, Type } from '@google/genai'
import { EXPERTS, SESSIONS, THREADS, REPLIES, fmtWhen } from './src/data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  })
}

// In-memory backend store seeded with the app's dummy data
const store = {
  user: null,
  saved: [1],
  credits: 1500,
  prefs: { notif: true, lock: false },
  sessions: structuredClone(SESSIONS),
  threads: structuredClone(THREADS),
}

// Contextual fallback dummy replies per expert category when offline or no API key
const EXPERT_FALLBACKS = {
  Career: [
    'I would love to review your current role and target compensation. Share your resume highlights whenever you are ready!',
    'For leadership transitions, framing your 90-day impact story is key. We can map that out step-by-step in our session.',
    'Make sure to list your top 3 measurable wins from the last year—that gives us strong leverage for negotiation.',
  ],
  Business: [
    'Let us look closely at your unit economics and customer acquisition channels first. What is your current monthly burn?',
    'For seed stage decks, investors focus on team-market fit and early traction signals. Send over your key slides!',
    'Happy to dig into your GTM strategy. Are you focusing on B2B outbound or product-led growth right now?',
  ],
  Edu: [
    'Admissions committees love authentic personal narratives backed by consistent impact. Which programs are top of your list?',
    'We can structure your statement of purpose into a clear before-during-after arc during our call.',
    'Share your shortlist of universities and deadlines so we can prioritize your application milestones.',
  ],
  'Tech & IT': [
    'Could you share your current architecture bottlenecks and expected peak QPS? We can sketch out a scalable design.',
    'Let us review your database indexing and caching layer first—usually 80% of latency wins come from there.',
    'Sounds like a great systems challenge. Bring your service diagram and we will walk through trade-offs together.',
  ],
  Health: [
    'I can walk you through your lab values in plain language and help you prepare questions for your in-person doctor.',
    'Consistent sleep, hydration, and gradual routine adjustments make a big difference. Tell me what symptoms or reports you want to cover.',
    'Please share the key markers from your recent report and how long you have been experiencing this.',
  ],
  Finance: [
    'Tracking cash flow weekly and separating tax reserves early saves a lot of stress. How do you currently price your services?',
    'We can build a simple 12-month runway and pricing margin sheet tailored to your business.',
    'Bring your last 3 months of revenue and expense numbers—we will spot the biggest margin levers.',
  ],
  Design: [
    'When reviewing portfolios, hiring managers look for problem framing and trade-offs, not just final screens.',
    'Send a link to your Figma or portfolio site and tell me what kind of clients or roles you are targeting.',
    'Strong typography and clear visual hierarchy immediately elevate a brand identity. Excited to review your work!',
  ],
  Legal: [
    'For early startups, getting founder vesting, IP assignment, and clean client MSAs right early prevents costly disputes later.',
    'Happy to explain the key clauses in plain English so you know exactly what liabilities to watch out for.',
    'Share the main terms you are negotiating and whether you are registered as a Pvt Ltd or LLP.',
  ],
}

// GET initial backend state & dummy data
app.get('/api/state', (_req, res) => {
  res.json({
    experts: EXPERTS,
    sessions: store.sessions,
    threads: store.threads,
    saved: store.saved,
    credits: store.credits,
    prefs: store.prefs,
  })
})

// Auth endpoints (supports form login/signup + demo Google login)
app.post('/api/auth', (req, res) => {
  const { name, email, role, provider } = req.body || {}
  const user =
    provider === 'google'
      ? {
          name: 'Aarav Sharma',
          email: 'aarav.sharma@gmail.com',
          role: 'learner',
          headline: 'Product Builder & Lifelong Learner',
        }
      : {
          name: name || (email ? email.split('@')[0] : 'Learner'),
          email: email || 'you@example.com',
          role: role || 'learner',
          headline: '',
        }
  store.user = user
  res.json({
    user,
    state: {
      experts: EXPERTS,
      sessions: store.sessions,
      threads: store.threads,
      saved: store.saved,
      credits: store.credits,
      prefs: store.prefs,
    },
  })
})

// Update user profile or preferences
app.put('/api/profile', (req, res) => {
  const { user, prefs } = req.body || {}
  if (user) store.user = { ...store.user, ...user }
  if (prefs) store.prefs = { ...store.prefs, ...prefs }
  res.json({ user: store.user, prefs: store.prefs })
})

// Toggle saved expert
app.post('/api/saved', (req, res) => {
  const { expertId } = req.body || {}
  if (typeof expertId === 'number') {
    store.saved = store.saved.includes(expertId)
      ? store.saved.filter((id) => id !== expertId)
      : [...store.saved, expertId]
  }
  res.json({ saved: store.saved })
})

// Top up credits
app.post('/api/credits/topup', (req, res) => {
  const { amount } = req.body || {}
  const add = Number(amount) || 0
  if (add > 0) store.credits += add
  res.json({ credits: store.credits })
})

// Book a session
app.post('/api/sessions', (req, res) => {
  const { expertId, at, mins = 60, title } = req.body || {}
  const expert = EXPERTS.find((e) => e.id === Number(expertId))
  if (!expert) return res.status(404).json({ error: 'Expert not found' })
  if (store.credits < expert.rate) {
    return res.status(400).json({ error: 'Not enough credits. Top up in Profile' })
  }
  store.credits -= expert.rate
  const session = {
    id: Date.now(),
    title: title || `Session with ${expert.name}`,
    expertId: expert.id,
    at,
    when: fmtWhen(at),
    mins,
    status: 'upcoming',
  }
  store.sessions = [session, ...store.sessions]
  res.json({ session, credits: store.credits, sessions: store.sessions })
})

// Reschedule or cancel session
app.patch('/api/sessions/:id', (req, res) => {
  const id = Number(req.params.id)
  const { at, status } = req.body || {}
  store.sessions = store.sessions.map((s) => {
    if (s.id !== id) return s
    const updated = { ...s }
    if (at) {
      updated.at = at
      updated.when = fmtWhen(at)
    }
    if (status) updated.status = status
    return updated
  })
  res.json({ sessions: store.sessions })
})

// ============================================================================
// AI SYSTEM 1: Expert Chat Responder (Dummy Data Experts powered by Gemini AI)
// ============================================================================
app.post('/api/threads/reply', async (req, res) => {
  const { threadId, expertId, message, history = [] } = req.body || {}
  const expert = EXPERTS.find((e) => e.id === Number(expertId)) || EXPERTS[0]

  // Update backend thread store with user's message if present
  let thread = store.threads.find((t) => t.id === threadId || t.expertId === expert.id)
  if (!thread) {
    thread = {
      id: threadId || Math.max(0, ...store.threads.map((x) => x.id)) + 1,
      expertId: expert.id,
      unread: 0,
      msgs: [],
    }
    store.threads.push(thread)
  }
  if (message) {
    thread.msgs.push({ me: true, t: message, ts: Date.now() })
  }

  const fallbackPool = EXPERT_FALLBACKS[expert.cat] || REPLIES
  const fallbackReply = fallbackPool[thread.msgs.length % fallbackPool.length]

  const ai = getAiClient()
  if (!ai) {
    const replyMsg = { me: false, t: fallbackReply, ts: Date.now() }
    thread.msgs.push(replyMsg)
    return res.json({ reply: fallbackReply, expertId: expert.id, source: 'fallback' })
  }

  try {
    const recentTranscript = (history.length ? history : thread.msgs)
      .slice(-8)
      .map((m) => `${m.me ? 'Client' : expert.name}: ${m.t}`)
      .join('\n')

    const systemInstruction = [
      `You are ${expert.name}, a verified ${expert.role} (${expert.cat} category) on ConsultHub.`,
      `Your bio: "${expert.bio}". Your consultation rate is ₹${expert.rate}/hour (rating: ${expert.rating}/5).`,
      `Reply directly to the client's message in a warm, sharp, human, conversational messaging style (1 to 3 concise sentences, under 55 words).`,
      `Give genuinely useful domain-specific guidance or ask a focused follow-up question to help them prepare for or get value from a 1-on-1 session with you.`,
      `Do not use markdown bullet lists or robotic disclaimers—write like a real expert texting a client inside the ConsultHub app.`,
    ].join(' ')

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Conversation so far:\n${recentTranscript}\n\nRespond as ${expert.name} to the client's latest message:`,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    })

    const replyText = (response.text || '').trim() || fallbackReply
    thread.msgs.push({ me: false, t: replyText, ts: Date.now() })
    return res.json({ reply: replyText, expertId: expert.id, source: 'ai' })
  } catch (err) {
    console.error('Gemini expert reply error:', err)
    thread.msgs.push({ me: false, t: fallbackReply, ts: Date.now() })
    return res.json({
      reply: fallbackReply,
      expertId: expert.id,
      source: 'fallback',
      warning: err?.message || 'AI temporarily unavailable, used expert fallback response',
    })
  }
})

// ============================================================================
// AI SYSTEM 2: Separate User-to-AI Help & Concierge System
// ============================================================================
app.post('/api/ai-help', async (req, res) => {
  const { message, history = [], userContext = {} } = req.body || {}
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Please enter a question or topic.' })
  }

  const expertsCatalog = EXPERTS.map(
    (e) =>
      `ID ${e.id}: ${e.name} | Role: ${e.role} | Category: ${e.cat} | Rate: ₹${e.rate}/hr | Rating: ${e.rating}★ | Status: ${e.online ? 'Online' : 'Offline'} | Bio: ${e.bio}`
  ).join('\n')

  const buildFallbackHelp = (q) => {
    const lower = String(q).toLowerCase()
    let matched = []
    if (lower.includes('career') || lower.includes('job') || lower.includes('salary') || lower.includes('resume')) matched = [1]
    else if (lower.includes('startup') || lower.includes('pitch') || lower.includes('fund') || lower.includes('business')) matched = [2, 8]
    else if (lower.includes('college') || lower.includes('ivy') || lower.includes('study') || lower.includes('edu')) matched = [3]
    else if (lower.includes('tech') || lower.includes('system') || lower.includes('code') || lower.includes('architecture')) matched = [4]
    else if (lower.includes('health') || lower.includes('doctor') || lower.includes('medical') || lower.includes('report')) matched = [5]
    else if (lower.includes('finance') || lower.includes('budget') || lower.includes('tax') || lower.includes('money')) matched = [6]
    else if (lower.includes('design') || lower.includes('brand') || lower.includes('portfolio') || lower.includes('logo')) matched = [7]
    else if (lower.includes('legal') || lower.includes('contract') || lower.includes('lawyer') || lower.includes('ip')) matched = [8]
    else matched = [1, 2]

    const names = matched.map((id) => EXPERTS.find((e) => e.id === id)?.name).filter(Boolean)
    return {
      reply: `I can help you with that! Based on what you shared, I recommend checking out ${names.join(' and ')}. You can book a 60-minute 1-on-1 session using your consultation credits (currently ₹${store.credits}) or message them directly to share context beforehand.`,
      recommendedExpertIds: matched,
      suggestedFollowUps: [
        'What questions should I ask in my session?',
        'Who is the most affordable expert online now?',
        'How do consultation credits work?',
      ],
    }
  }

  const ai = getAiClient()
  if (!ai) {
    return res.json(buildFallbackHelp(message))
  }

  try {
    const chatContext = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'ConsultHub AI'}: ${m.text}`)
      .join('\n')

    const systemInstruction = [
      `You are the ConsultHub AI Help & Concierge Assistant—a separate built-in AI support and advisor system for ConsultHub users.`,
      `Your job is to:`,
      `1. Help users figure out which verified expert(s) on ConsultHub best match their goals or challenges.`,
      `2. Give actionable prep advice (e.g., 3 sharp questions to ask their expert, how to structure their 60-minute session, or quick initial pointers).`,
      `3. Answer platform questions about booking slots, rescheduling, messaging experts, or topping up Consultation Credits (UPI, Google Pay, Cards).`,
      `4. Keep your "reply" concise, friendly, and practical (2 to 4 short sentences or compact numbered points).`,
      `\nAvailable ConsultHub Experts:\n${expertsCatalog}`,
      `\nCurrent User Context: Credits = ₹${userContext.credits ?? store.credits}, Upcoming sessions = ${userContext.upcomingCount ?? store.sessions.filter((s) => s.status === 'upcoming').length}.`,
    ].join('\n')

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `${chatContext ? `Previous conversation:\n${chatContext}\n\n` : ''}User question: ${message}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: 'Helpful, concise response to the user (2-4 sentences).',
            },
            recommendedExpertIds: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: 'IDs (1-8) of 0 to 2 most relevant experts from the catalog, if applicable.',
            },
            suggestedFollowUps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 or 3 short follow-up prompts the user can tap next (max 6 words each).',
            },
          },
          required: ['reply', 'recommendedExpertIds', 'suggestedFollowUps'],
        },
      },
    })

    const parsed = JSON.parse((response.text || '{}').trim())
    const validIds = Array.isArray(parsed.recommendedExpertIds)
      ? parsed.recommendedExpertIds.filter((id) => EXPERTS.some((e) => e.id === Number(id))).slice(0, 2)
      : []
    const followUps =
      Array.isArray(parsed.suggestedFollowUps) && parsed.suggestedFollowUps.length
        ? parsed.suggestedFollowUps.slice(0, 3)
        : ['Help me prepare session questions', 'Recommend an online expert', 'How do credits work?']

    return res.json({
      reply: parsed.reply || buildFallbackHelp(message).reply,
      recommendedExpertIds: validIds,
      suggestedFollowUps: followUps,
    })
  } catch (err) {
    console.error('Gemini AI Help error:', err)
    return res.json(buildFallbackHelp(message))
  }
})

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production'
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.join(__dirname, 'dist')
    app.use(express.static(distPath))
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  const PORT = Number(process.env.PORT) || 3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ConsultHub server listening on http://0.0.0.0:${PORT}`)
  })
}

startServer()
