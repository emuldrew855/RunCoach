/**
 * Tool Registry for Agentic Coach System
 *
 * This module exports all available tools that the AI agent can use to interact
 * with the training plan system. Tools are categorized into:
 *
 * - Modification Tools: Require user approval before execution
 *   (shift_workout, modify_workout, create_workout, delete_workout)
 *
 * - Read-Only Tools: Execute immediately without approval
 *   (analyze_performance)
 */

import { shiftWorkoutTool, shiftWorkoutSchema, ShiftWorkoutParams } from './shiftWorkout';
import { modifyWorkoutTool, modifyWorkoutSchema, ModifyWorkoutParams } from './modifyWorkout';
import { createWorkoutTool, createWorkoutSchema, CreateWorkoutParams } from './createWorkout';
import { deleteWorkoutTool, deleteWorkoutSchema, DeleteWorkoutParams } from './deleteWorkout';
import { analyzePerformanceTool, analyzePerformanceSchema, AnalyzePerformanceParams } from './analyzePerformance';

// Export all tool definitions
export const tools = [
  shiftWorkoutTool,
  modifyWorkoutTool,
  createWorkoutTool,
  deleteWorkoutTool,
  analyzePerformanceTool,
];

// Export schemas for validation
export const toolSchemas = {
  shift_workout: shiftWorkoutSchema,
  modify_workout: modifyWorkoutSchema,
  create_workout: createWorkoutSchema,
  delete_workout: deleteWorkoutSchema,
  analyze_performance: analyzePerformanceSchema,
};

// Export types
export type {
  ShiftWorkoutParams,
  ModifyWorkoutParams,
  CreateWorkoutParams,
  DeleteWorkoutParams,
  AnalyzePerformanceParams,
};

// Tool categories for conditional approval logic
export const REQUIRES_APPROVAL = new Set([
  'shift_workout',
  'modify_workout',
  'create_workout',
  'delete_workout',
]);

export const READ_ONLY_TOOLS = new Set([
  'analyze_performance',
]);

/**
 * Check if a tool requires user approval before execution
 */
export function requiresApproval(toolName: string): boolean {
  return REQUIRES_APPROVAL.has(toolName);
}

/**
 * Check if a tool is read-only (can execute immediately)
 */
export function isReadOnly(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}

/**
 * Get tool definition by name
 */
export function getToolByName(toolName: string) {
  return tools.find(tool => tool.name === toolName);
}

/**
 * Validate tool parameters against schema
 */
export function validateToolParams(toolName: string, params: any) {
  const schema = toolSchemas[toolName as keyof typeof toolSchemas];
  if (!schema) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return schema.parse(params);
}
