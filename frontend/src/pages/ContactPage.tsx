/**
 * Contact / Feedback Page
 *
 * Allows users (authenticated or anonymous) to submit feedback.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, CheckCircle, AlertCircle, MessageSquare, Bug, Lightbulb, HelpCircle } from 'lucide-react';
import { feedbackAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

type FeedbackCategory = 'general' | 'bug' | 'feature' | 'question' | 'other';

const CATEGORIES: { value: FeedbackCategory; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'general', label: 'General', icon: <MessageSquare className="w-5 h-5" />, description: 'General feedback or comments' },
  { value: 'bug', label: 'Bug Report', icon: <Bug className="w-5 h-5" />, description: 'Something isn\'t working right' },
  { value: 'feature', label: 'Feature Request', icon: <Lightbulb className="w-5 h-5" />, description: 'Suggest a new feature' },
  { value: 'question', label: 'Question', icon: <HelpCircle className="w-5 h-5" />, description: 'Ask us something' },
];

export default function ContactPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (message.trim().length < 10) {
      setError('Please provide more detail in your message (at least 10 characters).');
      return;
    }

    try {
      setSubmitting(true);
      await feedbackAPI.submitFeedback({
        name: user ? undefined : name.trim() || undefined,
        email: user ? undefined : email.trim() || undefined,
        category,
        subject: subject.trim() || undefined,
        message: message.trim(),
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error('Failed to submit feedback:', err);
      setError(err.response?.data?.error || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">RC</span>
            </div>
            <span className="text-lg font-semibold text-white">RunCoach</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/about" className="text-neutral-400 hover:text-white transition-colors">
              About
            </Link>
            <Link to="/" className="btn btn-primary text-sm">
              {user ? 'Dashboard' : 'Get Started'}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Success State */}
        {submitted ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Thank You!</h1>
            <p className="text-neutral-400 mb-8">
              We've received your feedback and will review it shortly.
              {!user && email && " We'll get back to you if needed."}
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  setSubmitted(false);
                  setMessage('');
                  setSubject('');
                }}
                className="btn btn-secondary"
              >
                Submit Another
              </button>
              <Link to="/" className="btn btn-primary">
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-white mb-3">Contact Us</h1>
              <p className="text-neutral-400">
                Have feedback, found a bug, or want to suggest a feature?
                We'd love to hear from you.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Category Selection */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-3">
                  What's this about?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`
                        p-4 rounded-lg border text-left transition-all
                        ${category === cat.value
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
                        }
                      `}
                    >
                      <div className={`mb-2 ${category === cat.value ? 'text-orange-500' : 'text-neutral-400'}`}>
                        {cat.icon}
                      </div>
                      <div className={`font-medium ${category === cat.value ? 'text-white' : 'text-neutral-300'}`}>
                        {cat.label}
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {cat.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Name & Email (only for non-logged-in users) */}
              {!user && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-neutral-300 mb-2">
                      Name <span className="text-neutral-500">(optional)</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-2">
                      Email <span className="text-neutral-500">(for reply)</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Subject */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-neutral-300 mb-2">
                  Subject <span className="text-neutral-500">(optional)</span>
                </label>
                <input
                  type="text"
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary"
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-neutral-300 mb-2">
                  Message <span className="text-orange-500">*</span>
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us more..."
                  rows={6}
                  required
                  minLength={10}
                  className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors resize-none"
                />
                <p className="text-xs text-neutral-500 mt-2">
                  {message.length} / 10 minimum characters
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || message.trim().length < 10}
                className="w-full btn btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Send Feedback
                  </>
                )}
              </button>

              {user && (
                <p className="text-center text-neutral-500 text-sm">
                  Submitting as <span className="text-neutral-300">{user.first_name} {user.last_name}</span>
                </p>
              )}
            </form>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 mt-16">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-neutral-500 text-sm">
              © {new Date().getFullYear()} RunCoach. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link to="/about" className="text-neutral-400 hover:text-white text-sm transition-colors">
                About
              </Link>
              <Link to="/contact" className="text-neutral-400 hover:text-white text-sm transition-colors">
                Contact
              </Link>
              <Link to="/" className="text-neutral-400 hover:text-white text-sm transition-colors">
                Home
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
