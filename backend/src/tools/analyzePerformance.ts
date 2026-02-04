import { z } from 'zod';

/**
 * Tool: analyze_performance
 * Purpose: Deep analysis of recent training data without requiring approval
 * Execution: Executes immediately, no approval needed (read-only operation)
 */

export const analyzePerformanceSchema = z.object({
  activity_ids: z.array(z.number()).optional().describe('Specific activity IDs to analyze (optional)'),
  date_range_days: z.number().optional().describe('Number of days back to analyze (e.g., 7 for last week, 30 for last month)'),
  focus_area: z.enum(['pacing', 'hr_zones', 'progression', 'recovery', 'overall']).describe('Specific area to focus the analysis on'),
});

export type AnalyzePerformanceParams = z.infer<typeof analyzePerformanceSchema>;

export const analyzePerformanceTool = {
  name: 'analyze_performance',
  description: 'Perform deep analysis of the athlete\'s recent training data. This is a read-only operation that provides insights into pacing consistency, heart rate zone distribution, training progression, and recovery patterns. This tool executes immediately without requiring user approval since it only reads data.',
  parameters: analyzePerformanceSchema,
};
