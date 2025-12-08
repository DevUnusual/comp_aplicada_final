import { Router } from 'express';
import * as summaryController from '../controllers/summaryController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// API status (check if LangChain/OpenAI is configured)
router.get('/status', summaryController.getApiStatus);

// Summary generation
router.post('/single', summaryController.createSingleSummary);
router.post('/multiple', summaryController.createMultipleSummary);

// CRUD routes
router.get('/', summaryController.getSummaries);
router.get('/:id', summaryController.getSummary);
router.delete('/:id', summaryController.deleteSummary);

export default router;
