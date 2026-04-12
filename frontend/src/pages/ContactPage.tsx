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
    <div className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Contact Us</h1>
          <p className="text-sm text-slate-500">Have questions? We'd love to hear from you.</p>
        </div>

        {sent ? (
          <div className="bg-white border border-emerald-200 rounded-2xl p-8 text-center shadow-sm">
            <CheckCircle size={40} className="text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-slate-800 mb-2">Message Sent!</h2>
            <p className="text-sm text-slate-500">We'll get back to you within 24 hours.</p>
            <button onClick={() => setSent(false)} className="mt-4 text-sm text-indigo-600 hover:underline font-medium">Send another message</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                  placeholder="Your name" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                  placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Message</label>
              <div className="relative">
                <MessageSquare size={16} className="absolute left-3 top-3 text-slate-400" />
                <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={4}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all resize-none"
                  placeholder="How can we help?" />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all text-sm shadow-md shadow-indigo-200">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
              {loading ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ContactPage;
