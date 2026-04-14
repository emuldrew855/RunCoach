/**
 * Feedback Routes
 *
 * Public endpoint for submitting feedback (works for both authenticated and anonymous users).
 */

import express from 'express';
import { createFeedback } from '../models/Feedback';
import { successResponse } from '../utils/apiResponse';

const router = express.Router();

/**
 * POST /api/v1/feedback
 * Submit feedback (public - no auth required)
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, category, subject, message } = req.body;

    if (!message || message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 10 characters',
      });
    }

    // Get user ID from token if authenticated (optional)
    let userId: number | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET) as { id: number };
        userId = decoded.id;
      } catch {
        // Token invalid or expired - continue as anonymous
      }
    }

    const feedback = await createFeedback({
      user_id: userId,
      name: name?.trim(),
      email: email?.trim(),
      category: category || 'general',
      subject: subject?.trim(),
      message: message.trim(),
      page_url: req.get('referer'),
      user_agent: req.get('user-agent'),
    });

    res.status(201).json(successResponse({
      message: 'Thank you for your feedback!',
      id: feedback.id,
    }));
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback. Please try again.',
    });
  }
});

export default router;
