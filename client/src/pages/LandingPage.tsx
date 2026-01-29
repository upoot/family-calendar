import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function LandingPage() {
  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <span className="landing-logo-icon">🧊</span>
            Fridge
          </div>
          <div className="landing-nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <Link to="/login" className="landing-btn-nav">Sign in</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-badge">✨ Built for families</div>
        <h1>Family calendar<br />that actually works</h1>
        <p className="landing-hero-desc">
          One place for your whole family's schedule. See who's where and when — no more digging through WhatsApp messages.
        </p>
        <div className="landing-hero-cta">
          <Link to="/register" className="landing-btn-primary">Get started</Link>
          <a href="#how" className="landing-btn-secondary">How it works ↓</a>
        </div>

        {/* Mock calendar */}
        <div className="landing-screen">
          <div className="landing-cal-header">
            <span className="landing-cal-month">February 2026</span>
            <div className="landing-avatars">
              <div className="landing-avatar" style={{ background: '#FF6B8A' }}>A</div>
              <div className="landing-avatar" style={{ background: '#5AC8FA' }}>T</div>
              <div className="landing-avatar" style={{ background: '#34C759' }}>E</div>
              <div className="landing-avatar" style={{ background: '#FF9F0A' }}>V</div>
            </div>
          </div>
          <div className="landing-cal-grid">
            {[
              { day: 'Mon 3', events: [{ label: 'Football 17:00', cls: 'kid' }, { label: 'Meeting 14:00', cls: 'mom' }] },
              { day: 'Tue 4', events: [{ label: 'Dentist 10:00', cls: 'dad' }, { label: 'Family night 🍕', cls: 'family' }] },
              { day: 'Wed 5', events: [{ label: 'Piano 16:30', cls: 'kid' }] },
              { day: 'Thu 6', events: [{ label: 'Yoga 7:00', cls: 'mom' }, { label: 'Football 17:00', cls: 'kid' }] },
              { day: 'Fri 7', events: [{ label: 'Cabin weekend 🏕️', cls: 'family' }] },
            ].map(row => (
              <div key={row.day} className="landing-cal-day">
                <span className="landing-cal-date">{row.day}</span>
                <div className="landing-cal-events">
                  {row.events.map(e => (
                    <span key={e.label} className={`landing-cal-event landing-event-${e.cls}`}>{e.label}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Demo + Todo + Shopping showcase */}
      <section id="showcase" className="landing-section">
        <div className="landing-showcase-grid">
          {/* AI Scheduling */}
          <div className="landing-showcase-card landing-showcase-wide">
            <span className="landing-label">Smart scheduling</span>
            <h2>Ask, don't dig through calendars</h2>
            <p className="landing-desc">Type what you need — the app checks everyone's calendar and suggests the best time.</p>
            <div className="landing-ai-demo">
              <div className="landing-ai-bubble landing-ai-user">When can the family visit the dentist next week?</div>
              <div className="landing-ai-bubble landing-ai-assistant">
                <div className="landing-ai-thinking">Checked all calendars for week 7…</div>
                <strong>3 available slots:</strong>
                <div className="landing-ai-slot landing-ai-slot-best">✦ Tue 11.2. at 14:00 <span className="landing-ai-tag">Best — everyone free</span></div>
                <div className="landing-ai-slot">Wed 12.2. at 10:00 <span className="landing-ai-tag">Topias has a meeting</span></div>
                <div className="landing-ai-slot">Fri 14.2. at 9:00 <span className="landing-ai-tag">Ella 30 min late to school</span></div>
              </div>
              <div className="landing-ai-bubble landing-ai-user">Book Tuesday ✓</div>
              <div className="landing-ai-bubble landing-ai-assistant">Booked! Reminder sent to everyone on Monday evening. 🦷</div>
            </div>
          </div>

          {/* Weekly Todo */}
          <div className="landing-showcase-card">
            <span className="landing-label">Weekly tasks</span>
            <h3>Family todo list</h3>
            <div className="landing-todo-list">
              {[
                { title: 'Fold laundry', done: true, avatar: 'T', color: '#5AC8FA' },
                { title: "Ella's swim trunks", done: false, avatar: 'A', color: '#FF6B8A' },
                { title: 'Car inspection', done: false, avatar: 'T', color: '#5AC8FA' },
                { title: 'Message to teacher', done: true, avatar: 'A', color: '#FF6B8A' },
                { title: 'Cabin: water off', done: false, avatar: 'V', color: '#FF9F0A' },
              ].map(t => (
                <div key={t.title} className={`landing-todo-item ${t.done ? 'landing-todo-done' : ''}`}>
                  <span className={`landing-todo-check ${t.done ? 'landing-todo-checked' : ''}`}>{t.done ? '✓' : ''}</span>
                  <span className="landing-todo-title">{t.title}</span>
                  <div className="landing-todo-avatar" style={{ background: t.color }}>{t.avatar}</div>
                </div>
              ))}
            </div>
            <div className="landing-todo-progress">
              <div className="landing-todo-bar"><div className="landing-todo-fill" style={{ width: '40%' }} /></div>
              <span>2 / 5 done</span>
            </div>
          </div>

          {/* Shopping */}
          <div className="landing-showcase-card">
            <span className="landing-label">Shopping list</span>
            <h3>Shared grocery list</h3>
            <div className="landing-shop-list">
              {[
                { cat: '🥛 Dairy', items: ['Milk 2x', 'Yogurt (strawberry)', { name: 'Butter', checked: true }] },
                { cat: '🍎 Fruits', items: ['Bananas', 'Apples'] },
                { cat: '🧻 Other', items: ['Toilet paper', 'Dish tablets'] },
              ].map(group => (
                <div key={group.cat} className="landing-shop-category">
                  <span className="landing-shop-cat-label">{group.cat}</span>
                  {group.items.map(item => {
                    const name = typeof item === 'string' ? item : item.name;
                    const checked = typeof item === 'object' && item.checked;
                    return <div key={name} className={`landing-shop-item ${checked ? 'landing-shop-checked' : ''}`}>{name}</div>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="landing-section">
        <span className="landing-label">How it works</span>
        <h2>Three steps, whole family on the same page</h2>
        <p className="landing-desc">No complicated setup. No accounts required for everyone. Works immediately.</p>
        <div className="landing-steps">
          {[
            { n: '1', title: 'Create your family calendar', desc: 'Add family members — each gets their own color. Kids don\'t need their own account.' },
            { n: '2', title: 'Add events naturally', desc: 'Type "Ella football Tuesday 5pm" and it understands. Recurring activities, appointments — all in one place.' },
            { n: '3', title: 'Everyone sees the same picture', desc: 'Every family member sees the whole week at a glance. Changes sync instantly.' },
          ].map(step => (
            <div key={step.n} className="landing-step">
              <div className="landing-step-number">{step.n}</div>
              <div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing-section">
        <span className="landing-label">Features</span>
        <h2>Designed for family life</h2>
        <div className="landing-features-grid">
          {[
            { icon: '👨‍👩‍👧‍👦', title: 'Color-coded members', desc: 'See at a glance whose event it is.' },
            { icon: '🗣️', title: 'Natural input', desc: 'Type like a message: "Ella dance class Wednesday 4:30".' },
            { icon: '🔁', title: 'Recurring events', desc: 'Set once, shows up every week automatically.' },
            { icon: '🔔', title: 'Smart reminders', desc: 'Right reminder to the right person at the right time.' },
            { icon: '📱', title: 'Works everywhere', desc: 'iOS, Android, web. Same calendar, always up to date.' },
            { icon: '🔒', title: 'Family privacy', desc: 'Your data is yours. No ads, no profiling, no third-party sales.' },
          ].map(f => (
            <div key={f.title} className="landing-feature-card">
              <div className="landing-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>Fridge · Coming soon</p>
      </footer>
    </div>
  );
}
