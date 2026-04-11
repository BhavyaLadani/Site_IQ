import React, { useState } from 'react';
import { Send, CheckCircle, Mail, User, MessageSquare } from 'lucide-react';

const ContactPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch('http://localhost:8000/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });
      if (r.ok) { setSent(true); setName(''); setEmail(''); setMessage(''); }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Contact Us</h1>
          <p className="text-sm text-slate-400">Have questions? We'd love to hear from you.</p>
        </div>

        {sent ? (
          <div className="bg-slate-900 border border-green-800/50 rounded-2xl p-8 text-center">
            <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">Message Sent!</h2>
            <p className="text-sm text-slate-400">We'll get back to you within 24 hours.</p>
            <button onClick={() => setSent(false)} className="mt-4 text-sm text-blue-400 hover:underline">Send another message</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Your name" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Message</label>
              <div className="relative">
                <MessageSquare size={16} className="absolute left-3 top-3 text-slate-500" />
                <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={4}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  placeholder="How can we help?" />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all text-sm shadow-lg shadow-blue-500/20">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ContactPage;
