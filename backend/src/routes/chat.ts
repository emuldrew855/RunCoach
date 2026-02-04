import { Router } from 'express';
import * as chatController from '../controllers/chatController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/conversations', chatController.getConversations);
router.post('/conversations', chatController.createConversationController);
router.get('/conversations/:conversationId', chatController.getConversationHistory);
router.put('/conversations/:conversationId', chatController.updateConversation);
router.delete('/conversations/:conversationId', chatController.deleteConversationController);
router.post('/message', chatController.sendMessage);

export default router;
