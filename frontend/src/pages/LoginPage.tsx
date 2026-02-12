import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Activity, Brain, Calendar, TrendingUp, Zap, Shield } from 'lucide-react';

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    authAPI.initiateStravaLogin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <Activity className="w-12 h-12 text-orange-600 dark:text-orange-400" />
            <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-100 ml-3">
              RunCoach
            </h1>
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Your AI-Powered Running Partner
          </h2>

          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Transform your Strava data into personalized training insights with an intelligent AI coach
            that learns from your runs and helps you reach your goals faster.
          </p>

          {/* CTA Button */}
          <div className="mb-8">
            <button
              onClick={handleLogin}
              className="btn btn-primary text-lg px-8 py-4 flex items-center justify-center gap-3 mx-auto transform hover:scale-105 transition-transform duration-200 shadow-lg"
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Connect with Strava to Get Started
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              Securely connect your Strava account • Free to use • No credit card required
            </p>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
          <FeatureCard
            icon={<Brain className="w-8 h-8 text-orange-600 dark:text-orange-400" />}
            title="AI-Powered Analysis"
            description="Chat with an intelligent coach that analyzes your training patterns, identifies areas for improvement, and provides actionable insights."
          />

          <FeatureCard
            icon={<Calendar className="w-8 h-8 text-blue-600 dark:text-blue-400" />}
            title="Smart Training Plans"
            description="Upload or create training plans that adapt to your progress. The AI suggests workout modifications based on your recent performance."
          />

          <FeatureCard
            icon={<TrendingUp className="w-8 h-8 text-green-600 dark:text-green-400" />}
            title="Performance Tracking"
            description="Monitor your progress with detailed analytics including HR zones, pace trends, mileage tracking, and race readiness indicators."
          />

          <FeatureCard
            icon={<Zap className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />}
            title="Proactive Coaching"
            description="Receive weekly analysis every Monday morning with personalized recommendations. The AI spots fatigue, suggests recovery, and optimizes your schedule."
          />

          <FeatureCard
            icon={<Activity className="w-8 h-8 text-purple-600 dark:text-purple-400" />}
            title="Strava Integration"
            description="Seamlessly sync all your activities, including detailed streams for heart rate, pace, cadence, and elevation data."
          />

          <FeatureCard
            icon={<Shield className="w-8 h-8 text-red-600 dark:text-red-400" />}
            title="Your Approval Required"
            description="The AI suggests changes but never modifies your plan without permission. You stay in full control of your training decisions."
          />
        </div>

        {/* How It Works Section */}
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-8">
            How It Works
          </h3>

          <div className="space-y-4">
            <Step
              number={1}
              title="Connect Your Strava Account"
              description="Securely authorize RunCoach to access your running data. We only read your activities - we never post or modify anything on Strava."
            />

            <Step
              number={2}
              title="Upload Your Training Plan"
              description="Import an existing plan or create a new one. Our AI learns your goals, target race dates, and weekly structure."
            />

            <Step
              number={3}
              title="Chat with Your AI Coach"
              description="Ask questions, discuss your training, share how you're feeling. The AI analyzes your data and provides personalized guidance."
            />

            <Step
              number={4}
              title="Get Proactive Insights"
              description="Every Monday at 6 AM, receive a weekly analysis with suggestions. Approve recommended changes or continue with your current plan."
            />
          </div>
        </div>

      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="card hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">{icon}</div>
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="card hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-600 dark:bg-orange-500 text-white flex items-center justify-center font-bold text-lg">
          {number}
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
