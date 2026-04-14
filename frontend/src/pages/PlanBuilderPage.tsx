import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/common/Layout';
import SmartPlanWizard from '../components/training/SmartPlanWizard';

export const PlanBuilderPage: React.FC = () => {
  const navigate = useNavigate();

  const handleComplete = () => {
    navigate('/training');
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
          <SmartPlanWizard
            onComplete={handleComplete}
            onBack={handleBack}
          />
        </div>
      </div>
    </Layout>
  );
};
