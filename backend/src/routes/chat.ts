import { Router } from 'express';
import * as chatController from '../controllers/chatController';
import { authenticateToken } from '../middleware/auth';
import { checkTokenLimit } from '../middleware/tokenLimitMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/conversations', chatController.getConversations);
router.post('/conversations', chatController.createConversationController);
router.get('/conversations/:conversationId', chatController.getConversationHistory);
router.put('/conversations/:conversationId', chatController.updateConversation);
router.delete('/conversations/:conversationId', chatController.deleteConversationController);

// Apply token limit check only to message sending endpoint (the AI-powered one)
router.post('/message', checkTokenLimit, chatController.sendMessage);

export default router;
