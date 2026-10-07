import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { EXPERTS, chatTime } from '../data.js'

const INITIAL_SUGGESTIONS = [
  'Which expert fits my startup pitch?',
  'Help me prepare session questions',
  'Who can review my career transition?',
  'How do consultation credits work?',
]

export default function AiHelpSheet({ credits, upcomingCount, onClose, onBookExpert, onMessageExpert }) {
  const [msgs, setMsgs] = useState([
    {
      role: 'ai',
      text: 'Hi! I am your ConsultHub AI Help assistant. Ask me which verified expert to book, how to prepare for a session, or anything about your account.',
      ts: Date.now(),
      recommendedExpertIds: [],
    },
  ])
  const [suggestions, setSuggestions] = useState(INITIAL_SUGGESTIONS)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs.length, busy])

  const ask = async (rawText) => {
    const text = String(rawText ?? input).trim()
    if (!text || busy) return
    setInput('')
    const userMsg = { role: 'user', text, ts: Date.now() }
    const nextHistory = [...msgs, userMsg]
    setMsgs(nextHistory)
    setBusy(true)

    try {
      const res = await fetch('/api/ai-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          userContext: { credits, upcomingCount },
        }),
      })
      const data = await res.json()
      setMsgs((prev) => [
        ...prev,
        {
          role: 'ai',
          text: data.reply || 'I can help you find the right expert or prepare for your session.',
          ts: Date.now(),
          recommendedExpertIds: data.recommendedExpertIds || [],
        },
      ])
      if (Array.isArray(data.suggestedFollowUps) && data.suggestedFollowUps.length) {
        setSuggestions(data.suggestedFollowUps)
      }
    } catch {
      setMsgs((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'You can browse our verified experts by category on Home, book a 60-minute slot with your credits, or message an expert directly.',
          ts: Date.now(),
          recommendedExpertIds: [1, 2],
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="AI Help & Concierge"
      onClose={onClose}
      action={
        <button
          className="link"
          onClick={() => {
            setMsgs([msgs[0]])
            setSuggestions(INITIAL_SUGGESTIONS)
          }}
        >
          Clear
        </button>
      }
    >
      <p className="muted sm" style={{ margin: '0 0 10px' }}>
        Instant AI guidance to match you with the right expert & prep for your call.
      </p>

      <div
        className="chat-body"
        style={{
          maxHeight: '46dvh',
          background: 'var(--bg)',
          border: '2px solid var(--soft)',
          borderRadius: 16,
          padding: 12,
        }}
      >
        {msgs.map((m, i) => {
          const isMe = m.role === 'user'
          const recs = (m.recommendedExpertIds || [])
            .map((id) => EXPERTS.find((e) => e.id === Number(id)))
            .filter(Boolean)
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className={'bub' + (isMe ? ' me' : '')} style={{ maxWidth: '90%' }}>
                {m.text}
                <span className="bt">{chatTime(m.ts)}</span>
              </div>
              {recs.length > 0 && (
                <div className="list" style={{ marginTop: 2, marginBottom: 4 }}>
                  {recs.map((ex) => (
                    <div key={ex.id} className="row-item" style={{ padding: '10px 12px' }}>
                      <Avatar expert={ex} size={40} />
                      <div className="grow">
                        <b className="sm">{ex.name}</b>
                        <div className="muted sm clip">
                          {ex.role} · ₹{ex.rate}/hr
                        </div>
                      </div>
                      <div className="ex-act" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="icon-btn sm"
                          aria-label={'Message ' + ex.name}
                          onClick={() => onMessageExpert(ex)}
                        >
                          <Icon n="chat" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          style={{ padding: '7px 12px' }}
                          onClick={() => onBookExpert(ex)}
                        >
                          Book
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {busy && (
          <div className="bub typ" aria-label="AI thinking">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chips" style={{ marginTop: 10, marginBottom: 10 }}>
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip sm" disabled={busy} onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="chat-in"
        style={{ padding: '8px 0 0', borderTop: '2px dashed var(--soft)', background: 'transparent' }}
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
      >
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask()
            }
          }}
          placeholder="Ask AI for help or expert picks..."
          aria-label="Ask AI Help"
        />
        <button className="send" type="submit" disabled={!input.trim() || busy} aria-label="Send to AI Help">
          <Icon n="send" size={18} />
        </button>
      </form>
    </Sheet>
  )
}
