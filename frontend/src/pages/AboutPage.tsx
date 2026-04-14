/**
 * About Page
 *
 * Information about the platform, how it works, and privacy policy.
 */

import { Link } from 'react-router-dom';
import { Shield, Lock, Database, Trash2, Heart, Zap, Brain, Target } from 'lucide-react';

export default function AboutPage() {
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
            <Link to="/contact" className="text-neutral-400 hover:text-white transition-colors">
              Contact
            </Link>
            <Link to="/" className="btn btn-primary text-sm">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <h1 className="text-4xl font-bold text-white mb-4">
            About RunCoach
          </h1>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
            Your AI-powered running coach that understands your training,
            adapts to your goals, and helps you run smarter.
          </p>
        </section>

        {/* What We Do */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">What We Do</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <FeatureCard
              icon={<Brain className="w-6 h-6" />}
              title="AI-Powered Coaching"
              description="Get personalized insights and recommendations based on your actual training data, not generic advice."
            />
            <FeatureCard
              icon={<Target className="w-6 h-6" />}
              title="Smart Training Plans"
              description="Generate custom training plans that adapt to your fitness level, schedule, and race goals."
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              title="Performance Analysis"
              description="Understand your training patterns, identify areas for improvement, and track progress over time."
            />
            <FeatureCard
              icon={<Heart className="w-6 h-6" />}
              title="Strava Integration"
              description="Seamlessly sync your activities from Strava. We read your data to provide insights - that's it."
            />
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 space-y-4">
            <Step number={1} title="Connect Strava">
              Link your Strava account to import your running activities. We only request read access to your activities and profile.
            </Step>
            <Step number={2} title="Set Your Goals">
              Tell us what you're training for - whether it's a 5K, marathon, or just staying fit.
            </Step>
            <Step number={3} title="Get Insights">
              Our AI analyzes your training patterns and provides personalized coaching advice.
            </Step>
            <Step number={4} title="Train Smarter">
              Follow your custom training plan, chat with your AI coach, and track your progress.
            </Step>
          </div>
        </section>

        {/* Privacy & Data */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Shield className="w-6 h-6 text-orange-500" />
            Privacy & Your Data
          </h2>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 space-y-6">
            <p className="text-neutral-300">
              We take your privacy seriously. Here's exactly how we handle your data:
            </p>

            <DataPolicy
              icon={<Lock className="w-5 h-5" />}
              title="What We Access"
              items={[
                "Your Strava profile (name, profile picture)",
                "Your running activities (distance, pace, heart rate, etc.)",
                "We do NOT access your location data or GPS tracks",
                "We do NOT post to Strava or modify your data",
              ]}
            />

            <DataPolicy
              icon={<Database className="w-5 h-5" />}
              title="How We Store Data"
              items={[
                "Your data is stored securely in encrypted databases",
                "We use your activity data to provide coaching insights",
                "Chat conversations are stored to maintain context",
                "We do NOT sell or share your data with third parties",
              ]}
            />

            <DataPolicy
              icon={<Trash2 className="w-5 h-5" />}
              title="Data Deletion"
              items={[
                "You can disconnect Strava at any time from your profile",
                "Contact us to request complete deletion of your account",
                "We will remove all your data within 30 days of request",
              ]}
            />
          </div>
        </section>

        {/* AI & OpenAI */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">AI Technology</h2>
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
            <p className="text-neutral-300 mb-4">
              RunCoach uses OpenAI's language models to power the coaching conversations and insights.
              Here's what you should know:
            </p>
            <ul className="space-y-2 text-neutral-400">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Your training data is sent to OpenAI to generate personalized responses</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>OpenAI does not use your data to train their models (per their API terms)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>AI responses are suggestions, not medical advice - always listen to your body</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="text-center">
          <div className="bg-gradient-to-r from-orange-500/10 to-orange-600/10 rounded-xl border border-orange-500/20 p-8">
            <h2 className="text-2xl font-bold text-white mb-3">
              Questions or Feedback?
            </h2>
            <p className="text-neutral-400 mb-6">
              We'd love to hear from you. Whether it's a bug report, feature request, or just saying hello.
            </p>
            <Link to="/contact" className="btn btn-primary">
              Get in Touch
            </Link>
          </div>
        </section>
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

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-5">
      <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 mb-3">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-neutral-400 text-sm">{description}</p>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
        {number}
      </div>
      <div>
        <h3 className="text-white font-semibold mb-1">{title}</h3>
        <p className="text-neutral-400 text-sm">{children}</p>
      </div>
    </div>
  );
}

function DataPolicy({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <span className="text-orange-500">{icon}</span>
        {title}
      </h3>
      <ul className="space-y-2 pl-7">
        {items.map((item, index) => (
          <li key={index} className="text-neutral-400 text-sm flex items-start gap-2">
            <span className="text-neutral-600 mt-1">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
